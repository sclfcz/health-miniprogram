// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 云函数入口函数 - 患者查询绑定申请列表
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { status } = event  // 不传则查询所有，0-待处理，1-已同意，2-已拒绝

  try {
    // 1. 验证是否为患者
    const patientResult = await db.collection('patient')
      .where({ openid: openid })
      .get()

    if (patientResult.data.length === 0) {
      return {
        success: false,
        message: '您不是患者用户'
      }
    }

    // 2. 构建查询条件
    let queryCondition = {
      patientOpenid: openid
    }

    // 如果指定了状态，则按状态筛选
    if (status !== undefined && status !== null && status !== '') {
      queryCondition.status = parseInt(status)
    }

    // 3. 查询绑定申请列表
    const requestResult = await db.collection('binding_requests')
      .where(queryCondition)
      .orderBy('createTime', 'desc')
      .limit(50)
      .get()

    // 4. 格式化返回数据
    const requestList = requestResult.data.map(function(item) {
      return {
        _id: item._id,
        familyOpenid: item.familyOpenid,
        familyName: item.familyName,
        familyPhone: item.familyPhone,
        relation: item.relation,
        status: item.status,
        statusText: item.status === 0 ? '待处理' : (item.status === 1 ? '已同意' : '已拒绝'),
        createTime: item.createTime
      }
    })

    return {
      success: true,
      data: requestList,
      pendingCount: requestList.filter(function(item) {
        return item.status === 0
      }).length
    }

  } catch (err) {
    console.error('查询绑定申请失败:', err)
    return {
      success: false,
      message: '查询失败: ' + err.message
    }
  }
}
