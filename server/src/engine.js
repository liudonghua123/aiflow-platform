// 审批流引擎：流程定义（节点图）→ 实例化 → 任务分派 → 条件分支 → 会签/或签 → 归档
import { db, uid, nowISO } from './db.js'
import { userDeptChain, users as usersTable } from './rbac.js'

const flows = db('flows')
const instances = db('instances')
const users = usersTable
import { dispatchEvent } from './webhook.js'

// ---------- 节点模型 ----------
// 节点: { id, type: 'start'|'approver'|'cc'|'condition'|'parallel'|'end', name, x, y,
//   approver: { mode: 'dept_leader'|'specified_user'|'specified_role'|'form_user', userIds, roleId, formField, counterSign: 'any'|'all' },
//   cc: { userIds },
//   condition: { groups: [ { logic: 'and'|'or', rules: [ { field, op, value } ] } ] }  → branches 指向下一节点
//   branches: [ { id, name, to, condition } ]  // condition 节点专用
// }
// 边由 condition.branches 表达；线性流转由 next 指针表达: { next: nodeId }

export function validateFlow(flowDef) {
  const nodes = flowDef.nodes || []
  const start = nodes.find((n) => n.type === 'start')
  if (!start) return { ok: false, error: '缺少开始节点' }
  const end = nodes.find((n) => n.type === 'end')
  if (!end) return { ok: false, error: '缺少结束节点' }
  // 可达性检查
  const visited = new Set()
  const walk = (id, depth) => {
    if (!id || visited.has(id) || depth > 100) return
    visited.add(id)
    const n = nodes.find((x) => x.id === id)
    if (!n) return
    if (n.next) walk(n.next, depth + 1)
    for (const b of n.branches || []) walk(b.to, depth + 1)
  }
  walk(start.id, 0)
  if (!visited.has(end.id)) return { ok: false, error: '结束节点不可达' }
  return { ok: true }
}

function matchCondition(condition, formData) {
  if (!condition?.groups?.length) return true
  // 多组之间 OR，组内规则按 logic AND/OR
  return condition.groups.some((g) => {
    const results = g.rules.map((r) => {
      const actual = formData?.[r.field]
      switch (r.op) {
        case 'eq': return String(actual) === String(r.value)
        case 'ne': return String(actual) !== String(r.value)
        case 'gt': return Number(actual) > Number(r.value)
        case 'gte': return Number(actual) >= Number(r.value)
        case 'lt': return Number(actual) < Number(r.value)
        case 'lte': return Number(actual) <= Number(r.value)
        case 'contains': return String(actual ?? '').includes(String(r.value))
        case 'empty': return actual === undefined || actual === null || actual === ''
        case 'notEmpty': return !(actual === undefined || actual === null || actual === '')
        default: return true
      }
    })
    return g.logic === 'or' ? results.some(Boolean) : results.every(Boolean)
  })
}

// 解析审批人为具体用户列表
export function resolveApprovers(node, { instance, submitter }) {
  const mode = node.approver?.mode
  if (mode === 'specified_user') return (node.approver.userIds || []).map((id) => users.get(id)).filter(Boolean)
  if (mode === 'specified_role') return users.filter((u) => (u.roleIds || []).includes(node.approver.roleId))
  if (mode === 'form_user') {
    const v = instance.formData?.[node.approver.formField]
    return (Array.isArray(v) ? v : [v]).map((id) => users.get(id)).filter(Boolean)
  }
  if (mode === 'dept_leader') {
    // 提交人所在部门向上找第一个有负责人的部门
    const chain = userDeptChain(submitter.departmentId)
    for (const d of chain) {
      if (d.leaderUserId) {
        const leader = users.get(d.leaderUserId)
        if (leader) return [leader]
      }
    }
    return []
  }
  return []
}

// 创建实例：flowDef → instance + 首个待办任务
export async function startInstance({ flowId, submitterId, formData, title }) {
  const flow = flows.get(flowId)
  if (!flow) throw new Error('流程不存在')
  if (!flow.published) throw new Error('流程未发布，无法发起')
  const def = flow.definition
  const start = def.nodes.find((n) => n.type === 'start')
  const instance = instances.insert({
    flowId, flowName: flow.name,
    formId: flow.formId || '',
    title: title || `${flow.name}-${nowISO().slice(0, 10)}`,
    submitterId, formData: formData || {},
    status: 'running',
    currentNodeId: start.next || null,
    history: [{ nodeId: start.id, action: 'submit', userId: submitterId, at: nowISO(), comment: '' }],
    tasks: [],
  })
  await advance(instance, { submitterId })
  await dispatchEvent('instance.started', { instanceId: instance.id, flowId, title: instance.title, submitterId })
  return instance
}

