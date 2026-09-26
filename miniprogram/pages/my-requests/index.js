const db = wx.cloud.database()

Page({
  data: {
    requestList: [],
    loading: true
  },

  onLoad: function() {
    this.fetchRequests()
  },

  onShow: function() {
    this.fetchRequests()
  },

  // 获取我发起的申请列表
  fetchRequests: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo')
    
    this.setData({ loading: true })

    db.collection('binding_requests')
      .where({
        familyOpenid: userInfo.openid
      })
      .orderBy('createTime', 'desc')
      .get()
      .then(function(res) {
        var list = res.data.map(function(item) {
          return {
            _id: item._id,
            patientOpenid: item.patientOpenid,
            patientName: item.patientName || '未知',
            relation: item.relation || '未知',
            remark: item.remark || '',
            status: item.status,
            createTimeStr: that.formatTime(item.createTime)
          }
        })
        that.setData({
          requestList: list,
          loading: false
        })
      })
      .catch(function(err) {
        console.error('获取申请列表失败:', err)
        that.setData({ loading: false })
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      })
  },

  // 重新申请
  onReapply: function(e) {
    var patientOpenid = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/bind-patient/index?patientId=' + encodeURIComponent(patientOpenid)
    })
  },

  // 格式化时间
  formatTime: function(time) {
    if (!time) return ''
    
    var date
    if (typeof time === 'string') {
      date = new Date(time)
    } else if (time instanceof Date) {
      date = time
    } else {
      date = new Date(time)
    }
    
    var year = date.getFullYear()
    var month = (date.getMonth() + 1).toString().padStart(2, '0')
    var day = date.getDate().toString().padStart(2, '0')
    var hour = date.getHours().toString().padStart(2, '0')
    var minute = date.getMinutes().toString().padStart(2, '0')
    
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute
  }
})
