import React, { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { api, setAuth } from '../api.js'
import { Field } from '../ui.jsx'
import { t, useLang } from '../i18n.js'
import { ThemeSwitch, LangSwitch } from '../components/Prefs.jsx'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [providers, setProviders] = useState([])
  const [busy, setBusy] = useState(false)
  // MFA 挑战态：null | { type: 'otp'|'passkey', mfaToken }
  const [mfa, setMfa] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [passkeyBusy, setPasskeyBusy] = useState(false)

  useEffect(() => {
    api.get('/api/auth/sso/providers').then((d) => setProviders(d.providers.filter((p) => p.enabled))).catch(() => {})
    const err = new URLSearchParams(window.location.search).get('sso_error')
    if (err) setError(t('SSO 登录失败：{0}', err))
  }, [])

  const done = (data) => {
    setAuth(data.token, data.user)
    onLogin(data.user)
  }

  // Passkey 二次验证
  const passkeyVerify = async (mfaToken, challenge) => {
    setPasskeyBusy(true)
    setError('')
    try {
      const cred = await navigator.credentials.get({
        publicKey: {
          challenge: base64urlToBytes(challenge),
          userVerification: 'preferred',
        },
      })
      const data = await api.post('/api/auth/mfa/verify', {
        mfaToken,
        assertion: {
          credentialIdB64: cred.id,
          challenge,
          response: {
            clientDataJSON: bytesToB64url(cred.response.clientDataJSON),
            authenticatorData: bytesToB64url(cred.response.authenticatorData),
            signature: bytesToB64url(cred.response.signature),
          },
        },
      })
      done(data)
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? t('已取消 Passkey 验证') : err.message)
    } finally {
      setPasskeyBusy(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await api.post('/api/auth/login', { username, password })
      if (data.mfaRequired) {
        const type = data.mfaRequired
        setMfa({ type, mfaToken: data.mfaToken })
        if (type === 'passkey') {
          const opts = await api.post('/api/auth/mfa/passkey/options', { mfaToken: data.mfaToken })
          passkeyVerify(data.mfaToken, opts.challenge)
        }
      } else {
        done(data)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const mfaSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await api.post('/api/auth/mfa/verify', { mfaToken: mfa.mfaToken, code: mfaCode })
      done(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <div className="login-prefs">
          <ThemeSwitch />
          <LangSwitch />
        </div>
        <div className="login-brand">
          <span className="brand-mark">AF</span>
          <div>
            <h1 className="brand-name">{t('AIFlow 平台')}</h1>
            <div className="text-small text-muted">{t('AI 低代码 · 表单与审批流')}</div>
          </div>
        </div>

        {!mfa && (
          <form onSubmit={submit}>
            <Field label={t('用户名')}>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" placeholder="admin" />
            </Field>
            <Field label={t('密码')}>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
            </Field>
            {error && <div className="field-tip" style={{ color: 'var(--negative)', marginBottom: 12 }}>{error}</div>}
            <button className="btn btn-primary" style={{ width: '100%', height: 40 }} disabled={busy || !username || !password}>
              {busy ? t('登录中…') : t('登录')}
            </button>
          </form>
        )}

        {mfa?.type === 'otp' && (
          <form onSubmit={mfaSubmit}>
            <div className="text-small text-muted" style={{ marginBottom: 12 }}>
              {t('请输入验证器 App 中的 6 位动态码')}
            </div>
            <Field label={t('动态验证码')}>
              <input
                className="input" inputMode="numeric" pattern="\d{6}" maxLength={6}
                value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                autoFocus autoComplete="one-time-code" placeholder="000000" style={{ letterSpacing: '0.4em', textAlign: 'center' }}
              />
            </Field>
            {error && <div className="field-tip" style={{ color: 'var(--negative)', marginBottom: 12 }}>{error}</div>}
            <button className="btn btn-primary" style={{ width: '100%', height: 40 }} disabled={busy || mfaCode.length !== 6}>
              {busy ? t('验证中…') : t('验证并登录')}
            </button>
          </form>
        )}

        {mfa?.type === 'passkey' && (
          <div>
            <div className="text-small text-muted" style={{ marginBottom: 12 }}>
              {t('请使用已注册的 Passkey 完成验证…')}
            </div>
            {error && <div className="field-tip" style={{ color: 'var(--negative)', marginBottom: 12 }}>{error}</div>}
            {passkeyBusy && <div className="text-small text-muted">{t('等待认证器…')}</div>}
          </div>
        )}

        {!mfa && providers.length > 0 && (
          <>
            <div className="row" style={{ margin: '20px 0 12px', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
              <span className="text-small text-muted">{t('单点登录')}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {providers.map((p) => (
                <a key={p.key} className="btn btn-secondary" style={{ width: '100%' }} href={p.url}>
                  {p.label}
                </a>
              ))}
            </div>
          </>
        )}
        {!mfa && (
          <div className="text-small text-muted mt-16">
            {t('演示账号：admin / admin123 · zhangsan / zhang123')}
          </div>
        )}
      </motion.div>
    </div>
  )
}

function bytesToB64url(buf) {
  const b = new Uint8Array(buf)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function base64urlToBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out.buffer
}
