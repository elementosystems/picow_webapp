// Browser client for scripts/scpi-bridge.js — talks to a Siglent (or any
// SCPI-1999 / IEEE-488.2) instrument over a localhost WebSocket bridge.

const DEFAULT_BRIDGE = 'ws://127.0.0.1:8765/ws'

class ScopeService {
  constructor() {
    this.ws = null
    this.bridgeUrl = DEFAULT_BRIDGE
    this.scopeConnected = false
    this.host = ''
    this.port = 5025
    this.idn = ''
    this.pending = new Map()
    this.nextId = 1
    this.statusListeners = new Set()
  }

  setBridgeUrl(url) {
    if (url) this.bridgeUrl = url
  }

  isBridgeOpen() {
    return !!(this.ws && this.ws.readyState === WebSocket.OPEN)
  }

  isScopeConnected() {
    return this.scopeConnected
  }

  onStatus(cb) {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  _notify(s) {
    for (const cb of this.statusListeners) {
      try { cb(s) } catch {}
    }
  }

  async openBridge() {
    if (this.isBridgeOpen()) return
    return new Promise((resolve, reject) => {
      let settled = false
      const ws = new WebSocket(this.bridgeUrl)
      ws.onopen = () => {
        settled = true
        this.ws = ws
        this._notify({ kind: 'bridge', state: 'open' })
        resolve()
      }
      ws.onerror = () => {
        if (!settled) {
          settled = true
          reject(new Error('bridge unreachable — start it with `npm run bridge`'))
        }
        this._notify({ kind: 'bridge', state: 'error' })
      }
      ws.onclose = () => {
        this.ws = null
        this.scopeConnected = false
        for (const [, p] of this.pending) p.reject(new Error('bridge closed'))
        this.pending.clear()
        this._notify({ kind: 'bridge', state: 'closed' })
      }
      ws.onmessage = (ev) => this._onMessage(ev.data)
    })
  }

  closeBridge() {
    if (this.ws) {
      try { this.ws.close() } catch {}
    }
  }

  _onMessage(raw) {
    let msg
    try { msg = JSON.parse(raw) } catch { return }
    if (msg.event === 'status') {
      if (msg.state === 'connected') {
        this.scopeConnected = true
      } else {
        this.scopeConnected = false
      }
      this._notify({ kind: 'scope', state: msg.state, detail: msg.detail })
      return
    }
    if (msg.id != null && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id)
      this.pending.delete(msg.id)
      if (msg.ok) resolve(msg)
      else reject(new Error(msg.error || 'bridge error'))
    }
  }

  _send(payload) {
    return new Promise((resolve, reject) => {
      if (!this.isBridgeOpen()) {
        reject(new Error('bridge not open'))
        return
      }
      const id = String(this.nextId++)
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, ...payload }))
    })
  }

  async ping() {
    const r = await this._send({ op: 'ping' })
    return r.data
  }

  async connectScope(host, port = 5025) {
    if (!this.isBridgeOpen()) await this.openBridge()
    this.host = String(host).trim()
    this.port = port
    await this._send({ op: 'connect', host: this.host, port })
    // After connect, fetch IDN immediately for UI feedback. If the IDN query
    // fails (timeout, malformed reply) we tear the TCP socket down so the
    // bridge state and the client state stay in sync — otherwise the scope
    // remains connected on the bridge while the UI shows "error".
    try {
      const idn = await this.query('*IDN?', 3000)
      this.idn = idn || ''
      return idn
    } catch (e) {
      this.idn = ''
      try { await this._send({ op: 'disconnect' }) } catch {}
      this.scopeConnected = false
      throw e
    }
  }

  async disconnectScope() {
    if (!this.isBridgeOpen()) return
    try { await this._send({ op: 'disconnect' }) } catch {}
    this.scopeConnected = false
    this.idn = ''
  }

  async send(cmd) {
    await this._send({ op: 'send', cmd })
  }

  async query(cmd, timeoutMs) {
    const r = await this._send({ op: 'query', cmd, timeoutMs })
    return r.data
  }

  async queryNumber(cmd, timeoutMs) {
    const text = await this.query(cmd, timeoutMs)
    const n = parseFloat(text)
    return Number.isFinite(n) ? n : NaN
  }

  async binblock(cmd, timeoutMs) {
    const r = await this._send({ op: 'binblock', cmd, timeoutMs })
    return { base64: r.data, bytes: r.bytes }
  }
}

const scopeService = new ScopeService()
export default scopeService
