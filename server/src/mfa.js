// MFA：TOTP (OTP) + WebAuthn Passkey，零外部依赖实现。
// 角色/用户可设置强制 MFA 策略：登录密码通过后返回 mfaChallenge，二次验证通过才发 JWT。
import crypto from 'node:crypto'
import { db, uid, nowISO } from './db.js'
import { roles } from './rbac.js'

export const mfaCredentials = db('mfa_credentials') // { id, userId, type: 'totp'|'passkey', name, secret?, publicKey?, credentialId?, counter?, createdAt }
const challenges = new Map() // mfaToken → { userId, expiresAt, kind }

const MFA_TTL = 5 * 60_000

// ============ Base32 (RFC 4648) ============
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function base32Encode(buf) {
  let bits = 0, value = 0, out = ''
  for (const b of buf) {
    value = (value << 8) | b; bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}
export function base32Decode(str) {
  let bits = 0, value = 0
  const out = []
  for (const c of str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')) {
    const idx = B32.indexOf(c)
    if (idx === -1) continue
    value = (value << 5) | idx; bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

// ============ TOTP (RFC 6238, SHA1, 6 位, 30s) ============
export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20))
}

export function totpUri(secret, account, issuer = 'AIFlow') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

export function verifyTotp(secret, token, window = 1) {
  if (!/^\d{6}$/.test(token)) return false
  const key = base32Decode(secret)
  const counter = Math.floor(Date.now() / 1000 / 30)
  for (let i = -window; i <= window; i++) {
    if (hotp(key, counter + i) === token) return true
  }
  replayGuard(secret, counter)
  return false
}

// 防重放：同 counter 的 token 只能用一次
const usedCounters = new Map() // secret → Set<counter>
function replayGuard(secret, counter) {
  let used = usedCounters.get(secret)
  if (!used) { used = new Set(); usedCounters.set(secret, used) }
  if (used.has(counter)) return false
  used.add(counter)
  // 清理过旧的
  if (used.size > 100) {
    for (const c of used) if (c < counter - 5) used.delete(c)
  }
  return true
}

function hotp(key, counter) {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = crypto.createHmac('sha1', key).update(buf).digest()
  const off = h[19] & 0x0f
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(code % 1_000_000).padStart(6, '0')
}

// ============ WebAuthn ============
export function createChallenge() {
  return crypto.randomBytes(32).toString('base64url')
}

// 注册验证：解析 attestationObject (fmt=none/packed) + clientDataJSON
export function verifyRegistration({ response, expectedChallenge, expectedOrigin }) {
  const client = JSON.parse(Buffer.from(response.clientDataJSON, 'base64url').toString())
  if (client.challenge !== expectedChallenge) throw new Error('challenge 不匹配')
  if (!client.origin.startsWith(expectedOrigin)) throw new Error(`origin 不匹配: ${client.origin}`)
  const att = cborDecode(Buffer.from(response.attestationObject, 'base64url'))
  const authData = att.authData
  // authData: rpIdHash(32) flags(1) signCount(4) [attestedCredentialData]
  const rpIdHash = authData.subarray(0, 32)
  const flags = authData[32]
  if (!(flags & 0x40)) throw new Error('凭据未包含 attested credential data')
  const aaguid = authData.subarray(37, 53).toString('hex')
  const credIdLen = authData.readUInt16BE(53)
  const credentialId = authData.subarray(55, 55 + credIdLen)
  const COSE = authData.subarray(55 + credIdLen)
  const { keyType, alg, keyBytes } = parseCoseKey(COSE)
  return {
    credentialId: credentialId.toString('base64url'),
    publicKeyPem: coseToPem(keyType, keyBytes),
    alg,
    aaguid,
    signCount: authData.readUInt32BE(33),
  }
}

