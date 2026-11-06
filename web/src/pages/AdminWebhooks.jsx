import React, { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { Modal, Field, Empty, icons, StatusPill } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

export default function AdminWebhooks() {
  useLang()
  const { user, showToast } = useApp()
  const [hooks, setHooks] = useState(null)
  const [events, setEvents] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [logs, setLogs] = useState(null)
  const [showSecret, setShowSecret] = useState(null)

  const canManage = user.permissions?.includes('*') || user.permissions?.includes('webhook:manage')

  const load = () => {
    api.get('/api/webhooks').then(setHooks).catch((e) => showToast(e.message, 'error'))
    api.get('/api/webhook-events').then(setEvents).catch(() => {})
  }
  useEffect(load, [])

  const openNew = () => {
    setForm({ name: '', url: '', events: ['instance.completed'], filters: [], enabled: true, retryOnFailure: true })
    setEditing('new')
  }
  const openEdit = (w) => { setForm({ ...w }); setEditing(w) }

  const save = async () => {
    try {
      if (editing === 'new') await api.post('/api/webhooks', form)
      else await api.patch(`/api/webhooks/${editing.id}`, { name: form.name, url: form.url, events: form.events, filters: form.filters, enabled: form.enabled, retryOnFailure: form.retryOnFailure })
      setEditing(null)
      load()
      showToast(t('已保存'))
    } catch (e) { showToast(e.message, 'error') }
  }

  const remove = async (id) => {
    try { await api.del(`/api/webhooks/${id}`); load() } catch (e) { showToast(e.message, 'error') }
  }

  const viewLogs = async (w) => {
    const l = await api.get(`/api/webhooks/${w.id}/logs`)
    setLogs({ webhook: w, rows: l })
  }

  const rotateSecret = async (w) => {
    try {
      const r = await api.post(`/api/webhooks/${w.id}/secret`)
      setShowSecret({ name: w.name, secret: r.secret })
      load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const toggleEvent = (ev) => {
    const has = form.events.includes(ev)
    setForm({ ...form, events: has ? form.events.filter((e) => e !== ev) : [...form.events, ev] })
  }

  return (
    <div className="sheet-pad">
      <div className="page-head">
        <div>
          <h1 className="page-title">Webhook</h1>
          <div className="page-sub">{t(t('事件推送：HMAC-SHA256 签名，失败自动重试 3 次（5s / 30s / 2min）'))}</div>
        </div>
        {canManage && <button className="btn btn-primary" onClick={openNew}>{icons.plus({})} {t('新建 Webhook')}</button>}
      </div>

      {hooks === null ? (
        <div className="text-muted">{t(t('加载中…'))}</div>
      ) : hooks.length === 0 ? (
        <Empty text={t('还没有 webhook。配置一个接收地址，订阅审批事件。')} action={
          canManage && <button className="btn btn-secondary btn-sm" onClick={openNew}>{t(t('新建 Webhook'))}</button>
        } />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr><th>{t(t('名称'))}</th><th>{t(t('接收地址'))}</th><th>{t(t('订阅事件'))}</th><th>{t(t('状态'))}</th><th style={{ width: 220 }}></th></tr>
            </thead>
            <tbody>
              {hooks.map((w, i) => (
                <motion.tr key={w.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                  <td style={{ fontWeight: 500 }} data-label={t('名称')}>{w.name}</td>
                  <td data-label={t('URL')}><code className="mono" style={{ wordBreak: 'break-all' }}>{w.url}</code></td>
                  <td className="text-small text-muted" data-label={t('事件')}>{(w.events || []).length} {t('个事件')}</td>
                  <td data-label={t('状态')}>{w.enabled ? <StatusPill status="approved" /> : <StatusPill status="cancelled" />}</td>
                  <td data-label=" ">
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => viewLogs(w)}>{t(t('日志'))}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => rotateSecret(w)}>{t(t('密钥'))}</button>
                      {canManage && <>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(w)}>{t(t('编辑'))}</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--negative)' }} onClick={() => remove(w.id)} aria-label={t('删除')}>×</button>
                      </>}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal
          title={editing === 'new' ? t('新建 Webhook') : t('编辑：{0}', editing.name)}
          onClose={() => setEditing(null)}
          width={560}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>{t(t('取消'))}</button>
            <button className="btn btn-primary" onClick={save} disabled={!form.name?.trim() || !form.url?.trim()}>{t(t('保存'))}</button>
          </>}
        >
          <Field label={t('名称')} required>
            <input className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('例如：OA 消息通知')} />
          </Field>
          <Field label={t('接收 URL')} required tip={t('POST JSON，头部携带 x-aiflow-signature（HMAC-SHA256(timestamp.body)）')}>
            <input className="input mono" value={form.url || ''} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://oa.example-corp.cn/hooks/aiflow" />
          </Field>
          <Field label={t('订阅事件')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {events.map((ev) => (
                <label key={ev} className="row" style={{ gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.events?.includes(ev)} onChange={() => toggleEvent(ev)} />
                  <code className="mono">{ev}</code>
                </label>
              ))}
            </div>
          </Field>
          <Field label={t('过滤条件（可选）')} tip={t('格式：payload路径 | 操作符 | 值，每行一条。操作符：eq / ne / contains')}>
            <textarea className="textarea" style={{ minHeight: 60 }}
              value={(form.filters || []).map((f) => `${f.field} | ${f.op} | ${f.value}`).join('\n')}
              onChange={(e) => setForm({
                ...form,
                filters: e.target.value.split('\n').filter((l) => l.trim()).map((line) => {
                  const [field, op, value] = line.split('|').map((s) => s.trim())
                  return { field, op: op || 'eq', value: value || '' }
                }),
              })} />
          </Field>
          <div className="row" style={{ gap: 24 }}>
            <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.enabled !== false} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              <span>{t(t('启用'))}</span>
            </label>
            <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.retryOnFailure !== false} onChange={(e) => setForm({ ...form, retryOnFailure: e.target.checked })} />
              <span>{t(t('失败自动重试'))}</span>
            </label>
          </div>
        </Modal>
      )}

      {logs && (
        <Modal title={t('派发日志：{0}', logs.webhook.name)} onClose={() => setLogs(null)} width={640}>
          {logs.rows.length === 0 ? (
            <div className="empty">{t(t('还没有派发记录。触发一次订阅的事件后再来看。'))}</div>
          ) : (
            <table className="table">
              <thead><tr><th>{t(t('时间'))}</th><th>{t(t('事件'))}</th><th>{t(t('结果'))}</th><th>{t(t('耗时'))}</th><th>{t(t('尝试'))}</th></tr></thead>
              <tbody>
                {logs.rows.map((l) => (
                  <tr key={l.id}>
                    <td className="text-small num" data-label={t('时间')}>{new Date(l.requestAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                    <td data-label={t('事件')}><code className="mono">{l.event}</code></td>
                    <td data-label={t('结果')}>{l.ok ? <span className="pill pill-positive">成功 {l.status}</span> : <span className="pill pill-negative">{l.error || t('失败')}</span>}</td>
                    <td className="num text-small" data-label={t('耗时')}>{l.durationMs}ms</td>
                    <td className="num text-small" data-label={t('重试')}>{t('第 {0} 次', l.attempt + 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {showSecret && (
        <Modal title={t('Webhook 签名密钥')} onClose={() => setShowSecret(null)}
          footer={<button className="btn btn-primary" onClick={() => setShowSecret(null)}>{t(t('我已保存'))}</button>}>
          <p className="text-small text-muted mb-16">
            {t('「{0}」的新密钥只显示这一次，请立即保存到接收方用于验签。', showSecret.name)}
          </p>
          <code className="mono" style={{ display: 'block', background: 'var(--raised)', padding: 12, borderRadius: 8, wordBreak: 'break-all' }}>
            {showSecret.secret}
          </code>
        </Modal>
      )}
    </div>
  )
}
