/// <reference lib="webworker" />
// Service worker Maintix : mise en cache hors ligne (Workbox) + notifications push d'astreinte.
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }))
self.skipWaiting()
clientsClaim()

interface PushPayload { title: string; body: string; url?: string; tag?: string; urgent?: boolean }

self.addEventListener('push', (event) => {
  let data: PushPayload = { title: 'Maintix', body: '' }
  try { data = { ...data, ...(event.data?.json() as PushPayload) } } catch { data.body = event.data?.text() ?? '' }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      data: { url: data.url ?? '/' },
      requireInteraction: !!data.urgent,
      vibrate: data.urgent ? [300, 120, 300, 120, 300] : [120],
    } as NotificationOptions),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data as { url?: string })?.url ?? '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus()
          return (c as WindowClient).navigate(target)
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
