# AIFlow UI Design Specification (TinyBuddy UI v0.2.1)

> The complete design specification followed by the AIFlow frontend. Implementation: `web/src/styles.css`.
> Interactive component preview: `docs/styleguide.html`; machine-readable tokens: `docs/design-tokens.json`.

## Hard Rules (violations are bugs)

1. **Colors only via semantic tokens**: never hardcode colors in component code. Reference all colors through `rgb(var(--token) / alpha)`.
2. **Only two breakpoints**: `sm` 640px and `lg` 900px. Everything in between is absorbed by fluid layout + container width tiers.
3. **Three corner-radius tiers**: controls 14px, containers 18px, modals 24px. Small elements (chips/dots) may use 6px/8px/full.
4. **Borders over shadows**: a card = `1px solid line` + `shadow-soft`. Shadows express elevation only, never replace borders.

## 1. Color Tokens (R G B triplets)

Token values are bare `R G B` triplets; `rgb(var(--token) / 0.1)` produces alpha variants directly:

| Token | Meaning | Light | Dark |
|---|---|---|---|
| `--bg` | Page canvas | `246 246 249` | `12 12 17` |
| `--surface` | Card | `255 255 255` | `20 20 27` |
| `--elevated` | Raised surface | `255 255 255` | `25 25 33` |
| `--line` | Border | `233 233 240` | `38 38 47` |
| `--ink` | Primary text | `23 23 29` | `236 236 242` |
| `--muted` | Secondary text | `106 107 118` | `155 156 168` |
| `--faint` | Tertiary text (decoration only) | `154 155 166` | `111 112 124` |
| `--brand` | Brand | `109 74 255` | `139 109 255` |
| `--brand-soft` | Brand surface | `240 236 255` | `33 26 61` |
| `--brand-ink` | Brand text on soft | `75 47 208` | `196 181 255` |
| `--ok` | Success | `31 157 114` | `62 207 154` |
| `--warn` | Warning | `194 117 31` | `226 164 90` |
| `--danger` | Danger | `209 73 91` | `242 112 127` |

Notes:
- `--faint` has a contrast ratio of ~2.76 — **decoration only** (group labels, timestamps); never use for body copy.
- Dark mode does **not** use `dark:` variants; only token values change (defined once under `[data-theme="dark"]`).
- Semantic aliases (`--ground`/`--surface-c`/`--raised`/`--active`/`--border`/`--text`, etc.) map to legacy class names so existing pages keep working.

## 2. Typography

Font sizes step in **0.5px increments** (9.5 → 34px); only the following values are allowed:

| Level | Size | Weight | Use |
|---|---|---|---|
| hero | 34px | 600 | Login hero |
| h1 | 26px | 600 | Page title (sm+) |
| h1-mobile | 22px | 600 | Page title (below sm) |
| modal-title | 16px | 600 | Modal titles |
| body-lg | 15px | 400–650 | Markdown body (line-height 1.72), empty-state titles |
| nav | 13.5px | 500 | Nav items, toasts, page subtitles |
| control | 13px | 500 | Buttons, tabs, card titles |
| control-sm | 12.5px | 400–500 | Small buttons, inline links |
| label | 12px | 500 | `.label` (uppercase + tracking-wide), form labels |
| meta | 11.5px | 400–500 | Hints, attachment names |
| chip | 11px | 500 | Chips, badges |
| micro | 10.5px | 500 | Bottom-nav text, logo subtitle |
| decorative | 9.5–10px | 400–500 | Counts, decorative text |

Rule: adjacent levels within the same tier differ by at most 1px; across tiers by at least 2px. Numbers use `font-variant-numeric: tabular-nums` (or `font-mono`).

Font stack: `-apple-system, BlinkMacSystemFont, Inter, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif` (Chinese fallbacks come after Latin fonts, so mixed text keeps Inter/Segoe for Latin).

## 3. Spacing

Base unit **4px**; allowed values: 4 / 8 / 12 / 16 / 20 / 24 / 32. Layout metrics:

