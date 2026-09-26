const db = wx.cloud.database()
const messageConfig = require('../config/message')

// 与云端保持一致：云端云函数运行在 UTC，所有「今天/现在」都显式按北京时间推导（+8）。
// 端上若直接拿设备本地时间，当设备时区不是 UTC+8 时，端上「今日任务」会与云端的
// 到点提醒 / 漏服判定差一天。返回的 Date 用本地 getter 读出的就是北京时间。
function chinaNow(instant) {
  var base = instant ? new Date(instant) : new Date()
  return new Date(base.getTime() + 8 * 60 * 60 * 1000 + base.getTimezoneOffset() * 60 * 1000)
}

var STATUS_TEXT_MAP = {
  pending: '\u5f85\u670d\u836f',
  taken: '\u5df2\u670d\u836f',
  missed: '\u5df2\u6f0f\u670d',
  supplement: '\u5df2\u8865\u670d'
}

var WEEKDAY_LABELS = [
  '\u5468\u4e00',
  '\u5468\u4e8c',
  '\u5468\u4e09',
  '\u5468\u56db',
  '\u5468\u4e94',
  '\u5468\u516d',
  '\u5468\u65e5'
]

var TEXTS = {
  cycleWeek: '\u6309\u5468',
  cycleMonth: '\u6309\u6708',
  everyWeek: '\u6bcf\u5468 ',
  everyMonth: '\u6bcf\u6708 ',
  everyDay: '\u6bcf\u5929',
  separator: '\u3001',
  daySuffix: ' \u65e5'
}

function parseDateInput(dateInput) {
  if (dateInput instanceof Date) {
    return new Date(dateInput.getTime())
  }

  if (typeof dateInput === 'string') {
    var parts = dateInput.split('-')
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    }
  }

  return new Date()
}

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function formatDate(dateInput) {
  var date = parseDateInput(dateInput)
  return [
    date.getFullYear(),
    padNumber(date.getMonth() + 1),
    padNumber(date.getDate())
  ].join('-')
}

function timeToMinutes(timeStr) {
  var value = timeStr || '00:00'
  var parts = value.split(':')
  return parseInt(parts[0] || 0) * 60 + parseInt(parts[1] || 0)
}

function getWeekdayNumber(dateInput) {
  var day = parseDateInput(dateInput).getDay()
  return day === 0 ? 7 : day
}

function normalizeNumberArray(values) {
  if (!Array.isArray(values)) {
    return []
  }

  var result = []
  for (var i = 0; i < values.length; i++) {
    var value = parseInt(values[i], 10)
    if (!isNaN(value) && result.indexOf(value) === -1) {
      result.push(value)
    }
  }

  result.sort(function(a, b) {
    return a - b
  })

  return result
}

function normalizeCycleType(plan) {
  var cycleType = plan && plan.cycle_type
  if (cycleType === 'week' || cycleType === 'month') {
    return cycleType
  }
  return 'day'
}

function normalizeCycleDetail(cycleType, cycleDetail) {
  var detail = normalizeNumberArray(cycleDetail)

  if (cycleType === 'week') {
    var weekdays = []
    for (var i = 0; i < detail.length; i++) {
      if (detail[i] >= 1 && detail[i] <= 7) {
        weekdays.push(detail[i])
      }
    }
    return weekdays
  }

  if (cycleType === 'month') {
    var monthDays = []
    for (var j = 0; j < detail.length; j++) {
      if (detail[j] >= 1 && detail[j] <= 31) {
        monthDays.push(detail[j])
      }
    }
    return monthDays
  }

  return []
}

function getPlanTimeSlots(plan) {
  var slots = Array.isArray(plan && plan.timeSlots) && plan.timeSlots.length
    ? plan.timeSlots.slice()
    : ['08:00']

  slots.sort(function(a, b) {
    return a.localeCompare(b)
  })

  return slots
}

function getPlanTaskCount(plan) {
  return getPlanTimeSlots(plan).length
}

function isPlanScheduledForDate(plan, dateInput) {
  var cycleType = normalizeCycleType(plan)
  var cycleDetail = normalizeCycleDetail(cycleType, plan && plan.cycle_detail)
  var date = parseDateInput(dateInput)

  if (cycleType === 'week') {
    if (!cycleDetail.length) {
      return false
    }
    return cycleDetail.indexOf(getWeekdayNumber(date)) !== -1
  }

  if (cycleType === 'month') {
    if (!cycleDetail.length) {
      return false
    }
    return cycleDetail.indexOf(date.getDate()) !== -1
  }

  return true
}

