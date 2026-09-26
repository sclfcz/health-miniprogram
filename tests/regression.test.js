#!/usr/bin/env node
// 康养日记 · 回归测试（纯 Node，不需要微信开发者工具，无第三方依赖）
//
//   node tests/regression.test.js
//
// 会对 3 个时区各跑一遍：Asia/Shanghai / UTC / America/New_York —— 端上用设备时区推导"今天"，
// 云端云函数运行在 UTC 且显式 +8，只有跨时区跑才能发现两者不一致。
//
// 覆盖的都是"改坏了用户会直接感知"的不变式（每条都对应一次真实缺陷修复，见 README「实现约束」与
// 同学运行测试配置说明.md §9）：
//   T1  同一 plan+slot 同时存在 missed / taken 时，"连续漏服"结论不能随数据库返回顺序变化
//   T2  恰好 scheduled + 30 分钟时，端上状态与云端是否写 missed 必须一致
//   T3  端上与云端对同一瞬间必须得出同一天 / 同一星期
//   T4  一次发送失败（如 43101）不能永久堵死窗口内的提醒重试
//   T5  患者记录超过平台默认 100 条时，"最近连续漏服"不能被截断
//   T6  端上查询必须带 patientOpenid，缺归属时不得拉到他人数据
//   T7  当天记录超过 100 条时，已服药的计划不能被重复写成 missed
//   T8  文档 §6.3/§6.4 的端到端场景：3 个时段均过点 → 3 条 missed + 1 条家属预警，且重跑不重复
//
// 实现方式：把云函数与前端 utils 放进 vm 沙箱执行，注入假的 wx-server-sdk 与仿真数据库
// （tests/fakedb.js），因此可以在 Node 里直接调用它们的内部函数。

const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { spawnSync } = require('child_process')
const { createDb, DEFAULT_CLOUD_LIMIT } = require('./fakedb')

const ROOT = path.resolve(__dirname, '..')
const TIMEZONES = ['Asia/Shanghai', 'UTC', 'America/New_York']

// 云函数里需要被导出的纯函数（不同云函数并非同构，加载器只导出该文件里真实存在的）
const EXPORTED_FUNCTIONS = [
  'padNumber', 'formatDate', 'formatTime', 'parseDateTime', 'timeToMinutes', 'truncateText',
  'normalizeCycleType', 'normalizeNumberArray', 'normalizeCycleDetail', 'getWeekdayNumber',
  'isPlanScheduledForDate', 'getPlanTimeSlots', 'makeRecordKey', 'makeWarningKey', 'groupRecordsByPlan',
  'hasCompletedRecord', 'ensureMissedRecords', 'getConsecutiveMissedRecords', 'fetchRecentPatientRecords',
  'fetchTodayRecords', 'fetchActivePlans', 'fetchAllPages', 'fetchPatientMap', 'compareRecordsDesc',
  'recordTime', 'hasRecord', 'hasReminderLog', 'makeLogKey', 'isFinalStatus', 'isMissedStatus', 'getLatestRecord'
]

// ---------------------------------------------------------------------------
// 装载器：在 vm 沙箱里执行云函数 / 前端 utils，注入假 cloud 与假数据库
// ---------------------------------------------------------------------------

function loadCloudFunction(relativePath, db, sendImpl) {
  const fullPath = path.join(ROOT, relativePath)
  const source = fs.readFileSync(fullPath, 'utf8')
  const exported = EXPORTED_FUNCTIONS.filter((name) => new RegExp('\\bfunction\\s+' + name + '\\s*\\(').test(source))
  const src = source + '\nmodule.exports = {' + exported.join(',') + '};\nmodule.exports.__main = exports.main;'

  const fakeCloud = {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init() {},
    getWXContext: () => ({ OPENID: 'u1', APPID: 'wx-test', ENV: 'test-env' }),
    database: () => db,
    openapi: {
      subscribeMessage: {
        send: async (payload) => (sendImpl ? sendImpl(payload) : { errCode: 0 })
      }
    }
  }

  const sandbox = {
    require: (moduleName) => {
      if (moduleName === 'wx-server-sdk') return fakeCloud
      if (moduleName.startsWith('./')) {
        // 仓库里的模板 ID 是占位符（脱敏），发送会在守卫处短路；这里替换成测试值，
        // 让用例真正跑到发送路径。仓库中的占位符不会被改动。
        const config = require(path.join(path.dirname(fullPath), moduleName))
        const copy = Object.assign({}, config)
        Object.keys(copy).forEach((key) => {
          if (copy[key] === 'YOUR_TEMPLATE_ID') copy[key] = 'test-template-id'
        })
        return copy
      }
      return require(moduleName)
    },
    module: { exports: {} },
    exports: {},
    console,
    process,
    Date, Math, JSON, Promise, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error, Symbol,
    parseInt, parseFloat, isNaN, isFinite, setTimeout, clearTimeout
  }
  sandbox.exports = sandbox.module.exports
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox, { filename: fullPath })
  return sandbox.module.exports
}

