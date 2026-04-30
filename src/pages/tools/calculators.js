// Pure math for the Tools page. Zero React. Easy to unit-test.
//
// Public exports:
//   fmtSi(value, unit)         — "12.3 kΩ", "470 µF", "—" if non-finite
//   ohmsLaw({ V, I, R, P })    — fills in any one missing of V/I/R/P
//   divider({ vin, r1, r2 })   — { vout }
//   ledResistor({ vsupply, vf, ifMa, series })  — { exact, nearest }
//   nearestE12(value, series?) — round to nearest E-series value
//   decodeResistor([colors])   — 4- or 5-band → { value, tolerancePct, formatted }
//   rcTimeConstant({ r, c })   — { tau, fc }
//   RESISTOR_COLORS, BAND_VALUE, BAND_MULT, BAND_TOL — for UI

const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]
const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
             3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1]

export const RESISTOR_COLORS = {
  black:  { hex: '#0a0a0a', digit: 0, mult: 1,        tol: null  },
  brown:  { hex: '#6b3a1d', digit: 1, mult: 10,       tol: 1     },
  red:    { hex: '#c52828', digit: 2, mult: 100,      tol: 2     },
  orange: { hex: '#e07a1c', digit: 3, mult: 1000,     tol: null  },
  yellow: { hex: '#e5c533', digit: 4, mult: 10000,    tol: null  },
  green:  { hex: '#2c8a4a', digit: 5, mult: 100000,   tol: 0.5   },
  blue:   { hex: '#2a6dd1', digit: 6, mult: 1000000,  tol: 0.25  },
  violet: { hex: '#7c4ad1', digit: 7, mult: 10000000, tol: 0.1   },
  gray:   { hex: '#9099a6', digit: 8, mult: null,     tol: 0.05  },
  white:  { hex: '#f0f0f0', digit: 9, mult: null,     tol: null  },
  gold:   { hex: '#d6a23a', digit: null, mult: 0.1,   tol: 5     },
  silver: { hex: '#c0c4cc', digit: null, mult: 0.01,  tol: 10    },
}

export const BAND_VALUE = ['black','brown','red','orange','yellow','green','blue','violet','gray','white']
export const BAND_MULT  = ['silver','gold','black','brown','red','orange','yellow','green','blue','violet']
export const BAND_TOL   = ['brown','red','green','blue','violet','gray','gold','silver']

export function fmtSi(value, unit = '') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const prefixes = [
    { p: 1e12, s: 'T' }, { p: 1e9, s: 'G' }, { p: 1e6, s: 'M' }, { p: 1e3, s: 'k' },
    { p: 1, s: '' },
    { p: 1e-3, s: 'm' }, { p: 1e-6, s: 'µ' }, { p: 1e-9, s: 'n' }, { p: 1e-12, s: 'p' },
  ]
  if (abs === 0) return '0' + (unit ? ' ' + unit : '')
  let entry = prefixes[prefixes.length - 1]
  for (const e of prefixes) {
    if (abs >= e.p) { entry = e; break }
  }
  const scaled = value / entry.p
  const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2
  let s = scaled.toFixed(digits)
  // Strip trailing zeros only after a decimal point (so "470" stays "470"
  // but "1.50" becomes "1.5" and "12.00" becomes "12").
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s + ' ' + entry.s + unit
}

export function ohmsLaw({ V, I, R, P }) {
  const have = { V: isFinite(V), I: isFinite(I), R: isFinite(R), P: isFinite(P) }
  const count = (have.V?1:0) + (have.I?1:0) + (have.R?1:0) + (have.P?1:0)
  if (count < 2) return null
  let v = V, i = I, r = R, p = P
  // Derive missing from any pair.
  if (have.V && have.I) { r = v / i; p = v * i }
  else if (have.V && have.R) { i = v / r; p = (v * v) / r }
  else if (have.V && have.P) { i = p / v; r = (v * v) / p }
  else if (have.I && have.R) { v = i * r; p = i * i * r }
  else if (have.I && have.P) { v = p / i; r = p / (i * i) }
  else if (have.R && have.P) { v = Math.sqrt(p * r); i = Math.sqrt(p / r) }
  return { V: v, I: i, R: r, P: p }
}

export function divider({ vin, r1, r2 }) {
  if (!isFinite(vin) || !isFinite(r1) || !isFinite(r2)) return null
  if (r1 + r2 <= 0) return null
  return { vout: vin * r2 / (r1 + r2) }
}

export function ledResistor({ vsupply, vf, ifMa, series = E12 }) {
  if (!isFinite(vsupply) || !isFinite(vf) || !isFinite(ifMa)) return null
  if (ifMa <= 0) return null
  const ifA = ifMa / 1000
  const exact = (vsupply - vf) / ifA
  if (exact <= 0) return { exact, nearest: null, ok: false }
  return { exact, nearest: nearestE(exact, series), ok: true }
}

function nearestE(value, series) {
  if (!isFinite(value) || value <= 0) return null
  const exp = Math.floor(Math.log10(value))
  const norm = value / Math.pow(10, exp)
  let best = series[0], bestDiff = Math.abs(series[0] - norm)
  for (const s of series) {
    const d = Math.abs(s - norm)
    if (d < bestDiff) { best = s; bestDiff = d }
  }
  return best * Math.pow(10, exp)
}

export function nearestE12(v) { return nearestE(v, E12) }
export function nearestE24(v) { return nearestE(v, E24) }

export function decodeResistor(bands) {
  if (!Array.isArray(bands) || (bands.length !== 4 && bands.length !== 5)) return null
  const isFive = bands.length === 5
  const digitBands = isFive ? bands.slice(0, 3) : bands.slice(0, 2)
  const multBand = bands[isFive ? 3 : 2]
  const tolBand  = bands[isFive ? 4 : 3]
  let value = 0
  for (const b of digitBands) {
    const c = RESISTOR_COLORS[b]
    if (!c || c.digit == null) return null
    value = value * 10 + c.digit
  }
  const m = RESISTOR_COLORS[multBand]
  if (!m || m.mult == null) return null
  value = value * m.mult
  const t = RESISTOR_COLORS[tolBand]
  if (!t || t.tol == null) return null
  return {
    value,
    tolerancePct: t.tol,
    formatted: fmtSi(value, 'Ω') + ' ±' + t.tol + '%',
  }
}

export function rcTimeConstant({ r, c }) {
  if (!isFinite(r) || !isFinite(c)) return null
  const tau = r * c
  const fc = 1 / (2 * Math.PI * tau)
  return { tau, fc }
}
