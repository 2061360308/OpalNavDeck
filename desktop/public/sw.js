// OpalNavDeck service worker.
// Minimal by design: enables installability without caching app code, so a
// deployed update is always picked up (the fetch handler defers to network).
const VERSION = 'opalnavdeck-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// No respondWith() -> the browser performs the normal network fetch.
self.addEventListener('fetch', () => {})

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage(VERSION)
})
