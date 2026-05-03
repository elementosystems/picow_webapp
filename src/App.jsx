import React, { useEffect, useMemo, useState } from 'react'
import versionInfo from '../version.json'
import serialService from './services/serialService'
import eventBus from './services/eventBus'
import { TitleBar, Rail } from './components/Shell'
import Workbench from './components/Workbench'
import ScopePanel from './components/ScopePanel'
import Settings from './components/Settings'
import Toast from './components/Toast'

const NAV = [
  { id: 'workbench', label: 'Workbench', icon: 'workbench' },
  { id: 'scope',     label: 'Scope',     icon: 'scope' },
  { id: 'settings',  label: 'Settings',  icon: 'settings' },
]

const CONN_LABEL = {
  idle:       'Idle · click to connect',
  connecting: 'Opening port…',
  connected:  'Pico W · USB',
  error:      'USB error · click to retry',
}

function readDensity() {
  try { return localStorage.getItem('picow:density') || 'regular' }
  catch { return 'regular' }
}

export default function App() {
  const [tab, setTab] = useState('workbench')
  const [density, setDensity] = useState(readDensity)

  // Listen for density changes from the Settings tab via storage events.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'picow:density') setDensity(e.newValue || 'regular')
    }
    window.addEventListener('storage', onStorage)
    // Also poll a refresh whenever the Settings tab is open — `storage` events
    // only fire across tabs, not within the same one, so Settings updates
    // localStorage and `Settings` itself toggles the class. We re-read once
    // every time density changes to keep the App-managed class in sync.
    const id = setInterval(() => {
      const v = readDensity()
      setDensity((prev) => (prev === v ? prev : v))
    }, 1000)
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id) }
  }, [])

  // Connection state lifted to App so the titlebar pill can drive it from any tab.
  const [conn, setConn] = useState(serialService.isConnected() ? 'connected' : 'idle')
  const [connError, setConnError] = useState('')

  useEffect(() => {
    function onConn(c) {
      setConn(c ? 'connected' : 'idle')
      if (!c) setConnError('')
    }
    serialService.addOnConnectionChange(onConn)
    return () => serialService.removeOnConnectionChange(onConn)
  }, [])

  async function handleConn() {
    if (conn === 'connecting') return
    if (conn === 'connected') {
      try {
        await serialService.disconnect()
        setConn('idle')
        eventBus.emit('info', 'conn', 'Device disconnected')
      } catch (err) {
        const msg = err?.message || 'Failed to disconnect'
        setConn('error'); setConnError(msg)
        eventBus.emit('err', 'conn', 'Disconnect failed: ' + msg)
      }
      return
    }
    setConn('connecting'); setConnError('')
    try {
      await serialService.requestPort()
      await serialService.connect()
      setConn('connected')
      eventBus.emit('info', 'conn', 'Device connected')
    } catch (err) {
      const msg = err?.message || 'Could not open device'
      setConn('error'); setConnError(msg)
      eventBus.emit('err', 'conn', 'Connect failed: ' + msg)
    }
  }

  const crumb = useMemo(() => {
    const cur = NAV.find((n) => n.id === tab)
    return `PiCoW · ${cur ? cur.label.toUpperCase() : ''}`
  }, [tab])

  // Workbench/Scope/Settings all run without the secondary list pane.
  const noList = true

  return (
    <div className={`bode-shell ${noList ? 'no-list' : ''} density-${density}`} data-version={versionInfo.version}>
      <TitleBar
        crumb={crumb}
        connState={conn}
        connLabel={CONN_LABEL[conn]}
        onConnClick={handleConn}
      />
      <Rail items={NAV} active={tab} onSelect={setTab} />

      {tab === 'workbench' && (
        <Workbench connected={conn === 'connected'} onConnect={handleConn} connecting={conn === 'connecting'} />
      )}
      {tab === 'scope' && <ScopePanel />}
      {tab === 'settings' && <Settings version={versionInfo.version} />}

      <Toast key={connError} message={connError} onDismiss={() => setConnError('')} />
    </div>
  )
}
