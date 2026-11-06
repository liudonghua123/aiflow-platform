# AIFlow UI 设计规范（TinyBuddy UI v0.2.1）

> AIFlow 前端遵循的完整设计规范。实现代码：`web/src/styles.css`。
> 交互式组件预览见 `docs/styleguide.html`，机器可读令牌见 `docs/design-tokens.json`。

## 硬性规则（违反即 Bug）

1. **颜色只走语义令牌**：禁止在组件代码中硬编码色值。所有颜色通过 `rgb(var(--token) / alpha)` 引用。
2. **只用两个断点**：`sm` 640px、`lg` 900px。其余宽度由流式布局 + 容器分档吸收。
3. **圆角三档**：控件 14px、容器 18px、Modal 24px。小元素（chip/圆点）可用 6px/8px/full。
4. **边框优先于阴影**：卡片 = `1px solid line` + `shadow-soft`。阴影只表达「浮起」，不作描边替代。

## 1. 颜色令牌（R G B 三元组）

令牌值为裸的 `R G B` 三元组，配合 `rgb(var(--token) / 0.1)` 直接产生透明度变体：

| 令牌 | 语义 | 浅色 | 暗色 |
|---|---|---|---|
| `--bg` | 页面画布 | `246 246 249` | `12 12 17` |
| `--surface` | 卡片 | `255 255 255` | `20 20 27` |
| `--elevated` | 浮起表面 | `255 255 255` | `25 25 33` |
| `--line` | 边框 | `233 233 240` | `38 38 47` |
| `--ink` | 主文字 | `23 23 29` | `236 236 242` |
| `--muted` | 次文字 | `106 107 118` | `155 156 168` |
| `--faint` | 三级文字（仅装饰） | `154 155 166` | `111 112 124` |
| `--brand` | 品牌色 | `109 74 255` | `139 109 255` |
| `--brand-soft` | 品牌底色 | `240 236 255` | `33 26 61` || `--brand-ink` | 品牌深字 | `75 47 208` | `196 181 255` |
| `--ok` | 成功 | `31 157 114` | `62 207 154` |
| `--warn` | 警告 | `194 117 31` | `226 164 90` |
| `--danger` | 危险 | `209 73 91` | `242 112 127` |

注意事项：
- `--faint` 对比度约 2.76，**只作装饰性文字**（分组标签、时间戳、占位符），不得用作正文；必读信息最低用 `--muted`。
- 暗色模式**不写 `dark:` 变体**，只换令牌值（`[data-theme="dark"]` 一处定义）。
- 暗色主按钮（白字 on brand = 3.67）仅达 AA-Large，只在 **≥14px 且 semibold** 时使用。
- 语义别名（`--ground`/`--surface-c`/`--raised`/`--active`/`--border`/`--text` 等）映射旧类名，存量页面无需改动。

对比度实测（WCAG 2.1）：`ink/surface` 17.85（AAA）、`muted/surface` 5.28（AA）、`brand-ink/brand-soft` 6.94（AAA）、`danger/surface` 4.36（仅 ≥13px 短文本）、`ok/surface` 3.43（只作圆点/图标）。

## 2. 排版

字号阶梯以 **0.5px 步进**（9.5 → 34px），仅可用以下值：

| 级别 | 字号 | 字重 | 用途 |
|---|---|---|---|
| hero | 34px | 600 | 登录页 hero |
| h1 | 26px | 600 | 页面标题（sm+） |
| h1-mobile | 22px | 600 | 页面标题（sm 以下） |
| modal-title | 16px | 600 | Modal 标题 |
| body-lg | 15px | 400–650 | Markdown 正文（行高 1.72）、空状态标题 |
| nav | 13.5px | 500 | 导航项、Toast、页面副标题 |
| control | 13px | 500 | 按钮、Tab、卡片标题 |
| control-sm | 12.5px | 400–500 | 小按钮、行内链接 |
| label | 12px | 500 | `.label`（uppercase + tracking-wide）、表单标签 |
| meta | 11.5px | 400–500 | 提示语、附件名 |
| chip | 11px | 500 | chip、徽章 |
| micro | 10.5px | 500 | 底部导航文字、Logo 副标 |
| decorative | 9.5–10px | 400–500 | 计数、装饰字 |

规则：同一层级内相邻两级最多差 1px；跨层至少差 2px。数字统一 `font-variant-numeric: tabular-nums`（或 `font-mono`）。

字体栈：`-apple-system, BlinkMacSystemFont, Inter, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`（中文回退放在拉丁字体之后，中英混排时英文走 Inter/Segoe）。

