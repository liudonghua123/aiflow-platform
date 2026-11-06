// 主入口：Express + 全量 RESTful API + MCP + 种子数据
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { db, uid } from './db.js'
import {
  users, roles, departments, forms, flows, instances, webhooks, webhookLogs, apps, settings,
  userPermissions, deptTree, seedOrg, can,
} from './rbac.js'
import { authRequired, permRequired, signToken, authenticateLocal, registerUser, upsertExternalUser, listProviders, getProvider, createState, takeState } from './auth.js'
import { validateFlow, startInstance, handleTask, instanceForUser } from './engine.js'
import { dispatchEvent, WEBHOOK_EVENTS, redeliver } from './webhook.js'
import { generateFormSchema, generateFlowDefinition, aiEnabled } from './ai.js'
import { seedConfigFromEnv, listConfig, setConfig, getConfig, CONFIG_SCHEMA, SSO_GROUPS } from './config.js'
import { createMcpHandler } from './mcp.js'
import {
  generateTotpSecret, totpUri, verifyTotp,
  createChallenge, verifyRegistration, verifyAssertion,
  issueMfaChallenge, takeMfaChallenge,
  listCredentials, addTotpCredential, addPasskeyCredential, findPasskey, removeCredential,
  hasMfa, requiredMfa, rawCredentials, totpCredential,
} from './mfa.js'

const mfaCredentialsRaw = rawCredentials()
const challengeRest = new Map()
const setupSecrets = new Map() // userId → 待确认的 totp secret

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 8790

// 启动时把 .env 配置播种进 settings 表（之后后台修改即生效，DB 优先）
seedConfigFromEnv()

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// ============ 认证（开放路由，先于 authRequired 挂载） ============
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {}
  const user = await authenticateLocal(username, password)
  if (!user) return res.status(401).json({ error: '用户名或密码错误' })
  // 角色/用户强制 MFA：返回挑战而非 token
  const need = requiredMfa(user)
  if (need) {
    if (!hasMfa(user.id, need)) {
      return res.status(403).json({ error: `该账号需要 ${need === 'otp' ? 'OTP 验证器' : 'Passkey'} 验证，请先联系管理员绑定`, code: 'MFA_NOT_ENROLLED', mfa: need })
    }
    const mfaToken = issueMfaChallenge(user.id, need)
    return res.json({ mfaRequired: need, mfaToken })
  }
  res.json({ token: signToken(user), user: publicUser(user) })
})

// ---- MFA 二次验证 ----
app.post('/api/auth/mfa/verify', async (req, res) => {
  const { mfaToken, code, assertion } = req.body || {}
  const ch = takeMfaChallenge(mfaToken)
  if (!ch) return res.status(401).json({ error: 'MFA 会话已过期，请重新登录' })
  const user = users.get(ch.userId)
  if (!user) return res.status(401).json({ error: '用户不存在' })
  try {
    if (ch.kind === 'otp') {
      const cred = totpCredential(user.id)
      if (!cred || !verifyTotp(cred.secret, String(code || ''))) throw new Error('验证码错误或已过期')
    } else if (ch.kind === 'passkey') {
      const origin = getConfig('FRONTEND_URL') || `${req.protocol}://${req.get('host')}:5173`
      const cred = findPasskey(assertion?.credentialIdB64 || '')
      if (!cred || cred.userId !== user.id) throw new Error('Passkey 未注册')
      verifyAssertion({
        credentialIdB64: cred.credentialId,
        response: assertion?.response,
        expectedChallenge: assertion?.challenge,
        expectedOrigin: origin,
        publicKeyPem: cred.publicKeyPem,
        storedSignCount: cred.counter || 0,
      })
    } else {
      return res.status(400).json({ error: '未知 MFA 类型' })
    }
    res.json({ token: signToken(user), user: publicUser(user) })
  } catch (e) {
    res.status(401).json({ error: String(e.message) })
  }
})

// WebAuthn 登录挑战（密码验证后由 mfaToken 关联）
app.post('/api/auth/mfa/passkey/options', (req, res) => {
  const { mfaToken } = req.body || {}
  const ch = takeMfaChallenge(mfaToken)
  if (!ch) return res.status(401).json({ error: 'MFA 会话已过期' })
  // 不消耗：放回
  challengeRest.put(mfaToken, ch)
  const creds = mfaCredentialsRaw.filter((c) => c.userId === ch.userId && c.type === 'passkey')
  res.json({
    challenge: createChallenge(),
    allowCredentials: creds.map((c) => ({ id: c.credentialId, type: 'public-key' })),
  })
})

