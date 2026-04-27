import React, { useEffect, useState } from 'react'
import serialService from '../services/serialService'
import eventBus from '../services/eventBus'

const STATE = {
  idle: { label: 'Disconnected', cls: 'status status--idle' },
  connecting: { label: 'Connecting…', cls: 'status status--warn' },
  connected: { label: 'Connected', cls: 'status status--connected' },
  error: { label: 'Connection failed', cls: 'status status--error' },
}

export default function Connection() {
  const [phase, setPhase] = useState(serialService.isConnected() ? 'connected' : 'idle')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    function onConn(c) { setPhase(c ? 'connected' : 'idle') }
    serialService.addOnConnectionChange(onConn)
    return () => serialService.removeOnConnectionChange(onConn)
  }, [])

  async function handleConnect() {
    if (phase === 'connected') {
      try {
        await serialService.disconnect()
        setPhase('idle')
        setErrMsg('')
        eventBus.emit('info', 'conn', 'Device disconnected')
      } catch (err) {
        console.error('Disconnect error', err)
        setPhase('error')
        const msg = err?.message || 'Failed to disconnect'
        setErrMsg(msg)
        eventBus.emit('err', 'conn', 'Disconnect failed: ' + msg)
      }
      return
    }

    setPhase('connecting')
    setErrMsg('')
    try {
      await serialService.requestPort()
      await serialService.connect()
      setPhase('connected')
      eventBus.emit('info', 'conn', 'Device connected')
    } catch (err) {
      console.error('Connect error', err)
      setPhase('error')
      const msg = err?.message || 'Could not open device'
      setErrMsg(msg)
      eventBus.emit('err', 'conn', 'Connect failed: ' + msg)
    }
  }

  const meta = STATE[phase]
  const connected = phase === 'connected'

  if (connected) {
    return (
      <section className="card" aria-label="Device connection">
        <div className="card__header">
          <span className="card__title-eyebrow">Device</span>
          <span className={meta.cls}>{meta.label}</span>
          <div className="card__actions">
            <span className="kbd" title="Vendor ID">VID 0xCAFE</span>
            <button className="btn btn--ghost" onClick={handleConnect}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M5 5l6 6M5 11l6-6"/>
              </svg>
              Disconnect
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="card" aria-label="Device connection">
      <div className="card__body" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-5)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', marginBottom: 'var(--s-2)' }}>
            <span className="card__title-eyebrow">Step 1</span>
            <span className={meta.cls}>{meta.label}</span>
          </div>
          <h2 style={{ marginBottom: 'var(--s-2)' }}>Connect your Pico&nbsp;W</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '54ch' }}>
            Plug the device in over USB and authorize access. Controls and live telemetry
            unlock once a session is established.
          </p>
          {errMsg && (
            <p style={{ color: 'var(--danger)', marginTop: 'var(--s-3)', fontSize: '0.85rem' }}>{errMsg}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center' }}>
          <button
            className="btn btn--primary btn--lg"
            onClick={handleConnect}
            disabled={phase === 'connecting'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4"/>
            </svg>
            {phase === 'connecting' ? 'Connecting…' : 'Connect device'}
          </button>
        </div>
      </div>
    </section>
  )
}
