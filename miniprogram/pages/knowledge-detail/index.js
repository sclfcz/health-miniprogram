const db = wx.cloud.database()

Page({
  data: {
    article: {},
    createTimeStr: ''
  },

  onLoad: function(options) {
    if (options.id) {
      this.fetchDetail(options.id)
    }
  },

  fetchDetail: function(id) {
    var that = this
    wx.showLoading({ title: '加载中...' })

    db.collection('medical_knowledge').doc(id).get().then(function(res) {
      var article = res.data
      article.createTimeStr = that.formatTime(article.createTime)
      that.setData({ article: article })
      wx.hideLoading()
    }).catch(function(err) {
      wx.hideLoading()
      console.error('获取详情失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  formatTime: function(date) {
    if (!date) return ''
    var d = new Date(date)
    var year = d.getFullYear()
    var month = (d.getMonth() + 1).toString().padStart(2, '0')
    var day = d.getDate().toString().padStart(2, '0')
    return year + '-' + month + '-' + day
  }
})
