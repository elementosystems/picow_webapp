import React, { useRef, useState } from 'react'
import { jobsStore } from '../stores/jobs'
import { inventoryStore } from '../stores/inventory'

const FORMAT = 'picow-workbench'
const VERSION = 1

export default function Settings() {
  const fileRef = useRef(null)
  const [msg, setMsg] = useState(null)

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
          <p className="page__sub">
            Local-only data lives in this browser's localStorage. Export to move it
            between machines or to back up before an experiment.
          </p>
        </div>
      </header>

      {msg && (
        <div className={'banner banner--' + (msg.kind === 'ok' ? 'ok' : 'err')}>{msg.text}</div>
      )}

      <div className="settings__grid">
        <div className="card">
          <div className="card__head"><span className="card__title">Export</span></div>
          <p className="t-muted">Downloads a JSON snapshot of jobs + inventory.</p>
          <button className="btn btn--primary" onClick={handleExport}>Export JSON</button>
        </div>

        <div className="card">
          <div className="card__head"><span className="card__title">Import</span></div>
          <p className="t-muted">Replaces local data. Confirms before doing so.</p>
          <button className="btn" onClick={handleImportPick}>Import JSON…</button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImport} />
        </div>

        <div className="card">
          <div className="card__head"><span className="card__title">Reset</span></div>
          <p className="t-muted">Wipe both stores. Last-resort.</p>
          <button className="btn btn--danger" onClick={handleReset}>Reset everything</button>
        </div>
      </div>
    </section>
  )
}
