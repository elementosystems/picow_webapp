import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createChart } from 'lightweight-charts'
import serialService from '../services/serialService'

function toLightTime(date) {
  // lightweight-charts expects time in seconds (number) or string date. Use unix seconds.
  return Math.floor(new Date(date).getTime() / 1000)
}

export default function Charts() {
  const currentRef = useRef(null)
  const voltageRef = useRef(null)
  const currentChartRef = useRef(null)
  const voltageChartRef = useRef(null)
  const currentSeriesRef = useRef(null)
  const voltageSeriesRef = useRef(null)

  const [connected, setConnected] = useState(serialService.isConnected())
  const [showDemo, setShowDemo] = useState(false)
  const [sampleRate, setSampleRate] = useState(1) // seconds
  const [windowSeconds, setWindowSeconds] = useState(60) // time window to show

  // buffers and latest telemetry
  const latestTelemetryRef = useRef({})
  const lastProcessedTimeRef = useRef(null) // track last processed telemetry time to avoid duplicates
  const currentBufferRef = useRef([])
  const voltageBufferRef = useRef([])

  useEffect(() => {
    const onTelemetry = (item) => {
      // store latest telemetry in ref; actual chart updates happen at the configured sampleRate
      latestTelemetryRef.current = item
    }

    serialService.setOnTelemetry(onTelemetry)

    const onConn = (c) => {
      setConnected(!!c)
      if (!c) {
        // clear charts when disconnected
        if (currentChartRef.current) currentChartRef.current.remove()
        if (voltageChartRef.current) voltageChartRef.current.remove()
        currentChartRef.current = null
        voltageChartRef.current = null
        currentSeriesRef.current = null
        voltageSeriesRef.current = null
        // clear buffers on disconnect
        currentBufferRef.current = []
        voltageBufferRef.current = []
        lastProcessedTimeRef.current = null
      } else {
        // create charts when device connects
        if (!currentChartRef.current && currentRef.current) {
          const chart = createChart(currentRef.current, { width: currentRef.current.clientWidth, height: 240 })
          const series = chart.addLineSeries({ color: 'red' })
          currentChartRef.current = chart
          currentSeriesRef.current = series
        }
        if (!voltageChartRef.current && voltageRef.current) {
          const chart = createChart(voltageRef.current, { width: voltageRef.current.clientWidth, height: 240 })
          const series = chart.addLineSeries({ color: 'blue' })
          voltageChartRef.current = chart
          voltageSeriesRef.current = series
        }
      }
    }

    serialService.addOnConnectionChange(onConn)

    // On mount: create charts if already connected
    if (serialService.isConnected()) {
      if (!currentChartRef.current && currentRef.current) {
        const chart = createChart(currentRef.current, { width: currentRef.current.clientWidth, height: 240 })
        const series = chart.addLineSeries({ color: 'red' })
        currentChartRef.current = chart
        currentSeriesRef.current = series
      }
      if (!voltageChartRef.current && voltageRef.current) {
        const chart = createChart(voltageRef.current, { width: voltageRef.current.clientWidth, height: 240 })
        const series = chart.addLineSeries({ color: 'blue' })
        voltageChartRef.current = chart
        voltageSeriesRef.current = series
      }
    }

    // periodic updater - drives chart updates at sampleRate
    let updateInterval = null
    // simulation interval (if demo)
    let simInterval = null

    function pushTelemetryToBuffers(item) {
      const now = toLightTime(item.time)
      // only push values that actually exist (current and voltage come in separate lines)
      if (typeof item.current === 'number') {
        currentBufferRef.current.push({ time: now, value: item.current })
      }
      if (typeof item.voltage === 'number') {
        voltageBufferRef.current.push({ time: now, value: item.voltage })
      }
      // trim old data from both buffers
      const cutoff = now - windowSeconds
      while (currentBufferRef.current.length && currentBufferRef.current[0].time < cutoff) currentBufferRef.current.shift()
      while (voltageBufferRef.current.length && voltageBufferRef.current[0].time < cutoff) voltageBufferRef.current.shift()
      // update series data
      if (currentSeriesRef.current) currentSeriesRef.current.setData(currentBufferRef.current.map(p => ({ time: p.time, value: p.value })))
      if (voltageSeriesRef.current) voltageSeriesRef.current.setData(voltageBufferRef.current.map(p => ({ time: p.time, value: p.value })))
    }

    // If not connected and showDemo, create charts in demo mode
    if (!serialService.isConnected() && showDemo) {
      // create demo charts if not present
      if (!currentChartRef.current && currentRef.current) {
        const chart = createChart(currentRef.current, { width: currentRef.current.clientWidth, height: 240 })
        currentChartRef.current = chart
        currentSeriesRef.current = chart.addLineSeries({ color: 'red' })
      }
      if (!voltageChartRef.current && voltageRef.current) {
        const chart = createChart(voltageRef.current, { width: voltageRef.current.clientWidth, height: 240 })
        voltageChartRef.current = chart
        voltageSeriesRef.current = chart.addLineSeries({ color: 'blue' })
      }
      simInterval = setInterval(() => {
        const now = Date.now()
        const simulatedCurrent = (Math.sin(now / 1000) * 0.02 - 0.01)
        const simulatedVoltage = (5.0 + Math.sin(now / 3000) * 0.05)
        pushTelemetryToBuffers({ time: now, current: simulatedCurrent, voltage: simulatedVoltage })
      }, 1000)
    }

    // start periodic updater that consumes latestTelemetryRef at sampleRate
    updateInterval = setInterval(() => {
      const item = latestTelemetryRef.current
      const itemTime = item && item.time ? item.time.getTime() : null
      // only push if new data and has current or voltage
      if (itemTime && itemTime !== lastProcessedTimeRef.current && (typeof item.current === 'number' || typeof item.voltage === 'number')) {
        pushTelemetryToBuffers(item)
        lastProcessedTimeRef.current = itemTime
      }
    }, Math.max(100, sampleRate * 1000))

    return () => {
      serialService.setOnTelemetry(null)
      serialService.removeOnConnectionChange(onConn)
      if (simInterval) clearInterval(simInterval)
      if (updateInterval) clearInterval(updateInterval)
      if (currentChartRef.current) { currentChartRef.current.remove(); currentChartRef.current = null }
      if (voltageChartRef.current) { voltageChartRef.current.remove(); voltageChartRef.current = null }
    }
  }, [showDemo, sampleRate, windowSeconds])

  if (!connected && !showDemo) {
    return (
      <div style={{ textAlign: 'center', padding: 20 }}>
        <p>Device not connected. Connect the Pico W to view live voltage and current graphs.</p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={showDemo} onChange={e => setShowDemo(e.target.checked)} />
          <span>Show demo data</span>
        </label>
      </div>
    )
  }

  return (
    <div>
      <section id="chartSettings" style={{marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center'}}>
        <label style={{display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start'}}>
          <span style={{fontSize: '0.85rem'}}>Sample rate (s)</span>
          <input type="number" min="0.1" step="0.1" value={sampleRate} onChange={e => setSampleRate(parseFloat(e.target.value) || 1)} style={{width: 80}} />
        </label>
        <label style={{display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start'}}>
          <span style={{fontSize: '0.85rem'}}>Window (s)</span>
          <input type="number" min="5" step="1" value={windowSeconds} onChange={e => setWindowSeconds(parseInt(e.target.value) || 60)} style={{width: 80}} />
        </label>
        <label style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
          <input type="checkbox" checked={showDemo} onChange={e => setShowDemo(e.target.checked)} />
          <span>Show demo data</span>
        </label>
      </section>

      <section id="currentSection">
        <h3>Current</h3>
        <div ref={currentRef} style={{ width: '100%', height: 240 }} />
      </section>

      <section id="voltageSection">
        <h3>Voltage</h3>
        <div ref={voltageRef} style={{ width: '100%', height: 240 }} />
      </section>
    </div>
  )
}