function loadFrontendUtils(db) {
  const fullPath = path.join(ROOT, 'miniprogram/utils/medication.js')
  const source = fs.readFileSync(fullPath, 'utf8')
  const src = source + '\nmodule.exports = module.exports;'

  const sandbox = {
    require: (moduleName) => {
      if (!moduleName.startsWith('.')) return require(moduleName)
      const target = path.join(path.dirname(fullPath), moduleName)
      const file = target.endsWith('.js') ? target : target + '.js'
      const configSandbox = { module: { exports: {} }, exports: {}, require: () => ({}) }
      vm.createContext(configSandbox)
      vm.runInContext(fs.readFileSync(file, 'utf8'), configSandbox, { filename: file })
      return configSandbox.module.exports
    },
    wx: { cloud: { database: () => db, command: {} } },
    module: { exports: {} },
    exports: {},
    console,
    process,
    Date, Math, JSON, Promise, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error, Symbol,
    parseInt, parseFloat, isNaN, isFinite
  }
  sandbox.exports = sandbox.module.exports
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox, { filename: fullPath })
  return sandbox.module.exports
}

// ---------------------------------------------------------------------------
// 断言与用例
// ---------------------------------------------------------------------------

function createChecker() {
  const failures = []
  return {
    failures,
    check(name, ok, detail) {
      const line = ok ? 'PASS' : 'FAIL'
      console.log(`  ${line}  ${name}${!ok && detail ? '  → ' + detail : ''}`)
      if (!ok) failures.push(name)
    }
  }
}

