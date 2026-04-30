import React, { useEffect, useMemo, useState } from 'react'
import sessions from '../services/sessions'
import eventBus from '../services/eventBus'
import serialService from '../services/serialService'
import TelemetryChart from './TelemetryChart'

function fmtBytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / (1024 * 1024)).toFixed(1) + ' MB'
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return sec + 's'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function fmtAt(ms) {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.toLocaleString()
}

const RecordIcon = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <circle cx="6" cy="6" r="4.5" fill="currentColor" />
  </svg>
)

const StopIcon = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="currentColor" />
  </svg>
)

const TrashIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M4.5 4l.6 9.1a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9L11.5 4" />
  </svg>
)

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function Sessions() {
  const [status, setStatus] = useState({ recording: false, sessionId: null, sampleCount: 0, eventCount: 0, startedAt: null })
  const [name, setName] = useState('')
  const [list, setList] = useState([])
  const [tick, setTick] = useState(0)               // forces refresh of duration display
  const [viewing, setViewing] = useState(null)      // { session, samples, events } or null
  const [renaming, setRenaming] = useState(null)    // { id, value }
  const [busy, setBusy] = useState(false)

  // Subscribe to recording status
  useEffect(() => sessions.onStatus(setStatus), [])

  // Refresh list whenever recording stops or after destructive ops
  async function refreshList() {
    try {
      const all = await sessions.listSessions()
      setList(all)
    } catch (e) {
      console.error('[sessions] list failed', e)
    }
  }
  useEffect(() => { refreshList() }, [])
  useEffect(() => {
    // Reload list on stop
    if (!status.recording) refreshList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.recording])

  // Tick for live duration display while recording
  useEffect(() => {
    if (!status.recording) return
    const id = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [status.recording])

  // Pipe live telemetry + events into the session when recording is active.
  useEffect(() => {
    function onTele(item) {
      if (!sessions.isRecording()) return
      const t = item.time instanceof Date ? item.time.getTime() : Number(item.time)
      sessions.appendSample({ t, c: item.current, v: item.voltage })
    }
    function onEvent(evt) {
      if (!evt) return                          // eventBus.clear() fires null
      if (!sessions.isRecording()) return
      sessions.appendEvent(evt)
    }
    serialService.addOnTelemetry(onTele)
    const unsubBus = eventBus.subscribe(onEvent)
    return () => {
      serialService.removeOnTelemetry(onTele)
      unsubBus()
    }
  }, [])

  async function handleStartStop() {
    if (busy) return
    setBusy(true)
    try {
      if (status.recording) {
        await sessions.stopRecording()
      } else {
        await sessions.startRecording(name || undefined)
        setName('')
      }
    } catch (e) {
      console.error('[sessions] start/stop failed', e)
      eventBus.emit('err', 'rec', `Recording failed: ${e.message}`)
    }
    setBusy(false)
  }

  async function handleView(s) {
    try {
      const data = await sessions.loadSession(s.id)
      setViewing(data)
    } catch (e) {
      eventBus.emit('err', 'rec', `Load failed: ${e.message}`)
    }
  }

  async function handleExport(s, fmt) {
    try {
      const { blob, name } = await sessions.exportSession(s.id, fmt)
      downloadBlob(blob, name)
    } catch (e) {
      eventBus.emit('err', 'rec', `Export failed: ${e.message}`)
    }
  }

  async function handleDelete(s) {
    if (!confirm(`Delete session "${s.name}"?`)) return
    try {
      await sessions.deleteSession(s.id)
      await refreshList()
    } catch (e) {
      eventBus.emit('err', 'rec', `Delete failed: ${e.message}`)
    }
  }

  async function handleRenameCommit() {
    if (!renaming) return
    const { id, value } = renaming
    setRenaming(null)
    try {
      await sessions.renameSession(id, value)
      await refreshList()
    } catch (e) {
      eventBus.emit('err', 'rec', `Rename failed: ${e.message}`)
    }
  }

  const liveDuration = status.recording && status.startedAt ? Date.now() - status.startedAt : 0

  return (
    <section className="card sessions" aria-label="Recorded sessions">
      <div className="card__header">
        <span className="card__title-eyebrow">REC</span>
        <span className="card__title">Recording</span>
        {status.recording && (
          <span className="status status--recording" aria-live="polite">
            <span className="status__dot" /> Recording · {fmtDuration(liveDuration)} · {status.sampleCount} samples · {status.eventCount} events
          </span>
        )}
      </div>

      <div className="card__body sessions__controls">
        {!status.recording && (
          <input
            className="sessions__name-input"
            type="text"
            placeholder="Session name (optional)"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={busy}
            maxLength={100}
          />
        )}
        <button
          className={`btn ${status.recording ? 'btn--danger' : 'btn--primary'}`}
          onClick={handleStartStop}
          disabled={busy}
        >
          {status.recording ? StopIcon : RecordIcon}
          {status.recording ? 'Stop recording' : 'Start recording'}
        </button>
        <span className="sessions__hint">
          {status.recording
            ? 'Telemetry + events are being saved to your browser.'
            : 'Records the live telemetry stream and event log to IndexedDB.'}
        </span>
      </div>

      <div className="sessions__list">
        {list.length === 0 ? (
          <div className="sessions__empty">No saved sessions yet.</div>
        ) : (
          <ul>
            {list.map(s => (
              <li key={s.id} className="sessions__row">
                <div className="sessions__row-main">
                  {renaming && renaming.id === s.id ? (
                    <input
                      autoFocus
                      className="sessions__rename"
                      value={renaming.value}
                      onChange={e => setRenaming({ id: s.id, value: e.target.value })}
                      onBlur={handleRenameCommit}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameCommit()
                        else if (e.key === 'Escape') setRenaming(null)
                      }}
                    />
                  ) : (
                    <button
                      className="sessions__name"
                      onClick={() => setRenaming({ id: s.id, value: s.name })}
                      title="Click to rename"
                    >
                      {s.name}
                    </button>
                  )}
                  <span className="sessions__meta">
                    {fmtAt(s.startedAt)} · {fmtDuration(s.endedAt ? s.endedAt - s.startedAt : 0)} · {s.sampleCount || 0} samples · {s.eventCount || 0} events
                  </span>
                </div>
                <div className="sessions__row-actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => handleView(s)}>View</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => handleExport(s, 'csv')}>CSV</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => handleExport(s, 'json')}>JSON</button>
                  <button className="btn btn--ghost btn--sm btn--icon" onClick={() => handleDelete(s)} title="Delete session">
                    {TrashIcon}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {viewing && (
        <SessionViewer data={viewing} onClose={() => setViewing(null)} />
      )}
    </section>
  )
}

// --- Inline viewer — renders the full session as static charts ---------
function SessionViewer({ data, onClose }) {
  const { session, samples, events } = data
  const ts = useMemo(() => samples.map(s => Math.floor(s.t / 1000)), [samples])
  const cur = useMemo(() => samples.map(s => s.c == null ? NaN : s.c), [samples])
  const vol = useMemo(() => samples.map(s => s.v == null ? NaN : s.v), [samples])
  const markers = useMemo(() => events.map(e => ({
    ts: Math.floor(e.t / 1000),
    label: e.message,
    color: e.level === 'err' ? 'var(--danger)' : e.source === 'conn' ? 'var(--info)' : 'var(--accent-strong)',
  })), [events])
  const currentSeries = [{ label: 'Current', color: 'var(--data-current)', unit: 'A', precision: 4 }]
  const voltageSeries = [{ label: 'Voltage', color: 'var(--data-voltage)', unit: 'V', precision: 3 }]

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="sessions__modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Viewing ${session.name}`}>
      <div className="sessions__modal" onClick={e => e.stopPropagation()}>
        <header className="sessions__modal-head">
          <div>
            <div className="sessions__modal-title">{session.name}</div>
            <div className="sessions__modal-sub">
              {fmtAt(session.startedAt)} → {fmtAt(session.endedAt)} · {samples.length} samples · {events.length} events
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
        </header>
        <div className="sessions__modal-body">
          {samples.length === 0 ? (
            <div className="sessions__empty">No samples were captured during this session.</div>
          ) : (
            <>
              <div className="card chart-card">
                <div className="chart-card__header">
                  <span className="card__title-eyebrow">A</span>
                  <span className="chart-card__title">Current</span>
                </div>
                <div className="chart-card__plot">
                  <TelemetryChart series={currentSeries} data={[ts, cur]} markers={markers} height={220} />
                </div>
              </div>
              <div className="card chart-card">
                <div className="chart-card__header">
                  <span className="card__title-eyebrow">V</span>
                  <span className="chart-card__title">Voltage</span>
                </div>
                <div className="chart-card__plot">
                  <TelemetryChart series={voltageSeries} data={[ts, vol]} markers={markers} height={220} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
