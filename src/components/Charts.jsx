import React, { useEffect, useRef, useState } from 'react'
import Plot from 'react-plotly.js'
import serialService from '../services/serialService'

export default function Charts() {
  const [currentData, setCurrentData] = useState([])
  const [voltageData, setVoltageData] = useState([])

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

    // If device not connected, simulate data so graph UI can be verified
    let simInterval = null
    if (!serialService.isConnected()) {
      simInterval = setInterval(() => {
        const now = new Date()
        const simulatedCurrent = (Math.sin(now.getTime() / 1000) * 0.02 - 0.01).toFixed(4)
        const simulatedVoltage = (5.0 + Math.sin(now.getTime() / 3000) * 0.05).toFixed(3)
        onTelemetry({ time: now, current: parseFloat(simulatedCurrent), voltage: parseFloat(simulatedVoltage) })
      }, 1000)
    }

    return () => {
      serialService.setOnTelemetry(null)
      if (simInterval) clearInterval(simInterval)
    }
  }, [])

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
