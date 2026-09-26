module.exports = {
  TEMPLATE_ID: 'YOUR_TEMPLATE_ID',
  WARNING_PAGE: 'pages/home/index',
  MISSED_GRACE_MINUTES: 30,
  MISSED_THRESHOLD: 3,
  // 「最近连续漏服」判定最多回看多少条记录（分页拉取，避免平台 100 条上限截断）
  RECENT_RECORD_LIMIT: 200,
  MINIPROGRAM_STATE: 'formal'
}
