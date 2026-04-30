import { useEffect, useRef, useState } from 'react'

// Tiny store helper. ~100 lines, no deps. Each store is { get, set, subscribe,
// useStore, key }. State is one JSON-serializable value; updates go through
// `set(updater | value)`; subscribers fire on every mutation.
//
// Persistence wraps the value as { __v: 1, data } so a future schema bump
// can be detected. Today we just fall back to `initial` on version mismatch.
//
// Persist is debounced: subscribers fire synchronously so the UI is reactive,
// but localStorage writes coalesce within a 250ms window. This matters when
// the eventBus → activeJob bridge is firing many entries per second — without
// the debounce we'd serialize the entire jobs blob (photos and all) on every
// telemetry tick. We flush on pagehide / visibilitychange so a tab close
// can't lose the trailing batch.

const VERSION = 1
const PERSIST_DEBOUNCE_MS = 250

function shallowEqual(a, b) {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ak = Object.keys(a), bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
    if (a[k] !== b[k]) return false
  }
  return true
}

function loadInitial(key, initial) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return initial
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return initial
    if (parsed.__v !== VERSION) return initial
    return parsed.data === undefined ? initial : parsed.data
  } catch {
    return initial
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ __v: VERSION, data: value }))
  } catch {
    // Quota exceeded or storage disabled — silent. Caller's UI may surface
    // failure if it knows the write was important (e.g. photo upload).
  }
}

export function createStore(key, initial) {
  let state = loadInitial(key, initial)
  const subscribers = new Set()
  let persistTimer = null

  function flushPersist() {
    if (persistTimer == null) return
    clearTimeout(persistTimer)
    persistTimer = null
    save(key, state)
  }

  function schedulePersist() {
    if (persistTimer != null) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      save(key, state)
    }, PERSIST_DEBOUNCE_MS)
  }

  // Best-effort flush on tab close / hide so we never drop the trailing batch.
  // Listeners are bound once per store; with two stores in the app that's a
  // negligible four registrations.
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushPersist)
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPersist()
    })
  }

  function get() { return state }

  function set(updater) {
    const next = typeof updater === 'function' ? updater(state) : updater
    if (next === state) return
    state = next
    schedulePersist()
    for (const cb of subscribers) {
      try { cb(state) } catch (_) { /* swallow subscriber errors */ }
    }
  }

  function subscribe(cb) {
    if (typeof cb !== 'function') return () => {}
    subscribers.add(cb)
    return () => { subscribers.delete(cb) }
  }

  function useStore(selector) {
    const sel = selector || ((s) => s)
    const selRef = useRef(sel)
    selRef.current = sel
    const [slice, setSlice] = useState(() => sel(state))
    useEffect(() => {
      let prev = selRef.current(state)
      // The state captured by useState's initializer can drift if the store
      // mutates between render and effect attach. Re-sync once on mount.
      if (!shallowEqual(prev, slice)) setSlice(prev)
      const unsub = subscribe((next) => {
        const projected = selRef.current(next)
        if (!shallowEqual(prev, projected)) {
          prev = projected
          setSlice(projected)
        }
      })
      return unsub
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return slice
  }

  return { key, get, set, subscribe, useStore }
}

export { shallowEqual }