app.get('/api/auth/sso/providers', (req, res) => {
  res.json({ providers: listProviders().map((p) => ({ ...p, url: p.enabled ? `/api/auth/sso/${p.key}?redirect=${encodeURIComponent(req.query.redirect || '/')}` : null })) })
})

app.get('/api/auth/sso/:provider', async (req, res) => {
  try {
    const provider = getProvider(req.params.provider)
    const redirect = `${req.protocol}://${req.get('host')}/api/auth/sso/${req.params.provider}/callback`
    const state = createState(req.params.provider, redirect)
    res.redirect(await provider.authUrl(state, redirect))
  } catch (e) {
    res.status(400).json({ error: String(e.message) })
  }
})

app.get('/api/auth/sso/:provider/callback', async (req, res) => {
  try {
    const { code, state } = req.query
    const st = takeState(state)
    if (!st) return res.status(400).json({ error: 'state 已过期，请重新登录' })
    const provider = getProvider(req.params.provider)
    const identity = await provider.exchange(code, st.redirect)
    const user = upsertExternalUser({ provider: req.params.provider, providerUserId: identity.providerUserId, name: identity.name })
    const frontend = getConfig('FRONTEND_URL') || `${req.protocol}://${req.get('host')}:5173`
    res.redirect(`${frontend}/sso-callback?token=${signToken(user)}`)
  } catch (e) {
    const frontend = getConfig('FRONTEND_URL') || `${req.protocol}://${req.get('host')}:5173`
    res.redirect(`${frontend}/login?sso_error=${encodeURIComponent(String(e.message))}`)
  }
})

// ============ 受保护路由 ============
const api = express.Router()
api.use(authRequired)
app.use('/api', api)

// 组织架构同步（企微 / 钉钉 → 平台）
api.post('/admin/org/sync/:provider', permRequired('org:manage'), async (req, res) => {
  try {
    const provider = getProvider(req.params.provider)
    if (!provider.fetchUsers) return res.status(400).json({ error: '该提供方不支持组织架构同步' })
    const extDepts = await provider.fetchDepartments()
    const extUsers = await provider.fetchUsers()
    // 部门 upsert（以 providerDeptId 为外部键）
    for (const ed of extDepts) {
      let d = departments.find((x) => x.providerDeptId === ed.providerDeptId && x.provider === req.params.provider)
      if (d) departments.update(d.id, { name: ed.name, order: ed.order || 0 })
      else departments.insert({ name: ed.name, providerDeptId: ed.providerDeptId, provider: req.params.provider, parentId: '', order: ed.order || 0 })
    }
    // 二次遍历修父子
    for (const ed of extDepts) {
      const d = departments.find((x) => x.providerDeptId === ed.providerDeptId && x.provider === req.params.provider)
      if (d && ed.parentProviderDeptId) {
        const parent = departments.find((x) => x.providerDeptId === ed.parentProviderDeptId && x.provider === req.params.provider)
        if (parent) departments.update(d.id, { parentId: parent.id })
      }
    }
    // 用户 upsert
    let created = 0, updated = 0
    for (const eu of extUsers) {
      const key = `${req.params.provider}:${eu.providerUserId}`
      let u = users.find((x) => (x.identities || []).some((i) => i.key === key))
      if (u) { updated++ }
      else {
        u = await registerUser({ username: `${req.params.provider}_${eu.providerUserId}`.slice(0, 60), password: uid('pw'), name: eu.name })
        users.update(u.id, { identities: [{ provider: req.params.provider, providerUserId: eu.providerUserId, key }] })
        created++
      }
    }
    res.json({ ok: true, departments: extDepts.length, users: { created, updated } })
  } catch (e) {
    res.status(500).json({ error: String(e.message) })
  }
})

function publicUser(u) {
  const dept = departments.get(u.departmentId)
  return {
    id: u.id, username: u.username, name: u.name, departmentId: u.departmentId,
    departmentName: dept?.name || '', roleIds: u.roleIds,
    mfaPolicy: u.mfaPolicy || 'auto',
    permissions: [...userPermissions(u)],
  }
}