| Item | Value |
|---|---|
| Sidebar width | 252px (collapsed 60px) |
| Mobile top bar | 48px |
| Mobile bottom nav | 56px |
| Min touch target | 36px |
| Content column | 760 / 896 / 1024 / 1100px tiers |

## 4. Corner Radius

| Tier | Value | Use |
|---|---|---|
| sm | 6px | chips, small tags |
| md | 8px | nested inputs, thumbnails |
| control | 14px | buttons, inputs, nav items |
| container | 18px | cards, panels, sidebar |
| modal | 24px | dialogs, bottom sheets |
| full | 999px | pill buttons, avatars |

## 5. Shadows

Only two levels allowed — **no ad-hoc multi-layer shadows**:

- `--shadow-soft`: `0 1px 2px rgba(16,16,24,.04), 0 8px 24px -12px rgba(16,16,24,.12)` — default for cards
- `--shadow-lift`: `0 2px 4px rgba(16,16,24,.04), 0 16px 40px -16px rgba(16,16,24,.2)` — hover lift / dialogs

## 6. Components

### Buttons

| Variant | Spec |
|---|---|
| primary | bg `--brand`, white text, hover brightness 1.1, active scale(.98) |
| secondary | bg `--surface`, border `--line`, text `--ink` |
| ghost | no bg, text `--muted`, hover bg `--elevated` |
| danger | bg `--danger/0.1`, border `--danger/0.25`, text `--danger` |

Height 36px (sm 28px), radius 14px, font 13.5px, horizontal padding 14px.

### Forms

- Input height 36px, radius 14px, border `--line`, bg `--surface`.
- Focus uses a **4px halo** (`border-color: brand/50` + `box-shadow: 0 0 0 4px rgb(var(--brand) / 0.1)`), never `outline` (avoids layout shift).
- `.label` semantic class: 12px / 500 / `uppercase` + `tracking-wide` / `--faint`, 6px bottom margin; no uppercase for Chinese — weight does the work.
- Error state: border `--danger`; error block `danger/10` bg + `danger/25` border + 12.5px `--danger` text.

### Cards

bg `--surface`, border `1px solid --line`, radius 18px, shadow `--shadow-soft`, padding 16–20px. Clickable cards get `hover:border-faint/60`.

### Icon buttons / Chips / Status dots

- `.icon-btn`: 36×36px, radius 14px, default `--muted`, hover bg `--elevated`. Touch targets below 36px are not allowed.
- Chip (`.pill`): height **20px**, 11px/500, full radius; default `--elevated` bg + `--line` border + `--muted` text; brand variant `border-brand/20 bg-brand-soft/60 text-brand-ink`; success/danger `token/10` bg + `token` text.
- Status dot (`.status-dot`): 8px circle, `ok / warn / danger / idle` states; the **ok state adds a `ping-soft` outer ring** (1s infinite) to indicate "online".

### Switch

**38×22** pill track, 16px knob + 3px inset, 16px travel; on `--brand` / off `--line`. Transition 150ms.

### Tabs (segmented slot)

`.tabs` = `rounded-xl border-line bg-elevated p-4px` slot; active item `bg-surface text-ink shadow-sm`, inactive `text-muted hover:text-ink`; item padding `6px 14px` / 13px, optional 11px `--faint` count. Bottom nav: 56px tall, active shows a 24×2px brand bar on top + text `--brand-ink`.

### Modal

Dual form: centered on desktop (radius 24px + `shadow-lift`, mask `black/40 + backdrop-blur(2px)`, `z-80`); bottom sheet on mobile (top radius 24px, `drawer-up` 280ms, `safe-bottom`). Default width `max-w-lg` (wide: `max-w-2xl`), max height 90vh, body scrolls independently.

### Toast

**Desktop top-right 24px / mobile centered above the tab bar**, `z-100`, radius 18px, `bg-surface/95 + backdrop-blur` + `shadow-lift`, 13.5px text; error variant border `--danger/0.3`. Auto-dismiss 3.2s success / 5.2s error.

### Empty state

Dashed `--line` border container, radius 18px, vertical padding 56px; 48px icon block (`rounded-2xl bg-brand-soft text-brand`); title 15px/600 `--ink`; optional action button margin-top 14px.

