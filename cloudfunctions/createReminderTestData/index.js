const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function formatDate(date) {
  const chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return [
    chinaDate.getUTCFullYear(),
    padNumber(chinaDate.getUTCMonth() + 1),
    padNumber(chinaDate.getUTCDate())
  ].join('-')
}

function formatTime(date) {
  const chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return padNumber(chinaDate.getUTCHours()) + ':' + padNumber(chinaDate.getUTCMinutes())
}

exports.main = async function(event) {
  try {
    const wxContext = cloud.getWXContext()
    const patientOpenid = event && event.patientOpenid ? event.patientOpenid : wxContext.OPENID
    const now = new Date()
    const missedBase = new Date(now.getTime() - 40 * 60 * 1000)
    const reminderTime = formatTime(missedBase)

    const planResult = await db.collection('medication_plans').add({
      data: {
        patientOpenid: patientOpenid,
        med_name: event && event.med_name ? event.med_name : '提醒测试药品',
        dosage: event && event.dosage ? event.dosage : '每次 1 片',
        notes: '用于验证订阅提醒链路',
        frequency: 1,
        timeSlots: [reminderTime],
        cycle_type: 'day',
        cycle_detail: [],
        status: 1,
        createTime: db.serverDate()
      }
    })

    return {
      success: true,
      message: '已创建测试计划',
      planId: planResult._id,
      patientOpenid: patientOpenid,
      today: formatDate(now),
      triggerTime: reminderTime,
      suggestedCheckNow: formatDate(now) + ' ' + formatTime(now)
    }
  } catch (err) {
    console.error('createReminderTestData failed:', err)
    return {
      success: false,
      error: err.message
    }
  }
}
