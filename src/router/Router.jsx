import React, { useEffect, useState, useCallback } from 'react'

// Hash router. No deps, no history-API rewrites needed in nginx, and the
// browser's URL handling stays out of our way for plain anchor links.
//
// API:
//   useRoute()                    -> { path, query }
//   navigate(path, query?)        -> updates window.location.hash
//   matchPath('/jobs/:id', path)  -> { id } | null
//   <NavLink to="/foo">…</NavLink>

function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/'
  const qIdx = raw.indexOf('?')
  if (qIdx < 0) return { path: normalizePath(raw), query: {} }
  const path = normalizePath(raw.slice(0, qIdx))
  const query = {}
  for (const part of raw.slice(qIdx + 1).split('&')) {
    if (!part) continue
    const eq = part.indexOf('=')
    if (eq < 0) query[decodeURIComponent(part)] = ''
    else query[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1))
  }
  return { path, query }
}

function normalizePath(p) {
  if (!p) return '/'
  if (p[0] !== '/') p = '/' + p
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

function buildHash(path, query) {
  const p = normalizePath(path)
  if (!query || !Object.keys(query).length) return '#' + p
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
    .join('&')
  return qs ? '#' + p + '?' + qs : '#' + p
}

export function navigate(path, query) {
  const next = buildHash(path, query)
  if (window.location.hash === next) return
  window.location.hash = next
}

export function matchPath(pattern, actual) {
  const ps = pattern.split('/').filter(Boolean)
  const as = actual.split('/').filter(Boolean)
  if (ps.length !== as.length) return null
  const out = {}
  for (let i = 0; i < ps.length; i++) {
    const seg = ps[i]
    if (seg.startsWith(':')) out[seg.slice(1)] = decodeURIComponent(as[i])
    else if (seg !== as[i]) return null
  }
  return out
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) window.location.hash = '#/'
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

export function NavLink({ to, query, className, activeClassName, exact, children, ...rest }) {
  const route = useRoute()
  const active = exact ? route.path === to : route.path === to || route.path.startsWith(to + '/')
  const onClick = useCallback((e) => {
    // Let cmd/ctrl/shift/middle-click fall through to the browser so users
    // can open routes in a new tab. We only intercept plain left-clicks.
    if (e.defaultPrevented) return
    if (e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to, query)
  }, [to, query])
  const cls = [className, active && (activeClassName || 'is-active')].filter(Boolean).join(' ')
  return (
    <a href={buildHash(to, query)} className={cls} onClick={onClick} {...rest}>
      {children}
    </a>
  )
}
