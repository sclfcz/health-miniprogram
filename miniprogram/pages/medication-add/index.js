const db = wx.cloud.database()
const medicationUtils = require('../../utils/medication')
const messageConfig = require('../../config/message')

var TEXTS = {
  medNameLabel: '\u836f\u54c1\u540d\u79f0',
  medNamePlaceholder: '\u8bf7\u8f93\u5165\u836f\u54c1\u540d\u79f0\u6216\u5173\u952e\u8bcd',
  searchingMedicine: '\u6b63\u5728\u641c\u7d22\u836f\u54c1...',
  noMedicineFound: '\u672a\u627e\u5230\u5339\u914d\u836f\u54c1',
  commonDosagePrefix: '\u5e38\u7528\u5242\u91cf\uff1a',
  efficacyPrefix: '\u529f\u6548\uff1a',
  dosageLabel: '\u7528\u836f\u5242\u91cf',
  dosagePlaceholder: '\u4f8b\u5982\uff1a\u6bcf\u6b21 1 \u7c92',
  frequencyLabel: '\u6bcf\u65e5\u6b21\u6570',
  frequency1: '1\u6b21',
  frequency2: '2\u6b21',
  frequency3: '3\u6b21',
  frequency4: '4\u6b21',
  cycleLabel: '\u6267\u884c\u5468\u671f',
  timeLabel: '\u670d\u836f\u65f6\u95f4',
  timePrefix: '\u7b2c',
  timeSuffix: '\u6b21',
  notesLabel: '\u5907\u6ce8\u4fe1\u606f',
  optionalText: '\uff08\u9009\u586b\uff09',
  notesPlaceholder: '\u8bf7\u8f93\u5165\u5907\u6ce8\u4fe1\u606f',
  savePlan: '\u4fdd\u5b58\u8ba1\u5212',
  cycleDay: '\u6309\u5929',
  cycleWeek: '\u6309\u5468',
  cycleMonth: '\u6309\u6708',
  week1: '\u5468\u4e00',
  week2: '\u5468\u4e8c',
  week3: '\u5468\u4e09',
  week4: '\u5468\u56db',
  week5: '\u5468\u4e94',
  week6: '\u5468\u516d',
  week7: '\u5468\u65e5',
  everyDay: '\u6bcf\u5929',
  daySuffix: '\u65e5',
  searchMedicineFailed: '\u836f\u54c1\u641c\u7d22\u5931\u8d25:',
  efficacyNotePrefix: '\u529f\u6548\uff1a',
  enterMedicineName: '\u8bf7\u8f93\u5165\u836f\u54c1\u540d\u79f0',
  enterDosage: '\u8bf7\u8f93\u5165\u7528\u836f\u5242\u91cf',
  chooseWeekday: '\u8bf7\u9009\u62e9\u7528\u836f\u661f\u671f',
  chooseMonthday: '\u8bf7\u9009\u62e9\u7528\u836f\u65e5\u671f',
  saving: '\u4fdd\u5b58\u4e2d...',
  addSuccess: '\u6dfb\u52a0\u6210\u529f',
  saveFailed: '\u4fdd\u5b58\u5931\u8d25',
  configTemplateFirst: '\u8bf7\u5148\u914d\u7f6e\u6a21\u677fID',
  subscribeFailed: '\u8ba2\u9605\u6388\u6743\u5931\u8d25:'
}

var DEFAULT_TIMES = {
  1: ['08:00'],
  2: ['08:00', '18:00'],
  3: ['08:00', '12:00', '18:00'],
  4: ['08:00', '12:00', '18:00', '22:00']
}

var CYCLE_TYPES = ['day', 'week', 'month']
var MONTH_DAYS = (function() {
  var days = []
  for (var i = 1; i <= 31; i++) {
    days.push(i)
  }
  return days
})()

