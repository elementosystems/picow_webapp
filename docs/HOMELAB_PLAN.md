# Homelab Workbench — Plan

> Operator-side companion to [docs/PLAN.md](PLAN.md). That doc is the
> instrumentation hub (multi-tenant SCPI bridge, MQTT for IOT, drivers for
> scope/DMM/PSU/eload). This doc is the **bench journal** — Jobs, Inventory,
> Tools, Settings — the things a human uses while repairing a device.
>
> They share the same shell (`<App>` + nav + theme) and the same data path
> (eventBus → active job timeline). Either side can ship without blocking
> the other.

## 1. Why this shape

The repo started as a single-purpose tool: connect Pico W, toggle a couple
of GPIOs, watch a chart. v0.4.0 added Sessions and Scripts and a Scope
panel — already two products in a trenchcoat. The next step is either to
keep adding panels under the same root and watch the page grow until it's
unusable, or to give it a navigation skeleton and let each surface evolve
independently.

This plan picks the second. The Workbench page **doesn't change** — it is
now exactly one route. New surfaces (Jobs, Inventory, Tools, Settings) get
their own routes and their own stores.

## 2. Scope split — what goes where

| Concern | Lives in | Notes |
|---|---|---|
| Real-time control of devices on the bench | `Workbench` page (existing) | Untouched. Keeps WebUSB / scope bridge behaviors. |
| The repair journal (one entry per device) | `Jobs` page + `jobsStore` | Free-form notes, photos, status, timeline of bench events. |
| Bench parts inventory | `Inventory` page + `inventoryStore` | Qty, low-at threshold, location. |
| Quick math (Ohm, divider, LED, decoder, RC) | `Tools` page + `tools/calculators.js` | Pure functions; UI is a thin shell. |
| Backups, reset, future backend config | `Settings` page | JSON export/import; reset. |

Cross-cutting:

- **Active job + timeline.** Exactly one job can be "tracked" at a time.
  When tracking is on, every event the existing `eventBus` emits also
  appends to that job's timeline. The bridge for this is the only place
  the homelab work touches the existing services and it does so as a
  **consumer** — no new emit points in any existing component.
- **Theme + brand.** Reused. The new pages use existing tokens
  (`--s-1..9`, `--accent`, `--surface-1..3`) and add primitives
  (`.input`, `.banner`, `.pill`, `.chip`, `.page`, etc.) at the end of
  `theme.css`.

## 3. Data layout (POC: localStorage)

Two stores, each `{__v:1, data:<state>}` in localStorage.

```
picow:jobs       — { items: [Job], activeId: string|null }
picow:inventory  — { items: [Part] }
```

`Job`:
```js
{ id, title, device, symptoms, status, createdAt, updatedAt, closedAt,
  notes, timeline: [{id, ts, level, source, message}], photos: [...], bom: [] }
```
`Part`:
```js
{ id, name, category, qty, lowAt, location, notes, createdAt, updatedAt }
```

**Caps.** Timeline is bounded at 500 entries per job; photos are guarded at
1.2 MB each in the page (localStorage caps near 5 MB total). Both move to
the backend when it lands.

## 4. Architecture

```
browser SPA
 ├─ src/main.jsx
 ├─ src/App.jsx                — nav + route dispatch
 ├─ src/router/Router.jsx      — hash router (~80 LOC, no deps)
 ├─ src/stores/
 │   ├─ createStore.js         — get/set/subscribe + selector hook
 │   ├─ jobs.js                — repair journal store + named mutators
 │   ├─ inventory.js           — parts store + named mutators
 │   ├─ sessionBridge.js       — eventBus → active job (consumer only)
 │   └─ index.js               — re-exports
 ├─ src/pages/
 │   ├─ Workbench.jsx          — verbatim rehousing of v0.4.0 body
 │   ├─ Jobs.jsx               — list + detail
 │   ├─ Inventory.jsx          — CRUD table
 │   ├─ Tools.jsx              — calculator UI
 │   ├─ tools/calculators.js   — pure math (unit-test target)
 │   └─ Settings.jsx           — export/import/reset
 ├─ src/services/              — existing, untouched
 └─ src/components/            — existing, untouched
```

The `services/` and `components/` directories were not modified except
for `App.jsx` (nav + dispatcher) and `theme.css` (additive, end-of-file).

