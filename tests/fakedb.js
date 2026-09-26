// 微信云开发数据库的最小仿真，用于在纯 Node 环境里跑回归测试（不需要微信开发者工具）。
//
// 支持：where / orderBy / skip / limit / get / add / doc().get|update|remove / serverDate / command.in
//
// ⚠️ 仿真了一条关键的平台行为：**云函数端 db.collection().get() 不显式传 limit 时最多返回 100 条**，
//    超出部分被静默丢弃（这也是本项目曾经踩的坑，见 tests/regression.test.js 的 T5/T7）。
//    小程序端的 20 条上限没有在这里仿真 —— 端上代码始终显式传 .limit(20)，见 miniprogram/utils/medication.js。
//
// 说明：这是测试替身，不是数据库实现；只会实现被测代码真正用到的那部分语义。
const DEFAULT_CLOUD_LIMIT = 100

// add() 的自增 id 必须全局唯一（真实云数据库如此）；按表计数会在 seed 与后续写入之间撞 id
let GLOBAL_SEQ = 0

const IN = Symbol('in')

const command = {
  in: (values) => ({ [IN]: values })
}

function matches(doc, where) {
  return Object.entries(where || {}).every(([key, value]) => {
    if (value && typeof value === 'object' && IN in value) {
      return value[IN].includes(doc[key])
    }
    return doc[key] === value
  })
}

class Query {
  constructor(store, where) {
    this.store = store
    this.where = where || {}
    this.orders = []
    this.skipN = 0
    this.limitN = null
  }

  where(where) {
    const query = new Query(this.store, Object.assign({}, this.where, where))
    query.orders = this.orders
    query.skipN = this.skipN
    query.limitN = this.limitN
    return query
  }

  orderBy(field, direction) {
    const query = new Query(this.store, this.where)
    query.orders = this.orders.concat([[field, direction || 'asc']])
    query.skipN = this.skipN
    query.limitN = this.limitN
    return query
  }

  skip(count) {
    const query = new Query(this.store, this.where)
    query.orders = this.orders
    query.skipN = count
    query.limitN = this.limitN
    return query
  }

  limit(count) {
    const query = new Query(this.store, this.where)
    query.orders = this.orders
    query.skipN = this.skipN
    query.limitN = count
    return query
  }

  async get() {
    let list = this.store.filter((doc) => matches(doc, this.where))
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const [field, direction] = this.orders[i]
      list = list.slice().sort((a, b) => {
        const av = a[field]
        const bv = b[field]
        const cmp = av === bv ? 0 : av < bv ? -1 : 1
        return direction === 'desc' ? -cmp : cmp
      })
    }
    const cap = this.limitN === null ? DEFAULT_CLOUD_LIMIT : this.limitN
    return { data: list.slice(this.skipN, this.skipN + cap).map((doc) => Object.assign({}, doc)) }
  }

  async add({ data }) {
    return this.store.add(data)
  }

  doc(id) {
    const store = this.store
    return {
      async get() {
        return { data: store.docs.find((doc) => doc._id === id) || null }
      },
      async update({ data }) {
        const target = store.docs.find((doc) => doc._id === id)
        if (target) Object.assign(target, data)
        return { stats: { updated: target ? 1 : 0 } }
      },
      async remove() {
        const index = store.docs.findIndex((doc) => doc._id === id)
        if (index >= 0) store.docs.splice(index, 1)
        return { stats: { removed: index >= 0 ? 1 : 0 } }
      }
    }
  }
}

class Table {
  constructor(name) {
    this.name = name
    this.docs = []
  }

  add(arg) {
    // 云开发的调用形状是 add({ data })，同时兼容直接传对象
    const data = arg && Object.prototype.hasOwnProperty.call(arg, 'data') ? arg.data : arg
    const doc = Object.assign({}, data)
    if (doc._id === undefined) doc._id = this.name + '_auto_' + ++GLOBAL_SEQ
    if (this.docs.some((existing) => existing._id === doc._id)) {
      const error = new Error('duplicate _id: ' + doc._id)
      error.errCode = -502001
      throw error
    }
    this.docs.push(doc)
    return { _id: doc._id }
  }

  where(where) {
    return new Query(this.docs, where)
  }

  doc(id) {
    return new Query(this.docs, {}).doc(id)
  }

  orderBy(field, direction) {
    return new Query(this.docs, {}).orderBy(field, direction)
  }

  limit(count) {
    return new Query(this.docs, {}).limit(count)
  }

  async get() {
    return new Query(this.docs, {}).get()
  }
}

function createDb(seed) {
  const tables = {}
  const db = {
    tables,
    command,
    serverDate: () => new Date(),
    collection(name) {
      if (!tables[name]) tables[name] = new Table(name)
      return tables[name]
    },
    seed(name, docs) {
      const table = db.collection(name)
      docs.forEach((doc) => table.add(doc))
      return table
    }
  }
  Object.entries(seed || {}).forEach(([name, docs]) => db.seed(name, docs))
  return db
}

module.exports = { createDb, DEFAULT_CLOUD_LIMIT, command, Table, Query }
