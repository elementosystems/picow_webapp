import React, { useState, useEffect } from 'react'
import serialService from '../services/serialService'

export default function Controls() {
  const [ecuOn, setEcuOn] = useState(false)
  const [delayEnabled, setDelayEnabled] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const [debugOn, setDebugOn] = useState(false)
  const [connected, setConnected] = useState(serialService.isConnected())

  useEffect(() => {
    function onConn(c) { setConnected(!!c) }
    serialService.addOnConnectionChange(onConn)
    return () => serialService.removeOnConnectionChange(onConn)
  }, [])

  function sendCommand(name, value) {
    serialService.sendCommand(name, value)
  }

  function toggleEcu(e) {
    const on = e.target.checked
    setEcuOn(on)
    if (on) {
      if (delayEnabled) {
        // simple client-side delay behavior
        setTimeout(() => sendCommand('gpio11', 1), 10000)
      } else {
        sendCommand('gpio11', 1)
      }
    } else {
      sendCommand('gpio11', 0)
    }
  }

  if (!connected) return null

  return (
    <section id="gpioControls" style={{display: 'block'}}>
      <h2>Device Controls</h2>
      <div id="powerControl" className="device-section">
        <h3>ECU 12V Power</h3>
        <label className="toggle">
          <input type="checkbox" id="gpio11" checked={ecuOn} onChange={toggleEcu} />
          <span className="slider round"></span>
          <span style={{marginLeft: 8}}>ECU 12V</span>
        </label>
        <div className="delay-option" style={{textAlign: 'center'}}>
          <label>
            <input type="checkbox" id="ecuDelayOption" checked={delayEnabled} onChange={e => setDelayEnabled(e.target.checked)} />
            Activate 10-second delay (for 12V On only)
          </label>
        </div>
      </div>

      <div id="flashModes" className="device-section">
        <h3>Flash Mode</h3>
        <label className="toggle">
          <input type="checkbox" id="flashModeToggle" checked={flashOn} onChange={e => { setFlashOn(e.target.checked); sendCommand('gpio13', e.target.checked ? 1 : 0); sendCommand('gpio14', e.target.checked ? 1 : 0); }} />
          <span className="slider round"></span>
          <span style={{marginLeft: 8}}>Boot Flash</span>
        </label>
      </div>

      <div id="debuggerControl" className="device-section">
        <h3>Debugger Power</h3>
        <label className="toggle">
          <input type="checkbox" id="debuggerControlToggle" checked={debugOn} onChange={e => { setDebugOn(e.target.checked); sendCommand('gpio12', e.target.checked ? 1 : 0); }} />
          <span className="slider round"></span>
          <span style={{marginLeft: 8}}>Debugger</span>
        </label>
      </div>
    </section>
  )
}
