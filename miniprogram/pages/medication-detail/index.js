const db = wx.cloud.database()
const medicationUtils = require('../../utils/medication')
const messageConfig = require('../../config/message')

var TEXTS = {
  dosageLabel: '\u7528\u836f\u5242\u91cf',
  frequencyLabel: '\u6bcf\u65e5\u6b21\u6570',
  frequencySuffix: '\u6b21',
  cycleLabel: '\u6267\u884c\u5468\u671f',
  timeLabel: '\u670d\u836f\u65f6\u95f4',
  notesLabel: '\u5907\u6ce8\u4fe1\u606f',
  todayRecordTitle: '\u4eca\u65e5\u670d\u836f\u8bb0\u5f55',
  noNeedToday: '\u4eca\u5929\u8be5\u8ba1\u5212\u65e0\u9700\u6267\u884c',
  timePrefix: '\u7b2c',
  pending: '\u5f85\u670d\u836f',
  missed: '\u6f0f\u670d',
  supplementPrefix: '\u8865\u670d',
  takeNow: '\u7acb\u5373\u670d\u836f',
  supplementMissed: '\u8865\u670d\u6f0f\u670d\u8bb0\u5f55',
  deletePlan: '\u5220\u9664\u7528\u836f\u8ba1\u5212',
  selectSupplementRecord: '\u9009\u62e9\u8865\u670d\u8bb0\u5f55',
  cancel: '\u53d6\u6d88',
  loading: '\u52a0\u8f7d\u4e2d...',
  fetchDetailFailed: '\u83b7\u53d6\u8be6\u60c5\u5931\u8d25',
  loadFailed: '\u52a0\u8f7d\u5931\u8d25',
  separator: '\u3001',
  fetchRecordFailed: '\u83b7\u53d6\u8bb0\u5f55\u5931\u8d25',
  slotAlreadyRecorded: '\u8be5\u65f6\u6bb5\u5df2\u8bb0\u5f55',
  recording: '\u8bb0\u5f55\u4e2d...',
  takeSuccess: '\u670d\u836f\u6210\u529f',
  takeFailed: '\u670d\u836f\u6253\u5361\u5931\u8d25',
  recordFailed: '\u8bb0\u5f55\u5931\u8d25',
  supplementSuccess: '\u8865\u670d\u6210\u529f',
  supplementFailed: '\u8865\u670d\u5931\u8d25',
  defaultPlanName: '\u8be5\u7528\u836f\u8ba1\u5212',
  deleteTitle: '\u5220\u9664\u8ba1\u5212',
  deleteContentPrefix: '\u786e\u5b9a\u5220\u9664\u201c',
  deleteContentSuffix: '\u201d\u5417\uff1f\u5220\u9664\u540e\u76f8\u5173\u670d\u836f\u8bb0\u5f55\u4e5f\u4f1a\u4e00\u5e76\u6e05\u9664\u3002',
  deleteConfirm: '\u5220\u9664',
  deleting: '\u5220\u9664\u4e2d...',
  deleteSuccess: '\u5220\u9664\u6210\u529f',
  deleteFailed: '\u5220\u9664\u5931\u8d25',
  deletePlanFailed: '\u5220\u9664\u7528\u836f\u8ba1\u5212\u5931\u8d25'
}

