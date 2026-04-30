# Homelab Electronics Workbench — Plan

> Evolution of `picow_webapp` from a Pico W power/flash console into a single
> pane of glass for an entire networked electronics bench: scope, DMM, PSU,
> e-load, AWG, logic analyzer, RF, environmental sensors, and in-house
> ESP32/Pico instruments. Browser is the UI; Node is the hub; everything else
> talks to it over LAN.

Status: planning doc. Not a commitment to ship every line. Phases are sized so
each lands as its own PR without breaking what already runs.

---

## 1. Where we are (v0.4.0)

The repo already has the right shape — most of the work is **filling in
device drivers** and **adding a second transport** for IOT-class devices.

| Layer | Current implementation | LOC |
|---|---|---|
| Frontend | React 18 + Vite + uplot, components in [src/components](../src/components) | ~2.3k |
| Transport (USB) | [serialService](../src/services/serialService.js) — WebUSB, vendor `0xCAFE`, regex-parses `Voltage: x V` / `Current: y A` | 181 |
| Transport (LAN/SCPI) | [scopeService](../src/services/scopeService.js) → [scpi-bridge](../scripts/scpi-bridge.js) — WebSocket-to-TCP:5025, send/query/binblock, origin-allowlist | 340 + 164 |
| Persistence | [sessions](../src/services/sessions.js) — IndexedDB schema v1 (`sessions`, `samples`, `events`), 500 ms / 200-row batched flush | 349 |
| Observability | [eventBus](../src/services/eventBus.js) — 200-event ring buffer, pub/sub | 50 |
| Automation | [scriptRunner](../src/services/scriptRunner.js) — AsyncFunction sandbox: `ecu / flash / debug / wait / assert / log / scope` | 241 |
| Settings | [settings](../src/services/settings.js) — localStorage helper | 42 |
| Mock | [mock-scope](../scripts/mock-scope.js) — simulated SDS1104X-E for hardware-free dev | 247 |

What's missing for a "complete bench":

