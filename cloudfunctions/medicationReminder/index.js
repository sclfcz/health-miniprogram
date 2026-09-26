const cloud = require('wx-server-sdk')
const messageConfig = require('./messageConfig')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function formatDate(date) {
  var chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return [
    chinaDate.getUTCFullYear(),
    padNumber(chinaDate.getUTCMonth() + 1),
    padNumber(chinaDate.getUTCDate())
  ].join('-')
}

function formatTime(date) {
  var chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return padNumber(chinaDate.getUTCHours()) + ':' + padNumber(chinaDate.getUTCMinutes())
}

function parseDateTime(value) {
  if (!value) {
    return new Date()
  }

  if (value instanceof Date) {
    return new Date(value.getTime())
  }

  if (typeof value === 'number') {
    return new Date(value)
  }

  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
      return new Date(value.replace(' ', 'T') + ':00+08:00')
    }
    return new Date(value)
  }

  return new Date()
}

function timeToMinutes(timeStr) {
  var value = String(timeStr || '00:00')
  var parts = value.split(':')
  return parseInt(parts[0] || 0, 10) * 60 + parseInt(parts[1] || 0, 10)
}

function truncateText(text, limit) {
  return String(text || '').slice(0, limit)
}

function normalizeCycleType(plan) {
  var cycleType = plan && plan.cycle_type
  if (cycleType === 'week' || cycleType === 'month') {
    return cycleType
  }
  return 'day'
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

function normalizeCycleDetail(cycleType, cycleDetail) {
  var detail = normalizeNumberArray(cycleDetail)
  if (cycleType === 'week') {
    return detail.filter(function(item) {
      return item >= 1 && item <= 7
    })
  }
  if (cycleType === 'month') {
    return detail.filter(function(item) {
      return item >= 1 && item <= 31
    })
  }
  return []
}

function getWeekdayNumber(date) {
  var chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  var weekday = chinaDate.getUTCDay()
  return weekday === 0 ? 7 : weekday
}

function isPlanScheduledForDate(plan, date) {
  var cycleType = normalizeCycleType(plan)
  var cycleDetail = normalizeCycleDetail(cycleType, plan && plan.cycle_detail)

  if (cycleType === 'week') {
    return cycleDetail.indexOf(getWeekdayNumber(date)) !== -1
  }
  if (cycleType === 'month') {
    var chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)
    return cycleDetail.indexOf(chinaDate.getUTCDate()) !== -1
  }
  return true
}

function getPlanTimeSlots(plan) {
  var slots = Array.isArray(plan && plan.timeSlots) && plan.timeSlots.length
    ? plan.timeSlots.slice()
    : ['08:00']

  return slots.sort(function(a, b) {
    return a.localeCompare(b)
  })
}

function makeLogKey(dateStr, planId, timeSlot) {
  return [dateStr, planId, String(timeSlot)].join('_')
}

function makeMessageData(plan, patientName, dateStr, scheduledTime) {
  return {
    thing1: {
      value: truncateText(plan.med_name || '用药提醒', 20)
    },
    time2: {
      value: dateStr + ' ' + scheduledTime
    },
    phrase3: {
      value: '待服药'
    },
    thing5: {
      value: truncateText(patientName || '患者', 20)
    }
  }
}

// 云函数端 get() 不显式传 limit 时最多返回 100 条（平台默认），超出的计划/记录会被静默丢弃。
// 批量查询统一分页，skip 必须配稳定的 orderBy。
var FETCH_PAGE_SIZE = 100

async function fetchAllPages(buildQuery) {
  var all = []
  while (true) {
    var result = await buildQuery(all.length).limit(FETCH_PAGE_SIZE).get()
    var list = result.data || []
    all = all.concat(list)
    if (list.length < FETCH_PAGE_SIZE) {
      break
    }
  }
  return all
}

async function fetchActivePlans() {
  return fetchAllPages(function(skip) {
    return db.collection('medication_plans')
      .where({ status: 1 })
      .orderBy('_id', 'asc')
      .skip(skip)
  })
}

async function fetchTodayRecords(dateStr) {
  return fetchAllPages(function(skip) {
    return db.collection('med_records')
      .where({ date: dateStr })
      .orderBy('_id', 'asc')
      .skip(skip)
  })
}