// ============ 当前用户 ============
api.get('/me', (req, res) => res.json(publicUser(req.user)))
api.get('/me/tasks', (req, res) => {
  const running = instances.all().filter((i) => i.status === 'running' || i.status === 'blocked')
  const todo = running.flatMap((i) => (i.tasks || []).filter((t) => t.assigneeId === req.user.id && t.status === 'pending')
    .map((t) => ({ ...t, instanceId: i.id, instanceTitle: i.title, flowName: i.flowName, submitterId: i.submitterId, formData: i.formData })))
  const cc = instances.all().flatMap((i) => (i.tasks || []).filter((t) => t.assigneeId === req.user.id && t.type === 'cc')
    .map((t) => ({ ...t, instanceId: i.id, instanceTitle: i.title, flowName: i.flowName })))
  const done = instances.all().flatMap((i) => (i.tasks || []).filter((t) => t.assigneeId === req.user.id && (t.status === 'approved' || t.status === 'rejected'))
    .map((t) => ({ ...t, instanceId: i.id, instanceTitle: i.title, flowName: i.flowName })))
  const mine = instances.filter((i) => i.submitterId === req.user.id)
  res.json({ todo, cc, done, mine: mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50) })
})

// ============ 用户管理 ============
api.get('/users', permRequired('user:read'), (req, res) => {
  res.json(users.all().map((u) => ({ ...publicUser(u), hasPassword: !!u.passwordHash, identities: (u.identities || []).map((i) => i.provider) })))
})
api.post('/users', permRequired('user:manage'), async (req, res) => {
  try {
    const { username, password, name, departmentId, roleIds } = req.body
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' })
    const u = await registerUser({ username, password, name, departmentId, roleIds })
    await dispatchEvent('user.created', { userId: u.id, username: u.username, name: u.name })
    res.json(publicUser(u))
  } catch (e) { res.status(400).json({ error: String(e.message) }) }
})
api.patch('/users/:id', permRequired('user:manage'), (req, res) => {
  const { name, departmentId, roleIds, status, mfaPolicy } = req.body
  const u = users.update(req.params.id, { ...(name !== undefined && { name }), ...(departmentId !== undefined && { departmentId }), ...(roleIds !== undefined && { roleIds }), ...(status !== undefined && { status }), ...(mfaPolicy !== undefined && { mfaPolicy }) })
  if (!u) return res.status(404).json({ error: '用户不存在' })
  res.json(publicUser(u))
})
api.delete('/users/:id', permRequired('user:manage'), (req, res) => {
  if (!users.remove(req.params.id)) return res.status(404).json({ error: '用户不存在' })
  res.json({ ok: true })
})

// ============ 角色 ============
api.get('/roles', (req, res) => res.json(roles.all()))
api.post('/roles', permRequired('setting:manage'), (req, res) => {
  const { key, name, description, permissions } = req.body
  if (!key || !name) return res.status(400).json({ error: 'key 和 name 必填' })
  res.json(roles.insert({ key, name, description: description || '', permissions: permissions || [] }))
})
api.patch('/roles/:id', permRequired('setting:manage'), (req, res) => {
  const r = roles.get(req.params.id)
  if (!r) return res.status(404).json({ error: '角色不存在' })
  if (r.builtIn && req.body.permissions) return res.status(400).json({ error: '内置角色不可修改权限' })
  const patch = { ...req.body }
  if (patch.mfaPolicy !== undefined && !['none', 'otp', 'passkey', 'auto'].includes(patch.mfaPolicy)) {
    return res.status(400).json({ error: 'mfaPolicy 必须是 none | otp | passkey | auto' })
  }
  res.json(roles.update(req.params.id, patch))
})
api.delete('/roles/:id', permRequired('setting:manage'), (req, res) => {
  const r = roles.get(req.params.id)
  if (r?.builtIn) return res.status(400).json({ error: '内置角色不可删除' })
  roles.remove(req.params.id)
  res.json({ ok: true })
})

// ============ MFA（Passkey / OTP） ============
// 我的凭据列表
api.get('/me/mfa', (req, res) => {
  res.json({
    credentials: listCredentials(req.user.id),
    required: requiredMfa(req.user),
  })
})

