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

function truncateText(text, limit) {
  return String(text || '').slice(0, limit)
}

function makeMessageData(title, patientName, timeLabel, remark) {
  var statusText = String(remark || '')
  if (statusText.length > 5) {
    statusText = '\u672a\u670d\u836f'
  }

  return {
    thing1: {
      value: truncateText(title, 20)
    },
    time2: {
      value: timeLabel
    },
    phrase3: {
      value: truncateText(statusText || '\u672a\u670d\u836f', 5)
    },
    thing5: {
      value: truncateText(patientName, 20)
    }
  }
}

function buildRecipientList(patientOpenid, familyList) {
  var recipients = []
  var seen = {}

  if (patientOpenid) {
    recipients.push({
      openid: patientOpenid,
      role: 'patient'
    })
    seen[patientOpenid] = true
  }

  for (var i = 0; i < familyList.length; i++) {
    var familyOpenid = familyList[i].familyOpenid
    if (!familyOpenid || seen[familyOpenid]) {
      continue
    }

    recipients.push({
      openid: familyOpenid,
      role: 'family'
    })
    seen[familyOpenid] = true
  }

  return recipients
}

async function sendSubscribeMessage(openid, data) {
  if (!messageConfig.REMINDER_TEMPLATE_ID || messageConfig.REMINDER_TEMPLATE_ID === 'YOUR_TEMPLATE_ID') {
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
      templateId: messageConfig.REMINDER_TEMPLATE_ID,
      miniprogramState: messageConfig.MINIPROGRAM_STATE || 'formal'
    })

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err.message
    }
  }
}

async function fetchActivePlans() {
  var result = await db.collection('medication_plans')
    .where({ status: 1 })
    .get()

  return result.data || []
}

async function fetchTodayRecords(dateStr) {
  var result = await db.collection('med_records')
    .where({ date: dateStr })
    .get()

  return result.data || []
}

async function fetchFamilyRelationsByPatients(patientOpenids) {
  if (!patientOpenids.length) {
    return []
  }

  var result = await db.collection('family_relations')
    .where({
      patientOpenid: _.in(patientOpenids),
      status: 1
    })
    .get()

  return result.data || []
}

function groupRelationsByPatient(relations) {
  var relationMap = {}

  for (var i = 0; i < relations.length; i++) {
    var patientOpenid = relations[i].patientOpenid
    if (!patientOpenid) {
      continue
    }

    if (!relationMap[patientOpenid]) {
      relationMap[patientOpenid] = []
    }
    relationMap[patientOpenid].push(relations[i])
  }

  return relationMap
}

function groupRecordsByPlan(records) {
  var recordMap = {}

  for (var i = 0; i < records.length; i++) {
    var record = records[i]
    var key = (record.plan_id || '') + '_' + String(record.time_slot)
    if (!recordMap[key]) {
      recordMap[key] = []
    }
    recordMap[key].push(record)
  }

  return recordMap
}

function isFinalStatus(status) {
  return status === 'taken' || status === 'supplement'
}

function isMissedStatus(status) {
  return status === 'missed'
}

function getLatestRecord(records) {
  if (!records || !records.length) {
    return null
  }

  var sorted = records.slice().sort(function(a, b) {
    var timeA = String(a.create_time || a.createTime || '')
    var timeB = String(b.create_time || b.createTime || '')
    return timeB.localeCompare(timeA)
  })

  return sorted[0]
}

