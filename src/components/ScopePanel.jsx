import React, { useEffect, useRef, useState } from 'react'
import scopeService from '../services/scopeService'
import { Icon } from './Icons'

const LS = {
  bridgeUrl: 'picow:scope:bridgeUrl',
  host: 'picow:scope:host',
  port: 'picow:scope:port',
  metrics: 'picow:scope:metrics',
  pollMs: 'picow:scope:pollMs',
  metricChannel: 'picow:scope:metricChannel',
}

function loadLs(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch { return fallback }
}
function saveLs(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

const MEASUREMENTS = [
  { id: 'PKPK', modern: 'VPP',  legacy: 'PKPK', label: 'V pp',   unit: 'V',  precision: 4 },
  { id: 'MEAN', modern: 'VAVG', legacy: 'MEAN', label: 'V avg',  unit: 'V',  precision: 4 },
  { id: 'RMS',  modern: 'VRMS', legacy: 'RMS',  label: 'V rms',  unit: 'V',  precision: 4 },
  { id: 'AMPL', modern: 'VAMP', legacy: 'AMPL', label: 'V amp',  unit: 'V',  precision: 4 },
  { id: 'MAX',  modern: 'VMAX', legacy: 'MAX',  label: 'V max',  unit: 'V',  precision: 4 },
  { id: 'MIN',  modern: 'VMIN', legacy: 'MIN',  label: 'V min',  unit: 'V',  precision: 4 },
  { id: 'FREQ', modern: 'FREQ', legacy: 'FREQ', label: 'Freq',   unit: 'Hz', precision: 3 },
  { id: 'PER',  modern: 'PER',  legacy: 'PER',  label: 'Period', unit: 's',  precision: 6 },
]

const CHANNELS = ['CH1', 'CH2', 'CH3', 'CH4']
const COUPLINGS = ['DC', 'AC', 'GND']
const TRIG_MODES = ['AUTO', 'NORM']

const LOG_BUFFER_CAP = 50000

function fmtNum(v, digits = 3) {
  if (v == null || Number.isNaN(v)) return '—'
  if (Math.abs(v) >= 1e6 || (Math.abs(v) > 0 && Math.abs(v) < 1e-3)) {
    return Number(v).toExponential(Math.max(2, digits - 1))
  }
  return Number(v).toFixed(digits)
}
function isValidIPv4(s) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s)
    && s.split('.').every((part) => { const n = parseInt(part, 10); return n >= 0 && n <= 255 })
}

