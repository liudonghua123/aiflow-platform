import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { StatusPill, icons } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

// 工作台：一个问题 —— "我今天要处理什么、平台在跑什么"
export default function Home() {
  const { user, todoCount } = useApp()
  const [tasks, setTasks] = useState(null)
  const [instances, setInstances] = useState([])
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api.get('/api/me/tasks').then(setTasks).catch(() => {})
    api.get('/api/instances').then(setInstances).catch(() => {})
    Promise.all([api.get('/api/instances'), api.get('/api/flows'), api.get('/api/forms')])
      .then(([i, f, fo]) => setStats({
        instances: i.length,
        running: i.filter((x) => x.status === 'running').length,
        flows: f.length,
        forms: fo.length,
      }))
      .catch(() => {})
  }, [])

  const todo = tasks?.todo || []
  useLang()
  const fmtTime = (iso) => new Date(iso).toLocaleString(document.documentElement.lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="sheet-pad">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('工作台')}</h1>
          <div className="page-sub">
            {todoCount > 0 ? t('{0}，你有 {1} 个待办审批等待处理', user.name, todoCount) : t('{0}，当前没有待办事项', user.name)}
          </div>
        </div>
        <Link to="/start" className="btn btn-primary">{icons.plus({})} {t('发起申请')}</Link>
      </div>

      {stats && (
        <div className="card kpi-strip mb-24">
          <div className="kpi-cell">
            <div className="kpi-label">{t('我的待办')}</div>
            <div className="kpi-value num">{todoCount}<span className="unit">{t('件')}</span></div>
          </div>
          <div className="kpi-cell">
            <div className="kpi-label">{t('进行中流程')}</div>
            <div className="kpi-value num">{stats.running}<span className="unit">{t('个')}</span></div>
          </div>
          <div className="kpi-cell">
            <div className="kpi-label">{t('已上线流程')}</div>
            <div className="kpi-value num">{stats.flows}<span className="unit">{t('条')}</span></div>
          </div>
          <div className="kpi-cell">
            <div className="kpi-label">{t('可用表单')}</div>
            <div className="kpi-value num">{stats.forms}<span className="unit">{t('张')}</span></div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t('待我审批')}</div>
              <div className="card-sub">{t('按提交时间排序')}</div>
            </div>
            <Link to="/tasks" className="btn btn-ghost btn-sm">{t('查看全部')}</Link>
          </div>
          {todo === null ? (
            <div className="card-pad text-muted">{t('加载中…')}</div>
          ) : todo.length === 0 ? (
            <div className="card-pad"><div className="empty">{t('没有待办，所有审批都已处理完毕。')}</div></div>
          ) : (
            <table className="table">
              <tbody>
                {todo.slice(0, 5).map((t) => (
                  <tr key={t.id}>
                    <td data-label={t('待办')}>
                      <Link to={`/instances/${t.instanceId}`} style={{ fontWeight: 500 }}>{t.instanceTitle}</Link>
                      <div className="text-small text-muted">{t.nodeName || t('抄送通知')} · {t.flowName}</div>
                    </td>
                    <td className="text-small text-muted num" style={{ width: 110 }} data-label={t('时间')}>{fmtTime(t.createdAt)}</td>
                    <td style={{ width: 70 }} data-label={t('状态')}><StatusPill status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t('最近申请')}</div>
              <div className="card-sub">{t('全平台最近发起的审批')}</div>
            </div>
          </div>
          {instances.length === 0 ? (
            <div className="card-pad">
              <div className="empty">{t('还没有任何申请记录。')}<Link to="/start" className="btn btn-secondary btn-sm">{t('发起第一笔申请')}</Link></div>
            </div>
          ) : (
            <table className="table">
              <tbody>
                {instances.slice(0, 5).map((i) => (
                  <tr key={i.id}>
                    <td data-label={t('申请')}>
                      <Link to={`/instances/${i.id}`} style={{ fontWeight: 500 }}>{i.title}</Link>
                      <div className="text-small text-muted">{i.flowName}</div>
                    </td>
                    <td className="text-small text-muted num" style={{ width: 110 }} data-label={t('时间')}>{fmtTime(i.createdAt)}</td>
                    <td style={{ width: 70 }} data-label={t('状态')}><StatusPill status={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card mt-24">
        <div className="card-head">
          <div>
            <div className="card-title">{t('开放接口')}</div>
            <div className="card-sub">{t('平台全部能力可通过 RESTful 与 MCP 协议访问')}</div>
          </div>
        </div>
        <div className="card-pad" style={{ paddingTop: 0 }}>
          <table className="table">
            <thead>
              <tr><th>{t('接口')}</th><th>{t('地址')}</th><th>{t('说明')}</th></tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 500 }}>RESTful API</td>
                <td><code className="mono">/api/*</code></td>
                <td className="text-muted">{t('表单、流程、审批、组织、webhook 全量 CRUD，JWT 鉴权')}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500 }}>{t('MCP 服务')}</td>
                <td><code className="mono">/mcp</code></td>
                <td className="text-muted">{t('Streamable HTTP，AI 客户端可直接发起审批、查询待办')}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500 }}>Webhook</td>
                <td><code className="mono">{t('自定义 URL')}</code></td>
                <td className="text-muted">{t('HMAC-SHA256 签名推送，失败自动重试 3 次')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
