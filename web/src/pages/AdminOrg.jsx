import React, { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { Modal, Field, icons } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

// 树渲染
function Tree({ nodes, depth = 0, onEdit, onDelete, canManage }) {
  if (!nodes?.length) return null
  return (
    <>
      {nodes.map((d, i) => (
        <motion.div
          key={d.id}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: depth * 0.03 + i * 0.02 }}
          className="row-between"
          style={{ padding: '9px 12px', paddingLeft: 12 + depth * 24, borderBottom: '1px solid var(--rule)' }}
        >
          <div className="row" style={{ gap: 8 }}>
            {depth > 0 && <span style={{ color: 'var(--control)' }}>└</span>}
            <span style={{ fontWeight: depth === 0 ? 500 : 400 }}>{d.name}</span>
            <span className="text-small text-muted num">{d.memberCount} {t('人')}</span>
          </div>
          {canManage && (
            <div className="row" style={{ gap: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => onEdit(d)}>{t(t('编辑'))}</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--negative)' }} onClick={() => onDelete(d)} aria-label={t('删除部门')}>×</button>
            </div>
          )}
        </motion.div>
      ))}
      <Tree nodes={d.children} />
    </>
  )
}
// 修正：Tree 递归要传 children
function TreeLevel({ nodes, depth = 0, onEdit, onDelete, canManage }) {
  if (!nodes?.length) return null
  return nodes.map((d, i) => (
    <React.Fragment key={d.id}>
      <motion.div
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: depth * 0.03 + i * 0.02 }}
        className="row-between"
        style={{ padding: '9px 12px', paddingLeft: 12 + depth * 24, borderBottom: '1px solid var(--rule)' }}
      >
        <div className="row" style={{ gap: 8 }}>
          {depth > 0 && <span style={{ color: 'var(--control)' }}>└</span>}
          <span style={{ fontWeight: depth === 0 ? 500 : 400 }}>{d.name}</span>
          <span className="text-small text-muted num">{d.memberCount} {t('人')}</span>
        </div>
        {canManage && (
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(d)}>{t(t('编辑'))}</button>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--negative)' }} onClick={() => onDelete(d)} aria-label={t('删除部门')}>×</button>
          </div>
        )}
      </motion.div>
      <TreeLevel nodes={d.children} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} canManage={canManage} />
    </React.Fragment>
  ))
}

export default function AdminOrg() {
  useLang()
  const { user, showToast } = useApp()
  const [tree, setTree] = useState(null)
  const [users, setUsers] = useState([])
  const [providers, setProviders] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [syncing, setSyncing] = useState('')

  const canManage = user.permissions?.includes('*') || user.permissions?.includes('org:manage')

  const load = () => {
    api.get('/api/org/tree').then(setTree).catch((e) => showToast(e.message, 'error'))
    api.get('/api/users').then(setUsers).catch(() => {})
    api.get('/api/auth/sso/providers').then((d) => setProviders(d.providers)).catch(() => {})
  }
  useEffect(load, [])

  const openNew = (parentId = '') => { setForm({ name: '', parentId, leaderUserId: '' }); setEditing('new') }
  const openEdit = (d) => { setForm({ ...d }); setEditing(d) }

  const save = async () => {
    try {
      if (editing === 'new') await api.post('/api/org/departments', form)
      else await api.patch(`/api/org/departments/${editing.id}`, { name: form.name, parentId: form.parentId, leaderUserId: form.leaderUserId })
      setEditing(null)
      load()
      showToast(t('已保存'))
    } catch (e) { showToast(e.message, 'error') }
  }

  const remove = async (d) => {
    try { await api.del(`/api/org/departments/${d.id}`); load() } catch (e) { showToast(e.message, 'error') }
  }

  const sync = async (key) => {
    setSyncing(key)
    try {
      const r = await api.post(`/api/admin/org/sync/${key}`)
      showToast(t('同步完成：{0} 个部门，新增 {1} 人、更新 {2} 人', r.departments, r.users.created, r.users.updated))
      load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSyncing('') }
  }

  const syncable = providers.filter((p) => p.enabled && p.syncable)

  return (
    <div className="sheet-pad">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t(t('组织架构'))}</h1>
          <div className="page-sub">{t(t('部门树与负责人，审批流的「部门主管」节点由此解析'))}</div>
        </div>
        {canManage && <button className="btn btn-primary" onClick={() => openNew('')}>{icons.plus({})} {t('新建部门')}</button>}
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><div className="card-title">{t(t('部门树'))}</div></div>
          {tree === null ? (
            <div className="card-pad text-muted">{t(t('加载中…'))}</div>
          ) : tree.length === 0 ? (
            <div className="card-pad"><div className="empty">{t(t('暂无部门'))}</div></div>
          ) : (
            <TreeLevel nodes={tree} onEdit={openEdit} onDelete={remove} canManage={canManage} />
          )}
        </div>

        <div>
          <div className="card mb-24">
            <div className="card-head">
              <div>
                <div className="card-title">{t(t('外部组织架构同步'))}</div>
                <div className="card-sub">{t(t('从企业微信 / 钉钉拉取部门与成员（需在服务端配置对应环境变量）'))}</div>
              </div>
            </div>
            <div className="card-pad" style={{ paddingTop: 0 }}>
              {syncable.length === 0 ? (
                <div className="empty">{t(t('尚无可用的外部通讯录源。'))}<div className="text-small mt-8">{t(t('配置 WECOM_CORP_ID / WECOM_CORP_SECRET 或 DINGTALK_APP_KEY / DINGTALK_APP_SECRET 后启用'))}</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {syncable.map((p) => (
                    <div key={p.key} className="row-between">
                      <span style={{ fontWeight: 500 }}>{p.label}</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => sync(p.key)} disabled={!!syncing}>
                        {syncing === p.key ? t('同步中…') : t('立即同步')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">{t(t('部门成员速览'))}</div></div>
            <table className="table">
              <thead><tr><th>{t(t('成员'))}</th><th>{t(t('部门'))}</th><th>{t(t('角色'))}</th></tr></thead>
              <tbody>
                {users.slice(0, 8).map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }} data-label={t('成员')}>{u.name}</td>
                    <td className="text-muted" data-label={t('部门')}>{u.departmentName || '—'}</td>
                    <td className="text-small text-muted" data-label={t('角色')}>{(u.roleIds || []).length} {t('个角色')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing === 'new' ? t('新建部门') : t('编辑：{0}', editing.name)}
          onClose={() => setEditing(null)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>{t(t('取消'))}</button>
            <button className="btn btn-primary" onClick={save} disabled={!form.name?.trim()}>{t(t('保存'))}</button>
          </>}
        >
          <Field label={t('部门名称')} required>
            <input className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t('上级部门')}>
            <select className="select" value={form.parentId || ''} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">{t(t('（作为顶级部门）'))}</option>
              {(function flatten(nodes, out = [], prefix = '') {
                for (const d of nodes || []) {
                  out.push({ id: d.id, name: prefix + d.name })
                  flatten(d.children, out, prefix + d.name + ' / ')
                }
                return out
              })(tree).filter((d) => d.id !== editing?.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label={t('部门负责人')} tip={t('负责人用于「部门主管」审批节点')}>
            <select className="select" value={form.leaderUserId || ''} onChange={(e) => setForm({ ...form, leaderUserId: e.target.value })}>
              <option value="">{t(t('未指定'))}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        </Modal>
      )}
    </div>
  )
}
