// 平台配置：.env 初始值播种进 settings 表，之后后台可直接改。
// 读取顺序：DB（settings 表）优先 → 环境变量兜底 → 默认值。
// 写入只落 DB，不回写 .env；重启后 env 仅在 DB 无值时生效。
import { db } from './db.js'

const settings = db('settings')

// SSO 提供方分组：每组对应一个 IdP，卡片化展示
export const SSO_GROUPS = [
  {
    key: 'oauth2', label: 'OAuth2（通用）',
    desc: '标准 OAuth2 授权码流程，适配任意支持 OAuth2 的身份源',
    keys: ['OAUTH2_AUTH_URL', 'OAUTH2_TOKEN_URL', 'OAUTH2_USERINFO_URL', 'OAUTH2_CLIENT_ID', 'OAUTH2_CLIENT_SECRET', 'OAUTH2_SCOPE'],
    required: ['OAUTH2_AUTH_URL', 'OAUTH2_CLIENT_ID'],
  },
  {
    key: 'oidc', label: 'OIDC（OpenID Connect）',
    desc: '填写 Issuer 即可自动发现端点（.well-known/openid-configuration）',
    keys: ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'],
    required: ['OIDC_ISSUER', 'OIDC_CLIENT_ID'],
  },
  {
    key: 'cas', label: 'CAS（单点登录）',
    desc: 'CAS 2.0 协议 serviceValidate',
    keys: ['CAS_SERVER_URL'],
    required: ['CAS_SERVER_URL'],
  },
  {
    key: 'wecom', label: '企业微信',
    desc: '扫码/网页授权登录，支持通讯录同步',
    keys: ['WECOM_CORP_ID', 'WECOM_AGENT_ID', 'WECOM_CORP_SECRET'],
    required: ['WECOM_CORP_ID', 'WECOM_CORP_SECRET'],
  },
  {
    key: 'dingtalk', label: '钉钉',
    desc: '扫码登录，支持通讯录同步',
    keys: ['DINGTALK_APP_KEY', 'DINGTALK_APP_SECRET'],
    required: ['DINGTALK_APP_KEY', 'DINGTALK_APP_SECRET'],
  },
]

// 配置项注册表：key → { label, group, secret, default }
// group: ai | sso | general；secret 项在后台脱敏显示
export const CONFIG_SCHEMA = {
  // ---- AI ----
  AI_BASE_URL: { label: 'AI Base URL', group: 'ai', secret: false, default: '' },
  AI_API_KEY: { label: 'AI API Key', group: 'ai', secret: true, default: '' },
  AI_MODEL: { label: 'AI 模型', group: 'ai', secret: false, default: 'gpt-4o-mini' },
  // ---- OAuth2 ----
  OAUTH2_AUTH_URL: { label: 'OAuth2 授权地址', group: 'sso:oauth2', secret: false, default: '' },
  OAUTH2_TOKEN_URL: { label: 'OAuth2 Token 地址', group: 'sso:oauth2', secret: false, default: '' },
  OAUTH2_USERINFO_URL: { label: 'OAuth2 Userinfo 地址', group: 'sso:oauth2', secret: false, default: '' },
  OAUTH2_CLIENT_ID: { label: 'OAuth2 Client ID', group: 'sso:oauth2', secret: false, default: '' },
  OAUTH2_CLIENT_SECRET: { label: 'OAuth2 Client Secret', group: 'sso:oauth2', secret: true, default: '' },
  OAUTH2_SCOPE: { label: 'OAuth2 Scope', group: 'sso:oauth2', secret: false, default: '' },
  // ---- OIDC ----
  OIDC_ISSUER: { label: 'OIDC Issuer', group: 'sso:oidc', secret: false, default: '' },
  OIDC_CLIENT_ID: { label: 'OIDC Client ID', group: 'sso:oidc', secret: false, default: '' },
  OIDC_CLIENT_SECRET: { label: 'OIDC Client Secret', group: 'sso:oidc', secret: true, default: '' },
  // ---- CAS ----
  CAS_SERVER_URL: { label: 'CAS 服务地址', group: 'sso:cas', secret: false, default: '' },
  // ---- 企业微信 ----
  WECOM_CORP_ID: { label: '企微 Corp ID', group: 'sso:wecom', secret: false, default: '' },
  WECOM_AGENT_ID: { label: '企微 Agent ID', group: 'sso:wecom', secret: false, default: '' },
  WECOM_CORP_SECRET: { label: '企微 Corp Secret', group: 'sso:wecom', secret: true, default: '' },
  // ---- 钉钉 ----
  DINGTALK_APP_KEY: { label: '钉钉 App Key', group: 'sso:dingtalk', secret: false, default: '' },
  DINGTALK_APP_SECRET: { label: '钉钉 App Secret', group: 'sso:dingtalk', secret: true, default: '' },
  // ---- 通用 ----
  FRONTEND_URL: { label: '前端地址（SSO 回跳）', group: 'general', secret: false, default: '' },
}

// DB 中一行存一个 key，形如 { id, key: 'cfg:AI_BASE_URL', value: '...' }
const K = (key) => `cfg:${key}`

// 启动播种：.env 有值而 DB 无值的项写入 DB（作为初始值，之后 DB 为准）
export function seedConfigFromEnv() {
  let seeded = 0
  for (const [key, meta] of Object.entries(CONFIG_SCHEMA)) {
    const existing = settings.find((r) => r.key === K(key))
    if (existing) continue
    const envVal = process.env[key]
    if (envVal !== undefined && envVal !== '') {
      settings.insert({ key: K(key), value: envVal })
      seeded++
    } else if (meta.default) {
      settings.insert({ key: K(key), value: meta.default })
    }
  }
  if (seeded) console.log(`[config] 已从环境变量播种 ${seeded} 项配置到数据库`)
}

// 读单值：DB 优先 → env 兜底 → default
export function getConfig(key) {
  const meta = CONFIG_SCHEMA[key]
  if (!meta) return process.env[key] ?? ''
  const row = settings.find((r) => r.key === K(key))
  if (row?.value !== undefined && row.value !== null && row.value !== '') return row.value
  if (process.env[key] !== undefined && process.env[key] !== '') return process.env[key]
  return meta.default
}

// 批量读某组
export function getGroupConfig(group) {
  const out = {}
  for (const key of Object.keys(CONFIG_SCHEMA)) {
    if (CONFIG_SCHEMA[key].group === group) out[key] = getConfig(key)
  }
  return out
}

// 写单值（后台修改；空字符串 = 清除，回落 env/default）
export function setConfig(key, value) {
  if (!CONFIG_SCHEMA[key]) throw new Error(`未知配置项: ${key}`)
  const row = settings.find((r) => r.key === K(key))
  if (row) settings.update(row.id, { value: String(value ?? '') })
  else settings.insert({ key: K(key), value: String(value ?? '') })
}

// 后台列表视图：secret 项脱敏
export function listConfig() {
  return Object.entries(CONFIG_SCHEMA).map(([key, meta]) => {
    const val = getConfig(key)
    return {
      key,
      label: meta.label,
      group: meta.group,
      secret: meta.secret,
      hasValue: !!val,
      // secret 只回传掩码，不回传明文
      value: meta.secret ? (val ? '••••••••' : '') : val,
      fromDb: !!settings.find((r) => r.key === K(key)),
    }
  })
}
