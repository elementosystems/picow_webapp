/*
 * sessions — record/replay telemetry sessions to IndexedDB.
 *
 * Schema (db `picow-sessions`, version 1):
 *   sessions  { id, name, startedAt, endedAt, note, sampleCount, eventCount }
 *   samples   { sessionId, idx, t, c, v }       — keyPath [sessionId, idx]
 *   events    { sessionId, idx, t, level, source, message } — keyPath [sessionId, idx]
 *
 * Writes are buffered and flushed every 500ms or 200 rows so we don't open a
 * new transaction per sample. The flush is fire-and-forget for live recording
 * — failures emit to the console but don't block ingest.
 */

const DB_NAME = 'picow-sessions'
const DB_VERSION = 1

const FLUSH_INTERVAL_MS = 500
const FLUSH_ROW_THRESHOLD = 200

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('samples')) {
        const store = db.createObjectStore('samples', { keyPath: ['sessionId', 'idx'] })
        store.createIndex('bySession', 'sessionId')
      }
      if (!db.objectStoreNames.contains('events')) {
        const store = db.createObjectStore('events', { keyPath: ['sessionId', 'idx'] })
        store.createIndex('bySession', 'sessionId')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
}

// --- Recording state ------------------------------------------------------

const state = {
  recording: false,
  sessionId: null,
  startedAt: null,
  sampleIdx: 0,
  eventIdx: 0,
  pendingSamples: [],
  pendingEvents: [],
  flushTimer: null,
  // Status subscribers — UI mirrors `recording`, `sessionId`, `sampleCount`, `eventCount`.
  statusListeners: [],
}

function notifyStatus() {
  const snapshot = {
    recording: state.recording,
    sessionId: state.sessionId,
    sampleCount: state.sampleIdx,
    eventCount: state.eventIdx,
    startedAt: state.startedAt,
  }
  for (const cb of state.statusListeners) {
    try { cb(snapshot) } catch {}
  }
}

function scheduleFlush() {
  if (state.flushTimer) return
  state.flushTimer = setTimeout(() => {
    state.flushTimer = null
    flush().catch(err => console.error('[sessions] flush failed', err))
  }, FLUSH_INTERVAL_MS)
}

async function flush() {
  if (!state.pendingSamples.length && !state.pendingEvents.length) return
  const samples = state.pendingSamples
  const events = state.pendingEvents
  state.pendingSamples = []
  state.pendingEvents = []

  let db
  try { db = await openDb() }
  catch { return }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['samples', 'events', 'sessions'], 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('aborted'))
    if (samples.length) {
      const store = tx.objectStore('samples')
      for (const row of samples) store.put(row)
    }
    if (events.length) {
      const store = tx.objectStore('events')
      for (const row of events) store.put(row)
    }
    if (state.sessionId) {
      // Update session counters
      const store = tx.objectStore('sessions')
      const getReq = store.get(state.sessionId)
      getReq.onsuccess = () => {
        const s = getReq.result
        if (!s) return
        s.sampleCount = state.sampleIdx
        s.eventCount = state.eventIdx
        store.put(s)
      }
    }
  })
}

// --- Public API -----------------------------------------------------------

