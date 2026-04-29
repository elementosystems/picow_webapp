import React, { useEffect, useState, useMemo, useCallback } from 'react'
import eventBus from '../services/eventBus'

const FILTERS = [
  { id: 'all',  label: 'All',   match: null },
  { id: 'info', label: 'Info',  match: 'info' },
  { id: 'warn', label: 'Warn',  match: 'warn' },
  { id: 'err',  label: 'Error', match: 'err' },
]

const DISPLAY_CAP = 100

function pad2(n) { return n < 10 ? '0' + n : '' + n }

function formatTime(d) {
  if (!(d instanceof Date)) return ''
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
}

// Inline hook so the EventLog is self-contained.
function useEvents() {
  const [events, setEvents] = useState(() => eventBus.getAll())
  useEffect(() => {
    setEvents(eventBus.getAll())
    const unsub = eventBus.subscribe(() => {
      setEvents(eventBus.getAll())
    })
    return unsub
  }, [])
  return events
}

export default function EventLog() {
  const events = useEvents()
  const [filter, setFilter] = useState('all')

  const handleClear = useCallback(() => { eventBus.clear() }, [])

  const visible = useMemo(() => {
    const matchLevel = FILTERS.find(f => f.id === filter)?.match
    const filtered = matchLevel == null
      ? events
      : events.filter(e => e.level === matchLevel)
    return filtered.slice().reverse() // newest first
  }, [events, filter])

  const truncated = visible.length > DISPLAY_CAP
  const rows = truncated ? visible.slice(0, DISPLAY_CAP) : visible

  return (
    <section className="card event-log" aria-label="Event log">
      <div className="card__header event-log__header">
        <span className="card__title-eyebrow">Log</span>
        <span className="card__title">Event log</span>
        <span className="event-log__count" title="Total events captured (cap 200)">{events.length}</span>

        <div className="card__actions event-log__actions">
          <div className="segmented" role="tablist" aria-label="Filter events by level">
            {FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`segmented__btn ${filter === f.id ? 'is-active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--ghost" onClick={handleClear} title="Clear all events">
            Clear
          </button>
        </div>
      </div>

      <div className="card__body event-log__body">
        {rows.length === 0 ? (
          <div className="event-log__empty">
            {events.length === 0 ? 'No events yet — connect the device or toggle a control to populate the log.' : 'No events match this filter.'}
          </div>
        ) : (
          <ul className="event-log__list" role="log" aria-live="polite">
            {rows.map(evt => (
              <li key={evt.id} className="event-log__row">
                <span className="event-log__time">{formatTime(evt.ts)}</span>
                <span
                  className={`event-log__dot event-log__dot--${evt.level}`}
                  aria-label={`level ${evt.level}`}
                />
                <span className="event-log__source">{evt.source}</span>
                <span className="event-log__message">{evt.message}</span>
              </li>
            ))}
          </ul>
        )}
        {truncated && (
          <div className="event-log__truncated">
            older events truncated ({visible.length - DISPLAY_CAP} hidden — adjust filter to see more)
          </div>
        )}
      </div>
    </section>
  )
}
