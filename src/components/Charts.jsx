import React, { useEffect, useMemo, useRef, useState } from 'react'
import serialService from '../services/serialService'
import eventBus from '../services/eventBus'
import TelemetryChart from './TelemetryChart'
import { load, save, isBreach, SETTINGS_KEYS } from '../services/settings'

// Map event source -> CSS variable name for marker color hint.
const SOURCE_COLOR_VAR = {
  conn: '--info',
  ctrl: '--accent',
  err: '--danger',
}

function colorForEvent(evt) {
  // Errors always pop in danger color regardless of source.
  if (evt.level === 'err') return readVar('--danger') || '#ff6e7a'
  const v = SOURCE_COLOR_VAR[evt.source] || '--text-muted'
  return readVar(v) || '#9ba4b6'
}

const RANGE_PRESETS = [
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
]

const VIEW_MODES = [
  { id: 'split', label: 'Split' },
  { id: 'combined', label: 'Combined' },
]

const DEFAULT_THRESHOLDS = {
  currentMin: null,
  currentMax: null,
  voltageMin: null,
  voltageMax: null,
}

// Sanitize a value loaded from localStorage so we don't blow up on bad shapes.
function normalizeThresholds(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_THRESHOLDS }
  const pick = (k) => {
    const v = value[k]
    return typeof v === 'number' && !Number.isNaN(v) ? v : null
  }
  return {
    currentMin: pick('currentMin'),
    currentMax: pick('currentMax'),
    voltageMin: pick('voltageMin'),
    voltageMax: pick('voltageMax'),
  }
}

function readVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function fmt(v, digits = 3) {
  if (v == null || Number.isNaN(v)) return '—'
  const s = Math.sign(v) < 0 ? '-' : ''
  return s + Math.abs(v).toFixed(digits)
}

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString()
}

function fmtThreshold(v) {
  return v === null || v === undefined ? '' : v
}

// Convert a hex/rgb color to a translucent rgba string for threshold lines.
// uPlot draws via canvas so we can pass any valid CSS color.
function withAlpha(color, alpha) {
  if (!color) return `rgba(255,255,255,${alpha})`
  const hex = color.trim()
  // #rgb or #rrggbb
  if (hex.startsWith('#')) {
    let r, g, b
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16)
      g = parseInt(hex[2] + hex[2], 16)
      b = parseInt(hex[3] + hex[3], 16)
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16)
      g = parseInt(hex.slice(3, 5), 16)
      b = parseInt(hex.slice(5, 7), 16)
    } else {
      return color
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  // Assume already an rgb(...) — rough conversion.
  const m = hex.match(/^rgba?\(([^)]+)\)$/i)
  if (m) {
    const parts = m[1].split(',').map(s => s.trim())
    if (parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
    }
  }
  return color
}

function computeStats(values) {
  if (!values.length) return { min: null, max: null, mean: null, last: null }
  let min = values[0], max = values[0], sum = 0
  for (const v of values) {
    if (typeof v !== 'number' || Number.isNaN(v)) continue
    if (v < min) min = v
    if (v > max) max = v
    sum += v
  }
  return { min, max, mean: sum / values.length, last: values[values.length - 1] }
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
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const InfoIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v.01M11 12h1v4h1" />
  </svg>
)

const PlayIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M5 4l7 4-7 4V4Z" />
  </svg>
)

const PauseIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M5 3h2v10H5V3ZM9 3h2v10H9V3Z" />
  </svg>
)

const DownloadIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13.5h10" />
  </svg>
)

