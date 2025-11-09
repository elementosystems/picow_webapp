import React, { useEffect, useState } from 'react'

export default function DarkModeToggle() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('darkMode')
    const isEnabled = stored === 'enabled'
    setEnabled(isEnabled)
    if (isEnabled) document.body.classList.add('dark-mode')
    else document.body.classList.remove('dark-mode')
  }, [])

  function toggle(e) {
    const on = e.target.checked
    setEnabled(on)
    if (on) {
      document.body.classList.add('dark-mode')
      localStorage.setItem('darkMode', 'enabled')
    } else {
      document.body.classList.remove('dark-mode')
      localStorage.setItem('darkMode', 'disabled')
    }
  }

  return (
    <div id="darkModeContainer" style={{display: 'flex', alignItems: 'center', gap: 8}}>
      <label className="toggle" style={{marginBottom: 0}}>
        <input type="checkbox" id="darkModeToggle" checked={enabled} onChange={toggle} />
        <span className="slider round"></span>
      </label>
      <span style={{fontSize: '0.98rem'}}>Dark Mode</span>
    </div>
  )
}