function formatCycleText(plan) {
  var cycleType = normalizeCycleType(plan)
  var cycleDetail = normalizeCycleDetail(cycleType, plan && plan.cycle_detail)

  if (cycleType === 'week') {
    if (!cycleDetail.length) {
      return TEXTS.cycleWeek
    }

    var labels = []
    for (var i = 0; i < cycleDetail.length; i++) {
      labels.push(WEEKDAY_LABELS[cycleDetail[i] - 1])
    }
    return TEXTS.everyWeek + labels.join(TEXTS.separator)
  }

  if (cycleType === 'month') {
    if (!cycleDetail.length) {
      return TEXTS.cycleMonth
    }
    return TEXTS.everyMonth + cycleDetail.join(TEXTS.separator) + TEXTS.daySuffix
  }

  return TEXTS.everyDay
}

function getRecordPlanId(record) {
  return record.plan_id || record.planId || ''
}

function getRecordTimeSlot(record) {
  if (record.time_slot !== undefined) {
    return record.time_slot
  }
  return record.timeSlot
}

function findMatchingRecord(records, planId, timeSlot) {
  for (var i = 0; i < records.length; i++) {
    if (getRecordPlanId(records[i]) === planId && getRecordTimeSlot(records[i]) === timeSlot) {
      return records[i]
    }
  }

  return null
}

function buildTaskItem(plan, record, options) {
  var dateStr = options.dateStr
  var todayStr = options.todayStr
  var nowMinutes = options.nowMinutes
  var scheduledTime = options.scheduledTime
  var scheduledMinutes = timeToMinutes(scheduledTime)
  var status = 'pending'
  var takenTime = ''
  var supplementTime = ''

  if (record) {
    status = record.status || 'pending'
    takenTime = record.taken_time || ''
    supplementTime = record.supplement_time || ''
  } else if (dateStr < todayStr || (dateStr === todayStr && nowMinutes >= scheduledMinutes + messageConfig.MISSED_GRACE_MINUTES)) {
    status = 'missed'
  }

  return {
    id: plan._id + '_' + options.timeSlot,
    plan_id: plan._id,
    planId: plan._id,
    patientOpenid: plan.patientOpenid || plan._openid || '',
    time_slot: options.timeSlot,
    timeSlot: options.timeSlot,
    med_name: plan.med_name || plan.medicineName || '',
    medicineName: plan.med_name || plan.medicineName || '',
    dosage: plan.dosage || '',
    scheduled_time: scheduledTime,
    scheduledTime: scheduledTime,
    date: dateStr,
    cycle_type: normalizeCycleType(plan),
    cycle_detail: normalizeCycleDetail(normalizeCycleType(plan), plan.cycle_detail),
    cycleText: formatCycleText(plan),
    status: status,
    statusText: STATUS_TEXT_MAP[status] || STATUS_TEXT_MAP.pending,
    taken_time: takenTime,
    supplement_time: supplementTime,
    notes: plan.notes || ''
  }
}

function buildDailyTasks(plans, records, currentDateInput) {
  var currentDate = parseDateInput(currentDateInput)
  var dateStr = formatDate(currentDate)
  var todayStr = formatDate(chinaNow())
  var nowMinutes = currentDate.getHours() * 60 + currentDate.getMinutes()
  var tasks = []

  for (var i = 0; i < plans.length; i++) {
    var plan = plans[i]
    if (!plan || plan.status !== 1) {
      continue
    }

    if (!isPlanScheduledForDate(plan, currentDate)) {
      continue
    }

    var timeSlots = getPlanTimeSlots(plan)
    for (var j = 0; j < timeSlots.length; j++) {
      tasks.push(buildTaskItem(plan, findMatchingRecord(records, plan._id, j), {
        dateStr: dateStr,
        todayStr: todayStr,
        nowMinutes: nowMinutes,
        scheduledTime: timeSlots[j],
        timeSlot: j
      }))
    }
  }

  tasks.sort(function(a, b) {
    if (a.scheduled_time === b.scheduled_time) {
      return a.med_name.localeCompare(b.med_name)
    }
    return a.scheduled_time.localeCompare(b.scheduled_time)
  })

  return tasks
}

