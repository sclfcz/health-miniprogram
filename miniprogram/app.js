// app.js
App({
  globalData: {
    env: "your-cloud-env-id",
    userInfo: null
  },

  onLaunch: function() {
    var that = this
    
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力")
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true
      })
    }

    // 检查登录状态
    this.checkLoginStatus()
  },

  // 检查登录状态
  checkLoginStatus: function() {
    var that = this
    
    // 先检查本地存储
    var userInfo = wx.getStorageSync('userInfo')
    if (userInfo && userInfo.openid) {
      this.globalData.userInfo = userInfo
      return
    }

    // 本地没有，调用云函数检查
    wx.cloud.callFunction({
      name: 'getOpenId'
    }).then(function(res) {
      var openid = res.result.openid
      that.checkUserExists(openid)
    }).catch(function(err) {
      console.error('获取 openid 失败:', err)
    })
  },

  // 检查用户是否已注册
  checkUserExists: function(openid) {
    var that = this
    var db = wx.cloud.database()

    // 查询患者表
    db.collection('patient')
      .where({ openid: openid })
      .get()
      .then(function(res) {
        if (res.data.length > 0) {
          // 用户已存在，保存信息
          var userInfo = {
            ...res.data[0],
            role: 'patient'
          }
          that.saveUserInfo(userInfo)
        } else {
          // 查询家属表
          return db.collection('family')
            .where({ openid: openid })
            .get()
        }
      })
      .then(function(res) {
        if (res && res.data && res.data.length > 0) {
          // 用户在家属表中
          var userInfo = {
            ...res.data[0],
            role: 'family'
          }
          that.saveUserInfo(userInfo)
        }
      })
      .catch(function(err) {
        console.error('查询用户失败:', err)
      })
  },

  // 保存用户信息
  saveUserInfo: function(userInfo) {
    this.globalData.userInfo = userInfo
    wx.setStorageSync('userInfo', userInfo)
  }
})
