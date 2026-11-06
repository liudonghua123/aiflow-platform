import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactFlow, {
  Background, Controls, useNodesState, useEdgesState, addEdge,
  MarkerType, Handle, Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { Field, Modal, icons } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

// 节点类型 → 显示样式
const NODE_STYLE = {
  start:     { tile: '▶', color: '#1e7b4f', label: t('开始') },
  approver:  { tile: t('审'), color: '#1b6c80', label: t('审批') },
  cc:        { tile: t('抄'), color: '#a86f0c', label: t('抄送') },
  condition: { tile: '◆', color: '#7c5cad', label: t('条件') },
  parallel:  { tile: '∥', color: '#2f70bb', label: t('并行') },
  end:       { tile: '■', color: '#5d5f60', label: t('结束') },
}

function nodeMeta(node, users, roles) {
  if (node.type === 'approver') {
    const a = node.approver || {}
    const modeLabel = { dept_leader: t('发起人部门主管'), specified_role: t('指定角色'), specified_user: t('指定人员'), form_user: t('表单内指定') }[a.mode] || a.mode
    let detail = ''
    if (a.mode === 'specified_role') detail = roles.find((r) => r.id === a.roleId)?.name || ''
    if (a.mode === 'specified_user') detail = (a.userIds || []).map((id) => users.find((u) => u.id === id)?.name).filter(Boolean).join('、')
    if (a.mode === 'form_user') detail = t('字段 {0}', a.formField)
    return `${modeLabel}${detail ? ' · ' + detail : ''} · ${a.counterSign === 'all' ? t('会签') : t('或签')}`
  }
  if (node.type === 'cc') {
    const names = (node.cc?.userIds || []).map((id) => users.find((u) => u.id === id)?.name).filter(Boolean)
    return names.length ? t('抄送给 {0}', names.join('、')) : t('未指定抄送人')
  }
  if (node.type === 'condition') return t('{0} 个分支', node.branches?.length || 0)
  return ''
}

function FlowNode({ data, selected }) {
  const s = NODE_STYLE[data.node.type] || NODE_STYLE.end
  return (
    <div className={`flow-node${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Left} isConnectable />
      <div className="flow-node-title">
        <span className="flow-node-tile" style={{ background: s.color }}>{s.tile}</span>
        <span>{data.node.name}</span>
        <span className="text-small text-muted" style={{ marginLeft: 'auto' }}>{s.label}</span>
      </div>
      {data.meta && <div className="flow-node-meta">{data.meta}</div>}
      <Handle type="source" position={Position.Right} isConnectable />
    </div>
  )
}
const nodeTypes = { flow: FlowNode }

export default function FlowDesigner() {
  useLang()
  const { id } = useParams()
  const { showToast, user } = useApp()
  const [flow, setFlow] = useState(null)
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [selectedNode, setSelectedNode] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([])

  const defRef = useRefShape(null)

  function useRefShape(v) { const r = React.useRef(v); return r }

  useEffect(() => {
    api.get(`/api/flows/${id}`).then((f) => {
      setFlow(f)
      defRef.current = f.definition
      syncToCanvas(f.definition)
    }).catch((e) => showToast(e.message, 'error'))
    api.get('/api/users').then(setUsers).catch(() => {})
    api.get('/api/roles').then(setRoles).catch(() => {})
  }, [id])

  // definition → reactflow nodes/edges
  function syncToCanvas(definition) {
    const nodes = (definition.nodes || []).map((n, i) => ({
      id: n.id,
      type: 'flow',
      position: { x: n.x ?? 80 + (i % 4) * 280, y: n.y ?? 80 + Math.floor(i / 4) * 160 },
      data: { node: n, meta: nodeMeta(n, users, roles) },
    }))
    const edges = []
    for (const n of definition.nodes || []) {
      if (n.next) edges.push({ id: `e_${n.id}_${n.next}`, source: n.id, target: n.next, animated: false, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.2 } })
      for (const b of n.branches || []) {
        edges.push({
          id: `e_${n.id}_${b.to}`, source: n.id, target: b.to, label: b.name,
          labelStyle: { fontSize: 11, fill: '#5d5f60' }, labelBgStyle: { fill: '#f4f6f8' },
          markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.2 },
        })
      }
    }
    setRfNodes(nodes)
    setRfEdges(edges)
  }

  // 画布回写 definition（连线 / 挪位置）
  const onConnect = useCallback((params) => {
    setRfEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.2 } }, eds))
    applyEdgesToDef([...rfEdges, params])
    setDirty(true)
  }, [rfEdges])

  function applyEdgesToDef(edges) {
    const def = defRef.current
    if (!def) return
    // 清掉旧的 next/branches，再按边重建（保留旧分支条件）
    const oldBranches = new Map()
    for (const n of def.nodes) {
      if (n.branches) {
        for (const b of n.branches) oldBranches.set(`${n.id}:${b.to}`, b.condition)
        delete n.branches
      }
      delete n.next
    }
    const bySource = new Map()
    for (const e of edges) {
      if (!bySource.has(e.source)) bySource.set(e.source, [])
      bySource.get(e.source).push(e)
    }
    for (const n of def.nodes) {
      const outs = bySource.get(n.id) || []
      if (n.type === 'condition') {
        n.branches = outs.map((e, i) => ({
          id: `b${i}`, name: e.label || t('分支{0}', i + 1), to: e.target,
          condition: oldBranches.get(`${n.id}:${e.target}`) ?? null,
        }))
      } else if (outs.length === 1) {
        n.next = outs[0].target
      }
    }
    syncToCanvas(def)
  }

  const onNodeDragStop = useCallback(() => {
    // 位置回写
    const def = defRef.current
    if (!def) return
    for (const n of def.nodes) {
      const rf = rfNodes.find((x) => x.id === n.id)
      if (rf) { n.x = Math.round(rf.position.x); n.y = Math.round(rf.position.y) }
    }
    setDirty(true)
  }, [rfNodes])

  const onNodeClick = (_, node) => setSelectedNode(node.data.node)
  const onPaneClick = () => setSelectedNode(null)

  const addNode = (type) => {
    const def = defRef.current
    if (!def) return
    const nid = `n_${Math.random().toString(36).slice(2, 6)}`
    const base = { id: nid, type, name: NODE_STYLE[type].label, x: 120 + Math.random() * 400, y: 120 + Math.random() * 200 }
    if (type === 'approver') base.approver = { mode: 'dept_leader', counterSign: 'any' }
    if (type === 'cc') base.cc = { userIds: [] }
    if (type === 'condition') base.branches = []
    def.nodes.push(base)
    defRef.current = def
    syncToCanvas(def)
    setDirty(true)
    setSelectedNode(base)
  }

  const removeNode = (nid) => {
    const def = defRef.current
    if (!def) return
    if (['start', 'end'].includes(def.nodes.find((n) => n.id === nid)?.type)) {
      showToast(t('开始 / 结束节点不可删除'), 'error')
      return
    }
    def.nodes = def.nodes.filter((n) => n.id !== nid)
    // 清理悬挂引用
    for (const n of def.nodes) {
      if (n.next === nid) delete n.next
      if (n.branches) n.branches = n.branches.filter((b) => b.to !== nid)
    }
    defRef.current = def
    setSelectedNode(null)
    syncToCanvas(def)
    setDirty(true)
  }

  const patchSelected = (patch) => {
    const def = defRef.current
    if (!def || !selectedNode) return
    const node = def.nodes.find((n) => n.id === selectedNode.id)
    if (!node) return
    Object.assign(node, patch)
    defRef.current = def
    setSelectedNode({ ...node })
    syncToCanvas(def)
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const updated = await api.patch(`/api/flows/${id}`, { definition: defRef.current })
      setFlow(updated)
      setDirty(false)
      showToast(t('已保存'))
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const publish = async () => {
    try {
      await api.patch(`/api/flows/${id}`, { definition: defRef.current })
      await api.post(`/api/flows/${id}/publish`)
      setDirty(false)
      showToast(t('流程已发布，可发起申请'))
    } catch (e) { showToast(e.message, 'error') }
  }

  if (!flow) return <div className="sheet-pad text-muted">{t(t('加载中…'))}</div>
  const canWrite = user.permissions?.includes('*') || user.permissions?.includes('flow:write')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="designer-topbar">
        <div className="row">
          <Link to="/flows" className="btn btn-ghost btn-sm" aria-label={t('返回')}>{icons.exit({})}</Link>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{flow.name}</span>
          {flow.published ? <span className="pill pill-positive">{t(t('已发布'))}</span> : <span className="pill pill-warning">{t(t('草稿'))}</span>}
          {dirty && <span className="text-small text-muted">{t(t('有未保存修改'))}</span>}
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={save} disabled={saving || !canWrite}>{saving ? t('保存中…') : t('保存')}</button>
          <button className="btn btn-primary" onClick={publish} disabled={!canWrite}>{icons.check({})} {t('发布')}</button>
        </div>
      </div>

      <div className="flow-designer">
        <div className="flow-canvas">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={(changes) => { onEdgesChange(changes); if (changes.some((c) => c.type === 'remove')) { applyEdgesToDef(rfEdges.filter((e) => !changes.some((c) => c.type === 'remove' && c.id === e.id))); setDirty(true) } }}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#e4e7ea" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {canWrite && (
            <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6, zIndex: 5 }}>
              {['approver', 'condition', 'cc', 'parallel'].map((t) => (
                <button key={t} className="btn btn-secondary btn-sm" onClick={() => addNode(t)}>
                  {icons.plus({})} {NODE_STYLE[t].label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="designer-panel">
          {!selectedNode ? (
            <div className="text-muted text-small" style={{ paddingTop: 8 }}>{t(t('点击节点配置属性；拖拽节点边缘连线定义流转；顶部按钮添加节点。'))}</div>
          ) : (
            <NodeConfig
              node={selectedNode}
              users={users}
              roles={roles}
              onPatch={patchSelected}
              onRemove={() => removeNode(selectedNode.id)}
              canWrite={canWrite}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function NodeConfig({ node, users, roles, onPatch, onRemove, canWrite }) {
  const s = NODE_STYLE[node.type] || {}
  return (
    <>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <div className="palette-group-label" style={{ padding: 0 }}>
          <span className="flow-node-tile" style={{ background: s.color, display: 'inline-grid', verticalAlign: 'middle', marginRight: 6 }}>{s.tile}</span>
          {s.label}{t('节点')}
        </div>
        {canWrite && !['start', 'end'].includes(node.type) && (
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--negative)' }} onClick={onRemove}>{t(t('删除节点'))}</button>
        )}
      </div>
      <Field label={t('节点名称')}>
        <input className="input" style={{ height: 34 }} value={node.name} disabled={!canWrite} onChange={(e) => onPatch({ name: e.target.value })} />
      </Field>

      {node.type === 'approver' && (
        <>
          <Field label={t('审批人方式')}>
            <select className="select" value={node.approver?.mode || 'dept_leader'} disabled={!canWrite}
              onChange={(e) => onPatch({ approver: { ...node.approver, mode: e.target.value } })}>
              <option value="dept_leader">{t(t('发起人部门主管'))}</option>
              <option value="specified_user">{t(t('指定人员'))}</option>
              <option value="specified_role">{t(t('指定角色'))}</option>
              <option value="form_user">{t(t('表单内指定'))}</option>
            </select>
          </Field>
          {node.approver?.mode === 'specified_user' && (
            <Field label={t('审批人（可多选）')}>
              <select className="select" multiple size={5} value={node.approver?.userIds || []} disabled={!canWrite}
                onChange={(e) => onPatch({ approver: { ...node.approver, userIds: [...e.target.selectedOptions].map((o) => o.value) } })}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          )}
          {node.approver?.mode === 'specified_role' && (
            <Field label={t('角色')}>
              <select className="select" value={node.approver?.roleId || ''} disabled={!canWrite}
                onChange={(e) => onPatch({ approver: { ...node.approver, roleId: e.target.value } })}>
                <option value="">{t(t('请选择角色'))}</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          )}
          {node.approver?.mode === 'form_user' && (
            <Field label={t('表单字段 key')} tip={t('该字段的值是用户 ID')}>
              <input className="input mono" style={{ height: 34 }} value={node.approver?.formField || ''} disabled={!canWrite}
                onChange={(e) => onPatch({ approver: { ...node.approver, formField: e.target.value } })} />
            </Field>
          )}
          <Field label={t('审批方式')}>
            <select className="select" value={node.approver?.counterSign || 'any'} disabled={!canWrite}
              onChange={(e) => onPatch({ approver: { ...node.approver, counterSign: e.target.value } })}>
              <option value="any">{t(t('或签：任一人通过即通过'))}</option>
              <option value="all">{t(t('会签：全部通过才通过'))}</option>
            </select>
          </Field>
        </>
      )}

      {node.type === 'cc' && (
        <Field label={t('抄送给（可多选）')}>
          <select className="select" multiple size={5} value={node.cc?.userIds || []} disabled={!canWrite}
            onChange={(e) => onPatch({ cc: { userIds: [...e.target.selectedOptions].map((o) => o.value) } })}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
      )}

      {node.type === 'condition' && (
        <Field label={t('分支')} tip={t('在画布上从条件节点拉出多条连线即创建分支；分支条件引用表单字段。')}>
          <div className="text-small text-muted">
            {(node.branches || []).length === 0 ? t('尚无分支：从该节点拖出连线即可创建。') :
              (node.branches || []).map((b, i) => <div key={b.id} style={{ padding: '4px 0' }}>{i + 1}. {b.name}</div>)}
          </div>
        </Field>
      )}
    </>
  )
}
