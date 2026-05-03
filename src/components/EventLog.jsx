import React, { useCallback, useEffect, useMemo, useState } from 'react'
import eventBus from '../services/eventBus'
import { Icon } from './Icons'

const FILTERS = [
  { id: 'all',  label: 'All',   match: null },
  { id: 'info', label: 'Info',  match: 'info' },
  { id: 'warn', label: 'Warn',  match: 'warn' },
  { id: 'err',  label: 'Error', match: 'err' },
]

const DISPLAY_CAP = 200

function pad2(n) { return n < 10 ? '0' + n : '' + n }
function pad3(n) { return n < 10 ? '00' + n : (n < 100 ? '0' + n : '' + n) }
function formatTime(d) {
  if (!(d instanceof Date)) return ''
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + '.' + pad3(d.getMilliseconds())
}

function useEvents() {
  const [events, setEvents] = useState(() => eventBus.getAll())
  useEffect(() => {
    setEvents(eventBus.getAll())
    return eventBus.subscribe(() => setEvents(eventBus.getAll()))
  }, [])
  return events
}

export default function EventLog() {
  const events = useEvents()
  const [filter, setFilter] = useState('all')
  const handleClear = useCallback(() => { eventBus.clear() }, [])

  const visible = useMemo(() => {
    const matchLevel = FILTERS.find((f) => f.id === filter)?.match
    const filtered = matchLevel == null ? events : events.filter((e) => e.level === matchLevel)
    return filtered.slice().reverse()
  }, [events, filter])

  const truncated = visible.length > DISPLAY_CAP
  const rows = truncated ? visible.slice(0, DISPLAY_CAP) : visible

  return (
    <>
      <div className="bottom-toolbar">
        <span className="lbl">Filter</span>
        <div className="filter-group" role="tablist" aria-label="Event level">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              data-active={filter === f.id}
              onClick={() => setFilter(f.id)}
            >{f.label}</button>
          ))}
        </div>
        <span className="spacer" />
        <span className="lbl">{events.length} events</span>
        <button className="btn btn-ghost btn-sm" onClick={handleClear} title="Clear all events">
          <Icon name="trash" size={13} /> Clear
        </button>
      </div>

      <div className="event-log" role="log" aria-live="polite">
        {rows.length === 0 ? (
          <div className="empty-row">
            {events.length === 0
              ? 'No events yet — connect the device or toggle a control to populate the log.'
              : 'No events match this filter.'}
          </div>
        ) : (
          rows.map((evt) => (
            <div key={evt.id} className="evt" data-level={evt.level}>
              <span className="evt-marker" aria-hidden="true" />
              <span className="evt-time">{formatTime(evt.ts)}</span>
              <span className="evt-source">{evt.source}</span>
              <span className="evt-msg" title={evt.message}>{evt.message}</span>
            </div>
          ))
        )}
        {truncated && (
          <div className="empty-row">
            older events truncated ({visible.length - DISPLAY_CAP} hidden — adjust filter to see more)
          </div>
        )}
      </div>
    </>
  )
}
