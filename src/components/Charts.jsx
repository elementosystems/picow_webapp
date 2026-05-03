import React, { useEffect, useMemo, useRef, useState } from 'react'
import serialService from '../services/serialService'
import eventBus from '../services/eventBus'
import TelemetryChart from './TelemetryChart'
import { Icon } from './Icons'
import { load, save, isBreach, SETTINGS_KEYS } from '../services/settings'

const SOURCE_COLOR_VAR = {
  conn: '--info',
  ctrl: '--accent',
  err:  '--danger',
}

const RANGE_PRESETS = [
  { label: '30s', seconds: 30 },
  { label: '1m',  seconds: 60 },
  { label: '5m',  seconds: 300 },
  { label: '15m', seconds: 900 },
]

const VIEW_MODES = [
  { id: 'split',    label: 'Split' },
  { id: 'combined', label: 'Overlay' },
]

const DEFAULT_THRESHOLDS = {
  currentMin: null, currentMax: null,
  voltageMin: null, voltageMax: null,
}

function readVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
function colorForEvent(evt) {
  if (evt.level === 'err') return readVar('--c-danger-hex') || '#ff6e7a'
  const v = SOURCE_COLOR_VAR[evt.source] || '--text-muted'
  return readVar(v) || '#9ba4b6'
}
function fmt(v, digits = 3) {
  if (v == null || Number.isNaN(v)) return '—'
  const s = Math.sign(v) < 0 ? '-' : ''
  return s + Math.abs(v).toFixed(digits)
}
function fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString() : '' }
function fmtThr(v) { return v === null || v === undefined ? '' : v }

function withAlpha(color, alpha) {
  if (!color) return `rgba(255,255,255,${alpha})`
  const hex = color.trim()
  if (hex.startsWith('#')) {
    let r, g, b
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16)
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16)
    } else return color
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

function normalizeThresholds(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_THRESHOLDS }
  const pick = (k) => {
    const v = value[k]
    return typeof v === 'number' && !Number.isNaN(v) ? v : null
  }
  return {
    currentMin: pick('currentMin'), currentMax: pick('currentMax'),
    voltageMin: pick('voltageMin'), voltageMax: pick('voltageMax'),
  }
}

function computeStats(values) {
  if (!values.length) return { min: null, max: null, mean: null, last: null }
  let min = Infinity, max = -Infinity, sum = 0, count = 0
  for (const v of values) {
    if (typeof v !== 'number' || Number.isNaN(v)) continue
    if (v < min) min = v
    if (v > max) max = v
    sum += v; count++
  }
  if (!count) return { min: null, max: null, mean: null, last: null }
  return { min, max, mean: sum / count, last: values[values.length - 1] }
}

