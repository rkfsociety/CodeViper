import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const DYNAMIC_IMPORT_RELOAD_KEY = 'cv:dynamic-import-reload'

function isStaleDynamicImportError(reason: unknown): boolean {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : typeof reason === 'object' && reason && 'message' in reason
          ? String(reason.message)
          : ''

  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Failed to fetch module')
  )
}

function reloadForStaleDynamicImport(): void {
  try {
    if (window.sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) === '1') return
    window.sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, '1')
  } catch {
    return
  }
  window.location.reload()
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  reloadForStaleDynamicImport()
})

window.addEventListener('unhandledrejection', (event) => {
  if (!isStaleDynamicImportError(event.reason)) return
  event.preventDefault()
  reloadForStaleDynamicImport()
})

window.addEventListener('load', () => {
  try {
    window.sessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_KEY)
  } catch {
    // ignore sessionStorage errors
  }
})

document.title = `CodeViper ${__APP_VERSION__}`

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