// ---- OTP 绑定：生成 secret + 二维码 ----
api.post('/me/mfa/otp/setup', (req, res) => {
  if (hasMfa(req.user.id, 'totp')) return res.status(400).json({ error: '已绑定 OTP 验证器，请先解绑' })
  const secret = generateTotpSecret()
  setupSecrets.set(req.user.id, secret)
  const uri = totpUri(secret, req.user.username || req.user.name)
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(uri)}`
  res.json({ secret, uri, qr })
})

// ---- OTP 绑定确认：验证首个验证码 ----
api.post('/me/mfa/otp/confirm', (req, res) => {
  const secret = setupSecrets.get(req.user.id)
  if (!secret) return res.status(400).json({ error: '请先获取绑定二维码' })
  if (!verifyTotp(secret, String(req.body?.code || ''))) return res.status(400).json({ error: '验证码错误，请重试' })
  setupSecrets.delete(req.user.id)
  const cred = addTotpCredential(req.user.id, req.body?.name, secret)
  res.json({ ok: true, id: cred.id })
})

// ---- Passkey 注册挑战 ----
api.post('/me/mfa/passkey/options', (req, res) => {
  res.json({
    challenge: createChallenge(),
    rp: { name: 'AIFlow' },
    user: { id: Buffer.from(req.user.id).toString('base64url'), name: req.user.username || req.user.name, displayName: req.user.name },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },   // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    timeout: 60_000,
  })
})

// ---- Passkey 注册确认 ----
api.post('/me/mfa/passkey/register', (req, res) => {
  const origin = getConfig('FRONTEND_URL') || `${req.protocol}://${req.get('host')}:5173`
  try {
    const reg = verifyRegistration({
      response: req.body?.response,
      expectedChallenge: req.body?.challenge,
      expectedOrigin: origin,
    })
    const cred = addPasskeyCredential(req.user.id, req.body?.name, reg)
    res.json({ ok: true, id: cred.id })
  } catch (e) {
    res.status(400).json({ error: String(e.message) })
  }
})

// ---- 解绑 ----
api.delete('/me/mfa/:credId', (req, res) => {
  try {
    removeCredential(req.user.id, req.params.credId)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: String(e.message) }) }
})

// ============ 组织架构 ============
api.get('/org/tree', (req, res) => res.json(deptTree()))
api.post('/org/departments', permRequired('org:manage'), (req, res) => {
  const { name, parentId, leaderUserId, order } = req.body
  if (!name) return res.status(400).json({ error: '名称必填' })
  res.json(departments.insert({ name, parentId: parentId || '', leaderUserId: leaderUserId || '', order: order || 0 }))
})
api.patch('/org/departments/:id', permRequired('org:manage'), (req, res) => {
  const d = departments.update(req.params.id, req.body)
  if (!d) return res.status(404).json({ error: '部门不存在' })
  res.json(d)
})
api.delete('/org/departments/:id', permRequired('org:manage'), (req, res) => {
  const hasChildren = departments.find((d) => d.parentId === req.params.id)
  if (hasChildren) return res.status(400).json({ error: '请先删除子部门' })
  departments.remove(req.params.id)
  res.json({ ok: true })
})

// ============ 表单 ============
api.get('/forms', permRequired('form:read'), (req, res) => res.json(forms.all()))
api.get('/forms/:id', permRequired('form:read'), (req, res) => {
  const f = forms.get(req.params.id)
  if (!f) return res.status(404).json({ error: '表单不存在' })
  res.json(f)
})
api.post('/forms', permRequired('form:write'), async (req, res) => {
  const { name, description, schema } = req.body
  if (!name || !schema) return res.status(400).json({ error: 'name 与 schema 必填' })
  const f = forms.insert({ name, description: description || '', schema, version: 1, published: false })
  await dispatchEvent('form.created', { formId: f.id, name: f.name })
  res.json(f)
})
api.patch('/forms/:id', permRequired('form:write'), async (req, res) => {
  const f = forms.get(req.params.id)
  if (!f) return res.status(404).json({ error: '表单不存在' })
  const patch = { ...req.body }
  if (patch.schema) patch.version = (f.version || 1) + 1
  const updated = forms.update(req.params.id, patch)
  await dispatchEvent('form.updated', { formId: f.id, name: updated.name, version: updated.version })
  res.json(updated)
})
api.delete('/forms/:id', permRequired('form:delete'), async (req, res) => {
  forms.remove(req.params.id)
  await dispatchEvent('form.deleted', { formId: req.params.id })
  res.json({ ok: true })
})