const sessions = {
  isRecording() { return state.recording },
  currentSessionId() { return state.sessionId },
  currentSampleCount() { return state.sampleIdx },
  currentEventCount() { return state.eventIdx },

  async startRecording(name) {
    if (state.recording) return state.sessionId
    const db = await openDb()
    const id = uuid()
    const session = {
      id,
      name: (name && String(name).trim()) || `Session ${new Date().toLocaleString()}`,
      startedAt: Date.now(),
      endedAt: null,
      note: '',
      sampleCount: 0,
      eventCount: 0,
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore('sessions').put(session)
    })
    state.recording = true
    state.sessionId = id
    state.startedAt = session.startedAt
    state.sampleIdx = 0
    state.eventIdx = 0
    state.pendingSamples = []
    state.pendingEvents = []
    notifyStatus()
    return id
  },

  async stopRecording() {
    if (!state.recording) return null
    const id = state.sessionId
    state.recording = false
    if (state.flushTimer) {
      clearTimeout(state.flushTimer)
      state.flushTimer = null
    }
    await flush()
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      const store = tx.objectStore('sessions')
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const s = getReq.result
        if (s) {
          s.endedAt = Date.now()
          s.sampleCount = state.sampleIdx
          s.eventCount = state.eventIdx
          store.put(s)
        }
      }
    })
    state.sessionId = null
    state.startedAt = null
    notifyStatus()
    return id
  },

  appendSample(sample) {
    // sample: { t (ms), c?, v? }
    if (!state.recording) return
    const t = sample.t instanceof Date ? sample.t.getTime() :
              (typeof sample.t === 'number' ? sample.t : Date.now())
    state.pendingSamples.push({
      sessionId: state.sessionId,
      idx: state.sampleIdx++,
      t,
      c: typeof sample.c === 'number' && !Number.isNaN(sample.c) ? sample.c : null,
      v: typeof sample.v === 'number' && !Number.isNaN(sample.v) ? sample.v : null,
    })
    if (state.pendingSamples.length + state.pendingEvents.length >= FLUSH_ROW_THRESHOLD) {
      flush().catch(err => console.error('[sessions] flush failed', err))
    } else {
      scheduleFlush()
    }
    notifyStatus()
  },

  appendEvent(evt) {
    // evt: { ts (Date), level, source, message } — matches eventBus shape
    if (!state.recording) return
    state.pendingEvents.push({
      sessionId: state.sessionId,
      idx: state.eventIdx++,
      t: evt.ts instanceof Date ? evt.ts.getTime() : Date.now(),
      level: String(evt.level || 'info'),
      source: String(evt.source || ''),
      message: String(evt.message || ''),
    })
    scheduleFlush()
    notifyStatus()
  },

  async listSessions() {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly')
      tx.onerror = () => reject(tx.error)
      const req = tx.objectStore('sessions').getAll()
      req.onsuccess = () => {
        const all = req.result || []
        all.sort((a, b) => b.startedAt - a.startedAt)
        resolve(all)
      }
      req.onerror = () => reject(req.error)
    })
  },

  async loadSession(id) {
    const db = await openDb()
    const session = await new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly')
      const req = tx.objectStore('sessions').get(id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (!session) throw new Error('session not found')
    const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])
    const samples = await new Promise((resolve, reject) => {
      const tx = db.transaction('samples', 'readonly')
      const req = tx.objectStore('samples').getAll(range)
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
    const events = await new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readonly')
      const req = tx.objectStore('events').getAll(range)
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
    return { session, samples, events }
  },

  async deleteSession(id) {
    const db = await openDb()
    const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['sessions', 'samples', 'events'], 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore('sessions').delete(id)
      tx.objectStore('samples').delete(range)
      tx.objectStore('events').delete(range)
    })
  },

  async renameSession(id, name) {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      const store = tx.objectStore('sessions')
      const req = store.get(id)
      req.onsuccess = () => {
        const s = req.result
        if (!s) return
        s.name = String(name || '').trim() || s.name
        store.put(s)
      }
    })
  },

  async exportSession(id, format) {
    const { session, samples, events } = await this.loadSession(id)
    if (format === 'json') {
      const blob = new Blob(
        [JSON.stringify({ session, samples, events }, null, 2)],
        { type: 'application/json' }
      )
      return { blob, name: `${safeName(session.name)}.json` }
    }
    // CSV (samples only — events go in a separate file if needed later)
    const rows = ['idx,timestamp_iso,unix_ms,current_a,voltage_v']
    for (const s of samples) {
      rows.push([
        s.idx,
        new Date(s.t).toISOString(),
        s.t,
        s.c == null ? '' : s.c,
        s.v == null ? '' : s.v,
      ].join(','))
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    return { blob, name: `${safeName(session.name)}.csv` }
  },

  // Subscribe to recording-status changes. Returns an unsubscribe fn.
  onStatus(cb) {
    if (typeof cb !== 'function') return () => {}
    state.statusListeners.push(cb)
    cb({
      recording: state.recording,
      sessionId: state.sessionId,
      sampleCount: state.sampleIdx,
      eventCount: state.eventIdx,
      startedAt: state.startedAt,
    })
    return () => {
      state.statusListeners = state.statusListeners.filter(fn => fn !== cb)
    }
  },
}

function safeName(s) {
  return String(s || 'session').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80)
}

export default sessions
