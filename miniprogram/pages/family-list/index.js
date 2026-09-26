const db = wx.cloud.database()

Page({
  data: {
    familyList: [],
    callingId: ''
  },

  onShow: function() {
    this.fetchData()
  },

  fetchData: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo')
    
    wx.showLoading({ title: '加载中...' })

    db.collection('family_relations')
      .where({
        patientOpenid: userInfo.openid,
        status: 1
      })
      .get()
      .then(function(res) {
        that.setData({ familyList: res.data })
        wx.hideLoading()
      })
      .catch(function(err) {
        wx.hideLoading()
        console.error('获取数据失败', err)
        // 集合不存在时显示空列表，不报错
        that.setData({ familyList: [] })
      })
  },

  makePhoneCall: function(e) {
    var that = this
    var phone = e.currentTarget.dataset.phone
    var itemId = e.currentTarget.dataset.id

    if (!phone) {
      wx.showToast({ title: '电话号码不存在', icon: 'none' })
      return
    }

    this.setData({ callingId: itemId })

    setTimeout(function() {
      that.setData({ callingId: '' })
      wx.makePhoneCall({
        phoneNumber: phone,
        fail: function(err) {
          if (err.errMsg.indexOf('cancel') === -1) {
            console.error('拨打电话失败', err)
          }
        }
      })
    }, 800)
  },

  onEdit: function(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/family-edit/index?id=' + id
    })
  },

  goToAdd: function() {
    wx.navigateTo({
      url: '/pages/family-edit/index'
    })
  },

  onDelete: function(e) {
    var that = this
    var id = e.currentTarget.dataset.id
    var name = e.currentTarget.dataset.name

    wx.showModal({
      title: '删除确认',
      content: '确定要删除家属"' + name + '"吗？',
      confirmText: '确认删除',
      confirmColor: '#E53935',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          that.doDelete(id)
        }
      }
    })
  },

  doDelete: function(id) {
    var that = this
    wx.showLoading({ title: '删除中...', mask: true })

    db.collection('family_relations')
      .doc(id)
      .remove()
      .then(function(res) {
        wx.hideLoading()
        wx.showToast({ title: '删除成功', icon: 'success' })
        that.fetchData()
      })
      .catch(function(err) {
        wx.hideLoading()
        console.error('删除失败:', err)
        if (err.errMsg && err.errMsg.indexOf('permission') !== -1) {
          wx.showToast({ title: '无权限删除', icon: 'none' })
        } else {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      })
  }
})