async function runSuite() {
  const { check, failures } = createChecker()
  const timezone = process.env.TZ || '(系统默认)'
  console.log(`\n===== 康养日记回归测试（TZ=${timezone}）=====`)

  // T1 同一 plan+slot 的 missed/taken 双记录：结论必须与返回顺序无关
  {
    const db = createDb()
    const cloud = loadCloudFunction('cloudfunctions/checkMedicationMissed/index.js', db)
    const build = (order) => order.map((status) => ({
      patientOpenid: 'u1', plan_id: 'p1', date: '2026-09-25', time_slot: 0, scheduled_time: '08:00', status,
      create_time: new Date(status === 'missed' ? '2026-09-25T00:30:00Z' : '2026-09-25T00:31:00Z')
    }))
    const a = cloud.getConsecutiveMissedRecords(build(['missed', 'taken'])).length
    const b = cloud.getConsecutiveMissedRecords(build(['taken', 'missed'])).length
    check('T1 连续漏服判定与数据库返回顺序无关', a === b, `[missed,taken]=${a} vs [taken,missed]=${b}`)
  }

  // T2 恰好 +30 分钟：端上状态与云端写入一致
  {
    const plan = { _id: 'b1', patientOpenid: 'u1', med_name: 'X', timeSlots: ['08:00'], cycle_type: 'day', status: 1 }
    const now = new Date(2026, 8, 25, 8, 30, 0)
    const frontend = loadFrontendUtils(createDb())
    const shift = frontend.chinaNow ? frontend.chinaNow(now) : now
    const task = frontend.buildDailyTasks([plan], [], shift)[0]
    const db = createDb()
    const cloud = loadCloudFunction('cloudfunctions/checkMedicationMissed/index.js', db)
    const inserted = await cloud.ensureMissedRecords([plan], {}, now, '2026-09-25')
    check('T2 恰好 +30 分钟时端上状态与云端写入一致', (task.status === 'missed') === (inserted.length > 0),
      `端上=${task.status} 云端写入missed=${inserted.length > 0}`)
  }

  // T3 端上与云端对同一瞬间必须得出同一天 / 同一星期
  {
    const db = createDb()
    const cloud = loadCloudFunction('cloudfunctions/checkMedicationMissed/index.js', db)
    const frontend = loadFrontendUtils(createDb())
    const plan = { _id: 'tz', patientOpenid: 'u1', med_name: 'Z', timeSlots: ['07:00'], cycle_type: 'month', cycle_detail: [26], status: 1 }
    const problems = []
    for (const iso of ['2026-09-25T20:00:00Z', '2026-09-25T16:30:00Z', '2026-01-01T00:10:00Z']) {
      const instant = new Date(iso)
      const shifted = frontend.chinaNow ? frontend.chinaNow(instant) : instant
      const frontendDate = frontend.formatDate(shifted)
      const cloudDate = cloud.formatDate(instant)
      const frontendScheduled = frontend.isPlanScheduledForDate(plan, shifted)
      const cloudScheduled = cloud.isPlanScheduledForDate(plan, instant)
      if (frontendDate !== cloudDate || frontendScheduled !== cloudScheduled) {
        problems.push(`${iso}: 端上=${frontendDate}/${frontendScheduled} 云端=${cloudDate}/${cloudScheduled}`)
      }
    }
    check('T3 端上「今天/星期」与云端一致（设备时区无关）', problems.length === 0, problems.join(' | '))
  }

  // T4 上一次发送失败后，窗口内仍会重试
  {
    const plan = { _id: 'p_rem', patientOpenid: 'u1', med_name: 'R', timeSlots: ['08:00'], cycle_type: 'day', status: 1 }
    const failing = () => { throw new Error('43101 user refuse to accept the msg') }
    const firstDb = createDb({ medication_plans: [plan], patient: [{ openid: 'u1', name: '张xx', status: 1 }] })
    const firstCloud = loadCloudFunction('cloudfunctions/medicationReminder/index.js', firstDb, failing)
    await firstCloud.__main({ now: '2026-09-25 08:05' })
    const failedLog = (firstDb.tables.reminder_logs ? firstDb.tables.reminder_logs.docs : []).find((doc) => doc.status === 'failed')

    const secondDb = createDb({
      medication_plans: [plan],
      patient: [{ openid: 'u1', name: '张xx', status: 1 }],
      reminder_logs: failedLog ? [Object.assign({}, failedLog)] : []
    })
    const secondCloud = loadCloudFunction('cloudfunctions/medicationReminder/index.js', secondDb, () => ({ errCode: 0 }))
    const result = await secondCloud.__main({ now: '2026-09-25 08:06' })
    check('T4 上一次发送失败后，窗口内仍会重试', (result.notifications || []).length > 0,
      `failedLog=${!!failedLog} 第二轮尝试发送=${(result.notifications || []).length > 0}`)
  }

  // T5 记录数超过平台默认上限时，连续漏服不能被截断
  {
    const taken = []
    for (let i = 0; i < 150; i++) {
      taken.push({
        patientOpenid: 'u1', plan_id: 'p' + (i % 3), date: `2026-08-${String(1 + (i % 28)).padStart(2, '0')}`,
        time_slot: 0, scheduled_time: '08:00', status: 'taken', create_time: new Date(2026, 7, 1 + (i % 28))
      })
    }
    const missed = [24, 25, 26].map((day, i) => ({
      patientOpenid: 'u1', plan_id: 'p' + i, date: `2026-09-${day}`, time_slot: 0,
      scheduled_time: '08:00', status: 'missed', create_time: new Date(2026, 8, day, 1)
    }))
    const db = createDb({ med_records: taken.concat(missed) })
    const cloud = loadCloudFunction('cloudfunctions/checkMedicationMissed/index.js', db)
    const recent = await cloud.fetchRecentPatientRecords('u1')
    const streak = cloud.getConsecutiveMissedRecords(recent).length
    check(`T5 患者记录 ${taken.length + missed.length} 条（> 平台默认 ${DEFAULT_CLOUD_LIMIT}）时连续漏服仍为 3`, streak === 3,
      `取回 ${recent.length} 条 → streak=${streak}`)
  }

  // T6 缺 patientOpenid 时不得拉到他人计划
  {
    const mine = { _id: 'mine', patientOpenid: 'u1', med_name: 'M', timeSlots: ['08:00'], cycle_type: 'day', status: 1 }
    const other = { _id: 'other', patientOpenid: 'u2', med_name: '别人的药', timeSlots: ['09:00'], cycle_type: 'day', status: 1 }
    const db = createDb({
      medication_plans: [mine, other],
      med_records: [{ patientOpenid: 'u2', plan_id: 'other', date: '2026-09-25', time_slot: 0, scheduled_time: '09:00', status: 'taken' }]
    })
    const frontend = loadFrontendUtils(db)
    const instant = new Date('2026-09-25T08:05:00+08:00')
    const withoutOwner = await frontend.generateDailyTasks(instant, {})
    const withOwner = await frontend.generateDailyTasks(instant, { patientOpenid: 'u1' })
    const leaked = withoutOwner.some((task) => task.med_name === '别人的药')
    check('T6 未给 patientOpenid 时不返回他人计划', !leaked, `无归属时任务数=${withoutOwner.length} 泄漏=${leaked}`)
    check('T6b 给了 patientOpenid 时只返回本人的计划', withOwner.length === 1 && withOwner[0].med_name === 'M',
      `本人任务=${JSON.stringify(withOwner.map((task) => task.med_name))}`)
  }

  // T7 当天记录超过上限时，已服药的计划不能被重复写成 missed
  {
    const target = { _id: 'p_target', patientOpenid: 'u1', med_name: 'T', timeSlots: ['08:00'], cycle_type: 'day', status: 1 }
    const records = []
    for (let i = 0; i < 150; i++) {
      records.push({
        patientOpenid: 'u2', plan_id: 'p' + i, date: '2026-09-25', time_slot: 0,
        scheduled_time: '08:00', status: 'taken', create_time: new Date('2026-09-25T00:00:00Z')
      })
    }
    // 目标计划已有服药记录，但排在插入顺序最后（超出前 100 条）
    records.push({
      patientOpenid: 'u1', plan_id: 'p_target', date: '2026-09-25', time_slot: 0,
      scheduled_time: '08:00', status: 'taken', create_time: new Date('2026-09-25T00:01:00Z')
    })
    const db = createDb({ med_records: records })
    const cloud = loadCloudFunction('cloudfunctions/checkMedicationMissed/index.js', db)
    const todayRecords = await cloud.fetchTodayRecords('2026-09-25')
    const recordMap = cloud.groupRecordsByPlan(todayRecords)
    const inserted = await cloud.ensureMissedRecords([target], recordMap, new Date('2026-09-25T09:00:00+08:00'), '2026-09-25')
    check('T7 当天记录 >100 条时，已服药的计划不会被重复写成 missed', inserted.length === 0,
      `取回 ${todayRecords.length} 条，插入 ${inserted.length} 条 missed`)
  }

  // T8 文档 §6.3/§6.4 的端到端场景 + 重跑幂等
  {
    const plan = {
      _id: 'p_doc', patientOpenid: 'u1', med_name: '阿司匹林肠溶片', dosage: '每次1片',
      timeSlots: ['08:00', '08:10', '08:20'], cycle_type: 'day', cycle_detail: [], status: 1
    }
    const db = createDb({
      medication_plans: [plan],
      patient: [{ openid: 'u1', name: '张xx', status: 1 }],
      family_relations: [{ familyOpenid: 'f1', patientOpenid: 'u1', patientName: '张xx', relation: '子女', status: 1 }]
    })
    const sent = []
    const cloud = loadCloudFunction('cloudfunctions/checkMedicationMissed/index.js', db, (payload) => {
      sent.push(payload)
      return { errCode: 0 }
    })

    const first = await cloud.__main({ now: '2026-09-25 09:00' })
    const warning = (first.warnings || [])[0] || {}
    const missedRows = db.tables.med_records.docs.filter((doc) => doc.status === 'missed')
    check('T8a 三个时段均过点 → 写入 3 条 missed 记录', missedRows.length === 3, `写入 ${missedRows.length} 条`)
    check('T8b 达到阈值 → 给绑定家属发 1 条预警并记 success 日志',
      (first.warnings || []).length === 1 && warning.status === 'success' && sent.length === 1,
      `warnings=${(first.warnings || []).length} status=${warning.status} 实际发送=${sent.length}`)

    const second = await cloud.__main({ now: '2026-09-25 09:10' })
    check('T8c 重跑不重复写记录、不重复发预警',
      (second.insertedMissedRecords || []).length === 0 && (second.warnings || []).length === 0 && sent.length === 1,
      `第二轮 inserted=${(second.insertedMissedRecords || []).length} warnings=${(second.warnings || []).length} 累计发送=${sent.length}`)
  }

  return failures
}

