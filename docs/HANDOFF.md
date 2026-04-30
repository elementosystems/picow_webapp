# Handoff Spec — Homelab Workbench POC

A developer-facing contract for the four new routes (Jobs / Inventory / Tools
/ Settings) and the supporting infrastructure (router, stores, theme
additions). Companion docs:

- [HOMELAB_PLAN.md](HOMELAB_PLAN.md) — operator-side roadmap (the *why*)
- [PLAN.md](PLAN.md) — instrumentation-side roadmap (parallel track)

This file is the *what* and *how-it-behaves*: tokens, components, states,
edge cases, and known accessibility gaps.

---

## 1. Overview

Five-route SPA layered on top of the existing v0.4.0 Pico W console. The
Workbench route preserves byte-for-byte the existing telemetry/control
experience; four new routes provide a repair-shop journal, parts
inventory, bench calculators, and data backup. All four new routes are
local-only — persistence is `localStorage` until Phase 2 lands a backend.

**Stack.** React 18 + Vite. Plain CSS with custom properties (no Tailwind).
No state-management lib (custom 100-line `createStore` in
[src/stores/createStore.js](../src/stores/createStore.js)). Hash router (no
React Router) in [src/router/Router.jsx](../src/router/Router.jsx).

---

## 2. Layout

Single-column layout, max-width inherited from the existing `.main`
container. The two-column Job Detail uses `.cols.cols--two` (CSS Grid
`minmax(0, 1fr) minmax(0, 1fr)`) and collapses to single column at
≤880 px. The top nav wraps under the brand row at ≤720 px.

```
┌─ .appbar ───────────────────────────────────────────────────┐
│  brand   │     .appbar__nav (centered)     │  chips, theme  │
├─────────────────────────────────────────────────────────────┤
│ .main → <Page /> dispatched by hash route                   │
│   .page → .page__head + body                                │
└─────────────────────────────────────────────────────────────┘
   .footer
```

---

## 3. Design tokens used

All tokens predate this work; defined in [src/theme.css:10-90](../src/theme.css).
The new code introduces **no new tokens** — only consumes existing ones.

| Token | Value (dark) | Usage in new code |
|---|---|---|
| `--accent` | `#7af6c4` | Primary CTAs, accent text, dot on tracking chip |
| `--accent-strong` | `#4fe2a6` | `.result--big`, `.pill--fixed` text |
| `--accent-soft` | `rgba(122,246,196,.14)` | `.pill--active`, `.chip--active` background |
| `--accent-ring` | `rgba(122,246,196,.35)` | Focus rings, accent-dot glow |
| `--info` | `#5fb8ff` | `.pill--open`, `.link` |
| `--warn` | `#ffb86b` | `.pill--blocked`, `.appbar__navchip`, warn timeline rows |
| `--danger` | `#ff6e7a` | `.pill--scrapped`, `.btn--danger` bg, err timeline rows |
| `--surface-1..3` | `#13161d / #1a1e27 / #232834` | Inputs, hovers, result cards |
| `--text / --text-muted / --text-faint` | `#e8ebf2 / #9ba4b6 / #6b7488` | Body / muted / faint hints |
| `--border / --border-strong` | `#262c39 / #353c4d` | Default / hover borders, active-nav inset shadow |
| `--s-1..9` | `4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64 px` | All spacing |
| `--radius-sm/md/lg/xl/pill` | `6 / 10 / 14 / 20 / 999 px` | All rounding |
| `--font-mono` | `"JetBrains Mono", "SF Mono", ui-monospace, …` | Calculator results, timestamps, qty numbers |
| `--t-fast / --t-med` | `120 ms / 220 ms` | Hover & focus transitions |

Light theme overrides via `[data-theme="light"]`. The visual resistor body
has its own light-theme tweak (`#b89b6a` vs `#d2bd92`).

---

## 4. Components

### 4.1 Navigation

| Component | Variant | API | Notes |
|---|---|---|---|
| `<NavLink>` | default / active | `to`, `exact?`, `query?`, `activeClassName?` | Hash-based `<a>`. Active when `route.path === to` (exact) or `route.path.startsWith(to + '/')`. Cmd / ctrl / shift / middle-click fall through to default browser behavior so middle-click opens new tab. |
| `<ActiveJobChip>` | only renders when a job is tracked | reads `jobsStore.useStore(s => s.activeId && s.items.find(...))` | Click → navigate to `/jobs/:id`. Lives in `.appbar__actions`. |
| `<LowChip>` | only renders when count > 0 | reads `inventoryStore.useStore(s => s.items.filter(isLow).length)` | Inline inside the Inventory `<NavLink>`. |

