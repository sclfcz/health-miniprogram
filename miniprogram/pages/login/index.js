const db = wx.cloud.database()

Page({
  data: {
    role: 'patient',
    name: '',
    gender: '',  // 性别
    birthday: '',
    relation: '',
    relationIndex: -1,
    relationList: ['配偶', '子女', '父母', '兄弟姐妹', '祖父母', '其他'],
    phone: '',
    today: '',
    loading: false
  },

  onLoad: function(options) {
    // 设置今天的日期
    var today = this.formatDate(new Date())
    this.setData({ today: today })

    // 如果已登录，直接跳转首页
    var userInfo = wx.getStorageSync('userInfo')
    if (userInfo && userInfo.openid) {
      this.redirectToHome()
    }
  },

  // 格式化日期
  formatDate: function(date) {
    var year = date.getFullYear()
    var month = (date.getMonth() + 1).toString().padStart(2, '0')
    var day = date.getDate().toString().padStart(2, '0')
    return year + '-' + month + '-' + day
  },

  // 选择角色
  onRoleChange: function(e) {
    var role = e.currentTarget.dataset.role
    this.setData({ 
      role: role,
      // 切换角色时清空专属字段
      gender: '',
      birthday: '',
      relation: '',
      relationIndex: -1
    })
  },

  // 选择性别（患者）
  onGenderChange: function(e) {
    this.setData({ gender: e.currentTarget.dataset.gender })
  },

  // 输入姓名
  onNameInput: function(e) {
    this.setData({ name: e.detail.value })
  },

  // 选择出生日期（患者）
  onBirthdayChange: function(e) {
    this.setData({ birthday: e.detail.value })
  },

  // 选择亲属关系（家属）
  onRelationChange: function(e) {
    var index = parseInt(e.detail.value)
    this.setData({
      relationIndex: index,
      relation: this.data.relationList[index]
    })
  },

  // 输入手机号
  onPhoneInput: function(e) {
    this.setData({ phone: e.detail.value })
  },

  // 提交注册
  onSubmit: function() {
    var that = this
    var role = this.data.role
    var name = this.data.name.trim()
    var gender = this.data.gender
    var birthday = this.data.birthday
    var relation = this.data.relation
    var phone = this.data.phone.trim()

    // 表单校验
    if (!name) {
      wx.showToast({
        title: '请输入真实姓名',
        icon: 'none',
        duration: 2000
      })
      return
    }

    // 患者必须选择性别
    if (role === 'patient' && !gender) {
      wx.showToast({
        title: '请选择性别',
        icon: 'none',
        duration: 2000
      })
      return
    }

    // 患者必须填写出生日期
    if (role === 'patient' && !birthday) {
      wx.showToast({
        title: '请选择出生日期',
        icon: 'none',
        duration: 2000
      })
      return
    }

    // 家属必须选择亲属关系
    if (role === 'family' && !relation) {
      wx.showToast({
        title: '请选择亲属关系',
        icon: 'none',
        duration: 2000
      })
      return
    }

    if (!phone) {
      wx.showToast({
        title: '请输入手机号码',
        icon: 'none',
        duration: 2000
      })
      return
    }

    if (phone.length !== 11) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none',
        duration: 2000
      })
      return
    }

    this.setData({ loading: true })

    // 调用云函数注册
    wx.cloud.callFunction({
      name: 'register',
      data: {
        role: role,
        name: name,
        gender: gender,
        birthday: birthday,
        relation: relation,
        phone: phone
      }
    }).then(function(res) {
      that.setData({ loading: false })
      console.log('注册云函数返回:', res.result)
      
      if (res.result.success) {
        // 存储用户信息到本地
        var userInfo = res.result.userInfo
        console.log('保存的 userInfo:', userInfo)
        console.log('保存的 role:', userInfo.role)
        wx.setStorageSync('userInfo', userInfo)
        
        wx.showToast({
          title: '注册成功',
          icon: 'success',
          duration: 1500
        })
        
        setTimeout(function() {
          that.redirectToHome()
        }, 1500)
      } else {
        wx.showToast({
          title: res.result.message || '注册失败',
          icon: 'none',
          duration: 2000
        })
      }
    }).catch(function(err) {
      that.setData({ loading: false })
      console.error('注册失败:', err)
      wx.showToast({
        title: '注册失败，请重试',
        icon: 'none',
        duration: 2000
      })
    })
  },

  // 跳转首页
  redirectToHome: function() {
    wx.switchTab({
      url: '/pages/home/index'
    })
  }
})