async function fetchPatientMap(patientOpenids) {
  var patientMap = {}
  if (!patientOpenids.length) {
    return patientMap
  }

  var list = await fetchAllPages(function(skip) {
    return db.collection('patient')
      .where({ openid: _.in(patientOpenids) })
      .orderBy('_id', 'asc')
      .skip(skip)
  })

  for (var i = 0; i < list.length; i++) {
    patientMap[list[i].openid] = list[i]
  }
  return patientMap
}

function hasRecord(records, planId, timeSlot) {
  for (var i = 0; i < records.length; i++) {
    if ((records[i].plan_id || '') === planId && records[i].time_slot === timeSlot) {
      return true
    }
  }
  return false
}

async function hasReminderLog(logKey) {
  // 只把「发送成功」当作已提醒：定时器 5 分钟一次、窗口 10 分钟，
  // 窗口内本应有第二次机会（用户可能刚点完“允许”）。若把 failed 也算已提醒，
  // 一次 43101（未授权）就会把当天该时段的提醒永久堵死。
  var result = await db.collection('reminder_logs')
    .where({
      logKey: logKey,
      status: 'success'
    })
    .limit(1)
    .get()
  return result.data && result.data.length > 0
}

async function writeReminderLog(data) {
  await db.collection('reminder_logs').add({
    data: Object.assign({}, data, {
      create_time: db.serverDate()
    })
  })
}

async function sendSubscribeMessage(openid, data) {
  if (!messageConfig.TEMPLATE_ID || messageConfig.TEMPLATE_ID === 'YOUR_TEMPLATE_ID') {
    return {
      success: false,
      error: 'missing template id'
    }
  }

  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      page: messageConfig.REMINDER_PAGE,
      data: data,
      templateId: messageConfig.TEMPLATE_ID,
      miniprogramState: messageConfig.MINIPROGRAM_STATE || 'formal'
    })
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err.message || String(err)
    }
  }
}

exports.main = async function(event) {
  var notifications = []

  try {
    var wxContext = cloud.getWXContext()
    var options = event || {}
    var now = parseDateTime(options.now)
    var dateStr = formatDate(now)
    var nowMinutes = timeToMinutes(formatTime(now))
    var windowMinutes = parseInt(options.windowMinutes || messageConfig.REMINDER_WINDOW_MINUTES, 10)
    var plans = await fetchActivePlans()
    var todayRecords = await fetchTodayRecords(dateStr)
    var patientOpenids = Array.from(new Set(plans.map(function(plan) {
      return plan.patientOpenid
    }).filter(Boolean)))
    var patientMap = await fetchPatientMap(patientOpenids)

    for (var i = 0; i < plans.length; i++) {
      var plan = plans[i]
      if (!plan || !plan.patientOpenid || !isPlanScheduledForDate(plan, now)) {
        continue
      }

      var timeSlots = getPlanTimeSlots(plan)
      for (var j = 0; j < timeSlots.length; j++) {
        var scheduledTime = timeSlots[j]
        var scheduledMinutes = timeToMinutes(scheduledTime)
        if (nowMinutes < scheduledMinutes || nowMinutes > scheduledMinutes + windowMinutes) {
          continue
        }

        if (hasRecord(todayRecords, plan._id, j)) {
          continue
        }

        var logKey = makeLogKey(dateStr, plan._id, j)
        if (await hasReminderLog(logKey)) {
          continue
        }

        var patient = patientMap[plan.patientOpenid] || {}
        var messageData = makeMessageData(plan, patient.name || plan.patientName, dateStr, scheduledTime)
        var sendResult = await sendSubscribeMessage(plan.patientOpenid, messageData)
        var logData = {
          type: 'patient_reminder',
          logKey: logKey,
          patientOpenid: plan.patientOpenid,
          planId: plan._id,
          timeSlot: j,
          date: dateStr,
          scheduled_time: scheduledTime,
          med_name: plan.med_name || '',
          templateId: messageConfig.TEMPLATE_ID,
          status: sendResult.success ? 'success' : 'failed',
          error: sendResult.error || ''
        }
        await writeReminderLog(logData)
        notifications.push(logData)
      }
    }

    return {
      success: true,
      checkedAt: dateStr + ' ' + formatTime(now),
      appid: wxContext.APPID || '',
      env: wxContext.ENV || '',
      notifications: notifications
    }
  } catch (err) {
    console.error('medicationReminder failed:', err)
    return {
      success: false,
      error: err.message || String(err),
      notifications: notifications
    }
  }
}
