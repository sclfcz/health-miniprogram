const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function buildMedicineItem(item, source) {
  var medName = normalizeText(item.med_name || item.name || item.title)
  var dosage = normalizeText(item.common_dosage || item.dosage || item.recommended_dosage)
  var efficacy = normalizeText(item.efficacy || item.effect || item.summary || item.tag)

  return {
    id: item._id,
    source: source,
    med_name: medName,
    dosage: dosage,
    efficacy: efficacy
  }
}

function filterMatches(list, keyword) {
  var lowerKeyword = keyword.toLowerCase()

  return list.filter(function(item) {
    var matcher = [
      item.med_name,
      item.dosage,
      item.efficacy
    ].join(' ').toLowerCase()

    return matcher.indexOf(lowerKeyword) !== -1
  })
}

exports.main = async (event) => {
  try {
    var keyword = normalizeText(event && event.keyword)

    if (!keyword) {
      return {
        success: true,
        list: []
      }
    }

    var queries = await Promise.all([
      db.collection('medicine_library').limit(100).get().catch(function() {
        return { data: [] }
      }),
      db.collection('medical_knowledge').limit(100).get().catch(function() {
        return { data: [] }
      })
    ])

    var libraryList = (queries[0].data || []).map(function(item) {
      return buildMedicineItem(item, 'medicine_library')
    })

    var knowledgeList = (queries[1].data || []).map(function(item) {
      return buildMedicineItem(item, 'medical_knowledge')
    })

    var merged = libraryList.concat(knowledgeList)
    var uniqueMap = {}
    var result = []
    var matched = filterMatches(merged, keyword)

    for (var i = 0; i < matched.length; i++) {
      var key = matched[i].med_name + '|' + matched[i].dosage + '|' + matched[i].efficacy
      if (uniqueMap[key]) {
        continue
      }
      uniqueMap[key] = true
      result.push(matched[i])
      if (result.length >= 8) {
        break
      }
    }

    return {
      success: true,
      list: result
    }
  } catch (err) {
    console.error('searchMedicine failed:', err)
    return {
      success: false,
      error: err.message,
      list: []
    }
  }
}