export default function ScopePanel() {
  const [bridgeOpen, setBridgeOpen] = useState(scopeService.isBridgeOpen())
  const [scopeConnected, setScopeConnected] = useState(scopeService.isScopeConnected())
  const [phase, setPhase] = useState('idle')
  const [errMsg, setErrMsg] = useState('')
  const [idn, setIdn] = useState('')
  const [bridgeUrl, setBridgeUrl] = useState(loadLs(LS.bridgeUrl, 'ws://127.0.0.1:8765/ws'))

  const [host, setHost] = useState(loadLs(LS.host, '192.168.1.50'))
  const [port, setPort] = useState(loadLs(LS.port, 5025))

  const [chSel, setChSel] = useState('CH1')
  const [chDisp, setChDisp] = useState(true)
  const [chScale, setChScale] = useState(1.0)
  const [chOffset, setChOffset] = useState(0)
  const [chCoup, setChCoup] = useState('DC')
  const [tScale, setTScale] = useState(1e-3)
  const [tOffset, setTOffset] = useState(0)
  const [trigSrc, setTrigSrc] = useState('CH1')
  const [trigMode, setTrigMode] = useState('AUTO')
  const [trigLevel, setTrigLevel] = useState(0)

  const [enabledMetrics, setEnabledMetrics] = useState(loadLs(LS.metrics, ['PKPK', 'MEAN', 'FREQ']))
  const [metricChannel, setMetricChannel] = useState(loadLs(LS.metricChannel, 'CH1'))
  const [pollMs, setPollMs] = useState(loadLs(LS.pollMs, 1000))
  const [pollOn, setPollOn] = useState(false)
  const [metricValues, setMetricValues] = useState({})
  const pollIntervalRef = useRef(null)

  const [logging, setLogging] = useState(false)
  const [logCount, setLogCount] = useState(0)
  const logBufferRef = useRef([])

  const [rawCmd, setRawCmd] = useState('')
  const [rawHistory, setRawHistory] = useState([])
  const rawListRef = useRef(null)

  useEffect(() => { saveLs(LS.bridgeUrl, bridgeUrl) }, [bridgeUrl])
  useEffect(() => { saveLs(LS.host, host) }, [host])
  useEffect(() => { saveLs(LS.port, port) }, [port])
  useEffect(() => { saveLs(LS.metrics, enabledMetrics) }, [enabledMetrics])
  useEffect(() => { saveLs(LS.pollMs, pollMs) }, [pollMs])
  useEffect(() => { saveLs(LS.metricChannel, metricChannel) }, [metricChannel])

  useEffect(() => {
    return scopeService.onStatus((s) => {
      if (s.kind === 'bridge') {
        setBridgeOpen(s.state === 'open')
        if (s.state === 'closed' || s.state === 'error') {
          setScopeConnected(false)
          setPhase((prev) => (prev === 'connected' ? 'idle' : prev))
        }
      } else if (s.kind === 'scope') {
        if (s.state === 'connected') {
          setScopeConnected(true); setPhase('connected')
        } else if (s.state === 'error') {
          setScopeConnected(false); setPhase('error')
          setErrMsg(typeof s.detail === 'string' ? s.detail : 'scope error')
        } else {
          setScopeConnected(false)
          setPhase((prev) => (prev === 'connected' ? 'idle' : prev))
        }
      }
    })
  }, [])

  useEffect(() => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
    if (!pollOn || phase !== 'connected') return
    let cancelled = false
    async function tick() {
      if (cancelled) return
      const next = {}
      for (const m of MEASUREMENTS) {
        if (!enabledMetrics.includes(m.id)) continue
        try {
          let v
          try {
            v = await scopeService.queryNumber(`MEAS:SCAL? ${metricChannel}, ${m.modern}`, 1500)
          } catch {
            const cnum = metricChannel.replace('CH', 'C')
            const text = await scopeService.query(`${cnum}:PAVA? ${m.legacy}`, 1500)
            const match = String(text).match(/[-+]?\d+(\.\d+)?([eE][-+]?\d+)?/)
            v = match ? parseFloat(match[0]) : NaN
          }
          next[m.id] = v
          if (logging && logBufferRef.current.length < LOG_BUFFER_CAP) {
            logBufferRef.current.push({ ts_ms: Date.now(), channel: metricChannel, metric: m.id, value: v })
            setLogCount(logBufferRef.current.length)
            if (logBufferRef.current.length >= LOG_BUFFER_CAP) {
              setLogging(false)
              console.warn(`[scope] log buffer hit cap (${LOG_BUFFER_CAP}) — auto-stopped`)
            }
          }
        } catch { next[m.id] = NaN }
      }
      if (!cancelled) setMetricValues((prev) => ({ ...prev, ...next }))
    }
    tick()
    pollIntervalRef.current = setInterval(tick, Math.max(150, pollMs))
    return () => { cancelled = true }
  }, [pollOn, phase, pollMs, enabledMetrics, metricChannel, logging])

  useEffect(() => {
    if (rawListRef.current) rawListRef.current.scrollTop = rawListRef.current.scrollHeight
  }, [rawHistory])

  async function connectScope() {
    setErrMsg(''); setPhase('connecting')
    try {
      if (!isValidIPv4(host) && !/^[a-zA-Z][\w.-]*$/.test(host)) {
        throw new Error('enter an IPv4 address or hostname')
      }
      scopeService.setBridgeUrl(bridgeUrl)
      const idnText = await scopeService.connectScope(host.trim(), parseInt(port, 10) || 5025)
      setIdn(idnText || ''); setPhase('connected')
    } catch (e) {
      setPhase('error'); setErrMsg(e?.message || 'connect failed')
    }
  }

  async function disconnectScope() {
    try { await scopeService.disconnectScope() } catch {}
    setIdn(''); setPhase('idle'); setMetricValues({}); setPollOn(false)
  }

  async function safeSend(cmd) {
    if (phase !== 'connected') return
    try { pushHistory('send', cmd); await scopeService.send(cmd) }
    catch (e) { pushHistory('err', e.message) }
  }
  async function safeQuery(cmd) {
    if (phase !== 'connected') return ''
    try { pushHistory('send', cmd); const r = await scopeService.query(cmd, 3000); pushHistory('recv', r); return r }
    catch (e) { pushHistory('err', e.message); return '' }
  }
  function pushHistory(kind, text) {
    setRawHistory((h) => [...h.slice(-199), { kind, text, ts: Date.now() }])
  }

  function exportLog(format) {
    const rows = logBufferRef.current
    if (!rows.length) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    let blob, filename
    if (format === 'json') {
      blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
      filename = `scope-log-${stamp}.json`
    } else {
      const lines = ['timestamp_iso,unix_ms,channel,metric,value']
      for (const r of rows) {
        lines.push(`${new Date(r.ts_ms).toISOString()},${r.ts_ms},${r.channel},${r.metric},${r.value}`)
      }
      blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      filename = `scope-log-${stamp}.csv`
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  function clearLog() { logBufferRef.current = []; setLogCount(0) }

  function applyChannel(field, value) {
    if (phase !== 'connected') return
    const ch = chSel
    const map = {
      disp:    `:${ch}:DISP ${value ? 'ON' : 'OFF'}`,
      scale:   `:${ch}:SCAL ${value}`,
      offset:  `:${ch}:OFFS ${value}`,
      coup:    `:${ch}:COUP ${value}`,
    }
    safeSend(map[field])
  }
  function applyTimebase(field, value) {
    if (phase !== 'connected') return
    safeSend(field === 'scale' ? `:TIM:SCAL ${value}` : `:TIM:OFFS ${value}`)
  }
  function applyTrigger(field, value) {
    if (phase !== 'connected') return
    const map = {
      source: `:TRIG:EDGE:SOUR ${value}`,
      mode:   `:TRIG:MODE ${value}`,
      level:  `:TRIG:EDGE:LEV ${value}`,
    }
    safeSend(map[field])
  }

  const connState =
    phase === 'connected' ? 'connected' :
    phase === 'connecting' ? 'connecting' :
    phase === 'error' ? 'error' : 'idle'

  return (
    <section className="scope-detail" aria-label="Oscilloscope">
      <header className="detail-head">
        <div className="grow">
          <div className="crumb">PiCoW · Scope</div>
          <h2>Oscilloscope</h2>
          <div className="sub">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="tb-conn" data-state={bridgeOpen ? 'connected' : 'idle'} style={{ pointerEvents: 'none' }}>
                <span className="dot" />
                {bridgeOpen ? 'Bridge ready' : 'Bridge offline'}
              </span>
              <span className="tb-conn" data-state={connState} style={{ pointerEvents: 'none' }}>
                <span className="dot" />
                {phase === 'connected' ? 'Scope online' : phase === 'connecting' ? 'Connecting…' : phase === 'error' ? 'Scope error' : 'Idle'}
              </span>
            </span>
            {idn && <span className="muted" title={idn} style={{ marginLeft: 10 }}>{idn.length > 60 ? idn.slice(0, 57) + '…' : idn}</span>}
          </div>
        </div>
        <div className="actions">
          {phase === 'connected' ? (
            <button className="btn btn-secondary btn-sm" onClick={disconnectScope}>
              <Icon name="unlink" size={13} /> Disconnect
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={connectScope} disabled={phase === 'connecting'}>
              <Icon name="link" size={13} />
              {phase === 'connecting' ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>
      </header>

      <div className="detail-body sc-body">
        <aside className="sc-rack" aria-label="Scope controls">
          {/* Connection */}
          <div className="sc-card">
            <div className="sc-card-head"><span className="sc-card-title">Connection</span></div>
            <div className="sc-knob-row">
              <span className="sc-knob-label">Host</span>
              <input className="sc-input" type="text" value={host}
                onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.50"
                disabled={phase === 'connected' || phase === 'connecting'} />
            </div>
            <div className="sc-knob-row">
              <span className="sc-knob-label">Port</span>
              <input className="sc-input" type="number" min="1" max="65535" value={port}
                onChange={(e) => setPort(parseInt(e.target.value, 10) || 5025)}
                disabled={phase === 'connected' || phase === 'connecting'} />
            </div>
            <div className="sc-knob-row">
              <span className="sc-knob-label">Bridge</span>
              <input className="sc-input" type="text" value={bridgeUrl}
                onChange={(e) => setBridgeUrl(e.target.value)}
                disabled={phase === 'connected' || phase === 'connecting'} />
            </div>
            {errMsg && <div className="sc-knob-row"><span className="error-text" style={{ margin: 0 }}>{errMsg}</span></div>}
            {!bridgeOpen && phase !== 'connecting' && (
              <div className="sc-knob-row">
                <span className="muted" style={{ fontSize: 11.5 }}>
                  Bridge not running. In a separate terminal: <code style={{ fontFamily: 'var(--font-mono)' }}>npm run bridge</code>
                </span>
              </div>
            )}
          </div>

          {/* Acquisition */}
          <div className="sc-card" data-on={phase === 'connected'}>
            <div className="sc-card-head"><span className="sc-card-title">Acquisition</span></div>
            <div className="sc-knob-row sc-wrap">
              <button className="btn btn-secondary btn-sm" onClick={() => safeSend(':RUN')} disabled={phase !== 'connected'}>Run</button>
              <button className="btn btn-secondary btn-sm" onClick={() => safeSend(':STOP')} disabled={phase !== 'connected'}>Stop</button>
              <button className="btn btn-secondary btn-sm" onClick={() => safeSend(':TRIG:MODE SING')} disabled={phase !== 'connected'}>Single</button>
              <button className="btn btn-secondary btn-sm" onClick={() => safeSend(':AUT')} disabled={phase !== 'connected'}>Autoset</button>
              <button className="btn btn-ghost btn-sm" onClick={() => safeSend('*RST')} disabled={phase !== 'connected'}>Reset</button>
            </div>
          </div>

          {/* Channel */}
          <div className="sc-card" data-on={phase === 'connected'}>
            <div className="sc-card-head"><span className="sc-card-title">Channel</span></div>
            <div className="sc-knob-row">
              <span className="sc-knob-label">CH</span>
              <select className="sc-input" value={chSel} onChange={(e) => setChSel(e.target.value)}>
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <label className="gpio-sub">
                <input type="checkbox" checked={chDisp} onChange={(e) => { setChDisp(e.target.checked); applyChannel('disp', e.target.checked) }} disabled={phase !== 'connected'} />
                <span>Display</span>
              </label>
            </div>
            <NumKnob label="V/div" value={chScale} step={0.01} disabled={phase !== 'connected'} onCommit={(v) => { setChScale(v); applyChannel('scale', v) }} />
            <NumKnob label="Offset" value={chOffset} step={0.01} disabled={phase !== 'connected'} onCommit={(v) => { setChOffset(v); applyChannel('offset', v) }} />
            <div className="sc-knob-row sc-wrap">
              <span className="sc-knob-label">Coupling</span>
              {COUPLINGS.map((c) => (
                <button key={c} className="sc-chip" data-active={chCoup === c} disabled={phase !== 'connected'}
                  onClick={() => { setChCoup(c); applyChannel('coup', c) }}>{c}</button>
              ))}
            </div>
          </div>

          {/* Timebase */}
          <div className="sc-card" data-on={phase === 'connected'}>
            <div className="sc-card-head"><span className="sc-card-title">Timebase</span></div>
            <NumKnob label="s/div" value={tScale} step={0.0001} disabled={phase !== 'connected'} onCommit={(v) => { setTScale(v); applyTimebase('scale', v) }} />
            <NumKnob label="Offset" value={tOffset} step={0.0001} disabled={phase !== 'connected'} onCommit={(v) => { setTOffset(v); applyTimebase('offset', v) }} />
          </div>

          {/* Trigger */}
          <div className="sc-card" data-on={phase === 'connected'}>
            <div className="sc-card-head"><span className="sc-card-title">Trigger</span></div>
            <div className="sc-knob-row">
              <span className="sc-knob-label">Source</span>
              <select className="sc-input" value={trigSrc} onChange={(e) => { setTrigSrc(e.target.value); applyTrigger('source', e.target.value) }} disabled={phase !== 'connected'}>
                {CHANNELS.concat(['EXT']).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="sc-knob-row sc-wrap">
              <span className="sc-knob-label">Mode</span>
              {TRIG_MODES.map((m) => (
                <button key={m} className="sc-chip" data-active={trigMode === m} disabled={phase !== 'connected'}
                  onClick={() => { setTrigMode(m); applyTrigger('mode', m) }}>{m}</button>
              ))}
            </div>
            <NumKnob label="Level" value={trigLevel} step={0.01} disabled={phase !== 'connected'} onCommit={(v) => { setTrigLevel(v); applyTrigger('level', v) }} />
          </div>
        </aside>

        <div className="sc-screens">
          {/* Measurements */}
          <div className="sc-screen">
            <div className="sc-screen-head">
              <span className="title">Measurements</span>
              <span className="spacer" />
              <span className="sc-knob-label" style={{ flex: '0 0 auto' }}>Channel</span>
              <select className="sc-input" value={metricChannel} onChange={(e) => setMetricChannel(e.target.value)} style={{ flex: '0 0 86px' }}>
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="sc-knob-label" style={{ flex: '0 0 auto' }}>Poll (ms)</span>
              <input className="sc-input" type="number" min="150" step="50" value={pollMs}
                onChange={(e) => setPollMs(parseInt(e.target.value, 10) || 1000)} style={{ flex: '0 0 96px' }} />
              <button
                className={`btn ${pollOn ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                onClick={() => setPollOn((p) => !p)}
                disabled={phase !== 'connected'}
              >
                <Icon name={pollOn ? 'pause' : 'play'} size={12} />
                {pollOn ? 'Stop polling' : 'Start polling'}
              </button>
            </div>
            <dl className="sc-grid">
              {MEASUREMENTS.map((m) => {
                const enabled = enabledMetrics.includes(m.id)
                const v = metricValues[m.id]
                return (
                  <React.Fragment key={m.id}>
                    <dt>
                      <button
                        type="button"
                        className="sc-chip"
                        data-active={enabled}
                        onClick={() => setEnabledMetrics((arr) => arr.includes(m.id) ? arr.filter((x) => x !== m.id) : [...arr, m.id])}
                        title={enabled ? 'Click to disable' : 'Click to enable polling'}
                      >{m.label}</button>
                    </dt>
                    <dd>{enabled ? fmtNum(v, m.precision) : '—'}<span className="unit">{m.unit}</span></dd>
                  </React.Fragment>
                )
              })}
            </dl>
          </div>

          {/* Data logger */}
          <div className="sc-screen">
            <div className="sc-screen-head">
              <span className="title">Data logger</span>
              <span className="muted">{logCount.toLocaleString()} samples</span>
              <span className="spacer" />
              {!logging ? (
                <button className="btn btn-primary btn-sm" onClick={() => { logBufferRef.current = []; setLogCount(0); setLogging(true); if (!pollOn) setPollOn(true) }} disabled={phase !== 'connected'}>
                  <Icon name="record" size={12} /> Start
                </button>
              ) : (
                <button className="btn btn-danger btn-sm" onClick={() => setLogging(false)}>
                  <Icon name="stop" size={12} /> Stop
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => exportLog('csv')} disabled={!logCount}>
                <Icon name="download" size={12} /> CSV
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => exportLog('json')} disabled={!logCount}>
                <Icon name="download" size={12} /> JSON
              </button>
              <button className="btn btn-ghost btn-sm" onClick={clearLog} disabled={!logCount}>
                <Icon name="trash" size={12} /> Clear
              </button>
            </div>
            <div style={{ padding: '10px 16px', color: 'var(--ink-4)', fontSize: 12 }}>
              Samples a row per enabled measurement on every poll tick. Use the Measurements card to choose metrics + rate.
            </div>
          </div>

          {/* Raw SCPI */}
          <div className="sc-screen">
            <div className="sc-screen-head">
              <span className="title">Raw SCPI</span>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => setRawHistory([])} disabled={!rawHistory.length}>
                <Icon name="trash" size={12} /> Clear
              </button>
            </div>
            <div className="sc-raw-list" ref={rawListRef}>
              {rawHistory.length === 0 ? (
                <span className="muted" style={{ fontSize: 12 }}>
                  No commands yet. Send a query like <code>*IDN?</code> or <code>:WAV:PRE?</code>.
                </span>
              ) : rawHistory.map((row, i) => (
                <div key={i} className="row">
                  <span className={`lbl ${row.kind === 'send' ? 'tx' : row.kind === 'recv' ? 'rx' : ''}`}>
                    {row.kind === 'send' ? '→' : row.kind === 'recv' ? '←' : '!'}
                  </span>
                  <span className="muted tnum" style={{ fontSize: 10.5, flexShrink: 0 }}>
                    {new Date(row.ts).toLocaleTimeString()}
                  </span>
                  <span className="msg" style={row.kind === 'err' ? { color: 'var(--danger)' } : undefined}>{row.text}</span>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const cmd = rawCmd.trim()
                if (!cmd) return
                if (cmd.includes('?')) safeQuery(cmd); else safeSend(cmd)
                setRawCmd('')
              }}
              style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--line)' }}
            >
              <input
                className="sc-input"
                type="text"
                value={rawCmd}
                onChange={(e) => setRawCmd(e.target.value)}
                placeholder="*IDN?  ·  :MEAS:SCAL? CH1, VPP  ·  :CHAN1:SCAL 0.5"
                disabled={phase !== 'connected'}
                style={{ flex: 1 }}
                autoComplete="off"
                spellCheck="false"
              />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={phase !== 'connected' || !rawCmd.trim()}>Send</button>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}

function NumKnob({ label, value, step, onCommit, disabled }) {
  const [local, setLocal] = useState(String(value))
  useEffect(() => { setLocal(String(value)) }, [value])
  return (
    <div className="sc-knob-row">
      <span className="sc-knob-label">{label}</span>
      <button
        type="button"
        className="sc-step"
        title="Decrease"
        disabled={disabled}
        onClick={() => { const n = parseFloat(local) - step; if (Number.isFinite(n)) { setLocal(String(n)); onCommit(n) } }}
      >−</button>
      <input
        className="sc-readout"
        type="number"
        step={step}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { const n = parseFloat(local); if (Number.isFinite(n)) onCommit(n); else setLocal(String(value)) }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
        disabled={disabled}
      />
      <button
        type="button"
        className="sc-step"
        title="Increase"
        disabled={disabled}
        onClick={() => { const n = parseFloat(local) + step; if (Number.isFinite(n)) { setLocal(String(n)); onCommit(n) } }}
      >+</button>
    </div>
  )
}
