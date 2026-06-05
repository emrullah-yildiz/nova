# Nova — UI Style Guide

> Authoritative design reference for all agents writing UI, viewer, or CSS code.
> **Always follow this file.** Never invent new colors, fonts, or icon patterns —
> use the tokens and conventions below. If something is genuinely missing, add it
> here in the same branch as the code change.

---

## 1. Design tokens — use the CSS variables

All values live in `style.css` `:root`. **Never hardcode** a value that has a token.
Reference tokens in CSS as `var(--token-name)` and in JS inline styles as
`'var(--token-name)'`.

### Backgrounds (darkest → lightest)

| Token | Value | Use |
|---|---|---|
| `--bg-tertiary` | `#11111b` | Deepest layer — topbar, outermost shell |
| `--bg-secondary` | `#181825` | Panels, sidebars, library |
| `--bg-primary` | `#1e1e2e` | Main canvas / app background |
| `--bg-surface` | `#252538` | Cards, node bodies, inline panels |
| `--bg-surface-hover` | `#2e2e45` | Hover state on interactive surfaces |
| `--bg-surface-active` | `#363652` | Pressed / active state |

### Text

| Token | Value | Use |
|---|---|---|
| `--text-bright` | `#ffffff` | Headings, high-contrast labels |
| `--text-primary` | `#cdd6f4` | Default body text |
| `--text-secondary` | `#a6adc8` | Secondary labels, descriptions |
| `--text-muted` | `#6c7086` | Placeholders, disabled hints |
| `--text-disabled` | `#45475a` | Fully disabled elements |

### Accent (semantic use — don't mix purposes)

| Token | Value | Semantic purpose |
|---|---|---|
| `--accent-blue` | `#89b4fa` | Primary action, focus ring, links |
| `--accent-purple` | `#cba6f7` | Secondary highlight, functions |
| `--accent-green` | `#a6e3a1` | Success, numbers, valid state |
| `--accent-red` | `#f38ba8` | Error, delete, destructive action |
| `--accent-yellow` | `#f9e2af` | Warning, strings |
| `--accent-peach` | `#fab387` | Data / list values |
| `--accent-teal` | `#94e2d5` | Vectors, geometry, mesh |
| `--accent-pink` | `#f5c2e7` | Function / callable type |

**Port / data-type color map** (used by node renderers):

| Data type | Token |
|---|---|
| Number | `--accent-green` |
| String | `--accent-yellow` |
| Boolean | `--accent-red` |
| Point | `--accent-blue` |
| Vector | `--accent-teal` |
| List | `--accent-peach` |
| Function | `--accent-pink` |
| Any | `--text-secondary` |
| RevitElement | `#89dceb` *(hardcode allowed — no token yet)* |

### Borders & shadows

| Token | Value | Use |
|---|---|---|
| `--border-color` | `#313244` | Standard borders |
| `--border-light` | `#45475a` | Lighter/inset borders |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.3)` | Subtle elevation |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | Cards, dropdowns |
| `--shadow-lg` | `0 8px 32px rgba(0,0,0,0.5)` | Modals, overlays |
| `--shadow-glow-blue` | `0 0 20px rgba(137,180,250,0.15)` | Focus / active glow |

### Error states (no token yet — hardcode only where required)

| Value | Use |
|---|---|
| `#f04444` | Error badge background, error border |
| `#ff7b7b` | Error text body |
| `#ff9a9a` | Error text secondary |
| `#d29922` | Warning/caution badge |

---

## 2. Typography

