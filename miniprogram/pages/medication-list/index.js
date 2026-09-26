const db = wx.cloud.database()
const medicationUtils = require('../../utils/medication')

Page({
  data: {
    scheduleList: [],
    todayDate: '',
    patientOpenid: ''
  },

  onLoad: function(options) {
    this.setTodayDate()
    if (options && options.patientOpenid) {
      this.setData({ patientOpenid: options.patientOpenid })
    }
  },

  onShow: function() {
    this.fetchData()
  },

  setTodayDate: function() {
    var now = medicationUtils.chinaNow()
    var year = now.getFullYear()
    var month = (now.getMonth() + 1).toString().padStart(2, '0')
    var day = now.getDate().toString().padStart(2, '0')
    var weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    var weekDay = weekDays[now.getDay()]

    this.setData({
      todayDate: year + '-' + month + '-' + day + ' ' + weekDay
    })
  },

  getTodayStr: function() {
    return medicationUtils.formatDate(medicationUtils.chinaNow())
  },

  fetchData: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}
    // 家属查看患者时用页面参数，患者本人用登录态 openid；不能留空 ——
    // generateDailyTasks 对空 openid 会直接返回空列表（避免拉到全库计划/记录）。
    var patientOpenid = this.data.patientOpenid || userInfo.openid || ''
    this.setData({ patientOpenid: patientOpenid })
    wx.showLoading({ title: '加载中...' })

    medicationUtils.generateDailyTasks(new Date(), {
      patientOpenid: patientOpenid
    }).then(function(tasks) {
      that.setData({ scheduleList: tasks })
      wx.hideLoading()
    }).catch(function(err) {
      wx.hideLoading()
      console.error('获取任务失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  onTake: function(e) {
    var that = this
    var item = e.currentTarget.dataset.item
    var userInfo = wx.getStorageSync('userInfo') || {}

    // 记录归属：优先列表项自带，其次当前查看的患者，最后登录态
    var ownerOpenid = item.patientOpenid || this.data.patientOpenid || userInfo.openid || ''

    wx.showLoading({ title: '记录中...' })

    var now = medicationUtils.chinaNow()
    var takenTime = now.getHours().toString().padStart(2, '0') + ':' +
      now.getMinutes().toString().padStart(2, '0')

    db.collection('med_records').add({
      data: {
        patientOpenid: ownerOpenid,
        plan_id: item.plan_id,
        med_name: item.med_name,
        date: that.getTodayStr(),
        time_slot: item.time_slot,
        scheduled_time: item.scheduled_time,
        status: 'taken',
        taken_time: takenTime,
        create_time: db.serverDate()
      }
    }).then(function() {
      wx.hideLoading()
      wx.showToast({ title: '服药成功', icon: 'success' })
      that.fetchData()
    }).catch(function(err) {
      wx.hideLoading()
      console.error('服药打卡失败:', err)
      wx.showToast({ title: '记录失败', icon: 'none' })
    })
  },

  onSupplement: function(e) {
    var that = this
    var item = e.currentTarget.dataset.item

    wx.showModal({
      title: '补服确认',
      content: '确认补服 ' + item.med_name + ' 吗？',
      confirmText: '确认补服',
      confirmColor: '#07C160',
      success: function(res) {
        if (res.confirm) {
          that.doSupplement(item)
        }
      }
    })
  },

  doSupplement: function(item) {
    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}
    var ownerOpenid = item.patientOpenid || this.data.patientOpenid || userInfo.openid || ''
    wx.showLoading({ title: '记录中...' })

    var now = medicationUtils.chinaNow()
    var supplementTime = now.getHours().toString().padStart(2, '0') + ':' +
      now.getMinutes().toString().padStart(2, '0')

    db.collection('med_records').add({
      data: {
        patientOpenid: ownerOpenid,
        plan_id: item.plan_id,
        med_name: item.med_name,
        date: that.getTodayStr(),
        time_slot: item.time_slot,
        scheduled_time: item.scheduled_time,
        status: 'supplement',
        supplement_time: supplementTime,
        create_time: db.serverDate()
      }
    }).then(function() {
      wx.hideLoading()
      wx.showToast({ title: '补服成功', icon: 'success' })
      that.fetchData()
    }).catch(function(err) {
      wx.hideLoading()
      console.error('补服失败:', err)
      wx.showToast({ title: '记录失败', icon: 'none' })
    })
  },

  onDeletePlan: function(e) {
    var that = this
    var planId = e.currentTarget.dataset.id
    var medName = e.currentTarget.dataset.name || '该用药计划'

    wx.showModal({
      title: '删除计划',
      content: '确定删除“' + medName + '”吗？删除后相关服药记录也会一并清除。',
      confirmText: '删除',
      confirmColor: '#E57373',
      success: function(res) {
        if (!res.confirm) {
          return
        }

        that.deletePlan(planId)
      }
    })
  },

  deletePlan: function(planId) {
    var that = this

    wx.showLoading({ title: '删除中...' })

    Promise.all([
      db.collection('medication_plans').doc(planId).remove(),
      db.collection('med_records').where({
        plan_id: planId
      }).remove()
    ]).then(function() {
      wx.hideLoading()
      wx.showToast({ title: '删除成功', icon: 'success' })
      that.fetchData()
    }).catch(function(err) {
      wx.hideLoading()
      console.error('删除用药计划失败:', err)
      wx.showToast({ title: '删除失败', icon: 'none' })
    })
  },

  goToAdd: function() {
    wx.navigateTo({
      url: '/pages/medication-add/index'
    })
  },

  goToDetail: function(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/medication-detail/index?id=' + id
    })
  }
})
