// MCP 服务：streamable HTTP，挂载在 /mcp。
// 通过 @modelcontextprotocol/sdk 的 StreamableHTTPServerTransport 无状态模式接入 Express。
// 平台全部核心能力以 MCP tools 暴露，供 AI 客户端（Claude / Cursor 等）直接调用。
import { randomUUID } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { db } from './db.js'
import { deptTree } from './rbac.js'
import { startInstance, handleTask } from './engine.js'
import { generateFormSchema, generateFlowDefinition, aiEnabled } from './ai.js'
import { registerUser } from './auth.js'
import { dispatchEvent } from './webhook.js'

const forms = db('forms')
const flows = db('flows')
const instances = db('instances')
const users = db('users')
const webhooks = db('webhooks')
const settings = db('settings')

export function createMcpHandler() {
  const server = new McpServer({ name: 'aiflow-platform', version: '1.0.0' })

  // ---- 表单 ----
  server.tool('list_forms', '列出全部表单', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify(forms.all().map(({ id, name, description, fields, updatedAt }) => ({ id, name, description, fieldCount: fields?.length, updatedAt })), null, 2) }],
  }))
  server.tool('get_form', '获取表单详情（含字段 schema）', { formId: z.string().describe('表单 ID') }, async ({ formId }) => {
    const f = forms.get(formId)
    if (!f) return { content: [{ type: 'text', text: '表单不存在' }], isError: true }
    return { content: [{ type: 'text', text: JSON.stringify(f, null, 2) }] }
  })
  server.tool('generate_form', 'AI：根据自然语言描述生成表单', { prompt: z.string().describe('例如：一个差旅报销表单，要费用明细和发票上传') }, async ({ prompt }) => {
    const schema = await generateFormSchema(prompt)
    return { content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }] }
  })

  // ---- 流程 ----
  server.tool('list_flows', '列出全部审批流程', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify(flows.all().map(({ id, name, published, formId, updatedAt }) => ({ id, name, published, formId, updatedAt })), null, 2) }],
  }))
  server.tool('generate_flow', 'AI：根据自然语言描述生成审批流定义', { prompt: z.string().describe('例如：金额超过 5000 元需要总监和财务审批') }, async ({ prompt }) => {
    const def = await generateFlowDefinition(prompt)
    return { content: [{ type: 'text', text: JSON.stringify(def, null, 2) }] }
  })

  // ---- 审批 ----
  server.tool('start_instance', '发起审批', {
    flowId: z.string(), submitterId: z.string(), title: z.string().optional(),
    formData: z.record(z.any()).describe('表单数据，key 为表单字段'),
  }, async ({ flowId, submitterId, title, formData }) => {
    try {
      const inst = await startInstance({ flowId, submitterId, formData, title })
      return { content: [{ type: 'text', text: JSON.stringify({ instanceId: inst.id, status: inst.status, currentNodeId: inst.currentNodeId }, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text', text: String(e.message) }], isError: true }
    }
  })
  server.tool('approve_task', '通过一个待办任务', {
    instanceId: z.string(), taskId: z.string(), userId: z.string(), comment: z.string().optional(),
  }, async ({ instanceId, taskId, userId, comment }) => {
    try {
      const inst = await handleTask({ instanceId, taskId, userId, action: 'approve', comment })
      return { content: [{ type: 'text', text: JSON.stringify({ instanceId: inst.id, status: inst.status }, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text', text: String(e.message) }], isError: true }
    }
  })
  server.tool('reject_task', '驳回一个待办任务', {
    instanceId: z.string(), taskId: z.string(), userId: z.string(), comment: z.string().optional(),
  }, async ({ instanceId, taskId, userId, comment }) => {
    try {
      const inst = await handleTask({ instanceId, taskId, userId, action: 'reject', comment })
      return { content: [{ type: 'text', text: JSON.stringify({ instanceId: inst.id, status: inst.status }, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text', text: String(e.message) }], isError: true }
    }
  })
  server.tool('list_my_tasks', '查询某用户的待办任务', { userId: z.string() }, async ({ userId }) => {
    const rows = instances.all()
      .filter((i) => i.status === 'running')
      .flatMap((i) => (i.tasks || []).filter((t) => t.assigneeId === userId && t.status === 'pending')
        .map((t) => ({ instanceId: i.id, taskId: t.id, type: t.type, nodeName: t.nodeName, instanceTitle: i.title, flowName: i.flowName, createdAt: t.createdAt })))
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] }
  })
  server.tool('get_instance', '查看审批实例详情', { instanceId: z.string() }, async ({ instanceId }) => {
    const inst = instances.get(instanceId)
    if (!inst) return { content: [{ type: 'text', text: '实例不存在' }], isError: true }
    return { content: [{ type: 'text', text: JSON.stringify(inst, null, 2) }] }
  })

  // ---- 组织 ----
  server.tool('list_users', '列出用户', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify(users.all().map(({ id, username, name, departmentId, roleIds }) => ({ id, username, name, departmentId, roleIds })), null, 2) }],
  }))
  server.tool('get_org_tree', '获取组织架构树', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify(deptTree(), null, 2) }],
  }))
  server.tool('create_user', '创建用户（本地账号）', {
    username: z.string(), password: z.string().min(6), name: z.string().optional(), departmentId: z.string().optional(),
  }, async ({ username, password, name, departmentId }) => {
    try {
      const u = await registerUser({ username, password, name, departmentId })
      await dispatchEvent('user.created', { userId: u.id, username: u.username, name: u.name })
      return { content: [{ type: 'text', text: JSON.stringify({ id: u.id, username: u.username, name: u.name }, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text', text: String(e.message) }], isError: true }
    }
  })

  // ---- Webhook ----
  server.tool('list_webhooks', '列出 webhook 配置', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify(webhooks.all().map(({ id, name, url, events, enabled, filters }) => ({ id, name, url, events, enabled, filters })), null, 2) }],
  }))
  server.tool('emit_test_event', '发送一个测试事件（触发匹配的 webhook）', {
    event: z.string().describe('事件名，如 instance.started'),
  }, async ({ event }) => {
    await dispatchEvent(event, { test: true, at: new Date().toISOString() })
    return { content: [{ type: 'text', text: `测试事件 ${event} 已派发` }] }
  })

  // ---- AI 配置 ----
  server.tool('ai_status', '查询 AI 生成能力是否已配置', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify({ enabled: aiEnabled() }) }],
  }))

  // 无状态模式：每个请求一个 transport 实例
  return async function mcpHandler(req, res) {
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      res.on('close', () => transport.close())
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' } })
      }
    }
  }
}