// ---------------------------------------------------------------------------
// 入口：对每个时区各跑一次子进程
// ---------------------------------------------------------------------------

async function main() {
  if (process.env.HEALTH_TEST_SINGLE_TZ === '1') {
    const failures = await runSuite()
    if (failures.length) {
      console.log(`\n${failures.length} 项失败 ✗`)
      process.exit(1)
    }
    console.log('\n本时区全部通过 ✓')
    return
  }

  const summary = []
  for (const timezone of TIMEZONES) {
    const result = spawnSync(process.execPath, [__filename], {
      env: Object.assign({}, process.env, { TZ: timezone, HEALTH_TEST_SINGLE_TZ: '1' }),
      stdio: 'inherit'
    })
    summary.push({ timezone, ok: result.status === 0 })
  }

  console.log('\n===== 汇总 =====')
  summary.forEach((item) => console.log(`${item.ok ? 'PASS' : 'FAIL'}  TZ=${item.timezone}`))
  const failed = summary.filter((item) => !item.ok)
  if (failed.length) {
    console.log(`\n${failed.length}/${summary.length} 个时区失败 ✗`)
    process.exit(1)
  }
  console.log(`\n${summary.length}/${summary.length} 个时区全部通过 ✓`)
}

main().catch((error) => {
  console.error('测试自身异常:', error)
  process.exit(2)
})
