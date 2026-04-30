import { createStore } from './createStore'

// Parts inventory. Flat list. Fields the bench typically wants: a free-text
// name, a category, current qty, a "low at" threshold, location, and notes.

function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

export const inventoryStore = createStore('picow:inventory', { items: [] })

export function listParts() {
  return inventoryStore.get().items
}

export function isLow(part) {
  if (!part) return false
  if (typeof part.lowAt !== 'number') return false
  return part.qty <= part.lowAt
}

export function lowCount() {
  return inventoryStore.get().items.filter(isLow).length
}

export function addPart({ name, category = '', qty = 0, lowAt = 0, location = '', notes = '' } = {}) {
  const now = Date.now()
  const part = {
    id: uid(),
    name: String(name || '').trim() || 'Unnamed part',
    category: String(category || '').trim(),
    qty: Number.isFinite(+qty) ? Math.max(0, +qty) : 0,
    lowAt: Number.isFinite(+lowAt) ? Math.max(0, +lowAt) : 0,
    location: String(location || '').trim(),
    notes: String(notes || ''),
    createdAt: now,
    updatedAt: now,
  }
  inventoryStore.set((s) => ({ items: [part, ...s.items] }))
  return part.id
}

export function updatePart(id, patch) {
  inventoryStore.set((s) => ({
    items: s.items.map((p) =>
      p.id === id
        ? {
            ...p,
            ...patch,
            qty: 'qty' in patch ? Math.max(0, +patch.qty || 0) : p.qty,
            lowAt: 'lowAt' in patch ? Math.max(0, +patch.lowAt || 0) : p.lowAt,
            updatedAt: Date.now(),
          }
        : p
    ),
  }))
}

export function deletePart(id) {
  inventoryStore.set((s) => ({ items: s.items.filter((p) => p.id !== id) }))
}

// Atomic qty change. Pages call this rather than a read-then-write so a
// future multi-tab world doesn't race.
export function adjustQty(id, delta) {
  const d = Math.trunc(+delta) || 0
  if (!d) return
  inventoryStore.set((s) => ({
    items: s.items.map((p) =>
      p.id === id ? { ...p, qty: Math.max(0, p.qty + d), updatedAt: Date.now() } : p
    ),
  }))
}
