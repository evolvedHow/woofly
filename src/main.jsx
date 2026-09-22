import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import 'regenerator-runtime/runtime'
import 'leaflet/dist/leaflet.css'
import './index.css'

const saved = localStorage.getItem('woofly_theme')
if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark')
}

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppProvider>
    <App />
  </AppProvider>
)