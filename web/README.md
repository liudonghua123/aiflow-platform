# AIFlow Web · Vite + React 前端

AIFlow 平台前端：Vite + React 19 + motion，遵循 TinyBuddy UI 规范（语义色令牌、sm/lg 双断点、三档圆角、边框优先）。

English: see [root README.md](../README.md).

## 结构

| 路径 | 内容 |
| --- | --- |
| `src/pages/` | 15 个页面：工作台、审批中心、表单/流程设计器、管理后台（用户/角色/组织/Webhook/设置）、账号安全（MFA 绑定） |
| `src/designer/` | 设计器组件 |
| `src/components/Prefs.jsx` | 语言 / 主题切换 |
| `src/api.js` | 统一 API 客户端（`aiflow_token` / `aiflow_user`，401 自动跳登录） |
| `src/i18n.js` | 中文源串 + 英文词典，默认 EN |
| `src/theme.js` | system / light / dark 三态主题 |
| `src/styles.css` | 设计系统全部样式 |

## 运行

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 产物 dist/
```

## 响应式约定

- 断点：`sm` 640px / `lg` **900px**（唯一形态切换断点，勿用 1024）
- 桌面 ≥900px：可折叠侧栏（折叠仅 logo）；移动 <900px：悬浮胶囊底栏 + 更多抽屉
- 表格移动端卡片化：列名写在 `<td data-label>`，勿加 JSX 分支

## 注意

React 陷阱：`useEffect(load, [])` 若 `load` 是表达式体箭头函数会隐式返回 Promise，unmount 时触发 `destroy is not a function` 白屏——统一写 `useEffect(() => { load() }, [])`。
