const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const medicineData = [
  {
    _id: 'drug_001',
    med_name: '阿司匹林肠溶片',
    common_dosage: '每次 100mg，每日 1 次',
    efficacy: '抗血小板，预防血栓形成',
    aliases: ['阿司匹林', '肠溶阿司匹林'],
    category: '心脑血管',
    status: 1
  },
  {
    _id: 'drug_002',
    med_name: '氯吡格雷片',
    common_dosage: '每次 75mg，每日 1 次',
    efficacy: '抑制血小板聚集，降低心脑血管事件风险',
    aliases: ['氯吡格雷'],
    category: '心脑血管',
    status: 1
  },
  {
    _id: 'drug_003',
    med_name: '阿托伐他汀钙片',
    common_dosage: '每次 10-20mg，每晚 1 次',
    efficacy: '降血脂，稳定斑块',
    aliases: ['阿托伐他汀', '立普妥'],
    category: '心脑血管',
    status: 1
  },
  {
    _id: 'drug_004',
    med_name: '瑞舒伐他汀钙片',
    common_dosage: '每次 5-10mg，每晚 1 次',
    efficacy: '降低低密度脂蛋白胆固醇',
    aliases: ['瑞舒伐他汀', '可定'],
    category: '心脑血管',
    status: 1
  },
  {
    _id: 'drug_005',
    med_name: '硝苯地平控释片',
    common_dosage: '每次 30mg，每日 1 次',
    efficacy: '扩张血管，降低血压',
    aliases: ['硝苯地平', '拜新同'],
    category: '高血压',
    status: 1
  },
  {
    _id: 'drug_006',
    med_name: '氨氯地平片',
    common_dosage: '每次 5mg，每日 1 次',
    efficacy: '长效降压，适用于高血压长期管理',
    aliases: ['苯磺酸氨氯地平', '络活喜'],
    category: '高血压',
    status: 1
  },
  {
    _id: 'drug_007',
    med_name: '厄贝沙坦片',
    common_dosage: '每次 150mg，每日 1 次',
    efficacy: '降低血压，保护肾功能',
    aliases: ['厄贝沙坦', '安博维'],
    category: '高血压',
    status: 1
  },
  {
    _id: 'drug_008',
    med_name: '缬沙坦胶囊',
    common_dosage: '每次 80mg，每日 1 次',
    efficacy: '降压，改善心血管风险',
    aliases: ['缬沙坦', '代文'],
    category: '高血压',
    status: 1
  },
  {
    _id: 'drug_009',
    med_name: '美托洛尔缓释片',
    common_dosage: '每次 47.5mg，每日 1 次',
    efficacy: '降低心率和血压，改善心绞痛',
    aliases: ['美托洛尔', '倍他乐克'],
    category: '高血压',
    status: 1
  },
  {
    _id: 'drug_010',
    med_name: '二甲双胍片',
    common_dosage: '每次 500mg，每日 2-3 次，餐后服用',
    efficacy: '改善胰岛素抵抗，降低血糖',
    aliases: ['二甲双胍', '格华止'],
    category: '糖尿病',
    status: 1
  },
  {
    _id: 'drug_011',
    med_name: '格列美脲片',
    common_dosage: '每次 1-2mg，每日 1 次，早餐前服用',
    efficacy: '促进胰岛素分泌，降低血糖',
    aliases: ['格列美脲', '亚莫利'],
    category: '糖尿病',
    status: 1
  },
  {
    _id: 'drug_012',
    med_name: '阿卡波糖片',
    common_dosage: '每次 50mg，每日 3 次，随餐服用',
    efficacy: '延缓糖吸收，控制餐后血糖',
    aliases: ['阿卡波糖', '拜唐苹'],
    category: '糖尿病',
    status: 1
  },
  {
    _id: 'drug_013',
    med_name: '西格列汀片',
    common_dosage: '每次 100mg，每日 1 次',
    efficacy: '提高胰岛素分泌，辅助控制血糖',
    aliases: ['西格列汀', '捷诺维'],
    category: '糖尿病',
    status: 1
  },
  {
    _id: 'drug_014',
    med_name: '达格列净片',
    common_dosage: '每次 10mg，每日 1 次',
    efficacy: '促进尿糖排泄，降低血糖并辅助减重',
    aliases: ['达格列净', '安达唐'],
    category: '糖尿病',
    status: 1
  },
  {
    _id: 'drug_015',
    med_name: '硫酸氢氯吡格雷片',
    common_dosage: '每次 75mg，每日 1 次',
    efficacy: '抗血小板，预防血栓',
    aliases: ['硫酸氢氯吡格雷'],
    category: '心脑血管',
    status: 1
  }
]

exports.main = async () => {
  try {
    const results = []

    for (const item of medicineData) {
      try {
        const existResult = await db.collection('medicine_library')
          .doc(item._id)
          .get()
          .catch(() => null)

        if (existResult && existResult.data) {
          await db.collection('medicine_library')
            .doc(item._id)
            .update({
              data: {
                med_name: item.med_name,
                common_dosage: item.common_dosage,
                efficacy: item.efficacy,
                aliases: item.aliases,
                category: item.category,
                status: item.status
              }
            })

          results.push({
            _id: item._id,
            action: 'updated'
          })
        } else {
          await db.collection('medicine_library')
            .add({
              data: item
            })

          results.push({
            _id: item._id,
            action: 'inserted'
          })
        }
      } catch (err) {
        results.push({
          _id: item._id,
          action: 'failed',
          error: err.message
        })
      }
    }

    return {
      success: true,
      message: '药品信息库初始化完成',
      total: medicineData.length,
      results: results
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    }
  }
}
