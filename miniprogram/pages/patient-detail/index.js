const db = wx.cloud.database()
const medicationUtils = require('../../utils/medication')
const messageConfig = require('../../config/message')

var TEXTS = {
  missingTemplateId: '请先配置提醒模板ID',
  subscribeAccepted: '已开启该患者漏服提醒',
  subscribeRejected: '你已取消授权，可稍后重新开启',
  subscribeFailed: '提醒授权失败',
  subscribeErrorLog: 'patient reminder subscribe failed:'
}

Page({
  data: {
    patientOpenid: '',
    patientName: '',
    relation: '',
    patientPhone: '',
    latestData: null,
    medList: []
  },

  onLoad: function(options) {
    if (options.openid) {
      this.setData({ patientOpenid: options.openid })
      // 先校验访问关系：以前 loadPatientInfo 只用来显示姓名，
      // 而 fetchLatestData 无条件按 URL 里的 openid 取健康数据 —— 构造链接即可越权读别人数据。
      this.loadPatientInfo()
        .then(function(canView) {
          if (!canView) {
            return
          }
          this.fetchLatestData()
          this.fetchMedList()
        }.bind(this))
    }
  },

  loadPatientInfo: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}

    // 本人查看自己：直接放行
    if (userInfo.openid && userInfo.openid === this.data.patientOpenid) {
      this.setData({ patientName: userInfo.name || '', relation: '本人' })
      return Promise.resolve(true)
    }

    return db.collection('family_relations')
      .where({
        familyOpenid: userInfo.openid,
        patientOpenid: this.data.patientOpenid,
        status: 1
      })
      .get()
      .then(function(res) {
        if (res.data.length > 0) {
          var relation = res.data[0]
          that.setData({
            patientName: relation.patientName,
            relation: relation.relation,
            patientPhone: relation.patientPhone || ''
          })
          return true
        }
        wx.showToast({ title: '无权查看该患者', icon: 'none' })
        return false
      })
      .catch(function() {
        return false
      })
  },

  fetchLatestData: function() {
    var that = this
    db.collection('health_metrics')
      .where({
        patientOpenid: this.data.patientOpenid
      })
      .get()
      .then(function(res) {
        if (res.data.length > 0) {
          var sorted = res.data.sort(function(a, b) {
            var timeA = a.measure_time || ''
            var timeB = b.measure_time || ''
            return timeB.localeCompare(timeA)
          })
          var data = sorted[0]
          that.setData({
            latestData: {
              systolic: data.systolic,
              diastolic: data.diastolic,
              sugar: data.sugar,
              weight: data.weight,
              measureTime: data.measure_time || that.formatTime(data.createTime || data.create_time)
            }
          })
        }
      })
  },

  fetchMedList: function() {
    var that = this

    medicationUtils.generateDailyTasks(new Date(), {
      patientOpenid: this.data.patientOpenid
    }).then(function(tasks) {
      that.setData({
        medList: tasks.map(function(item) {
          return {
            id: item.id,
            medicineName: item.med_name,
            timeSlot: item.scheduled_time,
            cycleText: item.cycleText,
            status: item.status === 'taken' || item.status === 'supplement' ? 'done' : 'pending'
          }
        })
      })
    }).catch(function(err) {
      console.error('获取用药情况失败:', err)
      that.setData({ medList: [] })
    })
  },

  makePhoneCall: function() {
    var phone = this.data.patientPhone

    if (!phone) {
      wx.showToast({
        title: '暂无患者电话',
        icon: 'none'
      })
      return
    }

    wx.makePhoneCall({
      phoneNumber: phone
    })
  },

  onEnablePatientReminder: function() {
    var templateId = messageConfig.REMINDER_TEMPLATE_ID || messageConfig.SUBSCRIBE_TEMPLATE_ID
    if (!templateId || templateId === 'YOUR_TEMPLATE_ID') {
      wx.showToast({
        title: TEXTS.missingTemplateId,
        icon: 'none'
      })
      return
    }

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: function(res) {
        var accepted = res && res[templateId] === 'accept'
        wx.showToast({
          title: accepted ? TEXTS.subscribeAccepted : TEXTS.subscribeRejected,
          icon: 'none'
        })
      },
      fail: function(err) {
        console.error(TEXTS.subscribeErrorLog, err)
        wx.showToast({
          title: TEXTS.subscribeFailed,
          icon: 'none'
        })
      }
    })
  },

  formatTime: function(time) {
    if (!time) return ''

    var date = time instanceof Date ? time : new Date(time)
    var month = (date.getMonth() + 1).toString().padStart(2, '0')
    var day = date.getDate().toString().padStart(2, '0')
    var hour = date.getHours().toString().padStart(2, '0')
    var minute = date.getMinutes().toString().padStart(2, '0')

    return month + '-' + day + ' ' + hour + ':' + minute
  }
})
