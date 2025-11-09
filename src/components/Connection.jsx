import React, { useState } from 'react'
import serialService from '../services/serialService'

export default function Connection() {
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('Disconnected')

  async function handleConnect() {
    if (!connected) {
      try {
        await serialService.requestPort()
        await serialService.connect()
        setStatus('Connected')
        setConnected(true)
      } catch (err) {
        console.error('Connect error', err)
        setStatus('Connection Failed')
      }
    } else {
      try {
        await serialService.disconnect()
        setStatus('Disconnected')
        setConnected(false)
      } catch (err) {
        console.error('Disconnect error', err)
        setStatus('Disconnection Failed')
      }
    }
  }

  return (
    <section id="connection">
      <div className="connection-label">Device Connection</div>
      <button id="connectDisconnect" onClick={handleConnect}>{connected ? 'Disconnect' : 'Connect'}</button>
      <div id="status">{status}</div>
    </section>
  )
}
