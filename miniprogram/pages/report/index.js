const medicationUtils = require('../../utils/medication')

Page({
  data: {
    monthStr: '',
    complianceRate: 0,
    evaluationText: '',
    evaluationLevel: '',
    evaluationLevelText: '',
    shouldTakeCount: 0,
    actualTakeCount: 0,
    missedCount: 0,
    supplementCount: 0,
    dailyRecords: [],
    adviceText: '',
    patientOpenid: ''
  },

  onLoad: function(options) {
    // 家属从「选择患者」进来时带 patientOpenid；患者本人不带
    this.setData({ patientOpenid: (options && options.patientOpenid) || '' })
    this.calculateReport()
  },

  resolvePatientOpenid: function() {
    var userInfo = wx.getStorageSync('userInfo') || {}
    return this.data.patientOpenid || userInfo.openid || ''
  },

  // 计算月报数据
  calculateReport: function() {
    var that = this
    var now = medicationUtils.chinaNow()
    var year = now.getFullYear()
    var month = now.getMonth()
    
    // 设置月份字符串
    var monthStr = year + '年' + (month + 1) + '月'
    this.setData({ monthStr: monthStr })

    // 计算本月起止日期
    var startDate = new Date(year, month, 1)
    var endDate = new Date(year, month + 1, 0)
    
    var startDateStr = this.formatDate(startDate)
    var endDateStr = this.formatDate(endDate)

    wx.showLoading({ title: '计算中...' })

    // 获取用药计划（必须限定在当前查看的患者名下，以前是全库计划）
    medicationUtils
      .fetchAllForPatient('medication_plans', this.resolvePatientOpenid(), {
        where: { status: 1 },
        orderBy: [['_id', 'asc']]
      })
      .then(function(plans) {
        if (plans.length === 0) {
          wx.hideLoading()
          that.setData({
            complianceRate: 0,
            evaluationText: '暂无用药计划',
            evaluationLevel: 'level-none',
            evaluationLevelText: '暂无数据'
          })
          return
        }

        // 计算应服药次数
        var daysInMonth = endDate.getDate()
        var shouldTakeCount = medicationUtils.countPlanTasksInRange(plans, startDate, endDate)

        // 获取本月记录
        that.fetchRecords(plans, shouldTakeCount, startDateStr, endDateStr, daysInMonth)
      })
      .catch(function(err) {
        wx.hideLoading()
        console.error('获取计划失败:', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  // 获取记录
  fetchRecords: function(plans, shouldTakeCount, startDateStr, endDateStr, daysInMonth) {
    var that = this

    medicationUtils
      .fetchAllForPatient('med_records', this.resolvePatientOpenid(), { maxPages: 25 })
      .then(function(records) {
        // 筛选本月记录
        var monthRecords = []
        for (var i = 0; i < records.length; i++) {
          var date = records[i].date
          if (date >= startDateStr && date <= endDateStr) {
            monthRecords.push(records[i])
          }
        }

        that.processData(plans, shouldTakeCount, monthRecords, daysInMonth)
        wx.hideLoading()
      })
      .catch(function(err) {
        wx.hideLoading()
        console.error('获取记录失败:', err)
      })
  },

  // 处理数据
  processData: function(plans, shouldTakeCount, records, daysInMonth) {
    var takenCount = 0
    var supplementCount = 0

    // 统计各状态数量
    for (var i = 0; i < records.length; i++) {
      var status = records[i].status
      if (status === 'taken') {
        takenCount++
      } else if (status === 'supplement') {
        supplementCount++
      }
    }

    // 实际服药次数 = 已服药 + 补服
    var actualTakeCount = takenCount + supplementCount
    
    // 漏服次数 = 应服药次数 - 实际服药次数
    var missedCount = shouldTakeCount - actualTakeCount
    if (missedCount < 0) {
      missedCount = 0
    }

    // 计算依从性
    var complianceRate = 0
    if (shouldTakeCount > 0) {
      complianceRate = Math.round((actualTakeCount / shouldTakeCount) * 100)
    }

    // 生成评估结果
    var evaluation = this.getEvaluation(complianceRate)

    // 生成每日记录
    var dailyRecords = this.generateDailyRecords(records, daysInMonth)

    // 生成建议
    var advice = this.getAdvice(complianceRate)

    this.setData({
      shouldTakeCount: shouldTakeCount,
      actualTakeCount: actualTakeCount,
      missedCount: missedCount,
      supplementCount: supplementCount,
      complianceRate: complianceRate,
      evaluationText: evaluation.text,
      evaluationLevel: evaluation.level,
      evaluationLevelText: evaluation.levelText,
      dailyRecords: dailyRecords,
      adviceText: advice
    })
  },

  // 获取评估结果
  getEvaluation: function(rate) {
    if (rate >= 95) {
      return {
        text: '表现优异，请继续保持良好的服药习惯！',
        level: 'level-excellent',
        levelText: '优秀'
      }
    } else if (rate >= 80) {
      return {
        text: '表现良好，继续努力可以做得更好！',
        level: 'level-good',
        levelText: '良好'
      }
    } else if (rate >= 60) {
      return {
        text: '表现一般，建议设置更多提醒来帮助按时服药。',
        level: 'level-normal',
        levelText: '一般'
      }
    } else {
      return {
        text: '表现欠佳，漏服次数较多，请重视用药依从性。',
        level: 'level-poor',
        levelText: '需改进'
      }
    }
  },

  // 生成建议
  getAdvice: function(rate) {
    if (rate >= 95) {
      return '您的用药依从性非常优秀！良好的服药习惯是健康管理的基础，建议继续保持。同时可以关注用药禁忌，避免药物相互作用。'
    } else if (rate >= 80) {
      return '您的用药依从性良好。建议设置每日用药提醒，在手机上记录服药时间，这样可以更好地管理用药计划。'
    } else if (rate >= 60) {
      return '您的用药依从性有待提高。建议：1）设置多个服药提醒；2）将药品放在显眼位置；3）请家人协助监督。'
    } else {
      return '您的用药依从性较低，可能影响治疗效果。强烈建议：1）就医咨询用药方案；2）使用分药盒管理药品；3）请家属协助监督服药。'
    }
  },

  // 生成每日记录
  generateDailyRecords: function(records, daysInMonth) {
    var dailyRecords = []
    var now = medicationUtils.chinaNow()
    var currentDay = now.getDate()

    // 初始化每日记录
    for (var i = 1; i <= daysInMonth; i++) {
      var status = 'empty'
      var show = i <= currentDay

      dailyRecords.push({
        day: i,
        status: status,
        show: show
      })
    }

    // 根据记录更新状态
    for (var j = 0; j < records.length; j++) {
      var record = records[j]
      var date = record.date
      var day = parseInt(date.split('-')[2])
      
      if (day > 0 && day <= daysInMonth) {
        var currentStatus = dailyRecords[day - 1].status
        
        // 优先级：missed > supplement > taken
        if (record.status === 'missed') {
          dailyRecords[day - 1].status = 'missed'
        } else if (record.status === 'supplement' && currentStatus !== 'missed') {
          dailyRecords[day - 1].status = 'supplement'
        } else if (record.status === 'taken' && currentStatus === 'empty') {
          dailyRecords[day - 1].status = 'taken'
        }
      }
    }

    return dailyRecords
  },

  // 格式化日期
  formatDate: function(date) {
    var year = date.getFullYear()
    var month = (date.getMonth() + 1).toString().padStart(2, '0')
    var day = date.getDate().toString().padStart(2, '0')
    return year + '-' + month + '-' + day
  }
})