export default function Charts() {
  const [connected, setConnected] = useState(serialService.isConnected())
  // Persisted UI settings — initialize from localStorage so they survive reloads.
  const [showDemo, setShowDemo] = useState(() => !!load(SETTINGS_KEYS.showDemo, false))
  const [paused, setPaused] = useState(false) // intentionally NOT persisted
  const [viewMode, setViewMode] = useState(() => {
    const v = load(SETTINGS_KEYS.viewMode, 'split')
    return (v === 'split' || v === 'combined') ? v : 'split'
  })
  const [windowSec, setWindowSec] = useState(() => {
    const v = Number(load(SETTINGS_KEYS.windowSec, 60))
    return Number.isFinite(v) && v > 0 ? v : 60
  })
  const [thresholds, setThresholds] = useState(() => normalizeThresholds(load(SETTINGS_KEYS.thresholds, DEFAULT_THRESHOLDS)))

  const [tick, setTick] = useState(0) // forces re-render of charts on new data
  const [allMarkers, setAllMarkers] = useState([])
  const windowSecRef = useRef(windowSec)
  useEffect(() => { windowSecRef.current = windowSec }, [windowSec])

  // Persist settings whenever they change.
  useEffect(() => { save(SETTINGS_KEYS.windowSec, windowSec) }, [windowSec])
  useEffect(() => { save(SETTINGS_KEYS.viewMode, viewMode) }, [viewMode])
  useEffect(() => { save(SETTINGS_KEYS.showDemo, showDemo) }, [showDemo])
  useEffect(() => { save(SETTINGS_KEYS.thresholds, thresholds) }, [thresholds])

  // Single source of truth — parallel arrays for streaming
  const tsRef = useRef([])           // unix seconds
  const curRef = useRef([])          // amps
  const volRef = useRef([])          // volts
  const lastTsMsRef = useRef(0)
  const pausedSnapshotRef = useRef(null)

  const active = connected || showDemo
  const source = connected ? 'LIVE' : 'DEMO'

  // Telemetry → buffer
  useEffect(() => {
    function ingest(item) {
      const tMs = item.time instanceof Date ? item.time.getTime() : Number(item.time)
      if (!tMs || tMs === lastTsMsRef.current) return
      lastTsMsRef.current = tMs
      const tSec = Math.floor(tMs / 1000)
      tsRef.current.push(tSec)
      curRef.current.push(typeof item.current === 'number' ? item.current : NaN)
      volRef.current.push(typeof item.voltage === 'number' ? item.voltage : NaN)
      // Trim by largest window (15 min) to bound memory
      const cutoff = tSec - 60 * 16
      while (tsRef.current.length && tsRef.current[0] < cutoff) {
        tsRef.current.shift()
        curRef.current.shift()
        volRef.current.shift()
      }
      setTick(n => n + 1)
    }
    serialService.setOnTelemetry(ingest)
    const onConn = (c) => {
      setConnected(!!c)
      if (!c) {
        tsRef.current = []
        curRef.current = []
        volRef.current = []
        lastTsMsRef.current = 0
        pausedSnapshotRef.current = null
        setTick(n => n + 1)
      }
    }
    serialService.addOnConnectionChange(onConn)
    return () => {
      serialService.setOnTelemetry(null)
      serialService.removeOnConnectionChange(onConn)
    }
  }, [])

  // Demo simulation — direct ingestion (covers the case when no device is plugged in)
  useEffect(() => {
    if (!showDemo || connected) return
    let i = 0
    const id = setInterval(() => {
      const now = Date.now()
      const c = Math.sin(now / 1000) * 0.02 - 0.01 + (Math.random() - 0.5) * 0.002
      const v = 5.0 + Math.sin(now / 3000) * 0.05 + (Math.random() - 0.5) * 0.01
      // Reuse same ingest path as telemetry
      const tSec = Math.floor(now / 1000)
      if (tSec === Math.floor(lastTsMsRef.current / 1000)) return
      lastTsMsRef.current = now
      tsRef.current.push(tSec)
      curRef.current.push(c)
      volRef.current.push(v)
      const cutoff = tSec - 60 * 16
      while (tsRef.current.length && tsRef.current[0] < cutoff) {
        tsRef.current.shift()
        curRef.current.shift()
        volRef.current.shift()
      }
      setTick(n => n + 1)
      i++
    }, 250)
    return () => clearInterval(id)
  }, [showDemo, connected])

  // Subscribe to the event bus so we can render markers on the charts.
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
    // seed from existing events
    setAllMarkers(eventBus.getAll().map(toMarker))
    const unsub = eventBus.subscribe((evt) => {
      if (evt == null) {
        // clear() pushes null
        setAllMarkers([])
        return
      }
      setAllMarkers(prev => {
        const next = prev.slice()
        next.push(toMarker(evt))
        // bound memory — keep at most 200 markers (matches eventBus cap)
        if (next.length > 200) next.splice(0, next.length - 200)
        return next
      })
    })
    return unsub
  }, [])

  // Snapshot for pause: captures current arrays at moment of pause
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

  // Slice data by current window — uses snapshot if paused
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
    return {
      ts: src.ts.slice(start),
      cur: src.cur.slice(start),
      vol: src.vol.slice(start),
    }
  }, [tick, paused, windowSec])

  const stats = useMemo(() => ({
    current: computeStats(view.cur.filter(v => typeof v === 'number' && !Number.isNaN(v))),
    voltage: computeStats(view.vol.filter(v => typeof v === 'number' && !Number.isNaN(v))),
  }), [view])

  // Trim markers to the visible window (matches the chart's x-range so markers
  // outside the panned/zoomed view aren't drawn). Uses the data range when
  // present, otherwise a "now - windowSec" fallback so markers can appear
  // before any telemetry arrives.
  const visibleMarkers = useMemo(() => {
    let lo, hi
    if (view.ts.length) {
      hi = view.ts[view.ts.length - 1]
      lo = hi - windowSec
    } else {
      hi = Math.floor(Date.now() / 1000)
      lo = hi - windowSec
    }
    return allMarkers.filter(m => m.ts >= lo && m.ts <= hi + 2)
  }, [allMarkers, view, windowSec])

  const lastUpdate = view.ts.length ? view.ts[view.ts.length - 1] * 1000 : null

  // ---- Breach detection (latest values) ---------------------------------
  const currentBreach = isBreach(stats.current.last, thresholds.currentMin, thresholds.currentMax)
  const voltageBreach = isBreach(stats.voltage.last, thresholds.voltageMin, thresholds.voltageMax)

  // Edge-triggered console.warn so the operator sees breach transitions without
  // spamming the console for every sample. Depends only on the boolean breach
  // states — the warn fires at the rising edge of either breach.
  const prevBreachRef = useRef({ current: false, voltage: false })
  // Latest values are read from a ref to avoid widening the effect's deps.
  const latestForBreachRef = useRef({ current: null, voltage: null })
  latestForBreachRef.current = { current: stats.current.last, voltage: stats.voltage.last }
  const thresholdsForBreachRef = useRef(thresholds)
  thresholdsForBreachRef.current = thresholds
  useEffect(() => {
    if (currentBreach && !prevBreachRef.current.current) {
      const t = thresholdsForBreachRef.current
      console.warn(
        `[picow] current breach: ${latestForBreachRef.current.current} A outside [${t.currentMin}, ${t.currentMax}]`,
      )
    }
    if (voltageBreach && !prevBreachRef.current.voltage) {
      const t = thresholdsForBreachRef.current
      console.warn(
        `[picow] voltage breach: ${latestForBreachRef.current.voltage} V outside [${t.voltageMin}, ${t.voltageMax}]`,
      )
    }
    prevBreachRef.current = { current: currentBreach, voltage: voltageBreach }
  }, [currentBreach, voltageBreach])

  // Series colors via CSS variables (read once per render — re-themes when MutationObserver in TelemetryChart fires)
  const colors = {
    current: readVar('--data-current') || '#ff6e7a',
    voltage: readVar('--data-voltage') || '#5fb8ff',
  }

  const currentSeries = [{ label: 'Current', color: colors.current, unit: 'A', precision: 4 }]
  const voltageSeries = [{ label: 'Voltage', color: colors.voltage, unit: 'V', precision: 2 }]
  const combinedSeries = [
    { label: 'Current', color: colors.current, unit: 'A', precision: 4 },
    { label: 'Voltage', color: colors.voltage, unit: 'V', precision: 2 },
  ]

  // Build threshold line specs for each chart variant. Lines without a value
  // (null) are filtered by TelemetryChart's draw hook automatically, but we
  // omit them here too to keep the prop tidy.
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

  // Combined view: current on y0, voltage on y1.
  const combinedChartThresholds = useMemo(() => {
    const arr = []
    if (typeof thresholds.currentMin === 'number') arr.push({ scale: 'y0', value: thresholds.currentMin, color: currentLineColor })
    if (typeof thresholds.currentMax === 'number') arr.push({ scale: 'y0', value: thresholds.currentMax, color: currentLineColor })
    if (typeof thresholds.voltageMin === 'number') arr.push({ scale: 'y1', value: thresholds.voltageMin, color: voltageLineColor })
    if (typeof thresholds.voltageMax === 'number') arr.push({ scale: 'y1', value: thresholds.voltageMax, color: voltageLineColor })
    return arr
  }, [thresholds, currentLineColor, voltageLineColor])

  // ---- Threshold input handlers -----------------------------------------
  const onThresholdChange = (key) => (e) => {
    const raw = e.target.value
    setThresholds(prev => ({
      ...prev,
      [key]: raw === '' ? null : (Number.isNaN(parseFloat(raw)) ? null : parseFloat(raw)),
    }))
  }

  if (!active) {
    return (
      <section className="empty" aria-label="Telemetry">
        <div className="empty__icon">{InfoIcon}</div>
        <div>
          <div className="empty__title">No telemetry yet</div>
          <div className="empty__desc">
            Connect the device to stream live current and voltage. You can also preview a simulated waveform to see how the charts behave.
          </div>
        </div>
        <button className="btn btn--ghost" onClick={() => setShowDemo(true)}>
          {PlayIcon}
          Preview demo data
        </button>
      </section>
    )
  }

  const splitData = (vals) => [view.ts, vals]
  const combinedData = [view.ts, view.cur, view.vol]

  return (
    <>
      {/* Header strip — status + range + view mode + actions */}
      <section className="card chart-toolbar" aria-label="Telemetry controls">
        <div className="chart-toolbar__left">
          <span className={`status ${paused ? 'status--warn' : (connected ? 'status--connected' : 'status--idle')}`}>
            {paused ? 'Paused' : (connected ? 'Live · ' + source : 'Demo')}
          </span>
          <span className="chart-toolbar__meta">
            {view.ts.length} pts · {lastUpdate ? `last ${fmtTime(lastUpdate)}` : 'awaiting…'}
          </span>
        </div>

        <div className="segmented" role="tablist" aria-label="Time window">
          {RANGE_PRESETS.map(p => (
            <button
              key={p.label}
              role="tab"
              aria-selected={windowSec === p.seconds}
              className={`segmented__btn ${windowSec === p.seconds ? 'is-active' : ''}`}
              onClick={() => setWindowSec(p.seconds)}
            >{p.label}</button>
          ))}
        </div>

        <div className="segmented" role="tablist" aria-label="View mode">
          {VIEW_MODES.map(m => (
            <button
              key={m.id}
              role="tab"
              aria-selected={viewMode === m.id}
              className={`segmented__btn ${viewMode === m.id ? 'is-active' : ''}`}
              onClick={() => setViewMode(m.id)}
            >{m.label}</button>
          ))}
        </div>

        <div className="chart-toolbar__right">
          <button
            type="button"
            className={`btn btn--ghost ${paused ? 'is-paused' : ''}`}
            onClick={() => setPaused(p => !p)}
            title={paused ? 'Resume live updates' : 'Pause live updates'}
          >
            {paused ? PlayIcon : PauseIcon}
            <span>{paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => downloadCsv('picow-telemetry', view.ts, view.cur, view.vol)}
            disabled={!view.ts.length}
            title="Export visible window as CSV"
          >
            {DownloadIcon}
            <span>CSV</span>
          </button>
          <label className="field--check field" htmlFor="demoToggle">
            <input
              id="demoToggle"
              type="checkbox"
              checked={showDemo}
              onChange={e => setShowDemo(e.target.checked)}
            />
            <span className="field__label">Demo</span>
          </label>
        </div>
      </section>

      {/* Thresholds — compact card just below the toolbar. Uses the
          existing settings-bar / field tokens for visual consistency. */}
      <section className="settings-bar thresholds-bar" aria-label="Thresholds">
        <span className="thresholds-bar__title">Thresholds</span>
        <label className="field thresholds-bar__field thresholds-bar__field--current">
          <span className="field__label">Current min (A)</span>
          <input
            className="field__input"
            type="number"
            step="0.001"
            inputMode="decimal"
            placeholder="—"
            value={fmtThreshold(thresholds.currentMin)}
            onChange={onThresholdChange('currentMin')}
            data-testid="threshold-current-min"
          />
        </label>
        <label className="field thresholds-bar__field thresholds-bar__field--current">
          <span className="field__label">Current max (A)</span>
          <input
            className="field__input"
            type="number"
            step="0.001"
            inputMode="decimal"
            placeholder="—"
            value={fmtThreshold(thresholds.currentMax)}
            onChange={onThresholdChange('currentMax')}
            data-testid="threshold-current-max"
          />
        </label>
        <label className="field thresholds-bar__field thresholds-bar__field--voltage">
          <span className="field__label">Voltage min (V)</span>
          <input
            className="field__input"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="—"
            value={fmtThreshold(thresholds.voltageMin)}
            onChange={onThresholdChange('voltageMin')}
            data-testid="threshold-voltage-min"
          />
        </label>
        <label className="field thresholds-bar__field thresholds-bar__field--voltage">
          <span className="field__label">Voltage max (V)</span>
          <input
            className="field__input"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="—"
            value={fmtThreshold(thresholds.voltageMax)}
            onChange={onThresholdChange('voltageMax')}
            data-testid="threshold-voltage-max"
          />
        </label>
      </section>

      {/* Stats grid */}
      <section className="stats-grid" aria-label="Telemetry statistics">
        <StatCard variant="current" label="Current" unit="A" digits={4} stats={stats.current} alert={currentBreach} />
        <StatCard variant="voltage" label="Voltage" unit="V" digits={2} stats={stats.voltage} alert={voltageBreach} />
      </section>

      {/* Charts */}
      {viewMode === 'split' ? (
        <section className="charts-stack">
          <ChartCard title="Current" eyebrow="A" colorVar="--data-current" rangeLabel={`${windowSec}s`}>
            <TelemetryChart
              key={`split-current-${windowSec}`}
              series={currentSeries}
              data={splitData(view.cur)}
              height={220}
              thresholds={currentChartThresholds}
              markers={visibleMarkers}
            />
          </ChartCard>
          <ChartCard title="Voltage" eyebrow="V" colorVar="--data-voltage" rangeLabel={`${windowSec}s`}>
            <TelemetryChart
              key={`split-voltage-${windowSec}`}
              series={voltageSeries}
              data={splitData(view.vol)}
              height={220}
              thresholds={voltageChartThresholds}
              markers={visibleMarkers}
            />
          </ChartCard>
        </section>
      ) : (
        <section className="charts-stack">
          <ChartCard title="Current & Voltage" eyebrow="A · V" colorVar="--accent" rangeLabel={`${windowSec}s · dual axis`}>
            <TelemetryChart
              key={`combined-${windowSec}`}
              series={combinedSeries}
              data={combinedData}
              height={300}
              dualAxis
              thresholds={combinedChartThresholds}
              markers={visibleMarkers}
            />
          </ChartCard>
        </section>
      )}
    </>
  )
}

