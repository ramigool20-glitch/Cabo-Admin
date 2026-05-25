/**
 * Genera VAPID keys nuevas. Ejecutar UNA SOLA VEZ.
 * Corre: npx tsx scripts/gen-vapid.ts
 */
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()

console.log('\nCopia estas líneas a .env.local y a Vercel:\n')
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_SUBJECT=mailto:backpackboyzmexico@gmail.com\n`)
