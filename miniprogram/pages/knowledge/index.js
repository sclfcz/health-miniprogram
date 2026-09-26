const db = wx.cloud.database()
const tabBarUtils = require('../../utils/tabbar')
const adminConfig = require('../../config/admin')

// 占位符未替换时不展示编辑入口
function isAdminOpenid(openid) {
  var adminOpenid = adminConfig.ADMIN_OPENID
  if (!adminOpenid || adminOpenid === 'YOUR_ADMIN_OPENID') {
    return false
  }
  return openid === adminOpenid
}

Page({
  data: {
    keyword: '',
    articleList: [],
    loading: false,
    hasMore: true,
    pageSize: 10,
    pageNo: 1,
    isAdmin: false
  },

  onLoad: function() {
    this.checkAdmin()
    this.refreshData()
  },

  onShow: function() {
    tabBarUtils.setTabBar(this, 1)
    this.refreshData()
  },

  onPullDownRefresh: function() {
    this.refreshData(true)
  },

  onReachBottom: function() {
    this.loadMore()
  },

  checkAdmin: function() {
    var that = this
    wx.cloud.callFunction({
      name: 'getOpenId'
    }).then(function(res) {
      var openid = res.result.openid
      that.setData({
        isAdmin: isAdminOpenid(openid)
      })
    }).catch(function() {
      that.setData({ isAdmin: false })
    })
  },

  onSearchInput: function(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearchConfirm: function() {
    this.refreshData()
  },

  clearSearch: function() {
    this.setData({ keyword: '' })
    this.refreshData()
  },

  refreshData: function(stopPullDown) {
    this.setData({
      articleList: [],
      pageNo: 1,
      hasMore: true
    })
    this.fetchData(stopPullDown)
  },

  fetchData: function(stopPullDown) {
    var that = this
    if (this.data.loading || !this.data.hasMore) {
      if (stopPullDown) {
        wx.stopPullDownRefresh()
      }
      return
    }

    var keyword = this.data.keyword.trim()
    var pageNo = this.data.pageNo
    var pageSize = this.data.pageSize
    var skip = (pageNo - 1) * pageSize
    var condition = {}

    if (keyword) {
      condition.title = db.RegExp({
        regexp: keyword,
        options: 'i'
      })
    }

    this.setData({ loading: true })

    db.collection('medical_knowledge')
      .where(condition)
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
      .then(function(res) {
        var list = (res.data || []).map(function(item) {
          item.summary = item.summary || (item.content ? item.content.substring(0, 48) + '...' : '点击查看详情')
          return item
        })

        that.setData({
          articleList: that.data.articleList.concat(list),
          hasMore: list.length === pageSize,
          pageNo: pageNo + 1,
          loading: false
        })

        if (stopPullDown) {
          wx.stopPullDownRefresh()
        }
      })
      .catch(function(err) {
        console.error('获取知识库失败:', err)
        that.setData({ loading: false })
        if (stopPullDown) {
          wx.stopPullDownRefresh()
        }
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      })
  },

  loadMore: function() {
    if (!this.data.loading && this.data.hasMore) {
      this.fetchData(false)
    }
  },

  goToDetail: function(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/knowledge-detail/index?id=' + id
    })
  },

  onAdd: function() {
    wx.navigateTo({
      url: '/pages/knowledge-edit/index'
    })
  },

  onEdit: function(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/knowledge-edit/index?id=' + id
    })
  },

  onDelete: function(e) {
    var that = this
    var id = e.currentTarget.dataset.id
    var title = e.currentTarget.dataset.title

    wx.showModal({
      title: '确认删除',
      content: '确定要删除“' + title + '”吗？',
      confirmText: '删除',
      confirmColor: '#E53935',
      success: function(res) {
        if (res.confirm) {
          that.doDelete(id)
        }
      }
    })
  },

  doDelete: function(id) {
    var that = this
    wx.showLoading({ title: '删除中...' })

    db.collection('medical_knowledge')
      .doc(id)
      .remove()
      .then(function() {
        wx.hideLoading()
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        })
        that.refreshData()
      })
      .catch(function(err) {
        wx.hideLoading()
        console.error('删除失败:', err)
        wx.showToast({
          title: '删除失败',
          icon: 'none'
        })
      })
  }
})
