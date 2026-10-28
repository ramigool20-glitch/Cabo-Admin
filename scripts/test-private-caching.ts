import assert from 'node:assert/strict'
import { isPublicAsset } from '../lib/pwa/public-assets'
const origin = 'https://cabo-admin.vercel.app'
for (const path of ['/dashboard', '/dashboard?_rsc=secret', '/api/pos/ticket/id/imagen', '/_next/image?url=signed', '/icons/asset.png?token=secret']) {
  assert.equal(isPublicAsset(new URL(path, origin), origin), false, path)
}
assert.equal(isPublicAsset(new URL('https://example.com/icons/a.png'), origin), false)
assert.equal(isPublicAsset(new URL('https://project.supabase.co/storage/v1/object/sign/recibos/a.jpg?token=secret'), origin), false)
assert.equal(isPublicAsset(new URL('/_next/static/chunks/app.js', origin), origin), true)
assert.equal(isPublicAsset(new URL('/icons/icon-192.png', origin), origin), true)
console.log('Caché: páginas privadas, RSC, API y enlaces firmados excluidos; assets públicos permitidos.')
