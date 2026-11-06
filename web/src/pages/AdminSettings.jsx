import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { Field, icons } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

export default function AdminSettings() {
  useLang()
  const { user, showToast } = useApp()
  const [items, setItems] = useState(null)
  const [ssoGroups, setSsoGroups] = useState([])
  const [draft, setDraft] = useState({}) // key → 输入值
  const [saving, setSaving] = useState(false)
  const [savedKeys, setSavedKeys] = useState(new Set())
  const [status, setStatus] = useState(null)

  const canManage = user.permissions?.includes('*') || user.permissions?.includes('setting:manage')

  const load = () => {
    api.get('/api/platform-config').then((d) => {
      setItems(d.items)
      setSsoGroups(d.ssoGroups || [])
      const init = {}
      for (const it of d.items) init[it.key] = it.secret ? '' : it.value
      setDraft(init)
    }).catch(() => {})
    api.get('/api/ai/status').then(setStatus).catch(() => {})
  }
  useEffect(load, [])

  const groups = useMemo(() => {
    const g = { ai: [], general: [] }
    for (const it of items || []) {
      if (it.group === 'ai') g.ai.push(it)
      else if (it.group.startsWith('sso:')) { /* SSO 由 ssoGroups 渲染 */ }
      else g.general.push(it)
    }
    return g
  }, [items])

  const save = async () => {
    setSaving(true)
    try {
      // 只提交有输入的项（secret 留空 = 不改）
      const values = {}
      for (const [k, v] of Object.entries(draft)) {
        if (v !== '' && v !== undefined) values[k] = v
      }
      await api.put('/api/platform-config', { values })
      setSavedKeys(new Set(Object.keys(values)))
      setTimeout(() => setSavedKeys(new Set()), 2000)
      showToast(t('配置已保存，立即生效'))
      load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))

  const renderField = (it) => (
    <Field key={it.key} label={it.label + (it.fromDb ? '' : t('（来自环境变量）'))} tip={it.key}>
      <input
        className="input mono"
        type={it.secret ? 'password' : 'text'}
        value={draft[it.key] ?? ''}
        placeholder={it.secret ? (it.hasValue ? '••••••••（已配置，留空不修改）' : t('未配置')) : (it.value || t('未配置'))}
        onChange={(e) => set(it.key, e.target.value)}
        disabled={!canManage}
      />
    </Field>
  )

  return (
    <div className="sheet-pad" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t(t('平台设置'))}</h1>
          <div className="page-sub">{t(t('配置初始来自 .env，入库后可在此直接修改，保存即生效无需重启'))}</div>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={save} disabled={saving || !items}>
            {saving ? t('保存中…') : t('保存全部修改')}
          </button>
        )}
      </div>

      {/* ---- AI ---- */}
      <div className="card card-pad mb-24">
        <div className="card-title mb-16">{t(t('AI 表单 / 流程生成'))}</div>
        <div className="row mb-16" style={{ gap: 8 }}>
          <span className={`pill ${status?.enabled ? 'pill-positive' : 'pill-warning'}`}>
            {status?.enabled ? t('已连接') : t('未配置（使用内置模板兜底）')}
          </span>
        </div>
        {(groups.ai || []).map(renderField)}
      </div>

      {/* ---- SSO：按提供方分组 ---- */}
      {ssoGroups.map((grp) => {
        const fields = (items || []).filter((it) => it.group === `sso:${grp.key}`)
        return (
          <div key={grp.key} className="card card-pad mb-24">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <div className="card-title">{t(grp.label)}</div>
              <span className={`pill ${grp.enabled ? 'pill-positive' : 'pill-neutral'}`}>
                {grp.enabled ? t('已启用') : t('未启用')}
              </span>
            </div>
            <div className="card-sub mb-16">{grp.desc}</div>
            {fields.map(renderField)}
          </div>
        )
      })}

      {/* ---- 通用 ---- */}
      <div className="card card-pad mb-24">
        <div className="card-title mb-16">{t(t('通用'))}</div>
        {(groups.general || []).map(renderField)}
      </div>

      {/* ---- SSO 连接状态 ---- */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t(t('SSO / 组织架构对接状态'))}</div>
            <div className="card-sub">{t(t('保存配置后刷新此处查看当前可用性'))}</div>
          </div>
        </div>
        <SsoTable />
      </div>
    </div>
  )
}

function SsoTable() {
  const [providers, setProviders] = useState([])
  useEffect(() => {
    api.get('/api/auth/sso/providers').then((d) => setProviders(d.providers)).catch(() => {})
  }, [])
  return (
    <table className="table">
      <thead><tr><th>{t(t('提供方'))}</th><th>{t(t('协议'))}</th><th>{t(t('单点登录'))}</th><th>{t(t('组织架构同步'))}</th></tr></thead>
      <tbody>
        {providers.map((p) => (
          <tr key={p.key}>
            <td style={{ fontWeight: 500 }} data-label={t('提供方')}>{p.label}</td>
            <td data-label={t('标识')}><code className="mono">{p.key}</code></td>
            <td data-label={t('状态')}>{p.enabled ? <span className="pill pill-positive">{t(t('可用'))}</span> : <span className="pill pill-neutral">{t(t('未配置'))}</span>}</td>
            <td data-label={t('同步')}>{p.syncable ? (p.enabled ? <span className="pill pill-positive">{t(t('可用'))}</span> : <span className="pill pill-neutral">{t(t('未配置'))}</span>) : <span className="text-muted text-small">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
