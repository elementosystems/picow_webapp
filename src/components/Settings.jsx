import React, { useEffect, useState } from 'react'
import { Icon } from './Icons'

const THEME_KEY = 'theme'
const DENSITY_KEY = 'picow:density'

function readTheme() {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.getAttribute('data-theme') || 'dark'
}
function readDensity() {
  try { return localStorage.getItem(DENSITY_KEY) || 'regular' }
  catch { return 'regular' }
}

export default function Settings({ version }) {
  const [theme, setTheme] = useState(readTheme)
  const [density, setDensity] = useState(readDensity)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(THEME_KEY, theme) } catch {}
  }, [theme])

  useEffect(() => {
    try { localStorage.setItem(DENSITY_KEY, density) } catch {}
  }, [density])

  return (
    <section className="detail" aria-label="Settings">
      <header className="detail-head">
        <div className="grow">
          <div className="crumb">PiCoW · Settings</div>
          <h2>Settings</h2>
          <div className="sub">
            <span>Local-first. No cloud, no telemetry.</span>
          </div>
        </div>
        <div className="actions">
          <a
            href="https://github.com/elementosystems/picow_webapp"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary btn-sm"
            aria-label="View on GitHub"
          >
            <Icon name="link" size={13} /> GitHub
          </a>
        </div>
      </header>

      <div className="detail-body" style={{ maxWidth: 760 }}>
        <div className="card">
          <div className="card-head"><h4>Appearance</h4></div>
          <div className="card-pad">
            <dl className="kv">
              <dt>Theme</dt>
              <dd>
                <div className="list-tabs">
                  {['light', 'dark'].map((m) => (
                    <button key={m} data-active={theme === m} onClick={() => setTheme(m)}>{m}</button>
                  ))}
                </div>
              </dd>
              <dt>Density</dt>
              <dd>
                <div className="list-tabs">
                  {['compact', 'regular', 'comfy'].map((d) => (
                    <button key={d} data-active={density === d} onClick={() => setDensity(d)}>{d}</button>
                  ))}
                </div>
              </dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h4>Telemetry defaults</h4></div>
          <div className="card-pad">
            <dl className="kv">
              <dt>Sample rate</dt><dd className="tnum">10 Hz · 100 ms</dd>
              <dt>Default window</dt><dd className="tnum">60 seconds</dd>
              <dt>Storage</dt><dd>IndexedDB · in-browser</dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h4>About</h4></div>
          <div className="card-pad">
            <dl className="kv">
              <dt>PiCoW Console</dt><dd className="tnum">v{version}</dd>
              <dt>Author</dt><dd>BSADASHI · 2025</dd>
              <dt>Source</dt><dd><a href="https://github.com/elementosystems/picow_webapp" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>elementosystems/picow_webapp</a></dd>
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}