// ============ 流程 ============
api.get('/flows', permRequired('flow:read'), (req, res) => res.json(flows.all()))
api.get('/flows/:id', permRequired('flow:read'), (req, res) => {
  const f = flows.get(req.params.id)
  if (!f) return res.status(404).json({ error: '流程不存在' })
  res.json(f)
})
api.post('/flows', permRequired('flow:write'), (req, res) => {
  const { name, formId, definition } = req.body
  if (!name) return res.status(400).json({ error: 'name 必填' })
  const def = definition || { nodes: [{ id: 'start', type: 'start', name: '发起', next: 'end' }, { id: 'end', type: 'end', name: '结束' }] }
  const check = validateFlow(def)
  if (!check.ok) return res.status(400).json({ error: check.error })
  res.json(flows.insert({ name, formId: formId || '', definition: def, published: false }))
})
api.patch('/flows/:id', permRequired('flow:write'), async (req, res) => {
  const f = flows.get(req.params.id)
  if (!f) return res.status(404).json({ error: '流程不存在' })
  if (req.body.definition) {
    const check = validateFlow(req.body.definition)
    if (!check.ok) return res.status(400).json({ error: check.error })
  }
  const updated = flows.update(req.params.id, req.body)
  await dispatchEvent('flow.updated', { flowId: f.id, name: updated.name })
  res.json(updated)
})
api.post('/flows/:id/publish', permRequired('flow:publish'), async (req, res) => {
  const f = flows.get(req.params.id)
  if (!f) return res.status(404).json({ error: '流程不存在' })
  const check = validateFlow(f.definition)
  if (!check.ok) return res.status(400).json({ error: check.error })
  flows.update(req.params.id, { published: true })
  await dispatchEvent('flow.published', { flowId: f.id, name: f.name })
  res.json({ ok: true })
})
api.delete('/flows/:id', permRequired('flow:delete'), async (req, res) => {
  flows.remove(req.params.id)
  await dispatchEvent('flow.deleted', { flowId: req.params.id })
  res.json({ ok: true })
})

// ============ 审批实例 ============
api.get('/instances', permRequired('instance:read'), (req, res) => {
  let rows = instances.all()
  if (req.query.flowId) rows = rows.filter((i) => i.flowId === req.query.flowId)
  if (req.query.status) rows = rows.filter((i) => i.status === req.query.status)
  res.json(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100))
})
api.get('/instances/:id', permRequired('instance:read'), (req, res) => {
  const inst = instances.get(req.params.id)
  if (!inst) return res.status(404).json({ error: '实例不存在' })
  res.json({ ...inst, viewer: instanceForUser(inst, req.user.id) })
})
api.post('/instances', permRequired('instance:start'), async (req, res) => {
  try {
    const { flowId, formData, title } = req.body
    const inst = await startInstance({ flowId, submitterId: req.user.id, formData, title })
    res.json(inst)
  } catch (e) { res.status(400).json({ error: String(e.message) }) }
})
api.post('/instances/:id/tasks/:taskId', permRequired('instance:approve'), async (req, res) => {
  try {
    const { action, comment } = req.body
    const inst = await handleTask({ instanceId: req.params.id, taskId: req.params.taskId, userId: req.user.id, action, comment })
    res.json(inst)
  } catch (e) { res.status(400).json({ error: String(e.message) }) }
})

