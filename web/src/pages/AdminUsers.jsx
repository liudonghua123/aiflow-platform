import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { Modal, Field, Avatar, icons } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

export default function AdminUsers() {
  useLang()
  const { user, showToast } = useApp()
  const [users, setUsers] = useState(null)
  const [roles, setRoles] = useState([])
  const [depts, setDepts] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | user
  const [form, setForm] = useState({})

  const canManage = user.permissions?.includes('*') || user.permissions?.includes('user:manage')

  const load = () => {
    api.get('/api/users').then(setUsers).catch((e) => showToast(e.message, 'error'))
    api.get('/api/roles').then(setRoles).catch(() => {})
    api.get('/api/org/tree').then(flat).catch(() => {})
  }
  useEffect(load, [])

  function flat(tree, out = [], prefix = '') {
    for (const d of tree) {
      out.push({ id: d.id, name: prefix + d.name })
      flat(d.children || [], out, prefix + d.name + ' / ')
    }
    setDepts(out)
    return out
  }

  const openNew = () => { setForm({ username: '', password: '', name: '', departmentId: '', roleIds: ['role_member'], mfaPolicy: 'auto' }); setEditing('new') }
  const openEdit = (u) => { setForm({ ...u, password: '', mfaPolicy: u.mfaPolicy || 'auto' }); setEditing(u) }

  const save = async () => {
    try {
      if (editing === 'new') {
        await api.post('/api/users', form)
      } else {
        const patch = { name: form.name, departmentId: form.departmentId, roleIds: form.roleIds, mfaPolicy: form.mfaPolicy || 'auto' }
        if (form.password) patch.password = form.password
        await api.patch(`/api/users/${editing.id}`, patch)
      }
      setEditing(null)
      load()
      showToast(t('已保存'))
    } catch (e) { showToast(e.message, 'error') }
  }

  const remove = async (id) => {
    try { await api.del(`/api/users/${id}`); load(); showToast(t('已删除')) } catch (e) { showToast(e.message, 'error') }
  }

  return (
    <div className="sheet-pad">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t(t('用户与角色'))}</h1>
          <div className="page-sub">{t(t('基于 RBAC 的账号与权限管理'))}</div>
        </div>
        {canManage && <button className="btn btn-primary" onClick={openNew}>{icons.plus({})} {t('新建用户')}</button>}
      </div>

      <div className="card mb-24">
        <table className="table">
          <thead>
            <tr><th>{t(t('用户'))}</th><th>{t(t('用户名'))}</th><th>{t(t('部门'))}</th><th>{t(t('角色'))}</th><th>{t(t('登录方式'))}</th><th>{t(t('二次验证'))}</th><th style={{ width: 130 }}></th></tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr><td colSpan={7} className="text-muted">{t(t('加载中…'))}</td></tr>
            ) : users.map((u) => (
              <tr key={u.id}>
                <td data-label={t('用户')}>
                  <div className="row" style={{ gap: 10 }}>
                    <Avatar name={u.name} />
                    <span style={{ fontWeight: 500 }}>{u.name}</span>
                    {u.status !== 'active' && <span className="pill pill-neutral">{t(t('停用'))}</span>}
                  </div>
                </td>
                <td data-label={t('账号')}><code className="mono">{u.username}</code></td>
                <td className="text-muted" data-label={t('部门')}>{u.departmentName || '—'}</td>
                <td data-label={t('角色')}>
                  <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {(u.roleIds || []).map((rid) => {
                      const r = roles.find((x) => x.id === rid)
                      return r ? <span key={rid} className="pill pill-accent">{r.name}</span> : null
                    })}
                  </div>
                </td>
                <td className="text-small text-muted" data-label={t('登录方式')}>
                  {[u.hasPassword && t('本地'), ...(u.identities || [])].filter(Boolean).join(' · ') || '—'}
                </td>
                <td data-label={t('二次验证')}>
                  {u.mfaPolicy === 'otp' ? <span className="pill pill-accent">OTP</span>
                    : u.mfaPolicy === 'passkey' ? <span className="pill pill-accent">Passkey</span>
                    : u.mfaPolicy === 'none' ? <span className="text-muted text-small">{t('不强制')}</span>
                    : <span className="text-muted text-small">{t('跟随角色')}</span>}
                </td>
                <td data-label=" ">
                  {canManage && (
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>{t(t('编辑'))}</button>
                      {u.id !== user.id && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--negative)' }} onClick={() => remove(u.id)} aria-label={t('删除')}>×</button>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">{t(t('角色权限'))}</div><div className="card-sub">{t(t('角色 → 权限点（resource:action）'))}</div></div>
        <table className="table">
          <thead><tr><th>{t(t('角色'))}</th><th>{t(t('标识'))}</th><th>{t(t('权限'))}</th><th>{t(t('二次验证'))}</th><th>{t(t('类型'))}</th></tr></thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }} data-label={t('角色')}>{r.name}</td>
                <td data-label={t('标识')}><code className="mono">{r.key}</code></td>
                <td className="text-small" data-label={t('权限')}>
                  {r.permissions.includes('*') ? t('全部权限') : r.permissions.join('、')}
                </td>
                <td data-label={t('MFA')}>{r.mfaPolicy && r.mfaPolicy !== 'none' ? <span className="pill pill-accent">{r.mfaPolicy === 'otp' ? 'OTP' : r.mfaPolicy === 'passkey' ? 'Passkey' : t('跟随角色')}</span> : <span className="text-muted text-small">—</span>}</td>
                <td data-label={t('类型')}>{r.builtIn ? <span className="pill pill-neutral">{t(t('内置'))}</span> : <span className="pill pill-accent">{t(t('自定义'))}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal
          title={editing === 'new' ? t('新建用户') : t('编辑：{0}', editing.name)}
          onClose={() => setEditing(null)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>{t(t('取消'))}</button>
            <button className="btn btn-primary" onClick={save} disabled={editing === 'new' && (!form.username || !form.password)}>{t(t('保存'))}</button>
          </>}
        >
          {editing === 'new' && (
            <>
              <Field label={t('用户名')} required>
                <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </Field>
              <Field label={t('初始密码')} required>
                <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
            </>
          )}
          <Field label={t('姓名')}>
            <input className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t('部门')}>
            <select className="select" value={form.departmentId || ''} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
              <option value="">{t(t('未分配'))}</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label={t('角色（可多选）')}>
            <select className="select" multiple size={4} value={form.roleIds || []}
              onChange={(e) => setForm({ ...form, roleIds: [...e.target.selectedOptions].map((o) => o.value) })}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.mfaPolicy && r.mfaPolicy !== 'none' ? ` · ${t('强制MFA')}` : ''}</option>)}
            </select>
          </Field>
          <Field label={t('二次验证（MFA）')} tip={t('「跟随角色」时由角色策略决定；强制后登录需额外验证')}>
            <select className="select" value={form.mfaPolicy || 'auto'}
              onChange={(e) => setForm({ ...form, mfaPolicy: e.target.value })}>
              <option value="auto">{t('跟随角色')}</option>
              <option value="none">{t('不强制')}</option>
              <option value="otp">{t('强制 OTP 验证器')}</option>
              <option value="passkey">{t('强制 Passkey')}</option>
            </select>
          </Field>
        </Modal>
      )}
    </div>
  )
}
