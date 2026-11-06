// RBAC：角色 → 权限点集合；用户 → 角色（可多个）。
// 权限点格式：resource:action，如 form:write、flow:publish、instance:approve、user:manage
import { db, uid, nowISO } from './db.js'

export const PERMISSIONS = [
  'form:read', 'form:write', 'form:delete',
  'flow:read', 'flow:write', 'flow:publish', 'flow:delete',
  'instance:read', 'instance:start', 'instance:approve', 'instance:manage',
  'user:read', 'user:manage',
  'org:read', 'org:manage',
  'webhook:read', 'webhook:manage',
  'app:read', 'app:write', 'app:delete',
  'setting:read', 'setting:manage',
]

// 预置角色
export const DEFAULT_ROLES = [
  {
    id: 'role_admin', key: 'admin', name: '超级管理员',
    description: '拥有全部权限',
    permissions: ['*'],
    builtIn: true, createdAt: nowISO(),
  },
  {
    id: 'role_process_admin', key: 'process_admin', name: '流程管理员',
    description: '管理表单、流程与全部审批实例',
    permissions: ['form:read', 'form:write', 'form:delete', 'flow:read', 'flow:write', 'flow:publish', 'flow:delete', 'instance:read', 'instance:manage', 'webhook:read'],
    builtIn: true, createdAt: nowISO(),
  },
  {
    id: 'role_member', key: 'member', name: '普通成员',
    description: '发起申请、处理待办、查看表单与流程',
    permissions: ['form:read', 'flow:read', 'instance:read', 'instance:start', 'instance:approve'],
    builtIn: true, createdAt: nowISO(),
  },
]

export const users = db('users')
export const roles = db('roles', DEFAULT_ROLES)
export const departments = db('departments')
export const forms = db('forms')
export const flows = db('flows')
export const instances = db('instances')
export const webhooks = db('webhooks')
export const webhookLogs = db('webhook_logs')
export const apps = db('apps')
export const settings = db('settings')

// ---------- 权限 ----------
export function userPermissions(user) {
  const perms = new Set()
  for (const rid of user.roleIds || []) {
    const role = roles.get(rid)
    if (!role) continue
    for (const p of role.permissions) perms.add(p)
  }
  return perms
}

export function can(user, perm) {
  const perms = userPermissions(user)
  return perms.has('*') || perms.has(perm)
}

// 用户拥有某角色（或 admin）
export function isRole(user, key) {
  if (user.roleIds?.includes('role_admin')) return true
  return (user.roleIds || []).some((rid) => roles.get(rid)?.key === key)
}

// ---------- 组织架构 ----------
// department: { id, name, parentId, leaderUserId, order }
export function deptTree() {
  const all = departments.all().sort((a, b) => (a.order || 0) - (b.order || 0))
  const byParent = new Map()
  for (const d of all) {
    const k = d.parentId || ''
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k).push(d)
  }
  const build = (parentId) => {
    const children = byParent.get(parentId) || []
    return children.map((d) => ({
      ...d,
      children: build(d.id),
      memberCount: users.filter((u) => u.departmentId === d.id).length,
    }))
  }
  return build('')
}

// 用户在组织内的完整链路（含祖先部门），用于"部门主管"类审批节点解析
export function userDeptChain(departmentId) {
  const chain = []
  let cur = departments.get(departmentId)
  let guard = 0
  while (cur && guard++ < 20) {
    chain.push(cur)
    cur = cur.parentId ? departments.get(cur.parentId) : null
  }
  return chain
}

export function seedOrg() {
  if (departments.all().length) return
  const root = departments.insert({ name: '总部', parentId: '', order: 0 })
  const tech = departments.insert({ name: '技术部', parentId: root.id, order: 1 })
  const hr = departments.insert({ name: '人事部', parentId: root.id, order: 2 })
  const fin = departments.insert({ name: '财务部', parentId: root.id, order: 3 })
  departments.insert({ name: '平台组', parentId: tech.id, order: 1 })
  return { root, tech, hr, fin }
}
