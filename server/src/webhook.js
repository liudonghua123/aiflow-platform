// Webhook 引擎：可定制订阅（事件 + 过滤条件）→ HMAC 签名 POST → 失败重试（指数退避）
import crypto from 'node:crypto'
import { db, uid, nowISO } from './db.js'

const webhooks = db('webhooks')
const webhookLogs = db('webhook_logs')

export const WEBHOOK_EVENTS = [
  'form.created', 'form.updated', 'form.deleted',
  'flow.created', 'flow.updated', 'flow.published', 'flow.deleted',
  'instance.started', 'instance.approved', 'instance.rejected', 'instance.completed', 'instance.cancelled',
  'task.created', 'task.completed',
  'user.created', 'user.updated',
]

export const MAX_RETRIES = 3
const RETRY_DELAYS = [5_000, 30_000, 120_000] // 5s / 30s / 2min

function sign(secret, body, timestamp) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

// 派发：找出匹配该事件的所有启用的 webhook
export async function dispatchEvent(event, payload) {
  const subs = webhooks.filter((w) => w.enabled && (w.events || []).includes(event))
  for (const w of subs) {
    // 自定义过滤条件：{ field: 'payload 路径', op: 'eq|ne|contains', value }
    if (w.filters?.length) {
      const pass = w.filters.every((f) => {
        const actual = f.field.split('.').reduce((o, k) => o?.[k], payload)
        switch (f.op) {
          case 'eq': return String(actual) === String(f.value)
          case 'ne': return String(actual) !== String(f.value)
          case 'contains': return String(actual ?? '').includes(String(f.value))
          default: return true
        }
      })
      if (!pass) continue
    }
    deliver(w, event, payload, 0)
  }
}

async function deliver(webhook, event, payload, attempt) {
  const body = JSON.stringify({
    event, payload, attempt, timestamp: nowISO(), deliveryId: uid('dlv'),
  })
  const timestamp = Date.now().toString()
  const headers = {
    'content-type': 'application/json',
    'x-aiflow-event': event,
    'x-aiflow-timestamp': timestamp,
    'x-aiflow-signature': sign(webhook.secret, body, timestamp),
  }
  let ok = false, status = 0, error = ''
  const started = Date.now()
  try {
    const res = await fetch(webhook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) })
    status = res.status
    ok = res.ok
    if (!ok) error = `HTTP ${res.status}`
  } catch (e) {
    error = String(e.message || e)
  }
  const durationMs = Date.now() - started
  webhookLogs.insert({
    webhookId: webhook.id, event, attempt, ok, status, error, durationMs,
    requestAt: nowISO(),
  })
  // 只保留最近 500 条日志
  if (webhookLogs.all().length > 500) {
    const oldest = webhookLogs.all().slice(0, webhookLogs.all().length - 500)
    for (const row of oldest) webhookLogs.remove(row.id)
  }
  if (!ok && attempt < MAX_RETRIES && webhook.retryOnFailure !== false) {
    setTimeout(() => deliver(webhook, event, payload, attempt + 1), RETRY_DELAYS[attempt] || 120_000)
  }
}

// 手动重发
export function redeliver(logId) {
  const log = webhookLogs.get(logId)
  if (!log) return null
  const w = webhooks.get(log.webhookId)
  if (!w) return null
  deliver(w, log.event, { redelivered: true, originalAt: log.requestAt }, 0)
  return true
}
