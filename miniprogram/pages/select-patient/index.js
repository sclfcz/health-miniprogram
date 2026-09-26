const db = wx.cloud.database()

Page({
  data: {
    patientList: [],
    loading: true,
    target: ''  // 目标页面：report, health, medication
  },

  onLoad: function(options) {
    if (options.target) {
      this.setData({ target: options.target })
    }
    this.fetchPatients()
  },

  // 获取已绑定的患者列表
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
        that.setData({
          patientList: res.data,
          loading: false
        })
      })
      .catch(function(err) {
        console.error('获取患者列表失败:', err)
        that.setData({ loading: false })
      })
  },

  // 选择患者
  selectPatient: function(e) {
    var patientOpenid = e.currentTarget.dataset.openid
    var patientName = e.currentTarget.dataset.name
    var target = this.data.target

    // 根据目标跳转到对应页面
    if (target === 'report') {
      wx.redirectTo({
        url: '/pages/report/index?patientOpenid=' + patientOpenid + '&patientName=' + encodeURIComponent(patientName)
      })
    } else if (target === 'health') {
      wx.redirectTo({
        url: '/pages/health-list/index?patientOpenid=' + patientOpenid
      })
    } else if (target === 'medication') {
      wx.redirectTo({
        url: '/pages/medication-list/index?patientOpenid=' + patientOpenid
      })
    } else {
      wx.navigateBack()
    }
  }
})
