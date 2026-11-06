import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { Modal, Empty, Field, StatusPill, icons } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

export default function Flows() {
  useLang()
  const { user, showToast } = useApp()
  const [flows, setFlows] = useState(null)
  const [forms, setForms] = useState([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [formId, setFormId] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const navigate = useNavigate()

  const load = () => api.get('/api/flows').then(setFlows).catch((e) => showToast(e.message, 'error'))
  useEffect(() => {
    load()
    api.get('/api/forms').then(setForms).catch(() => {})
  }, [])

  const canWrite = user.permissions?.includes('*') || user.permissions?.includes('flow:write')
  const canPublish = user.permissions?.includes('*') || user.permissions?.includes('flow:publish')

  const create = async () => {
    try {
      const f = await api.post('/api/flows', { name, formId, definition: null })
      setCreating(false); setName(''); setFormId('')
      navigate(`/flows/${f.id}`)
    } catch (e) { showToast(e.message, 'error') }
  }

  const aiCreate = async () => {
    if (!aiPrompt.trim()) return
    setAiBusy(true)
    try {
      const def = await api.post('/api/ai/flow', { prompt: aiPrompt, formId: formId || undefined })
      const f = await api.post('/api/flows', { name: def.name || aiPrompt.slice(0, 20), formId, definition: def })
      setCreating(false); setAiPrompt('')
      navigate(`/flows/${f.id}`)
    } catch (e) { showToast(e.message, 'error') }
    finally { setAiBusy(false) }
  }

  const publish = async (id) => {
    try {
      await api.post(`/api/flows/${id}/publish`)
      showToast(t('流程已发布'))
      load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const remove = async (id) => {
    try { await api.del(`/api/flows/${id}`); load() } catch (e) { showToast(e.message, 'error') }
  }

  return (
    <div className="sheet-pad">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t(t('流程设计'))}</h1>
          <div className="page-sub">{t(t('可视化编排审批节点、条件分支、并行会签与抄送'))}</div>
        </div>
        {canWrite && <button className="btn btn-primary" onClick={() => setCreating(true)}>{icons.plus({})} {t('新建流程')}</button>}
      </div>

      {flows === null ? (
        <div className="text-muted">{t(t('加载中…'))}</div>
      ) : flows.length === 0 ? (
        <Empty text={t('还没有审批流程。新建一条，或让 AI 按审批规则生成。')} action={
          canWrite && <button className="btn btn-secondary btn-sm" onClick={() => setCreating(true)}>{t(t('新建流程'))}</button>
        } />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr><th>{t(t('流程'))}</th><th>{t(t('绑定表单'))}</th><th>{t(t('节点数'))}</th><th>{t(t('状态'))}</th><th style={{ width: 200 }}></th></tr>
            </thead>
            <tbody>
              {flows.map((f, i) => {
                const boundForm = forms.find((x) => x.id === f.formId)
                return (
                  <motion.tr key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                    <td data-label={t('流程')}>
                      <Link to={`/flows/${f.id}`} style={{ fontWeight: 500 }}>{f.name}</Link>
                    </td>
                    <td className="text-muted" data-label={t('绑定表单')}>{boundForm ? boundForm.name : <span className="text-small">{t(t('未绑定'))}</span>}</td>
                    <td className="num" data-label={t('节点数')}>{f.definition?.nodes?.length || 0}</td>
                    <td data-label={t('状态')}>{f.published ? <StatusPill status="approved" /> : <StatusPill status="pending" />}</td>
                    <td data-label=" ">
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <Link to={`/flows/${f.id}`} className="btn btn-secondary btn-sm">{t(t('设计'))}</Link>
                        {!f.published && canPublish && <button className="btn btn-primary btn-sm" onClick={() => publish(f.id)}>{t(t('发布'))}</button>}
                        {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => remove(f.id)} style={{ color: 'var(--negative)' }} aria-label={t('删除')}>×</button>}
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <Modal
          title={t('新建流程')}
          onClose={() => setCreating(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setCreating(false)}>{t(t('取消'))}</button>
            <button className="btn btn-primary" disabled={!name.trim()} onClick={create}>{t(t('创建并设计'))}</button>
          </>}
        >
          <Field label={t('AI 生成')} tip={t('描述审批规则，如：金额超过 5000 元需要总监和财务审批')}>
            <div className="row" style={{ alignItems: 'stretch' }}>
              <input className="input" style={{ height: 40 }} placeholder={t('描述你的审批规则…')}
                value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') aiCreate() }} />
              <button className="btn btn-secondary" style={{ height: 40 }} onClick={aiCreate} disabled={aiBusy}>
                {icons.sparkles({})} {aiBusy ? t('生成中…') : t('生成')}
              </button>
            </div>
          </Field>
          <div className="row" style={{ margin: '4px 0 16px', gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
            <span className="text-small text-muted">{t(t('或手动创建'))}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
          </div>
          <Field label={t('流程名称')} required>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('例如：采购审批')} />
          </Field>
          <Field label={t('绑定表单')} tip={t('绑定后，条件分支可引用表单字段')}>
            <select className="select" value={formId} onChange={(e) => setFormId(e.target.value)}>
              <option value="">{t(t('暂不绑定'))}</option>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        </Modal>
      )}
    </div>
  )
}
