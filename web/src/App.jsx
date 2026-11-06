import React, { useEffect, useState, createContext, useContext, useCallback } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { api, getStoredUser, clearAuth } from './api.js'
import { icons, Avatar } from './ui.jsx'
import { t, useLang } from './i18n.js'
import { useTheme } from './theme.js'
import { ThemeSwitch, LangSwitch } from './components/Prefs.jsx'

import Login from './pages/Login.jsx'
import SsoCallback from './pages/SsoCallback.jsx'
import Home from './pages/Home.jsx'
import Forms from './pages/Forms.jsx'
import FormDesigner from './pages/FormDesigner.jsx'
import Flows from './pages/Flows.jsx'
import FlowDesigner from './pages/FlowDesigner.jsx'
import Start from './pages/Start.jsx'
import InstanceDetail from './pages/InstanceDetail.jsx'
import Tasks from './pages/Tasks.jsx'
import Apps from './pages/Apps.jsx'
import AdminUsers from './pages/AdminUsers.jsx'
import AdminOrg from './pages/AdminOrg.jsx'
import AdminWebhooks from './pages/AdminWebhooks.jsx'
import AdminSettings from './pages/AdminSettings.jsx'
import Security from './pages/Security.jsx'

// ---------- 全局状态 ----------
const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function App() {
  const [user, setUser] = useState(getStoredUser())
  const [todoCount, setTodoCount] = useState(0)
  const [toast, setToast] = useState(null)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('aiflow_sidebar') === '1')
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2600)
  }, [])

  useEffect(() => {
    if (!user) return
    let alive = true
    const poll = async () => {
      try {
        const t = await api.get('/api/me/tasks')
        if (alive) setTodoCount(t.todo.length)
      } catch { /* 忽略轮询错误 */ }
    }
    poll()
    const timer = setInterval(poll, 15000)
    return () => { alive = false; clearInterval(timer) }
  }, [user])

  const logout = () => { clearAuth(); setUser(null) }

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem('aiflow_sidebar', c ? '0' : '1')
      return !c
    })
  }

  // 路由变化时收起移动端「更多」面板
  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={setUser} />} />
        <Route path="/sso-callback" element={<SsoCallback onLogin={setUser} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  const nav = (to, icon, label, count) => (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item nav-${icon}${isActive ? ' active' : ''}`}
    >
      {icons[icon]({})}
      <span>{label}</span>
      {count > 0 && <span className="nav-count num">{count}</span>}
    </NavLink>
  )

  const isAdmin = user.permissions?.includes('*') || user.permissions?.includes('user:manage')
  useLang() // 语言切换时重渲染

  const tab = (to, icon, label) => (
    <NavLink to={to} className={({ isActive }) => `tab tab-${icon}${isActive ? ' active' : ''}`}>
      {icons[icon]({})}
      <span>{label}</span>
    </NavLink>
  )

  return (
    <Ctx.Provider value={{ user, setUser, showToast, todoCount }}>
      <div className="shell">
        <header className="mobile-topbar">
          <div className="brand">
            <span className="brand-mark">AF</span>
            <span className="brand-name brand-name-grad">AIFlow</span>
          </div>
          {todoCount > 0 && <span className="topbar-badge num">{todoCount}</span>}
        </header>
        <div className="shell-body">
          <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
            <button className="collapse-btn" onClick={toggleCollapsed} aria-label={t('收起侧栏')}>
              {icons.chevron({ cls: 'icon-chevron' })}
            </button>
            <div
              className="brand"
              onClick={collapsed ? toggleCollapsed : undefined}
              title={collapsed ? t('展开侧栏') : undefined}
              style={collapsed ? { cursor: 'pointer' } : undefined}
            >
              <span className="brand-mark">AF</span>
              <div className="brand-text">
                <span className="brand-name">AIFlow</span>
                <span className="brand-sub">AI 低代码平台</span>
              </div>
            </div>
            <NavLink to="/start" className="start-cta">
              {icons.send({})}
              <span>{t('发起申请')}</span>
            </NavLink>
            <nav className="nav-group" aria-label={t('工作台')}>
              {nav('/', 'home', t('工作台'))}
              {nav('/tasks', 'check', t('审批中心'))}
              {nav('/apps', 'app', t('应用中心'))}
            </nav>
            <div className="nav-sep" />
            <nav className="nav-group" aria-label={t('表单设计')}>
              {nav('/forms', 'form', t('表单设计'))}
              {nav('/flows', 'flow', t('流程设计'))}
            </nav>
            <div className="nav-sep" />
            <nav className="nav-group" aria-label={t('平台设置')}>
              {nav('/admin/users', 'users', t('用户与角色'))}
              {nav('/admin/org', 'org', t('组织架构'))}
              {nav('/admin/webhooks', 'webhook', t('Webhook'))}
              {nav('/admin/settings', 'settings', t('平台设置'))}
            </nav>
            <div className="nav-bottom">
              <div className="appear-row">
                <span className="appear-label">{t('外观')}</span>
                <LangSwitch />
                <ThemeSwitch />
              </div>
              <button className="user-card" onClick={logout} title={t('退出登录')}>
                <Avatar name={user.name} size={34} />
                <div className="user-card-text">
                  <div className="user-name">{user.name}</div>
                  <div className="user-dept">{user.departmentName || t('未分配部门')}</div>
                </div>
                {icons.exit({ cls: 'user-card-exit' })}
              </button>
            </div>
          </aside>
          <main className="sheet">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{
                minHeight: '100%',
                // 流程设计器需要确定高度链，画布才能撑满
                ...(location.pathname.startsWith('/flows/') ? { height: '100%' } : {}),
              }}
            >
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/start" element={<Start />} />
                <Route path="/apps" element={<Apps />} />
                <Route path="/forms" element={<Forms />} />
                <Route path="/forms/:id" element={<FormDesigner />} />
                <Route path="/flows" element={<Flows />} />
                <Route path="/flows/:id" element={<FlowDesigner />} />
                <Route path="/instances/:id" element={<InstanceDetail />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/org" element={<AdminOrg />} />
                <Route path="/admin/webhooks" element={<AdminWebhooks />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/security" element={<Security />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
          </main>
        </div>
        <nav className="tabbar" aria-label={t('导航')}>
          {tab('/', 'home', t('工作台'))}
          {tab('/tasks', 'check', t('审批中心'))}
          <NavLink to="/start" className="tab-fab" aria-label={t('发起申请')}>
            {icons.plus({ cls: 'icon-fab-plus' })}
          </NavLink>
          {tab('/apps', 'app', t('应用中心'))}
          <button className={`tab tab-more${moreOpen ? ' active' : ''}`} onClick={() => setMoreOpen((v) => !v)}>
            {icons.clock({})}
            <span>{t('更多')}</span>
          </button>
        </nav>
        {moreOpen && (
          <>
            <div className="drawer-mask" onClick={() => setMoreOpen(false)} />
            <div className="more-sheet">
              <div className="drawer-head">
                <span className="drawer-title">{t('更多')}</span>
                <button className="drawer-close" onClick={() => setMoreOpen(false)} aria-label={t('关闭')}>×</button>
              </div>
              <div className="drawer-grid">
                {isAdmin && (
                  <>
                    <NavLink to="/admin/users" className="grid-item"><i className="gi-icon gi-c6">{icons.users({ size: 18 })}</i><span>{t('用户与角色')}</span></NavLink>
                    <NavLink to="/admin/org" className="grid-item"><i className="gi-icon gi-c5">{icons.org({ size: 18 })}</i><span>{t('组织架构')}</span></NavLink>
                    <NavLink to="/admin/webhooks" className="grid-item"><i className="gi-icon gi-c3">{icons.webhook({ size: 18 })}</i><span>{t('Webhook')}</span></NavLink>
                    <NavLink to="/admin/settings" className="grid-item"><i className="gi-icon gi-c2">{icons.doc({ size: 18 })}</i><span>{t('平台设置')}</span></NavLink>
                  </>
                )}
                <NavLink to="/forms" className="grid-item"><i className="gi-icon gi-c2">{icons.form({ size: 18 })}</i><span>{t('表单设计')}</span></NavLink>
                <NavLink to="/flows" className="grid-item"><i className="gi-icon gi-c1">{icons.flow({ size: 18 })}</i><span>{t('流程设计')}</span></NavLink>
                <NavLink to="/security" className="grid-item"><i className="gi-icon gi-c4">{icons.check({ size: 18 })}</i><span>{t('账号安全')}</span></NavLink>
              </div>
              <div className="drawer-section">{t('语言')}</div>
              <div className="seg seg-lang"><LangSwitch /></div>
              <div className="drawer-section">{t('主题')}</div>
              <div className="seg seg-theme"><ThemeSwitch /></div>
              <div className="drawer-user">
                <Avatar name={user.name} size={34} />
                <div className="user-card-text">
                  <div className="user-name">{user.name}</div>
                  <div className="user-dept">{user.departmentName || t('未分配部门')}</div>
                </div>
                <button className="drawer-logout" onClick={logout}>{icons.exit({ size: 16 })}<span>{t('退出登录')}</span></button>
              </div>
            </div>
          </>
        )}
      </div>
      {toast && <div className={`toast${toast.type === 'error' ? ' error' : ''}`}>{toast.msg}</div>}
    </Ctx.Provider>
  )
}

export default App
