const db = wx.cloud.database()

Page({
  data: {
    id: '',
    title: '',
    tag: '',
    tagIndex: -1,
    publishDate: '',
    summary: '',
    content: '',
    tagList: ['用药禁忌', '疾病预防', '健康饮食', '运动养生']
  },

  onLoad: function(options) {
    // 初始化发布日期为当前日期
    var today = this.formatDate(new Date())
    this.setData({ publishDate: today })

    if (options.id) {
      // 编辑模式
      this.setData({ id: options.id })
      wx.setNavigationBarTitle({ title: '编辑知识' })
      this.fetchDetail(options.id)
    } else {
      // 新增模式
      wx.setNavigationBarTitle({ title: '新增知识' })
    }
  },

  // 格式化日期
  formatDate: function(date) {
    var year = date.getFullYear()
    var month = (date.getMonth() + 1).toString().padStart(2, '0')
    var day = date.getDate().toString().padStart(2, '0')
    return year + '-' + month + '-' + day
  },

  // 获取详情
  fetchDetail: function(id) {
    var that = this
    wx.showLoading({ title: '加载中...' })

    db.collection('medical_knowledge')
      .doc(id)
      .get()
      .then(function(res) {
        wx.hideLoading()
        var data = res.data
        var tagIndex = that.data.tagList.indexOf(data.tag)
        
        // 处理发布日期
        var publishDate = data.publishDate || that.formatDate(new Date(data.createTime))
        
        that.setData({
          title: data.title || '',
          tag: data.tag || '',
          tagIndex: tagIndex >= 0 ? tagIndex : -1,
          publishDate: publishDate,
          summary: data.summary || '',
          content: data.content || ''
        })
      })
      .catch(function(err) {
        wx.hideLoading()
        console.error('获取详情失败:', err)
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      })
  },

  // 输入标题
  onTitleInput: function(e) {
    this.setData({ title: e.detail.value })
  },

  // 选择分类
  onTagChange: function(e) {
    var index = e.detail.value
    this.setData({
      tagIndex: parseInt(index),
      tag: this.data.tagList[index]
    })
  },

  // 选择日期
  onDateChange: function(e) {
    this.setData({ publishDate: e.detail.value })
  },

  // 输入摘要
  onSummaryInput: function(e) {
    this.setData({ summary: e.detail.value })
  },

  // 输入内容
  onContentInput: function(e) {
    this.setData({ content: e.detail.value })
  },

  // 取消
  onCancel: function() {
    wx.navigateBack()
  },

  // 提交发布
  onSubmit: function() {
    var that = this
    var title = this.data.title.trim()
    var tag = this.data.tag
    var publishDate = this.data.publishDate
    var summary = this.data.summary.trim()
    var content = this.data.content.trim()

    // 标题校验
    if (title.length === 0) {
      wx.showToast({
        title: '标题不能为空，请认真填写',
        icon: 'error',
        duration: 2000
      })
      return
    }

    // 分类校验
    if (!tag) {
      wx.showToast({
        title: '请选择分类',
        icon: 'none',
        duration: 2000
      })
      return
    }

    // 内容校验 - 非空
    if (content.length === 0) {
      wx.showToast({
        title: '内容不能为空',
        icon: 'none',
        duration: 2000
      })
      return
    }

    // 内容校验 - 字数过少
    if (content.length < 10) {
      wx.showToast({
        title: '内容过于简略，请补充详情',
        icon: 'none',
        duration: 2000
      })
      return
    }

    wx.showLoading({ title: '提交中...' })

    var data = {
      title: title,
      tag: tag,
      publishDate: publishDate,
      summary: summary,
      content: content,
      createTime: db.serverDate()
    }

    if (this.data.id) {
      // 更新模式
      db.collection('medical_knowledge')
        .doc(this.data.id)
        .update({ data: data })
        .then(function() {
          wx.hideLoading()
          wx.showToast({
            title: '更新成功',
            icon: 'success'
          })
          setTimeout(function() {
            wx.navigateBack()
          }, 1000)
        })
        .catch(function(err) {
          wx.hideLoading()
          console.error('更新失败:', err)
          wx.showToast({
            title: '更新失败',
            icon: 'none'
          })
        })
    } else {
      // 新增模式
      db.collection('medical_knowledge')
        .add({ data: data })
        .then(function() {
          wx.hideLoading()
          wx.showToast({
            title: '发布成功',
            icon: 'success'
          })
          setTimeout(function() {
            wx.navigateBack()
          }, 1000)
        })
        .catch(function(err) {
          wx.hideLoading()
          console.error('发布失败:', err)
          wx.showToast({
            title: '发布失败',
            icon: 'none'
          })
        })
    }
  }
})
