import React, { useState } from 'react'
import Controls from './Controls'
import Charts from './Charts'
import EventLog from './EventLog'
import Sessions from './Sessions'
import Scripts from './Scripts'
import SerialConsole from './SerialConsole'
import { Icon } from './Icons'

const BOTTOM_TABS = [
  { id: 'events',   label: 'Event log', icon: 'pulse' },
  { id: 'sessions', label: 'Sessions',  icon: 'history' },
  { id: 'scripts',  label: 'Scripts',   icon: 'cpu' },
  { id: 'serial',   label: 'Serial',    icon: 'notes' },
]

export default function Workbench({ connected, onConnect, connecting }) {
  const [bottom, setBottom] = useState('events')

  return (
    <section className="bode-main" aria-label="Workbench">
      <Controls connected={connected} connecting={connecting} onConnect={onConnect} />
      <Charts connected={connected} />

      <div className="bode-bottom">
        <div className="bottom-tabs" role="tablist" aria-label="Workbench panels">
          {BOTTOM_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={bottom === t.id}
              data-active={bottom === t.id}
              onClick={() => setBottom(t.id)}
            >
              <Icon name={t.icon} size={13} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="bottom-pane" role="tabpanel">
          {bottom === 'events'   && <EventLog />}
          {bottom === 'sessions' && <Sessions />}
          {bottom === 'scripts'  && <Scripts />}
          {bottom === 'serial'   && <SerialConsole />}
        </div>
      </div>
    </section>
  )
}
