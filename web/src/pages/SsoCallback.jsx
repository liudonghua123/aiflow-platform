import { useEffect } from 'react'
import { api, setAuth } from '../api.js'
import { t, useLang } from '../i18n.js'

export default function SsoCallback({ onLogin }) {
  useLang()
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) { window.location.href = '/login'; return }
    // 用 token 换用户信息
    fetch('/api/me', { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((user) => {
        setAuth(token, user)
        onLogin(user)
        window.location.href = '/'
      })
      .catch(() => { window.location.href = '/login' })
  }, [onLogin])
  return (
    <div className="login-wrap">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div className="brand-name">{t(t('SSO 登录中…'))}</div>
        <div className="text-small text-muted mt-8">{t(t('正在完成单点登录'))}</div>
      </div>
    </div>
  )
}
