import React, { useEffect, useRef, useState } from 'react'
import serialService from '../services/serialService'
import eventBus from '../services/eventBus'
import { Icon } from './Icons'

function GPIOSwitch({ label, pin, on, pending, disabled, onClick, sub }) {
  return (
    <div
      className="gpio-switch"
      data-on={on ? 'true' : 'false'}
      data-pending={pending ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : undefined}
    >
      <button
        type="button"
        className="gpio-toggle"
        aria-label={label}
        aria-pressed={on}
        disabled={disabled}
        onClick={onClick}
      />
      <div className="gpio-info">
        <span className="gpio-label">{label}</span>
        <span className="gpio-pin">{pin}</span>
      </div>
      <span className="gpio-led" aria-hidden="true" />
      {sub}
    </div>
  )
}

export default function Controls({ connected, connecting, onConnect }) {
  const [ecuOn, setEcuOn] = useState(false)
  const [delayEnabled, setDelayEnabled] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const [debugOn, setDebugOn] = useState(false)
  const [pendingDelay, setPendingDelay] = useState(false)
  const delayTimerRef = useRef(null)

  useEffect(() => {
    return () => { if (delayTimerRef.current) clearTimeout(delayTimerRef.current) }
  }, [])

  // When the device disconnects, force every output back to OFF locally.
  useEffect(() => {
    if (!connected) {
      setEcuOn(false); setFlashOn(false); setDebugOn(false)
      setPendingDelay(false)
      if (delayTimerRef.current) { clearTimeout(delayTimerRef.current); delayTimerRef.current = null }
    }
  }, [connected])

  function send(name, value) { serialService.sendCommand(name, value) }

  function toggleEcu() {
    if (!connected) return
    const on = !ecuOn
    setEcuOn(on)
    if (on) {
      if (delayEnabled) {
        setPendingDelay(true)
        eventBus.emit('info', 'ctrl', 'ECU 12V arming (10s delay started)')
        delayTimerRef.current = setTimeout(() => {
          send('gpio11', 1); setPendingDelay(false); delayTimerRef.current = null
          eventBus.emit('info', 'ctrl', 'ECU 12V armed (delay fired) -> ON')
        }, 10000)
      } else {
        send('gpio11', 1)
        eventBus.emit('info', 'ctrl', 'ECU 12V -> ON')
      }
    } else {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current); delayTimerRef.current = null
        setPendingDelay(false); eventBus.emit('info', 'ctrl', 'ECU 12V arming cancelled')
      }
      send('gpio11', 0); eventBus.emit('info', 'ctrl', 'ECU 12V -> OFF')
    }
  }

  function toggleFlash() {
    if (!connected) return
    const on = !flashOn
    setFlashOn(on)
    send('gpio13', on ? 1 : 0); send('gpio14', on ? 1 : 0)
    eventBus.emit('info', 'ctrl', 'Flash mode -> ' + (on ? 'BOOT' : 'NORMAL'))
  }

  function toggleDebug() {
    if (!connected) return
    const on = !debugOn
    setDebugOn(on)
    send('gpio12', on ? 1 : 0)
    eventBus.emit('info', 'ctrl', 'Debugger -> ' + (on ? 'ON' : 'OFF'))
  }

  return (
    <div className="gpio-rack" role="toolbar" aria-label="Device controls">
      {!connected && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={onConnect}
          disabled={connecting}
          title="Open Web Serial picker and connect"
        >
          <Icon name="link" size={14} />
          {connecting ? 'Connecting…' : 'Connect Pico W'}
        </button>
      )}
      <GPIOSwitch
        label="ECU 12V"
        pin="GP11 · OUT"
        on={ecuOn}
        pending={pendingDelay}
        disabled={!connected}
        onClick={toggleEcu}
        sub={
          <label className="gpio-sub">
            <input
              type="checkbox"
              checked={delayEnabled}
              disabled={!connected || ecuOn}
              onChange={(e) => setDelayEnabled(e.target.checked)}
            />
            <span>10 s delay</span>
          </label>
        }
      />
      <GPIOSwitch
        label="Flash mode"
        pin="GP13/14 · BOOTSEL"
        on={flashOn}
        disabled={!connected}
        onClick={toggleFlash}
      />
      <GPIOSwitch
        label="Debugger"
        pin="GP12 · OUT"
        on={debugOn}
        disabled={!connected}
        onClick={toggleDebug}
      />
      <span className="spacer" />
    </div>
  )
}
