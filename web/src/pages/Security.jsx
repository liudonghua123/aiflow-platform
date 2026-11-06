import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { Modal, Field, icons } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

const POLICY_LABEL = { none: t('不强制'), otp: t('OTP 验证器'), passkey: t('Passkey'), auto: t('跟随角色') }

export default function Security() {
  useLang()
  const { user, showToast } = useApp()
  const [data, setData] = useState(null)
  const [otpSetup, setOtpSetup] = useState(null) // { secret, uri, qr }
  const [otpCode, setOtpCode] = useState('')
  const [passkeyName, setPasskeyName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api.get('/api/me/mfa').then(setData).catch(() => {})
  useEffect(() => { load() }, [])

  const startOtp = async () => {
    try {
      const s = await api.post('/api/me/mfa/otp/setup')
      setOtpSetup(s)
      setOtpCode('')
    } catch (e) { showToast(e.message, 'error') }
  }

  const confirmOtp = async () => {
    setBusy(true)
    try {
      await api.post('/api/me/mfa/otp/confirm', { code: otpCode })
      setOtpSetup(null)
      showToast(t('OTP 验证器绑定成功'))
      load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  const registerPasskey = async () => {
    setBusy(true)
    try {
      const opts = await api.post('/api/me/mfa/passkey/options')
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: b64urlToBuf(opts.challenge),
          rp: opts.rp,
          user: { id: b64urlToBuf(opts.user.id), name: opts.user.name, displayName: opts.user.displayName },
          pubKeyCredParams: opts.pubKeyCredParams,
          authenticatorSelection: opts.authenticatorSelection,
          timeout: opts.timeout,
        },
      })
      await api.post('/api/me/mfa/passkey/register', {
        challenge: opts.challenge,
        name: passkeyName || undefined,
        response: {
          clientDataJSON: bufToB64url(cred.response.clientDataJSON),
          attestationObject: bufToB64url(cred.response.attestationObject),
        },
      })
      showToast(t('Passkey 注册成功'))
      setPasskeyName('')
      load()
    } catch (err) {
      showToast(err.name === 'NotAllowedError' ? t('已取消') : err.message, 'error')
    } finally { setBusy(false) }
  }

  const unbind = async (id) => {
    try {
      await api.del(`/api/me/mfa/${id}`)
      showToast(t('已解绑'))
      load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const otpCred = data?.credentials?.find((c) => c.type === 'totp')
  const passkeys = data?.credentials?.filter((c) => c.type === 'passkey') || []

  return (
    <div className="sheet-pad" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('账号安全')}</h1>
          <div className="page-sub">
            {data?.required
              ? t('当前账号被要求使用 {0} 二次验证', POLICY_LABEL[data.required] || data.required)
              : t('绑定 OTP 验证器或 Passkey，提升账号安全性')}
          </div>
        </div>
      </div>

      {/* ---- OTP ---- */}
      <div className="card card-pad mb-24">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="card-title">{t('OTP 动态验证器')}</div>
          {otpCred
            ? <span className="pill pill-positive">{t('已绑定')}</span>
            : <span className="pill pill-neutral">{t('未绑定')}</span>}
        </div>
        {otpCred ? (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="text-small text-muted">{otpCred.name}</span>
            <button className="btn btn-danger btn-sm" onClick={() => unbind(otpCred.id)}>{t('解绑')}</button>
          </div>
        ) : !otpSetup ? (
          <button className="btn btn-primary" onClick={startOtp}>{t('绑定验证器')}</button>
        ) : (
          <div>
            <div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <img src={otpSetup.qr} alt="QR" width={150} height={150} style={{ borderRadius: 12, border: '1px solid rgb(var(--line))' }} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <Field label={t('密钥（手动输入用）')} tip={t('在 Google Authenticator / 1Password 等App 中添加')}>
                  <code className="mono" style={{ wordBreak: 'break-all' }}>{otpSetup.secret}</code>
                </Field>
                <Field label={t('输入 App 显示的 6 位验证码')}>
                  <input className="input" inputMode="numeric" maxLength={6} value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))} placeholder="000000"
                    style={{ letterSpacing: '0.4em' }} />
                </Field>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-primary" onClick={confirmOtp} disabled={busy || otpCode.length !== 6}>{t('确认绑定')}</button>
                  <button className="btn btn-ghost" onClick={() => setOtpSetup(null)}>{t('取消')}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---- Passkey ---- */}
      <div className="card card-pad mb-24">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="card-title">{t('Passkey（通行密钥）')}</div>
          {passkeys.length > 0
            ? <span className="pill pill-positive">{t('{0} 把', passkeys.length)}</span>
            : <span className="pill pill-neutral">{t('未注册')}</span>}
        </div>
        {passkeys.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {passkeys.map((c) => (
              <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid rgb(var(--line) / 0.5)' }}>
                <span className="text-small">{c.name}</span>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--negative)' }} onClick={() => unbind(c.id)}>{t('删除')}</button>
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 8 }}>
          <input className="input" style={{ flex: 1 }} placeholder={t('给这把密钥起个名字（可选）')}
            value={passkeyName} onChange={(e) => setPasskeyName(e.target.value)} />
          <button className="btn btn-primary" onClick={registerPasskey} disabled={busy}>{icons.plus({})} {t('注册 Passkey')}</button>
        </div>
      </div>

      {/* ---- 策略说明 ---- */}
      <div className="card card-pad">
        <div className="card-title mb-8">{t('二次验证策略')}</div>
        <div className="text-small text-muted">
          {t('「跟随角色」表示由管理员为你的角色设定的策略决定；管理员可在「用户与角色」中为角色或单个用户设置强制 OTP / Passkey。')}
        </div>
      </div>
    </div>
  )
}

function b64urlToBuf(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out.buffer
}
function bufToB64url(buf) {
  const b = new Uint8Array(buf)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
