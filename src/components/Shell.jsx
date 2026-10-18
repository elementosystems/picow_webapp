import React, { useEffect, useState } from 'react'
import { Icon } from './Icons'

// Bode-style title bar: brand mark, breadcrumb, connection pill, clock.
export function TitleBar({ crumb, connState, connLabel, onConnClick, children }) {
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
      {children}
      <button
        type="button"
        className="tb-conn"
        data-state={connState}
        onClick={onConnClick}
        aria-label={connLabel}
        title={connState === 'connected' ? 'Click to disconnect' : 'Click to connect'}
      >
        <span className="dot" />
        {connLabel}
      </button>
      <span className="tb-clock tnum">{fmt}</span>
    </div>
  )
}

// Vertical icon rail with active state and tooltip labels. Items are links
// so routes stay bookmarkable and cmd/ctrl-click opens a new tab.
export function Rail({ items, active, onSelect }) {
  function handleClick(e, id) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onSelect(id)
  }
  return (
    <nav className="bode-rail" aria-label="Primary navigation">
      {items.map((n) => (
        <a
          key={n.id}
          href={n.href}
          className="rail-btn"
          data-active={active === n.id}
          onClick={(e) => handleClick(e, n.id)}
          aria-label={n.badge != null ? `${n.label} (${n.badgeLabel || n.badge})` : n.label}
          aria-current={active === n.id ? 'page' : undefined}
        >
          <Icon name={n.icon} size={19} />
          {n.badge != null && <span className={'badge' + (n.badgeTone ? ' badge--' + n.badgeTone : '')}>{n.badge}</span>}
          <span className="label">{n.label}</span>
        </a>
      ))}
      <span className="rail-spacer" />
    </nav>
  )
}