// 登录断言验证
export function verifyAssertion({ credentialIdB64, response, expectedChallenge, expectedOrigin, publicKeyPem, storedSignCount }) {
  const client = JSON.parse(Buffer.from(response.clientDataJSON, 'base64url').toString())
  if (client.challenge !== expectedChallenge) throw new Error('challenge 不匹配')
  if (!client.origin.startsWith(expectedOrigin)) throw new Error('origin 不匹配')
  const authData = Buffer.from(response.authenticatorData, 'base64url')
  const sig = Buffer.from(response.signature, 'base64url')
  const signed = Buffer.concat([authData, Buffer.from(response.clientDataJSON, 'base64url')])
  const hasher = crypto.createHash('sha256').update(signed)
  // ES256: DER ECDSA；RS256: RSASSA-PKCS1-v1_5
  const verifier = crypto.createVerify('SHA256')
  verifier.update(signed)
  const ok = verifier.verify(publicKeyPem, sig)
  if (!ok) throw new Error('签名验证失败')
  const signCount = authData.readUInt32BE(33)
  if (signCount !== 0 && signCount <= storedSignCount) throw new Error('签名计数异常（可能被克隆）')
  return { signCount }
}

// ---- COSE key → PEM ----
function parseCoseKey(buf) {
  const map = cborDecode(buf)
  const kty = map.get(1), alg = map.get(3)
  if (kty === 2) { // EC2
    const crv = map.get(-1)
    const x = map.get(-2), y = map.get(-3)
    if (crv !== 1) throw new Error('仅支持 P-256')
    return { keyType: 'EC', alg, keyBytes: { x: Buffer.from(x), y: Buffer.from(y) } }
  }
  if (kty === 3) { // RSA
    return { keyType: 'RSA', alg, keyBytes: { n: Buffer.from(map.get(-1)), e: Buffer.from(map.get(2)) } }
  }
  throw new Error(`不支持的密钥类型: ${kty}`)
}

function coseToPem(keyType, { x, y, n, e }) {
  if (keyType === 'EC') {
    // SPKI: 0x3059 0x3013 0x06072a8648ce3d0201 0x06052b81040022 0x0342 0x00 0x04 X Y
    const point = Buffer.concat([Buffer.from([0x04]), x, y])
    const spki = Buffer.concat([
      Buffer.from('3059301306072a8648ce3d020106052b81040022034200', 'hex'),
      point,
    ])
    return wrapPem(spki, 'PUBLIC KEY')
  }
  // RSA SPKI
  const der = encodeSequence(
    encodeSequence(encodeOid('1.2.840.113549.1.1.1'), Buffer.from([0x05, 0x00])),
    encodeBitString(encodeSequence(encodeUnsignedInt(n), encodeUnsignedInt(e)))
  )
  return wrapPem(der, 'PUBLIC KEY')
}

