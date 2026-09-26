const db = wx.cloud.database()

Page({
  data: {
    patientList: [],
    loading: true
  },

  onLoad: function() {
    this.fetchPatients()
  },

  onShow: function() {
    this.fetchPatients()
  },

  fetchPatients: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo')
    
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
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      })
  },

  viewDetail: function(e) {
    var patientOpenid = e.currentTarget.dataset.openid
    wx.navigateTo({
      url: '/pages/patient-detail/index?openid=' + patientOpenid
    })
  },

  viewHealth: function(e) {
    var patientOpenid = e.currentTarget.dataset.openid
    wx.navigateTo({
      url: '/pages/health-list/index?patientOpenid=' + patientOpenid
    })
  },

  viewMedication: function(e) {
    var patientOpenid = e.currentTarget.dataset.openid
    wx.navigateTo({
      url: '/pages/medication-list/index?patientOpenid=' + patientOpenid
    })
  },

  makeCall: function(e) {
    var phone = e.currentTarget.dataset.phone
    if (!phone) {
      wx.showToast({
        title: '暂无电话号码',
        icon: 'none'
      })
      return
    }
    wx.makePhoneCall({
      phoneNumber: phone
    })
  },

  goToBind: function() {
    wx.navigateBack()
  }
})
