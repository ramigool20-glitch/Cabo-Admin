/// <reference lib="webworker" />
import { isPublicAsset } from '@/lib/pwa/public-assets'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, NetworkOnly, ExpirationPlugin, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: (self.__SW_MANIFEST ?? []).filter(entry =>
    isPublicAsset(new URL(typeof entry === 'string' ? entry : entry.url, self.location.origin), self.location.origin)
  ),
  precacheOptions: { cacheName: 'cabo-public-precache-v2', cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => isPublicAsset(url, self.location.origin),
      handler: new CacheFirst({ cacheName: 'cabo-public-assets-v2', plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 86400 })] }),
    },
    { matcher: () => true, handler: new NetworkOnly() },
  ],
})

serwist.addEventListeners()

// Retirar las cachés de páginas, respuestas RSC y API de la versión anterior.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => !['cabo-public-precache-v2', 'cabo-public-assets-v2'].includes(name))
      .map(name => caches.delete(name))
  )))
})

// ====================================================================
// Push notifications
// ====================================================================

type PushPayload = {
  title: string
  body: string
  icon?: string
  badge?: string
  url?: string
  tag?: string
  data?: Record<string, unknown>
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {
    title: 'Cabo Admin',
    body: 'Tienes una nueva notificación',
  }

  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    // Si no es JSON, intentamos como texto
    payload.body = event.data?.text() || payload.body
  }

  // Patrón de vibración variable según prioridad indicada en payload.data
  const prioridad = (payload.data?.prioridad as string) || 'normal'
  const vibracion =
    prioridad === 'alta'    ? [200, 100, 200, 100, 200]
    : prioridad === 'media' ? [150, 80, 150]
    :                         [120, 60, 120]

  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: payload.body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag,
    // No silencioso: deja que iOS/Android suenen con el tono default del sistema
    silent: false,
    // Reabrir notificación aunque tenga mismo tag
    renotify: true,
    // Vibración (Android principalmente, iOS PWA respeta intensidad del sistema)
    vibrate: vibracion,
    // Tareas con prioridad alta exigen interacción
    requireInteraction: prioridad === 'alta',
    data: { url: payload.url || '/dashboard', ...payload.data },
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const data = event.notification.data as { url?: string } | undefined
  const targetUrl = data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Si ya hay una ventana abierta, la enfocamos y navegamos
      for (const client of clients) {
        if ('focus' in client && 'navigate' in client) {
          ;(client as WindowClient).focus()
          ;(client as WindowClient).navigate(targetUrl)
          return
        }
      }
      // Si no, abrimos una nueva
      return self.clients.openWindow(targetUrl)
    })
  )
})
