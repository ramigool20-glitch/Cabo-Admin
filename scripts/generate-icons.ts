/**
 * Genera iconos PWA a partir de un SVG inline.
 * Corre: npx tsx scripts/generate-icons.ts
 */
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const OUT = resolve(process.cwd(), 'public/icons')

// SVG fuente: cuadrado verde con "CA" centrado
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10b981"/>
      <stop offset="1" stop-color="#047857"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
  <text x="256" y="312" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
        font-size="200" font-weight="800" text-anchor="middle" fill="white" letter-spacing="-6">CA</text>
</svg>
`

const SIZES = [
  { size: 192, name: 'icon-192.png' },
  { size: 384, name: 'icon-384.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 32,  name: 'favicon-32.png' },
]

async function main() {
  await mkdir(OUT, { recursive: true })

  for (const { size, name } of SIZES) {
    const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
    await writeFile(resolve(OUT, name), buf)
    console.log(`✓ ${name} (${size}×${size})`)
  }

  // SVG sin tamaño fijo
  await writeFile(resolve(OUT, 'icon.svg'), svg.trim())
  console.log('✓ icon.svg')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
