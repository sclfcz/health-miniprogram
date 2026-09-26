// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 云函数入口函数 - 家属发送绑定申请
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { patientId, relation } = event

  try {
    // 1. 获取家属信息
    const familyResult = await db.collection('family')
      .where({ openid: openid })
      .get()

    if (familyResult.data.length === 0) {
      return {
        success: false,
        message: '您还不是家属用户，请先注册'
      }
    }

    const familyInfo = familyResult.data[0]

    // 2. 查找患者（通过 patientId，支持 openid 或 _id）
    let patientInfo = null
    
    // 先尝试通过 openid 查找
    const patientByOpenid = await db.collection('patient')
      .where({ openid: patientId })
      .get()
    
    if (patientByOpenid.data.length > 0) {
      patientInfo = patientByOpenid.data[0]
    } else {
      // 再尝试通过 _id 查找
      try {
        const patientById = await db.collection('patient')
          .doc(patientId)
          .get()
        if (patientById.data) {
          patientInfo = patientById.data
        }
      } catch (e) {
        // _id 不存在，忽略错误
      }
    }

    if (!patientInfo) {
      return {
        success: false,
        message: '未找到该患者，请检查患者ID是否正确'
      }
    }

    // 3. 检查是否已存在绑定关系
    const existingRelation = await db.collection('family_relations')
      .where({
        familyOpenid: openid,
        patientOpenid: patientInfo.openid
      })
      .get()

    if (existingRelation.data.length > 0) {
      return {
        success: false,
        message: '您已与该患者建立绑定关系'
      }
    }

    // 4. 检查是否已存在待处理的申请
    const existingRequest = await db.collection('binding_requests')
      .where({
        familyOpenid: openid,
        patientOpenid: patientInfo.openid,
        status: 0  // 待处理
      })
      .get()

    if (existingRequest.data.length > 0) {
      return {
        success: false,
        message: '您已发送过申请，请等待患者确认'
      }
    }

    // 5. 插入绑定申请记录
    const now = db.serverDate()
    const requestData = {
      familyOpenid: openid,
      familyName: familyInfo.name,
      familyPhone: familyInfo.phone,
      patientOpenid: patientInfo.openid,
      patientName: patientInfo.name,
      relation: relation || familyInfo.relation || '家属',
      status: 0,  // 0-待处理，1-已同意，2-已拒绝
      createTime: now,
      updateTime: now
    }

    const result = await db.collection('binding_requests').add({
      data: requestData
    })

    return {
      success: true,
      message: '申请已发送，请等待患者确认',
      requestId: result._id
    }

  } catch (err) {
    console.error('发送绑定申请失败:', err)
    return {
      success: false,
      message: '发送申请失败: ' + err.message
    }
  }
}
