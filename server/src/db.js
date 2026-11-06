// 数据层：JSON 文件存储。每个 collection 一个文件，进程内缓存 + 写入即落盘。
// 生产可替换为 SQLite/PostgreSQL —— 本层即隔离边界，业务代码只依赖这里的 API。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data')
fs.mkdirSync(DATA_DIR, { recursive: true })

export function uid(prefix = '') {
  const id = crypto.randomBytes(9).toString('base64url')
  return prefix ? `${prefix}_${id}` : id
}

export function nowISO() {
  return new Date().toISOString()
}

const stores = new Map()

export function db(name, seed = []) {
  if (stores.has(name)) return stores.get(name)
  const file = path.join(DATA_DIR, `${name}.json`)
  let rows = []
  try {
    rows = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    rows = seed
    fs.writeFileSync(file, JSON.stringify(rows, null, 2))
  }
  const store = {
    get rows() { return rows },
    find(pred) { return rows.find(pred) || null },
    filter(pred) { return rows.filter(pred) },
    all() { return [...rows] },
    get(id) { return rows.find((r) => r.id === id) || null },
    insert(row) {
      if (!row.id) row.id = uid()
      if (!row.createdAt) row.createdAt = nowISO()
      rows.push(row)
      this.flush()
      return row
    },
    update(id, patch) {
      const row = rows.find((r) => r.id === id)
      if (!row) return null
      Object.assign(row, patch, { updatedAt: nowISO() })
      this.flush()
      return row
    },
    remove(id) {
      const i = rows.findIndex((r) => r.id === id)
      if (i === -1) return false
      rows.splice(i, 1)
      this.flush()
      return true
    },
    flush() {
      fs.writeFileSync(file, JSON.stringify(rows, null, 2))
    },
  }
  stores.set(name, store)
  return store
}
