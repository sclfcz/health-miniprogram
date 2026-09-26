const db = wx.cloud.database()

Page({
  data: {
    relation: '',
    phone: '',
    familyName: '',  // 家属姓名
    notes: '',
    isEdit: false,
    id: '',
    submitting: false
  },

  onLoad: function(options) {
    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
      this.loadData(options.id)
    }
  },

  loadData: function(id) {
    var that = this
    wx.showLoading({ title: '加载中...' })

    db.collection('family_relations')
      .doc(id)
      .get()
      .then(function(res) {
        wx.hideLoading()
        var data = res.data
        that.setData({
          relation: data.relation || '',
          phone: data.familyPhone || data.phone || '',
          familyName: data.familyName || '',
          notes: data.notes || ''
        })
      })
      .catch(function(err) {
        wx.hideLoading()
        console.error('获取数据失败', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  onRelationInput: function(e) {
    this.setData({ relation: e.detail.value })
  },

  onRelationPick: function(e) {
    var options = ['配偶', '子女', '父母', '兄弟姐妹', '其他']
    var index = parseInt(e.detail.value)
    this.setData({ relation: options[index] })
  },

  onFamilyNameInput: function(e) {
    this.setData({ familyName: e.detail.value })
  },

  onPhoneInput: function(e) {
    this.setData({ phone: e.detail.value })
  },

  onNotesInput: function(e) {
    this.setData({ notes: e.detail.value })
  },

  onSubmit: function() {
    var that = this
    var userInfo = wx.getStorageSync('userInfo')

    if (this.data.submitting) {
      return
    }

    var relation = this.data.relation
    var familyName = this.data.familyName
    var phone = this.data.phone

    if (!relation || !relation.trim()) {
      wx.showToast({ title: '请选择亲属关系', icon: 'none' })
      return
    }
    if (!familyName || !familyName.trim()) {
      wx.showToast({ title: '请输入家属姓名', icon: 'none' })
      return
    }
    if (!phone || !phone.trim()) {
      wx.showToast({ title: '请输入电话号码', icon: 'none' })
      return
    }
    if (phone.length !== 11) {
      wx.showToast({ title: '请输入11位电话号码', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '保存中...', mask: true })

    var data = {
      patientOpenid: userInfo.openid,  // 当前患者的openid
      patientName: userInfo.name || '',
      familyName: familyName.trim(),
      familyPhone: phone.trim(),
      relation: relation.trim(),
      notes: this.data.notes ? this.data.notes.trim() : '',
      status: 1,  // 手动添加的默认为已关联
      updateTime: db.serverDate()
    }

    if (this.data.isEdit) {
      db.collection('family_relations')
        .doc(this.data.id)
        .update({ data: data })
        .then(function(res) {
          wx.hideLoading()
          that.setData({ submitting: false })
          wx.showToast({ title: '保存成功', icon: 'success' })
          setTimeout(function() {
            wx.navigateBack()
          }, 1500)
        })
        .catch(function(err) {
          wx.hideLoading()
          that.setData({ submitting: false })
          console.error('保存失败', err)
          if (err.errMsg && err.errMsg.indexOf('permission') !== -1) {
            wx.showToast({ title: '无权限，请检查数据库设置', icon: 'none' })
          } else {
            wx.showToast({ title: '保存失败', icon: 'none' })
          }
        })
    } else {
      data.createTime = db.serverDate()
      db.collection('family_relations')
        .add({ data: data })
        .then(function(res) {
          wx.hideLoading()
          that.setData({ submitting: false })
          wx.showToast({ title: '添加成功', icon: 'success' })
          setTimeout(function() {
            wx.navigateBack()
          }, 1500)
        })
        .catch(function(err) {
          wx.hideLoading()
          that.setData({ submitting: false })
          console.error('添加失败', err)
          wx.showToast({ title: '添加失败', icon: 'none' })
        })
    }
  }
})
