module.exports = {
  PATIENT_REMINDER_TEMPLATE_ID: 'YOUR_TEMPLATE_ID',
  FAMILY_WARNING_TEMPLATE_ID: 'YOUR_TEMPLATE_ID',
  SUBSCRIBE_TEMPLATE_ID: 'YOUR_TEMPLATE_ID',
  REMINDER_TEMPLATE_ID: 'YOUR_TEMPLATE_ID',
  // 超过计划时间多少分钟仍无记录即视为漏服（必须与
  // cloudfunctions/checkMedicationMissed/messageConfig.js 保持一致）
  MISSED_GRACE_MINUTES: 30
}