## 3. 间距

基础单位 **4px**，可用值：4 / 8 / 12 / 16 / 20 / 24 / 32。布局参数：

| 项 | 值 |
|---|---|
| 侧栏宽 | 252px（折叠 60px） |
| 移动顶栏 | 48px |
| 移动底栏 | 56px |
| 最小触控 | 36px |
| 内容列宽 | 760 / 896 / 1024 / 1100px 分档 |

## 4. 圆角

| 档 | 值 | 用途 |
|---|---|---|
| sm | 6px | chip、小标签 |
| md | 8px | 输入组内嵌、缩略图 |
| control | 14px | 按钮、输入框、导航项 |
| container | 18px | 卡片、面板、侧栏 |
| modal | 24px | 弹窗、底部抽屉 |
| full | 999px | 胶囊按钮、头像 |

## 5. 阴影

只允许两档，**禁止多层杂阴影**：

- `--shadow-soft`：`0 1px 2px rgba(16,16,24,.04), 0 8px 24px -12px rgba(16,16,24,.12)` — 卡片默认
- `--shadow-lift`：`0 2px 4px rgba(16,16,24,.04), 0 16px 40px -16px rgba(16,16,24,.2)` — hover 浮起/弹窗

## 6. 组件规范

### 按钮

| 型态 | 规格 |
|---|---|
| primary | 背景 `--brand`，文字白，hover 亮度 1.1，active scale(.98) |
| secondary | 背景 `--surface`，边框 `--line`，文字 `--ink` |
| ghost | 无背景，文字 `--muted`，hover 底 `--elevated` |
| danger | 背景 `--danger/0.1`，边框 `--danger/0.25`，文字 `--danger` |

高度 36px（sm 28px），圆角 14px，字号 13.5px，左右 padding 14px。

### 表单

- 输入框高 40px，圆角 14px，边框 `--line`，背景 `--surface`。
- 聚焦用 **4px 光晕**（`border-color: brand/50` + `box-shadow: 0 0 0 4px rgb(var(--brand) / 0.1)`），**不用 outline**（避免布局位移）。
- `.label` 语义类：12px / 500 / `uppercase` + `tracking-wide` / `--faint`，下边距 6px；中文不上大写，靠字重区分。
- 错误态：边框 `--danger`；错误提示块 `danger/10` 底 + `danger/25` 边 + 12.5px `--danger` 文字。

### 卡片

背景 `--surface`，边框 `1px solid --line`，圆角 18px，阴影 `--shadow-soft`，内边距 16–20px。可点击卡片 hover 出 `border-faint/60`。

### 图标按钮 / Chip / 状态点

- `.icon-btn`：36×36px，圆角 14px，默认 `--muted`，hover 出 `--elevated` 底。低于 36px 的触控热区不允许出现。
- Chip（`.pill`）：高 **20px**、11px/500、圆角 full；默认 `--elevated` 底 + `--line` 边 + `--muted` 字；品牌变体 `border-brand/20 bg-brand-soft/60 text-brand-ink`；成功/危险 `token/10` 底 + `token` 字。
- 状态点（`.status-dot`）：8px 圆点，`ok / warn / danger / idle` 四态；**ok 态额外套 `ping-soft` 外圈**（1s 无限）表示在线。

### Switch

**38×22** 胶囊，滑块 16px + 3px 内边距，位移 16px；开 `--brand` / 关 `--line`。切换动画 150ms。

### Tabs（底槽式）

`.tabs` = `rounded-xl border-line bg-elevated p-4px` 底槽；选中项 `bg-surface text-ink shadow-sm`，未选中 `text-muted hover:text-ink`；项内 `6px 14px` / 13px，可带 11px `--faint` 计数。底栏导航：56px 高，active 顶部 24×2px 品牌短横 + 文字 `--brand-ink`。

### Modal

双形态：桌面居中（圆角 24px + `shadow-lift`，遮罩 `black/40 + backdrop-blur(2px)`，`z-80`）；移动端底部抽屉（顶部圆角 24px，动画 `drawer-up` 280ms，`safe-bottom`）。宽默认 `max-w-lg`（宽版 `max-w-2xl`），高上限 90vh，正文独立滚动。

### Toast

**桌面右上角 24px / 移动端 tabbar 上方居中**，`z-100`，圆角 18px，`bg-surface/95 + backdrop-blur` + `shadow-lift`，13.5px 文字；错误态边框 `--danger/0.3`。成功 3.2s / 错误 5.2s 自动消失。

### 空状态

居中，图标 48px + `--faint`，主文案 14px/`--muted`，操作按钮 margin-top 14px。

