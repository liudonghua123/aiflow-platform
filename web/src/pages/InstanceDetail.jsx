import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { FieldPreview } from './FormDesigner.jsx'
import { StatusPill, Avatar, icons } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

const ACTION_LABEL = { submit: t('提交'), approve: t('通过'), reject: t('驳回'), cancel: t('撤销') }

export default function InstanceDetail() {
  useLang()
  const { id } = useParams()
  const { showToast, user } = useApp()
  const [inst, setInst] = useState(null)
  const [form, setForm] = useState(null)
  const [comment, setComment] = useState('')

  const load = () => api.get(`/api/instances/${id}`).then((i) => {
    setInst(i)
    if (i.formId) api.get(`/api/forms/${i.formId}`).then(setForm).catch(() => {})
  }).catch((e) => showToast(e.message, 'error'))
  useEffect(() => { load() }, [id])

  const act = async (action) => {
    const taskId = inst.viewer.myTasks.find((t) => t.status === 'pending')?.id
    if (!taskId) return
    try {
      await api.post(`/api/instances/${id}/tasks/${taskId}`, { action, comment })
      showToast(action === 'approve' ? t('已通过') : action === 'reject' ? t('已驳回') : t('已撤销'))
      setComment('')
      load()
    } catch (e) { showToast(e.message, 'error') }
  }

  if (!inst) return <div className="sheet-pad text-muted">{t(t('加载中…'))}</div>

  const submitter = inst.submitterId
  const fmtTime = (iso) => new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="sheet-pad">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <Link to="/" className="btn btn-ghost btn-sm" aria-label={t('返回')}>{icons.exit({})}</Link>
            <h1 className="page-title">{inst.title}</h1>
            <StatusPill status={inst.status} />
          </div>
          <div className="page-sub">{inst.flowName} · {fmtTime(inst.createdAt)} {t('发起')}</div>
        </div>
        <div className="row">
          {inst.viewer?.canApprove && (
            <>
              <button className="btn btn-danger" onClick={() => act('reject')}>{t(t('驳回'))}</button>
              <button className="btn btn-primary" onClick={() => act('approve')}>{icons.check({})} {t('通过')}</button>
            </>
          )}
          {inst.viewer?.isSubmitter && inst.status === 'running' && (
            <button className="btn btn-secondary" onClick={() => act('cancel')}>{t(t('撤销申请'))}</button>
          )}
        </div>
      </div>

      {inst.viewer?.canApprove && (
        <div className="card card-pad mb-24">
          <Field label="">
            <input className="input" placeholder={t('审批意见（可选）')} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1.2fr', alignItems: 'start' }}>
        {/* 表单数据 */}
        <div className="card card-pad">
          <div className="card-title mb-16">{t(t('申请内容'))}</div>
          {form ? (
            (form.schema?.fields || []).map((f) => (
              <div className="field" key={f.key}>
                <label className="field-label">{f.label}</label>
                <FieldPreview field={f} value={inst.formData?.[f.key]} disabled />
              </div>
            ))
          ) : (
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', background: 'var(--raised)', padding: 12, borderRadius: 8 }}>
              {JSON.stringify(inst.formData, null, 2)}
            </pre>
          )}
        </div>

        {/* 流转历史 */}
        <div className="card card-pad">
          <div className="card-title mb-16">{t(t('流转记录'))}</div>
          {(inst.history || []).map((h, i) => {
            const u = null
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="row"
                style={{ alignItems: 'flex-start', padding: '10px 0', borderBottom: i < inst.history.length - 1 ? '1px solid var(--rule)' : 'none', gap: 12 }}
              >
                <Avatar name={h.userName || '·'} size={28} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>
                    {h.userName || h.nodeName || '—'}
                    <span className="text-muted" style={{ fontWeight: 400 }}> {ACTION_LABEL[h.action] || h.action}</span>
                    {h.nodeName && <span className="text-small text-muted"> · {h.nodeName}</span>}
                  </div>
                  {h.comment && <div className="text-small text-muted mt-8" style={{ marginTop: 2 }}>{h.comment}</div>}
                </div>
                <span className="text-small text-muted num">{fmtTime(h.at)}</span>
              </motion.div>
            )
          })}
          {(inst.history || []).length === 0 && <div className="text-muted text-small">{t(t('暂无记录'))}</div>}
          {inst.error && <div className="pill pill-warning mt-16">{inst.error}</div>}
        </div>
      </div>
    </div>
  )
}
