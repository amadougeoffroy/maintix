import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { api } from './api'
import { bootServerSession } from './session'
import { loadStore, runtime } from './store'
import './index.css'

registerSW({ immediate: true })

async function boot() {
  runtime.server = await api.probe()
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