## 7. 导航（三层）

| 层 | 断点 | 形态 |
|---|---|---|
| 侧栏 | ≥900px | 252px，`--surface/0.6` 底；分组标签 11px `--faint`；active 用 `--brand-soft` 底 + 右缘 6px 圆点；折叠后**仅显示 logo**（点击 logo 展开），宽 60px；折叠按钮固定在侧栏内右上角（24px 圆钮） |
| 顶栏 | <900px | 48px，品牌 + 徽标；`lg` 断点隐藏 |
| 底部 Tab | <900px | **悬浮胶囊**：`left/right 16px` + 距底 `12px + safe-area`，56px 高，圆角 34px，`--surface/0.92` 毛玻璃 + 整圈 `--line` 边框 + `shadow-lift`；中部圆形 FAB（42px，品牌色投影）；active 用 `--brand-soft` 软底胶囊；「更多」打开悬浮圆角抽屉（顶部带拖动把手） |

外壳 `.shell` 高 `100dvh` + `overflow: hidden`，滚动交给内部容器。侧栏可折叠，状态持久化到 localStorage。

## 7.1 移动端表格卡片化

`<900px` 下 `.table` 自动切换为卡片列表，无需改 JSX 结构（列名通过 `data-label` 属性提供）：

- `thead` 隐藏；`tbody tr` 变块级卡片：1px `--line` 边框 + 18px 圆角 + `--surface` 底，行间距 8px
- 每个 `td` flex 两端对齐：左侧 11px uppercase `--faint` 列名（`td::before { content: attr(data-label) }`），右侧值右对齐
- 首列（主内容）不带标签、左对齐占满；操作列（`data-label=" "`）按钮靠右
- 列表页（Flows/Tasks/Home/AdminUsers/AdminWebhooks/AdminSettings/AdminOrg）td 均已补 `data-label`

## 8. 动效

| 动效 | 规格 |
|---|---|
| fade-up 入场 | 280ms `cubic-bezier(.2,.8,.2,1)`，translateY(6px) → 0 |
| pulse-soft | 1.4s ease-in-out 无限，透明度 1 → 0.35（运行中状态） |
| ping-soft | 1s 无限（状态点 ok 态外圈） |
| hover 过渡 | 150ms 同曲线 |
| active 按压 | `scale(0.98)` |
| 抽屉上滑 | 280ms translateY(48px) + fade |
| FAB 加号 | hover 旋转 90°，200ms |

原则：动效只解释状态变化，不做表演。`prefers-reduced-motion: reduce` 时全部动画降级为无动画（全局 `animation/transition-duration: 0.01ms`）。

## 9. 可访问性

- 全局 `:focus-visible { outline: 2px solid rgb(var(--brand)); outline-offset: 2px }`（按钮含内）。
- `--faint` 对比度 2.76，仅装饰；必读信息最低 `--muted`。
- 暗色主按钮（白字 on brand = 3.67）仅 ≥14px semibold 使用。
- 最小触控 36px，移动端关键操作 ≥40px。
- 暗色主按钮注意字号；Modal Esc 关闭；图标按钮带 `aria-label`。

## 10. 图标

统一线性 SVG，`stroke: currentColor`，`fill: none`，默认 `stroke-width: 2`（激活态 2.2）。尺寸：导航 15px / 底栏 20px / 抽屉 18px。品牌类图标（主题切换太阳/月亮）带缓慢旋转/摇摆动画。

## 11. 断点与分档

- `sm` 640px：页头标题 22 → 26px、内边距 16 → 24px
- `lg` 900px：**唯一形态切换断点**（<900 移动形态，≥900 桌面三栏）。由 1024 下调：Windows 125%/150% 缩放下 1024 物理屏逻辑宽仅 819~911，会被误判为移动形态

内容列：`max-width` 取 760 / 896 / 1024 / 1100px 四档之一，禁止任意值。选择逻辑：读长文 → 窄，看列表 → 中，看图表/网格 → 宽。

## 12. z-index 分层

| 层 | 值 |
|---|---|
| drawer（抽屉/遮罩） | 70 |
| modal | 80 |
| toast | 100 |

## 交付物

| 文件 | 说明 |
|---|---|
| `web/src/styles.css` | 全部令牌 + 组件样式的唯一实现 |
| `docs/styleguide.html` | 交互式组件预览（双主题可切换） |
| `docs/design-tokens.json` | 机器可读令牌（供设计工具/主题生成） |
| `docs/DESIGN.md` / `docs/DESIGN.en.md` | 本规范中英双版 |
