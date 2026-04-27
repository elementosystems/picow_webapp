import React, { useEffect, useRef, useState, useCallback } from 'react'
import serialService from '../services/serialService'

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
    if (v >= 0x20 && v <= 0x7e) out += String.fromCharCode(v)
    else out += '·' // middle dot for non-printable
  }
  return out
}

// Parse a hex string like "0B 01" or "0b01" — whitespace is ignored, must be
// even number of hex nibbles, only [0-9a-fA-F] allowed.
function parseHexInput(str) {
  const cleaned = str.replace(/\s+/g, '')
  if (cleaned.length === 0) return new Uint8Array(0)
  if (cleaned.length % 2 !== 0) throw new Error('Hex string must have an even number of nibbles')
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) throw new Error('Invalid hex characters')
  const out = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.substr(i * 2, 2), 16)
  }
  return out
}

const SCROLL_THRESHOLD_PX = 24

const PauseIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
)
const PlayIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 5l12 7L7 19V5Z" />
  </svg>
)

export default function SerialConsole() {
  const [frames, setFrames] = useState([])
  const [view, setView] = useState('both') // 'both' | 'hex' | 'ascii'
  const [paused, setPaused] = useState(false)
  const [sendMode, setSendMode] = useState('ascii') // 'ascii' | 'hex'
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

  // keep ref in sync so listener (registered once) sees latest paused value
  useEffect(() => { pausedRef.current = paused }, [paused])

  const flushPending = useCallback(() => {
    flushTimerRef.current = null
    if (pendingRef.current.length === 0) return
    const incoming = pendingRef.current
    pendingRef.current = []
    setFrames(prev => {
      let next = prev.concat(incoming)
      if (next.length > MAX_ROWS) next = next.slice(next.length - MAX_ROWS)
      return next
    })
    setCounts(prev => {
      let rx = prev.rx, tx = prev.tx
      for (let i = 0; i < incoming.length; i++) {
        if (incoming[i].dir === 'rx') rx++
        else tx++
      }
      return { rx, tx }
    })
  }, [])

  useEffect(() => {
    function onRaw(frame) {
      if (pausedRef.current) return
      pendingRef.current.push({
        id: ++idCounterRef.current,
        dir: frame.dir,
        data: frame.data,
        time: frame.time
      })
      if (flushTimerRef.current == null) {
        // batch at ~30fps so a flood of USB packets doesn't thrash React
        flushTimerRef.current = setTimeout(flushPending, 33)
      }
    }
    serialService.addRawListener(onRaw)

    function onConn(c) { setConnected(!!c) }
    serialService.addOnConnectionChange(onConn)

    return () => {
      serialService.removeRawListener(onRaw)
      serialService.removeOnConnectionChange(onConn)
      if (flushTimerRef.current != null) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
    }
  }, [flushPending])

  // auto-scroll on new frames if not paused and user hasn't scrolled away
  useEffect(() => {
    if (paused) return
    if (userScrolledUpRef.current) return
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [frames, paused])

  function handleScroll() {
    const el = listRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledUpRef.current = distanceFromBottom > SCROLL_THRESHOLD_PX
  }

  function handleClear() {
    setFrames([])
    setCounts({ rx: 0, tx: 0 })
    pendingRef.current = []
    userScrolledUpRef.current = false
  }

  function handleSend() {
    if (!connected) return
    let bytes
    if (sendMode === 'ascii') {
      if (input.length === 0) return
      bytes = new TextEncoder().encode(input)
    } else {
      try {
        bytes = parseHexInput(input)
        setHexError(false)
      } catch (err) {
        setHexError(true)
        return
      }
      if (bytes.length === 0) return
    }
    serialService.sendRaw(bytes).catch(err => console.error('sendRaw error', err))
    setInput('')
  }

  function handleInputChange(e) {
    const val = e.target.value
    setInput(val)
    if (sendMode === 'hex') {
      if (val.trim().length === 0) { setHexError(false); return }
      try { parseHexInput(val); setHexError(false) } catch (err) { setHexError(true) }
    } else {
      setHexError(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  function changeSendMode(mode) {
    setSendMode(mode)
    if (mode === 'ascii') setHexError(false)
    else if (input.trim().length > 0) {
      try { parseHexInput(input); setHexError(false) } catch (err) { setHexError(true) }
    }
  }

  const sendDisabled = !connected || (sendMode === 'hex' && hexError) || input.length === 0

  const VIEW_MODES = [
    { id: 'both', label: 'Both' },
    { id: 'hex', label: 'Hex' },
    { id: 'ascii', label: 'ASCII' },
  ]

  return (
    <section className="card console" aria-label="Serial console">
      <div className="card__header console__header">
        <span className="card__title-eyebrow">Diag</span>
        <span className="card__title">Serial console</span>
        <span className="console__chip" title="rx / tx frame counts">
          <span className="console__chip-rx">{counts.rx}</span>
          <span className="console__chip-label">rx</span>
          <span className="console__chip-sep">·</span>
          <span className="console__chip-tx">{counts.tx}</span>
          <span className="console__chip-label">tx</span>
        </span>

        <div className="card__actions console__actions">
          <div className="segmented" role="tablist" aria-label="View mode">
            {VIEW_MODES.map(m => (
              <button
                key={m.id}
                role="tab"
                aria-selected={view === m.id}
                className={`segmented__btn ${view === m.id ? 'is-active' : ''}`}
                onClick={() => setView(m.id)}
              >{m.label}</button>
            ))}
          </div>
          <button
            type="button"
            className={`btn btn--ghost ${paused ? 'is-paused' : ''}`}
            onClick={() => setPaused(p => !p)}
            title={paused ? 'Resume capture' : 'Pause capture'}
            aria-pressed={paused}
          >
            {paused ? PlayIcon : PauseIcon}
            <span>{paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleClear}
            title="Clear console"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16" />
              <path d="M9 7V4h6v3" />
              <path d="M6 7l1 13h10l1-13" />
            </svg>
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div
        className="console__body"
        ref={listRef}
        onScroll={handleScroll}
        role="log"
        aria-live="off"
      >
        {frames.length === 0 ? (
          <div className="console__empty">
            {connected ? 'No frames yet — send or wait for traffic.' : 'Connect a device to capture serial traffic.'}
          </div>
        ) : frames.map(f => (
          <div key={f.id} className={`console__row console__row--${f.dir}`}>
            <span className="console__time">{formatTime(f.time)}</span>
            <span className={`console__arrow console__arrow--${f.dir}`} aria-hidden="true">{f.dir === 'tx' ? '→' : '←'}</span>
            {(view === 'both' || view === 'hex') && (
              <span className="console__hex">{bytesToHex(f.data)}</span>
            )}
            {(view === 'both' || view === 'ascii') && (
              <span className="console__ascii">{bytesToAscii(f.data)}</span>
            )}
          </div>
        ))}
      </div>

      <div className="console__form">
        <div className="tabs" role="tablist" aria-label="Send mode">
          <button
            type="button"
            role="tab"
            aria-selected={sendMode === 'ascii'}
            className={`tabs__btn ${sendMode === 'ascii' ? 'is-active' : ''}`}
            onClick={() => changeSendMode('ascii')}
          >ASCII</button>
          <button
            type="button"
            role="tab"
            aria-selected={sendMode === 'hex'}
            className={`tabs__btn ${sendMode === 'hex' ? 'is-active' : ''}`}
            onClick={() => changeSendMode('hex')}
          >Hex</button>
        </div>
        <input
          type="text"
          className={`console__input ${hexError ? 'is-invalid' : ''}`}
          placeholder={sendMode === 'ascii' ? 'Type ASCII to send…' : 'Hex bytes, e.g. 0B 01'}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          disabled={!connected}
        />
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSend}
          disabled={sendDisabled}
        >Send</button>
        {!connected && (
          <span className="console__hint">connect device first</span>
        )}
      </div>
    </section>
  )
}
