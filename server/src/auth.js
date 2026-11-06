// 认证：本地账号（bcrypt + JWT）+ OAuth2 / OIDC / CAS 适配器 + 企微 / 钉钉
import { getConfig } from './config.js'
// 所有外部 IdP 统一走 /api/auth/sso/:provider 授权码流程，回调后签发平台自己的 JWT。
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { db, uid } from './db.js'
import { roles } from './rbac.js'

const users = db('users')

const JWT_SECRET = process.env.JWT_SECRET || 'aiflow-dev-secret-change-in-prod'
const JWT_EXPIRES = '7d'

export function signToken(user) {
  return jwt.sign({ sub: user.id, name: user.name, roleIds: user.roleIds }, JWT_SECRET, { expiresIn: JWT_EXPIRES })
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

// ---------- 中间件 ----------
export function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || '')
  if (!token) return res.status(401).json({ error: '未登录', code: 'UNAUTHORIZED' })
  try {
    const payload = verifyToken(token)
    const user = users.get(payload.sub)
    if (!user) return res.status(401).json({ error: '用户不存在', code: 'UNAUTHORIZED' })
    req.user = user
    next()
  } catch {
    return res.status(401).json({ error: '登录已过期', code: 'TOKEN_EXPIRED' })
  }
}

export function permRequired(perm) {
  return (req, res, next) => {
    const perms = new Set()
    for (const rid of req.user.roleIds || []) {
      const role = roles.get(rid)
      for (const p of role?.permissions || []) perms.add(p)
    }
    if (perms.has('*') || perms.has(perm)) return next()
    res.status(403).json({ error: `无权限：需要 ${perm}`, code: 'FORBIDDEN' })
  }
}

// ---------- 本地账号 ----------
export async function registerUser({ username, password, name, departmentId, roleIds }) {
  if (users.find((u) => u.username === username)) throw new Error('用户名已存在')
  const user = users.insert({
    username, name: name || username,
    passwordHash: await bcrypt.hash(password, 10),
    departmentId: departmentId || '',
    roleIds: roleIds && roleIds.length ? roleIds : ['role_member'],
    providers: [], status: 'active',
  })
  return user
}

export async function authenticateLocal(username, password) {
  const user = users.find((u) => u.username === username)
  if (!user || !user.passwordHash) return null
  const ok = await bcrypt.compare(password, user.passwordHash)
  return ok ? user : null
}

// 外部身份绑定 / upsert（SSO 首次登录自动建号）
export function upsertExternalUser({ provider, providerUserId, name, departmentId, roleIds }) {
  const key = `${provider}:${providerUserId}`
  let user = users.find((u) => (u.identities || []).some((i) => i.key === key))
  if (user) {
    users.update(user.id, { name: name || user.name })
    return user
  }
  user = users.insert({
    username: `${provider}_${providerUserId}`.slice(0, 60),
    name: name || providerUserId,
    departmentId: departmentId || '',
    roleIds: roleIds && roleIds.length ? roleIds : ['role_member'],
    passwordHash: null, status: 'active',
    identities: [{ provider, providerUserId, key }],
  })
  return user
}

