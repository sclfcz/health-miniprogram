// 消息中心页面 - 患者查看和处理绑定申请
Page({
  data: {
    currentTab: 0,  // 0-待处理，1-已处理
    requestList: [],
    pendingCount: 0,
    loading: false
  },

  onLoad: function() {
    this.fetchRequests()
  },

  onShow: function() {
    this.fetchRequests()
  },

  // Tab 切换
  onTabChange: function(e) {
    var tab = parseInt(e.currentTarget.dataset.tab)
    this.setData({ currentTab: tab })
    this.fetchRequests()
  },

  // 获取申请列表
  fetchRequests: function() {
    var that = this
    this.setData({ loading: true })

    // 根据当前 Tab 设置查询状态
    var status = this.data.currentTab === 0 ? 0 : ''  // 0-待处理，空字符串-全部已处理

    wx.cloud.callFunction({
      name: 'getBindingRequests',
      data: {
        status: status
      }
    }).then(function(res) {
      that.setData({ loading: false })

      if (res.result.success) {
        var list = res.result.data.map(function(item) {
          return {
            _id: item._id,
            familyOpenid: item.familyOpenid,
            familyName: item.familyName || '未知',
            familyPhone: item.familyPhone || '',
            relation: item.relation,
            status: item.status,
            statusText: item.statusText,
            createTimeStr: that.formatTime(item.createTime)
          }
        })

        // 如果是已处理 Tab，过滤掉待处理的
        if (that.data.currentTab === 1) {
          list = list.filter(function(item) {
            return item.status !== 0
          })
        }

        that.setData({
          requestList: list,
          pendingCount: res.result.pendingCount
        })
      }
    }).catch(function(err) {
      that.setData({ loading: false })
      console.error('获取申请列表失败:', err)
      wx.showToast({
        title: '获取失败',
        icon: 'none'
      })
    })
  },

  // 同意申请
  onApprove: function(e) {
    var that = this
    var requestId = e.currentTarget.dataset.id
    var familyName = e.currentTarget.dataset.name

    wx.showModal({
      title: '确认同意',
      content: '确定同意"' + familyName + '"的绑定申请吗？',
      confirmText: '同意',
      confirmColor: '#07C160',
      success: function(res) {
        if (res.confirm) {
          that.handleRequest(requestId, 'approve')
        }
      }
    })
  },

  // 拒绝申请
  onReject: function(e) {
    var that = this
    var requestId = e.currentTarget.dataset.id
    var familyName = e.currentTarget.dataset.name

    wx.showModal({
      title: '确认拒绝',
      content: '确定拒绝"' + familyName + '"的绑定申请吗？',
      confirmText: '拒绝',
      confirmColor: '#E53935',
      success: function(res) {
        if (res.confirm) {
          that.handleRequest(requestId, 'reject')
        }
      }
    })
  },

  // 处理申请
  handleRequest: function(requestId, action) {
    var that = this
    wx.showLoading({ title: '处理中...', mask: true })

    wx.cloud.callFunction({
      name: 'handleBindingRequest',
      data: {
        requestId: requestId,
        action: action
      }
    }).then(function(res) {
      wx.hideLoading()

      if (res.result.success) {
        wx.showToast({
          title: res.result.message,
          icon: 'success'
        })
        // 刷新列表
        that.fetchRequests()
      } else {
        wx.showToast({
          title: res.result.message || '处理失败',
          icon: 'none'
        })
      }
    }).catch(function(err) {
      wx.hideLoading()
      console.error('处理申请失败:', err)
      wx.showToast({
        title: '处理失败',
        icon: 'none'
      })
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
