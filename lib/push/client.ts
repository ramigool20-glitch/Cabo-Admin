/**
 * Helpers para registrar el dispositivo en push notifications.
 * Diseñado para iOS PWA (Safari 16.4+) y Android.
 */

function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buf = new ArrayBuffer(rawData.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i)
  return buf
}

export type EstadoPush =
  | 'no_soportado'
  | 'denegado'
  | 'no_registrado'
  | 'pidiendo_permiso'
  | 'suscribiendo'
  | 'activo'

export function pushSoportado(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!pushSoportado()) return 'no_soportado'
  if (Notification.permission === 'denied') return 'denegado'

  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'no_registrado'

  const sub = await reg.pushManager.getSubscription()
  if (sub) return 'activo'

  return Notification.permission === 'granted' ? 'no_registrado' : 'no_registrado'
}

export async function activarPush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSoportado()) return { ok: false, error: 'Tu navegador no soporta push.' }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) return { ok: false, error: 'Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY' }

  // 1) Permiso
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, error: 'Permiso de notificaciones denegado.' }

  // 2) Service Worker
  const reg = await navigator.serviceWorker.ready
  if (!reg) return { ok: false, error: 'No hay service worker registrado.' }

  // 3) Subscribe
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(publicKey),
    })
  }

  // 4) Enviar al backend
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: sub.toJSON().keys,
      userAgent: navigator.userAgent,
    }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data.error || 'No se pudo registrar en el servidor.' }
  }

  return { ok: true }
}

export async function desactivarPush(): Promise<{ ok: boolean }> {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return { ok: true }
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await sub.unsubscribe()
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
  }
  return { ok: true }
}
