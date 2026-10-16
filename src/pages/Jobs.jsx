import React, { useMemo, useState, useRef } from 'react'
import { matchPath, navigate, useRoute } from '../router/Router'
import { jobsStore } from '../stores/jobs'
import {
  createJob,
  deleteJob,
  setActiveJob,
  clearActiveJob,
  updateJob,
  addPhoto,
  removePhoto,
} from '../stores/jobs'

const PHOTO_MAX_BYTES = 1.2 * 1024 * 1024
const STATUS_ORDER = ['open', 'blocked', 'fixed', 'scrapped']
const STATUS_LABEL = { open: 'Open', blocked: 'Blocked', fixed: 'Fixed', scrapped: 'Scrapped' }

function relTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return sec + 's ago'
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago'
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago'
  return Math.floor(sec / 86400) + 'd ago'
}

function truncate(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export default function Jobs() {
  const route = useRoute()
  const detail = matchPath('/jobs/:id', route.path)
  if (detail) return <JobDetail id={detail.id} />
  return <JobsList />
}

function JobsList() {
  const { items, activeId } = jobsStore.useStore((s) => ({ items: s.items, activeId: s.activeId }))
  const [showNew, setShowNew] = useState(false)
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter((j) => {
      if (filter !== 'all' && j.status !== filter) return false
      if (!term) return true
      return (
        j.title.toLowerCase().includes(term) ||
        j.device.toLowerCase().includes(term) ||
        j.symptoms.toLowerCase().includes(term)
      )
    })
  }, [items, filter, q])

  return (
    <section className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Jobs</h1>
          <p className="page__sub">Repair journal, one entry per device on the bench.</p>
        </div>
        <div className="page__actions">
          <button className="btn btn-primary" onClick={() => setShowNew((v) => !v)}>
            {showNew ? 'Cancel' : 'New job'}
          </button>
        </div>
      </header>

      {showNew && <NewJobForm onCreated={(id) => { setShowNew(false); navigate('/jobs/' + id) }} />}

      <div className="jobs__toolbar">
        <input
          className="input"
          placeholder="Search title / device / symptoms…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="segmented" role="tablist">
          {['all', ...STATUS_ORDER].map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={filter === s}
              className={'segmented__btn' + (filter === s ? ' is-active' : '')}
              onClick={() => setFilter(s)}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          {items.length === 0 ? 'No jobs yet — start with a new one.' : 'No jobs match the filter.'}
        </div>
      ) : (
        <ul className="jobs__list">
          {visible.map((j) => (
            <li key={j.id} className={'jobs__row' + (j.id === activeId ? ' is-active' : '')}>
              <button className="jobs__open" onClick={() => navigate('/jobs/' + j.id)}>
                <div className="jobs__row-main">
                  <div className="jobs__title-row">
                    <span className="jobs__title">{j.title}</span>
                    <span className={'pill pill--' + j.status}>{STATUS_LABEL[j.status]}</span>
                    {j.id === activeId && <span className="pill pill--active">tracking</span>}
                  </div>
                  <div className="jobs__meta">
                    {j.device && <span>{j.device}</span>}
                    {j.symptoms && <span className="jobs__sep">·</span>}
                    {j.symptoms && <span>{truncate(j.symptoms, 80)}</span>}
                  </div>
                </div>
                <div className="jobs__row-side">
                  <span className="jobs__when">{relTime(j.updatedAt)}</span>
                  <span className="jobs__counts">
                    {j.timeline.length} events · {j.photos.length} photos
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NewJobForm({ onCreated }) {
  const [title, setTitle] = useState('')
  const [device, setDevice] = useState('')
  const [symptoms, setSymptoms] = useState('')
  const titleRef = useRef(null)
  React.useEffect(() => { titleRef.current && titleRef.current.focus() }, [])

  function submit(e) {
    e.preventDefault()
    if (!title.trim()) return
    const id = createJob({ title, device, symptoms })
    onCreated && onCreated(id)
  }

  return (
    <form className="card jobs__new" onSubmit={submit}>
      <label className="field">
        <span className="field__label">Title</span>
        <input
          ref={titleRef}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "Sony STR-DH590 — no audio, relay clicks"'
          required
        />
      </label>
      <label className="field">
        <span className="field__label">Device</span>
        <input
          className="input"
          value={device}
          onChange={(e) => setDevice(e.target.value)}
          placeholder="Make / model"
        />
      </label>
      <label className="field">
        <span className="field__label">Reported symptoms</span>
        <textarea
          className="input input--area"
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          rows={3}
        />
      </label>
      <div className="form__actions">
        <button type="submit" className="btn btn-primary">Create job</button>
      </div>
    </form>
  )
}

function JobDetail({ id }) {
  const job = jobsStore.useStore((s) => s.items.find((j) => j.id === id) || null)
  const activeId = jobsStore.useStore((s) => s.activeId)

  if (!job) {
    return (
      <section className="page">
        <header className="page__head">
          <div>
            <h1 className="page__title">Job not found</h1>
            <p className="page__sub">It may have been deleted or came from another browser.</p>
          </div>
        </header>
        <div>
          <button className="btn btn-secondary" onClick={() => navigate('/jobs')}>Back to jobs</button>
        </div>
      </section>
    )
  }
  const isActive = activeId === job.id

  function handleStatus(next) {
    updateJob(job.id, { status: next })
  }
  function handleDelete() {
    if (!confirm('Delete this job and its history? This cannot be undone.')) return
    deleteJob(job.id)
    navigate('/jobs')
  }

  return (
    <section className="page">
      <header className="page__head">
        <div>
          <button className="link" onClick={() => navigate('/jobs')}>Jobs /</button>
          <h1 className="page__title">{job.title}</h1>
          <div className="page__sub">
            <span className={'pill pill--' + job.status}>{STATUS_LABEL[job.status]}</span>
            {isActive && <span className="pill pill--active">tracking</span>}
            <span className="page__sep">·</span>
            <span>updated {relTime(job.updatedAt)}</span>
          </div>
        </div>
        <div className="page__actions">
          {isActive ? (
            <button className="btn btn-secondary" onClick={() => clearActiveJob()}>Stop tracking</button>
          ) : (
            <button className="btn btn-primary" onClick={() => setActiveJob(job.id)}>
              Track on Workbench
            </button>
          )}
          <select
            className="input input--inline"
            value={job.status}
            onChange={(e) => handleStatus(e.target.value)}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </header>

      <div className="cols cols--two">
        <div className="col">
          <Field
            label="Device"
            value={job.device}
            onSave={(v) => updateJob(job.id, { device: v })}
            placeholder="Make / model"
          />
          <Field
            label="Reported symptoms"
            value={job.symptoms}
            onSave={(v) => updateJob(job.id, { symptoms: v })}
            multiline
          />
          <Field
            label="Notes"
            value={job.notes}
            onSave={(v) => updateJob(job.id, { notes: v })}
            multiline
            rows={8}
          />
          <PhotosSection job={job} />
        </div>
        <div className="col">
          <TimelineSection job={job} />
        </div>
      </div>
    </section>
  )
}

function Field({ label, value, onSave, placeholder, multiline, rows = 3 }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const inputRef = React.useRef(null)
  React.useEffect(() => { setDraft(value || '') }, [value, editing])
  React.useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])

  if (!editing) {
    return (
      <div
        className="card field-card field-card--clickable"
        role="button"
        tabIndex={0}
        aria-label={`Edit ${label}`}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setEditing(true)
          }
        }}
      >
        <div className="field-card__head">
          <span className="field__label">{label}</span>
          <span className="field-card__edit-hint" aria-hidden="true">edit</span>
        </div>
        <div className={'field-card__value' + (value ? '' : ' field-card__value--empty')}>
          {value || <em>{placeholder || 'empty'}</em>}
        </div>
      </div>
    )
  }
  return (
    <div className="card field-card">
      <div className="field-card__head">
        <span className="field__label">{label}</span>
      </div>
      {multiline ? (
        <textarea
          ref={inputRef}
          className="input input--area"
          rows={rows}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <input
          ref={inputRef}
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
      <div className="form__actions">
        <button className="btn btn-primary" onClick={() => { onSave(draft); setEditing(false) }}>
          Save
        </button>
        <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  )
}

function PhotosSection({ job }) {
  const fileRef = useRef(null)
  const [err, setErr] = useState('')
  const [caption, setCaption] = useState('')

  function pickFile() { fileRef.current && fileRef.current.click() }

  function handleFile(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    if (file.size > PHOTO_MAX_BYTES) {
      setErr('Photo too large for browser storage (' + (file.size / 1048576).toFixed(1) + ' MB > 1.2 MB cap). A backend will lift this limit.')
      return
    }
    setErr('')
    const reader = new FileReader()
    reader.onload = () => {
      addPhoto(job.id, { dataUrl: String(reader.result), caption })
      setCaption('')
    }
    reader.onerror = () => setErr('Could not read file.')
    reader.readAsDataURL(file)
  }

  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">Photos ({job.photos.length})</span>
        <button className="btn btn-secondary btn-sm" onClick={pickFile}>Add photo</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>
      {err && <div className="banner banner--err">{err}</div>}
      <input
        className="input"
        placeholder="Optional caption for next photo…"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
      {job.photos.length === 0 ? (
        <div className="empty empty--sm">No photos yet.</div>
      ) : (
        <div className="photos">
          {job.photos.map((p) => (
            <figure key={p.id} className="photo">
              <img src={p.dataUrl} alt={p.caption || 'job photo'} />
              {p.caption && <figcaption>{p.caption}</figcaption>}
              <button
                className="photo__del"
                title="Remove"
                onClick={() => removePhoto(job.id, p.id)}
              >×</button>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}

function TimelineSection({ job }) {
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">Timeline ({job.timeline.length})</span>
        <span className="card__hint">Captured while tracking</span>
      </div>
      {job.timeline.length === 0 ? (
        <div className="empty empty--sm">
          {jobsStore.get().activeId === job.id
            ? 'Tracking on Workbench. Bench events will appear here.'
            : 'Click "Track on Workbench" to capture bench events into this job.'}
        </div>
      ) : (
        <ol className="timeline">
          {[...job.timeline].reverse().map((row) => (
            <li key={row.id} className={'timeline__row timeline__row--' + row.level}>
              <span className="timeline__time">
                {new Date(row.ts).toLocaleTimeString([], { hour12: false })}
              </span>
              <span className="timeline__source">{row.source || '—'}</span>
              <span className="timeline__msg">{row.message}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