async function ensureMissedRecords(plans, recordMap, now, dateStr) {
  var nowMinutes = timeToMinutes(formatTime(now))
  var inserted = []

  for (var i = 0; i < plans.length; i++) {
    var plan = plans[i]
    if (!plan || !plan.patientOpenid) {
      continue
    }

    if (!isPlanScheduledForDate(plan, now)) {
      continue
    }

    var timeSlots = getPlanTimeSlots(plan)
    for (var j = 0; j < timeSlots.length; j++) {
      var key = plan._id + '_' + j
      var existingRecords = recordMap[key] || []
      var latestRecord = getLatestRecord(existingRecords)

      if (latestRecord && (isFinalStatus(latestRecord.status) || isMissedStatus(latestRecord.status))) {
        continue
      }

      var scheduledMinutes = timeToMinutes(timeSlots[j])
      if (nowMinutes < scheduledMinutes + messageConfig.MISSED_GRACE_MINUTES) {
        continue
      }

      await db.collection('med_records').add({
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

function buildRecentMissedMap(records) {
  var patientRecordMap = {}

  for (var i = 0; i < records.length; i++) {
    var record = records[i]
    if (!record.patientOpenid) {
      continue
    }

    if (!patientRecordMap[record.patientOpenid]) {
      patientRecordMap[record.patientOpenid] = []
    }
    patientRecordMap[record.patientOpenid].push(record)
  }

  var result = {}
  var patientOpenids = Object.keys(patientRecordMap)

  for (var j = 0; j < patientOpenids.length; j++) {
    var patientOpenid = patientOpenids[j]
    var list = patientRecordMap[patientOpenid].slice().sort(function(a, b) {
      var timeA = String(a.create_time || a.createTime || a.scheduled_time || '')
      var timeB = String(b.create_time || b.createTime || b.scheduled_time || '')
      return timeB.localeCompare(timeA)
    })

    var recent = list.slice(0, 3)
    result[patientOpenid] = {
      records: recent,
      highRisk: recent.length >= 3 && recent.every(function(item) {
        return isMissedStatus(item.status)
      })
    }
  }

  return result
}

async function sendMissedAlerts(plans, relationMap, missedRecords, dateStr, sendNormalReminders) {
  var planMap = {}
  var sentPatientNormal = {}
  var notifications = []

  for (var i = 0; i < plans.length; i++) {
    planMap[plans[i]._id] = plans[i]
  }

  for (var j = 0; j < missedRecords.length; j++) {
    var record = missedRecords[j]
    var plan = planMap[record.plan_id]
    if (!plan) {
      continue
    }

    var patientName = plan.patientName || plan.med_name || '\u60a3\u8005'
    var recipients = buildRecipientList(plan.patientOpenid, relationMap[plan.patientOpenid] || [])
    var reminderData = makeMessageData(
      '\u670d\u836f\u63d0\u9192',
      patientName,
      dateStr + ' ' + record.scheduled_time,
      (record.med_name || '\u7528\u836f') + '\u5df2\u8d85\u8fc7\u9884\u5b9a\u65f6\u95f4'
    )

    for (var k = 0; k < recipients.length; k++) {
      if (!sendNormalReminders && recipients[k].role === 'patient') {
        continue
      }
      if (recipients[k].role === 'patient' && sentPatientNormal[record.plan_id + '_' + record.time_slot]) {
        continue
      }

      var sendResult = await sendSubscribeMessage(recipients[k].openid, reminderData)
      notifications.push({
        type: 'missed',
        role: recipients[k].role,
        openid: recipients[k].openid,
        planId: record.plan_id,
        timeSlot: record.time_slot,
        success: sendResult.success,
        error: sendResult.error || ''
      })

      if (recipients[k].role === 'patient') {
        sentPatientNormal[record.plan_id + '_' + record.time_slot] = true
      }
    }
  }

  return notifications
}

async function sendHighRiskAlerts(riskMap, relationMap, dateStr) {
  var notifications = []
  var patientOpenids = Object.keys(riskMap)

  for (var i = 0; i < patientOpenids.length; i++) {
    var patientOpenid = patientOpenids[i]
    var riskInfo = riskMap[patientOpenid]
    if (!riskInfo.highRisk) {
      continue
    }

    var familyList = relationMap[patientOpenid] || []
    if (!familyList.length) {
      notifications.push({
        type: 'highRisk',
        role: 'family',
        openid: '',
        patientOpenid: patientOpenid,
        success: false,
        error: 'no family relation'
      })
      continue
    }

    var patientName = familyList[0].patientName || '\u60a3\u8005'
    var data = makeMessageData(
      '\u7d27\u6025\u6f0f\u670d\u63d0\u9192',
      patientName,
      dateStr + ' ' + formatTime(new Date()),
      '\u6700\u8fd1\u5df2\u8fde\u7eed\u591a\u6b21\u6f0f\u670d'
    )

    for (var j = 0; j < familyList.length; j++) {
      if (!familyList[j].familyOpenid) {
        continue
      }

      var sendResult = await sendSubscribeMessage(familyList[j].familyOpenid, data)
      notifications.push({
        type: 'highRisk',
        role: 'family',
        openid: familyList[j].familyOpenid,
        patientOpenid: patientOpenid,
        success: sendResult.success,
        error: sendResult.error || ''
      })
    }
  }

  return notifications
}

exports.main = async function(event) {
  try {
    var options = event || {}
    var now = parseDateTime(options.now)
    var dateStr = formatDate(now)
    var plans = await fetchActivePlans()

    if (!plans.length) {
      return {
        success: true,
        message: 'no active plans',
        checkedAt: dateStr,
        insertedMissedRecords: [],
        notifications: []
      }
    }

    var todayRecords = await fetchTodayRecords(dateStr)
    var patientOpenids = Array.from(new Set(plans.map(function(plan) {
      return plan.patientOpenid
    }).filter(Boolean)))
    var relations = await fetchFamilyRelationsByPatients(patientOpenids)
    var relationMap = groupRelationsByPatient(relations)
    var recordMap = groupRecordsByPlan(todayRecords)
    var insertedMissedRecords = await ensureMissedRecords(plans, recordMap, now, dateStr)

    var allTodayRecords = todayRecords.concat(insertedMissedRecords)
    var riskMap = buildRecentMissedMap(allTodayRecords)
    var missedNotifications = await sendMissedAlerts(
      plans,
      relationMap,
      insertedMissedRecords,
      dateStr,
      options.sendPatientReminder !== false
    )
    var highRiskNotifications = await sendHighRiskAlerts(riskMap, relationMap, dateStr)

    return {
      success: true,
      checkedAt: dateStr + ' ' + formatTime(now),
      insertedMissedRecords: insertedMissedRecords,
      notifications: missedNotifications.concat(highRiskNotifications),
      highRiskPatients: Object.keys(riskMap).filter(function(patientOpenid) {
        return riskMap[patientOpenid].highRisk
      }).map(function(patientOpenid) {
        return {
          patientOpenid: patientOpenid,
          recentRecords: riskMap[patientOpenid].records
        }
      })
    }
  } catch (err) {
    console.error('checkMedication failed:', err)
    return {
      success: false,
      error: err.message
    }
  }
}
