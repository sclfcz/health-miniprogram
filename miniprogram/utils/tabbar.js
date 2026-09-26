function setTabBar(page, selectedIndex) {
  if (!page || typeof page.getTabBar !== 'function') {
    return
  }

  var tabBar = page.getTabBar()
  if (tabBar && typeof tabBar.setData === 'function') {
    tabBar.setData({
      selected: selectedIndex
    })
  }
}

module.exports = {
  setTabBar: setTabBar
}
