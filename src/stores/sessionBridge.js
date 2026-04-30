import eventBus from '../services/eventBus'
import { jobsStore, appendTimelineEntry } from './jobs'

// Subscribes to the existing eventBus and copies events into the active job's
// timeline (if any). Pure consumer — no new emit points anywhere upstream, so
// the contract Workbench depends on is unchanged.

let started = false

export function startSessionBridge() {
  // React 18 Strict Mode double-invokes effects in dev. Without this guard,
  // every dev reload would attach two subscribers and entries would duplicate.
  if (started) return () => {}
  started = true

  const unsub = eventBus.subscribe((evt) => {
    if (!evt) return
    const id = jobsStore.get().activeId
    if (!id) return
    appendTimelineEntry(id, {
      ts: evt.ts,
      level: evt.level,
      source: evt.source,
      message: evt.message,
    })
  })

  return () => {
    started = false
    unsub()
  }
}
