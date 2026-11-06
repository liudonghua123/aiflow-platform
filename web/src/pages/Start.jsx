import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { FieldPreview } from './FormDesigner.jsx'
import { Empty, icons } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

// 发起申请：选流程 → 填绑定表单 → 提交
export default function Start() {
  useLang()
  const { showToast } = useApp()
  const [flows, setFlows] = useState(null)
  const [forms, setForms] = useState([])
  const [flowId, setFlowId] = useState('')
  const [form, setForm] = useState(null)
  const [values, setValues] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/api/flows').then((fs) => {
      setFlows(fs.filter((f) => f.published))
      if (fs.filter((f) => f.published).length === 1) setFlowId(fs.filter((f) => f.published)[0].id)
    }).catch(() => {})
    api.get('/api/forms').then(setForms).catch(() => {})
  }, [])

  useEffect(() => {
    if (!flowId) { setForm(null); return }
    const flow = flows?.find((f) => f.id === flowId)
    if (!flow?.formId) { setForm(null); return }
    api.get(`/api/forms/${flow.formId}`).then((f) => {
      setForm(f)
      setValues({})
    }).catch(() => setForm(null))
  }, [flowId, flows])

  const submit = async () => {
    if (!flowId) return
    // 必填校验
    if (form) {
      for (const f of form.schema?.fields || []) {
        if (f.required && (values[f.key] === undefined || values[f.key] === '' || values[f.key] === null)) {
          showToast(t('请填写「{0}」', f.label), 'error')
          return
        }
      }
    }
    setSubmitting(true)
    try {
      const inst = await api.post('/api/instances', { flowId, formData: values })
      showToast(t('申请已提交'))
      navigate(`/instances/${inst.id}`)
    } catch (e) { showToast(e.message, 'error') }
    finally { setSubmitting(false) }
  }

  const publishedFlows = flows || []

  return (
    <div className="sheet-pad" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t(t('发起申请'))}</h1>
          <div className="page-sub">{t(t('选择流程，填写表单后提交进入审批'))}</div>
        </div>
      </div>

      {flows === null ? (
        <div className="text-muted">{t(t('加载中…'))}</div>
      ) : publishedFlows.length === 0 ? (
        <Empty text={t('还没有已发布的流程。请先在「流程设计」中创建并发布。')} />
      ) : (
        <>
          <div className="field">
            <label className="field-label">{t(t('选择流程'))}</label>
            <select className="select" value={flowId} onChange={(e) => setFlowId(e.target.value)}>
              <option value="">{t(t('请选择流程'))}</option>
              {publishedFlows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          {form ? (
            <div className="card card-pad mt-16">
              <div className="card-title mb-16">{form.name}</div>
              {(form.schema?.fields || []).map((f) => (
                <div className="field" key={f.key}>
                  <label className="field-label">
                    {f.label}
                    {f.required && <span style={{ color: 'var(--negative)' }}> *</span>}
                  </label>
                  <FieldPreview field={f} value={values[f.key]} onChange={(v) => setValues({ ...values, [f.key]: v })} />
                  {f.tip && <div className="field-tip">{f.tip}</div>}
                </div>
              ))}
            </div>
          ) : flowId && (
            <div className="card card-pad mt-16">
              <div className="text-muted text-small">{t(t('该流程未绑定表单，可直接提交。'))}</div>
            </div>
          )}

          {flowId && (
            <div className="row mt-24" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" style={{ height: 40, padding: '0 24px' }} onClick={submit} disabled={submitting}>
                {icons.send({})} {submitting ? t('提交中…') : t('提交申请')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
