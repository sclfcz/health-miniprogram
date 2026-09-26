const medicationUtils = require('../../utils/medication')

Page({
  data: {
    period: 7,
    bpData: [],
    sugarData: [],
    weightData: [],
    measureCount: 0,
    medCount: 0,
    avgSystolic: 0,
    avgDiastolic: 0,
    avgSugar: 0,
    avgWeight: 0,
    conclusionLevel: 'good',
    conclusionTitle: '',
    conclusionText: ''
  },

  onLoad: function() {
    this.fetchData()
  },

  onPeriodChange: function(e) {
    var period = parseInt(e.currentTarget.dataset.period, 10)
    this.setData({ period: period })
    this.fetchData()
  },

  fetchData: function() {
    var that = this
    wx.showLoading({ title: '分析中...' })

    var period = this.data.period
    var endDate = medicationUtils.chinaNow()
    var startDate = medicationUtils.chinaNow()
    startDate.setDate(startDate.getDate() - period + 1)

    var startDateStr = this.formatDate(startDate)
    var endDateStr = this.formatDate(endDate)

    Promise.all([
      that.fetchHealthMetrics(startDateStr, endDateStr),
      that.fetchMedRecords(startDateStr, endDateStr)
    ]).then(function(results) {
      that.processData(results[0], results[1], startDate)
      wx.hideLoading()
    }).catch(function(err) {
      wx.hideLoading()
      console.error('获取数据失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  fetchHealthMetrics: function(startDate, endDate) {
    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}
    // 以前这里直接对整张表 .get()：既拿到别人的数据，又被平台 20 条上限截断
    return medicationUtils
      .fetchAllForPatient('health_metrics', userInfo.openid || '', { maxPages: 25 })
      .then(function(list) {
        return list.filter(function(item) {
          var date = item.measure_time ? item.measure_time.substring(0, 10) : that.extractDate(item.create_time)
          return date >= startDate && date <= endDate
        })
      })
  },

  fetchMedRecords: function(startDate, endDate) {
    var userInfo = wx.getStorageSync('userInfo') || {}
    return medicationUtils
      .fetchAllForPatient('med_records', userInfo.openid || '', { maxPages: 25 })
      .then(function(list) {
        return list.filter(function(item) {
          var date = item.date || ''
          return date >= startDate && date <= endDate
        })
      })
      .catch(function() {
        return []
      })
  },

  processData: function(healthData, medRecords, startDate) {
    var that = this
    var period = this.data.period
    var dateList = []

    for (var i = 0; i < period; i++) {
      var d = new Date(startDate)
      d.setDate(d.getDate() + i)
      dateList.push(this.formatDate(d))
    }

    var healthByDate = {}
    for (var j = 0; j < healthData.length; j++) {
      var item = healthData[j]
      var date = item.measure_time ? item.measure_time.substring(0, 10) : that.extractDate(item.create_time)
      if (!date) {
        continue
      }

      if (!healthByDate[date] || healthByDate[date].measure_time < item.measure_time) {
        healthByDate[date] = item
      }
    }

    var medByDate = {}
    for (var k = 0; k < medRecords.length; k++) {
      var rec = medRecords[k]
      var medDate = rec.date || ''
      if (!medByDate[medDate]) {
        medByDate[medDate] = []
      }
      medByDate[medDate].push(rec)
    }

    var bpData = []
    var sugarData = []
    var weightData = []
    var totalSystolic = 0
    var totalDiastolic = 0
    var totalSugar = 0
    var totalWeight = 0
    var validCount = 0
    var weightCount = 0

    for (var m = 0; m < dateList.length; m++) {
      var dateKey = dateList[m]
      var health = healthByDate[dateKey]
      var meds = medByDate[dateKey] || []
      var dayLabel = dateKey.substring(5)

      if (health) {
        bpData.push({
          date: dateKey,
          dayLabel: dayLabel,
          systolic: health.systolic,
          diastolic: health.diastolic,
          systolicPos: that.calcBpPosition(health.systolic),
          diastolicPos: that.calcBpPosition(health.diastolic),
          hasMed: meds.length > 0
        })

        sugarData.push({
          date: dateKey,
          dayLabel: dayLabel,
          sugar: health.sugar,
          sugarPos: that.calcSugarPosition(health.sugar),
          hasMed: meds.length > 0
        })

        weightData.push({
          date: dateKey,
          dayLabel: dayLabel,
          weight: health.weight === undefined ? null : health.weight,
          weightPos: that.calcWeightPosition(health.weight),
          hasMed: meds.length > 0
        })

        totalSystolic += health.systolic
        totalDiastolic += health.diastolic
        totalSugar += health.sugar
        validCount++

        if (health.weight !== undefined && health.weight !== null) {
          totalWeight += health.weight
          weightCount++
        }
      } else {
        bpData.push({
          date: dateKey,
          dayLabel: dayLabel,
          systolic: null,
          diastolic: null,
          systolicPos: 0,
          diastolicPos: 0,
          hasMed: meds.length > 0
        })

        sugarData.push({
          date: dateKey,
          dayLabel: dayLabel,
          sugar: null,
          sugarPos: 0,
          hasMed: meds.length > 0
        })

        weightData.push({
          date: dateKey,
          dayLabel: dayLabel,
          weight: null,
          weightPos: 0,
          hasMed: meds.length > 0
        })
      }
    }

    var avgSystolic = validCount > 0 ? Math.round(totalSystolic / validCount) : 0
    var avgDiastolic = validCount > 0 ? Math.round(totalDiastolic / validCount) : 0
    var avgSugar = validCount > 0 ? (totalSugar / validCount).toFixed(1) : 0
    var avgWeight = weightCount > 0 ? (totalWeight / weightCount).toFixed(1) : 0
    var conclusion = this.generateConclusion(bpData, sugarData, avgSystolic, avgDiastolic, avgSugar, medRecords.length)

    this.setData({
      bpData: bpData,
      sugarData: sugarData,
      weightData: weightData,
      measureCount: validCount,
      medCount: medRecords.length,
      avgSystolic: avgSystolic,
      avgDiastolic: avgDiastolic,
      avgSugar: avgSugar,
      avgWeight: avgWeight,
      conclusionLevel: conclusion.level,
      conclusionTitle: conclusion.title,
      conclusionText: conclusion.text
    })
  },

  calcBpPosition: function(value) {
    if (!value) return 0
    var pos = ((value - 60) / 120) * 240
    if (pos < 0) pos = 0
    if (pos > 240) pos = 240
    return Math.round(pos)
  },

  calcSugarPosition: function(value) {
    if (!value) return 0
    var pos = ((value - 1) / 14) * 240
    if (pos < 0) pos = 0
    if (pos > 240) pos = 240
    return Math.round(pos)
  },

  calcWeightPosition: function(value) {
    if (!value) return 0
    var pos = ((value - 30) / 90) * 240
    if (pos < 0) pos = 0
    if (pos > 240) pos = 240
    return Math.round(pos)
  },

  generateConclusion: function(bpData, sugarData, avgSystolic, avgDiastolic, avgSugar, medCount) {
    var bpTrend = this.analyzeTrend(bpData, 'systolic')
    var sugarTrend = this.analyzeTrend(sugarData, 'sugar')
    var level = 'good'
    var title = ''
    var text = ''
    var bpNormal = avgSystolic <= 140 && avgDiastolic <= 90
    var sugarNormal = parseFloat(avgSugar) <= 7.0

    if (bpNormal && sugarNormal) {
      level = 'good'
      title = '健康状况良好'
      text = '当前血压和血糖整体较稳定，建议继续保持规律监测与按时服药。'
    } else if (bpTrend === 'down' && sugarTrend === 'down') {
      level = 'good'
      title = '用药效果较好'
      text = '近期血压与血糖呈下降趋势，当前管理方案正在发挥作用，请继续坚持。'
    } else if (bpTrend === 'up' || sugarTrend === 'up') {
      level = 'warning'
      title = '需要重点关注'
      text = '近期血压或血糖有上升趋势，建议加强监测；如持续波动，请及时咨询医生。'
    } else if (!bpNormal || !sugarNormal) {
      level = 'normal'
      title = '部分指标偏高'
      text = '部分健康指标已超过日常参考范围，建议继续记录趋势并关注生活方式调整。'
    } else {
      level = 'good'
      title = '状态稳定'
      text = '近期指标总体平稳，建议继续保持当前监测与用药节奏。'
    }

    if (medCount === 0) {
      level = 'normal'
      title = '暂无服药记录'
      text = '当前统计周期内没有服药记录，本次结论仅基于健康指标趋势。'
    }

    return {
      level: level,
      title: title,
      text: text
    }
  },

  analyzeTrend: function(data, field) {
    var values = []
    for (var i = 0; i < data.length; i++) {
      if (data[i][field] !== null) {
        values.push(data[i][field])
      }
    }

    if (values.length < 2) return 'stable'

    var mid = Math.floor(values.length / 2)
    var firstHalf = values.slice(0, mid)
    var secondHalf = values.slice(mid)
    var firstAvg = this.average(firstHalf)
    var secondAvg = this.average(secondHalf)
    var diff = secondAvg - firstAvg

    if (diff < -2) return 'down'
    if (diff > 2) return 'up'
    return 'stable'
  },

  average: function(arr) {
    if (arr.length === 0) return 0
    var sum = 0
    for (var i = 0; i < arr.length; i++) {
      sum += arr[i]
    }
    return sum / arr.length
  },

  formatDate: function(date) {
    var year = date.getFullYear()
    var month = (date.getMonth() + 1).toString().padStart(2, '0')
    var day = date.getDate().toString().padStart(2, '0')
    return year + '-' + month + '-' + day
  },

  extractDate: function(time) {
    if (!time) return ''
    if (typeof time === 'string') {
      return time.substring(0, 10)
    }
    if (time instanceof Date) {
      return this.formatDate(time)
    }
    try {
      return this.formatDate(new Date(time))
    } catch (e) {
      return ''
    }
  }
})
