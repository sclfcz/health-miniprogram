// 家属绑定患者页面
const db = wx.cloud.database()

Page({
  data: {
    patientId: '',
    relation: '',
    relationIndex: -1,
    relationList: ['配偶', '子女', '父母', '兄弟姐妹', '祖父母', '其他'],
    loading: false,
    requestList: []
  },

  onLoad: function(options) {
    // 接收从个人中心传入的患者ID
    if (options.patientId) {
      this.setData({ patientId: decodeURIComponent(options.patientId) })
    }
    this.fetchMyRequests()
  },

  onShow: function() {
    this.fetchMyRequests()
  },

  // 输入患者ID
  onPatientIdInput: function(e) {
    this.setData({ patientId: e.detail.value.trim() })
  },

  // 选择亲属关系
  onRelationChange: function(e) {
    var index = parseInt(e.detail.value)
    this.setData({
      relationIndex: index,
      relation: this.data.relationList[index]
    })
  },

  // 发送绑定申请
  onSubmit: function() {
    var that = this
    var patientId = this.data.patientId.trim()
    var relation = this.data.relation

    // 表单校验
    if (!patientId) {
      wx.showToast({
        title: '请输入患者ID',
        icon: 'none'
      })
      return
    }

    if (!relation) {
      wx.showToast({
        title: '请选择亲属关系',
        icon: 'none'
      })
      return
    }

    this.setData({ loading: true })

    // 调用云函数发送申请
    wx.cloud.callFunction({
      name: 'sendBindingRequest',
      data: {
        patientId: patientId,
        relation: relation
      }
    }).then(function(res) {
      that.setData({ loading: false })

      if (res.result.success) {
        wx.showModal({
          title: '申请已发送',
          content: res.result.message,
          showCancel: false,
          success: function() {
            // 清空表单
            that.setData({
              patientId: '',
              relation: '',
              relationIndex: -1
            })
            // 刷新申请列表
            that.fetchMyRequests()
          }
        })
      } else {
        wx.showToast({
          title: res.result.message || '发送失败',
          icon: 'none',
          duration: 2000
        })
      }
    }).catch(function(err) {
      that.setData({ loading: false })
      console.error('发送申请失败:', err)
      wx.showToast({
        title: '发送失败，请重试',
        icon: 'none'
      })
    })
  },

  // 获取我的申请记录
  fetchMyRequests: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo')

    if (!userInfo || !userInfo.openid) {
      return
    }

    db.collection('binding_requests')
      .where({
        familyOpenid: userInfo.openid
      })
      .orderBy('createTime', 'desc')
      .limit(20)
      .get()
      .then(function(res) {
        var list = res.data.map(function(item) {
          return {
            _id: item._id,
            patientName: item.patientName || '未知患者',
            relation: item.relation,
            status: item.status,
            statusText: item.status === 0 ? '待处理' : (item.status === 1 ? '已同意' : '已拒绝'),
            createTimeStr: that.formatTime(item.createTime)
          }
        })
        that.setData({ requestList: list })
      })
      .catch(function(err) {
        console.error('获取申请记录失败:', err)
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