function wrapPem(der, label) {
  const b64 = der.toString('base64')
  const lines = b64.match(/.{1,64}/g).join('\n')
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`
}

function encodeUnsignedInt(buf) {
  // 去前导零、补符号位
  let i = 0
  while (i < buf.length - 1 && buf[i] === 0) i++
  const v = buf.subarray(i)
  if (v[0] & 0x80) return Buffer.concat([Buffer.from([0x00]), v])
  return v
}

function encodeLength(len) {
  if (len < 0x80) return Buffer.from([len])
  const bytes = []
  let v = len
  while (v > 0) { bytes.unshift(v & 0xff); v >>= 8 }
  return Buffer.concat([Buffer.from([0x80 | bytes.length]), Buffer.from(bytes)])
}
function encodeSequence(...parts) {
  const body = Buffer.concat(parts)
  return Buffer.concat([Buffer.from([0x30]), encodeLength(body.length), body])
}
function encodeInteger(buf) {
  const v = encodeUnsignedInt(buf)
  return Buffer.concat([Buffer.from([0x02]), encodeLength(v.length), v])
}
function encodeOid(dotted) {
  const parts = dotted.split('.').map(Number)
  const out = [parts[0] * 40 + parts[1]]
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i]
    const stack = []
    do { stack.unshift(v & 0x7f); v >>= 7 } while (v > 0)
    for (let j = 0; j < stack.length - 1; j++) stack[j] |= 0x80
    out.push(...stack)
  }
  const body = Buffer.from(out)
  return Buffer.concat([Buffer.from([0x06]), encodeLength(body.length), body])
}
function encodeBitString(content) {
  return Buffer.concat([Buffer.from([0x03]), encodeLength(content.length + 1), Buffer.from([0x00]), content])
}

// ---- 极简 CBOR 解码（够 WebAuthn 用） ----
function cborDecode(buf) {
  let pos = 0
  const read = (n) => { const b = buf.subarray(pos, pos + n); pos += n; return b }
  function val(info, arg) {
    if (info < 8) return arg // uint
    if (info === 24) return read(1)[0]
    if (info === 25) return read(2).readUInt16BE()
    if (info === 26) return read(4).readUInt32BE()
    throw new Error('cbor: 不支持')
  }
  function item() {
    const ib = read(1)[0]
    const major = ib >> 5, info = ib & 0x1f
    if (major === 0) return val(info, info < 8 ? info : null)
    if (major === 1) { const v = val(info, info < 8 ? info : null); return -1 - v }
    if (major === 2) { const len = val(info, info < 8 ? info : null); return read(len) }
    if (major === 3) { const len = val(info, info < 8 ? info : null); return read(len).toString('utf8') }
    if (major === 5) { // map
      const len = val(info, info < 8 ? info : null)
      const m = new Map()
      for (let i = 0; i < len; i++) { const k = item(); m.set(k, item()) }
      return m
    }
    if (major === 4) { // array
      const len = val(info, info < 8 ? info : null)
      const a = []
      for (let i = 0; i < len; i++) a.push(item())
      return a
    }
    if (major === 6) { item(); return item() } // tag
    if (major === 7) {
      if (info === 20) return false
      if (info === 21) return true
      if (info === 22 || info === 23) return null
      throw new Error('cbor: 简单值')
    }
    throw new Error('cbor: 未知类型')
  }
  return item()
}

// ============ 挑战会话 ============
export function issueMfaChallenge(userId, kind) {
  const token = uid('mfa')
  challenges.set(token, { userId, kind, expiresAt: Date.now() + MFA_TTL })
  if (challenges.size > 500) {
    const now = Date.now()
    for (const [k, v] of challenges) if (v.expiresAt < now) challenges.delete(k)
  }
  return token
}

export function takeMfaChallenge(token) {
  const c = challenges.get(token)
  if (!c) return null
  challenges.delete(token)
  if (c.expiresAt < Date.now()) return null
  return c
}

// ============ 凭据管理 ============
export function listCredentials(userId) {
  return mfaCredentials.filter((c) => c.userId === userId).map(({ secret, publicKeyPem, ...safe }) => safe)
}

export function rawCredentials() {
  return mfaCredentials
}

export function totpCredential(userId) {
  return mfaCredentials.find((c) => c.userId === userId && c.type === 'totp') || null
}

export function addTotpCredential(userId, name, secret) {
  return mfaCredentials.insert({ userId, type: 'totp', name: name || 'Authenticator', secret, counter: 0 })
}

export function addPasskeyCredential(userId, name, reg) {
  return mfaCredentials.insert({
    userId, type: 'passkey', name: name || 'Passkey',
    credentialId: reg.credentialId, publicKeyPem: reg.publicKeyPem,
    counter: reg.signCount, aaguid: reg.aaguid,
  })
}

export function findPasskey(credentialId) {
  return mfaCredentials.find((c) => c.credentialId === credentialId && c.type === 'passkey')
}

export function removeCredential(userId, credId) {
  const c = mfaCredentials.get(credId)
  if (!c || c.userId !== userId) throw new Error('凭据不存在')
  mfaCredentials.remove(credId)
}

// 用户是否绑定了某类 MFA（策略名 otp 对应存储类型 totp）
export function hasMfa(userId, type) {
  const storeType = type === 'otp' ? 'totp' : type
  return !!mfaCredentials.find((c) => c.userId === userId && c.type === storeType)
}

// 用户的强制 MFA 类型：用户级 override > 角色策略 > none
export function requiredMfa(user) {
  if (user.mfaPolicy && user.mfaPolicy !== 'auto') return user.mfaPolicy === 'none' ? null : user.mfaPolicy
  for (const rid of user.roleIds || []) {
    const role = roles.get(rid)
    const policy = role?.mfaPolicy
    if (policy && policy !== 'none') return policy
  }
  return null
}