## 5. Roadmap

### Phase 1 — POC polish (what already shipped here)

- [x] Router, stores, pages, sync-from-main script.
- [x] `eventBus → activeJob.timeline` bridge — no upstream changes.
- [x] CSS additions, all using existing tokens, with the smallest
  possible override (`.appbar__brand { flex: 0 1 auto }`) to make room
  for the new nav.
- [ ] Threshold breaches in `Charts` already detect via `isBreach`. Add
  a single rising-edge `eventBus.emit('warn', 'charts', …)` and they
  appear in the active job's timeline automatically — the bridge is
  already wired.
- [ ] Wire v0.4.0 sessions: when a recording is saved, if a job is
  active, attach a reference (`attachSessionToJob(id, sessionId, meta)`).
- [ ] Inventory deep-link query is read on mount (`#/inventory?q=cap`).
  Today the page reads it; we still need to write it back as the user
  types (one-line change).

### Phase 2 — backend

- Add `server/` with Fastify + `better-sqlite3`. Migrations directory.
  One bound-port image.
- Replace each store's localStorage call with an `apiClient` call.
  **Exported function names don't change** — pages don't notice.
  localStorage stays as offline cache.
- Asset store at `/var/picow/assets`, content-addressed by sha256,
  Docker volume. Photo `dataUrl` becomes `url` on the wire — schema
  shape was forward-compatible from the start.
- Generic instrument bridge: `scpi-bridge.js` extends with an
  instrument-type field, `scopeService` becomes one of N services,
  all sharing the bridge protocol.
- Cross-link with [docs/PLAN.md](PLAN.md) Phase 0 — that's the same
  bridge refactor; do it once.

### Phase 3 — stable

- Vitest + Playwright. The pure functions in `tools/calculators.js`
  and the store mutators are first targets — they cover most of the
  new logic without a DOM.
- OpenAPI for the backend, generated client into `src/api/`.
- Single Docker image hosting SPA + API + bridges. The existing
  multi-arch CI doesn't change beyond the `COPY` source.

## 6. Trade-offs explicitly accepted

| Decision | Cost | Why |
|---|---|---|
| localStorage instead of backend | Per-browser, ~5 MB cap | POC must run with `npm run dev` alone; backend is Phase 2 |
| Custom 80-line router | Re-invents some of React Router | Zero deps, hash routing works under existing nginx, easy to swap |
| Custom 100-line store helper | Re-invents some of Zustand | Same reasoning; we own the API surface |
| Photos as data URLs in localStorage | Bloats stored state, 1.2 MB cap | Only way pre-backend; data shape is forward-compatible |
| One file per page (Jobs.jsx ≈ 400 LOC) | Bigger files | Components are tightly coupled; splitting is premature |
| `useRoute` re-renders the whole `<App>` on hash change | Whole tree reconciles | App is small; pages mount/unmount cleanly |
| No tests in POC | Regressions invisible | Phase 3 adds them; calculators are pure so unit tests will be trivial |

## 7. Sync workflow

`scripts/sync-from-main.sh`:
1. fetch `origin/main` (with retry/backoff)
2. if local branch ⊇ `origin/main` → "already up to date"
3. else default `git merge --no-ff` (visible "absorbed main" commit)
4. `--rebase` flag opts into rewriting history when that's cleaner

Default merge over rebase keeps a long-lived planning branch's history
honest in PR view: each main-sync becomes a distinct first-parent commit.

## 8. Files at a glance

```
src/router/Router.jsx              hash router
src/stores/createStore.js          store helper
src/stores/jobs.js                 jobs domain
src/stores/inventory.js            inventory domain
src/stores/sessionBridge.js        eventBus → jobs (consumer only)
src/stores/index.js                re-exports
src/pages/Workbench.jsx            v0.4.0 body, untouched in spirit
src/pages/Jobs.jsx                 list + detail
src/pages/Inventory.jsx            CRUD table
src/pages/Tools.jsx                calculator UI
src/pages/tools/calculators.js     pure math
src/pages/Settings.jsx             export / import / reset
src/App.jsx                        nav + dispatch (modified, not replaced)
src/theme.css                      additive end-of-file styles
scripts/sync-from-main.sh          fetch + merge / rebase helper
docs/HOMELAB_PLAN.md               this file
```