1. **The bridge is single-instrument.** `let scope = null` in
   [scpi-bridge.js:98](../scripts/scpi-bridge.js#L98) — only one SCPI device per bridge process.
2. **No driver model.** Each new device type today means a new service file
   and a new component. We need a thin abstraction so DMM / PSU / e-load all
   reuse the SCPI plumbing.
3. **No transport for IOT-class devices.** Smart plugs, environmental
   sensors, MCU heartbeats need MQTT, not request/response over TCP.
4. **No discovery.** Today the user types an IP. mDNS would auto-populate
   the device list for any LXI instrument.
5. **No cross-device correlation.** Each driver timestamps independently;
   the chart layer can't align scope captures to PSU current draw.

---

## 2. Target architecture

Hybrid: keep the Node bridge for stateful instrument protocols, add a tiny
MQTT broker for streaming/IOT, expose both to the browser.

```
                +--------------------- browser (React) ---------------------+
                |  device registry · charts · sessions · scripts · scope    |
                +-----------+----------------------------+------------------+
                            | WebSocket (WS-binary       | MQTT-over-WS
                            |   for waveforms,           | (sensors,
                            |   JSON for control)        |  smart plugs)
        +-------------------v------------+      +--------v---------+
        |       Node bridge              |      |  aedes broker     |
        |  (multi-instrument SCPI hub)   |      |  (embedded in     |
        |  + driver registry             |      |   Node process)   |
        |  + mDNS discovery              |      |                   |
        |  + sigrok sidecar shim         |      |                   |
        +---+--------+--------+----+-----+      +---+----+----+-----+
            |        |        |    |                |    |    |
        +---v--+ +---v---+ +--v-+ +v---+         +--v-+ +v--+ +v----+
        | Scope| | DMM   | | PSU| |Load|         |Plug| |Env| | MCU |
        | TCP  | | TCP   | | TCP| |TCP |         |HTTP| |   | |     |
        | 5025 | | 5025  | | etc|     |         |MQTT| MQTT  MQTT  |
        +------+ +-------+ +----+ +----+         +----+ +---+ +-----+
```

### Why this split

- **Stateful instrument protocols** (SCPI, vendor binary) want a long-lived
  TCP socket per device, query/response with correlation IDs, byte-level
  framing. A direct bridge is right.
- **IOT/sensor protocols** (smart plugs, environmental, MCU pings) want
  pub/sub: late-joining clients get last-known-state from retained messages,
  devices come and go without telling the browser. MQTT is right.
- **One process** runs both — `aedes` is a ~zero-ops Node MQTT broker. No
  external Mosquitto install needed.

### Key technical choices (from research)

| Decision | Choice | Why |
|---|---|---|
| Browser ↔ bridge transport | WebSocket binary frames + JSON envelope | Already in use; binary handles waveforms; metadata-then-payload framing |
| Browser ↔ broker transport | MQTT-over-WS via `mqtt.js` | First-class browser support; pub/sub maps cleanly to sensors |
| Discovery | `bonjour-service` in Node, surfaced via REST `/api/devices` | Browsers can't do mDNS; backend browses, frontend renders |
| Auth (LAN) | None — bind to `127.0.0.1` (current behavior) | Single-user trusted LAN; complexity tax not worth it |
| Auth (remote) | Tailscale + bearer token in localStorage | Skip self-signed certs and port-forwarding |
| Time alignment | Bridge stamps `performance.now()` on every inbound sample | Cross-device drift is hidden; per-device latency calibrated once |
| Hot config | SQLite via `better-sqlite3` (instrument profiles, scripts, calibration) | Migrate from localStorage as state grows |
| Hot capture | NDJSON files during run (existing IndexedDB stays for browser-only sessions) | Crash-tolerant, easy to ship to disk |
| Cold analysis | Parquet on disk, DuckDB read-only | OLAP queries over months of sessions without InfluxDB ops |

### What we explicitly do NOT do

- No VISA library. SCPI over a raw socket is simpler and works for every
  Siglent / Rigol we'll buy.
- No VXI-11. RPC bind is a hassle; every modern instrument exposes 5025.
- No Home Assistant as backend. Workbench data shape is wrong for HA's recorder.
- No gRPC-web. WebSocket binary + a small JSON envelope is enough.
- No TLS on the LAN side. Tailscale handles remote access cleanly.

---

## 3. Device matrix

Selection criteria: **LAN-native** (or trivially wrappable), **published
protocol**, **affordable**, **on shelves in 2026**.

### Tier 1 — recommended starter bench (~$2,550)

| Slot | Pick | Price | Protocol | Notes |
|---|---|---|---|---|
| Scope | **Rigol DHO924S** | ~$1,000 | LXI Core, SCPI:5025 | 12-bit, 250 MHz, 4ch, **AWG built-in** — covers two slots |
| DMM | **Siglent SDM3065X** | ~$650 | LXI, SCPI | 6½-digit; cleanest SCPI in the budget tier |
| PSU | **Siglent SPD3303X-E** | ~$370 | LAN, SCPI | Triple output (2 prog + 1 fixed) |
| E-load | **Siglent SDL1020X-E** | ~$450 | LXI, SCPI | 200 W, 150 V/30 A |
| IOT glue | Pinecil V2 + Shelly Plus Plug S Gen3 + Olimex ESP32-POE-ISO | ~$80 | BLE / MQTT+REST / Wi-Fi+PoE | Networked iron, AC monitor, in-house instrument MCU |

That stack uses **one SCPI driver pattern × 4 instruments**, **MQTT for the
plug**, and **a custom MCU class** for whatever you build on the ESP32.
All four instruments are LAN-native — no USB sidecars in the critical path.

### Tier 2 — opportunistic adds

| Slot | Pick | Price | Notes |
|---|---|---|---|
| Logic analyzer | Saleae Logic Pro 8 ($500) **or** Kingst LA2016 ($90) + sigrok | varies | Saleae has a JSON-RPC automation API on localhost; Kingst needs a sigrok sidecar. No good LAN-native logic analyzer at hobby price. |
| RF | TinySA Ultra ($130) **or** RTL-SDR Blog v4 ($40) | $40–130 | USB; expose via Node sidecar that runs `tinysa` CLI / `rtl_power` |
| RF (real) | Siglent SSA3015X Plus | ~$1,400 | LXI+SCPI; only buy if RF is a real workload |
| Reflow | Controleo3 ($200 + oven) **or** Sonoff TH16+ESPHome | $50–250 | Controleo3 has its own web UI; ESPHome route exposes MQTT |
| Sensors | INA226 / SHT41 / SCD41 modules + ESP32-C3 | ~$15 each | DIY, MQTT-native via ESPHome |

### Tier 3 — gotchas to remember when buying

- Some Siglent/Rigol SKUs ship **without LAN as a paid option** (DP711 LAN
  module is ~$80 extra). Check the SKU suffix.
- Many cheap LAN ports are **100base-T** — fine for control, throttles
  waveform downloads to ~5–8 MB/s. Plan chunked `:WAV:DATA?` reads.
- Rigol DHO uses `:WAV:SOUR` (singular); DS1000Z used `:WAVeform:SOURce`.
  Driver for DHO is **not** a drop-in for DS1000Z.
- Siglent SDS800X HD inherits **most** of the SDS1000X-E SCPI dialect —
  reuse the existing scope driver as a starting point but don't assume
  full compatibility.
- Most cheap PSUs default to DHCP — pin a reservation on the router.

---

## 4. Phased roadmap

Each phase is a standalone deliverable that ships independently. Numbers are
order-of-magnitude effort, not commitments.

### Phase 0 — scaffolding for multi-device (small)

Goal: stop assuming one scope per bridge.

- Refactor `scpi-bridge.js` into a multi-tenant model: a `Map<deviceId, Device>`
  where each entry owns one TCP socket. WS protocol gains a `deviceId` field
  in every op.
- Driver registry pattern in Node: `drivers/scope-siglent.js`,
  `drivers/dmm-siglent.js`, etc. — each exports `{ probe, connect, query, send }`.
- Frontend: `DeviceRegistry` service that lists configured devices,
  active/inactive, last-seen.
- Backwards-compat: existing `scopeService` / `ScopePanel` keep working
  against the new bridge by passing a fixed `deviceId='scope'`.

### Phase 1 — DMM + PSU drivers (small)

Goal: prove the driver model with two new device classes.

- `DmmService` → `MeasureCard` component. Live readings from `:CONF:VOLT:DC`,
  `:READ?`. Settings: function (V/A/Ω), range, NPLC.
- `PsuService` → `PowerSupplyPanel`. Voltage/current set, output enable,
  per-channel readings. Persist last-set values to localStorage so a
  reconnect restores the last configuration.
- New chart series: PSU `Iout` and DMM reading appear alongside the existing
  Pico telemetry in [Charts.jsx](../src/components/Charts.jsx).
- `scriptRunner` API gains `dmm.measure()`, `psu.set()`, `psu.output()`.

### Phase 2 — discovery + device registry (medium)

Goal: make adding a device a one-click operation.

- mDNS browse in Node (`bonjour-service`), advertised types: `_lxi._tcp`,
  `_scpi-raw._tcp`, vendor-specific. Cache results, refresh every 30 s.
- REST endpoints on the bridge: `GET /api/devices` (discovered + configured),
  `POST /api/devices` (manual add), `DELETE /api/devices/:id`.
- Frontend: a Devices panel with "discovered on LAN" and "configured"
  sections, drag-to-add, identity shown via `*IDN?` probe.
- Persist device config to SQLite (`better-sqlite3`) — promotes from
  localStorage so device profiles survive `localStorage.clear()`.

### Phase 3 — IOT/MQTT side (medium)

Goal: light up smart plugs and environmental sensors.

- Embed `aedes` MQTT broker in the bridge process. Listen on `1883` (TCP)
  and `8083` (WS) — both bound to LAN-only.
- Browser uses `mqtt.js` over WS. Add `MqttService` and a `SensorPanel`
  component that subscribes to topic patterns (`sensors/+/temp`, etc).
- Ship one ESPHome reference firmware in `firmware/sensor-template/` so
  users can flash a $5 ESP32-C3 + SHT41 and see it appear immediately.
- Shelly plugs publish via MQTT out-of-the-box; document the topic mapping.

### Phase 4 — e-load + power-circuit test recipes (medium)

Goal: closed-loop power testing.

- `EloadService` driver. Modes: CC, CV, CR, CP. Real-time readback.
- Script API: `eload.setCC(amps)`, `eload.input(true)`. Combined with the
  PSU you can now write recipes like "regulate at 12 V, sweep 0–5 A,
  log Vout droop".
- Add a "test recipe" gallery in [Scripts.jsx](../src/components/Scripts.jsx)
  beyond the current 3 defaults: load-line, efficiency sweep, hold-up time.

### Phase 5 — logic analyzer sidecar (medium)

Goal: integrate the only category without a LAN-native pick.

- Spawn `sigrok-cli` (or Saleae's logic2-automation API) from a Node
  sidecar; expose decoded protocol streams via WS.
- Frontend: timing-diagram view (uplot can do this; lightweight).
- Triggered captures stored as Parquet; DuckDB for "find me every UART
  frame across last week's sessions" queries.

### Phase 6 — cold-storage + analysis (medium)

Goal: analyse months of bench data without IndexedDB OOMs.

- Move closed sessions out of IndexedDB into Parquet files on disk
  (the bridge writes them; the browser fetches via REST).
- DuckDB query endpoint: browser sends SQL, gets back rows. Already-shipped
  uplot charts re-render against returned data.
- Migrate `sessions` IndexedDB stores to "live recording only" — closed
  sessions live on disk.

### Phase 7 — remote access (small)

Goal: bench accessible from outside the LAN without exposing it.

- Document Tailscale install + MagicDNS. Provide a launch script that
  binds the bridge to the Tailscale interface (`tailscale ip -4`) instead
  of `127.0.0.1`.
- Bearer-token auth gated by an env var so token is required only on
  non-loopback binds.

### Phase 8 — RF + reflow (large, opportunistic)

Goal: round out the bench.

- TinySA Ultra and RTL-SDR sidecars (USB, similar pattern to logic analyzer).
- Controleo3 has its own web UI — embed via `<iframe>` or proxy its REST.
- Sonoff TH16 + ESPHome thermocouple becomes "the cheap reflow oven driver".

---

## 5. Driver contract (proposed)

Every device driver — SCPI or MQTT — implements the same shape so the
frontend doesn't care which transport it came from:

```js
// drivers/dmm-siglent-3065.js
export default {
  id: 'dmm-siglent-3065',
  family: 'dmm',                   // scope | dmm | psu | eload | awg | logic | rf | sensor | mcu
  probe: async (sock) => /* *IDN? matches "Siglent.*SDM3065" */,
  connect: async (cfg) => /* return socket+state */,
  disconnect: async (state) => {},
  // Capability surface
  measure: async (state, { fn, range, nplc }) => Number,
  // Streaming surface (optional)
  subscribe: (state, cb) => unsubscribeFn,
  // Calibration / metadata
  capabilities: { fns: ['VDC','VAC','IDC','IAC','RES'], maxNPLC: 100 },
}
```

Frontend `DeviceRegistry` introspects `capabilities` to decide which UI
controls to render. New driver = new file in `drivers/` + frontend autodetects.

---

## 6. Open questions

1. **Do we move the bridge out of `scripts/` into its own package?** Once it
   has SQLite, MQTT, and mDNS, it's no longer "a 340-line dev helper" — it
   becomes a real backend. `bench-bridge/` workspace might be cleaner.
2. **Native app vs. browser-only?** Tauri/Electron would unlock direct TCP,
   USB-CDC, and BLE without a sidecar. Worth re-evaluating after Phase 3.
3. **Multi-user?** Today's auth model is "trust the LAN". If someone wants
   to share a bench across a small team, we need at minimum identity tagging
   on commands so the event log shows "who did what".
4. **Calibration storage?** Each instrument has per-input offsets, current
   shunt values, etc. SQLite table or per-device JSON file?
5. **Firmware-side standardization** — should in-house ESP32/Pico
   instruments converge on a common MQTT topic schema (e.g.
   `bench/{deviceId}/{stream}/{channel}`)? Probably yes — defer until
   Phase 3 lands.

---

## 7. Risks

- **Vendor SCPI drift.** Siglent SDS800X HD is "mostly" SCPI-compatible
  with SDS1000X-E but `:WAV:` differs. Plan: per-model driver subclasses,
  not "one Siglent driver."
- **Browser limits.** WebUSB/Web Serial are Chromium-only. Hobby fine,
  team workflow not. Phase 7 path (Tauri wrapper) is the eventual answer.
- **Cheap-instrument firmware bugs.** Owon/East Tester SCPI replies often
  miss terminators or leak vendor noise. The bridge already bounds
  `MAX_REPLY_BYTES` to 32 MB; keep that pattern.
- **mDNS unreliability.** Cross-VLAN, cross-subnet, or behind certain
  managed switches it just doesn't work. Manual IP entry must always
  remain as a fallback.

---

## 8. What ships next

Phase 0 (multi-device bridge refactor) is the unlock for everything else.
Recommended next PR scope:

- Refactor `scpi-bridge.js` into a `DeviceManager` with `Map<id, Driver>`.
- Lift the existing single-scope code into `drivers/scope-siglent-sds.js`
  unchanged.
- Frontend: `DeviceRegistry` service, no UI changes yet.
- Tests: `mock-scope.js` continues to work; add `mock-dmm.js` to prove
  two devices on the same bridge.

That's a one-PR foundation; Phases 1+ become straightforward driver-and-component
adds afterward.
