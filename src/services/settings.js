// Tiny localStorage helper used to persist UI settings under the `picow:` prefix.
// JSON-aware. Storage / parse errors are swallowed so the UI keeps working in
// environments where localStorage is unavailable or the stored shape is bad.

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null || raw === undefined) return fallback
    try {
      return JSON.parse(raw)
    } catch (_jsonErr) {
      // Stored value isn't valid JSON; treat as missing.
      return fallback
    }
  } catch (_storageErr) {
    return fallback
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (_err) {
    // Quota / disabled storage / serialization errors all swallowed by design.
  }
}

// Helper used by both the metric card and the chart line tinting.
// `min` and/or `max` may be null/undefined — that side of the range is open.
export function isBreach(value, min, max) {
  if (typeof value !== 'number' || Number.isNaN(value)) return false
  if (typeof min === 'number' && value < min) return true
  if (typeof max === 'number' && value > max) return true
  return false
}

export const SETTINGS_KEYS = {
  windowSec: 'picow:windowSec',
  viewMode: 'picow:viewMode',
  showDemo: 'picow:showDemo',
  thresholds: 'picow:thresholds',
}
