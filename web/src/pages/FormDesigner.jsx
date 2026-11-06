import React, { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '../api.js'
import { useApp } from '../App.jsx'
import { Field, icons } from '../ui.jsx'
import { t, useLang } from '../i18n.js'

// 组件面板：type → 渲染与默认属性
export const FIELD_TYPES = {
  text:       { label: t('单行文本'), tile: 'T',  color: '#1b6c80' },
  textarea:   { label: t('多行文本'), tile: '¶',  color: '#2f70bb' },
  number:     { label: t('数字'),     tile: '#',  color: '#1e7b4f' },
  money:      { label: t('金额'),     tile: '¥',  color: '#a86f0c' },
  select:     { label: t('下拉选择'), tile: '▾',  color: '#7c5cad' },
  radio:      { label: t('单选'),     tile: '◉',  color: '#c2571c' },
  checkbox:   { label: t('多选'),     tile: t('选'), color: '#5d7a2e' },
  date:       { label: t('日期'),     tile: t('日'), color: '#1b6c80' },
  datetime:   { label: t('日期时间'), tile: t('时'), color: '#2f70bb' },
  switch:     { label: t('开关'),     tile: '⇄',  color: '#7c5cad' },
  file:       { label: t('附件上传'), tile: '↑',  color: '#c2571c' },
  table:      { label: t('明细表格'), tile: '⊞',  color: '#5d7a2e' },
  department: { label: t('部门选择'), tile: t('组'), color: '#1b6c80' },
  user:       { label: t('人员选择'), tile: t('人'), color: '#2f70bb' },
}

export function defaultField(type) {
  const t = FIELD_TYPES[type]
  const f = {
    id: `f_${Math.random().toString(36).slice(2, 8)}`,
    key: `field_${Math.random().toString(36).slice(2, 6)}`,
    label: t.label, type, required: false, placeholder: '', tip: '',
    options: ['select', 'radio', 'checkbox'].includes(type) ? [t('选项一'), t('选项二'), t('选项三')] : [],
    columns: type === 'table' ? [{ key: 'name', label: t('名称'), type: 'text' }, { key: 'qty', label: t('数量'), type: 'number' }] : [],
    min: null, max: null, unit: '',
  }
  return f
}

// 单个字段渲染（设计画布 & 运行时共用）
export function FieldPreview({ field, value, onChange, disabled }) {
  const set = (v) => onChange && onChange(v)
  switch (field.type) {
    case 'textarea':
      return <textarea className="textarea" placeholder={field.placeholder || t('请输入')} value={value || ''} disabled={disabled} onChange={(e) => set(e.target.value)} />
    case 'number':
      return <input className="input" type="number" placeholder={field.placeholder || t('请输入数字')} value={value ?? ''} disabled={disabled} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} />
    case 'money':
      return (
        <div className="row">
          <input className="input" type="number" step="0.01" placeholder="0.00" value={value ?? ''} disabled={disabled} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} />
          {field.unit && <span className="text-muted" style={{ flex: 'none' }}>{field.unit}</span>}
        </div>
      )
    case 'select':
      return (
        <select className="select" value={value || ''} disabled={disabled} onChange={(e) => set(e.target.value)}>
          <option value="" disabled>{t(t('请选择'))}</option>
          {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    case 'radio':
      return (
        <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
          {(field.options || []).map((o) => (
            <label key={o} className="row" style={{ gap: 6, cursor: disabled ? 'default' : 'pointer' }}>
              <input type="radio" name={field.key} checked={value === o} disabled={disabled} onChange={() => set(o)} /> {o}
            </label>
          ))}
        </div>
      )
    case 'checkbox':
      return (
        <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
          {(field.options || []).map((o) => (
            <label key={o} className="row" style={{ gap: 6, cursor: disabled ? 'default' : 'pointer' }}>
              <input type="checkbox" checked={(value || []).includes(o)} disabled={disabled}
                onChange={(e) => set(e.target.checked ? [...(value || []), o] : (value || []).filter((v) => v !== o))} /> {o}
            </label>
          ))}
        </div>
      )
    case 'date':
      return <input className="input" type="date" value={value || ''} disabled={disabled} onChange={(e) => set(e.target.value)} />
    case 'datetime':
      return <input className="input" type="datetime-local" value={value || ''} disabled={disabled} onChange={(e) => set(e.target.value)} />
    case 'switch':
      return (
        <label className="row" style={{ gap: 8, cursor: disabled ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => set(e.target.checked)} />
          <span className="text-small text-muted">{value ? t('开') : t('关')}</span>
        </label>
      )
    case 'file':
      return (
        <div className="empty" style={{ padding: '16px 12px', textAlign: 'left' }}>
          <input type="file" multiple disabled={disabled} onChange={(e) => set([...(e.target.files || [])].map((f) => f.name))} />
          {Array.isArray(value) && value.length > 0 && <div className="text-small text-muted mt-8">{t('已选：')}{value.join('、')}</div>}
        </div>
      )
    case 'table': {
      const rows = Array.isArray(value) ? value : []
      const setCell = (ri, ck, v) => {
        const next = rows.map((r, i) => (i === ri ? { ...r, [ck]: v } : r))
        set(next)
      }
      return (
        <table className="table">
          <thead>
            <tr>
              {(field.columns || []).map((c) => <th key={c.key}>{c.label}</th>)}
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={(field.columns?.length || 0) + 1} className="text-muted text-small" style={{ textAlign: 'center', padding: 16 }}>{t(t('暂无明细行'))}</td></tr>
            )}
            {rows.map((r, ri) => (
              <tr key={ri}>
                {(field.columns || []).map((c) => (
                  <td key={c.key} style={{ padding: '6px 8px' }}>
                    <input
                      className="input" style={{ height: 30, padding: '0 8px' }} type={c.type === 'number' || c.type === 'money' ? 'number' : 'text'}
                      value={r[c.key] ?? ''} disabled={disabled} onChange={(e) => setCell(ri, c.key, c.type === 'number' || c.type === 'money' ? Number(e.target.value) : e.target.value)}
                    />
                  </td>
                ))}
                <td style={{ padding: '6px 8px' }}>
                  {!disabled && <button className="btn btn-ghost btn-sm" onClick={() => set(rows.filter((_, i) => i !== ri))} aria-label={t('删除行')}>×</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    case 'department':
      return <div className="input" style={{ display: 'flex', alignItems: 'center', color: 'var(--faint)' }}>{value ? t('部门 ID: {0}', value) : '请选择部门'}</div>
    case 'user':
      return <div className="input" style={{ display: 'flex', alignItems: 'center', color: 'var(--faint)' }}>{value ? t('用户: {0}', value) : '请选择人员'}</div>
    default:
      return <input className="input" placeholder={field.placeholder || t('请输入')} value={value || ''} disabled={disabled} onChange={(e) => set(e.target.value)} />
  }
}

// ============ 设计器页 ============
export default function FormDesigner() {
  useLang()
  const { id } = useParams()
  const { showToast, user } = useApp()
  const [form, setForm] = useState(null)
  const [fields, setFields] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const dragIndex = useRef(null)
  const [dragOver, setDragOver] = useState(null)

  useEffect(() => {
    api.get(`/api/forms/${id}`).then((f) => {
      setForm(f)
      setFields((f.schema?.fields || []).map((x) => ({ ...x, id: x.id || `f_${Math.random().toString(36).slice(2, 8)}` })))
    }).catch((e) => showToast(e.message, 'error'))
  }, [id])

  const canWrite = user.permissions?.includes('*') || user.permissions?.includes('form:write')
  const selected = fields.find((f) => f.id === selectedId)

  const addField = (type) => {
    const f = defaultField(type)
    setFields([...fields, f])
    setSelectedId(f.id)
  }
  const updateField = (patch) => {
    setFields(fields.map((f) => (f.id === selectedId ? { ...f, ...patch } : f)))
  }
  const removeField = (fid) => {
    setFields(fields.filter((f) => f.id !== fid))
    if (selectedId === fid) setSelectedId(null)
  }
  const move = (from, to) => {
    if (to < 0 || to >= fields.length) return
    const next = [...fields]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setFields(next)
  }

  const save = async () => {
    setSaving(true)
    try {
      const schema = { fields: fields.map(({ id: _id, ...rest }) => rest) }
      const updated = await api.patch(`/api/forms/${id}`, { schema })
      setForm(updated)
      showToast(t('已保存'))
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const aiAppend = async () => {
    if (!aiPrompt.trim()) return
    setAiBusy(true)
    try {
      const schema = await api.post('/api/ai/form', { prompt: aiPrompt })
      const mapped = (schema.fields || []).map((f) => ({ ...f, id: `f_${Math.random().toString(36).slice(2, 8)}` }))
      setFields(mapped)
      showToast(t('AI 已重排为 {0} 个字段（覆盖原设计）', mapped.length))
    } catch (e) { showToast(e.message, 'error') }
    finally { setAiBusy(false) }
  }

  if (!form) return <div className="sheet-pad text-muted">{t(t('加载中…'))}</div>

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="designer-topbar">
        <div className="row">
          <Link to="/forms" className="btn btn-ghost btn-sm" aria-label={t('返回')}>{icons.exit({})}</Link>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{form.name}</span>
          <span className="pill pill-neutral">v{form.version || 1}</span>
        </div>
        <div className="row" style={{ flex: 1, maxWidth: 420 }}>
          <input
            className="input" style={{ height: 30 }} placeholder={t('AI：一句话重新生成表单…')}
            value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') aiAppend() }}
          />
          <button className="btn btn-secondary btn-sm" onClick={aiAppend} disabled={aiBusy}>
            {icons.sparkles({})} {aiBusy ? t('生成中') : t('生成')}
          </button>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={save} disabled={saving || !canWrite}>{saving ? t('保存中…') : t('保存')}</button>
        </div>
      </div>

      <div className="designer">
        {/* 左：组件面板 */}
        <div className="designer-panel" aria-label={t('组件面板')}>
          <div className="palette-group-label">{t(t('基础控件'))}</div>
          {['text', 'textarea', 'number', 'money', 'date', 'datetime'].map((t) => (
            <div key={t} className="palette-item" onClick={() => canWrite && addField(t)} onDoubleClick={() => canWrite && addField(t)}>
              <span className="palette-tile" style={{ background: FIELD_TYPES[t].color }}>{FIELD_TYPES[t].tile}</span>
              <span>{FIELD_TYPES[t].label}</span>
            </div>
          ))}
          <div className="palette-group-label">{t(t('选择控件'))}</div>
          {['select', 'radio', 'checkbox', 'switch'].map((t) => (
            <div key={t} className="palette-item" onClick={() => canWrite && addField(t)}>
              <span className="palette-tile" style={{ background: FIELD_TYPES[t].color }}>{FIELD_TYPES[t].tile}</span>
              <span>{FIELD_TYPES[t].label}</span>
            </div>
          ))}
          <div className="palette-group-label">{t(t('高级控件'))}</div>
          {['file', 'table', 'department', 'user'].map((t) => (
            <div key={t} className="palette-item" onClick={() => canWrite && addField(t)}>
              <span className="palette-tile" style={{ background: FIELD_TYPES[t].color }}>{FIELD_TYPES[t].tile}</span>
              <span>{FIELD_TYPES[t].label}</span>
            </div>
          ))}
        </div>

        {/* 中：画布 */}
        <div className="designer-panel" style={{ background: 'var(--raised)', border: 'none', padding: 0 }}>
          <div className="form-canvas">
            <div className="form-canvas-inner">
              {fields.length === 0 ? (
                <div className="canvas-empty">{t(t('从左侧点击或拖入控件开始设计表单'))}<div className="text-small mt-8">{t(t('也可以用顶部 AI 输入框一句话生成'))}</div>
                </div>
              ) : (
                fields.map((f, i) => (
                  <motion.div
                    key={f.id}
                    layout
                    className={`canvas-field${selectedId === f.id ? ' selected' : ''}`}
                    onClick={() => setSelectedId(f.id)}
                    draggable={canWrite}
                    onDragStart={() => { dragIndex.current = i }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(i) }}
                    onDragEnd={() => { if (dragIndex.current !== null && dragOver !== null && dragIndex.current !== dragOver) move(dragIndex.current, dragOver); dragIndex.current = null; setDragOver(null) }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, borderColor: dragOver === i && dragIndex.current !== null ? 'var(--accent)' : undefined }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="row-between mb-16" style={{ marginBottom: 8 }}>
                      <div className="canvas-field-label">
                        {f.label}
                        {f.required && <span className="req">*</span>}
                        <span className="text-small text-muted mono" style={{ marginLeft: 8 }}>{f.key}</span>
                      </div>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); move(i, i - 1) }} disabled={i === 0} aria-label={t('上移')}>↑</button>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); move(i, i + 1) }} disabled={i === fields.length - 1} aria-label={t('下移')}>↓</button>
                        {canWrite && <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); removeField(f.id) }} style={{ color: 'var(--negative)' }} aria-label={t('删除')}>×</button>}
                      </div>
                    </div>
                    <FieldPreview field={f} disabled />
                  </motion.div>
                ))
              )}
              <AnimatePresence />
            </div>
          </div>
        </div>

        {/* 右：属性面板 */}
        <div className="designer-panel" aria-label={t('属性面板')}>
          {!selected ? (
            <div className="text-muted text-small" style={{ paddingTop: 8 }}>{t(t('选中画布中的字段编辑属性'))}</div>
          ) : (
            <>
              <div className="palette-group-label" style={{ paddingTop: 0 }}>{t(t('字段属性'))}</div>
              <Field label={t('标签')}>
                <input className="input" style={{ height: 34 }} value={selected.label} onChange={(e) => updateField({ label: e.target.value })} />
              </Field>
              <Field label={t('字段名（提交数据的 key）')}>
                <input className="input mono" style={{ height: 34 }} value={selected.key} onChange={(e) => updateField({ key: e.target.value.replace(/\W/g, '_') })} />
              </Field>
              <Field label={t('占位提示')}>
                <input className="input" style={{ height: 34 }} value={selected.placeholder} onChange={(e) => updateField({ placeholder: e.target.value })} />
              </Field>
              {['select', 'radio', 'checkbox'].includes(selected.type) && (
                <Field label={t('选项（每行一个）')}>
                  <textarea className="textarea" style={{ minHeight: 80 }} value={(selected.options || []).join('\n')}
                    onChange={(e) => updateField({ options: e.target.value.split('\n').filter(Boolean) })} />
                </Field>
              )}
              {selected.type === 'table' && (
                <Field label={t('列（名称|类型，每行一个）')} tip={t('类型：text / number / money')}>
                  <textarea className="textarea" style={{ minHeight: 80 }}
                    value={(selected.columns || []).map((c) => `${c.label}|${c.type}`).join('\n')}
                    onChange={(e) => updateField({
                      columns: e.target.value.split('\n').filter(Boolean).map((line, i) => {
                        const [label, type] = line.split('|')
                        return { key: `col_${i}`, label: (label || '').trim(), type: ['text', 'number', 'money'].includes(type?.trim()) ? type.trim() : 'text' }
                      }),
                    })} />
                </Field>
              )}
              {(selected.type === 'number' || selected.type === 'money') && (
                <div className="grid-2" style={{ gap: 8 }}>
                  <Field label={t('最小值')}><input className="input" style={{ height: 34 }} type="number" value={selected.min ?? ''} onChange={(e) => updateField({ min: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                  <Field label={t('最大值')}><input className="input" style={{ height: 34 }} type="number" value={selected.max ?? ''} onChange={(e) => updateField({ max: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                </div>
              )}
              <Field label={t('单位后缀')}>
                <input className="input" style={{ height: 34 }} value={selected.unit} onChange={(e) => updateField({ unit: e.target.value })} placeholder={t('如：元')} />
              </Field>
              <Field label={t('帮助文字')}>
                <input className="input" style={{ height: 34 }} value={selected.tip} onChange={(e) => updateField({ tip: e.target.value })} />
              </Field>
              <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!selected.required} onChange={(e) => updateField({ required: e.target.checked })} />
                <span style={{ fontWeight: 500 }}>{t(t('必填'))}</span>
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
