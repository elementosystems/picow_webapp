import React, { useEffect, useState } from 'react'
import versionInfo from '../version.json'
import serialService from './services/serialService'
import eventBus from './services/eventBus'
import { useRoute, navigate, matchPath } from './router/Router'
import { jobsStore } from './stores/jobs'
import { inventoryStore, isLow } from './stores/inventory'
import { startSessionBridge } from './stores/sessionBridge'
import { TitleBar, Rail } from './components/Shell'
import Toast from './components/Toast'
import Workbench from './components/Workbench'
import ScopePanel from './components/ScopePanel'
import Jobs from './pages/Jobs'
import Inventory from './pages/Inventory'
import Tools from './pages/Tools'
import Settings from './pages/Settings'

const NAV = [
  { id: 'workbench', path: '/',          label: 'Workbench', icon: 'workbench' },
  { id: 'scope',     path: '/scope',     label: 'Scope',     icon: 'scope' },
  { id: 'jobs',      path: '/jobs',      label: 'Jobs',      icon: 'jobs' },
  { id: 'inventory', path: '/inventory', label: 'Inventory', icon: 'inventory' },
  { id: 'tools',     path: '/tools',     label: 'Tools',     icon: 'tools' },
  { id: 'settings',  path: '/settings',  label: 'Settings',  icon: 'settings' },
]

const CONN_LABEL = {
  idle:       'Idle · click to connect',
  connecting: 'Opening port…',
  connected:  'Pico W · USB',
  error:      'USB error · click to retry',
}

function navFor(path) {
  if (path === '/' || path === '') return NAV[0]
  return NAV.find((n) => n.path !== '/' && (path === n.path || path.startsWith(n.path + '/'))) || null
}

function readDensity() {
  try { return localStorage.getItem('picow:density') || 'regular' }
  catch { return 'regular' }
}

export default function App() {
  useEffect(() => { startSessionBridge() }, [])
  const route = useRoute()
  const current = navFor(route.path)
  const [density, setDensity] = useState(readDensity)

  // Connection state lives here so the title-bar pill can drive it from any page.
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

  const lowCount = inventoryStore.useStore((s) => s.items.filter(isLow).length)
  const items = NAV.map((n) => ({
    ...n,
    href: '#' + n.path,
    ...(n.id === 'inventory' && lowCount ? { badge: lowCount, badgeTone: 'warn', badgeLabel: lowCount + ' low' } : {}),
  }))

  return (
    <div className={`bode-shell no-list density-${density}`} data-version={versionInfo.version}>
      <TitleBar
        crumb={`PiCoW · ${current ? current.label.toUpperCase() : 'NOT FOUND'}`}
        connState={conn}
        connLabel={CONN_LABEL[conn]}
        onConnClick={handleConn}
      >
        <ActiveJobChip />
      </TitleBar>
      <Rail items={items} active={current?.id} onSelect={(id) => navigate(NAV.find((n) => n.id === id).path)} />

      <Page
        path={route.path}
        conn={conn}
        onConnect={handleConn}
        onDensityChange={setDensity}
      />

      <Toast key={connError} message={connError} onDismiss={() => setConnError('')} />
    </div>
  )
}

function Page({ path, conn, onConnect, onDensityChange }) {
  if (path === '/' || path === '') {
    return <Workbench connected={conn === 'connected'} connecting={conn === 'connecting'} onConnect={onConnect} />
  }
  if (path === '/scope') return <ScopePanel />
  if (path === '/jobs' || matchPath('/jobs/:id', path)) return <Jobs />
  if (path === '/inventory') return <Inventory />
  if (path === '/tools') return <Tools />
  if (path === '/settings') return <Settings version={versionInfo.version} onDensityChange={onDensityChange} />
  return <NotFound path={path} />
}

function NotFound({ path }) {
  return (
    <section className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Not found</h1>
          <p className="page__sub">No page at <code>{path}</code>.</p>
        </div>
      </header>
      <div>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Back to Workbench</button>
      </div>
    </section>
  )
}

function ActiveJobChip() {
  const job = jobsStore.useStore((s) =>
    s.activeId ? s.items.find((j) => j.id === s.activeId) || null : null
  )
  if (!job) return null
  return (
    <button
      type="button"
      className="tb-job"
      onClick={() => navigate('/jobs/' + job.id)}
      title={'Tracking bench events into "' + job.title + '"'}
    >
      <span className="dot" />
      <span className="lbl">Tracking</span>
      <span className="val">{job.title}</span>
    </button>
  )
}
