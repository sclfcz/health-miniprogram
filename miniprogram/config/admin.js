// 管理员 openid（知识百科"编辑"入口的白名单）
//
// 仓库中的值是占位符：请替换成你自己的 openid，或在开发者工具 Console 里执行
//   wx.cloud.callFunction({ name: 'getOpenId' }).then(r => console.log(r.result.openid))
// 拿到后填到这里。
//
// ⚠️ 注意：这只是**界面入口的可见性控制**，不是权限控制 —— 小程序包可以被反编译，
//    任何人都能改前端逻辑或直接调云 API。真正的写入权限必须靠数据库安全规则
//    （例如 medical_knowledge 只允许云函数写）来保证。
module.exports = {
  ADMIN_OPENID: 'YOUR_ADMIN_OPENID'
}
