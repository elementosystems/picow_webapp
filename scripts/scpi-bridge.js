#!/usr/bin/env node
/*
 * scpi-bridge — translate browser WebSocket calls into raw SCPI over TCP:5025
 * for Siglent / SCPI-1999 / IEEE-488.2 compatible network instruments.
 *
 * Usage:
 *   npm run bridge
 *   node scripts/scpi-bridge.js [--port 8765] [--bind 127.0.0.1]
 *
 * Wire protocol (JSON over WS):
 *   client → server
 *     { id, op: 'ping' }
 *     { id, op: 'connect',    host, port?: 5025 }
 *     { id, op: 'disconnect' }
 *     { id, op: 'send',       cmd: ':RUN' }
 *     { id, op: 'query',      cmd: '*IDN?',         timeoutMs?: 2500 }
 *     { id, op: 'binblock',   cmd: ':DISP:DATA? BMP', timeoutMs?: 8000 }
 *
 *   server → client
 *     { id, ok: true,  data?: any, encoding?: 'base64', bytes?: number }
 *     { id, ok: false, error: '...' }
 *     { event: 'status', state: 'connected'|'disconnected'|'error', detail }
 *
 * The bridge binds to localhost by default — no external network exposure.
 */

const net = require('net')
const http = require('http')

let WebSocketServer
try {
  WebSocketServer = require('ws').WebSocketServer
} catch (e) {
  console.error('[bridge] missing dependency: ws')
  console.error('[bridge] run: npm install   (ws is in devDependencies)')
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
const PORT = parseInt(args.port || process.env.SCPI_BRIDGE_PORT || '8765', 10)
const BIND = args.bind || '127.0.0.1'

// Maximum bytes we'll buffer for a single in-flight reply before aborting.
// Protects against unterminated text replies and malformed binary blocks.
const MAX_REPLY_BYTES = 32 * 1024 * 1024  // 32 MB

// SECURITY: only accept WebSocket upgrades from origins on this allowlist.
// Without this, any malicious page open in the user's browser could use the
// bridge as an SSRF gateway to arbitrary host:port the script picks. Empty
// `Origin` is allowed (CLI tools, curl) since the bridge already binds 127.0.0.1.
const ALLOWED_ORIGIN_HOSTS = new Set([
  '127.0.0.1', 'localhost', '[::1]', '0.0.0.0',
])
function isOriginAllowed(originHeader) {
  if (!originHeader) return true  // no Origin header (non-browser)
  // CLI envs sometimes send literal "null"
  if (originHeader === 'null') return true
  try {
    const u = new URL(originHeader)
    if (u.protocol === 'file:') return true
    return ALLOWED_ORIGIN_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    if (!isOriginAllowed(req.headers.origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'origin not allowed' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'scpi-bridge', port: PORT }))
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws',
  verifyClient: (info, done) => {
    const origin = info.req.headers.origin
    if (!isOriginAllowed(origin)) {
      console.warn(`[bridge] rejected upgrade from origin: ${origin}`)
      done(false, 403, 'origin not allowed')
      return
    }
    done(true)
  },
})

