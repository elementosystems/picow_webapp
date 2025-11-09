import React, { useEffect, useRef, useState } from 'react'
import Plot from 'react-plotly.js'
import serialService from '../services/serialService'

export default function Charts() {
  const [currentData, setCurrentData] = useState([])
  const [voltageData, setVoltageData] = useState([])
  const [connected, setConnected] = useState(serialService.isConnected())
  const [showDemo, setShowDemo] = useState(false)

  useEffect(() => {
    // Handler called when parsed telemetry is received
    function onTelemetry(item) {
      const t = new Date(item.time)
      if (typeof item.current === 'number') {
        setCurrentData(prev => [...prev.slice(-299), { x: t, y: item.current }])
      }
      if (typeof item.voltage === 'number') {
        setVoltageData(prev => [...prev.slice(-299), { x: t, y: item.voltage }])
      }
    }

    serialService.setOnTelemetry(onTelemetry)

    // subscribe to connection changes so we can hide/show charts
    function onConn(c) {
      setConnected(!!c)
      // clear data when newly disconnected
      if (!c) {
        setCurrentData([])
        setVoltageData([])
      }
    }
    serialService.addOnConnectionChange(onConn)

    // If device not connected and demo requested, simulate data so graph UI can be verified
    let simInterval = null
    if (!serialService.isConnected() && showDemo) {
      simInterval = setInterval(() => {
        const now = new Date()
        const simulatedCurrent = (Math.sin(now.getTime() / 1000) * 0.02 - 0.01).toFixed(4)
        const simulatedVoltage = (5.0 + Math.sin(now.getTime() / 3000) * 0.05).toFixed(3)
        onTelemetry({ time: now, current: parseFloat(simulatedCurrent), voltage: parseFloat(simulatedVoltage) })
      }, 1000)
    }

    return () => {
      serialService.setOnTelemetry(null)
      // Note: serialService currently accumulates connection callbacks; we do not remove here
      if (simInterval) clearInterval(simInterval)
    }
    // include showDemo so simulation starts/stops when toggled
  }, [showDemo])

  // If not connected and not showing demo data, show a placeholder and a toggle
  if (!connected && !showDemo) {
    return (
      <div style={{textAlign: 'center', padding: 20}}>
        <p>Device not connected. Connect the Pico W to view live voltage and current graphs.</p>
        <label style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
          <input type="checkbox" checked={showDemo} onChange={e => setShowDemo(e.target.checked)} />
          <span>Show demo data</span>
        </label>
      </div>
    )
  }

  return (
    <div>
      <section id="currentSection">
        <h3>Current</h3>
        <Plot
          data={[{ x: currentData.map(p => p.x), y: currentData.map(p => p.y), type: 'scatter', mode: 'lines', marker: {color: 'red'} }]}
          layout={{ autosize: true, height: 300, yaxis: { title: 'Current (A)' }, xaxis: { title: 'Time' } }}
          useResizeHandler={true}
          style={{width: '100%'}}
        />
      </section>

      <section id="voltageSection">
        <h3>Voltage</h3>
        <Plot
          data={[{ x: voltageData.map(p => p.x), y: voltageData.map(p => p.y), type: 'scatter', mode: 'lines', marker: {color: 'blue'} }]}
          layout={{ autosize: true, height: 300, yaxis: { title: 'Voltage (V)' }, xaxis: { title: 'Time' } }}
          useResizeHandler={true}
          style={{width: '100%'}}
        />
      </section>
    </div>
  )
}
