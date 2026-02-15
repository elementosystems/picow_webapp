import React from 'react'
import versionInfo from '../version.json'
import Connection from './components/Connection'
import Controls from './components/Controls'
import Charts from './components/Charts'
import DarkModeToggle from './components/DarkModeToggle'

export default function App() {
  return (
    <div className="container">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <header style={{flex: 1}}>
          <h1 style={{margin: 0}}>Power Control and Flash Mode Selector</h1>
        </header>
        <div style={{flex: 0}}>
          <DarkModeToggle />
        </div>
      </div>

      <Connection />

      <main>
        <Controls />
        <Charts />
      </main>

      <footer style={{display: 'flex', alignItems: 'center'}}>
        <div style={{flex: 1, textAlign: 'left'}}>
          <a href="https://github.com/elementosystems/picow_webapp" target="_blank" rel="noreferrer">
            <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub" style={{height: 24}}/>
          </a>
        </div>
        <div style={{flex: 1, textAlign: 'center'}}>
          <p style={{margin: 0, fontWeight: 'bold'}}>&copy;2025 BSADASHI</p>
        </div>
        <div style={{flex: 1, textAlign: 'right', fontWeight: 'bold'}}>v{versionInfo.version}</div>
      </footer>
    </div>
  )
}
