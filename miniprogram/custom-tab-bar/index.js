Component({
  data: {
    selected: 0,
    color: '#999999',
    selectedColor: '#4CAF50',
    list: [
      {
        pagePath: '/pages/home/index',
        text: '首页',
        iconPath: '/images/icons/home.png',
        selectedIconPath: '/images/icons/home-active.png'
      },
      {
        pagePath: '/pages/knowledge/index',
        text: '健康百科',
        iconPath: '/images/icons/knowledge.png',
        selectedIconPath: '/images/icons/knowledge-active.png'
      },
      {
        pagePath: '/pages/my/index',
        text: '我的',
        iconPath: '/images/icons/usercenter.png',
        selectedIconPath: '/images/icons/usercenter-active.png'
      }
    ]
  },

  methods: {
    switchTab: function(e) {
      var data = e.currentTarget.dataset
      var url = data.path
      wx.switchTab({ url: url })
    }
  }
})
