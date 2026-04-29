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
    surface2: readVar('--surface-2'),
  }
}

function fmtNumber(v, digits) {
  if (v == null || Number.isNaN(v)) return '—'
  return Number(v).toFixed(digits)
}

// Convert a #rrggbb / #rgb token into rgba(...) with the given alpha.
// Falls back to the original string for non-hex values (rgb(), names, etc.).
function withAlpha(color, alpha) {
  if (!color) return `rgba(0,0,0,${alpha})`
  const hex = color.trim()
  if (hex.startsWith('#')) {
    let r, g, b
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16)
      g = parseInt(hex[2] + hex[2], 16)
      b = parseInt(hex[3] + hex[3], 16)
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16)
      g = parseInt(hex.slice(3, 5), 16)
      b = parseInt(hex.slice(5, 7), 16)
    } else {
      return color
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

/**
 * series:     [{ label, color, unit, precision }]
 * data:       [xs, ys1, ys2, ...]   (xs in unix seconds)
 * height:     chart pixel height
 * dualAxis:   if true, each series gets its own y scale (`y0`, `y1`, ...)
 * thresholds: optional [{ scale, value, color }] — dashed horizontal lines at
 *             the given y on the given scale. Single-axis: scale="y". Dual-axis:
 *             "y0" / "y1".
 * markers:    optional [{ ts (unix s), label?, color? }] — vertical dashed lines
 *             drawn on the canvas via the uPlot draw hook.
 */
export default function TelemetryChart({ series, data, height = 220, dualAxis = false, thresholds = [], markers = [] }) {
  const containerRef = useRef(null)
  const plotRef = useRef(null)
  const seriesRef = useRef(series)
  seriesRef.current = series
  const markersRef = useRef(markers)
  markersRef.current = markers

  // Keep latest thresholds in a ref so the draw hook (which closes over it once
  // at chart construction) always sees the current value without forcing a remount.
  const thresholdsRef = useRef(thresholds)
  thresholdsRef.current = thresholds

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
      hooks: {
        // Two passes after series strokes: horizontal threshold lines + vertical
        // event markers. Both pull from refs so prop updates take effect without
        // a remount.
        draw: [
          (u) => {
            const lines = thresholdsRef.current
            if (!lines || !lines.length) return
            const ctx = u.ctx
            const { left, top, width: plotW, height: plotH } = u.bbox
            ctx.save()
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            for (const line of lines) {
              if (!line || typeof line.value !== 'number' || Number.isNaN(line.value)) continue
              const scaleKey = line.scale || (dualAxis ? 'y0' : 'y')
              const scale = u.scales[scaleKey]
              if (!scale || scale.min == null || scale.max == null) continue
              const y = u.valToPos(line.value, scaleKey, true)
              if (!Number.isFinite(y)) continue
              if (y < top || y > top + plotH) continue
              ctx.strokeStyle = line.color || 'rgba(255,255,255,0.4)'
              ctx.beginPath()
              ctx.moveTo(left, y)
              ctx.lineTo(left + plotW, y)
              ctx.stroke()
            }
            ctx.restore()
          },
          (u) => {
            const list = markersRef.current
            if (!list || list.length === 0) return
            const ctx = u.ctx
            const { left, top, width: plotW, height: plotH } = u.bbox
            const fallbackColor = t.text || '#888'
            const pillBg = withAlpha(t.surface2 || '#1a1e27', 0.92)
            const pillBorder = withAlpha(t.grid || '#262c39', 0.9)
            const fontPx = 11
            const lineH = 17        // row height (font + vertical padding)
            const padX = 5
            const padY = 2
            const rowGap = 2

            ctx.save()
            ctx.lineWidth = 1
            ctx.font = `500 ${fontPx}px ui-monospace, Menlo, Consolas, monospace`
            ctx.textBaseline = 'top'

            // First pass — vertical dashed guides beneath all labels so they
            // never appear "behind" their own pill.
            ctx.setLineDash([4, 3])
            for (const m of list) {
              const xPos = u.valToPos(m.ts, 'x', true)
              if (xPos == null || xPos < left || xPos > left + plotW) continue
              ctx.strokeStyle = m.color || fallbackColor
              ctx.beginPath()
              ctx.moveTo(xPos + 0.5, top)
              ctx.lineTo(xPos + 0.5, top + plotH)
              ctx.stroke()
            }

            // Second pass — labels with row-based collision avoidance. Each
            // row tracks the rightmost x of every pill placed in it; a new
            // pill drops down to the next row if it would overlap.
            ctx.setLineDash([])
            const rows = []           // rows[i] = [{x1, x2}, ...]
            const maxRows = Math.max(1, Math.floor((plotH - 4) / (lineH + rowGap)))
            const maxLen = 28
            for (const m of list) {
              if (!m.label) continue
              const xPos = u.valToPos(m.ts, 'x', true)
              if (xPos == null || xPos < left || xPos > left + plotW) continue
              const text = String(m.label)
              const display = text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text
              const textW = ctx.measureText(display).width
              const w = textW + padX * 2
              const x1 = Math.min(xPos + 4, left + plotW - w - 1)
              const x2 = x1 + w
              // Find the first row this pill fits in
              let row = 0
              while (
                row < rows.length &&
                rows[row].some(s => !(x2 + 2 < s.x1 || x1 > s.x2 + 2))
              ) row++
              if (row >= maxRows) continue          // out of vertical room
              if (row === rows.length) rows.push([])
              rows[row].push({ x1, x2 })
              const y = top + 3 + row * (lineH + rowGap)
              // Pill background + thin coloured border
              ctx.fillStyle = pillBg
              ctx.fillRect(x1, y, w, lineH)
              ctx.strokeStyle = withAlpha(m.color || fallbackColor, 0.55)
              ctx.strokeRect(x1 + 0.5, y + 0.5, w - 1, lineH - 1)
              // Label text
              ctx.fillStyle = m.color || fallbackColor
              ctx.fillText(display, x1 + padX, y + padY)
              // Tiny pip joining the pill to the vertical line
              ctx.strokeStyle = withAlpha(m.color || fallbackColor, 0.7)
              ctx.beginPath()
              ctx.moveTo(xPos + 0.5, y + lineH / 2)
              ctx.lineTo(x1, y + lineH / 2)
              ctx.stroke()
            }
            ctx.setLineDash([4, 3])  // restore dash for any subsequent draws
            ctx.restore()
          },
        ],
      },
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

  // Threshold or marker prop changes don't require a remount — both are read
  // from refs by the draw hook — but we do need to repaint to show the changes.
  useEffect(() => {
    if (plotRef.current) plotRef.current.redraw(false, false)
  }, [thresholds, markers])

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