// ============ Webhook ============
api.get('/webhooks', permRequired('webhook:read'), (req, res) => {
  res.json(webhooks.all().map(({ secret, ...w }) => ({ ...w, secretPreview: secret ? secret.slice(0, 6) + '...' : '' })))
})
api.post('/webhooks', permRequired('webhook:manage'), (req, res) => {
  const { name, url, events, filters, enabled, retryOnFailure } = req.body
  if (!name || !url) return res.status(400).json({ error: 'name 与 url 必填' })
  try { new URL(url) } catch { return res.status(400).json({ error: 'url 不合法' }) }
  const secret = uid('whsec')
  const w = webhooks.insert({ name, url, events: events || [], filters: filters || [], enabled: enabled !== false, retryOnFailure: retryOnFailure !== false, secret })
  const { secret: _s, ...safe } = w
  res.json({ ...safe, secretPreview: secret.slice(0, 6) + '...' })
})
api.patch('/webhooks/:id', permRequired('webhook:manage'), (req, res) => {
  const w = webhooks.update(req.params.id, req.body)
  if (!w) return res.status(404).json({ error: 'webhook 不存在' })
  const { secret, ...safe } = w
  res.json({ ...safe, secretPreview: secret.slice(0, 6) + '...' })
})
api.delete('/webhooks/:id', permRequired('webhook:manage'), (req, res) => {
  webhooks.remove(req.params.id)
  res.json({ ok: true })
})
api.post('/webhooks/:id/secret', permRequired('webhook:manage'), (req, res) => {
  const w = webhooks.get(req.params.id)
  if (!w) return res.status(404).json({ error: 'webhook 不存在' })
  const secret = uid('whsec')
  webhooks.update(req.params.id, { secret })
  res.json({ secret })
})
api.get('/webhook-events', permRequired('webhook:read'), (req, res) => res.json(WEBHOOK_EVENTS))
api.get('/webhooks/:id/logs', permRequired('webhook:read'), (req, res) => {
  res.json(webhookLogs.filter((l) => l.webhookId === req.params.id).sort((a, b) => b.requestAt.localeCompare(a.requestAt)).slice(0, 50))
})
api.post('/webhook-logs/:logId/redeliver', permRequired('webhook:manage'), (req, res) => {
  const ok = redeliver(req.params.logId)
  if (!ok) return res.status(404).json({ error: '日志不存在' })
  res.json({ ok: true })
})

// ============ AI ============
api.get('/ai/status', (req, res) => res.json({ enabled: aiEnabled() }))
api.post('/ai/form', permRequired('form:write'), async (req, res) => {
  try { res.json(await generateFormSchema(req.body.prompt || '')) }
  catch (e) { res.status(500).json({ error: String(e.message) }) }
})
api.post('/ai/flow', permRequired('flow:write'), async (req, res) => {
  try {
    const formId = req.body.formId
    const fields = formId ? (forms.get(formId)?.schema?.fields || []) : []
    res.json(await generateFlowDefinition(req.body.prompt || '', fields))
  } catch (e) { res.status(500).json({ error: String(e.message) }) }
})

// ============ 应用（低代码应用 = 表单 + 流程绑定） ============
api.get('/apps', permRequired('app:read'), (req, res) => res.json(apps.all()))
api.post('/apps', permRequired('app:write'), (req, res) => {
  const { name, formId, flowId, icon, color } = req.body
  if (!name) return res.status(400).json({ error: 'name 必填' })
  res.json(apps.insert({ name, formId: formId || '', flowId: flowId || '', icon: icon || 'doc', color: color || '#1b6c80' }))
})
api.patch('/apps/:id', permRequired('app:write'), (req, res) => {
  const a = apps.update(req.params.id, req.body)
  if (!a) return res.status(404).json({ error: '应用不存在' })
  res.json(a)
})
api.delete('/apps/:id', permRequired('app:delete'), (req, res) => {
  apps.remove(req.params.id)
  res.json({ ok: true })
})

// ============ 平台设置 ============
api.get('/settings/:key', permRequired('setting:read'), (req, res) => {
  const s = settings.find((r) => r.key === req.params.key)
  res.json(s?.value || {})
})
api.put('/settings/:key', permRequired('setting:manage'), (req, res) => {
  const s = settings.find((r) => r.key === req.params.key)
  if (s) settings.update(s.id, { value: req.body })
  else settings.insert({ key: req.params.key, value: req.body })
  res.json({ ok: true })
})

// ---- 平台配置（.env 播种入库，后台可改） ----
api.get('/platform-config', permRequired('setting:read'), (req, res) => {
  // SSO 各提供方启用状态：required 项全部有值
  const ssoGroups = SSO_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    desc: g.desc,
    enabled: g.required.every((k) => !!getConfig(k)),
  }))
  res.json({ items: listConfig(), ssoGroups })
})
api.put('/platform-config', permRequired('setting:manage'), (req, res) => {
  const { values } = req.body || {}
  if (!values || typeof values !== 'object') return res.status(400).json({ error: 'values 必填' })
  const updated = []
  for (const [key, value] of Object.entries(values)) {
    if (!CONFIG_SCHEMA[key]) continue
    // secret 项：传掩码/空串则跳过（不覆盖已有值）
    if (CONFIG_SCHEMA[key].secret && (!value || String(value).startsWith('••'))) continue
    setConfig(key, value)
    updated.push(key)
  }
  res.json({ ok: true, updated })
})

