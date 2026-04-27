#!/usr/bin/env node
/*
 * mock-scope — pretends to be a Siglent SDS1000X-series oscilloscope so the
 * Scope panel can be developed and tested without real hardware.
 *
 * Usage:
 *   npm run mock-scope
 *   node scripts/mock-scope.js [--port 5025] [--bind 127.0.0.1]
 *
 * Behaviour:
 *   - Listens on a TCP socket exactly like a Siglent network instrument
 *   - Responds to common SCPI commands with sensible canned values
 *   - Measurement queries return values driven by a slowly-drifting sine wave
 *     so the UI shows live, plausible motion
 *   - Logs each received command and the response to stdout
 *
 * Test from the shell:
 *   printf '*IDN?\\n' | nc 127.0.0.1 5025
 *
 * Test from the app:
 *   1) npm run mock-scope     (this script)
 *   2) npm run bridge         (the WS-to-TCP bridge)
 *   3) npm run dev            (the React app)
 *   4) Open the Oscilloscope disclosure, host = 127.0.0.1, port = 5025, Connect
 */

const net = require('net')

const args = parseArgs(process.argv.slice(2))
const PORT = parseInt(args.port || process.env.MOCK_SCOPE_PORT || '5025', 10)
const BIND = args.bind || '127.0.0.1'
const VERBOSE = args.verbose || args.v || false

// --- Simulated instrument state -------------------------------------------
const defaultState = () => ({
  idn: 'Siglent Technologies,SDS1104X-E,SDSMMEBX7R0001,8.4.6.1.31',
  acq: 'STOP',
  trig: { source: 'CH1', mode: 'AUTO', level: 0, slope: 'POS' },
  time: { scale: 1e-3, offset: 0 },
  ch: {
    CH1: { display: true,  scale: 1.0, offset: 0,    coupling: 'DC' },
    CH2: { display: false, scale: 1.0, offset: 0,    coupling: 'DC' },
    CH3: { display: false, scale: 1.0, offset: 0,    coupling: 'DC' },
    CH4: { display: false, scale: 1.0, offset: 0,    coupling: 'DC' },
  },
  wave: { freq: 1000, amplitude: 1.5, dcOffset: 0.2, noise: 0.02 },
})
const state = defaultState()

// Slow drift to make displayed values look alive
setInterval(() => {
  const t = Date.now() / 1000
  state.wave.freq = 1000 + Math.sin(t / 9) * 4 + Math.sin(t / 31) * 1.2
  state.wave.amplitude = 1.5 + Math.sin(t / 7) * 0.04
  state.wave.dcOffset = 0.2 + Math.sin(t / 13) * 0.01
}, 200)

// --- Measurement model ----------------------------------------------------
// Siglent firmware accepts two metric vocabularies; map both to a canonical name.
const METRIC_ALIAS = {
  // modern Siglent SDS1000X-E `:MEAS:SCAL?` mnemonics
  VPP: 'PKPK', VAMP: 'AMPL', VAVG: 'MEAN', VRMS: 'RMS',
  VMAX: 'MAX', VMIN: 'MIN',
  PERIOD: 'PER',
  // already-canonical
  PKPK: 'PKPK', AMPL: 'AMPL', MEAN: 'MEAN', RMS: 'RMS',
  MAX: 'MAX', MIN: 'MIN', FREQ: 'FREQ', PER: 'PER',
}

function measure(channel, metricRaw) {
  const c = state.ch[channel] || state.ch.CH1
  const metric = METRIC_ALIAS[metricRaw] || metricRaw
  const a = state.wave.amplitude
  const dc = state.wave.dcOffset + c.offset
  const n = (Math.random() - 0.5) * state.wave.noise
  switch (metric) {
    case 'PKPK':
    case 'AMPL': return 2 * a + n
    case 'MAX':  return dc + a + n
    case 'MIN':  return dc - a + n
    case 'MEAN': return dc + n * 0.1
    case 'RMS':  return Math.sqrt(dc * dc + (a * a) / 2) + n * 0.05
    case 'FREQ': return state.wave.freq + (Math.random() - 0.5) * 0.5
    case 'PER':  return 1 / state.wave.freq
    default:     return 0
  }
}

