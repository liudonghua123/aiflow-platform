// 统一 API 客户端：带 JWT、401 自动跳登录
const TOKEN_KEY = 'aiflow_token'
const USER_KEY = 'aiflow_user'

export function getToken() { return localStorage.getItem(TOKEN_KEY) }
export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}
export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

async function request(method, url, body) {
  const headers = { 'content-type': 'application/json' }
  const token = getToken()
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  if (res.status === 401 && !url.includes('/auth/login')) {
    clearAuth()
    window.location.href = '/login'
    throw new ApiError('登录已过期', 401)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || `请求失败 (${res.status})`, res.status)
  return data
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
}
