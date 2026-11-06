import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { StatusPill, Empty } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

export default function Tasks() {
  useLang()
  const { showToast } = useApp()
  const [tab, setTab] = useState('todo')
  const [data, setData] = useState(null)

  useEffect(() => {
    api.get('/api/me/tasks').then(setData).catch((e) => showToast(e.message, 'error'))
  }, [])

  const tabs = [
    ['todo', t('待办')],
    ['done', t('已办')],
    ['cc', t('抄送我的')],
    ['mine', t('我发起的')],
  ]

  const fmtTime = (iso) => new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const rows = data
    ? tab === 'mine'
      ? data.mine.map((i) => ({ id: i.id, instanceId: i.id, title: i.title, flowName: i.flowName, status: i.status, createdAt: i.createdAt }))
      : (data[tab] || []).map((t) => ({ id: t.id, instanceId: t.instanceId, title: t.instanceTitle, flowName: t.flowName, status: t.status, nodeName: t.nodeName, createdAt: t.createdAt }))
    : []

  return (
    <div className="sheet-pad">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t(t('审批中心'))}</h1>
          <div className="page-sub">{t(t('处理待办、查看已办与抄送'))}</div>
        </div>
      </div>

      <div className="row mb-16" style={{ gap: 0, borderBottom: '1px solid var(--rule)' }} role="tablist">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            style={{
              background: 'none', border: 'none', padding: '10px 16px',
              fontSize: 14, fontWeight: tab === key ? 600 : 400,
              color: tab === key ? 'var(--text)' : 'var(--muted)',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {label}
            {key === 'todo' && data?.todo?.length > 0 && <span className="nav-count num" style={{ marginLeft: 6 }}>{data.todo.length}</span>}
          </button>
        ))}
      </div>

      <div className="card">
        {!data ? (
          <div className="card-pad text-muted">{t(t('加载中…'))}</div>
        ) : rows.length === 0 ? (
          <div className="card-pad"><Empty text={tab === 'todo' ? t('没有待办审批。') : t('暂无记录。')} /></div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t(t('事项'))}</th>
                <th>{t(t('流程'))}</th>
                {tab !== 'mine' && <th>{t(t('节点'))}</th>}
                <th>{t(t('状态'))}</th>
                <th style={{ width: 130 }}>{t(t('时间'))}</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }} data-label={t('标题')}>{r.title}</td>
                  <td className="text-muted" data-label={t('流程')}>{r.flowName}</td>
                  {tab !== 'mine' && <td className="text-muted" data-label={t('当前节点')}>{r.nodeName || '—'}</td>}
                  <td data-label={t('状态')}><StatusPill status={r.status} /></td>
                  <td className="text-small text-muted num" data-label={t('时间')}>{fmtTime(r.createdAt)}</td>
                  <td data-label=" "><Link to={`/instances/${r.instanceId}`} className="btn btn-secondary btn-sm">{t(t('查看'))}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