// 从实例当前节点向后推进（自动通过系统节点、分派人工任务、遇条件求值）
async function advance(instance, { submitterId }) {
  const flow = flows.get(instance.flowId)
  const def = flow.definition
  const nodes = def.nodes
  let cursor = instance.currentNodeId
  let guard = 0

  while (cursor && guard++ < 100) {
    const node = nodes.find((n) => n.id === cursor)
    if (!node) { instance.status = 'error'; instance.error = `节点缺失: ${cursor}`; break }

    if (node.type === 'end') {
      instance.status = 'completed'
      instance.completedAt = nowISO()
      instance.currentNodeId = null
      await dispatchEvent('instance.completed', { instanceId: instance.id, flowId: instance.flowId, title: instance.title })
      break
    }
    if (node.type === 'cc') {
      for (const userId of node.cc?.userIds || []) {
        instance.tasks.push({ id: uid('task'), type: 'cc', nodeId: node.id, assigneeId: userId, status: 'pending', createdAt: nowISO() })
      }
      await dispatchEvent('task.created', { instanceId: instance.id, type: 'cc', nodeId: node.id })
      cursor = node.next
      continue
    }
    if (node.type === 'condition') {
      const hit = (node.branches || []).find((b) => matchCondition(b.condition, instance.formData)) || (node.branches || []).at(-1)
      cursor = hit ? hit.to : null
      continue
    }
    if (node.type === 'approver') {
      const approvers = resolveApprovers(node, { instance, submitter: users.get(instance.submitterId) })
      if (!approvers.length) {
        instance.status = 'blocked'
        instance.error = `节点「${node.name}」无法解析审批人`
        instance.currentNodeId = node.id
        break
      }
      const mode = node.approver?.counterSign || 'any'
      instance.tasks.push(...approvers.map((u) => ({
        id: uid('task'), type: 'approval', nodeId: node.id, nodeName: node.name,
        assigneeId: u.id, status: 'pending', counterSign: mode, createdAt: nowISO(),
      })))
      instance.currentNodeId = node.id
      await dispatchEvent('task.created', { instanceId: instance.id, type: 'approval', nodeId: node.id, assignees: approvers.map((u) => u.id) })
      break
    }
    cursor = node.next
  }
  instance.currentNodeId = instance.status === 'running' || instance.status === 'blocked' ? instance.currentNodeId : null
  instances.update(instance.id, {
    status: instance.status, currentNodeId: instance.currentNodeId,
    tasks: instance.tasks, history: instance.history, error: instance.error || null,
    completedAt: instance.completedAt || null,
  })
}

// 处理任务（approve / reject / cancel / cc-read）
export async function handleTask({ instanceId, taskId, userId, action, comment }) {
  const instance = instances.get(instanceId)
  if (!instance) throw new Error('实例不存在')
  const task = (instance.tasks || []).find((t) => t.id === taskId)
  if (!task) throw new Error('任务不存在')

  if (task.type === 'cc') {
    if (task.assigneeId !== userId) throw new Error('无权处理该抄送')
    task.status = 'read'; task.handledAt = nowISO()
    instances.update(instanceId, { tasks: instance.tasks })
    return instance
  }

  if (task.assigneeId !== userId) throw new Error('无权处理该任务')
  if (task.status !== 'pending') throw new Error('任务已处理')

  if (action === 'cancel') {
    instance.status = 'cancelled'
    instance.tasks.forEach((t) => { if (t.status === 'pending') t.status = 'cancelled' })
    instance.history.push({ nodeId: task.nodeId, action: 'cancel', userId, at: nowISO(), comment: comment || '' })
    await dispatchEvent('instance.cancelled', { instanceId, title: instance.title })
    instances.update(instanceId, { status: instance.status, tasks: instance.tasks, history: instance.history })
    return instance
  }

  task.status = action === 'approve' ? 'approved' : 'rejected'
  task.handledAt = nowISO()
  task.comment = comment || ''
  instance.history.push({ nodeId: task.nodeId, nodeName: task.nodeName, action, userId, at: nowISO(), comment: comment || '' })

  if (action === 'reject') {
    instance.status = 'rejected'
    instance.tasks.forEach((t) => { if (t.status === 'pending') t.status = 'cancelled' })
    await dispatchEvent('instance.rejected', { instanceId, title: instance.title, rejectedBy: userId })
  } else {
    const pendingSiblings = instance.tasks.filter((t) => t.nodeId === task.nodeId && t.type === 'approval' && t.status === 'pending')
    const mode = task.counterSign
    const nodeDone = mode === 'all' ? pendingSiblings.length === 0 : true // any: 一人通过即过
    if (mode === 'all' && pendingSiblings.length === 0) {
      await dispatchEvent('instance.approved', { instanceId, nodeId: task.nodeId })
    }
    if (nodeDone) {
      // 该节点通过 → 推进到下一节点
      const flow = flows.get(instance.flowId)
      const node = flow.definition.nodes.find((n) => n.id === task.nodeId)
      // 清掉 or-sign 下其他人的 pending 任务
      instance.tasks.forEach((t) => { if (t.nodeId === task.nodeId && t.status === 'pending') t.status = 'auto-passed' })
      instance.currentNodeId = node.next || null
      await advance(instance, { submitterId: instance.submitterId })
      return instances.get(instanceId)
    }
  }
  instances.update(instanceId, { status: instance.status, tasks: instance.tasks, history: instance.history })
  return instance
}

export function instanceForUser(instance, userId) {
  const isSubmitter = instance.submitterId === userId
  const myTasks = (instance.tasks || []).filter((t) => t.assigneeId === userId)
  const canApprove = myTasks.some((t) => t.status === 'pending')
  const involved = isSubmitter || myTasks.length > 0
  return { isSubmitter, myTasks, canApprove, involved }
}
