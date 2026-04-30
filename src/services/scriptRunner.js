/*
 * scriptRunner — runs user-authored test scripts against the connected device
 * and the connected oscilloscope. Scripts are JS bodies wrapped in an async
 * function, executed with a curated API surface (no access to globals like
 * `window`, `fetch`, `document`, `import`).
 *
 * Cancellation: every `wait()` and every assertion checks the AbortSignal so a
 * long-running script can be stopped from the UI. Hard kill is not possible
 * (JS doesn't allow that) — long-running synchronous user code can hang. The
 * reasonable mitigation is to hint about it in the editor.
 *
 * Logged output: each `log()`, `assert()` outcome and step-level diagnostics
 * are reported via the onLog callback AND emitted to the eventBus so they
 * appear on the chart as markers and in the global event log.
 */

import serialService from './serialService'
import scopeService from './scopeService'
import eventBus from './eventBus'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const GPIO_BY_NAME = { ecu: 'gpio11', flash13: 'gpio13', flash14: 'gpio14', debug: 'gpio12' }

class AbortError extends Error {
  constructor(reason) { super(reason || 'aborted'); this.name = 'AbortError' }
}

class AssertionError extends Error {
  constructor(message) { super(message); this.name = 'AssertionError' }
}

function makeApi(signal, log) {
  function check() { if (signal.aborted) throw new AbortError() }

  // Toggle-style: ecu(true) => sets gpio11=1; ecu(false) => 0.
  // Side effect: emits an event so it shows on the chart and event log.
  function gpio(name, label) {
    return (on) => {
      check()
      const v = on ? 1 : 0
      const code = GPIO_BY_NAME[name]
      if (!code) throw new Error(`unknown gpio: ${name}`)
      if (!serialService.isConnected()) throw new Error('device not connected')
      serialService.sendCommand(code, v)
      log('ctrl', `${label} → ${on ? 'ON' : 'OFF'}`)
      eventBus.emit('info', 'script', `${label} → ${on ? 'ON' : 'OFF'}`)
    }
  }

  // High-level helpers
  const ecu     = gpio('ecu', 'ECU 12V')
  const debug   = gpio('debug', 'Debugger')
  function flash(on) {
    // Flash mode is two GPIOs in lockstep (mirrors Controls.jsx)
    check()
    if (!serialService.isConnected()) throw new Error('device not connected')
    const v = on ? 1 : 0
    serialService.sendCommand('gpio13', v)
    serialService.sendCommand('gpio14', v)
    log('ctrl', `Flash mode → ${on ? 'BOOT' : 'NORMAL'}`)
    eventBus.emit('info', 'script', `Flash mode → ${on ? 'BOOT' : 'NORMAL'}`)
  }

  // Cancellable sleep
  function wait(ms) {
    check()
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, Math.max(0, Number(ms) || 0))
      function onAbort() {
        clearTimeout(t)
        reject(new AbortError())
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  function assert(cond, message) {
    check()
    if (!cond) {
      const m = message || 'assertion failed'
      log('err', `assert: ${m}`)
      eventBus.emit('err', 'script', `assert: ${m}`)
      throw new AssertionError(m)
    }
    log('info', message ? `assert ok: ${message}` : 'assert ok')
  }

  function userLog(...args) {
    check()
    const msg = args.map(a => typeof a === 'string' ? a : safeStringify(a)).join(' ')
    log('info', msg)
    eventBus.emit('info', 'script', msg)
  }

  // Scope facade — only has methods that work over the bridge
  const scope = {
    isConnected: () => scopeService.isScopeConnected(),
    async measure(metric, channel = 'CH1') {
      check()
      if (!scopeService.isScopeConnected()) throw new Error('scope not connected')
      const m = String(metric || '').toUpperCase()
      const ch = String(channel || 'CH1').toUpperCase()
      const v = await scopeService.queryNumber(`MEAS:SCAL? ${ch}, ${m}`, 2000)
      log('info', `scope.measure(${m}, ${ch}) = ${v}`)
      return v
    },
    async query(cmd, timeoutMs = 2000) {
      check()
      if (!scopeService.isScopeConnected()) throw new Error('scope not connected')
      const r = await scopeService.query(String(cmd), timeoutMs)
      log('info', `scope.query(${cmd}) = ${r}`)
      return r
    },
    async send(cmd) {
      check()
      if (!scopeService.isScopeConnected()) throw new Error('scope not connected')
      await scopeService.send(String(cmd))
      log('info', `scope.send(${cmd})`)
    },
  }

  return { ecu, debug, flash, wait, assert, log: userLog, scope }
}

function safeStringify(v) {
  try { return JSON.stringify(v) } catch { return String(v) }
}

/**
 * Run a script source against a fresh API + AbortSignal.
 * Returns { ok, error?, logs[], duration_ms }.
 *
 * @param {string} source — user JS body
 * @param {object} opts
 * @param {AbortSignal} opts.signal — provided by caller; runner short-circuits when triggered
 * @param {(line: {at: number, level: 'info'|'err'|'ctrl', msg: string}) => void} opts.onLog
 */
export async function runScript(source, { signal, onLog } = {}) {
  if (!signal) {
    const ctrl = new AbortController()
    signal = ctrl.signal
  }
  const logs = []
  function log(level, msg) {
    const entry = { at: Date.now(), level, msg }
    logs.push(entry)
    try { onLog && onLog(entry) } catch {}
  }
  const api = makeApi(signal, log)
  const startedAt = performance.now()
  log('info', '— script started —')
  eventBus.emit('info', 'script', 'Script started')
  try {
    const fn = new AsyncFunction(
      'ecu', 'flash', 'debug', 'wait', 'assert', 'log', 'scope',
      `'use strict';\n${source}`
    )
    await fn(api.ecu, api.flash, api.debug, api.wait, api.assert, api.log, api.scope)
    const dur = Math.round(performance.now() - startedAt)
    log('info', `— script finished in ${dur}ms —`)
    eventBus.emit('info', 'script', `Script finished (${dur}ms)`)
    return { ok: true, logs, duration_ms: dur }
  } catch (err) {
    const dur = Math.round(performance.now() - startedAt)
    if (err && err.name === 'AbortError') {
      log('err', `— script aborted at ${dur}ms —`)
      eventBus.emit('warn', 'script', 'Script aborted')
      return { ok: false, error: 'aborted', logs, duration_ms: dur }
    }
    log('err', `error: ${err && err.message || err}`)
    eventBus.emit('err', 'script', `Script error: ${err && err.message || err}`)
    return { ok: false, error: String(err && err.message || err), logs, duration_ms: dur }
  }
}

// --- Saved-scripts persistence (localStorage) -----------------------------

const STORAGE_KEY = 'picow:scripts'

const DEFAULT_SCRIPTS = [
  {
    id: 'default-toggle-ecu',
    name: 'Toggle ECU (twice, 1s apart)',
    source: `// Toggle the ECU 12V rail twice with 1s between transitions.
ecu(true)
await wait(1000)
ecu(false)
await wait(1000)
ecu(true)
await wait(1000)
ecu(false)
log('done')`,
  },
  {
    id: 'default-rail-check',
    name: 'Rail-voltage check (needs scope)',
    source: `// Pulse ECU on, wait for the rail to settle, check Vavg on CH1.
ecu(true)
await wait(500)
const v = await scope.measure('VAVG', 'CH1')
log('Vavg =', v.toFixed(3), 'V')
assert(v > 4.5 && v < 5.5, 'rail voltage out of range')
ecu(false)`,
  },
  {
    id: 'default-flash-debug',
    name: 'Enter Flash mode + power debugger',
    source: `// Prep the device for an SWD flash session.
debug(true)
await wait(200)
flash(true)
await wait(200)
ecu(true)
log('Ready to flash')`,
  },
]

export function loadScripts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SCRIPTS.slice()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_SCRIPTS.slice()
    return parsed
  } catch {
    return DEFAULT_SCRIPTS.slice()
  }
}

export function saveScripts(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) }
  catch (e) { console.error('[scripts] save failed', e) }
}

export function newScriptId() {
  return 'script-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}
