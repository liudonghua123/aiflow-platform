// 共享 UI 小组件：图标、pill、状态映射
import React from 'react'
import { t } from './i18n.js'

// 16px outline 图标集（1.8px stroke，currentColor 继承，支持 CSS 动画）
// 图标按用途分色：CSS 里 .nav-item:nth-child / .tab 赋予青春色板（青/紫/粉/橙/绿），
// hover 时触发 stroke-dash 绘制 + 弹跳动效（见 styles.css @keyframes icon-draw / icon-pop）。
const I = ({ children, size = 16, cls = '' }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" className={`icon${cls ? ' ' + cls : ''}`}
  >
    {children}
  </svg>
)
export const icons = {
  home: (p) => <I {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></I>,
  form: (p) => <I {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></I>,
  flow: (p) => <I {...p}><rect x="3" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="16" width="7" height="5" rx="1.5" /><path d="M6.5 8v5a3 3 0 0 0 3 3H14" /><path d="m12 17.5 2 1.5-2 1.5" transform="translate(0,-2)" /></I>,
  check: (p) => <I {...p}><path d="M20 6 9 17l-5-5" /></I>,
  users: (p) => <I {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 15.5c2.6.3 4.6 1.8 5.5 4.5" /></I>,
  org: (p) => <I {...p}><rect x="9" y="3" width="6" height="4" rx="1" /><rect x="3" y="17" width="6" height="4" rx="1" /><rect x="15" y="17" width="6" height="4" rx="1" /><path d="M12 7v4M6 17v-3h12v3" /></I>,
  webhook: (p) => <I {...p}><path d="M18 16.98h-5.99c-1.66 0-3.01-1.34-3.01-3s1.34-3 3-3L15 8.96" /><circle cx="18" cy="16.98" r="2.5" /><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="7" r="2.5" /><path d="M8.97 15 6 11.02" /><path d="m9.5 8.5 4-1.5" /></I>,
  settings: (p) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></I>,
  plus: (p) => <I {...p}><path d="M12 5v14M5 12h14" /></I>,
  sparkles: (p) => <I {...p} cls="icon-sparkles"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></I>,
  exit: (p) => <I {...p}><path d="m15 18-6-6 6-6" /></I>,
  doc: (p) => <I {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></I>,
  app: (p) => <I {...p}><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></I>,
  clock: (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></I>,
  send: (p) => <I {...p}><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></I>,
  // 交互控件用（折叠钮/更多面板），带绘制动效基类
  chevron: (p) => <I {...p}><path d="m9 6 6 6-6 6" /></I>,
}

export function StatusPill({ status }) {
  const map = {
    running: ['pill-accent', t('进行中')],
    completed: ['pill-positive', t('已完成')],
    approved: ['pill-positive', t('已通过')],
    rejected: ['pill-negative', t('已驳回')],
    cancelled: ['pill-neutral', t('已取消')],
    blocked: ['pill-warning', t('受阻')],
    pending: ['pill-warning', t('待处理')],
    read: ['pill-neutral', t('已读')],
    error: ['pill-negative', t('异常')],
  }
  const [cls, label] = map[status] || ['pill-neutral', status || '—']
  return <span className={`pill ${cls}`}>{label}</span>
}

export function Modal({ title, onClose, children, footer, width }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={width ? { width } : undefined} role="dialog" aria-label={title}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label={t('关闭')}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Empty({ text, icon, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon || '◇'}</div>
      <div className="empty-title">{text}</div>
      {action}
    </div>
  )
}

export function Field({ label, required, tip, children }) {
  return (
    <div className="field">
      <label className="field-label">{label}{required && <span style={{ color: 'var(--negative)' }}> *</span>}</label>
      {children}
      {tip && <div className="field-tip">{tip}</div>}
    </div>
  )
}

// 头像色环（稳定 hash → 色相）
export function Avatar({ name, size = 28 }) {
  let h = 0
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) % 360
  const bg = `hsl(${h}, 42%, 46%)`
  return (
    <span className="avatar" style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}>
      {(name || '?').slice(0, 1)}
    </span>
  )
}
