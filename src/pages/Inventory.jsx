import React, { useMemo, useState } from 'react'
import { useRoute, navigate } from '../router/Router'
import { inventoryStore, addPart, updatePart, deletePart, adjustQty, isLow } from '../stores/inventory'

export default function Inventory() {
  const route = useRoute()
  const items = inventoryStore.useStore((s) => s.items)
  const initialQ = route.query.q || ''
  const [q, setQ] = useState(initialQ)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)

  React.useEffect(() => { setQ(initialQ) }, [initialQ])

  function setQuery(v) {
    setQ(v)
    navigate('/inventory', v ? { q: v } : {})
  }

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return items
    return items.filter((p) =>
      p.name.toLowerCase().includes(term) ||
      p.category.toLowerCase().includes(term) ||
      p.location.toLowerCase().includes(term) ||
      p.notes.toLowerCase().includes(term)
    )
  }, [items, q])

  return (
    <section className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Inventory</h1>
          <p className="page__sub">Parts on the bench. Anything at or below its low-at level is flagged on the rail.</p>
        </div>
        <div className="page__actions">
          <button className="btn btn-primary" onClick={() => { setCreating((v) => !v); setEditingId(null) }}>
            {creating ? 'Cancel' : 'Add part'}
          </button>
        </div>
      </header>

      <div className="inv__toolbar">
        <input
          className="input"
          placeholder="Search name / category / location / notes…"
          value={q}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {creating && (
        <div className="card">
          <PartForm
            onSave={(values) => { addPart(values); setCreating(false) }}
            onCancel={() => setCreating(false)}
            submitLabel="Add part"
          />
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty">{items.length === 0 ? 'No parts yet.' : 'No parts match.'}</div>
      ) : (
        <table className="inv__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th className="inv__num">Qty</th>
              <th className="inv__num">Low at</th>
              <th>Location</th>
              <th aria-label="actions"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) =>
              editingId === p.id ? (
                <tr key={p.id} className="inv__edit-row">
                  <td colSpan={6}>
                    <PartForm
                      initial={p}
                      onSave={(values) => { updatePart(p.id, values); setEditingId(null) }}
                      onCancel={() => setEditingId(null)}
                      submitLabel="Save"
                    />
                  </td>
                </tr>
              ) : (
                <tr key={p.id} className={isLow(p) ? 'is-low' : ''}>
                  <td>
                    <div className="inv__name">{p.name}</div>
                    {p.notes && <div className="inv__sub">{p.notes}</div>}
                  </td>
                  <td>{p.category || <span className="t-muted">—</span>}</td>
                  <td className="inv__num">
                    <div className="inv__qty">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => adjustQty(p.id, -1)}
                        disabled={p.qty === 0}
                        aria-label="decrement"
                      >−</button>
                      <span className="inv__qty-num">{p.qty}</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => adjustQty(p.id, +1)} aria-label="increment">+</button>
                    </div>
                  </td>
                  <td className="inv__num">{p.lowAt}</td>
                  <td>{p.location || <span className="t-muted">—</span>}</td>
                  <td className="inv__actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(p.id)}>Edit</button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => { if (confirm('Delete "' + p.name + '"?')) deletePart(p.id) }}
                    >Delete</button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </section>
  )
}

function PartForm({ initial, onSave, onCancel, submitLabel }) {
  const [name, setName] = useState((initial && initial.name) || '')
  const [category, setCategory] = useState((initial && initial.category) || '')
  const [qty, setQty] = useState((initial && initial.qty) || 0)
  const [lowAt, setLowAt] = useState((initial && initial.lowAt) || 0)
  const [location, setLocation] = useState((initial && initial.location) || '')
  const [notes, setNotes] = useState((initial && initial.notes) || '')

  function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name, category, qty: +qty || 0, lowAt: +lowAt || 0, location, notes })
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <label className="field"><span className="field__label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="field"><span className="field__label">Category</span>
        <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="capacitor / resistor / IC / …" />
      </label>
      <label className="field"><span className="field__label">Qty</span>
        <input className="input" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>
      <label className="field"><span className="field__label">Low at</span>
        <input className="input" type="number" min={0} value={lowAt} onChange={(e) => setLowAt(e.target.value)} />
      </label>
      <label className="field"><span className="field__label">Location</span>
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="bin A2 / drawer 3 / …" />
      </label>
      <label className="field field--wide"><span className="field__label">Notes</span>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="form__actions form-grid__actions">
        <button type="submit" className="btn btn-primary">{submitLabel}</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
