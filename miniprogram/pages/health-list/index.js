const db = wx.cloud.database()
const medicationUtils = require('../../utils/medication')

Page({
  data: {
    dataList: [],
    patientOpenid: ''
  },

  onLoad: function(options) {
    if (options && options.patientOpenid) {
      this.setData({ patientOpenid: options.patientOpenid })
    }
  },

  onShow: function() {
    this.fetchData()
  },

  fetchData: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}
    // 家属查看患者用页面参数，患者本人用登录态 openid
    var patientOpenid = this.data.patientOpenid || userInfo.openid || ''

    if (!patientOpenid) {
      that.setData({ dataList: [] })
      return
    }

    wx.showLoading({ title: '加载中...' })

    medicationUtils
      .fetchAllForPatient('health_metrics', patientOpenid, { maxPages: 25 })
      .then(function(list) {
        that.setData({ dataList: list })
        wx.hideLoading()
      })
      .catch(function(err) {
        wx.hideLoading()
        console.error('获取数据失败', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  goToAdd: function() {
    wx.navigateTo({ url: '/pages/health-add/index' })
  },

  goToAnalysis: function() {
    wx.navigateTo({ url: '/pages/analysis/index' })
  },

  onDelete: function(e) {
    var that = this
    var id = e.currentTarget.dataset.id
    var index = e.currentTarget.dataset.index

    wx.showModal({
      title: '删除确认',
      content: '删除后数据无法恢复，确认删除这条测量记录吗？',
      confirmText: '确认删除',
      confirmColor: '#E53935',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          that.doDelete(id, index)
        }
      }
    })
  },

  doDelete: function(id, index) {
    var that = this

    db.collection('health_metrics')
      .doc(id)
      .remove()
      .then(function() {
        var newList = that.data.dataList.filter(function(item, i) {
          return i !== index
        })
        that.setData({ dataList: newList })
        wx.showToast({ title: '删除成功', icon: 'success' })
      })
      .catch(function(err) {
        console.error('删除失败:', err)
        if (err.errMsg && err.errMsg.indexOf('permission') !== -1) {
          wx.showToast({ title: '无权限删除', icon: 'none' })
        } else {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      })
  }
})
