const db = wx.cloud.database()
const tabBarUtils = require('../../utils/tabbar')

Page({
  data: {
    userInfo: {
      avatarUrl: '/images/icons/avatar.png',
      nickName: '用户'
    },
    userId: '',
    openid: '',
    role: '',
    pendingCount: 0,
    myRequestCount: 0,
    patientIdInput: ''
  },

  onLoad: function() {
    this.getUserId()
    this.loadUserInfo()
    this.loadUserRole()
  },

  onShow: function() {
    tabBarUtils.setTabBar(this, 2)
    this.loadUserRole()

    var userInfo = wx.getStorageSync('userInfo')
    if (userInfo && userInfo.role === 'patient') {
      this.fetchPendingCount()
    } else if (userInfo && userInfo.role === 'family') {
      this.fetchMyRequestCount()
    }
  },

  loadUserRole: function() {
    var userInfo = wx.getStorageSync('userInfo')
    if (userInfo && userInfo.role) {
      this.setData({ role: userInfo.role })
    }
  },

  onCopyId: function() {
    var openid = this.data.openid
    if (!openid) {
      wx.showToast({
        title: 'ID 获取中，请稍后',
        icon: 'none'
      })
      return
    }

    wx.setClipboardData({
      data: openid,
      success: function() {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        })
      }
    })
  },

  onPatientIdInput: function(e) {
    this.setData({ patientIdInput: e.detail.value })
  },

  goToBindWithId: function() {
    var patientId = this.data.patientIdInput.trim()
    if (!patientId) {
      wx.showToast({
        title: '请先粘贴患者ID',
        icon: 'none'
      })
      return
    }
    wx.navigateTo({
      url: '/pages/bind-patient/index?patientId=' + encodeURIComponent(patientId)
    })
  },

  fetchPendingCount: function() {
    var that = this
    wx.cloud.callFunction({
      name: 'getBindingRequests',
      data: { status: 0 }
    }).then(function(res) {
      if (res.result && res.result.success) {
        that.setData({
          pendingCount: res.result.pendingCount || 0
        })
      }
    }).catch(function(err) {
      console.error('获取申请数量失败:', err)
    })
  },

  fetchMyRequestCount: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}

    db.collection('binding_requests')
      .where({
        familyOpenid: userInfo.openid,
        status: 0
      })
      .count()
      .then(function(res) {
        that.setData({
          myRequestCount: res.total || 0
        })
      })
      .catch(function(err) {
        console.error('获取申请数量失败:', err)
      })
  },

  getUserId: function() {
    var that = this
    wx.cloud.callFunction({
      name: 'getOpenId'
    }).then(function(res) {
      if (res.result && res.result.openid) {
        var openid = res.result.openid
        that.setData({
          userId: openid.substring(0, 8).toUpperCase(),
          openid: openid
        })
      }
    }).catch(function() {
      var randomId = 'U' + Math.random().toString(36).substr(2, 7).toUpperCase()
      that.setData({ userId: randomId })
    })
  },

  loadUserInfo: function() {
    var that = this
    db.collection('users').limit(1).get().then(function(res) {
      if (res.data.length > 0) {
        var userData = res.data[0]
        that.setData({
          userInfo: {
            avatarUrl: userData.avatarUrl || '/images/icons/avatar.png',
            nickName: userData.nickName || '用户'
          },
          userDocId: userData._id
        })
      }
    }).catch(function(err) {
      console.log('获取用户信息失败', err)
    })
  },

  onAvatarTap: function() {
    var that = this
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入新昵称',
      content: this.data.userInfo.nickName === '用户' ? '' : this.data.userInfo.nickName,
      success: function(res) {
        if (res.confirm && res.content) {
          var newNickName = res.content.trim()
          if (!newNickName) {
            wx.showToast({ title: '昵称不能为空', icon: 'none' })
            return
          }
          if (newNickName.length > 12) {
            wx.showToast({ title: '昵称最多12个字', icon: 'none' })
            return
          }
          that.updateNickName(newNickName)
        }
      }
    })
  },

  updateNickName: function(nickName) {
    var that = this
    wx.showLoading({ title: '保存中...', mask: true })

    if (this.data.userDocId) {
      db.collection('users').doc(this.data.userDocId).update({
        data: {
          nickName: nickName,
          updateTime: db.serverDate()
        }
      }).then(function() {
        wx.hideLoading()
        that.setData({
          'userInfo.nickName': nickName
        })
        wx.showToast({ title: '修改成功', icon: 'success' })
      }).catch(function(err) {
        wx.hideLoading()
        console.error('更新昵称失败', err)
        wx.showToast({ title: '修改失败', icon: 'none' })
      })
    } else {
      db.collection('users').add({
        data: {
          nickName: nickName,
          avatarUrl: '/images/icons/avatar.png',
          openid: this.data.openid,
          createTime: db.serverDate()
        }
      }).then(function(res) {
        wx.hideLoading()
        that.setData({
          'userInfo.nickName': nickName,
          userDocId: res._id
        })
        wx.showToast({ title: '修改成功', icon: 'success' })
      }).catch(function(err) {
        wx.hideLoading()
        console.error('创建用户失败', err)
        wx.showToast({ title: '修改失败', icon: 'none' })
      })
    }
  },

  goToFamily: function() {
    wx.navigateTo({ url: '/pages/family-list/index' })
  },

  goToMyPatients: function() {
    wx.navigateTo({ url: '/pages/my-patients/index' })
  },

  goToReport: function() {
    if (this.data.role === 'family') {
      wx.navigateTo({ url: '/pages/select-patient/index?target=report' })
    } else {
      wx.navigateTo({ url: '/pages/report/index' })
    }
  },

  goToMessageCenter: function() {
    wx.navigateTo({ url: '/pages/message-center/index' })
  },

  goToMyRequests: function() {
    wx.navigateTo({ url: '/pages/my-requests/index' })
  },

  showAbout: function() {
    wx.showModal({
      title: '关于康养日记',
      content: '本作品是一款面向慢病管理与家庭协同照护的小程序，提供用药提醒、健康监测、家属监管和健康百科等服务。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  onLogout: function() {
    wx.showModal({
      title: '退出确认',
      content: '确定要退出登录吗？',
      confirmText: '确认退出',
      confirmColor: '#E53935',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ title: '退出中...', mask: true })
          wx.removeStorageSync('userInfo')
          setTimeout(function() {
            wx.hideLoading()
            wx.reLaunch({
              url: '/pages/login/index'
            })
          }, 500)
        }
      }
    })
  }
})
