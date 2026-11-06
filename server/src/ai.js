// AI 能力：自然语言 → 表单 schema / 流程定义。OpenAI 兼容接口（可配置），离线模板兜底。
// 配置来源：平台设置页（settings 表）优先，环境变量 AI_BASE_URL / AI_API_KEY / AI_MODEL 兜底。
import { db } from './db.js'
import { getConfig } from './config.js'

const settings = db('settings')

function aiConfig() {
  return {
    baseUrl: getConfig('AI_BASE_URL'),
    apiKey: getConfig('AI_API_KEY'),
    model: getConfig('AI_MODEL') || 'gpt-4o-mini',
  }
}

export function aiEnabled() {
  const c = aiConfig()
  return !!(c.baseUrl && c.apiKey)
}

async function chat(messages, { json = true } = {}) {
  const c = aiConfig()
  const res = await fetch(`${c.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${c.apiKey}` },
    body: JSON.stringify({
      model: c.model, messages, temperature: 0.2,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`AI 接口错误: HTTP ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// ---------- 表单生成 ----------
const FORM_SYSTEM = `你是低代码平台的表单设计专家。根据用户的自然语言描述，生成表单 JSON schema。
严格返回 JSON：{ "name": "表单名", "description": "一句话说明", "fields": [ ... ] }
每个 field：{ "key": "英文蛇形命名", "label": "中文标签", "type": "text|textarea|number|select|date|datetime|switch|radio|checkbox|file|table|money|department|user", "required": true/false, "placeholder": "", "options": ["select/radio/checkbox 时必填"], "min": 0, "max": 0, "unit": "金额单位等", "tip": "帮助文字" }
table 类型额外有 "columns": [{ "key","label","type":"text|number|money" }]。
金额类用 money。报销/审批场景通常需要明细 table。不要输出任何解释。`

export async function generateFormSchema(prompt) {
  if (aiEnabled()) {
    try {
      const content = await chat([
        { role: 'system', content: FORM_SYSTEM },
        { role: 'user', content: prompt },
      ])
      const parsed = JSON.parse(content)
      if (parsed.fields?.length) return normalizeForm(parsed)
    } catch { /* 落入模板兜底 */ }
  }
  return offlineForm(prompt)
}

function normalizeForm(parsed) {
  parsed.fields = parsed.fields.map((f) => ({
    key: String(f.key || '').trim(), label: f.label || f.key, type: f.type || 'text',
    required: !!f.required, placeholder: f.placeholder || '', options: f.options || [],
    min: f.min ?? null, max: f.max ?? null, unit: f.unit || '', tip: f.tip || '',
    columns: f.columns || [],
  }))
  return parsed
}

// 离线兜底：关键词规则模板
function offlineForm(prompt) {
  const p = prompt.toLowerCase()
  const fields = []
  const add = (f) => fields.push(f)

  if (/报销|费用|发票|差旅/.test(p)) {
    add({ key: 'expense_type', label: '费用类型', type: 'select', required: true, options: ['差旅费', '交通费', '餐饮费', '办公费', '其他'] })
    add({ key: 'items', label: '费用明细', type: 'table', required: true, columns: [{ key: 'name', label: '项目', type: 'text' }, { key: 'amount', label: '金额', type: 'money' }, { key: 'note', label: '备注', type: 'text' }] })
    add({ key: 'total', label: '报销总金额', type: 'money', required: true, unit: '元', tip: '与明细合计一致' })
    add({ key: 'invoice', label: '发票附件', type: 'file', required: true })
  } else if (/请假|休假|年假|调休|事假|病假/.test(p)) {
    add({ key: 'leave_type', label: '请假类型', type: 'select', required: true, options: ['年假', '调休', '事假', '病假', '婚假', '产假'] })
    add({ key: 'start_date', label: '开始时间', type: 'datetime', required: true })
    add({ key: 'end_date', label: '结束时间', type: 'datetime', required: true })
    add({ key: 'days', label: '请假天数', type: 'number', required: true, min: 0.5, max: 365 })
    add({ key: 'reason', label: '请假事由', type: 'textarea', required: true })
  } else if (/采购|购买|申请设备|物资/.test(p)) {
    add({ key: 'items', label: '采购清单', type: 'table', required: true, columns: [{ key: 'name', label: '物品名称', type: 'text' }, { key: 'qty', label: '数量', type: 'number' }, { key: 'price', label: '单价', type: 'money' }] })
    add({ key: 'budget', label: '预算金额', type: 'money', required: true, unit: '元' })
    add({ key: 'urgency', label: '紧急程度', type: 'radio', required: true, options: ['普通', '加急', '特急'] })
    add({ key: 'reason', label: '采购原因', type: 'textarea', required: true })
  } else if (/入职|招聘|offer|录用/.test(p)) {
    add({ key: 'candidate', label: '候选人姓名', type: 'text', required: true })
    add({ key: 'position', label: '应聘岗位', type: 'text', required: true })
    add({ key: 'department', label: '入职部门', type: 'department', required: true })
    add({ key: 'entry_date', label: '入职日期', type: 'date', required: true })
    add({ key: 'salary', label: '转正薪资', type: 'money', unit: '元/月' })
    add({ key: 'mentor', label: '带教人', type: 'user' })
  } else {
    add({ key: 'title', label: '标题', type: 'text', required: true })
    add({ key: 'description', label: '详细说明', type: 'textarea', required: true })
    add({ key: 'attachment', label: '附件', type: 'file' })
    add({ key: 'expect_date', label: '期望完成日期', type: 'date' })
  }
  return {
    name: prompt.slice(0, 20) || '未命名表单',
    description: `由「${prompt.slice(0, 40)}」生成（离线模板）`,
    fields,
  }
}

// ---------- 流程生成 ----------
const FLOW_SYSTEM = `你是低代码平台的审批流设计专家。根据用户的自然语言描述，生成审批流程 JSON。
严格返回 JSON：
{
  "name": "流程名",
  "nodes": [
    { "id": "start", "type": "start", "name": "发起", "next": "..." },
    { "id": "n1", "type": "approver", "name": "节点名", "approver": { "mode": "dept_leader|specified_role|form_user", "roleId": "角色id(mode为specified_role时)", "formField": "字段key(mode为form_user时)", "counterSign": "any|all" }, "next": "..." },
    { "id": "c1", "type": "condition", "name": "条件判断", "branches": [ { "id": "b1", "name": "分支名", "to": "节点id", "condition": { "groups": [ { "logic": "and", "rules": [ { "field": "表单字段key", "op": "gte|lte|eq|ne|lt|gt|contains|empty|notEmpty", "value": "比较值" } ] } ] } } ] },
    { "id": "cc1", "type": "cc", "name": "抄送", "cc": { "userIds": [] }, "next": "..." },
    { "id": "end", "type": "end", "name": "结束" }
  ]
}
规则：必须有 start 和 end；金额大于阈值走更高层级审批是常见模式；mode=dept_leader 表示提交人的部门主管（最常用）；条件的 field 用表单字段 key（如 total、days）。不要输出任何解释。`

export async function generateFlowDefinition(prompt, formFields = []) {
  const fieldHint = formFields.length
    ? `表单字段（条件分支只能引用这些 key）：${formFields.map((f) => `${f.key}(${f.label},${f.type})`).join('、')}`
    : ''
  if (aiEnabled()) {
    try {
      const content = await chat([
        { role: 'system', content: FLOW_SYSTEM },
        { role: 'user', content: `${prompt}\n${fieldHint}` },
      ])
      const parsed = JSON.parse(content)
      if (parsed.nodes?.length) return parsed
    } catch { /* 落入模板兜底 */ }
  }
  return offlineFlow(prompt)
}

function offlineFlow(prompt) {
  const p = prompt.toLowerCase()
  // 有金额阈值 / 天数阈值 → 条件分支流程；否则部门主管线性流
  const amountMatch = p.match(/(大于|超过|以上)\s*(\d+(?:\.\d+)?)\s*(元|万|块)?/)
  if (/金额|报销|采购|费用/.test(p) && amountMatch) {
    const threshold = /万/.test(amountMatch[3] || '') ? Number(amountMatch[2]) * 10000 : Number(amountMatch[2])
    return {
      name: prompt.slice(0, 20) || '分级审批流程',
      nodes: [
        { id: 'start', type: 'start', name: '发起', next: 'c_amount' },
        {
          id: 'c_amount', type: 'condition', name: `金额判断（> ${threshold} 元）`,
          branches: [
            { id: 'b_high', name: `大于 ${threshold} 元`, to: 'n_manager', condition: { groups: [{ logic: 'and', rules: [{ field: 'total', op: 'gt', value: String(threshold) }] }] } },
            { id: 'b_low', name: '小于等于阈值', to: 'n_leader', condition: null },
          ],
        },
        { id: 'n_leader', type: 'approver', name: '部门主管审批', approver: { mode: 'dept_leader', counterSign: 'any' }, next: 'end' },
        { id: 'n_manager', type: 'approver', name: '总监审批', approver: { mode: 'dept_leader', counterSign: 'any' }, next: 'n_finance' },
        { id: 'n_finance', type: 'approver', name: '财务复核', approver: { mode: 'specified_role', roleId: 'role_process_admin', counterSign: 'any' }, next: 'cc_boss' },
        { id: 'cc_boss', type: 'cc', name: '抄送总经理', cc: { userIds: [] }, next: 'end' },
        { id: 'end', type: 'end', name: '结束' },
      ],
    }
  }
  if (/请假|天数|休假/.test(p)) {
    return {
      name: prompt.slice(0, 20) || '请假审批流程',
      nodes: [
        { id: 'start', type: 'start', name: '发起', next: 'c_days' },
        {
          id: 'c_days', type: 'condition', name: '请假天数判断',
          branches: [
            { id: 'b_3', name: '3 天以内', to: 'n_leader', condition: { groups: [{ logic: 'and', rules: [{ field: 'days', op: 'lte', value: '3' }] }] } },
            { id: 'b_long', name: '超过 3 天', to: 'n_hr', condition: null },
          ],
        },
        { id: 'n_leader', type: 'approver', name: '部门主管审批', approver: { mode: 'dept_leader', counterSign: 'any' }, next: 'end' },
        { id: 'n_hr', type: 'approver', name: '主管审批', approver: { mode: 'dept_leader', counterSign: 'any' }, next: 'n_hr2' },
        { id: 'n_hr2', type: 'approver', name: '人事备案', approver: { mode: 'specified_role', roleId: 'role_process_admin', counterSign: 'any' }, next: 'end' },
        { id: 'end', type: 'end', name: '结束' },
      ],
    }
  }
  return {
    name: prompt.slice(0, 20) || '通用审批流程',
    nodes: [
      { id: 'start', type: 'start', name: '发起', next: 'n_leader' },
      { id: 'n_leader', type: 'approver', name: '部门主管审批', approver: { mode: 'dept_leader', counterSign: 'any' }, next: 'cc_hr' },
      { id: 'cc_hr', type: 'cc', name: '抄送人事', cc: { userIds: [] }, next: 'end' },
      { id: 'end', type: 'end', name: '结束' },
    ],
  }
}
