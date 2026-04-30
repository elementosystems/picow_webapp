import React from 'react'
import Connection from '../components/Connection'
import Controls from '../components/Controls'
import Charts from '../components/Charts'
import EventLog from '../components/EventLog'
import Sessions from '../components/Sessions'
import Scripts from '../components/Scripts'
import ScopePanel from '../components/ScopePanel'
import SerialConsole from '../components/SerialConsole'

// Verbatim rehousing of the original App.jsx body. This file should stay
// boring — its job is to keep the Workbench experience byte-for-byte the
// same after navigation lands here. New panels go in their own pages.
export default function Workbench() {
  return (
    <>
      <Connection />
      <Controls />
      <Charts />
      <EventLog />
      <details className="disclosure">
        <summary>
          Recording
          <span className="disclosure__hint">Save / replay telemetry sessions</span>
        </summary>
        <Sessions />
      </details>
      <details className="disclosure">
        <summary>
          Test scripts
          <span className="disclosure__hint">Automated test sequences</span>
        </summary>
        <Scripts />
      </details>
      <details className="disclosure">
        <summary>
          Oscilloscope
          <span className="disclosure__hint">Siglent / SCPI over LAN</span>
        </summary>
        <ScopePanel />
      </details>
      <details className="disclosure">
        <summary>
          Serial console
          <span className="disclosure__hint">Diagnostics</span>
        </summary>
        <SerialConsole />
      </details>
    </>
  )
}
