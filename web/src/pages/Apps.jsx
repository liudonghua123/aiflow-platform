import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { Empty, icons } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

// 应用中心：表单 + 流程打包成的一键发起入口
export default function Apps() {
  useLang()
  const { user, showToast } = useApp()
  const [apps, setApps] = useState(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [formId, setFormId] = useState('')
  const [flowId, setFlowId] = useState('')
  const [flows, setFlows] = useState([])
  const [forms, setForms] = useState([])

  const load = () => api.get('/api/apps').then(setApps).catch(() => {})
  useEffect(() => {
    load()
    api.get('/api/flows').then((fs) => setFlows(fs.filter((f) => f.published))).catch(() => {})
    api.get('/api/forms').then(setForms).catch(() => {})
  }, [])

  const canWrite = user.permissions?.includes('*') || user.permissions?.includes('app:write')

  const create = async () => {
    try {
      await api.post('/api/apps', { name, formId, flowId })
      setCreating(false); setName(''); setFormId(''); setFlowId('')
      load()
      showToast(t('应用已创建'))
    } catch (e) { showToast(e.message, 'error') }
  }

  return (
    <div className="sheet-pad">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t(t('应用中心'))}</h1>
          <div className="page-sub">{t(t('把表单与流程组合成业务应用，一键发起'))}</div>
        </div>
        {canWrite && <button className="btn btn-primary" onClick={() => setCreating(true)}>{icons.plus({})} {t('新建应用')}</button>}
      </div>

      {apps === null ? (
        <div className="text-muted">{t(t('加载中…'))}</div>
      ) : apps.length === 0 ? (
        <Empty text={t('还没有应用。把「请假申请」表单和「请假审批」流程组合成一个应用试试。')} action={
          canWrite && <button className="btn btn-secondary btn-sm" onClick={() => setCreating(true)}>{t(t('新建应用'))}</button>
        } />
      ) : (
        <div className="grid-3">
          {apps.map((a, i) => {
            const flow = flows.find((f) => f.id === a.flowId)
            return (
              <div className="card" key={a.id} style={{ position: 'relative' }}>
                <div className="card-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="card-title">{a.name}</div>
                    <div className="card-sub">{flow ? flow.name : t('未绑定流程')}</div>
                  </div>
                </div>
                <div className="card-pad" style={{ paddingTop: 0 }}>
                  <Link to="/start" className="btn btn-primary btn-sm">{icons.send({})} {t('去发起')}</Link>
                  {canWrite && (
                    <button className="btn btn-ghost btn-sm" style={{ position: 'absolute', top: 14, right: 12, color: 'var(--negative)' }}
                      onClick={async () => { await api.del(`/api/apps/${a.id}`); load() }} aria-label={t('删除应用')}>×</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {creating && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCreating(false) }}>
          <div className="modal">
            <div className="modal-head"><div className="modal-title">{t(t('新建应用'))}</div></div>
            <div className="modal-body">
              <div className="field">
                <label className="field-label">{t(t('应用名称'))}</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('例如：请假')} />
              </div>
              <div className="field">
                <label className="field-label">{t(t('绑定表单'))}</label>
                <select className="select" value={formId} onChange={(e) => setFormId(e.target.value)}>
                  <option value="">{t(t('无'))}</option>
                  {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">{t(t('绑定流程'))}</label>
                <select className="select" value={flowId} onChange={(e) => setFlowId(e.target.value)}>
                  <option value="">{t(t('无'))}</option>
                  {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setCreating(false)}>{t(t('取消'))}</button>
              <button className="btn btn-primary" disabled={!name.trim()} onClick={create}>{t(t('创建'))}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
