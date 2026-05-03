import React, { useEffect, useMemo, useRef, useState } from 'react'
import { runScript, loadScripts, saveScripts, newScriptId } from '../services/scriptRunner'
import serialService from '../services/serialService'
import scopeService from '../services/scopeService'
import { Icon } from './Icons'

function fmtTime(ms) {
  const d = new Date(ms)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  const ms3 = String(d.getMilliseconds()).padStart(3, '0')
  return `${h}:${m}:${s}.${ms3}`
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
    return () => { serialService.removeOnConnectionChange(onConn); unsubScope() }
  }, [])

  useEffect(() => { saveScripts(scripts) }, [scripts])

  useEffect(() => {
    if (logTailRef.current) logTailRef.current.scrollTop = logTailRef.current.scrollHeight
  }, [logs])

  const selected = useMemo(() => scripts.find((s) => s.id === selectedId) || null, [scripts, selectedId])

  function selectScript(id) {
    if (dirtyRef.current && !confirm('Discard unsaved changes to this script?')) return
    const s = scripts.find((x) => x.id === id); if (!s) return
    setSelectedId(id); setEditorSource(s.source); setEditorName(s.name); dirtyRef.current = false
  }
  function newScript() {
    const id = newScriptId()
    const s = { id, name: 'Untitled', source: '// Write your script here.\nlog(\'hello\')\n' }
    setScripts((prev) => [s, ...prev])
    setSelectedId(id); setEditorSource(s.source); setEditorName(s.name); dirtyRef.current = false
  }
  function saveCurrent() {
    if (!selectedId) return
    setScripts((prev) => prev.map((s) => s.id === selectedId ? { ...s, name: editorName, source: editorSource } : s))
    dirtyRef.current = false
  }
  function deleteCurrent() {
    if (!selectedId) return
    if (!confirm(`Delete script "${editorName}"?`)) return
    setScripts((prev) => {
      const next = prev.filter((s) => s.id !== selectedId)
      if (next.length) {
        setSelectedId(next[0].id); setEditorSource(next[0].source); setEditorName(next[0].name)
      } else {
        setSelectedId(null); setEditorSource(''); setEditorName('Untitled')
      }
      return next
    })
    dirtyRef.current = false
  }
  async function handleRun() {
    if (running) return
    setRunning(true); setLogs([])
    const ctrl = new AbortController(); abortRef.current = ctrl
    const onLog = (entry) => setLogs((prev) => [...prev, entry])
    try { await runScript(editorSource, { signal: ctrl.signal, onLog }) }
    finally { abortRef.current = null; setRunning(false) }
  }
  function handleStop() { if (abortRef.current) abortRef.current.abort() }

  return (
    <>
      <div className="pane-toolbar">
        <span className="lbl">Scripts</span>
        <span className="spacer" />
        <span className={`scripts-cap ${deviceConnected ? 'is-on' : ''}`} title="Device connection state">
          <span className="dot" /> Device
        </span>
        <span className={`scripts-cap ${scopeConnected ? 'is-on' : ''}`} title="Scope connection state">
          <span className="dot" /> Scope
        </span>
      </div>

      <div className="scripts-layout">
        <aside className="scripts-sidebar" aria-label="Script list">
          <div className="scripts-sidebar-head">
            <button className="btn btn-secondary btn-sm" onClick={newScript}>
              <Icon name="plus" size={12} /> New
            </button>
          </div>
          <ul className="scripts-sidebar-list">
            {scripts.map((s) => (
              <li key={s.id} className={s.id === selectedId ? 'is-active' : ''}>
                <button onClick={() => selectScript(s.id)} title={s.name}>{s.name}</button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="scripts-editor">
          <div className="scripts-editor-head">
            <input
              type="text"
              className="scripts-name-input"
              value={editorName}
              onChange={(e) => { setEditorName(e.target.value); dirtyRef.current = true }}
              maxLength={100}
              placeholder="Script name"
            />
            <button className="btn btn-ghost btn-sm" onClick={saveCurrent}>Save</button>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={deleteCurrent} title="Delete script">
              <Icon name="trash" size={13} />
            </button>
            <span className="spacer" />
            {!running ? (
              <button className="btn btn-primary btn-sm" onClick={handleRun} disabled={!selected}>
                <Icon name="play" size={12} /> Run
              </button>
            ) : (
              <button className="btn btn-danger btn-sm" onClick={handleStop}>
                <Icon name="stop" size={12} /> Stop
              </button>
            )}
          </div>
          <textarea
            className="scripts-source"
            value={editorSource}
            onChange={(e) => { setEditorSource(e.target.value); dirtyRef.current = true }}
            spellCheck={false}
            wrap="off"
            placeholder={'// Available API:\n// ecu(on), flash(on), debug(on), wait(ms), assert(cond, msg?), log(...)\n// scope.measure(metric, channel?), scope.query(cmd), scope.send(cmd)\n//\n// Top-level await is allowed.\n'}
          />
          <div className="scripts-log" ref={logTailRef} aria-label="Script output">
            {logs.length === 0 && !running && (
              <div className="scripts-log-empty">Run a script to see its output here.</div>
            )}
            {logs.map((l, i) => (
              <div key={i} className={`scripts-log-row lvl-${l.level || 'info'}`}>
                <span className="t">{fmtTime(l.at)}</span>
                <span className="m">{l.msg}</span>
              </div>
            ))}
            {running && (
              <div className="scripts-log-row lvl-info">
                <span className="t">···</span>
                <span className="m">running…</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
