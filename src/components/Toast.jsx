import React, { useEffect, useRef } from 'react'
import { Icon } from './Icons'

// Auto-dismissing fixed-position toast. Re-mounting (key change) restarts the
// timer so a new error message is visible for the full duration even if the
// previous one was still on screen.
export default function Toast({ message, kind = 'error', durationMs = 6000, onDismiss }) {
  const timerRef = useRef(null)
  useEffect(() => {
    if (!message) return undefined
    timerRef.current = setTimeout(() => onDismiss?.(), durationMs)
    return () => clearTimeout(timerRef.current)
  }, [message, durationMs, onDismiss])

  if (!message) return null
  return (
    <div className={`toast toast--${kind}`} role="alert" aria-live="polite">
      <span className="toast-msg">{message}</span>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        <Icon name="close" size={13} />
      </button>
    </div>
  )
}
