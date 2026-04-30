import { createStore } from './createStore'

// Repair journal. One job = one device on the bench. Mutations all go through
// named functions so the page code never touches `set` directly — that's the
// migration boundary when we move to a backend.
//
// Shape:
//   { items: [Job], activeId: string|null }
//
// Job:
//   { id, title, device, symptoms, status, createdAt, updatedAt, closedAt,
//     notes, timeline: [{id, ts, level, source, message}], photos: [...], bom: [] }

const TIMELINE_CAP = 500

function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

export const jobsStore = createStore('picow:jobs', {
  items: [],
  activeId: null,
})

export function listJobs() {
  return jobsStore.get().items
}

export function getJob(id) {
  return jobsStore.get().items.find((j) => j.id === id) || null
}

export function createJob({ title, device = '', symptoms = '', notes = '' } = {}) {
  const now = Date.now()
  const job = {
    id: uid(),
    title: (title && String(title).trim()) || 'Untitled job',
    device: String(device || '').trim(),
    symptoms: String(symptoms || '').trim(),
    status: 'open',
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    notes: String(notes || ''),
    timeline: [],
    photos: [],
    bom: [],
  }
  jobsStore.set((s) => ({ ...s, items: [job, ...s.items] }))
  return job.id
}

export function updateJob(id, patch) {
  jobsStore.set((s) => ({
    ...s,
    items: s.items.map((j) => (j.id === id ? applyPatch(j, patch) : j)),
  }))
}

function applyPatch(job, patch) {
  const next = { ...job, ...patch, updatedAt: Date.now() }
  if (patch.status && patch.status !== job.status) {
    if (patch.status === 'fixed' || patch.status === 'scrapped') {
      next.closedAt = next.closedAt || Date.now()
    } else {
      next.closedAt = null
    }
  }
  return next
}

export function deleteJob(id) {
  jobsStore.set((s) => ({
    ...s,
    items: s.items.filter((j) => j.id !== id),
    activeId: s.activeId === id ? null : s.activeId,
  }))
}

export function setActiveJob(id) {
  jobsStore.set((s) => ({ ...s, activeId: id }))
}

export function clearActiveJob() {
  jobsStore.set((s) => ({ ...s, activeId: null }))
}

export function appendTimelineEntry(id, entry) {
  if (!entry || !entry.message) return
  jobsStore.set((s) => ({
    ...s,
    items: s.items.map((j) => {
      if (j.id !== id) return j
      const row = {
        id: uid(),
        ts: entry.ts instanceof Date ? entry.ts.getTime() :
            typeof entry.ts === 'number' ? entry.ts : Date.now(),
        level: String(entry.level || 'info'),
        source: String(entry.source || ''),
        message: String(entry.message),
      }
      const tl = [...j.timeline, row]
      // Cap the buffer so a noisy session can't blow localStorage.
      if (tl.length > TIMELINE_CAP) tl.splice(0, tl.length - TIMELINE_CAP)
      return { ...j, timeline: tl, updatedAt: Date.now() }
    }),
  }))
}

export function addPhoto(id, { dataUrl, caption }) {
  jobsStore.set((s) => ({
    ...s,
    items: s.items.map((j) =>
      j.id === id
        ? {
            ...j,
            photos: [
              ...j.photos,
              { id: uid(), dataUrl, caption: String(caption || ''), ts: Date.now() },
            ],
            updatedAt: Date.now(),
          }
        : j
    ),
  }))
}

export function removePhoto(id, photoId) {
  jobsStore.set((s) => ({
    ...s,
    items: s.items.map((j) =>
      j.id === id
        ? { ...j, photos: j.photos.filter((p) => p.id !== photoId), updatedAt: Date.now() }
        : j
    ),
  }))
}