## 7. Navigation (three tiers)

| Tier | Breakpoint | Form |
|---|---|---|
| Sidebar | ≥900px | 252px wide, `--surface/0.6` bg; group labels 11px `--faint`; active = `--brand-soft` bg + 6px dot on the right edge; collapsed shows **logo only** (click logo to expand), 60px wide; toggle button pinned inside the sidebar's top-right (24px round) |
| Top bar | <900px | 48px, brand + badge; hidden at `lg` |
| Bottom tabs | <900px | **Floating pill**: `left/right 16px`, `12px + safe-area` from bottom, 56px tall, 34px radius, `--surface/0.92` glass + full `--line` border + `shadow-lift`; center round FAB (42px, brand shadow); active = `--brand-soft` pill; "More" opens a floating rounded sheet with a drag handle |

The `.shell` wrapper is `100dvh` + `overflow: hidden`; scrolling belongs to inner containers. The sidebar is collapsible, persisted to localStorage.

## 7.1 Mobile table → cards

Below `900px`, `.table` switches to a card list with no JSX changes (column names come from `data-label` attributes):

- `thead` hidden; `tbody tr` becomes a block card: 1px `--line` border + 18px radius + `--surface` bg, 8px row gap
- Each `td` is flex space-between: 11px uppercase `--faint` column name on the left (`td::before { content: attr(data-label) }`), value right-aligned
- First column (primary content) has no label and fills the row; action column (`data-label=" "`) keeps buttons right-aligned
- All list pages (Flows/Tasks/Home/AdminUsers/AdminWebhooks/AdminSettings/AdminOrg) have `data-label` on their cells

## 8. Motion

| Motion | Spec |
|---|---|
| fade-up entrance | 280ms `cubic-bezier(.2,.8,.2,1)`, translateY(6px) → 0 |
| pulse-soft | 1.4s ease-in-out infinite, opacity 1 → 0.35 (running states) |
| ping-soft | 1s infinite (status-dot ok outer ring) |
| hover transition | 150ms, same curve |
| active press | `scale(0.98)` |
| sheet slide-up | 280ms translateY(48px) + fade |
| FAB plus | rotates 90° on hover, 200ms |

Principle: motion explains state changes, never performs. All animations degrade to none under `prefers-reduced-motion: reduce` (global `animation/transition-duration: 0.01ms`).

## 9. Accessibility

- Global `:focus-visible { outline: 2px solid rgb(var(--brand)); outline-offset: 2px }` (buttons included).
- `--faint` contrast 2.76 — decorative only; must-read information uses at least `--muted`.
- Dark-mode primary button (white on brand = 3.67) only at ≥14px semibold.
- Min touch target 36px; key mobile actions ≥40px.
- Modal closes on Esc; icon buttons carry `aria-label`.

## 10. Icons

Uniform stroke SVGs: `stroke: currentColor`, `fill: none`, default `stroke-width: 2` (2.2 when active). Sizes: nav 15px / bottom tabs 20px / drawer 18px. Brand icons (theme sun/moon) carry slow spin/sway animations.

## 11. Breakpoints & Tiers

- `sm` 640px: page title 22 → 26px, padding 16 → 24px
- `lg` 900px: **the only form-factor breakpoint** (<900 mobile form, ≥900 desktop three-column). Lowered from 1024: at Windows 125%/150% scaling a 1024px screen has only 819–911 logical px and would be misdetected as mobile

Content column: `max-width` must be one of 760 / 896 / 1024 / 1100px — no arbitrary values. Choose by content: reading → narrow, lists → medium, charts/grids → wide.

## 12. z-index Tiers

| Layer | Value |
|---|---|
| drawer (sheets / masks) | 70 |
| modal | 80 |
| toast | 100 |

## Deliverables

| File | Description |
|---|---|
| `web/src/styles.css` | The single implementation of all tokens + component styles |
| `docs/styleguide.html` | Interactive component preview (theme switchable) |
| `docs/design-tokens.json` | Machine-readable tokens (for design tools / theme generation) |
| `docs/DESIGN.md` / `docs/DESIGN.en.md` | This spec in Chinese and English |