function downloadCsv(name, ts, current, voltage) {
  const rows = ['timestamp_iso,unix_ms,current_a,voltage_v']
  for (let i = 0; i < ts.length; i++) {
    const ms = ts[i] * 1000
    const iso = new Date(ms).toISOString()
    rows.push(`${iso},${ms},${current[i] ?? ''},${voltage[i] ?? ''}`)
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function Charts({ connected }) {
  const [showDemo, setShowDemo] = useState(() => !!load(SETTINGS_KEYS.showDemo, false))
  const [paused, setPaused] = useState(false)
  const [viewMode, setViewMode] = useState(() => {
    const v = load(SETTINGS_KEYS.viewMode, 'split')
    return (v === 'split' || v === 'combined') ? v : 'split'
  })
  const [windowSec, setWindowSec] = useState(() => {
    const v = Number(load(SETTINGS_KEYS.windowSec, 60))
    return Number.isFinite(v) && v > 0 ? v : 60
  })
  const [thresholds, setThresholds] = useState(() => normalizeThresholds(load(SETTINGS_KEYS.thresholds, DEFAULT_THRESHOLDS)))
  const [tick, setTick] = useState(0)
  const [allMarkers, setAllMarkers] = useState([])

  useEffect(() => { save(SETTINGS_KEYS.windowSec, windowSec) }, [windowSec])
  useEffect(() => { save(SETTINGS_KEYS.viewMode, viewMode) }, [viewMode])
  useEffect(() => { save(SETTINGS_KEYS.showDemo, showDemo) }, [showDemo])
  useEffect(() => { save(SETTINGS_KEYS.thresholds, thresholds) }, [thresholds])

  const tsRef = useRef([])
  const curRef = useRef([])
  const volRef = useRef([])
  const lastTsMsRef = useRef(0)
  const pausedSnapshotRef = useRef(null)

  const active = connected || showDemo
  const source = connected ? 'LIVE' : 'DEMO'

  // Telemetry → buffer (same merge-on-same-timestamp rule as before).
  useEffect(() => {
    function ingest(item) {
      const tMs = item.time instanceof Date ? item.time.getTime() : Number(item.time)
      if (!tMs) return
      const tSec = Math.floor(tMs / 1000)
      if (tMs === lastTsMsRef.current && tsRef.current.length > 0) {
        const i = tsRef.current.length - 1
        if (typeof item.current === 'number' && Number.isNaN(curRef.current[i])) curRef.current[i] = item.current
        if (typeof item.voltage === 'number' && Number.isNaN(volRef.current[i])) volRef.current[i] = item.voltage
        setTick((n) => n + 1); return
      }
      lastTsMsRef.current = tMs
      tsRef.current.push(tSec)
      curRef.current.push(typeof item.current === 'number' ? item.current : NaN)
      volRef.current.push(typeof item.voltage === 'number' ? item.voltage : NaN)
      const cutoff = tSec - 60 * 16
      while (tsRef.current.length && tsRef.current[0] < cutoff) {
        tsRef.current.shift(); curRef.current.shift(); volRef.current.shift()
      }
      setTick((n) => n + 1)
    }
    serialService.setOnTelemetry(ingest)
    function onConn(c) {
      if (!c) {
        tsRef.current = []; curRef.current = []; volRef.current = []
        lastTsMsRef.current = 0; pausedSnapshotRef.current = null
        setTick((n) => n + 1)
      }
    }
    serialService.addOnConnectionChange(onConn)
    return () => {
      serialService.setOnTelemetry(null)
      serialService.removeOnConnectionChange(onConn)
    }
  }, [])

  // Demo simulation
  useEffect(() => {
    if (!showDemo || connected) return
    const id = setInterval(() => {
      const now = Date.now()
      const c = Math.sin(now / 1000) * 0.02 - 0.01 + (Math.random() - 0.5) * 0.002
      const v = 5.0 + Math.sin(now / 3000) * 0.05 + (Math.random() - 0.5) * 0.01
      const tSec = Math.floor(now / 1000)
      if (tSec === Math.floor(lastTsMsRef.current / 1000)) return
      lastTsMsRef.current = now
      tsRef.current.push(tSec); curRef.current.push(c); volRef.current.push(v)
      const cutoff = tSec - 60 * 16
      while (tsRef.current.length && tsRef.current[0] < cutoff) {
        tsRef.current.shift(); curRef.current.shift(); volRef.current.shift()
      }
      setTick((n) => n + 1)
    }, 250)
    return () => clearInterval(id)
  }, [showDemo, connected])

  // Markers from event bus
  useEffect(() => {
    function toMarker(evt) {
      return {
        ts: Math.floor(evt.ts.getTime() / 1000),
        label: evt.message,
        color: colorForEvent(evt),
        source: evt.source,
        level: evt.level,
      }
    }
    setAllMarkers(eventBus.getAll().map(toMarker))
    return eventBus.subscribe((evt) => {
      if (evt == null) { setAllMarkers([]); return }
      setAllMarkers((prev) => {
        const next = prev.slice(); next.push(toMarker(evt))
        if (next.length > 200) next.splice(0, next.length - 200)
        return next
      })
    })
  }, [])

  useEffect(() => {
    if (paused) {
      pausedSnapshotRef.current = {
        ts: tsRef.current.slice(),
        cur: curRef.current.slice(),
        vol: volRef.current.slice(),
      }
    } else {
      pausedSnapshotRef.current = null
    }
  }, [paused])

  const view = useMemo(() => {
    void tick
    const src = paused && pausedSnapshotRef.current
      ? pausedSnapshotRef.current
      : { ts: tsRef.current, cur: curRef.current, vol: volRef.current }
    if (!src.ts.length) return { ts: [], cur: [], vol: [] }
    const cutoff = src.ts[src.ts.length - 1] - windowSec
    let start = 0
    for (let i = src.ts.length - 1; i >= 0; i--) {
      if (src.ts[i] < cutoff) { start = i + 1; break }
    }
    return { ts: src.ts.slice(start), cur: src.cur.slice(start), vol: src.vol.slice(start) }
  }, [tick, paused, windowSec])

  const stats = useMemo(() => ({
    current: computeStats(view.cur.filter((v) => typeof v === 'number' && !Number.isNaN(v))),
    voltage: computeStats(view.vol.filter((v) => typeof v === 'number' && !Number.isNaN(v))),
  }), [view])

  const visibleMarkers = useMemo(() => {
    let lo, hi
    if (view.ts.length) {
      hi = view.ts[view.ts.length - 1]; lo = hi - windowSec
    } else {
      hi = Math.floor(Date.now() / 1000); lo = hi - windowSec
    }
    return allMarkers.filter((m) => m.ts >= lo && m.ts <= hi + 2)
  }, [allMarkers, view, windowSec])

  const lastUpdate = view.ts.length ? view.ts[view.ts.length - 1] * 1000 : null

  // Breach detection
  const currentBreach = isBreach(stats.current.last, thresholds.currentMin, thresholds.currentMax)
  const voltageBreach = isBreach(stats.voltage.last, thresholds.voltageMin, thresholds.voltageMax)
  const prevBreachRef = useRef({ current: false, voltage: false })
  const latestRef = useRef({ current: stats.current.last, voltage: stats.voltage.last })
  latestRef.current = { current: stats.current.last, voltage: stats.voltage.last }
  const thresholdsRef = useRef(thresholds); thresholdsRef.current = thresholds
  useEffect(() => {
    if (currentBreach && !prevBreachRef.current.current) {
      const t = thresholdsRef.current
      console.warn(`[picow] current breach: ${latestRef.current.current} A outside [${t.currentMin}, ${t.currentMax}]`)
    }
    if (voltageBreach && !prevBreachRef.current.voltage) {
      const t = thresholdsRef.current
      console.warn(`[picow] voltage breach: ${latestRef.current.voltage} V outside [${t.voltageMin}, ${t.voltageMax}]`)
    }
    prevBreachRef.current = { current: currentBreach, voltage: voltageBreach }
  }, [currentBreach, voltageBreach])

  const colors = {
    current: readVar('--data-current') || '#ff6e7a',
    voltage: readVar('--data-voltage') || '#5fb8ff',
  }
  const currentSeries  = [{ label: 'Current', color: colors.current, unit: 'A', precision: 4 }]
  const voltageSeries  = [{ label: 'Voltage', color: colors.voltage, unit: 'V', precision: 2 }]
  const combinedSeries = [
    { label: 'Current', color: colors.current, unit: 'A', precision: 4 },
    { label: 'Voltage', color: colors.voltage, unit: 'V', precision: 2 },
  ]
  const currentLineColor = withAlpha(colors.current, 0.55)
  const voltageLineColor = withAlpha(colors.voltage, 0.55)

  const currentChartThresholds = useMemo(() => {
    const arr = []
    if (typeof thresholds.currentMin === 'number') arr.push({ scale: 'y', value: thresholds.currentMin, color: currentLineColor })
    if (typeof thresholds.currentMax === 'number') arr.push({ scale: 'y', value: thresholds.currentMax, color: currentLineColor })
    return arr
  }, [thresholds.currentMin, thresholds.currentMax, currentLineColor])

  const voltageChartThresholds = useMemo(() => {
    const arr = []
    if (typeof thresholds.voltageMin === 'number') arr.push({ scale: 'y', value: thresholds.voltageMin, color: voltageLineColor })
    if (typeof thresholds.voltageMax === 'number') arr.push({ scale: 'y', value: thresholds.voltageMax, color: voltageLineColor })
    return arr
  }, [thresholds.voltageMin, thresholds.voltageMax, voltageLineColor])

  const combinedChartThresholds = useMemo(() => {
    const arr = []
    if (typeof thresholds.currentMin === 'number') arr.push({ scale: 'y0', value: thresholds.currentMin, color: currentLineColor })
    if (typeof thresholds.currentMax === 'number') arr.push({ scale: 'y0', value: thresholds.currentMax, color: currentLineColor })
    if (typeof thresholds.voltageMin === 'number') arr.push({ scale: 'y1', value: thresholds.voltageMin, color: voltageLineColor })
    if (typeof thresholds.voltageMax === 'number') arr.push({ scale: 'y1', value: thresholds.voltageMax, color: voltageLineColor })
    return arr
  }, [thresholds, currentLineColor, voltageLineColor])

  function onThr(key) {
    return (e) => {
      const raw = e.target.value
      setThresholds((prev) => ({
        ...prev,
        [key]: raw === '' ? null : (Number.isNaN(parseFloat(raw)) ? null : parseFloat(raw)),
      }))
    }
  }

  const lastCur = stats.current.last
  const lastVol = stats.voltage.last
  const iPct = lastCur != null ? Math.min(100, Math.abs(lastCur) / 1.0 * 100) : 0
  const vPct = lastVol != null ? Math.min(100, Math.max(0, ((lastVol - 4.4) / (5.6 - 4.4)) * 100)) : 0

  const splitData = (vals) => [view.ts, vals]
  const combinedData = [view.ts, view.cur, view.vol]

  return (
    <div className="telemetry">
      <div className="tel-controls" role="toolbar" aria-label="Telemetry controls">
        <span className="lbl">Source</span>
        <span className="lbl" style={{ color: connected ? 'var(--led-on)' : (showDemo ? 'var(--accent)' : 'var(--ink-4)') }}>
          {connected ? `LIVE · ${source}` : (showDemo ? 'DEMO' : 'Idle')}
        </span>
        <span className="lbl" style={{ color: 'var(--ink-4)' }}>
          {view.ts.length} pts · {lastUpdate ? `last ${fmtTime(lastUpdate)}` : 'awaiting…'}
        </span>

        <span className="lbl">View</span>
        <div className="group" role="tablist" aria-label="Chart view mode">
          {VIEW_MODES.map((m) => (
            <button key={m.id} role="tab" aria-selected={viewMode === m.id} data-active={viewMode === m.id} onClick={() => setViewMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>

        <span className="lbl">Window</span>
        <div className="group" role="tablist" aria-label="Time window">
          {RANGE_PRESETS.map((p) => (
            <button key={p.label} role="tab" aria-selected={windowSec === p.seconds} data-active={windowSec === p.seconds} onClick={() => setWindowSec(p.seconds)}>
              {p.label}
            </button>
          ))}
        </div>

        <span className="spacer" />

        <button className="btn btn-ghost btn-sm" onClick={() => setPaused((p) => !p)} title={paused ? 'Resume' : 'Pause'}>
          <Icon name={paused ? 'play' : 'pause'} size={13} />
          <span>{paused ? 'Resume' : 'Pause'}</span>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => downloadCsv('picow-telemetry', view.ts, view.cur, view.vol)} disabled={!view.ts.length}>
          <Icon name="download" size={13} />
          <span>CSV</span>
        </button>
        <label className="gpio-sub" style={{ marginLeft: 4 }}>
          <input type="checkbox" checked={showDemo} onChange={(e) => setShowDemo(e.target.checked)} />
          <span>Demo</span>
        </label>
      </div>

      <div className="thresh-row" aria-label="Thresholds">
        <span className="tel-controls" style={{ padding: 0, border: 0, background: 'transparent' }}>
          <span className="lbl">Thresholds</span>
        </span>
        <span className="thresh-input is-current">
          <span className="ti-lbl">i_min</span>
          <input value={fmtThr(thresholds.currentMin)} onChange={onThr('currentMin')} placeholder="—" type="number" step="0.001" inputMode="decimal" data-testid="threshold-current-min" />
          <span className="ti-lbl">A</span>
        </span>
        <span className="thresh-input is-current">
          <span className="ti-lbl">i_max</span>
          <input value={fmtThr(thresholds.currentMax)} onChange={onThr('currentMax')} placeholder="—" type="number" step="0.001" inputMode="decimal" data-testid="threshold-current-max" />
          <span className="ti-lbl">A</span>
        </span>
        <span className="thresh-input is-voltage">
          <span className="ti-lbl">v_min</span>
          <input value={fmtThr(thresholds.voltageMin)} onChange={onThr('voltageMin')} placeholder="—" type="number" step="0.01" inputMode="decimal" data-testid="threshold-voltage-min" />
          <span className="ti-lbl">V</span>
        </span>
        <span className="thresh-input is-voltage">
          <span className="ti-lbl">v_max</span>
          <input value={fmtThr(thresholds.voltageMax)} onChange={onThr('voltageMax')} placeholder="—" type="number" step="0.01" inputMode="decimal" data-testid="threshold-voltage-max" />
          <span className="ti-lbl">V</span>
        </span>
      </div>

      <div className="scope-area" role="img" aria-label="Telemetry chart">
        <div className="scope-grid" aria-hidden="true" />
        {!active && (
          <div className="scope-empty">
            <div className="inner">
              <Icon name="pulse" size={32} />
              <h3>No telemetry yet</h3>
              <p>Connect the device to stream live current and voltage, or enable demo mode to preview.</p>
              <button className="btn btn-tinted btn-sm" onClick={() => setShowDemo(true)}>
                <Icon name="play" size={13} />
                Preview demo data
              </button>
            </div>
          </div>
        )}
        {active && viewMode === 'split' && (
          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 0, flex: 1, minHeight: 0 }}>
            <TelemetryChart
              key={`split-current-${windowSec}`}
              series={currentSeries}
              data={splitData(view.cur)}
              height={160}
              thresholds={currentChartThresholds}
              markers={visibleMarkers}
            />
            <TelemetryChart
              key={`split-voltage-${windowSec}`}
              series={voltageSeries}
              data={splitData(view.vol)}
              height={160}
              thresholds={voltageChartThresholds}
              markers={visibleMarkers}
            />
          </div>
        )}
        {active && viewMode === 'combined' && (
          <TelemetryChart
            key={`combined-${windowSec}`}
            series={combinedSeries}
            data={combinedData}
            height={320}
            dualAxis
            thresholds={combinedChartThresholds}
            markers={visibleMarkers}
          />
        )}
      </div>

      <div className="readouts" aria-label="Readouts">
        <div className="readout" data-alert={currentBreach ? 'true' : 'false'}>
          <div className="readout-eyebrow"><span className="ch cur" /> Current · ch1</div>
          <div className="readout-now tnum">
            {fmt(lastCur, 4)}<span className="unit">A</span>
          </div>
          <div className="readout-stats">
            <div><div className="lbl">min</div><div className="val">{fmt(stats.current.min, 4)}</div></div>
            <div><div className="lbl">max</div><div className="val">{fmt(stats.current.max, 4)}</div></div>
            <div><div className="lbl">avg</div><div className="val">{fmt(stats.current.mean, 4)}</div></div>
          </div>
          {currentBreach && <span className="alert-chip">Alert</span>}
        </div>
        <div className="readout" data-alert={voltageBreach ? 'true' : 'false'}>
          <div className="readout-eyebrow"><span className="ch vol" /> Voltage · ch2</div>
          <div className="readout-now tnum">
            {fmt(lastVol, 2)}<span className="unit">V</span>
          </div>
          <div className="readout-stats">
            <div><div className="lbl">min</div><div className="val">{fmt(stats.voltage.min, 2)}</div></div>
            <div><div className="lbl">max</div><div className="val">{fmt(stats.voltage.max, 2)}</div></div>
            <div><div className="lbl">avg</div><div className="val">{fmt(stats.voltage.mean, 2)}</div></div>
          </div>
          {voltageBreach && <span className="alert-chip">Alert</span>}
        </div>
        <div className="readout-meter">
          <div>I draw</div>
          <div className="meter-bar"><span style={{ width: `${iPct}%` }} /></div>
          <div style={{ height: 4 }} />
          <div>V level</div>
          <div className="meter-bar v"><span style={{ width: `${vPct}%` }} /></div>
        </div>
      </div>
    </div>
  )
}