// ============ MCP（挂载在 /mcp，无需 JWT —— 由 MCP 客户端持有能力） ============
app.all('/mcp', createMcpHandler())

// ============ 静态托管前端产物 ============
const webDist = path.join(__dirname, '../../web/dist')
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist))
  app.get(/^(?!\/(api|mcp)).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')))
}

// ============ 种子数据 ============
async function seed() {
  seedOrg()
  if (!users.all().length) {
    const admin = await registerUser({ username: 'admin', password: 'admin123', name: '系统管理员', roleIds: ['role_admin'] })
    const tech = departments.all().find((d) => d.name === '技术部')
    const hr = departments.all().find((d) => d.name === '人事部')
    const finance = departments.all().find((d) => d.name === '财务部')
    const zhang = await registerUser({ username: 'zhangsan', password: 'zhang123', name: '张三', departmentId: tech.id, roleIds: ['role_member'] })
    const lisi = await registerUser({ username: 'lisi', password: 'lisi123', name: '李四', departmentId: hr.id, roleIds: ['role_member'] })
    const wang = await registerUser({ username: 'wangwu', password: 'wang123', name: '王五', departmentId: finance.id, roleIds: ['role_process_admin'] })
    departments.update(tech.id, { leaderUserId: zhang.id })
    departments.update(hr.id, { leaderUserId: lisi.id })
    departments.update(finance.id, { leaderUserId: wang.id })
    console.log('[seed] 已创建演示账号: admin/admin123, zhangsan/zhang123, lisi/lisi123, wangwu/wang123')
  }
  if (!flows.all().length) {
    // 演示表单
    const leaveForm = forms.insert({
      name: '请假申请', description: '员工请假申请表单',
      version: 1, published: true,
      schema: {
        fields: [
          { key: 'leave_type', label: '请假类型', type: 'select', required: true, options: ['年假', '调休', '事假', '病假'] },
          { key: 'start_date', label: '开始时间', type: 'datetime', required: true },
          { key: 'end_date', label: '结束时间', type: 'datetime', required: true },
          { key: 'days', label: '请假天数', type: 'number', required: true },
          { key: 'reason', label: '请假事由', type: 'textarea', required: true },
        ],
      },
    })
    flows.insert({
      name: '请假审批', formId: leaveForm.id, published: true,
      definition: {
        nodes: [
          { id: 'start', type: 'start', name: '发起', x: 60, y: 200, next: 'c_days' },
          {
            id: 'c_days', type: 'condition', name: '天数判断', x: 280, y: 200,
            branches: [
              { id: 'b1', name: '3 天以内', to: 'n_leader', condition: { groups: [{ logic: 'and', rules: [{ field: 'days', op: 'lte', value: '3' }] }] } },
              { id: 'b2', name: '超过 3 天', to: 'n_leader2', condition: null },
            ],
          },
          { id: 'n_leader', type: 'approver', name: '部门主管审批', x: 520, y: 100, approver: { mode: 'dept_leader', counterSign: 'any' }, next: 'end' },
          { id: 'n_leader2', type: 'approver', name: '部门主管审批', x: 520, y: 300, approver: { mode: 'dept_leader', counterSign: 'any' }, next: 'n_hr' },
          { id: 'n_hr', type: 'approver', name: '人事备案', x: 760, y: 300, approver: { mode: 'specified_role', roleId: 'role_process_admin', counterSign: 'any' }, next: 'end' },
          { id: 'end', type: 'end', name: '结束', x: 980, y: 200 },
        ],
      },
    })
    console.log('[seed] 已创建演示表单「请假申请」与流程「请假审批」')
  }
}

seed().then(() => {
  app.listen(PORT, () => console.log(`[aiflow-server] http://localhost:${PORT}  (REST: /api/*, MCP: /mcp)`))
})