### Font stacks

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
--font-mono: 'JetBrains Mono', 'Fira Code', monospace
```

Use `--font-sans` for all UI text. Use `--font-mono` for code, node values,
data inspector output, and the Python editor.

### Size scale

| Size | Use |
|---|---|
| `13px` | Default UI text — menus, node titles, labels |
| `12px` | Secondary labels, tooltips |
| `11px` | Small/compact labels, help panels, code viewer |
| `12.5px` | Code blocks in learning examples |
| `14px` | Section headers, card titles |
| `17–18px` | Modal/dialog headers |
| `32px` | Landing page hero only |

Avoid arbitrary sizes. If 13px fits, use 13px.

### Weight

| Weight | Use |
|---|---|
| `400` | Default / body |
| `500` | Body text, list items |
| `600` | Secondary headers, card titles |
| `700` | Section headers, buttons, badges |
| `800` | Hero titles only |

### Line-height

- `1.5` – general UI text
- `1.6–1.7` – long reading text (descriptions, docs panels)
- `1.25` – headers
- `1` – single-line buttons, icon labels

---

## 3. Spacing & layout

Nova uses an **8px base grid**. All padding, margin, and gap values must be
multiples of 4px (4, 8, 12, 16, 20, 24, 28, 32…). Use 2px or 6px only for
micro-adjustments where the 8px grid would look wrong.

### Common values by context

| Value | Typical use |
|---|---|
| `4px` | Small gaps between tight elements |
| `8px` | Standard gap — most lists, menu items, icon+label |
| `12px` | Panel internal padding, larger gaps |
| `16px` | Modal/panel side padding |
| `20–24px` | Section padding, dialog padding |
| `32px` | Between major sections |

### Border radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `6px` | Buttons, inputs, chips, small elements |
| `--radius-md` | `10px` | Cards, panels, node bodies |
| `--radius-lg` | `16px` | Modals, large dialogs |
| *(inline)* | `50%` | Circles — avatars, toggle knobs |
| *(inline)* | `999px` | Pills — fully-rounded buttons |

### Transitions

| Token | Value | Use |
|---|---|---|
| `--transition-fast` | `150ms ease` | Hover highlights, small state changes |
| `--transition-normal` | `250ms ease` | Panel open/close, larger animations |

### Fixed layout dimensions

| Token | Value |
|---|---|
| `--lib-width` | `260px` (node library sidebar) |

---

## 4. Icons

All icons are **Unicode glyphs** embedded as plain strings in JS or HTML.
No icon font. No SVG sprite. No image files for icons.

### Rules

1. Icons **must be symbols** — Unicode characters, punctuation, geometric shapes.
   Never use text abbreviations (`ceil`, `max`, `1st`) as icons.
2. Color an icon with the relevant token (e.g. `color: var(--accent-blue)`)
   or inherit from the parent. Never hardcode icon colors outside of the
   data-type port map above.
3. Size icons at `11–14px` — they must not dominate the label text.

### Common icon inventory

| Glyph | Code point | Use |
|---|---|---|
| `⋮` | U+22EE | Node context menu trigger (vertical ellipsis) |
| `◳` | U+25F3 | Opened/expanded element |
| `⊙` | U+2299 | Focused / selected state |
| `⦿` | U+29BF | Highlighted item |
| `⌕` | U+2315 | Search / reveal |
| `●` | U+25CF | Point / filled circle |
| `⫽` | — | Line / segment |
| `⬜` | — | Group / container |
| `✓` | U+2713 | Confirm / done |
| `✕` | U+2715 | Cancel / close |
| `⚙` | U+2699 | Settings / config |
| `✦` | U+2726 | Sparkle / AI action |

For node library icons, the icon string is set per node in the node definition file
(`src/nodes/categories/*.js`). Follow the existing glyph style of the category.

---

## 5. Code syntax highlighting (Python / CodeBlock)

These colors are used inside the code editor only — do not reuse them in general UI.

| Purpose | Value |
|---|---|
| Keywords | `#cba6f7` |
| Built-ins / classes | `#89b4fa` |
| Functions / numbers | `#f9e2af` |
| Strings | `#a6e3a1` |
| Comments | `#6c7086` (italic) |
| Operators / geo keywords | `#89dceb` |
| Booleans / `self` | `#f38ba8` |
| Declarations | `#f5c2e7` |
| Module names | `#94e2d5` |

---

## 6. Writing new styles

1. **Check for a token first.** If a token covers your intent, use it. Never
   add a raw hex that duplicates an existing token.
2. **Add the token if it's missing.** Add it to the `:root` block in `style.css`
   with a comment on its purpose. Update this file in the same commit.
3. **No inline styles for layout.** Padding, margin, gap, and border-radius
   must live in CSS classes. Inline styles are only acceptable for dynamic
   values (e.g., node position on canvas, per-type port color).
4. **Dark theme only.** Nova has one theme. Do not add `@media (prefers-color-scheme: light)` blocks or light-theme overrides.
5. **No `!important`.** Specificity problems are solved with better class structure, not `!important`.
6. **No z-index above 1000 without a comment** explaining the stacking context.

---

## 7. CSS file map

| File | Owns |
|---|---|
| `style.css` | Everything — design tokens, canvas, nodes, panels, modals, toolbar |
| `node-help-panel.css` | Inline help panel that renders inside node inspector |
| `search-popup.css` | Right-click node-search popup |
| `settings.css` | Settings dialog and toggle switches |

All new UI styles go into `style.css` unless they clearly belong to one of the
specialized files above. Do not create additional CSS files without PM approval.
