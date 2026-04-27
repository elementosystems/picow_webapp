import React, { useEffect, useMemo, useRef, useState } from 'react'
import scopeService from '../services/scopeService'

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
  { id: 'PKPK', label: 'V pp',   unit: 'V', precision: 4 },
  { id: 'MEAN', label: 'V avg',  unit: 'V', precision: 4 },
  { id: 'RMS',  label: 'V rms',  unit: 'V', precision: 4 },
  { id: 'AMPL', label: 'V amp',  unit: 'V', precision: 4 },
  { id: 'MAX',  label: 'V max',  unit: 'V', precision: 4 },
  { id: 'MIN',  label: 'V min',  unit: 'V', precision: 4 },
  { id: 'FREQ', label: 'Freq',   unit: 'Hz', precision: 3 },
  { id: 'PER',  label: 'Period', unit: 's', precision: 6 },
]

const CHANNELS = ['CH1', 'CH2', 'CH3', 'CH4']
const COUPLINGS = ['DC', 'AC', 'GND']
const TRIG_MODES = ['AUTO', 'NORM']

function fmtNum(v, digits = 3) {
  if (v == null || Number.isNaN(v)) return '—'
  if (Math.abs(v) >= 1e6 || (Math.abs(v) > 0 && Math.abs(v) < 1e-3)) {
    return Number(v).toExponential(Math.max(2, digits - 1))
  }
  return Number(v).toFixed(digits)
}

function isValidIPv4(s) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s)
    && s.split('.').every(part => { const n = parseInt(part, 10); return n >= 0 && n <= 255 })
}