Page({
  data: {
    texts: TEXTS,
    med_name: '',
    dosage: '',
    notes: '',
    frequency: 3,
    timeSlots: ['08:00', '12:00', '18:00'],
    cycleType: 'day',
    cycleTypeOptions: [
      { value: 'day', label: TEXTS.cycleDay },
      { value: 'week', label: TEXTS.cycleWeek },
      { value: 'month', label: TEXTS.cycleMonth }
    ],
    weekOptions: [
      { value: 1, label: TEXTS.week1, checked: true },
      { value: 2, label: TEXTS.week2, checked: true },
      { value: 3, label: TEXTS.week3, checked: true },
      { value: 4, label: TEXTS.week4, checked: true },
      { value: 5, label: TEXTS.week5, checked: true },
      { value: 6, label: TEXTS.week6, checked: true },
      { value: 7, label: TEXTS.week7, checked: true }
    ],
    monthOptions: [],
    cycleSummary: TEXTS.everyDay,
    medicineSuggestions: [],
    showSuggestions: false,
    searchingMedicine: false
  },

  onLoad: function() {
    this.initMonthOptions()
    this.updateCycleSummary()
  },

  initMonthOptions: function() {
    var monthOptions = []
    for (var i = 0; i < MONTH_DAYS.length; i++) {
      monthOptions.push({
        value: MONTH_DAYS[i],
        label: MONTH_DAYS[i] + TEXTS.daySuffix,
        checked: MONTH_DAYS[i] === 1
      })
    }
    this.setData({ monthOptions: monthOptions })
  },

  onNameInput: function(e) {
    var value = e.detail.value
    this.setData({ med_name: value })
    this.searchMedicine(value)
  },

  onDosageInput: function(e) {
    this.setData({ dosage: e.detail.value })
  },

  onNotesInput: function(e) {
    this.setData({ notes: e.detail.value })
  },

  searchMedicine: function(keyword) {
    var that = this
    var text = String(keyword || '').trim()

    if (!text) {
      this.setData({
        medicineSuggestions: [],
        showSuggestions: false,
        searchingMedicine: false
      })
      return
    }

    this.setData({
      searchingMedicine: true,
      showSuggestions: true
    })

    wx.cloud.callFunction({
      name: 'searchMedicine',
      data: { keyword: text }
    }).then(function(res) {
      var list = (res.result && res.result.list) || []
      that.setData({
        medicineSuggestions: list,
        showSuggestions: true,
        searchingMedicine: false
      })
    }).catch(function(err) {
      console.error(TEXTS.searchMedicineFailed, err)
      that.setData({
        medicineSuggestions: [],
        showSuggestions: false,
        searchingMedicine: false
      })
    })
  },

  onSuggestionTap: function(e) {
    var item = e.currentTarget.dataset.item
    this.setData({
      med_name: item.med_name || '',
      dosage: item.dosage || this.data.dosage,
      notes: item.efficacy ? (TEXTS.efficacyNotePrefix + item.efficacy) : this.data.notes,
      medicineSuggestions: [],
      showSuggestions: false
    })
  },

  hideSuggestions: function() {
    var that = this
    setTimeout(function() {
      that.setData({ showSuggestions: false })
    }, 150)
  },

  onFrequencyChange: function(e) {
    var freq = parseInt(e.currentTarget.dataset.freq, 10)
    var defaultTimes = DEFAULT_TIMES[freq] || DEFAULT_TIMES[3]
    this.setData({
      frequency: freq,
      timeSlots: defaultTimes
    })
  },

  onTimeChange: function(e) {
    var index = e.currentTarget.dataset.index
    var time = e.detail.value
    var timeSlots = this.data.timeSlots.slice()
    timeSlots[index] = time
    this.setData({ timeSlots: timeSlots })
  },

  onCycleTypeChange: function(e) {
    var cycleType = e.currentTarget.dataset.type
    if (CYCLE_TYPES.indexOf(cycleType) === -1) {
      cycleType = 'day'
    }

    this.setData({ cycleType: cycleType })
    this.updateCycleSummary()
  },

  onWeekDayToggle: function(e) {
    var value = parseInt(e.currentTarget.dataset.value, 10)
    var weekOptions = this.data.weekOptions.slice()

    for (var i = 0; i < weekOptions.length; i++) {
      if (weekOptions[i].value === value) {
        weekOptions[i] = {
          value: weekOptions[i].value,
          label: weekOptions[i].label,
          checked: !weekOptions[i].checked
        }
        break
      }
    }

    this.setData({ weekOptions: weekOptions })
    this.updateCycleSummary()
  },

  onMonthDayToggle: function(e) {
    var value = parseInt(e.currentTarget.dataset.value, 10)
    var monthOptions = this.data.monthOptions.slice()

    for (var i = 0; i < monthOptions.length; i++) {
      if (monthOptions[i].value === value) {
        monthOptions[i] = {
          value: monthOptions[i].value,
          label: monthOptions[i].label,
          checked: !monthOptions[i].checked
        }
        break
      }
    }

    this.setData({ monthOptions: monthOptions })
    this.updateCycleSummary()
  },

  getSelectedCycleDetail: function() {
    var cycleType = this.data.cycleType

    if (cycleType === 'week') {
      return this.data.weekOptions
        .filter(function(item) { return item.checked })
        .map(function(item) { return item.value })
    }

    if (cycleType === 'month') {
      return this.data.monthOptions
        .filter(function(item) { return item.checked })
        .map(function(item) { return item.value })
    }

    return []
  },

  updateCycleSummary: function() {
    var cycleType = this.data.cycleType
    var cycleDetail = medicationUtils.normalizeCycleDetail(cycleType, this.getSelectedCycleDetail())
    var cycleSummary = medicationUtils.formatCycleText({
      cycle_type: cycleType,
      cycle_detail: cycleDetail
    })

    this.setData({ cycleSummary: cycleSummary })
  },

  validateForm: function() {
    if (!this.data.med_name.trim()) {
      wx.showToast({ title: TEXTS.enterMedicineName, icon: 'none' })
      return false
    }

    if (!this.data.dosage.trim()) {
      wx.showToast({ title: TEXTS.enterDosage, icon: 'none' })
      return false
    }

    var cycleType = this.data.cycleType
    var cycleDetail = medicationUtils.normalizeCycleDetail(cycleType, this.getSelectedCycleDetail())

    if (cycleType !== 'day' && cycleDetail.length === 0) {
      wx.showToast({
        title: cycleType === 'week' ? TEXTS.chooseWeekday : TEXTS.chooseMonthday,
        icon: 'none'
      })
      return false
    }

    return true
  },

  onSubmit: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}
    if (!this.validateForm()) {
      return
    }
    var med_name = this.data.med_name.trim()
    var dosage = this.data.dosage.trim()
    var notes = this.data.notes.trim()
    var frequency = this.data.frequency
    var timeSlots = this.data.timeSlots.slice().sort()
    var cycleType = this.data.cycleType
    var cycleDetail = medicationUtils.normalizeCycleDetail(cycleType, this.getSelectedCycleDetail())
    var savePlan = function() {
      wx.showLoading({ title: TEXTS.saving })
      db.collection('medication_plans')
        .add({
          data: {
            patientOpenid: userInfo.openid || '',
            med_name: med_name,
            dosage: dosage,
            notes: notes,
            frequency: frequency,
            timeSlots: timeSlots,
            cycle_type: cycleType,
            cycle_detail: cycleDetail,
            status: 1,
            createTime: db.serverDate()
          }
        })
        .then(function() {
          wx.hideLoading()
          wx.showToast({ title: TEXTS.addSuccess, icon: 'success' })
          setTimeout(function() {
            wx.navigateBack()
          }, 1500)
        })
        .catch(function(err) {
          wx.hideLoading()
          console.error(TEXTS.saveFailed + ':', err)
          wx.showToast({ title: TEXTS.saveFailed, icon: 'none' })
        })
    }
    that.requestSubscribe(savePlan)
  },

  requestSubscribe: function(afterSubscribe) {
    var templateId = messageConfig.SUBSCRIBE_TEMPLATE_ID
    if (!templateId || templateId === 'YOUR_TEMPLATE_ID') {
      wx.showToast({ title: TEXTS.configTemplateFirst, icon: 'none' })
      if (typeof afterSubscribe === 'function') {
        afterSubscribe()
      }
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      complete: function() {
        if (typeof afterSubscribe === 'function') {
          afterSubscribe()
        }
      },
      fail: function(err) {
        console.error(TEXTS.subscribeFailed, err)
      }
    })
  }
})