### 4.2 Page chrome

| Class | Purpose | Spec |
|---|---|---|
| `.page` | Page wrapper | `display: flex; flex-direction: column; gap: var(--s-5)` |
| `.page__head` | Page-level header row | `flex; justify-content: space-between; align-items: flex-start; gap: var(--s-4); flex-wrap: wrap` |
| `.page__title` | h1 | `1.4rem / 700 / -0.01em` letter-spacing |
| `.page__sub` | Subtitle / metadata row | `0.9rem / --text-muted`, accepts inline pills + `.page__sep` separators |
| `.page__actions` | Right-aligned action cluster | `flex; gap: var(--s-2); flex-wrap: wrap` |

### 4.3 Buttons & inputs

`.btn`, `.btn--primary`, `.btn--danger`, `.btn--sm` already exist in
[src/theme.css](../src/theme.css). New code did **not** redefine them.
The new `.input` primitive matches `.field__input`'s shape (36 px tall,
`--surface-1` bg, focus ring uses `--accent-ring`); two modifiers added:

- `.input--area` — auto-height textarea, vertical resize, `min-height: 80px`.
- `.input--inline` — auto-width for inline selects, `min-width: 120px`.

### 4.4 Status indicators

| Class | Color | Use |
|---|---|---|
| `.pill` | `--surface-3 / --text-muted` | Default fallback |
| `.pill--open` | `--info` | Open job |
| `.pill--blocked` | `--warn` | Blocked job |
| `.pill--fixed` | `--accent-strong` | Closed-fixed job |
| `.pill--scrapped` | `--danger` | Closed-scrapped job |
| `.pill--active` | `--accent-strong` | "tracking" indicator |
| `.appbar__navchip` | `--warn-soft` | Inline count chip in nav (e.g. "2 low") |
| `.chip--active` | `--accent-soft` + dot + glow | The header tracking chip |
| `.banner--ok / --err / --warn` | `--accent-soft / --danger-soft / --warn-soft` | Inline messages, e.g. import results |

### 4.5 Form patterns

| Pattern | Spec | Where used |
|---|---|---|
| `.field-card` (click-to-edit) | View mode shows label + value + `edit` link; clicking enters textarea/input + Save/Cancel pair | Job Detail editable fields (`device`, `symptoms`, `notes`) |
| `.form-grid` | `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))` | Calculator inputs, Add/Edit-part forms |
| `.form-grid .field--wide` | `grid-column: 1 / -1` | Notes field that spans the row |
| Inline-row edit | Table `<tr>` swaps for `<tr><td colSpan={6}><PartForm /></td></tr>` while editing | Inventory edit |

### 4.6 Data display

| Pattern | Spec |
|---|---|
| `.timeline` | `<ol>`, max-height `480px`, scrollable. Rows use `grid-template-columns: 80px 100px 1fr` (timestamp / source / message). Reverse-chronological. Cap = 500 entries per job (enforced in store). |
| `.inv__table` | Standard HTML table. `tr.is-low` gets `--warn-soft` row tint. `qty` column is `font-variant-numeric: tabular-nums`. |
| `.result-grid` | Auto-fit grid for calculator results. `.result--big` doubles font size for the headline result. |
| `.resistor` (visual) | Elliptical body via `border-radius: 12px / 50%`. Bands are flex children with `background` set per color from the `RESISTOR_COLORS` lookup. |
| `.photos` | Auto-fill grid `minmax(140px, 1fr)`. Each `.photo` has a delete `×` button at top-right. |

---

## 5. States & interactions

