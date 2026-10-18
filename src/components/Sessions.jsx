import React, { useEffect, useMemo, useState } from 'react'
import sessions from '../services/sessions'
import eventBus from '../services/eventBus'
import serialService from '../services/serialService'
import TelemetryChart from './TelemetryChart'
import { Icon } from './Icons'

function fmtDuration(ms) {
  if (!ms || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return sec + 's'
  const m = Math.floor(sec / 60); const s = sec % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}
function fmtAt(ms) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString()
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function Sessions() {
  const [status, setStatus] = useState({ recording: false, sessionId: null, sampleCount: 0, eventCount: 0, startedAt: null })
  const [name, setName] = useState('')
  const [list, setList] = useState([])
  const [, setTick] = useState(0)
  const [viewing, setViewing] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => sessions.onStatus(setStatus), [])

  async function refreshList() {
    try { setList(await sessions.listSessions()) }
    catch (e) { console.error('[sessions] list failed', e) }
  }
  useEffect(() => { refreshList() }, [])
  useEffect(() => { if (!status.recording) refreshList() }, [status.recording])

  useEffect(() => {
    if (!status.recording) return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [status.recording])

  useEffect(() => {
    function onTele(item) {
      if (!sessions.isRecording()) return
      const t = item.time instanceof Date ? item.time.getTime() : Number(item.time)
      sessions.appendSample({ t, c: item.current, v: item.voltage })
    }
    function onEvent(evt) {
      if (!evt) return
      if (!sessions.isRecording()) return
      sessions.appendEvent(evt)
    }
    serialService.addOnTelemetry(onTele)
    const unsub = eventBus.subscribe(onEvent)
    return () => { serialService.removeOnTelemetry(onTele); unsub() }
  }, [])

  async function handleStartStop() {
    if (busy) return
    setBusy(true)
    try {
      if (status.recording) await sessions.stopRecording()
      else { await sessions.startRecording(name || undefined); setName('') }
    } catch (e) {
      console.error('[sessions] start/stop failed', e)
      eventBus.emit('err', 'rec', `Recording failed: ${e.message}`)
    }
    setBusy(false)
  }

  async function handleView(s) {
    try { setViewing(await sessions.loadSession(s.id)) }
    catch (e) { eventBus.emit('err', 'rec', `Load failed: ${e.message}`) }
  }
  async function handleExport(s, fmt) {
    try {
      const { blob, name } = await sessions.exportSession(s.id, fmt)
      downloadBlob(blob, name)
    } catch (e) { eventBus.emit('err', 'rec', `Export failed: ${e.message}`) }
  }
  async function handleDelete(s) {
    if (!confirm(`Delete session "${s.name}"?`)) return
    try { await sessions.deleteSession(s.id); await refreshList() }
    catch (e) { eventBus.emit('err', 'rec', `Delete failed: ${e.message}`) }
  }
  async function handleRenameCommit() {
    if (!renaming) return
    const { id, value } = renaming
    setRenaming(null)
    try { await sessions.renameSession(id, value); await refreshList() }
    catch (e) { eventBus.emit('err', 'rec', `Rename failed: ${e.message}`) }
  }

  const liveDuration = status.recording && status.startedAt ? Date.now() - status.startedAt : 0

  return (
    <>
      <div className="pane-toolbar">
        <button
          className={`btn btn-sm ${status.recording ? 'btn-danger' : 'btn-primary'}`}
          onClick={handleStartStop}
          disabled={busy}
        >
          <Icon name={status.recording ? 'stop' : 'record'} size={13} />
          {status.recording ? 'Stop recording' : 'Start recording'}
        </button>
        {!status.recording && (
          <input
            className="flex-grow"
            type="text"
            placeholder="Session name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            maxLength={100}
          />
        )}
        {status.recording && (
          <span className="pane-status" aria-live="polite">
            <span className="dot" />
            REC · {fmtDuration(liveDuration)} · {status.sampleCount} samples · {status.eventCount} events
          </span>
        )}
        <span className="spacer" />
        <span className="lbl">{list.length} saved</span>
      </div>

      <div className="session-list">
        {list.length === 0 ? (
          <div className="empty-row">No saved sessions yet — start recording to capture telemetry.</div>
        ) : list.map((s) => (
          <div key={s.id} className="session-row">
            <div>
              {renaming && renaming.id === s.id ? (
                <input
                  autoFocus
                  className="rename"
                  value={renaming.value}
                  onChange={(e) => setRenaming({ id: s.id, value: e.target.value })}
                  onBlur={handleRenameCommit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameCommit()
                    else if (e.key === 'Escape') setRenaming(null)
                  }}
                />
              ) : (
                <button className="name-btn" onClick={() => setRenaming({ id: s.id, value: s.name })} title="Click to rename">
                  {s.name}
                </button>
              )}
              <div className="meta">
                {fmtAt(s.startedAt)} · {fmtDuration(s.endedAt ? s.endedAt - s.startedAt : 0)} · {s.sampleCount || 0} samples · {s.eventCount || 0} events
              </div>
            </div>
            <div className="actions">
              <button className="btn btn-ghost btn-sm" onClick={() => handleView(s)}>View</button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleExport(s, 'csv')}>CSV</button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleExport(s, 'json')}>JSON</button>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(s)} title="Delete session">
                <Icon name="trash" size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {viewing && <SessionViewer data={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}

function SessionViewer({ data, onClose }) {
  const { session, samples, events } = data
  const ts  = useMemo(() => samples.map((s) => Math.floor(s.t / 1000)), [samples])
  const cur = useMemo(() => samples.map((s) => (s.c == null ? NaN : s.c)), [samples])
  const vol = useMemo(() => samples.map((s) => (s.v == null ? NaN : s.v)), [samples])
  const markers = useMemo(() => events.map((e) => ({
    ts: Math.floor(e.t / 1000),
    label: e.message,
    color: e.level === 'err' ? 'var(--danger)' : e.source === 'conn' ? 'var(--signal-voltage)' : 'var(--accent)',
  })), [events])
  const currentSeries = [{ label: 'Current', color: 'var(--data-current)', unit: 'A', precision: 4 }]
  const voltageSeries = [{ label: 'Voltage', color: 'var(--data-voltage)', unit: 'V', precision: 3 }]

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Viewing ${session.name}`}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="grow">
            <div className="title">{session.name}</div>
            <div className="sub">
              {fmtAt(session.startedAt)} → {fmtAt(session.endedAt)} · {samples.length} samples · {events.length} events
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <Icon name="close" size={13} /> Close
          </button>
        </div>
        <div className="modal-body">
          {samples.length === 0 ? (
            <div className="empty-row">No samples were captured during this session.</div>
          ) : (
            <>
              <div className="card">
                <div className="card-head"><h4>Current</h4></div>
                <div className="card-pad"><TelemetryChart series={currentSeries} data={[ts, cur]} markers={markers} height={220} /></div>
              </div>
              <div className="card">
                <div className="card-head"><h4>Voltage</h4></div>
                <div className="card-pad"><TelemetryChart series={voltageSeries} data={[ts, vol]} markers={markers} height={220} /></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
