import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { api } from './api'
import { bootServerSession } from './session'
import { loadStore, runtime } from './store'
import './index.css'
import { getTheme, setTheme } from './theme'
import { decideMode, demoRequested, isLocalHost } from './demo'

setTheme(getTheme(), false) // thème choisi par l'utilisateur, avant le premier rendu

registerSW({ immediate: true })

async function boot() {
  const reachable = await api.probe()
  Object.assign(runtime, decideMode({ reachable, explicitDemo: demoRequested(), localHost: isLocalHost() }))
  await loadStore()
  if (runtime.server) await bootServerSession()
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  )
}
void boot()
