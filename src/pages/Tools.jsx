import React, { useMemo, useState } from 'react'
import {
  fmtSi,
  ohmsLaw,
  divider,
  ledResistor,
  decodeResistor,
  rcTimeConstant,
  RESISTOR_COLORS,
  BAND_VALUE,
  BAND_MULT,
  BAND_TOL,
} from './tools/calculators'

const TABS = [
  { id: 'ohms', label: "Ohm's law" },
  { id: 'divider', label: 'Voltage divider' },
  { id: 'led', label: 'LED resistor' },
  { id: 'decode', label: 'Resistor decoder' },
  { id: 'rc', label: 'RC time constant' },
]

export default function Tools() {
  const [tab, setTab] = useState('ohms')
  return (
    <section className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Tools</h1>
          <p className="page__sub">Bench calculators. SI-formatted. Pure functions — easy to unit-test.</p>
        </div>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={'tabs__btn' + (tab === t.id ? ' is-active' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ohms' && <OhmsLaw />}
      {tab === 'divider' && <Divider />}
      {tab === 'led' && <LedResistor />}
      {tab === 'decode' && <ResistorDecoder />}
      {tab === 'rc' && <RcCalc />}
    </section>
  )
}

function NumberField({ label, unit, value, onChange }) {
  return (
    <label className="field">
      <span className="field__label">{label}{unit ? ' (' + unit + ')' : ''}</span>
      <input
        className="input"
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
      />
    </label>
  )
}

function num(v) { return v === '' || v == null ? NaN : +v }

function OhmsLaw() {
  const [V, setV] = useState('')
  const [I, setI] = useState('')
  const [R, setR] = useState('')
  const [P, setP] = useState('')
  const result = useMemo(
    () => ohmsLaw({ V: num(V), I: num(I), R: num(R), P: num(P) }),
    [V, I, R, P]
  )
  return (
    <div className="card">
      <p className="t-muted">Fill in any two — the rest fall out.</p>
      <div className="form-grid">
        <NumberField label="Voltage" unit="V" value={V} onChange={setV} />
        <NumberField label="Current" unit="A" value={I} onChange={setI} />
        <NumberField label="Resistance" unit="Ω" value={R} onChange={setR} />
        <NumberField label="Power" unit="W" value={P} onChange={setP} />
      </div>
      {result && (
        <div className="result-grid">
          <Result label="V" value={fmtSi(result.V, 'V')} />
          <Result label="I" value={fmtSi(result.I, 'A')} />
          <Result label="R" value={fmtSi(result.R, 'Ω')} />
          <Result label="P" value={fmtSi(result.P, 'W')} />
        </div>
      )}
    </div>
  )
}

function Divider() {
  const [vin, setVin] = useState('')
  const [r1, setR1] = useState('')
  const [r2, setR2] = useState('')
  const r = useMemo(() => divider({ vin: num(vin), r1: num(r1), r2: num(r2) }), [vin, r1, r2])
  return (
    <div className="card">
      <p className="t-muted">Vout = Vin × R2 / (R1 + R2)</p>
      <div className="form-grid">
        <NumberField label="Vin" unit="V" value={vin} onChange={setVin} />
        <NumberField label="R1" unit="Ω" value={r1} onChange={setR1} />
        <NumberField label="R2" unit="Ω" value={r2} onChange={setR2} />
      </div>
      {r && (
        <div className="result-grid">
          <Result label="Vout" value={fmtSi(r.vout, 'V')} big />
        </div>
      )}
    </div>
  )
}

function LedResistor() {
  const [vsupply, setVs] = useState('5')
  const [vf, setVf] = useState('2.0')
  const [ifMa, setIf] = useState('20')
  const r = useMemo(
    () => ledResistor({ vsupply: num(vsupply), vf: num(vf), ifMa: num(ifMa) }),
    [vsupply, vf, ifMa]
  )
  return (
    <div className="card">
      <p className="t-muted">R = (Vsupply − Vf) / If — rounded to nearest E12 series value.</p>
      <div className="form-grid">
        <NumberField label="Vsupply" unit="V" value={vsupply} onChange={setVs} />
        <NumberField label="Vf (LED)" unit="V" value={vf} onChange={setVf} />
        <NumberField label="If" unit="mA" value={ifMa} onChange={setIf} />
      </div>
      {r && r.ok && (
        <div className="result-grid">
          <Result label="Exact R" value={fmtSi(r.exact, 'Ω')} />
          <Result label="Nearest E12" value={fmtSi(r.nearest, 'Ω')} big />
        </div>
      )}
      {r && !r.ok && <div className="banner banner--err">Vf ≥ Vsupply — LED won't light.</div>}
    </div>
  )
}

function ResistorDecoder() {
  const [bands, setBands] = useState(['brown', 'black', 'black', 'red', 'brown'])
  const [count, setCount] = useState(4)
  const colors = useMemo(() => bands.slice(0, count === 4 ? 4 : 5), [bands, count])
  const result = useMemo(() => {
    if (count === 4) return decodeResistor(colors.slice(0, 4))
    return decodeResistor(colors.slice(0, 5))
  }, [colors, count])

  function setBand(i, v) {
    setBands((b) => {
      const n = b.slice()
      n[i] = v
      return n
    })
  }

  return (
    <div className="card">
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={count === 4} className={'segmented__btn' + (count === 4 ? ' is-active' : '')} onClick={() => setCount(4)}>4-band</button>
        <button role="tab" aria-selected={count === 5} className={'segmented__btn' + (count === 5 ? ' is-active' : '')} onClick={() => setCount(5)}>5-band</button>
      </div>

      <div className="band-pickers">
        {Array.from({ length: count }).map((_, i) => {
          const role = i === count - 1 ? 'tol' : i === count - 2 ? 'mult' : 'digit'
          const palette = role === 'tol' ? BAND_TOL : role === 'mult' ? BAND_MULT : BAND_VALUE
          return (
            <label key={i} className="field">
              <span className="field__label">Band {i + 1} ({role})</span>
              <select
                className="input input--inline"
                value={bands[i]}
                onChange={(e) => setBand(i, e.target.value)}
              >
                {palette.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )
        })}
      </div>

      <ResistorViz bands={colors} />

      {result ? (
        <div className="result-grid">
          <Result label="Value" value={result.formatted} big />
        </div>
      ) : (
        <div className="banner banner--warn">Color combination doesn't decode (e.g. multiplier/tolerance band has no value).</div>
      )}
    </div>
  )
}

function ResistorViz({ bands }) {
  return (
    <div className="resistor">
      <div className="resistor__leads">
        <span className="resistor__lead" />
        <span className="resistor__body">
          {bands.map((c, i) => (
            <span
              key={i}
              className="resistor__band"
              style={{ background: (RESISTOR_COLORS[c] && RESISTOR_COLORS[c].hex) || '#888' }}
              title={c}
            />
          ))}
        </span>
        <span className="resistor__lead" />
      </div>
    </div>
  )
}

function RcCalc() {
  const [r, setR] = useState('1000')
  const [c, setC] = useState('0.0000001') // 100 nF
  const result = useMemo(() => rcTimeConstant({ r: num(r), c: num(c) }), [r, c])
  return (
    <div className="card">
      <p className="t-muted">τ = R·C, fc = 1 / (2π·τ).</p>
      <div className="form-grid">
        <NumberField label="R" unit="Ω" value={r} onChange={setR} />
        <NumberField label="C" unit="F" value={c} onChange={setC} />
      </div>
      {result && (
        <div className="result-grid">
          <Result label="τ" value={fmtSi(result.tau, 's')} />
          <Result label="fc (-3 dB)" value={fmtSi(result.fc, 'Hz')} big />
        </div>
      )}
    </div>
  )
}

function Result({ label, value, big }) {
  return (
    <div className={'result' + (big ? ' result--big' : '')}>
      <div className="result__label">{label}</div>
      <div className="result__value">{value}</div>
    </div>
  )
}
