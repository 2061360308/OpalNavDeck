import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

// the desktop manages its own scaling; keep Ctrl+wheel / Ctrl +- 0 from zooming the page
window.addEventListener('wheel', (e) => {
  if (e.ctrlKey) e.preventDefault()
}, { passive: false })

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0'].includes(e.key)) {
    e.preventDefault()
  }
})

const app = mount(App, {
  target: document.getElementById('app')!,
})

// OpalNavDeck PWA: register the service worker in production for installability
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

export default app
