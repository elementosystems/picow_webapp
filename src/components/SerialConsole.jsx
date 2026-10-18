import React, { useCallback, useEffect, useRef, useState } from 'react'
import serialService from '../services/serialService'
import { Icon } from './Icons'

const MAX_ROWS = 500

function pad2(n) { return n < 10 ? '0' + n : '' + n }
function pad3(n) { return n < 10 ? '00' + n : (n < 100 ? '0' + n : '' + n) }
function formatTime(d) {
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + '.' + pad3(d.getMilliseconds())
}
function bytesToHex(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0) out += ' '
    const v = bytes[i]
    out += (v < 0x10 ? '0' : '') + v.toString(16).toUpperCase()
  }
  return out
}
function bytesToAscii(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i]
    out += (v >= 0x20 && v <= 0x7e) ? String.fromCharCode(v) : '·'
  }
  return out
}
function parseHexInput(str) {
  const cleaned = str.replace(/\s+/g, '')
  if (cleaned.length === 0) return new Uint8Array(0)
  if (cleaned.length % 2 !== 0) throw new Error('Hex string must have an even number of nibbles')
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) throw new Error('Invalid hex characters')
  const out = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(cleaned.substr(i * 2, 2), 16)
  return out
}

const SCROLL_THRESHOLD_PX = 24

const VIEW_MODES = [
  { id: 'both',  label: 'Both' },
  { id: 'hex',   label: 'Hex' },
  { id: 'ascii', label: 'ASCII' },
]

export default function SerialConsole() {
  const [frames, setFrames] = useState([])
  const [view, setView] = useState('both')
  const [paused, setPaused] = useState(false)
  const [sendMode, setSendMode] = useState('ascii')
  const [input, setInput] = useState('')
  const [hexError, setHexError] = useState(false)
  const [connected, setConnected] = useState(serialService.isConnected())
  const [counts, setCounts] = useState({ rx: 0, tx: 0 })

  const listRef = useRef(null)
  const pausedRef = useRef(paused)
  const pendingRef = useRef([])
  const flushTimerRef = useRef(null)
  const userScrolledUpRef = useRef(false)
  const idCounterRef = useRef(0)

  useEffect(() => { pausedRef.current = paused }, [paused])

  const flushPending = useCallback(() => {
    flushTimerRef.current = null
    if (pendingRef.current.length === 0) return
    const incoming = pendingRef.current; pendingRef.current = []
    setFrames((prev) => {
      let next = prev.concat(incoming)
      if (next.length > MAX_ROWS) next = next.slice(next.length - MAX_ROWS)
      return next
    })
    setCounts((prev) => {
      let rx = prev.rx, tx = prev.tx
      for (let i = 0; i < incoming.length; i++) {
        if (incoming[i].dir === 'rx') rx++; else tx++
      }
      return { rx, tx }
    })
  }, [])

  useEffect(() => {
    function onRaw(frame) {
      if (pausedRef.current) return
      pendingRef.current.push({ id: ++idCounterRef.current, dir: frame.dir, data: frame.data, time: frame.time })
      if (flushTimerRef.current == null) flushTimerRef.current = setTimeout(flushPending, 33)
    }
    serialService.addRawListener(onRaw)
    function onConn(c) { setConnected(!!c) }
    serialService.addOnConnectionChange(onConn)
    return () => {
      serialService.removeRawListener(onRaw)
      serialService.removeOnConnectionChange(onConn)
      if (flushTimerRef.current != null) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null }
    }
  }, [flushPending])

  useEffect(() => {
    if (paused) return
    if (userScrolledUpRef.current) return
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [frames, paused])

  function handleScroll() {
    const el = listRef.current; if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledUpRef.current = distanceFromBottom > SCROLL_THRESHOLD_PX
  }
  function handleClear() {
    setFrames([]); setCounts({ rx: 0, tx: 0 })
    pendingRef.current = []; userScrolledUpRef.current = false
  }
  function handleSend() {
    if (!connected) return
    let bytes
    if (sendMode === 'ascii') {
      if (input.length === 0) return
      bytes = new TextEncoder().encode(input)
    } else {
      try { bytes = parseHexInput(input); setHexError(false) }
      catch { setHexError(true); return }
      if (bytes.length === 0) return
    }
    serialService.sendRaw(bytes).catch((err) => console.error('sendRaw error', err))
    setInput('')
  }
  function handleInputChange(e) {
    const val = e.target.value
    setInput(val)
    if (sendMode === 'hex') {
      if (val.trim().length === 0) { setHexError(false); return }
      try { parseHexInput(val); setHexError(false) } catch { setHexError(true) }
    } else setHexError(false)
  }
  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); handleSend() }
  }
  function changeSendMode(mode) {
    setSendMode(mode)
    if (mode === 'ascii') setHexError(false)
    else if (input.trim().length > 0) {
      try { parseHexInput(input); setHexError(false) } catch { setHexError(true) }
    }
  }

  const sendDisabled = !connected || (sendMode === 'hex' && hexError) || input.length === 0

  return (
    <>
      <div className="pane-toolbar">
        <span className="lbl">Serial</span>
        <span className="serial-chip" title="rx / tx frame counts">
          <span className="rx-c tnum">{counts.rx}</span><span className="lbl">rx</span>
          <span className="sep">·</span>
          <span className="tx-c tnum">{counts.tx}</span><span className="lbl">tx</span>
        </span>
        <span className="spacer" />
        <div className="filter-group" role="tablist" aria-label="View mode">
          {VIEW_MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={view === m.id}
              data-active={view === m.id}
              onClick={() => setView(m.id)}
            >{m.label}</button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setPaused((p) => !p)} aria-pressed={paused} title={paused ? 'Resume capture' : 'Pause capture'}>
          <Icon name={paused ? 'play' : 'pause'} size={13} />
          <span>{paused ? 'Resume' : 'Pause'}</span>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleClear}>
          <Icon name="trash" size={13} /> Clear
        </button>
      </div>

      <div className="serial-pane">
        <div className="serial-body" ref={listRef} onScroll={handleScroll} role="log" aria-live="off">
          {frames.length === 0 ? (
            <div className="empty-row">
              {connected ? 'No frames yet — send or wait for traffic.' : 'Connect a device to capture serial traffic.'}
            </div>
          ) : frames.map((f) => (
            <div key={f.id} className={`serial-row dir-${f.dir}`}>
              <span className="t">{formatTime(f.time)}</span>
              <span className="arrow" aria-hidden="true">{f.dir === 'tx' ? '→' : '←'}</span>
              <span className="body">
                {(view === 'both' || view === 'hex')   && <span className="hex">{bytesToHex(f.data)}</span>}
                {(view === 'both' || view === 'ascii') && <span className="ascii">{bytesToAscii(f.data)}</span>}
              </span>
            </div>
          ))}
        </div>

        <div className="serial-form">
          <div className="mode-tabs" role="tablist" aria-label="Send mode">
            <button role="tab" aria-selected={sendMode === 'ascii'} data-active={sendMode === 'ascii'} onClick={() => changeSendMode('ascii')}>ASCII</button>
            <button role="tab" aria-selected={sendMode === 'hex'} data-active={sendMode === 'hex'} onClick={() => changeSendMode('hex')}>Hex</button>
          </div>
          <input
            type="text"
            className={hexError ? 'invalid' : ''}
            placeholder={sendMode === 'ascii' ? 'Type ASCII to send…' : 'Hex bytes, e.g. 0B 01'}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            disabled={!connected}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSend} disabled={sendDisabled}>Send</button>
        </div>
      </div>
    </>
  )
}
