const db = wx.cloud.database()
const medicationUtils = require('../../utils/medication')

Page({
  data: {
    systolic: '',
    diastolic: '',
    sugar: '',
    weight: '',
    date: '',
    time: '',
    submitting: false
  },

  onLoad: function() {
    var now = medicationUtils.chinaNow()
    var year = now.getFullYear()
    var month = this.padZero(now.getMonth() + 1)
    var day = this.padZero(now.getDate())
    var hour = this.padZero(now.getHours())
    var minute = this.padZero(now.getMinutes())

    this.setData({
      date: year + '-' + month + '-' + day,
      time: hour + ':' + minute
    })
  },

  padZero: function(n) {
    return n < 10 ? '0' + n : '' + n
  },

  onSystolicInput: function(e) {
    this.setData({ systolic: e.detail.value })
  },

  onDiastolicInput: function(e) {
    this.setData({ diastolic: e.detail.value })
  },

  onSugarInput: function(e) {
    this.setData({ sugar: e.detail.value })
  },

  onWeightInput: function(e) {
    this.setData({ weight: e.detail.value })
  },

  onDateChange: function(e) {
    this.setData({ date: e.detail.value })
  },

  onTimeChange: function(e) {
    this.setData({ time: e.detail.value })
  },

  validateData: function(systolic, diastolic, sugar, weight) {
    var systolicNum = parseFloat(systolic)
    var diastolicNum = parseFloat(diastolic)
    var sugarNum = parseFloat(sugar)
    var weightNum = parseFloat(weight)

    if (systolicNum < 60 || systolicNum > 250) {
      return { valid: false, message: '收缩压数值似乎异常，请确认后录入' }
    }
    if (diastolicNum < 40 || diastolicNum > 150) {
      return { valid: false, message: '舒张压数值似乎异常，请确认后录入' }
    }
    if (sugarNum < 1 || sugarNum > 30) {
      return { valid: false, message: '血糖数值似乎异常，请确认后录入' }
    }
    if (weightNum < 20 || weightNum > 300) {
      return { valid: false, message: '体重数值似乎异常，请确认后录入' }
    }
    return { valid: true }
  },

  onSubmit: function() {
    var that = this

    if (this.data.submitting) {
      return
    }

    var systolic = this.data.systolic
    var diastolic = this.data.diastolic
    var sugar = this.data.sugar
    var weight = this.data.weight

    if (!systolic || !diastolic) {
      wx.showToast({ title: '请输入血压值', icon: 'none' })
      return
    }
    if (!sugar) {
      wx.showToast({ title: '请输入血糖值', icon: 'none' })
      return
    }
    if (!weight) {
      wx.showToast({ title: '请输入体重值', icon: 'none' })
      return
    }

    var validation = this.validateData(systolic, diastolic, sugar, weight)
    if (!validation.valid) {
      wx.showModal({
        title: '提示',
        content: validation.message,
        showCancel: true,
        cancelText: '取消',
        confirmText: '确认录入',
        success: function(res) {
          if (res.confirm) {
            that.doSubmit(systolic, diastolic, sugar, weight)
          }
        }
      })
      return
    }

    this.doSubmit(systolic, diastolic, sugar, weight)
  },

  doSubmit: function(systolic, diastolic, sugar, weight) {
    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}
    var systolicNum = parseFloat(systolic)
    var sugarNum = parseFloat(sugar)
    var weightNum = parseFloat(weight)
    var measureTime = this.data.date + ' ' + this.data.time

    this.setData({ submitting: true })
    wx.showLoading({ title: '保存中...', mask: true })

    db.collection('health_metrics').add({
      data: {
        patientOpenid: userInfo.openid || '',
        systolic: systolicNum,
        diastolic: parseFloat(diastolic),
        sugar: sugarNum,
        weight: weightNum,
        measure_time: measureTime,
        create_time: db.serverDate()
      }
    }).then(function() {
      wx.hideLoading()
      that.setData({ submitting: false })

      var isHigh = systolicNum > 140 || sugarNum > 7.0

      if (isHigh) {
        wx.showModal({
          title: '保存成功',
          content: '部分指标偏高，请注意观察。',
          showCancel: false,
          success: function() {
            wx.navigateBack()
          }
        })
      } else {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
        setTimeout(function() {
          wx.navigateBack()
        }, 1500)
      }
    }).catch(function(err) {
      wx.hideLoading()
      that.setData({ submitting: false })
      console.error('保存失败', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  }
})
