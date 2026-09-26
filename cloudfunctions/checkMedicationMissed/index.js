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

function makeRecordKey(planId, timeSlot) {
  return (planId || '') + '_' + String(timeSlot)
}

function makeWarningKey(patientOpenid, records) {
  var oldestRecord = records[records.length - 1] || {}
  return patientOpenid + '_streak_' + (oldestRecord._id || [
    oldestRecord.date,
    oldestRecord.plan_id,
    oldestRecord.time_slot
  ].join('_'))
}

function makeMessageData(patientName, missedCount, triggerTime) {
  return {
    thing1: {
      value: truncateText('连续漏服' + missedCount + '次', 20)
    },
    time2: {
      value: triggerTime
    },
    phrase3: {
      value: '未服药'
    },
    thing5: {
      value: truncateText(patientName || '患者', 20)
    }
  }
}

// 云函数端 db.collection().get() 不显式传 limit 时最多返回 100 条（平台默认），
// 超出部分被静默丢弃 —— 记录一旦超过 100 条，漏服记录生成与「连续漏服」判定都会基于不完整数据。
// 所有批量查询统一走分页，跳过 skip 必须配合稳定的 orderBy。
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

async function fetchFamilyRelationsByPatients(patientOpenids) {
  if (!patientOpenids.length) {
    return []
  }

  return fetchAllPages(function(skip) {
    return db.collection('family_relations')
      .where({
        patientOpenid: _.in(patientOpenids),
        status: 1
      })
      .orderBy('_id', 'asc')
      .skip(skip)
  })
}

function groupRelationsByPatient(relations) {
  var relationMap = {}
  for (var i = 0; i < relations.length; i++) {
    var relation = relations[i]
    if (!relation.patientOpenid) {
      continue
    }
    if (!relationMap[relation.patientOpenid]) {
      relationMap[relation.patientOpenid] = []
    }
    relationMap[relation.patientOpenid].push(relation)
  }
  return relationMap
}

function groupRecordsByPlan(records) {
  var recordMap = {}
  for (var i = 0; i < records.length; i++) {
    var record = records[i]
    var key = makeRecordKey(record.plan_id, record.time_slot)
    if (!recordMap[key]) {
      recordMap[key] = []
    }
    recordMap[key].push(record)
  }
  return recordMap
}

function hasCompletedRecord(records) {
  for (var i = 0; i < records.length; i++) {
    if (records[i].status === 'taken' || records[i].status === 'supplement' || records[i].status === 'missed') {
      return true
    }
  }
  return false
}

async function ensureMissedRecords(plans, recordMap, now, dateStr) {
  var nowMinutes = timeToMinutes(formatTime(now))
  var inserted = []

  for (var i = 0; i < plans.length; i++) {
    var plan = plans[i]
    if (!plan || !plan.patientOpenid || !isPlanScheduledForDate(plan, now)) {
      continue
    }

    var timeSlots = getPlanTimeSlots(plan)
    for (var j = 0; j < timeSlots.length; j++) {
      var key = makeRecordKey(plan._id, j)
      var existingRecords = recordMap[key] || []
      if (hasCompletedRecord(existingRecords)) {
        continue
      }

      var scheduledMinutes = timeToMinutes(timeSlots[j])
      if (nowMinutes < scheduledMinutes + messageConfig.MISSED_GRACE_MINUTES) {
        continue
      }

      var addResult = await db.collection('med_records').add({
        data: {
          patientOpenid: plan.patientOpenid,
          plan_id: plan._id,
          med_name: plan.med_name || '',
          date: dateStr,
          time_slot: j,
          scheduled_time: timeSlots[j],
          status: 'missed',
          create_time: db.serverDate()
        }
      })

      var newRecord = {
        _id: addResult._id,
        patientOpenid: plan.patientOpenid,
        plan_id: plan._id,
        med_name: plan.med_name || '',
        date: dateStr,
        time_slot: j,
        scheduled_time: timeSlots[j],
        status: 'missed',
        create_time: now.toISOString()
      }

      if (!recordMap[key]) {
        recordMap[key] = []
      }
      recordMap[key].push(newRecord)
      inserted.push(newRecord)
    }
  }

  return inserted
}

async function fetchRecentPatientRecords(patientOpenid) {
  // 分页拉取 + 按业务时间倒序：没有 orderBy 时数据库返回顺序不确定，
  // 而「最近连续漏服」的判定依赖顺序；没有分页则被平台 100 条上限截断。
  var limit = parseInt(messageConfig.RECENT_RECORD_LIMIT, 10)
  if (!(limit > 0)) {
    limit = 200
  }
  var pageSize = Math.min(limit, FETCH_PAGE_SIZE)
  var all = []
  while (all.length < limit) {
    var result = await db.collection('med_records')
      .where({ patientOpenid: patientOpenid })
      .orderBy('date', 'desc')
      .orderBy('scheduled_time', 'desc')
      .skip(all.length)
      .limit(pageSize)
      .get()
    var list = result.data || []
    all = all.concat(list)
    if (list.length < pageSize) {
      break
    }
  }
  return all
}

function recordTime(record) {
  var raw = record && (record.create_time || record.createTime)
  if (raw instanceof Date) {
    return raw.getTime()
  }
  if (typeof raw === 'number') {
    return raw
  }
  if (typeof raw === 'string') {
    var parsed = new Date(raw.replace(' ', 'T')).getTime()
    if (!isNaN(parsed)) {
      return parsed
    }
  }
  return 0
}

