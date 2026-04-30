import React, { useEffect } from 'react'
import versionInfo from '../version.json'
import ThemeToggle from './components/DarkModeToggle'
import { NavLink, useRoute, navigate, matchPath } from './router/Router'
import { jobsStore } from './stores/jobs'
import { inventoryStore, isLow } from './stores/inventory'
import { startSessionBridge } from './stores/sessionBridge'

import Workbench from './pages/Workbench'
import Jobs from './pages/Jobs'
import Inventory from './pages/Inventory'
import Tools from './pages/Tools'
import Settings from './pages/Settings'

const NAV = [
  { to: '/',          label: 'Workbench' },
  { to: '/jobs',      label: 'Jobs'      },
  { to: '/inventory', label: 'Inventory' },
  { to: '/tools',     label: 'Tools'     },
  { to: '/settings',  label: 'Settings'  },
]

export default function App() {
  useEffect(() => { startSessionBridge() }, [])
  const route = useRoute()

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar__brand">
          <div className="brand-mark" aria-hidden="true">P</div>
          <div className="brand-text">
            <div className="brand-title">PiCoW Console</div>
            <div className="brand-subtitle">Bench tools · jobs · inventory</div>
          </div>
        </div>
        <nav className="appbar__nav" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              exact={item.to === '/'}
              className="appbar__navitem"
              activeClassName="is-active"
            >
              {item.label}
              {item.to === '/inventory' && <LowChip />}
            </NavLink>
          ))}
        </nav>
        <div className="appbar__actions">
          <ActiveJobChip />
          <ThemeToggle />
        </div>
      </header>

      <main className="main">
        <Page path={route.path} />
      </main>

      <footer className="footer">
        <a href="https://github.com/elementosystems/picow_webapp" target="_blank" rel="noreferrer" aria-label="View on GitHub">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.18.55-.39v-1.36c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.81.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.51.56.83 1.28.83 2.15 0 3.07-1.87 3.74-3.65 3.94.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.39A8 8 0 0 0 8 .2Z"/>
          </svg>
          <span>elementosystems/picow_webapp</span>
        </a>
        <div>&copy; 2025 BSADASHI</div>
        <div className="footer__version">v{versionInfo.version}</div>
      </footer>
    </div>
  )
}

function Page({ path }) {
  if (path === '/' || path === '') return <Workbench />
  if (path === '/jobs' || matchPath('/jobs/:id', path)) return <Jobs />
  if (path === '/inventory') return <Inventory />
  if (path === '/tools') return <Tools />
  if (path === '/settings') return <Settings />
  return <NotFound path={path} />
}

function NotFound({ path }) {
  return (
    <section className="page">
      <header className="page__head">
        <h1 className="page__title">Not found</h1>
        <p className="page__sub">No page at <code>{path}</code>.</p>
      </header>
      <button className="btn btn--primary" onClick={() => navigate('/')}>Back to Workbench</button>
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
      className="chip chip--active"
      onClick={() => navigate('/jobs/' + job.id)}
      title="Click to open the tracked job"
    >
      <span className="chip__dot" />
      <span className="chip__label">tracking:</span>
      <span className="chip__value">{job.title}</span>
    </button>
  )
}

function LowChip() {
  const count = inventoryStore.useStore((s) => s.items.filter(isLow).length)
  if (!count) return null
  return <span className="appbar__navchip">{count} low</span>
}
