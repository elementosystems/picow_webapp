import React from 'react'

// Lucide-aligned icon set used across the bench UI.
const PATHS = {
  workbench: 'M3 11h18M5 7h14a2 2 0 0 1 2 2v10H3V9a2 2 0 0 1 2-2ZM9 7V5a3 3 0 0 1 6 0v2',
  scope:     'M3 12h3l2-8 4 16 3-12 2 4h4',
  history:   'M3 12a9 9 0 1 1 3 6.7M3 7v5h5M12 8v4l3 2',
  cpu:       'M5 9a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3',
  notes:     'M5 4h14v17H5zM9 4v17M9 9h8M9 13h8M9 17h6',
  pulse:     'M3 12h4l2-6 4 12 2-6h6',
  settings:  'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM19.4 12c0-.5 0-1-.1-1.4l2-1.5-2-3.4-2.3.9c-.7-.6-1.5-1-2.4-1.3L14 3h-4l-.6 2.3c-.9.3-1.7.7-2.4 1.3l-2.3-.9-2 3.4 2 1.5c0 .4-.1.9-.1 1.4s0 1 .1 1.4l-2 1.5 2 3.4 2.3-.9c.7.6 1.5 1 2.4 1.3L10 21h4l.6-2.3c.9-.3 1.7-.7 2.4-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.4Z',
  power:     'M12 3v9M6.4 7.6a8 8 0 1 0 11.2 0',
  zap:       'M13 2 4 14h7l-1 8 9-12h-7z',
  bug:       'M9 9h6M9 5l-2-2M15 5l2-2M5 13h2M17 13h2M5 19l2-1M17 18l2 1M9 9a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-4a3 3 0 0 0-3-3z',
  play:      'M6 4l14 8-14 8z',
  pause:     'M6 4h4v16H6zM14 4h4v16h-4z',
  record:    'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z',
  stop:      'M6 6h12v12H6z',
  download:  'M12 4v12M7 11l5 5 5-5M5 20h14',
  upload:    'M12 20V8M7 13l5-5 5 5M5 4h14',
  trash:     'M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13',
  plus:      'M12 5v14M5 12h14',
  close:     'M6 6l12 12M6 18 18 6',
  check:     'M5 12l5 5 9-9',
  link:      'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  unlink:    'M3 21l4-4M21 3l-4 4M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  sun:       'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4 4.2 19.8M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z',
  moon:      'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  arrow:     'M5 12h14M13 6l6 6-6 6',
  alert:     'M12 9v4M12 17h.01M5 21h14a2 2 0 0 0 1.7-3L13.7 5a2 2 0 0 0-3.4 0L3.3 18A2 2 0 0 0 5 21Z',
}

export function Icon({ name, size = 16, ...rest }) {
  const d = PATHS[name] || PATHS.workbench
  return (
    <svg
      className="ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={d} />
    </svg>
  )
}

export default Icon