const Caret = ({open}) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
       style={{ transform: `rotate(${open ? 90 : 0}deg)`, transition: 'transform 160ms' }} aria-hidden="true">
    <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export default function ScopePanel() {
  // Bridge + scope state
  const [bridgeOpen, setBridgeOpen] = useState(scopeService.isBridgeOpen())
  const [scopeConnected, setScopeConnected] = useState(scopeService.isScopeConnected())
  const [phase, setPhase] = useState('idle')           // idle|connecting|connected|error
  const [errMsg, setErrMsg] = useState('')
  const [idn, setIdn] = useState('')
  const [bridgeUrl, setBridgeUrl] = useState(loadLs(LS.bridgeUrl, 'ws://127.0.0.1:8765/ws'))

  // Connection form
  const [host, setHost] = useState(loadLs(LS.host, '192.168.1.50'))
  const [port, setPort] = useState(loadLs(LS.port, 5025))

  // Channel + timebase + trigger
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

  // Measurements + polling
  const [enabledMetrics, setEnabledMetrics] = useState(loadLs(LS.metrics, ['PKPK', 'MEAN', 'FREQ']))
  const [metricChannel, setMetricChannel] = useState(loadLs(LS.metricChannel, 'CH1'))
  const [pollMs, setPollMs] = useState(loadLs(LS.pollMs, 1000))
  const [pollOn, setPollOn] = useState(false)
  const [metricValues, setMetricValues] = useState({})
  const pollIntervalRef = useRef(null)

  // Data logger
  const [logging, setLogging] = useState(false)
  const [logCount, setLogCount] = useState(0)
  const logBufferRef = useRef([])

  // Raw SCPI
  const [rawCmd, setRawCmd] = useState('')
  const [rawHistory, setRawHistory] = useState([])
  const rawListRef = useRef(null)

  // Section open/closed
  const [openControls, setOpenControls] = useState(true)
  const [openMeas, setOpenMeas] = useState(true)
  const [openLogger, setOpenLogger] = useState(true)
  const [openRaw, setOpenRaw] = useState(false)

  // Persist key inputs
  useEffect(() => { saveLs(LS.bridgeUrl, bridgeUrl) }, [bridgeUrl])
  useEffect(() => { saveLs(LS.host, host) }, [host])
  useEffect(() => { saveLs(LS.port, port) }, [port])
  useEffect(() => { saveLs(LS.metrics, enabledMetrics) }, [enabledMetrics])
  useEffect(() => { saveLs(LS.pollMs, pollMs) }, [pollMs])
  useEffect(() => { saveLs(LS.metricChannel, metricChannel) }, [metricChannel])

  // Subscribe to status
  useEffect(() => {
    return scopeService.onStatus((s) => {
      if (s.kind === 'bridge') {
        setBridgeOpen(s.state === 'open')
        if (s.state === 'closed' || s.state === 'error') {
          setScopeConnected(false)
          setPhase(prev => prev === 'connected' ? 'idle' : prev)
        }
      } else if (s.kind === 'scope') {
        if (s.state === 'connected') {
          setScopeConnected(true)
          setPhase('connected')
        } else if (s.state === 'error') {
          setScopeConnected(false)
          setPhase('error')
          setErrMsg(typeof s.detail === 'string' ? s.detail : 'scope error')
        } else {
          setScopeConnected(false)
          if (phase === 'connected') setPhase('idle')
        }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Polling loop
  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (!pollOn || phase !== 'connected') return
    let cancelled = false
    async function tick() {
      if (cancelled) return
      const next = {}
      for (const m of MEASUREMENTS) {
        if (!enabledMetrics.includes(m.id)) continue
        try {
          // Modern SCPI form first; falls back to legacy if it fails.
          let v
          try {
            v = await scopeService.queryNumber(`MEAS:SCAL? ${metricChannel}, ${m.id}`, 1500)
          } catch {
            // Legacy Siglent SDS1000X (PAVA): "C1:PAVA? PKPK" → "C1:PAVA PKPK,3.43E-01V"
            const cnum = metricChannel.replace('CH', 'C')
            const text = await scopeService.query(`${cnum}:PAVA? ${m.id}`, 1500)
            const match = String(text).match(/[-+]?\d+(\.\d+)?([eE][-+]?\d+)?/)
            v = match ? parseFloat(match[0]) : NaN
          }
          next[m.id] = v
          if (logging) {
            logBufferRef.current.push({
              ts_ms: Date.now(), channel: metricChannel, metric: m.id, value: v,
            })
            setLogCount(logBufferRef.current.length)
          }
        } catch (e) {
          next[m.id] = NaN
        }
      }
      if (!cancelled) setMetricValues(prev => ({ ...prev, ...next }))
    }
    tick()
    pollIntervalRef.current = setInterval(tick, Math.max(150, pollMs))
    return () => { cancelled = true }
  }, [pollOn, phase, pollMs, enabledMetrics, metricChannel, logging])

  // Auto-scroll raw history
  useEffect(() => {
    if (rawListRef.current) rawListRef.current.scrollTop = rawListRef.current.scrollHeight
  }, [rawHistory])

  // ---- actions ----
  async function connectScope() {
    setErrMsg('')
    setPhase('connecting')
    try {
      if (!isValidIPv4(host) && !/^[a-zA-Z][\w.-]*$/.test(host)) {
        throw new Error('enter an IPv4 address or hostname')
      }
      scopeService.setBridgeUrl(bridgeUrl)
      const idnText = await scopeService.connectScope(host.trim(), parseInt(port, 10) || 5025)
      setIdn(idnText || '')
      setPhase('connected')
    } catch (e) {
      setPhase('error')
      setErrMsg(e?.message || 'connect failed')
    }
  }

  async function disconnectScope() {
    try { await scopeService.disconnectScope() } catch {}
    setIdn('')
    setPhase('idle')
    setMetricValues({})
    setPollOn(false)
  }

  async function safeSend(cmd, opts = {}) {
    if (phase !== 'connected') return
    try {
      pushHistory('send', cmd)
      await scopeService.send(cmd)
      if (opts.echo) pushHistory('recv', '(no reply expected)', { faint: true })
    } catch (e) {
      pushHistory('err', e.message)
    }
  }

  async function safeQuery(cmd) {
    if (phase !== 'connected') return ''
    try {
      pushHistory('send', cmd)
      const r = await scopeService.query(cmd, 3000)
      pushHistory('recv', r)
      return r
    } catch (e) {
      pushHistory('err', e.message)
      return ''
    }
  }

  function pushHistory(kind, text, opts = {}) {
    setRawHistory(h => [...h.slice(-199), { kind, text, ts: Date.now(), faint: !!opts.faint }])
  }

  function exportLog(format) {
    const rows = logBufferRef.current
    if (!rows.length) return
    let blob
    let filename
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
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
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  function clearLog() {
    logBufferRef.current = []
    setLogCount(0)
  }

  // Handlers that send SCPI on change
  function applyChannel(field, value) {
    if (phase !== 'connected') return
    const ch = chSel.replace('CH', 'CH')
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
    const map = {
      scale:   `:TIM:SCAL ${value}`,
      offset:  `:TIM:OFFS ${value}`,
    }
    safeSend(map[field])
  }
  function applyTrigger(field, value) {
    if (phase !== 'connected') return
    const map = {
      source:  `:TRIG:EDGE:SOUR ${value}`,
      mode:    `:TRIG:MODE ${value}`,
      level:   `:TRIG:EDGE:LEV ${value}`,
    }
    safeSend(map[field])
  }

  // ---- render ----
  const bridgePill = bridgeOpen
    ? <span className="status status--connected">Bridge ready</span>
    : <span className="status status--idle">Bridge offline</span>
  const scopePill =
    phase === 'connected' ? <span className="status status--connected">Scope online</span> :
    phase === 'connecting' ? <span className="status status--warn">Connecting…</span> :
    phase === 'error' ? <span className="status status--error">Scope error</span> :
    <span className="status status--idle">Idle</span>

  return (
    <section className="card scope" aria-label="Oscilloscope (Siglent / SCPI)">
      <div className="card__header">
        <span className="card__title-eyebrow">Scope</span>
        <span className="card__title">Oscilloscope</span>
        <span style={{ display: 'inline-flex', gap: 'var(--s-2)', marginLeft: 'var(--s-3)' }}>
          {bridgePill}
          {scopePill}
        </span>
        {idn && <span className="scope__idn" title={idn}>{idn.length > 60 ? idn.slice(0, 57) + '…' : idn}</span>}
      </div>

      {/* Connection */}
      <div className="card__body scope__connect">
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label className="field__label" htmlFor="scopeHost">Host (IPv4 or DNS)</label>
          <input
            id="scopeHost"
            className="field__input"
            type="text"
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder="192.168.1.50"
            disabled={phase === 'connected' || phase === 'connecting'}
            style={{ width: '100%' }}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="scopePort">Port</label>
          <input
            id="scopePort"
            className="field__input"
            type="number"
            min="1"
            max="65535"
            value={port}
            onChange={e => setPort(parseInt(e.target.value, 10) || 5025)}
            disabled={phase === 'connected' || phase === 'connecting'}
          />
        </div>
        <div className="field" style={{ flex: '1 1 240px' }}>
          <label className="field__label" htmlFor="scopeBridge">Bridge URL</label>
          <input
            id="scopeBridge"
            className="field__input"
            type="text"
            value={bridgeUrl}
            onChange={e => setBridgeUrl(e.target.value)}
            disabled={phase === 'connected' || phase === 'connecting'}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'flex-end' }}>
          {phase === 'connected' ? (
            <button className="btn btn--ghost" onClick={disconnectScope}>Disconnect</button>
          ) : (
            <button className="btn btn--primary" onClick={connectScope} disabled={phase === 'connecting'}>
              {phase === 'connecting' ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>
        {errMsg && <div className="scope__error">{errMsg}</div>}
        {!bridgeOpen && phase !== 'connecting' && (
          <div className="scope__hint">
            <strong>Bridge not running.</strong> In a separate terminal: <code>npm run bridge</code>
          </div>
        )}
      </div>

      {/* Acquisition + Channel + Timebase + Trigger */}
      <Disclosure title="Controls" open={openControls} onToggle={setOpenControls}>
        <div className="scope__row">
          <div className="scope__group">
            <div className="scope__group-title">Acquisition</div>
            <div className="scope__btns">
              <button className="btn" onClick={() => safeSend(':RUN')}      disabled={phase !== 'connected'}>Run</button>
              <button className="btn" onClick={() => safeSend(':STOP')}     disabled={phase !== 'connected'}>Stop</button>
              <button className="btn" onClick={() => safeSend(':TRIG:MODE SING')} disabled={phase !== 'connected'}>Single</button>
              <button className="btn" onClick={() => safeSend(':AUT')}      disabled={phase !== 'connected'}>Autoset</button>
              <button className="btn btn--ghost" onClick={() => safeSend('*RST')} disabled={phase !== 'connected'}>Reset</button>
            </div>
          </div>

          <div className="scope__group">
            <div className="scope__group-title">Channel</div>
            <div className="scope__inline">
              <select className="field__input" value={chSel} onChange={e => setChSel(e.target.value)} style={{ width: 100 }}>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <label className="field--check field" style={{ height: 36 }}>
                <input type="checkbox" checked={chDisp} onChange={e => { setChDisp(e.target.checked); applyChannel('disp', e.target.checked) }} disabled={phase !== 'connected'} />
                <span className="field__label">Display</span>
              </label>
            </div>
            <div className="scope__inline">
              <NumField label="V/div" value={chScale} step={0.01} onCommit={v => { setChScale(v); applyChannel('scale', v) }} disabled={phase !== 'connected'} />
              <NumField label="Offset" value={chOffset} step={0.01} onCommit={v => { setChOffset(v); applyChannel('offset', v) }} disabled={phase !== 'connected'} />
              <div className="field">
                <label className="field__label">Coupling</label>
                <select className="field__input" value={chCoup} onChange={e => { setChCoup(e.target.value); applyChannel('coup', e.target.value) }} disabled={phase !== 'connected'}>
                  {COUPLINGS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="scope__group">
            <div className="scope__group-title">Timebase</div>
            <div className="scope__inline">
              <NumField label="s/div" value={tScale} step={0.0001} onCommit={v => { setTScale(v); applyTimebase('scale', v) }} disabled={phase !== 'connected'} />
              <NumField label="Offset" value={tOffset} step={0.0001} onCommit={v => { setTOffset(v); applyTimebase('offset', v) }} disabled={phase !== 'connected'} />
            </div>
          </div>

          <div className="scope__group">
            <div className="scope__group-title">Trigger</div>
            <div className="scope__inline">
              <div className="field">
                <label className="field__label">Source</label>
                <select className="field__input" value={trigSrc} onChange={e => { setTrigSrc(e.target.value); applyTrigger('source', e.target.value) }} disabled={phase !== 'connected'}>
                  {CHANNELS.concat(['EXT']).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field__label">Mode</label>
                <select className="field__input" value={trigMode} onChange={e => { setTrigMode(e.target.value); applyTrigger('mode', e.target.value) }} disabled={phase !== 'connected'}>
                  {TRIG_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <NumField label="Level" value={trigLevel} step={0.01} onCommit={v => { setTrigLevel(v); applyTrigger('level', v) }} disabled={phase !== 'connected'} />
            </div>
          </div>
        </div>
      </Disclosure>

      {/* Measurements */}
      <Disclosure title="Measurements" open={openMeas} onToggle={setOpenMeas}
        right={<MeasToolbar
          channel={metricChannel} setChannel={setMetricChannel}
          pollMs={pollMs} setPollMs={setPollMs}
          pollOn={pollOn} setPollOn={setPollOn}
          disabled={phase !== 'connected'}
        />}>
        <div className="scope__metrics">
          {MEASUREMENTS.map(m => {
            const enabled = enabledMetrics.includes(m.id)
            const v = metricValues[m.id]
            return (
              <button
                key={m.id}
                type="button"
                className={`scope__metric ${enabled ? 'is-enabled' : ''}`}
                onClick={() => setEnabledMetrics(arr =>
                  arr.includes(m.id) ? arr.filter(x => x !== m.id) : [...arr, m.id]
                )}
                title={enabled ? 'Click to disable' : 'Click to enable polling'}
              >
                <span className="scope__metric-label">{m.label}</span>
                <span className="scope__metric-value">
                  {enabled ? fmtNum(v, m.precision) : '—'}
                  <em>{m.unit}</em>
                </span>
              </button>
            )
          })}
        </div>
      </Disclosure>

      {/* Data logger */}
      <Disclosure title="Data logger" open={openLogger} onToggle={setOpenLogger}>
        <div className="scope__inline scope__logger">
          <span className="scope__counter">{logCount.toLocaleString()} samples</span>
          {!logging ? (
            <button className="btn btn--primary" onClick={() => { logBufferRef.current = []; setLogCount(0); setLogging(true); if (!pollOn) setPollOn(true) }} disabled={phase !== 'connected'}>
              Start logging
            </button>
          ) : (
            <button className="btn btn--danger" onClick={() => setLogging(false)}>Stop logging</button>
          )}
          <button className="btn btn--ghost" onClick={() => exportLog('csv')} disabled={!logCount}>Export CSV</button>
          <button className="btn btn--ghost" onClick={() => exportLog('json')} disabled={!logCount}>Export JSON</button>
          <button className="btn btn--ghost" onClick={clearLog} disabled={!logCount}>Clear</button>
          <span className="scope__hint" style={{ flex: 1, marginTop: 0 }}>
            Samples a row per enabled measurement on every poll tick. Expand the Measurements section to pick metrics + rate.
          </span>
        </div>
      </Disclosure>

      {/* Raw SCPI */}
      <Disclosure title="Raw SCPI" open={openRaw} onToggle={setOpenRaw}>
        <div className="scope__raw">
          <div className="scope__raw-history" ref={rawListRef}>
            {rawHistory.length === 0 ? (
              <div className="scope__hint" style={{ marginTop: 0 }}>No commands yet. Send a query like <code>*IDN?</code> or <code>:WAV:PRE?</code>.</div>
            ) : rawHistory.map((row, i) => (
              <div key={i} className={`scope__raw-row scope__raw-row--${row.kind} ${row.faint ? 'is-faint' : ''}`}>
                <span className="scope__raw-ts">{new Date(row.ts).toLocaleTimeString()}</span>
                <span className="scope__raw-arrow">{row.kind === 'send' ? '→' : row.kind === 'recv' ? '←' : '!'}</span>
                <span className="scope__raw-text">{row.text}</span>
              </div>
            ))}
          </div>
          <form className="scope__raw-form" onSubmit={e => { e.preventDefault(); const cmd = rawCmd.trim(); if (!cmd) return; if (cmd.includes('?')) safeQuery(cmd); else safeSend(cmd); setRawCmd('') }}>
            <input
              className="field__input"
              type="text"
              value={rawCmd}
              onChange={e => setRawCmd(e.target.value)}
              placeholder="*IDN?  ·  :MEAS:SCAL? CH1, VPP  ·  :CHAN1:SCAL 0.5"
              disabled={phase !== 'connected'}
              style={{ flex: 1 }}
              autoComplete="off"
              spellCheck="false"
            />
            <button type="submit" className="btn" disabled={phase !== 'connected' || !rawCmd.trim()}>Send</button>
            <button type="button" className="btn btn--ghost" onClick={() => setRawHistory([])}>Clear</button>
          </form>
        </div>
      </Disclosure>
    </section>
  )
}

function Disclosure({ title, open, onToggle, right, children }) {
  return (
    <div className={`scope__section ${open ? 'is-open' : ''}`}>
      <div className="scope__section-head">
        <button type="button" className="scope__section-toggle" onClick={() => onToggle(!open)} aria-expanded={open}>
          <Caret open={open} />
          <span>{title}</span>
        </button>
        {right && <div className="scope__section-right">{right}</div>}
      </div>
      {open && <div className="scope__section-body">{children}</div>}
    </div>
  )
}

function NumField({ label, value, step, onCommit, disabled }) {
  const [local, setLocal] = useState(String(value))
  useEffect(() => { setLocal(String(value)) }, [value])
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <input
        className="field__input"
        type="number"
        step={step}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { const n = parseFloat(local); if (Number.isFinite(n)) onCommit(n); else setLocal(String(value)) }}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
        disabled={disabled}
      />
    </div>
  )
}

function MeasToolbar({ channel, setChannel, pollMs, setPollMs, pollOn, setPollOn, disabled }) {
  return (
    <div className="scope__inline" style={{ marginLeft: 'auto', alignItems: 'center', gap: 'var(--s-2)' }}>
      <div className="field">
        <label className="field__label">Channel</label>
        <select className="field__input" value={channel} onChange={e => setChannel(e.target.value)} style={{ width: 100 }}>
          {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="field">
        <label className="field__label">Poll (ms)</label>
        <input
          className="field__input"
          type="number"
          min="150"
          step="50"
          value={pollMs}
          onChange={e => setPollMs(parseInt(e.target.value, 10) || 1000)}
          style={{ width: 110 }}
        />
      </div>
      <button
        type="button"
        className={`btn ${pollOn ? 'btn--ghost is-paused' : 'btn--primary'}`}
        onClick={() => setPollOn(p => !p)}
        disabled={disabled}
      >{pollOn ? 'Stop polling' : 'Start polling'}</button>
    </div>
  )
}