function compareRecordsDesc(a, b) {
  // 必须先按业务时间（date + scheduled_time）排，再用 create_time / _id 打破平局。
  // 若比较器不是全序，同一个 plan+slot 同时存在 missed 与 taken 时，
  // 「连续漏服」的结论会随数据库返回顺序翻转，家属预警时有时无。
  var keyA = String(a.date || '') + ' ' + String(a.scheduled_time || '')
  var keyB = String(b.date || '') + ' ' + String(b.scheduled_time || '')
  if (keyA !== keyB) {
    return keyB.localeCompare(keyA)
  }
  var timeA = recordTime(a)
  var timeB = recordTime(b)
  if (timeA !== timeB) {
    return timeB - timeA
  }
  return String(b._id || '').localeCompare(String(a._id || ''))
}

function getConsecutiveMissedRecords(records) {
  var sorted = records.slice().sort(compareRecordsDesc)
  var missed = []
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].status === 'missed') {
      missed.push(sorted[i])
    } else if (sorted[i].status === 'taken' || sorted[i].status === 'supplement') {
      break
    }
  }
  return missed
}

async function hasWarningLog(warningKey) {
  var result = await db.collection('warning_logs')
    .where({
      warningKey: warningKey,
      status: 'success'
    })
    .limit(1)
    .get()
  return result.data && result.data.length > 0
}

async function writeWarningLog(data) {
  await db.collection('warning_logs').add({
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
      page: messageConfig.WARNING_PAGE,
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
  var warnings = []
  var insertedMissedRecords = []

  try {
    var options = event || {}
    var now = parseDateTime(options.now)
    var dateStr = formatDate(now)
    var triggerTime = dateStr + ' ' + formatTime(now)
    var plans = await fetchActivePlans()
    var todayRecords = await fetchTodayRecords(dateStr)
    var recordMap = groupRecordsByPlan(todayRecords)
    insertedMissedRecords = await ensureMissedRecords(plans, recordMap, now, dateStr)

    var patientOpenids = Array.from(new Set(plans.map(function(plan) {
      return plan.patientOpenid
    }).filter(Boolean)))
    var patientMap = await fetchPatientMap(patientOpenids)
    var relations = await fetchFamilyRelationsByPatients(patientOpenids)
    var relationMap = groupRelationsByPatient(relations)

    for (var i = 0; i < patientOpenids.length; i++) {
      var patientOpenid = patientOpenids[i]
      var recentRecords = await fetchRecentPatientRecords(patientOpenid)
      var consecutiveMissed = getConsecutiveMissedRecords(recentRecords)
      if (consecutiveMissed.length < messageConfig.MISSED_THRESHOLD) {
        continue
      }

      var warningRecords = consecutiveMissed.slice(0, messageConfig.MISSED_THRESHOLD)
      var warningKey = makeWarningKey(patientOpenid, warningRecords)
      if (await hasWarningLog(warningKey)) {
        continue
      }

      var familyList = relationMap[patientOpenid] || []
      var patient = patientMap[patientOpenid] || {}
      var patientName = patient.name || (familyList[0] && familyList[0].patientName) || '患者'
      var data = makeMessageData(patientName, consecutiveMissed.length, triggerTime)
      var sentResults = []

      if (!familyList.length) {
        warnings.push({
          type: 'family_missed_warning',
          warningKey: warningKey,
          patientOpenid: patientOpenid,
          patientName: patientName,
          missedCount: consecutiveMissed.length,
          threshold: messageConfig.MISSED_THRESHOLD,
          triggerTime: triggerTime,
          status: 'skipped',
          sendResults: [{
            familyOpenid: '',
            success: false,
            error: 'no family relation'
          }],
          recordIds: warningRecords.map(function(record) { return record._id || '' })
        })
        continue
      }

      for (var j = 0; j < familyList.length; j++) {
        if (!familyList[j].familyOpenid) {
          sentResults.push({
            familyOpenid: '',
            success: false,
            error: 'missing familyOpenid'
          })
          continue
        }

        var sendResult = await sendSubscribeMessage(familyList[j].familyOpenid, data)
        sentResults.push({
          familyOpenid: familyList[j].familyOpenid,
          success: sendResult.success,
          error: sendResult.error || ''
        })
      }

      var warningLog = {
        type: 'family_missed_warning',
        warningKey: warningKey,
        patientOpenid: patientOpenid,
        patientName: patientName,
        missedCount: consecutiveMissed.length,
        threshold: messageConfig.MISSED_THRESHOLD,
        triggerTime: triggerTime,
        status: sentResults.some(function(item) { return item.success }) ? 'success' : 'failed',
        sendResults: sentResults,
        recordIds: warningRecords.map(function(record) { return record._id || '' })
      }
      await writeWarningLog(warningLog)
      warnings.push(warningLog)
    }

    return {
      success: true,
      checkedAt: triggerTime,
      insertedMissedRecords: insertedMissedRecords,
      warnings: warnings
    }
  } catch (err) {
    console.error('checkMedicationMissed failed:', err)
    return {
      success: false,
      error: err.message || String(err),
      insertedMissedRecords: insertedMissedRecords,
      warnings: warnings
    }
  }
}
