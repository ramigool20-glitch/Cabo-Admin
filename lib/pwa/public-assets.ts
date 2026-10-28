// Solo recursos estáticos públicos; nunca páginas, API, RSC o URLs firmadas.
export function isPublicAsset(url: URL, origin: string): boolean {
  if (url.origin !== origin || url.search) return false
  return url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') || url.pathname.startsWith('/media/') ||
    ['/favicon.ico', '/manifest.json'].includes(url.pathname)
}
