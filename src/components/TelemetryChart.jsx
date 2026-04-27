import React, { useEffect, useLayoutEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

function readVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function themeTokens() {
  return {
    grid: readVar('--border'),
    axisLine: readVar('--border-strong'),
    text: readVar('--text-muted'),
    textFaint: readVar('--text-faint'),
    surface: readVar('--surface-1'),
  }
}

function fmtNumber(v, digits) {
  if (v == null || Number.isNaN(v)) return '—'
  return Number(v).toFixed(digits)
}

/**
 * series:  [{ label, color, unit, precision }]
 * data:    [xs, ys1, ys2, ...]   (xs in unix seconds)
 * height:  chart pixel height
 * markers: [{ ts (unix seconds), label?, color? }] — vertical dashed lines
 *          drawn on the canvas via the uPlot draw hook.
 */
export default function TelemetryChart({ series, data, height = 220, dualAxis = false, markers = [] }) {
  const containerRef = useRef(null)
  const plotRef = useRef(null)
  const seriesRef = useRef(series)
  seriesRef.current = series
  const markersRef = useRef(markers)
  markersRef.current = markers

  // Build options
  function buildOptions(width) {
    const t = themeTokens()
    const axisCommon = {
      stroke: t.text,
      grid: { stroke: t.grid, width: 1 },
      ticks: { stroke: t.grid, width: 1 },
      font: '11px ui-monospace, Menlo, Consolas, monospace',
    }
    const cfg = {
      width,
      height,
      padding: [12, 8, 6, 8],
      legend: { show: false },
      hooks: {
        draw: [
          (u) => {
            const list = markersRef.current
            if (!list || list.length === 0) return
            const ctx = u.ctx
            const { left, top, width: plotW, height: plotH } = u.bbox
            const fallbackColor = t.text || '#888'
            ctx.save()
            ctx.lineWidth = 1
            ctx.setLineDash([4, 3])
            ctx.font = '10px ui-monospace, Menlo, Consolas, monospace'
            ctx.textBaseline = 'top'
            for (const m of list) {
              const xPos = u.valToPos(m.ts, 'x', true)
              if (xPos == null || xPos < left || xPos > left + plotW) continue
              ctx.strokeStyle = m.color || fallbackColor
              ctx.beginPath()
              ctx.moveTo(xPos + 0.5, top)
              ctx.lineTo(xPos + 0.5, top + plotH)
              ctx.stroke()
              if (m.label) {
                ctx.setLineDash([])
                ctx.fillStyle = m.color || fallbackColor
                const text = String(m.label)
                const maxLen = 22
                const display = text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text
                ctx.fillText(display, xPos + 3, top + 2)
                ctx.setLineDash([4, 3])
              }
            }
            ctx.restore()
          },
        ],
      },
      cursor: {
        drag: { x: true, y: false },
        points: { size: 7, fill: t.surface, stroke: undefined },
        focus: { prox: 30 },
        sync: { key: 'picow', setSeries: true },
      },
      scales: { x: { time: true } },
      series: [
        { value: (_, ts) => ts != null ? new Date(ts * 1000).toLocaleTimeString() : '—' },
        ...series.map((s, i) => ({
          label: s.label,
          stroke: s.color,
          width: 2,
          points: { show: false },
          paths: uPlot.paths.spline ? uPlot.paths.spline() : undefined,
          scale: dualAxis ? `y${i}` : 'y',
          value: (_, v) => v == null ? '—' : `${fmtNumber(v, s.precision ?? 3)} ${s.unit ?? ''}`.trim(),
        })),
      ],
      axes: [
        { ...axisCommon },
        ...(dualAxis
          ? series.map((s, i) => ({
              ...axisCommon,
              scale: `y${i}`,
              side: i === 0 ? 3 : 1,
              stroke: s.color,
              grid: { stroke: i === 0 ? t.grid : 'transparent', width: 1 },
              values: (_, ticks) => ticks.map(v => fmtNumber(v, s.precision ?? 2)),
            }))
          : [{
              ...axisCommon,
              values: (_, ticks) => ticks.map(v => fmtNumber(v, series[0]?.precision ?? 2)),
            }]),
      ],
    }
    return cfg
  }

  // Mount plot. Defer creation until the first non-empty data set arrives —
  // uPlot's drawAxesGrid throws when axes are drawn with zero-length data, and
  // a failed initial paint also stops our marker draw-hook from running.
  useLayoutEffect(() => {
    if (!containerRef.current) return
    if (plotRef.current) return
    if (!data || !data[0] || data[0].length === 0) return
    const width = containerRef.current.clientWidth
    const cfg = buildOptions(width)
    plotRef.current = new uPlot(cfg, data, containerRef.current)
    return () => {
      if (plotRef.current) {
        plotRef.current.destroy()
        plotRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // Cleanup on unmount even if mount was deferred.
  useEffect(() => () => {
    if (plotRef.current) {
      plotRef.current.destroy()
      plotRef.current = null
    }
  }, [])

  // Update data on prop change
  useEffect(() => {
    if (plotRef.current && data) {
      plotRef.current.setData(data, true)
    }
  }, [data])

  // Trigger a redraw when markers change so the draw hook re-runs
  useEffect(() => {
    if (plotRef.current) plotRef.current.redraw(false, false)
  }, [markers])

  // Resize observer for responsive width
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width)
        if (plotRef.current && w > 0) plotRef.current.setSize({ width: w, height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [height])

  // Re-theme on data-theme attribute change
  useEffect(() => {
    const obs = new MutationObserver(() => {
      if (!plotRef.current || !containerRef.current) return
      const width = containerRef.current.clientWidth
      // Recreate plot with fresh theme tokens (cheaper than mutating opts deeply)
      const oldData = plotRef.current.data
      plotRef.current.destroy()
      const cfg = buildOptions(width)
      plotRef.current = new uPlot(cfg, oldData, containerRef.current)
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return <div ref={containerRef} className="uplot-host" />
}