wss.on('connection', (ws, req) => {
  console.log(`[bridge] client connected from ${req.socket.remoteAddress}`)
  let scope = null            // net.Socket | null
  let buffer = Buffer.alloc(0)
  let pending = null          // { id, isBin, timer }

  function send(obj) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(obj)) } catch {}
    }
  }

  function emitStatus(state, detail) {
    send({ event: 'status', state, detail: detail ?? null })
  }

  function abortPending(err) {
    if (!pending) return
    clearTimeout(pending.timer)
    send({ id: pending.id, ok: false, error: err.message || String(err) })
    pending = null
    buffer = Buffer.alloc(0)
  }

  function teardownScope(reason) {
    if (scope) {
      scope.removeAllListeners('data')
      scope.removeAllListeners('error')
      scope.removeAllListeners('close')
      try { scope.destroy() } catch {}
      scope = null
    }
    abortPending(new Error(reason || 'disconnected'))
    emitStatus('disconnected', reason)
  }

  function parseBinBlock(buf) {
    if (buf.length < 2 || buf[0] !== 0x23) return null  // '#'
    const numDigits = parseInt(String.fromCharCode(buf[1]), 10)
    if (!Number.isFinite(numDigits) || numDigits <= 0) return null
    if (buf.length < 2 + numDigits) return null
    const lenStr = buf.slice(2, 2 + numDigits).toString('ascii')
    const len = parseInt(lenStr, 10)
    if (!Number.isFinite(len) || len < 0) return null
    const headerSize = 2 + numDigits
    if (buf.length < headerSize + len) return null
    return { headerSize, len, data: buf.slice(headerSize, headerSize + len) }
  }

  function handleData(chunk) {
    buffer = Buffer.concat([buffer, chunk])
    // Bound the in-flight buffer. Either we got an unterminated text reply
    // (no '\n') or a malformed/oversized binblock — abort instead of consuming
    // unbounded memory.
    if (buffer.length > MAX_REPLY_BYTES) {
      abortPending(new Error(`reply exceeded ${MAX_REPLY_BYTES} bytes`))
      return
    }
    if (!pending) return
    if (pending.isBin) {
      const blk = parseBinBlock(buffer)
      if (!blk) return
      const { id } = pending
      clearTimeout(pending.timer)
      pending = null
      const data = blk.data.toString('base64')
      buffer = buffer.slice(blk.headerSize + blk.len)
      while (buffer.length && (buffer[0] === 0x0a || buffer[0] === 0x0d)) buffer = buffer.slice(1)
      send({ id, ok: true, data, encoding: 'base64', bytes: blk.len })
    } else {
      const nl = buffer.indexOf(0x0a)
      if (nl < 0) return
      const line = buffer.slice(0, nl).toString('utf8').replace(/\r$/, '')
      buffer = buffer.slice(nl + 1)
      const { id } = pending
      clearTimeout(pending.timer)
      pending = null
      send({ id, ok: true, data: line })
    }
  }

  function setPending(id, isBin, timeoutMs) {
    if (pending) {
      send({ id, ok: false, error: 'busy: previous command still in flight' })
      return false
    }
    pending = {
      id,
      isBin,
      timer: setTimeout(() => abortPending(new Error('timeout')), timeoutMs || 2500),
    }
    return true
  }

  function writeCmd(cmd) {
    if (!scope) return false
    return scope.write(cmd.endsWith('\n') ? cmd : cmd + '\n', 'utf8')
  }

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) }
    catch { send({ ok: false, error: 'invalid json' }); return }
    const { id, op } = msg

    switch (op) {
      case 'ping':
        send({ id, ok: true, data: 'pong', scopeConnected: !!scope })
        return

      case 'connect': {
        if (scope) teardownScope('reconnecting')
        const host = String(msg.host || '').trim()
        const port = parseInt(msg.port || 5025, 10)
        if (!host) return send({ id, ok: false, error: 'host required' })
        if (!Number.isFinite(port) || port <= 0 || port > 65535) {
          return send({ id, ok: false, error: 'invalid port' })
        }
        let settled = false
        const sock = net.connect({ host, port })
        sock.setKeepAlive(true, 5000)
        sock.setTimeout(0)
        const onError = (err) => {
          if (!settled) {
            settled = true
            send({ id, ok: false, error: 'connect failed: ' + err.message })
          } else {
            emitStatus('error', err.message)
          }
        }
        sock.once('connect', () => {
          settled = true
          scope = sock
          buffer = Buffer.alloc(0)
          send({ id, ok: true })
          emitStatus('connected', { host, port })
        })
        sock.on('data', handleData)
        sock.on('error', onError)
        sock.on('close', () => teardownScope('socket closed'))
        return
      }

      case 'disconnect':
        teardownScope('client request')
        send({ id, ok: true })
        return

      case 'send':
        if (!scope) return send({ id, ok: false, error: 'not connected' })
        if (!msg.cmd) return send({ id, ok: false, error: 'cmd required' })
        writeCmd(String(msg.cmd))
        send({ id, ok: true })
        return

      case 'query':
        if (!scope) return send({ id, ok: false, error: 'not connected' })
        if (!msg.cmd) return send({ id, ok: false, error: 'cmd required' })
        if (!setPending(id, false, msg.timeoutMs)) return
        writeCmd(String(msg.cmd))
        return

      case 'binblock':
        if (!scope) return send({ id, ok: false, error: 'not connected' })
        if (!msg.cmd) return send({ id, ok: false, error: 'cmd required' })
        if (!setPending(id, true, msg.timeoutMs || 8000)) return
        writeCmd(String(msg.cmd))
        return

      default:
        send({ id, ok: false, error: 'unknown op: ' + op })
    }
  })

  ws.on('close', () => {
    console.log('[bridge] client disconnected')
    teardownScope('ws closed')
  })

  emitStatus('disconnected', 'idle')
})

httpServer.listen(PORT, BIND, () => {
  console.log(`[bridge] scpi-bridge listening on ws://${BIND}:${PORT}/ws`)
  console.log(`[bridge] health: http://${BIND}:${PORT}/health`)
  console.log('[bridge] target instruments: Siglent / SCPI-1999 over TCP:5025')
})

process.on('SIGINT', () => { console.log('\n[bridge] shutting down'); process.exit(0) })

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue }
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) { out[key] = next; i++ }
    else out[key] = true
  }
  return out
}