function StatCard({ variant, label, unit, digits, stats, alert }) {
  return (
    <div className={`metric metric--${variant}${alert ? ' metric--alert' : ''}`} data-testid={`metric-${variant}`}>
      <div className="metric__label">
        <span>{label}</span>
        {alert
          ? <span className="metric__chip metric__chip--alert" data-testid={`alert-${variant}`}>ALERT</span>
          : <span className="metric__chip">{unit}</span>}
      </div>
      <div className="metric__value">
        <span>{fmt(stats.last, digits)}</span>
        <span className="metric__unit">{unit}</span>
      </div>
      <div className="stat-row">
        <span><em>min</em>{fmt(stats.min, digits)}</span>
        <span><em>max</em>{fmt(stats.max, digits)}</span>
        <span><em>avg</em>{fmt(stats.mean, digits)}</span>
      </div>
    </div>
  )
}

function ChartCard({ title, eyebrow, colorVar, rangeLabel, children }) {
  return (
    <div className="card chart-card">
      <div className="chart-card__header">
        <span className="card__title-eyebrow">{eyebrow}</span>
        <span className="chart-card__title">{title}</span>
        <span className="chart-card__legend" style={{ ['--legend-color']: `var(${colorVar})` }}>{rangeLabel}</span>
      </div>
      <div className="chart-card__plot">{children}</div>
    </div>
  )
}
