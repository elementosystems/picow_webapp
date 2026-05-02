import React, { useEffect, useState } from 'react'
import { Icon } from './Icons'

// Bode-style title bar: brand mark, breadcrumb, connection pill, clock.
export function TitleBar({ crumb, connState, connLabel, onConnClick }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const fmt = now.toLocaleTimeString('en-US', { hour12: false })
  return (
    <div className="bode-titlebar">
      <div className="tb-brand">
        <span className="mark" aria-hidden="true" />
        <span className="tb-name">PiCoW</span>
      </div>
      <span className="tb-sep" aria-hidden="true" />
      <span className="tb-crumb">{crumb}</span>
      <span className="tb-spacer" />
      <button
        type="button"
        className="tb-conn"
        data-state={connState}
        onClick={onConnClick}
        title={connState === 'connected' ? 'Click to disconnect' : 'Click to connect'}
      >
        <span className="dot" />
        {connLabel}
      </button>
      <span className="tb-clock tnum">{fmt}</span>
    </div>
  )
}

// Vertical icon rail with active state and tooltip labels.
export function Rail({ items, active, onSelect }) {
  return (
    <nav className="bode-rail" aria-label="Primary navigation">
      {items.map((n) => (
        <button
          key={n.id}
          type="button"
          className="rail-btn"
          data-active={active === n.id}
          onClick={() => onSelect(n.id)}
          aria-label={n.label}
          aria-current={active === n.id ? 'page' : undefined}
        >
          <Icon name={n.icon} size={19} />
          {n.badge != null && <span className="badge">{n.badge}</span>}
          <span className="label">{n.label}</span>
        </button>
      ))}
      <span className="rail-spacer" />
    </nav>
  )
}