// --- SCPI command handler -------------------------------------------------
function handleCmd(raw) {
  const cmd = raw.trim()
  if (!cmd) return null
  const upper = cmd.toUpperCase()
  const isQuery = cmd.endsWith('?')

  // Common 488.2 commands
  if (upper === '*IDN?')   return state.idn
  if (upper === '*RST')    { Object.assign(state, defaultState()); return null }
  if (upper === '*CLS')    return null
  if (upper === '*OPC?')   return '1'
  if (upper === '*ESR?')   return '0'
  if (upper === '*STB?')   return '0'

  // Acquisition
  if (upper === ':RUN' || upper === 'RUN')   { state.acq = 'RUN';  return null }
  if (upper === ':STOP'|| upper === 'STOP')  { state.acq = 'STOP'; return null }
  if (upper === ':AUT' || upper === 'AUT')   return null

  // Channel: :CHANn:DISP|SCAL|OFFS|COUP [val] | ?
  let m
  if ((m = upper.match(/^:CHAN([1-4]):(DISP|SCAL|OFFS|COUP)(\?)?\s*(.*)$/))) {
    const ch = 'CH' + m[1]
    const field = m[2]
    const c = state.ch[ch]
    if (m[3]) {
      if (field === 'DISP') return c.display ? 'ON' : 'OFF'
      if (field === 'SCAL') return c.scale.toExponential(4) + 'E+00'.slice(0,0) // formatted
      if (field === 'OFFS') return c.offset.toExponential(4)
      if (field === 'COUP') return c.coupling
    }
    const val = m[4].trim()
    if (field === 'DISP') c.display = val === 'ON' || val === '1'
    else if (field === 'SCAL') c.scale = parseFloat(val)
    else if (field === 'OFFS') c.offset = parseFloat(val)
    else if (field === 'COUP') c.coupling = val.toUpperCase()
    return null
  }

  // Timebase
  if ((m = upper.match(/^:TIM(?:EBASE)?:(SCAL|OFFS)(\?)?\s*(.*)$/))) {
    const field = m[1]
    if (m[2]) return state.time[field === 'SCAL' ? 'scale' : 'offset'].toExponential(4)
    const v = parseFloat(m[3])
    if (Number.isFinite(v)) {
      if (field === 'SCAL') state.time.scale = v
      else state.time.offset = v
    }
    return null
  }

  // Trigger: :TRIG:EDGE:SOUR|LEV|SLOP, :TRIG:MODE
  if ((m = upper.match(/^:TRIG(?::EDGE)?:(SOUR|LEV|SLOP|MODE)(\?)?\s*(.*)$/))) {
    const field = m[1]
    if (m[2]) {
      if (field === 'SOUR') return state.trig.source
      if (field === 'LEV')  return state.trig.level.toExponential(4)
      if (field === 'SLOP') return state.trig.slope
      if (field === 'MODE') return state.trig.mode
    }
    const val = m[3].trim()
    if (field === 'SOUR') state.trig.source = val.toUpperCase()
    else if (field === 'LEV')  state.trig.level = parseFloat(val)
    else if (field === 'SLOP') state.trig.slope = val.toUpperCase()
    else if (field === 'MODE') state.trig.mode = val.toUpperCase()
    return null
  }

  // Modern measurement: :MEAS:SCAL? CHn, METRIC
  if ((m = upper.match(/^:?MEAS(?:UREMENT)?:SCAL\?\s*(CH[1-4])\s*,\s*([A-Z]+)/))) {
    return measure(m[1], m[2]).toExponential(6)
  }

  // Legacy Siglent SDS form: Cn:PAVA? METRIC
  if ((m = upper.match(/^C([1-4]):PAVA\?\s*([A-Z]+)/))) {
    const ch = 'CH' + m[1]
    const metric = m[2]
    return `C${m[1]}:PAVA ${metric},${measure(ch, metric).toExponential(4)}V`
  }

  // Acquisition state query :TRIG:STAT?
  if (upper === ':TRIG:STAT?') return state.acq === 'RUN' ? 'TRIG' : 'STOP'
  if (upper === ':ACQ:SRAT?')  return '1.000E+09'

  // Generic placeholder: any unhandled query returns "0"
  if (isQuery) return '0'

  // Unhandled command — silently accept (mirrors many real instruments)
  if (VERBOSE) console.log(`[mock-scope]   (unhandled): ${cmd}`)
  return null
}

// --- TCP server -----------------------------------------------------------
const server = net.createServer((sock) => {
  const peer = `${sock.remoteAddress}:${sock.remotePort}`
  console.log(`[mock-scope] client connected: ${peer}`)
  let buf = ''
  sock.on('data', (chunk) => {
    buf += chunk.toString('utf8')
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      if (!line.trim()) continue
      // SCPI compound: command1;command2;... — Siglent rarely uses but supported
      for (const part of line.split(';')) {
        let reply = null
        try { reply = handleCmd(part) }
        catch (e) { console.error(`[mock-scope] handler error: ${e.message}`) }
        if (reply != null) {
          if (VERBOSE) console.log(`[mock-scope] ${part.trim()}  →  ${reply}`)
          sock.write(reply + '\n')
        } else if (VERBOSE) {
          console.log(`[mock-scope] ${part.trim()}  (no reply)`)
        }
      }
    }
  })
  sock.on('close', () => console.log(`[mock-scope] client disconnected: ${peer}`))
  sock.on('error', (err) => {
    if (err.code !== 'ECONNRESET') console.error(`[mock-scope] socket error: ${err.message}`)
  })
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[mock-scope] port ${PORT} is already in use — pass --port <other>`)
  } else {
    console.error(`[mock-scope] server error: ${err.message}`)
  }
  process.exit(1)
})

server.listen(PORT, BIND, () => {
  console.log(`[mock-scope] listening on tcp://${BIND}:${PORT}`)
  console.log('[mock-scope] target:        Siglent SDS1104X-E (simulated)')
  console.log('[mock-scope] try:           printf \'*IDN?\\n\' | nc 127.0.0.1 ' + PORT)
  if (VERBOSE) console.log('[mock-scope] verbose mode on')
})

process.on('SIGINT', () => { console.log('\n[mock-scope] shutting down'); process.exit(0) })

// --- helpers --------------------------------------------------------------
function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--') && a !== '-v') continue
    if (a === '-v') { out.v = true; continue }
    const eq = a.indexOf('=')
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue }
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) { out[key] = next; i++ }
    else out[key] = true
  }
  return out
}
