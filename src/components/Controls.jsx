import React, { useEffect, useRef, useState } from 'react'
import serialService from '../services/serialService'

function Switch({ id, checked, onChange, label }) {
  return (
    <label className="switch" htmlFor={id} aria-label={label}>
      <input id={id} type="checkbox" checked={checked} onChange={onChange} />
      <span className="switch__track" aria-hidden="true" />
      <span className="switch__thumb" aria-hidden="true" />
    </label>
  )
}

function ToggleRow({ id, title, desc, icon, checked, onChange, children }) {
  return (
    <div className="toggle-row" data-on={checked ? 'true' : 'false'}>
      <div className="toggle-row__icon" aria-hidden="true">{icon}</div>
      <div className="toggle-row__body">
        <div className="toggle-row__title">{title}</div>
        {desc && <div className="toggle-row__desc">{desc}</div>}
        {children}
      </div>
      <Switch id={id} checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

const PowerIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 3v8" /><path d="M5.6 7.4a8 8 0 1 0 12.8 0" />
  </svg>
)
const FlashIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" />
  </svg>
)
const BugIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="8" y="6" width="8" height="14" rx="4" />
    <path d="M12 6V3M5 9l3 1M19 9l-3 1M5 14h3M16 14h3M5 19l3-1M19 19l-3-1" />
  </svg>
)

export default function Controls() {
  const [ecuOn, setEcuOn] = useState(false)
  const [delayEnabled, setDelayEnabled] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const [debugOn, setDebugOn] = useState(false)
  const [pendingDelay, setPendingDelay] = useState(false)
  const [connected, setConnected] = useState(serialService.isConnected())
  const delayTimerRef = useRef(null)

  useEffect(() => {
    function onConn(c) { setConnected(!!c) }
    serialService.addOnConnectionChange(onConn)
    return () => {
      serialService.removeOnConnectionChange(onConn)
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current)
    }
  }, [])

  function sendCommand(name, value) {
    serialService.sendCommand(name, value)
  }

  function toggleEcu(e) {
    const on = e.target.checked
    setEcuOn(on)
    if (on) {
      if (delayEnabled) {
        setPendingDelay(true)
        delayTimerRef.current = setTimeout(() => {
          sendCommand('gpio11', 1)
          setPendingDelay(false)
        }, 10000)
      } else {
        sendCommand('gpio11', 1)
      }
    } else {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current)
        delayTimerRef.current = null
        setPendingDelay(false)
      }
      sendCommand('gpio11', 0)
    }
  }

  function toggleFlash(e) {
    const on = e.target.checked
    setFlashOn(on)
    sendCommand('gpio13', on ? 1 : 0)
    sendCommand('gpio14', on ? 1 : 0)
  }

  function toggleDebug(e) {
    const on = e.target.checked
    setDebugOn(on)
    sendCommand('gpio12', on ? 1 : 0)
  }

  if (!connected) return null

  return (
    <section className="card" aria-label="Device controls">
      <div className="card__header">
        <span className="card__title-eyebrow">02</span>
        <span className="card__title">Device controls</span>
      </div>
      <div className="card__body">
        <div className="controls-grid">
          <ToggleRow
            id="gpio11"
            title="ECU 12V Power"
            desc={pendingDelay ? 'Arming in 10s…' : (ecuOn ? 'Rail energized' : 'Rail off')}
            icon={PowerIcon}
            checked={ecuOn}
            onChange={toggleEcu}
          >
            <label className="sub-option" style={{ marginTop: 'var(--s-3)' }}>
              <input
                type="checkbox"
                checked={delayEnabled}
                onChange={e => setDelayEnabled(e.target.checked)}
              />
              <span>10-second arming delay (on-only)</span>
            </label>
          </ToggleRow>

          <ToggleRow
            id="flashModeToggle"
            title="Flash Mode"
            desc={flashOn ? 'Boot Flash' : 'Normal'}
            icon={FlashIcon}
            checked={flashOn}
            onChange={toggleFlash}
          />

          <ToggleRow
            id="debuggerControlToggle"
            title="Debugger Power"
            desc={debugOn ? 'Probe powered' : 'Probe off'}
            icon={BugIcon}
            checked={debugOn}
            onChange={toggleDebug}
          />
        </div>
      </div>
    </section>
  )
}