// 小程序端单次查询最多返回 20 条（平台默认），需要更多时必须分页
var CLIENT_PAGE_SIZE = 20

function fetchPlansByPatient(patientOpenid) {
  return fetchAllForPatient('medication_plans', patientOpenid, {
    where: { status: 1 },
    orderBy: [['_id', 'asc']]
  })
}

// 小程序端单次查询最多 20 条（平台默认），需要更多时必须分页。
// 统一在这里做：一是避免每个页面各写一份分页循环（本项目已有“同一逻辑多份副本”的毛病），
// 二是分页必须配稳定 orderBy，否则翻页会漏/重。
function fetchAllForPatient(collectionName, patientOpenid, options) {
  var opts = options || {}
  var maxPages = opts.maxPages || 25
  var orderBy = opts.orderBy || [['create_time', 'desc'], ['_id', 'asc']]
  var all = []

  if (!patientOpenid) {
    // 没有归属就什么都不查：缺 patientOpenid 时查询会退化成“全库”
    return Promise.resolve([])
  }

  var where = Object.assign({ patientOpenid: patientOpenid }, opts.where || {})

  function nextPage() {
    if (all.length >= CLIENT_PAGE_SIZE * maxPages) {
      return Promise.resolve(all)
    }
    var query = db.collection(collectionName).where(where)
    for (var i = 0; i < orderBy.length; i++) {
      query = query.orderBy(orderBy[i][0], orderBy[i][1])
    }
    return query
      .skip(all.length)
      .limit(CLIENT_PAGE_SIZE)
      .get()
      .then(function(res) {
        var list = res.data || []
        all = all.concat(list)
        if (list.length < CLIENT_PAGE_SIZE) {
          return all
        }
        return nextPage()
      })
  }

  return nextPage()
}

function generateDailyTasks(currentDateInput, options) {
  var opts = options || {}
  var patientOpenid = opts.patientOpenid
  var currentDate = chinaNow(currentDateInput)
  var dateStr = formatDate(currentDate)

  // 必须显式给出 patientOpenid。以前不传时 planQuery 只剩 { status: 1 }，
  // 会把全部用户的计划与当天记录都拉回来（隐私泄露 + 自己的任务列表被别人的计划污染），
  // 所以宁可返回空列表也不要越权查询。
  if (!patientOpenid) {
    return Promise.resolve([])
  }

  return Promise.all([
    fetchPlansByPatient(patientOpenid),
    db.collection('med_records')
      .where({ date: dateStr, patientOpenid: patientOpenid })
      .limit(CLIENT_PAGE_SIZE)
      .get()
  ]).then(function(results) {
    return buildDailyTasks(results[0], results[1].data || [], currentDate)
  })
}

function countPlanTasksInRange(plans, startDateInput, endDateInput) {
  var startDate = parseDateInput(startDateInput)
  var endDate = parseDateInput(endDateInput)
  var totalCount = 0
  var current = new Date(startDate.getTime())

  while (current.getTime() <= endDate.getTime()) {
    for (var i = 0; i < plans.length; i++) {
      if (plans[i] && plans[i].status === 1 && isPlanScheduledForDate(plans[i], current)) {
        totalCount += getPlanTaskCount(plans[i])
      }
    }

    current.setDate(current.getDate() + 1)
  }

  return totalCount
}

module.exports = {
  WEEKDAY_LABELS: WEEKDAY_LABELS,
  chinaNow: chinaNow,
  fetchAllForPatient: fetchAllForPatient,
  buildDailyTasks: buildDailyTasks,
  countPlanTasksInRange: countPlanTasksInRange,
  formatCycleText: formatCycleText,
  formatDate: formatDate,
  generateDailyTasks: generateDailyTasks,
  getPlanTaskCount: getPlanTaskCount,
  getPlanTimeSlots: getPlanTimeSlots,
  getWeekdayNumber: getWeekdayNumber,
  isPlanScheduledForDate: isPlanScheduledForDate,
  normalizeCycleDetail: normalizeCycleDetail,
  normalizeCycleType: normalizeCycleType,
  timeToMinutes: timeToMinutes
}
