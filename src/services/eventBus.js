// Pure JS event bus for app-level observability events.
// No React. Subscribers receive the new event on each emit and can read the
// current list via getAll().

const MAX_EVENTS = 200

let nextId = 1
let events = []
const subscribers = new Set()

function notify(evt) {
  subscribers.forEach(cb => {
    try { cb(evt) } catch (e) { /* swallow subscriber errors */ }
  })
}

const eventBus = {
  emit(level, source, message) {
    const evt = {
      id: nextId++,
      ts: new Date(),
      level,
      source,
      message: String(message == null ? '' : message),
    }
    events.push(evt)
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS)
    }
    notify(evt)
    return evt
  },

  subscribe(cb) {
    if (typeof cb !== 'function') return () => {}
    subscribers.add(cb)
    return () => { subscribers.delete(cb) }
  },

  getAll() {
    return events.slice()
  },

  clear() {
    events = []
    notify(null)
  },
}

export default eventBus