// ---------- IdP 适配器 ----------
// 每个 provider 提供: authUrl(state) → 跳转地址；exchange(code) → { providerUserId, name, raw }
// 目录: configUrl / fetchUsers 供组织架构同步。密钥走环境变量，不硬编码。
const IDP_REGISTRY = {
  oauth2: {
    label: 'OAuth2（通用）',
    env: ['OAUTH2_AUTH_URL', 'OAUTH2_TOKEN_URL', 'OAUTH2_CLIENT_ID', 'OAUTH2_CLIENT_SECRET', 'OAUTH2_USERINFO_URL'],
    enabled: () => !!(getConfig('OAUTH2_AUTH_URL') && getConfig('OAUTH2_CLIENT_ID')),
    authUrl(state, redirect) {
      const u = new URL(getConfig('OAUTH2_AUTH_URL'))
      u.searchParams.set('client_id', getConfig('OAUTH2_CLIENT_ID'))
      u.searchParams.set('redirect_uri', redirect)
      u.searchParams.set('response_type', 'code')
      u.searchParams.set('scope', getConfig('OAUTH2_SCOPE') || '')
      u.searchParams.set('state', state)
      return u.toString()
    },
    async exchange(code, redirect) {
      const res = await fetch(getConfig('OAUTH2_TOKEN_URL'), {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code, redirect_uri: redirect,
          client_id: getConfig('OAUTH2_CLIENT_ID'), client_secret: getConfig('OAUTH2_CLIENT_SECRET'),
        }),
      })
      if (!res.ok) throw new Error(`token exchange failed: ${res.status}`)
      const tok = await res.json()
      const ui = await fetch(getConfig('OAUTH2_USERINFO_URL'), { headers: { authorization: `Bearer ${tok.access_token}` } })
      const profile = await ui.json()
      return { providerUserId: String(profile.sub || profile.id), name: profile.name || profile.username, raw: profile }
    },
  },
  oidc: {
    label: 'OIDC（OpenID Connect）',
    env: ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'],
    enabled: () => !!(getConfig('OIDC_ISSUER') && getConfig('OIDC_CLIENT_ID')),
    async discovery() {
      const res = await fetch(`${getConfig('OIDC_ISSUER').replace(/\/$/, '')}/.well-known/openid-configuration`)
      if (!res.ok) throw new Error('OIDC discovery failed')
      return res.json()
    },
    async authUrl(state, redirect) {
      const doc = await this.discovery()
      const u = new URL(doc.authorization_endpoint)
      u.searchParams.set('client_id', getConfig('OIDC_CLIENT_ID'))
      u.searchParams.set('redirect_uri', redirect)
      u.searchParams.set('response_type', 'code')
      u.searchParams.set('scope', 'openid profile email')
      u.searchParams.set('state', state)
      return u.toString()
    },
    async exchange(code, redirect) {
      const doc = await this.discovery()
      const res = await fetch(doc.token_endpoint, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code, redirect_uri: redirect,
          client_id: getConfig('OIDC_CLIENT_ID'), client_secret: getConfig('OIDC_CLIENT_SECRET'),
        }),
      })
      if (!res.ok) throw new Error(`token exchange failed: ${res.status}`)
      const tok = await res.json()
      const ui = await fetch(doc.userinfo_endpoint, { headers: { authorization: `Bearer ${tok.access_token}` } })
      const profile = await ui.json()
      return { providerUserId: String(profile.sub), name: profile.name || profile.preferred_username, raw: profile }
    },
  },
  cas: {
    label: 'CAS（单点登录）',
    env: ['CAS_SERVER_URL'],
    enabled: () => !!getConfig('CAS_SERVER_URL'),
    authUrl(state, redirect) {
      const base = getConfig('CAS_SERVER_URL').replace(/\/$/, '')
      return `${base}/login?service=${encodeURIComponent(redirect)}`
    },
    async exchange(code /* ticket */, redirect) {
      const base = getConfig('CAS_SERVER_URL').replace(/\/$/, '')
      const res = await fetch(`${base}/serviceValidate?ticket=${encodeURIComponent(code)}&service=${encodeURIComponent(redirect)}`)
      const text = await res.text()
      const m = text.match(/<cas:user>([^<]+)<\/cas:user>/) || text.match(/<user>([^<]+)<\/user>/)
      if (!m) throw new Error('CAS validation failed')
      return { providerUserId: m[1], name: m[1], raw: { ticket: code } }
    },
  },
  wecom: {
    label: '企业微信',
    env: ['WECOM_CORP_ID', 'WECOM_AGENT_ID', 'WECOM_CORP_SECRET'],
    enabled: () => !!(getConfig('WECOM_CORP_ID') && getConfig('WECOM_CORP_SECRET')),
    authUrl(state, redirect) {
      const u = new URL('https://open.weixin.qq.com/connect/oauth2/authorize')
      u.searchParams.set('appid', getConfig('WECOM_CORP_ID'))
      u.searchParams.set('redirect_uri', redirect)
      u.searchParams.set('response_type', 'code')
      u.searchParams.set('scope', 'snsapi_base')
      u.searchParams.set('state', state)
      return `${u.toString()}#wechat_redirect`
    },
    async getToken() {
      const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${getConfig('WECOM_CORP_ID')}&corpsecret=${getConfig('WECOM_CORP_SECRET')}`)
      const data = await res.json()
      if (data.errcode) throw new Error(`wecom token: ${data.errcode}`)
      return data.access_token
    },
    async exchange(code) {
      const token = await this.getToken()
      const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${token}&code=${encodeURIComponent(code)}`)
      const data = await res.json()
      if (data.errcode) throw new Error(`wecom userinfo: ${data.errcode}`)
      const userid = data.userid
      // 拉取姓名
      let name = userid
      try {
        const r = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${token}&userid=${userid}`)
        const info = await r.json()
        if (info.name) name = info.name
      } catch { /* 姓名可选 */ }
      return { providerUserId: userid, name, raw: data }
    },
    async fetchUsers() {
      const token = await this.getToken()
      const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/user/list?access_token=${token}&department_id=1&fetch_child=1`)
      const data = await res.json()
      if (data.errcode) throw new Error(`wecom userlist: ${data.errcode}`)
      return (data.userlist || []).map((u) => ({
        providerUserId: u.userid, name: u.name, department: (u.department || []).join(','),
        mobile: u.mobile, email: u.email, position: u.position,
      }))
    },
    async fetchDepartments() {
      const token = await this.getToken()
      const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=${token}`)
      const data = await res.json()
      if (data.errcode) throw new Error(`wecom deptlist: ${data.errcode}`)
      return (data.department || []).map((d) => ({ providerDeptId: String(d.id), name: d.name, parentProviderDeptId: String(d.parentid), order: d.order }))
    },
  },
  dingtalk: {
    label: '钉钉',
    env: ['DINGTALK_APP_KEY', 'DINGTALK_APP_SECRET'],
    enabled: () => !!(getConfig('DINGTALK_APP_KEY') && getConfig('DINGTALK_APP_SECRET')),
    authUrl(state, redirect) {
      const u = new URL('https://login.dingtalk.com/oauth2/auth')
      u.searchParams.set('redirect_uri', redirect)
      u.searchParams.set('response_type', 'code')
      u.searchParams.set('client_id', getConfig('DINGTALK_APP_KEY'))
      u.searchParams.set('scope', 'openid')
      u.searchParams.set('state', state)
      u.searchParams.set('prompt', 'consent')
      return u.toString()
    },
    async getToken() {
      const res = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appKey: getConfig('DINGTALK_APP_KEY'), appSecret: getConfig('DINGTALK_APP_SECRET') }),
      })
      const data = await res.json()
      if (!data.accessToken) throw new Error('dingtalk token failed')
      return data.accessToken
    },
    async exchange(code) {
      const token = await this.getToken()
      const res = await fetch('https://api.dingtalk.com/v1.0/oauth2/userInfo', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-acs-dingtalk-access-token': token },
        body: JSON.stringify({ authCode: code }),
      })
      const data = await res.json()
      if (!data.nickName) throw new Error('dingtalk userinfo failed')
      return { providerUserId: data.unionId || data.openId, name: data.nickName, raw: data }
    },
    async fetchUsers() {
      const token = await this.getToken()
      // 先取部门列表再逐部门拉用户（钉钉新版 API 简化处理）
      const res = await fetch('https://api.dingtalk.com/v1.0/contact/departments?departmentId=1&maxResults=100', {
        headers: { 'x-acs-dingtalk-access-token': token },
      })
      const deptData = await res.json().catch(() => ({}))
      const depts = deptData.result || []
      const out = []
      for (const d of depts) {
        try {
          const ur = await fetch(`https://api.dingtalk.com/v1.0/contact/users?departmentId=${d.deptId}&maxResults=100`, {
            headers: { 'x-acs-dingtalk-access-token': token },
          })
          const ud = await ur.json().catch(() => ({}))
          for (const u of ud.result || []) out.push({ providerUserId: u.unionId, name: u.name, department: String(d.deptId) })
        } catch { /* 部门失败不阻塞整体 */ }
      }
      return out
    },
    async fetchDepartments() {
      const token = await this.getToken()
      const res = await fetch('https://api.dingtalk.com/v1.0/contact/departments?departmentId=1&maxResults=100', {
        headers: { 'x-acs-dingtalk-access-token': token },
      })
      const data = await res.json().catch(() => ({}))
      return (data.result || []).map((d) => ({ providerDeptId: String(d.deptId), name: d.name, parentProviderDeptId: String(d.parentId), order: d.order }))
    },
  },
}

export function listProviders() {
  return Object.entries(IDP_REGISTRY).map(([key, p]) => ({
    key, label: p.label, enabled: p.enabled(),
    syncable: !!(p.fetchUsers && p.fetchDepartments),
  }))
}

export function getProvider(key) {
  const p = IDP_REGISTRY[key]
  if (!p) throw new Error(`未知 SSO 提供方: ${key}`)
  if (!p.enabled()) throw new Error(`${p.label} 未配置（缺少环境变量）`)
  return p
}

const pendingStates = new Map() // state → { provider, redirect, expires }
export function createState(provider, redirect) {
  const state = crypto.randomBytes(16).toString('base64url')
  pendingStates.set(state, { provider, redirect, expires: Date.now() + 10 * 60 * 1000 })
  // 顺手清理过期
  for (const [k, v] of pendingStates) if (v.expires < Date.now()) pendingStates.delete(k)
  return state
}
export function takeState(state) {
  const v = pendingStates.get(state)
  if (!v || v.expires < Date.now()) return null
  pendingStates.delete(state)
  return v
}
