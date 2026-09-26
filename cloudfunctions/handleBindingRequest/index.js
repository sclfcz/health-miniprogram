// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 云函数入口函数 - 患者处理绑定申请（同意/拒绝）
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { requestId, action } = event  // action: 'approve' 或 'reject'

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

    const patientInfo = patientResult.data[0]

    // 2. 获取申请记录
    const requestResult = await db.collection('binding_requests')
      .doc(requestId)
      .get()

    if (!requestResult.data) {
      return {
        success: false,
        message: '申请记录不存在'
      }
    }

    const requestData = requestResult.data

    // 3. 验证该申请是否属于当前患者
    if (requestData.patientOpenid !== openid) {
      return {
        success: false,
        message: '无权处理此申请'
      }
    }

    // 4. 检查申请状态（只能处理待处理的申请）
    if (requestData.status !== 0) {
      return {
        success: false,
        message: '该申请已处理过'
      }
    }

    const now = db.serverDate()

    // 5. 根据操作类型处理
    if (action === 'approve') {
      // === 同意申请 ===
      
      // 5.1 更新申请状态为已同意
      await db.collection('binding_requests')
        .doc(requestId)
        .update({
          data: {
            status: 1,
            updateTime: now
          }
        })

      // 5.2 在 family_relations 表中建立关联关系
      const relationData = {
        familyOpenid: requestData.familyOpenid,
        familyName: requestData.familyName,
        familyPhone: requestData.familyPhone,
        patientOpenid: requestData.patientOpenid,
        patientName: requestData.patientName,
        relation: requestData.relation,
        status: 1,
        createTime: now,
        updateTime: now
      }

      await db.collection('family_relations').add({
        data: relationData
      })

      // 5.3 更新 patient 表，添加家属 openid 到 familyOpenids 数组
      await db.collection('patient')
        .where({ openid: openid })
        .update({
          data: {
            familyOpenids: _.addToSet(requestData.familyOpenid),
            updateTime: now
          }
        })

      // 5.4 更新 family 表，添加患者 openid 到 patientOpenids 数组
      await db.collection('family')
        .where({ openid: requestData.familyOpenid })
        .update({
          data: {
            patientOpenids: _.addToSet(openid),
            updateTime: now
          }
        })

      return {
        success: true,
        message: '已同意绑定申请'
      }

    } else if (action === 'reject') {
      // === 拒绝申请 ===
      
      // 更新申请状态为已拒绝
      await db.collection('binding_requests')
        .doc(requestId)
        .update({
          data: {
            status: 2,
            updateTime: now
          }
        })

      return {
        success: true,
        message: '已拒绝绑定申请'
      }

    } else {
      return {
        success: false,
        message: '无效的操作类型'
      }
    }

  } catch (err) {
    console.error('处理绑定申请失败:', err)
    return {
      success: false,
      message: '处理失败: ' + err.message
    }
  }
}
