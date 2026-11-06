// 主题 + 语言切换小组件（侧栏与登录页共用）
import React from 'react'
import { useTheme, setTheme } from '../theme.js'
import { useLang, setLang, t } from '../i18n.js'

// 图标带绘制/旋转动效（见 styles.css：icon-sun 自转、icon-moon 摇摆、icon-monitor 扫描线）
const Sun = () => (
  <svg className="icon icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
)
const Moon = () => (
  <svg className="icon icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg>
)
const Monitor = () => (
  <svg className="icon icon-monitor" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
)

export function ThemeSwitch() {
  const theme = useTheme()
  return (
    <div className="pref-row" role="group" aria-label={t('主题')}>
      <button className={`pref-btn${theme === 'light' ? ' on' : ''}`} onClick={() => setTheme('light')} aria-label={t('浅色')} title={t('浅色')}><Sun /></button>
      <button className={`pref-btn${theme === 'system' ? ' on' : ''}`} onClick={() => setTheme('system')} aria-label={t('跟随系统')} title={t('跟随系统')}><Monitor /></button>
      <button className={`pref-btn${theme === 'dark' ? ' on' : ''}`} onClick={() => setTheme('dark')} aria-label={t('深色')} title={t('深色')}><Moon /></button>
    </div>
  )
}

export function LangSwitch() {
  const lang = useLang()
  return (
    <div className="pref-row" role="group" aria-label={t('语言')}>
      <button className={`pref-btn${lang === 'en' ? ' on' : ''}`} onClick={() => setLang('en')}>EN</button>
      <button className={`pref-btn${lang === 'zh' ? ' on' : ''}`} onClick={() => setLang('zh')}>中文</button>
    </div>
  )
}