| Element | State | Behavior |
|---|---|---|
| `<NavLink>` | hover | `--surface-2` bg, `--text` color, 120 ms transition |
| `<NavLink>` | active | hover styles + `box-shadow: inset 0 0 0 1px var(--border-strong)` |
| `.btn` | hover | `--surface-3` bg, `--border-strong` border |
| `.btn--primary` | hover | `--accent-strong` bg |
| `.btn--danger` | hover | `filter: brightness(1.08)` |
| `.btn` | focus-visible | `outline: 0; box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent-ring)` |
| `.input` | focus | `border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring)` |
| `.field-card` | view → edit | inline; no animation. Auto-focus on the input is **not** wired (open question §9). |
| `.jobs__row` | hover | `--surface-2` bg, `--border-strong` border. Clickable surface is the entire row (a wrapped `<button>`). |
| `.jobs__row.is-active` | when job is tracked | `border-color: color-mix(in srgb, var(--accent) 50%, var(--border))` |
| Photo upload | success | photo appears in grid; caption input clears |
| Photo upload | file > 1.2 MB | inline `.banner--err`; photo not added |
| Job status `<select>` | change | `updateJob(id, { status: next })`; `closedAt` is set/cleared on transitions to/from `fixed`/`scrapped` |
| Settings import | bad `__format` | `.banner--err` "That doesn't look like a workbench export." |
| Settings import | bad shape (jobs.items not array) | `.banner--err` "Import is malformed: jobs.items / inventory.items must be arrays." |
| Settings import | success | `confirm()` → write to stores → `.banner--ok` |
| Settings reset | click | `confirm()` → wipe both stores → `.banner--ok` |
| Inventory `+ / −` | click | `adjustQty(id, ±1)` (atomic, clamped at 0 in store) |

---

## 6. Responsive behavior

| Breakpoint | Changes |
|---|---|
| Desktop (`> 880px`) | `.cols--two` is two columns; nav inline in appbar |
| `≤ 880px` | `.cols--two` collapses to single column (Jobs detail stacks: fields above timeline) |
| `≤ 720px` | `.appbar` wraps; nav goes onto its own row below brand and chips; nav left-aligns |

The `.form-grid`, `.inv__table` cells, `.photos`, `.result-grid`, and
`.settings__grid` all use `grid-template-columns: repeat(auto-fit,
minmax(...px, 1fr))` so they reflow without explicit breakpoints.

---

## 7. Routes & data contracts

| Route | Component | Reads | Writes via |
|---|---|---|---|
| `/` | `<Workbench>` | unchanged from v0.4.0 | unchanged |
| `/jobs` | `<Jobs>` (list mode) | `jobsStore.useStore(s => ({items, activeId}))` | n/a (read-only) |
| `/jobs/:id` | `<Jobs>` (detail mode, dispatched via `matchPath`) | `jobsStore.useStore(s => s.items.find(j => j.id === id))` | `createJob`, `updateJob`, `deleteJob`, `setActiveJob`, `clearActiveJob`, `addPhoto`, `removePhoto`, `appendTimelineEntry` |
| `/inventory` | `<Inventory>` | `inventoryStore.useStore(s => s.items)` + `route.query.q` | `addPart`, `updatePart`, `deletePart`, `adjustQty` |
| `/tools` | `<Tools>` | none (pure UI over `tools/calculators.js`) | n/a |
| `/settings` | `<Settings>` | both stores | `jobsStore.set`, `inventoryStore.set` (whole-state replace) |

**Cross-cutting:** `startSessionBridge()` in
[src/stores/sessionBridge.js](../src/stores/sessionBridge.js) attaches one
`eventBus.subscribe` listener at app mount. Any event emitted on the
existing eventBus appends to `activeJob.timeline` if `activeId` is set.

---

## 8. Edge cases

| Scenario | Behavior | Where |
|---|---|---|
| **localStorage quota exceeded** | Write silently fails; UI keeps working in-memory until refresh | [createStore.js](../src/stores/createStore.js) `save()` |
| **Photo > 1.2 MB** | Inline `.banner--err`; user picks a smaller file | [Jobs.jsx](../src/pages/Jobs.jsx) `PhotosSection.handleFile` |
| **Timeline > 500 entries** | Older entries dropped from the head | [jobs.js](../src/stores/jobs.js) `appendTimelineEntry` |
| **Import malformed** | Two-tier guard: `__format` magic, then `Array.isArray` shape | [Settings.jsx](../src/pages/Settings.jsx) `handleImport` |
| **Empty job/inventory** | Friendly empty state with copy that suggests next action | `.empty` |
| **Filter returns nothing** | "No jobs match the filter." (vs. "No jobs yet") | Conditional in `JobsList` |
| **Job not found** | "Job not found" page with `← Back to jobs` button | `JobDetail` |
| **Long job titles in `.chip__value`** | `max-width: 22ch; overflow: hidden; text-overflow: ellipsis` | `.chip__value` rule |
| **Unknown route** | `<NotFound>` with `Back to Workbench` button | App.jsx `Page` dispatcher |
| **Persist storm during recording** | 250 ms debounce on `localStorage.setItem` per store; flush on `pagehide` / `visibilitychange` | [createStore.js](../src/stores/createStore.js) |
| **HMR re-attach in dev** | Singleton `started` flag guards eventBus subscription. Old subscriber from prior module instance leaks (acknowledged dev-only). | [sessionBridge.js](../src/stores/sessionBridge.js) |
| **Strict-mode double-effect** | Same singleton flag prevents duplicate timeline rows in dev | same |
| **RC time constant with R=0 or C=0** | `tau=0`, `fc=Infinity`, `fmtSi` returns `'—'` for non-finite | [calculators.js](../src/pages/tools/calculators.js) |
| **Resistor decoder: invalid color combo** | `decodeResistor` returns `null`; UI shows `.banner--warn` | `ResistorDecoder` |
| **Multi-tab inventory race** | `adjustQty` is atomic in the store (read+write inside the updater) | [inventory.js](../src/stores/inventory.js) |

