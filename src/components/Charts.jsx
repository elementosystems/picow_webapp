import React, { useEffect, useMemo, useRef, useState } from 'react'
import serialService from '../services/serialService'
import TelemetryChart from './TelemetryChart'

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

const ResetIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="M3 8a5 5 0 1 0 1.6-3.6" />
    <path d="M3 3v3h3" />
  </svg>
)

export default function Charts() {
  const [connected, setConnected] = useState(serialService.isConnected())
  const [showDemo, setShowDemo] = useState(false)
  const [paused, setPaused] = useState(false)
  const [viewMode, setViewMode] = useState('split')
  const [windowSec, setWindowSec] = useState(60)
  const [tick, setTick] = useState(0) // forces re-render of charts on new data

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

  const lastUpdate = view.ts.length ? view.ts[view.ts.length - 1] * 1000 : null

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

      {/* Stats grid */}
      <section className="stats-grid" aria-label="Telemetry statistics">
        <StatCard variant="current" label="Current" unit="A" digits={4} stats={stats.current} />
        <StatCard variant="voltage" label="Voltage" unit="V" digits={2} stats={stats.voltage} />
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
            />
          </ChartCard>
          <ChartCard title="Voltage" eyebrow="V" colorVar="--data-voltage" rangeLabel={`${windowSec}s`}>
            <TelemetryChart
              key={`split-voltage-${windowSec}`}
              series={voltageSeries}
              data={splitData(view.vol)}
              height={220}
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
            />
          </ChartCard>
        </section>
      )}
    </>
  )
}

function StatCard({ variant, label, unit, digits, stats }) {
  return (
    <div className={`metric metric--${variant}`}>
      <div className="metric__label">
        <span>{label}</span>
        <span className="metric__chip">{unit}</span>
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
