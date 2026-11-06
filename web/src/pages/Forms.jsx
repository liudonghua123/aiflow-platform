import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { Modal, Empty, Field, icons } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

export default function Forms() {
  useLang()
  const { user, showToast } = useApp()
  const [forms, setForms] = useState(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const navigate = useNavigate()

  const load = () => api.get('/api/forms').then(setForms).catch((e) => showToast(e.message, 'error'))
  useEffect(() => { load() }, [])

  const canWrite = user.permissions?.includes('*') || user.permissions?.includes('form:write')

  const create = async () => {
    try {
      const f = await api.post('/api/forms', { name, description: desc, schema: { fields: [] } })
      setCreating(false); setName(''); setDesc('')
      navigate(`/forms/${f.id}`)
    } catch (e) { showToast(e.message, 'error') }
  }

  const aiCreate = async () => {
    if (!aiPrompt.trim()) return
    setAiBusy(true)
    try {
      const schema = await api.post('/api/ai/form', { prompt: aiPrompt })
      const f = await api.post('/api/forms', { name: schema.name, description: schema.description, schema })
      showToast(t('AI 已生成表单结构，可继续调整'))
      setCreating(false); setAiPrompt('')
      navigate(`/forms/${f.id}`)
    } catch (e) { showToast(e.message, 'error') }
    finally { setAiBusy(false) }
  }

  return (
    <div className="sheet-pad">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t(t('表单设计'))}</h1>
          <div className="page-sub">{t(t('可视化拖拽设计表单，或让 AI 按描述直接生成'))}</div>
        </div>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>{icons.plus({})} {t('新建表单')}</button>
        )}
      </div>

      {forms === null ? (
        <div className="text-muted">{t(t('加载中…'))}</div>
      ) : forms.length === 0 ? (
        <Empty text={t('还没有表单。新建一张，或用 AI 一句话生成。')} action={
          canWrite && <button className="btn btn-secondary btn-sm" onClick={() => setCreating(true)}>{t(t('新建表单'))}</button>
        } />
      ) : (
        <div className="grid-3">
          <AnimatePresence>
            {forms.map((f, i) => (
              <motion.div
                key={f.id}
                className="card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.22 }}
              >
                <div className="card-head">
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/forms/${f.id}`} className="card-title" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</Link>
                    <div className="card-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.description || t('暂无描述')}</div>
                  </div>
                </div>
                <div className="card-pad" style={{ paddingTop: 0 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="text-small text-muted num">{t('{0} 个字段', f.schema?.fields?.length || 0)} · v{f.version || 1}</span>
                    <Link to={`/forms/${f.id}`} className="btn btn-secondary btn-sm">{t(t('编辑'))}</Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {creating && (
        <Modal
          title={t('新建表单')}
          onClose={() => setCreating(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setCreating(false)}>{t(t('取消'))}</button>
            <button className="btn btn-primary" disabled={!name.trim()} onClick={create}>{t(t('创建并设计'))}</button>
          </>}
        >
          <Field label={t('AI 生成')} tip={t('一句话描述表单用途，AI 生成字段结构（未配置 AI 时使用内置模板）')}>
            <div className="row" style={{ alignItems: 'stretch' }}>
              <input
                className="input" style={{ height: 40 }}
                placeholder={t('例如：差旅报销单，需要费用明细和发票上传')}
                value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') aiCreate() }}
              />
              <button className="btn btn-secondary" onClick={aiCreate} disabled={aiBusy} style={{ height: 40 }}>
                {icons.sparkles({})} {aiBusy ? t('生成中…') : t('生成')}
              </button>
            </div>
          </Field>
          <div className="row" style={{ margin: '4px 0 16px', gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
            <span className="text-small text-muted">{t(t('或手动创建'))}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
          </div>
          <Field label={t('表单名称')} required>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('例如：请假申请')} />
          </Field>
          <Field label={t('描述')}>
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('表单用途说明')} />
          </Field>
        </Modal>
      )}
    </div>
  )
}