---

## 9. Animation / motion

Conservative — reuses existing `--t-fast` (120 ms) and `--t-med` (220 ms)
for hover/focus transitions. No keyframes added in this work.

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| `.appbar__navitem` | hover | bg + color cross-fade | `--t-fast` (120 ms) | default `var(--ease)` |
| `.input`, `.btn`, `.field-card` | hover, focus | border-color + box-shadow cross-fade | `--t-fast` | default |
| `.jobs__row` | hover | bg + border-color cross-fade | `--t-fast` | default |

**No motion** on route change, modal open, or photo add. If we add Framer
Motion or CSS `view-transition-name` later, the `<Page />` dispatcher in
App.jsx is the natural seam.

---

## 10. Accessibility

- **Tab order** flows naturally: brand → nav items → tracking chip → theme toggle → page header (h1, then action cluster) → page body (top-down, left-to-right).
- **Focus ring** is a 2 px + 2 px stacked `box-shadow` against `--bg` so it stays visible on every surface tier.
- **All buttons are real `<button>` elements** (no `<div role="button">`). Nav items are real `<a href="#/...">`.
- **Image alt text**: photos use `alt={p.caption || 'job photo'}`. Caption is user-supplied; React escapes attributes — no XSS surface.
- **Native `<select>` for status change**: keyboard-friendly. Visually ambiguous with adjacent buttons (see §10.1 below).
- **Native `confirm()` for destructive ops** (delete job, delete part, reset, import). Keyboard-accessible by default.

### 10.1 Known accessibility gaps

Verified by inspecting computed styles in a live preview at desktop width.

| # | Issue | Location | Severity | Recommended fix |
|---|---|---|---|---|
| 1 | `.btn--danger` contrast **2.71 : 1** (white on `#ff6e7a`) | All Delete / Reset buttons | 🔴 WCAG AA fail | Set `color: var(--text-on-accent)` (dark) instead of `#fff`, OR darken `--danger` |
| 2 | `.field__label` **4.15 : 1** at 11.2 px | All form labels | ⚠️ Marginal AA fail for small text | Bump to `--text-muted` (`#9ba4b6`, ~7.75 : 1) |
| 3 | `.timeline__time` **4.15 : 1** at 13.12 px | Job detail timeline | ⚠️ Marginal | Same as above, or treat as auxiliary info and accept |
| 4 | Nav-item touch target **33 px** | Mobile breakpoint | ⚠️ Below 44 px | Add `min-height: 44px` inside the `≤ 720px` media query |
| 5 | Field-card "edit" link **11 px** | Job detail editable fields | ⚠️ Hard to hit on touch | Make whole `.field-card` clickable when not editing |
| 6 | Status `<select>` looks like a button | Job detail action row | 🟡 Visual | Add chevron suffix or "Status:" label prefix |
| 7 | Timeline timestamp column wraps "11:34:09 PM" onto two lines | Job detail timeline | 🟡 Visual | Bump grid column from `80px` → `96px`, or drop AM/PM (24-hour) |
| 8 | Inventory `−` button stays active at qty 0 | Inventory rows | 🟢 Minor | Set `disabled` when `p.qty === 0` |

---

## 11. Open questions for the next implementer

1. **Auto-focus on click-to-edit**: should the input grab focus when entering edit mode? (One `useEffect` away.)
2. **Markdown in `notes`**: today it's `white-space: pre-wrap` plain text. Adding markdown rendering means picking a sanitizer.
3. **Search debouncing in Inventory**: currently writes hash on every keystroke. 150 ms debounce would be one `useDebouncedValue` away.
4. **BoM section on Job detail**: `bom: []` exists in the store shape but no UI. Phase 1 polish item.
5. **Status flow guards**: today any status → any status is allowed. A real shop might want "must be Open before Fixed." Trivial guard.
