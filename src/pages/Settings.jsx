import React, { useEffect, useRef, useState } from 'react'
import { jobsStore } from '../stores/jobs'
import { inventoryStore } from '../stores/inventory'
import { Icon } from '../components/Icons'

const FORMAT = 'picow-workbench'
const VERSION = 1
const THEME_KEY = 'theme'
const DENSITY_KEY = 'picow:density'

function readTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark'
}
function readDensity() {
  try { return localStorage.getItem(DENSITY_KEY) || 'regular' }
  catch { return 'regular' }
}

export default function Settings({ version, onDensityChange }) {
  const fileRef = useRef(null)
  const [msg, setMsg] = useState(null)
  const [theme, setTheme] = useState(readTheme)
  const [density, setDensity] = useState(readDensity)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(THEME_KEY, theme) } catch {}
  }, [theme])

  useEffect(() => {
    try { localStorage.setItem(DENSITY_KEY, density) } catch {}
    onDensityChange && onDensityChange(density)
  }, [density, onDensityChange])

  function handleExport() {
    const payload = {
      __format: FORMAT,
      __version: VERSION,
      exportedAt: new Date().toISOString(),
      jobs: jobsStore.get(),
      inventory: inventoryStore.get(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'picow-workbench-' + new Date().toISOString().slice(0, 10) + '.json'
    a.click()
    URL.revokeObjectURL(url)
    setMsg({ kind: 'ok', text: 'Exported.' })
  }

  function handleImportPick() { fileRef.current && fileRef.current.click() }

  function handleImport(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (parsed.__format !== FORMAT) {
          setMsg({ kind: 'err', text: 'That doesn\'t look like a workbench export.' })
          return
        }
        // Shape-validate before writing — malformed `items` would brick the
        // selectors that the always-rendered header chips depend on, and
        // localStorage now holds the corrupt blob. Reject the whole import.
        const jobsOk = parsed.jobs && Array.isArray(parsed.jobs.items)
        const invOk = parsed.inventory && Array.isArray(parsed.inventory.items)
        if (!jobsOk || !invOk) {
          setMsg({ kind: 'err', text: 'Import is malformed: jobs.items / inventory.items must be arrays.' })
          return
        }
        if (!confirm('Replace ALL local jobs and inventory with the imported data?')) return
        jobsStore.set({
          items: parsed.jobs.items,
          activeId: typeof parsed.jobs.activeId === 'string' ? parsed.jobs.activeId : null,
        })
        inventoryStore.set({ items: parsed.inventory.items })
        setMsg({ kind: 'ok', text: 'Imported. Reload the tab if anything looks stale.' })
      } catch (err) {
        setMsg({ kind: 'err', text: 'Import failed: ' + (err && err.message || err) })
      }
    }
    reader.onerror = () => setMsg({ kind: 'err', text: 'Could not read file.' })
    reader.readAsText(file)
  }

  function handleReset() {
    if (!confirm('Erase ALL jobs and inventory from this browser? This cannot be undone.')) return
    jobsStore.set({ items: [], activeId: null })
    inventoryStore.set({ items: [] })
    setMsg({ kind: 'ok', text: 'Cleared.' })
  }

  return (
    <section className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Settings</h1>
          <p className="page__sub">Everything is stored in this browser. Nothing leaves the machine.</p>
        </div>
        <div className="page__actions">
          <a
            href="https://github.com/elementosystems/picow_webapp"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary btn-sm"
          >
            <Icon name="link" size={13} /> Source
          </a>
        </div>
      </header>

      {msg && (
        <div className={'banner banner--' + (msg.kind === 'ok' ? 'ok' : 'err')} role="status">{msg.text}</div>
      )}

      <div className="settings__grid">
        <div className="card">
          <div className="card__head"><span className="card__title">Appearance</span></div>
          <dl className="kv">
            <dt>Theme</dt>
            <dd>
              <div className="segmented" role="radiogroup" aria-label="Theme">
                {['light', 'dark'].map((m) => (
                  <button key={m} role="radio" aria-checked={theme === m}
                    className={'segmented__btn' + (theme === m ? ' is-active' : '')}
                    onClick={() => setTheme(m)}>{m}</button>
                ))}
              </div>
            </dd>
            <dt>Density</dt>
            <dd>
              <div className="segmented" role="radiogroup" aria-label="Density">
                {['compact', 'regular', 'comfy'].map((d) => (
                  <button key={d} role="radio" aria-checked={density === d}
                    className={'segmented__btn' + (density === d ? ' is-active' : '')}
                    onClick={() => setDensity(d)}>{d}</button>
                ))}
              </div>
            </dd>
          </dl>
        </div>

        <div className="card">
          <div className="card__head"><span className="card__title">Jobs &amp; inventory data</span></div>
          <p className="t-muted">Export a JSON snapshot to back up or move to another machine. Import replaces what is here.</p>
          <div className="form__actions">
            <button className="btn btn-primary" onClick={handleExport}><Icon name="download" size={13} /> Export JSON</button>
            <button className="btn btn-secondary" onClick={handleImportPick}><Icon name="upload" size={13} /> Import…</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={handleImport} />
        </div>

        <div className="card">
          <div className="card__head"><span className="card__title">Reset</span></div>
          <p className="t-muted">Erase all jobs and inventory from this browser. Telemetry sessions are not affected.</p>
          <button className="btn btn-danger" onClick={handleReset}><Icon name="trash" size={13} /> Erase jobs &amp; inventory</button>
        </div>

        <div className="card">
          <div className="card__head"><span className="card__title">About</span></div>
          <dl className="kv">
            <dt>Version</dt><dd className="tnum">v{version}</dd>
            <dt>Author</dt><dd>BSADASHI</dd>
          </dl>
        </div>
      </div>
    </section>
  )
}