Page({
  data: {
    texts: TEXTS,
    medId: '',
    medInfo: {},
    timeSlotsStr: '',
    cycleText: '',
    todayRecords: [],
    canTakeNow: false,
    hasMissed: false,
    missedRecords: [],
    showSupplementModal: false
  },

  onLoad: function(options) {
    if (options.id) {
      this.setData({ medId: options.id })
      this.fetchDetail(options.id)
    }
  },

  onShow: function() {
    if (this.data.medId) {
      this.fetchRecords()
    }
  },

  fetchDetail: function(id) {
    var that = this
    wx.showLoading({ title: TEXTS.loading })

    db.collection('medication_plans').doc(id).get().then(function(res) {
      var medInfo = res.data || {}
      var timeSlots = medicationUtils.getPlanTimeSlots(medInfo)

      that.setData({
        medInfo: medInfo,
        timeSlotsStr: timeSlots.join(TEXTS.separator),
        cycleText: medicationUtils.formatCycleText(medInfo)
      })

      that.fetchRecords()
    }).catch(function(err) {
      wx.hideLoading()
      console.error(TEXTS.fetchDetailFailed, err)
      wx.showToast({ title: TEXTS.loadFailed, icon: 'none' })
    })
  },

  getTodayStr: function() {
    return medicationUtils.formatDate(medicationUtils.chinaNow())
  },

  getCurrentTime: function() {
    var now = medicationUtils.chinaNow()
    var hours = now.getHours().toString().padStart(2, '0')
    var minutes = now.getMinutes().toString().padStart(2, '0')
    return hours + ':' + minutes
  },

  timeToMinutes: function(timeStr) {
    return medicationUtils.timeToMinutes(timeStr)
  },

  fetchRecords: function() {
    var that = this
    var todayStr = this.getTodayStr()
    var medId = this.data.medId

    db.collection('med_records')
      .where({
        plan_id: medId,
        date: todayStr
      })
      .get()
      .then(function(res) {
        that.buildTodayRecords(res.data || [])
        wx.hideLoading()
      })
      .catch(function(err) {
        wx.hideLoading()
        console.error(TEXTS.fetchRecordFailed, err)
      })
  },

  buildTodayRecords: function(records) {
    var timeSlots = medicationUtils.getPlanTimeSlots(this.data.medInfo)
    var currentTime = this.getCurrentTime()
    var nowMinutes = this.timeToMinutes(currentTime)
    var todayRecords = []
    var canTakeNow = false
    var hasMissed = false
    var missedRecords = []

    if (!medicationUtils.isPlanScheduledForDate(this.data.medInfo, new Date())) {
      this.setData({
        todayRecords: [],
        canTakeNow: false,
        hasMissed: false,
        missedRecords: []
      })
      return
    }

    for (var i = 0; i < timeSlots.length; i++) {
      var scheduledTime = timeSlots[i]
      var scheduledMinutes = this.timeToMinutes(scheduledTime)
      var record = null

      for (var j = 0; j < records.length; j++) {
        if (records[j].time_slot === i) {
          record = records[j]
          break
        }
      }

      var status = 'pending'
      var takenTime = ''
      var supplementTime = ''

      if (record) {
        status = record.status
        takenTime = record.taken_time || ''
        supplementTime = record.supplement_time || ''
      } else if (nowMinutes >= scheduledMinutes + messageConfig.MISSED_GRACE_MINUTES) {
        status = 'missed'
        hasMissed = true
        missedRecords.push({
          time_slot: i,
          scheduled_time: scheduledTime
        })
      } else if (nowMinutes >= scheduledMinutes) {
        canTakeNow = true
      }

      todayRecords.push({
        time_slot: i,
        scheduled_time: scheduledTime,
        status: status,
        taken_time: takenTime,
        supplement_time: supplementTime
      })
    }

    this.setData({
      todayRecords: todayRecords,
      canTakeNow: canTakeNow,
      hasMissed: hasMissed,
      missedRecords: missedRecords
    })
  },

  onTakeNow: function() {
    var that = this
    var currentTime = this.getCurrentTime()
    var timeSlots = medicationUtils.getPlanTimeSlots(this.data.medInfo)
    var nowMinutes = this.timeToMinutes(currentTime)
    var targetSlot = 0
    var minDiff = 9999

    for (var i = 0; i < timeSlots.length; i++) {
      var slotMinutes = this.timeToMinutes(timeSlots[i])
      var diff = Math.abs(nowMinutes - slotMinutes)
      if (diff < minDiff) {
        minDiff = diff
        targetSlot = i
      }
    }

    var records = this.data.todayRecords
    if (records[targetSlot] && records[targetSlot].status !== 'pending') {
      wx.showToast({ title: TEXTS.slotAlreadyRecorded, icon: 'none' })
      return
    }

    wx.showLoading({ title: TEXTS.recording })

    db.collection('med_records').add({
      data: {
        patientOpenid: that.data.medInfo.patientOpenid || '',
        plan_id: that.data.medId,
        med_name: that.data.medInfo.med_name,
        date: that.getTodayStr(),
        time_slot: targetSlot,
        scheduled_time: timeSlots[targetSlot],
        status: 'taken',
        taken_time: currentTime,
        create_time: db.serverDate()
      }
    }).then(function() {
      wx.hideLoading()
      wx.showToast({ title: TEXTS.takeSuccess, icon: 'success' })
      that.fetchRecords()
    }).catch(function(err) {
      wx.hideLoading()
      console.error(TEXTS.takeFailed, err)
      wx.showToast({ title: TEXTS.recordFailed, icon: 'none' })
    })
  },

  onSupplementSelect: function() {
    this.setData({ showSupplementModal: true })
  },

  closeSupplementModal: function() {
    this.setData({ showSupplementModal: false })
  },

  doSupplement: function(e) {
    var that = this
    var item = e.currentTarget.dataset.item

    wx.showLoading({ title: TEXTS.recording })

    var now = medicationUtils.chinaNow()
    var supplementTime = now.getHours().toString().padStart(2, '0') + ':' +
      now.getMinutes().toString().padStart(2, '0')

    db.collection('med_records').add({
      data: {
        patientOpenid: that.data.medInfo.patientOpenid || '',
        plan_id: that.data.medId,
        med_name: that.data.medInfo.med_name,
        date: that.getTodayStr(),
        time_slot: item.time_slot,
        scheduled_time: item.scheduled_time,
        status: 'supplement',
        supplement_time: supplementTime,
        create_time: db.serverDate()
      }
    }).then(function() {
      wx.hideLoading()
      that.setData({ showSupplementModal: false })
      wx.showToast({ title: TEXTS.supplementSuccess, icon: 'success' })
      that.fetchRecords()
    }).catch(function(err) {
      wx.hideLoading()
      console.error(TEXTS.supplementFailed, err)
      wx.showToast({ title: TEXTS.recordFailed, icon: 'none' })
    })
  },

  onDeletePlan: function() {
    var that = this
    var medName = this.data.medInfo.med_name || TEXTS.defaultPlanName

    wx.showModal({
      title: TEXTS.deleteTitle,
      content: TEXTS.deleteContentPrefix + medName + TEXTS.deleteContentSuffix,
      confirmText: TEXTS.deleteConfirm,
      confirmColor: '#E57373',
      success: function(res) {
        if (!res.confirm) {
          return
        }

        that.deletePlan()
      }
    })
  },

  deletePlan: function() {
    var planId = this.data.medId

    if (!planId) {
      return
    }

    wx.showLoading({ title: TEXTS.deleting })

    Promise.all([
      db.collection('medication_plans').doc(planId).remove(),
      db.collection('med_records').where({
        plan_id: planId
      }).remove()
    ]).then(function() {
      wx.hideLoading()
      wx.showToast({ title: TEXTS.deleteSuccess, icon: 'success' })

      setTimeout(function() {
        wx.navigateBack()
      }, 500)
    }).catch(function(err) {
      wx.hideLoading()
      console.error(TEXTS.deletePlanFailed, err)
      wx.showToast({ title: TEXTS.deleteFailed, icon: 'none' })
    })
  }
})
