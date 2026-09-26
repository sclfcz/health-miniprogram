const db = wx.cloud.database()
const medicationUtils = require('../../utils/medication')
const tabBarUtils = require('../../utils/tabbar')

Page({
  data: {
    latestData: null,
    hasFamily: false,
    firstFamilyPhone: '',
    pendingCount: 0,
    role: '',
    patientList: [],
    todayTasks: [],
    loading: true
  },

  onLoad: function() {
    var userInfo = wx.getStorageSync('userInfo')
    if (userInfo && userInfo.role) {
      this.setData({ role: userInfo.role })
    }
  },

  onShow: function() {
    tabBarUtils.setTabBar(this, 0)
    this.checkLogin()

    var userInfo = wx.getStorageSync('userInfo')
    if (!userInfo || !userInfo.role) {
      return
    }

    this.setData({ role: userInfo.role })

    if (userInfo.role === 'patient') {
      this.fetchLatestData()
      this.checkFamily()
      this.fetchPendingRequests()
      this.fetchTodayTasks()
    } else if (userInfo.role === 'family') {
      this.fetchPatientList()
    }
  },

  fetchPendingRequests: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo')

    if (!userInfo || userInfo.role !== 'patient') {
      return
    }

    wx.cloud.callFunction({
      name: 'getBindingRequests',
      data: { status: 0 }
    }).then(function(res) {
      if (res.result.success) {
        that.setData({
          pendingCount: res.result.pendingCount || 0
        })
      }
    }).catch(function(err) {
      console.error('获取申请数量失败:', err)
    })
  },

  checkLogin: function() {
    var userInfo = wx.getStorageSync('userInfo')
    if (!userInfo || !userInfo.openid) {
      wx.redirectTo({
        url: '/pages/login/index'
      })
    }
  },

  fetchLatestData: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}
    var query = db.collection('health_metrics')

    if (userInfo.openid || userInfo.patientOpenid) {
      query = query.where({
        patientOpenid: userInfo.openid || userInfo.patientOpenid
      })
    }

    query
      .orderBy('create_time', 'desc')
      .limit(1)
      .get()
      .then(function(res) {
        if (res.data.length > 0) {
          that.setData({ latestData: res.data[0] })
        } else {
          that.setData({ latestData: null })
        }
      })
      .catch(function(err) {
        console.error('获取数据失败', err)
      })
  },

  fetchTodayTasks: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}

    medicationUtils.generateDailyTasks(new Date(), {
      patientOpenid: userInfo.openid || ''
    }).then(function(tasks) {
      that.setData({
        todayTasks: tasks.slice(0, 5)
      })
    }).catch(function(err) {
      console.error('获取今日任务失败:', err)
      that.setData({ todayTasks: [] })
    })
  },

  checkFamily: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}

    that.setData({ hasFamily: true, firstFamilyPhone: '' })

    db.collection('family_relations')
      .where({
        patientOpenid: userInfo.openid,
        status: 1
      })
      .limit(1)
      .get()
      .then(function(res) {
        if (res.data.length > 0) {
          that.setData({
            hasFamily: true,
            firstFamilyPhone: res.data[0].familyPhone || ''
          })
        } else {
          that.setData({
            hasFamily: true,
            firstFamilyPhone: ''
          })
        }
      })
      .catch(function(err) {
        console.error('获取家属失败', err)
        that.setData({ hasFamily: true, firstFamilyPhone: '' })
      })
  },

  onEmergencyCall: function() {
    var phone = this.data.firstFamilyPhone

    if (!phone) {
      wx.showModal({
        title: '紧急呼叫',
        content: '您还未绑定家属，是否前往添加家属？',
        confirmText: '去添加',
        cancelText: '取消',
        success: function(res) {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/family-list/index'
            })
          }
        }
      })
      return
    }

    wx.showModal({
      title: '紧急呼叫',
      content: '即将拨打家属电话：' + phone,
      confirmText: '立即拨打',
      confirmColor: '#E53935',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          wx.makePhoneCall({
            phoneNumber: phone,
            fail: function(err) {
              console.error('拨打失败', err)
              wx.showToast({
                title: '拨打失败',
                icon: 'none'
              })
            }
          })
        }
      }
    })
  },

  fetchPatientList: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}

    this.setData({ loading: true })

    db.collection('family_relations')
      .where({
        familyOpenid: userInfo.openid,
        status: 1
      })
      .get()
      .then(function(res) {
        var list = (res.data || []).sort(function(a, b) {
          return String(b.createTime || b.updateTime || '').localeCompare(String(a.createTime || a.updateTime || ''))
        })
        that.setData({
          patientList: list,
          loading: false
        })
      })
      .catch(function(err) {
        console.error('获取患者列表失败:', err)
        that.setData({ loading: false })
      })
  },

  viewPatientDetail: function(e) {
    var patientOpenid = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/patient-detail/index?openid=' + patientOpenid
    })
  },

  goToMedication: function() {
    wx.navigateTo({ url: '/pages/medication-list/index' })
  },

  goToHealth: function() {
    wx.navigateTo({ url: '/pages/health-list/index' })
  },

  goToMessageCenter: function() {
    wx.navigateTo({ url: '/pages/message-center/index' })
  },

  goToBindPatient: function() {
    wx.navigateTo({ url: '/pages/bind-patient/index' })
  }
})
