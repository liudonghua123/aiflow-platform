// 主题：默认跟随系统，可切 light / dark；持久化到 localStorage
import { useState, useEffect } from 'react'

const KEY = 'aiflow_theme'
const mq = window.matchMedia('(prefers-color-scheme: dark)')
let current = localStorage.getItem(KEY)
if (!['light', 'dark', 'system'].includes(current)) current = 'system'
const listeners = new Set()

export function getTheme() { return current }

export function setTheme(v) {
  current = ['light', 'dark', 'system'].includes(v) ? v : 'system'
  localStorage.setItem(KEY, current)
  apply()
  listeners.forEach((f) => f(current))
}

function resolved() {
  return current === 'system' ? (mq.matches ? 'dark' : 'light') : current
}

function apply() {
  document.documentElement.dataset.theme = resolved()
}

// 监听系统主题变化（仅 system 模式受影响）
mq.addEventListener('change', () => { if (current === 'system') apply() })

export function useTheme() {
  const [v, setV] = useState(current)
  useEffect(() => {
    const f = (x) => setV(x)
    listeners.add(f)
    return () => { listeners.delete(f) }
  }, [])
  return v
}

// 模块加载时立即应用一次，避免闪白
apply()
