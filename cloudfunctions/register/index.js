// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { role, name, gender, birthday, relation, phone } = event

  try {
    // 检查用户是否已存在
    const patientResult = await db.collection('patient')
      .where({ openid: openid })
      .get()
    
    const familyResult = await db.collection('family')
      .where({ openid: openid })
      .get()

    // 如果已存在，直接返回用户信息
    if (patientResult.data.length > 0) {
      return {
        success: true,
        message: '用户已存在',
        userInfo: {
          ...patientResult.data[0],
          role: 'patient'
        }
      }
    }

    if (familyResult.data.length > 0) {
      return {
        success: true,
        message: '用户已存在',
        userInfo: {
          ...familyResult.data[0],
          role: 'family'
        }
      }
    }

    // 新用户注册
    const now = db.serverDate()
    let result
    let userInfo

    if (role === 'patient') {
      // 患者表数据
      const patientData = {
        openid: openid,
        name: name,
        gender: gender,    // 性别
        birthday: birthday,  // 出生日期
        phone: phone,
        createTime: now,
        updateTime: now,
        status: 1
      }
      result = await db.collection('patient').add({ data: patientData })
      
      userInfo = {
        _id: result._id,
        openid: openid,
        name: name,
        gender: gender,
        birthday: birthday,
        phone: phone,
        role: 'patient',
        status: 1
      }
    } else {
      // 家属表数据
      const familyData = {
        openid: openid,
        name: name,
        relation: relation,  // 亲属关系
        phone: phone,
        createTime: now,
        updateTime: now,
        status: 1
      }
      result = await db.collection('family').add({ data: familyData })
      
      userInfo = {
        _id: result._id,
        openid: openid,
        name: name,
        relation: relation,
        phone: phone,
        role: 'family',
        status: 1
      }
    }

    return {
      success: true,
      message: '注册成功',
      userInfo: userInfo
    }

  } catch (err) {
    console.error('注册失败:', err)
    return {
      success: false,
      message: '注册失败: ' + err.message
    }
  }
}
