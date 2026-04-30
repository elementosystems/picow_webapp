import React, { useEffect, useMemo, useRef, useState } from 'react'
import { runScript, loadScripts, saveScripts, newScriptId } from '../services/scriptRunner'
import serialService from '../services/serialService'
import scopeService from '../services/scopeService'

const PlayIcon = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M5 4l7 4-7 4V4Z" />
  </svg>
)

const StopIcon = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <rect x="4" y="4" width="8" height="8" rx="1" />
  </svg>
)

const PlusIcon = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M8 3v10M3 8h10" />
  </svg>
)

const TrashIcon = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M4.5 4l.6 9.1a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9L11.5 4" />
  </svg>
)

function fmtTime(ms) {
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

export default function Scripts() {
  const [scripts, setScripts] = useState(() => loadScripts())
  const [selectedId, setSelectedId] = useState(() => loadScripts()[0]?.id || null)
  const [editorSource, setEditorSource] = useState(() => loadScripts()[0]?.source || '')
  const [editorName, setEditorName] = useState(() => loadScripts()[0]?.name || 'Untitled')
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState([])
  const [deviceConnected, setDeviceConnected] = useState(serialService.isConnected())
  const [scopeConnected, setScopeConnected] = useState(scopeService.isScopeConnected())
  const abortRef = useRef(null)
  const dirtyRef = useRef(false)
  const logTailRef = useRef(null)

  useEffect(() => {
    function onConn(c) { setDeviceConnected(!!c) }
    serialService.addOnConnectionChange(onConn)
    const unsubScope = scopeService.onStatus((s) => {
      if (s.kind === 'scope') setScopeConnected(s.state === 'connected')
    })
    return () => {
      serialService.removeOnConnectionChange(onConn)
      unsubScope()
    }
  }, [])

  // Persist scripts on every list change
  useEffect(() => { saveScripts(scripts) }, [scripts])

  // Auto-scroll log to bottom on new entries
  useEffect(() => {
    if (logTailRef.current) logTailRef.current.scrollTop = logTailRef.current.scrollHeight
  }, [logs])

  const selected = useMemo(() => scripts.find(s => s.id === selectedId) || null, [scripts, selectedId])

  function selectScript(id) {
    if (dirtyRef.current && !confirm('Discard unsaved changes to this script?')) return
    const s = scripts.find(x => x.id === id)
    if (!s) return
    setSelectedId(id)
    setEditorSource(s.source)
    setEditorName(s.name)
    dirtyRef.current = false
  }

  function newScript() {
    const id = newScriptId()
    const s = { id, name: 'Untitled', source: '// Write your script here.\nlog(\'hello\')\n' }
    setScripts(prev => [s, ...prev])
    setSelectedId(id)
    setEditorSource(s.source)
    setEditorName(s.name)
    dirtyRef.current = false
  }

  function saveCurrent() {
    if (!selectedId) return
    setScripts(prev => prev.map(s => s.id === selectedId ? { ...s, name: editorName, source: editorSource } : s))
    dirtyRef.current = false
  }

  function deleteCurrent() {
    if (!selectedId) return
    if (!confirm(`Delete script "${editorName}"?`)) return
    setScripts(prev => {
      const next = prev.filter(s => s.id !== selectedId)
      if (next.length) {
        setSelectedId(next[0].id)
        setEditorSource(next[0].source)
        setEditorName(next[0].name)
      } else {
        setSelectedId(null)
        setEditorSource('')
        setEditorName('Untitled')
      }
      return next
    })
    dirtyRef.current = false
  }

  async function handleRun() {
    if (running) return
    setRunning(true)
    setLogs([])
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const onLog = (entry) => setLogs(prev => [...prev, entry])
    try {
      await runScript(editorSource, { signal: ctrl.signal, onLog })
    } finally {
      abortRef.current = null
      setRunning(false)
    }
  }

  function handleStop() {
    if (abortRef.current) abortRef.current.abort()
  }

  function onSourceChange(e) {
    setEditorSource(e.target.value)
    dirtyRef.current = true
  }
  function onNameChange(e) {
    setEditorName(e.target.value)
    dirtyRef.current = true
  }

  return (
    <section className="card scripts" aria-label="Test scripts">
      <div className="card__header">
        <span className="card__title-eyebrow">RUN</span>
        <span className="card__title">Test scripts</span>
        <span className="scripts__capabilities">
          <span className={`scripts__cap ${deviceConnected ? 'is-on' : ''}`} title="Device connection state">
            <span className="scripts__cap-dot" /> Device
          </span>
          <span className={`scripts__cap ${scopeConnected ? 'is-on' : ''}`} title="Scope connection state">
            <span className="scripts__cap-dot" /> Scope
          </span>
        </span>
      </div>

      <div className="scripts__layout">
        <aside className="scripts__sidebar">
          <button className="btn btn--ghost btn--sm scripts__new" onClick={newScript}>
            {PlusIcon} New
          </button>
          <ul className="scripts__list">
            {scripts.map(s => (
              <li key={s.id} className={`scripts__item ${s.id === selectedId ? 'is-active' : ''}`}>
                <button onClick={() => selectScript(s.id)} title={s.name}>
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="scripts__editor">
          <div className="scripts__editor-head">
            <input
              type="text"
              className="scripts__name-input"
              value={editorName}
              onChange={onNameChange}
              maxLength={100}
              placeholder="Script name"
            />
            <button className="btn btn--ghost btn--sm" onClick={saveCurrent}>Save</button>
            <button className="btn btn--ghost btn--sm btn--icon" onClick={deleteCurrent} title="Delete script">{TrashIcon}</button>
            <span className="scripts__editor-spacer" />
            {!running ? (
              <button className="btn btn--primary btn--sm" onClick={handleRun} disabled={!selected}>
                {PlayIcon} Run
              </button>
            ) : (
              <button className="btn btn--danger btn--sm" onClick={handleStop}>
                {StopIcon} Stop
              </button>
            )}
          </div>
          <textarea
            className="scripts__source"
            value={editorSource}
            onChange={onSourceChange}
            spellCheck={false}
            wrap="off"
            placeholder={'// Available API:\n// ecu(on), flash(on), debug(on), wait(ms), assert(cond, msg?), log(...)\n// scope.measure(metric, channel?), scope.query(cmd), scope.send(cmd)\n//\n// Top-level await is allowed.\n'}
          />
        </div>
      </div>

      <div className="scripts__log" ref={logTailRef} aria-label="Script output">
        {logs.length === 0 && !running && (
          <div className="scripts__log-empty">Run a script to see its output here.</div>
        )}
        {logs.map((l, i) => (
          <div key={i} className={`scripts__log-row scripts__log-row--${l.level}`}>
            <span className="scripts__log-time">{fmtTime(l.at)}</span>
            <span className="scripts__log-msg">{l.msg}</span>
          </div>
        ))}
        {running && (
          <div className="scripts__log-row scripts__log-row--info">
            <span className="scripts__log-time">···</span>
            <span className="scripts__log-msg scripts__log-running">running…</span>
          </div>
        )}
      </div>
    </section>
  )
}
