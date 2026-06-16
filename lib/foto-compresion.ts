/**
 * Comprime una imagen en cliente antes de enviarla al servidor.
 *
 * Por qué: las fotos de iPhone pesan 3-5 MB. Subirlas tal cual ocupa
 * storage, tarda en el upload y satura el ancho de banda del usuario.
 * Comprimimos a JPEG quality 0.82 con max 1600px lado mayor —
 * un recibo o producto se ve bien y queda en ~200-400 KB.
 *
 * Solo se usa para fotos de "evidencia" / "producto". Si en el futuro
 * necesitamos guardar fotos de alta resolución (ej. firmas legales)
 * se invocaría con quality=1 y maxSide=null.
 */

const DEFAULT_MAX_SIDE = 1600
const DEFAULT_QUALITY = 0.82
const SKIP_THRESHOLD = 400 * 1024 // < 400 KB → no comprimir, ya es chica

export async function comprimirFoto(
  file: File,
  opts: { maxSide?: number; quality?: number } = {},
): Promise<File> {
  if (typeof window === 'undefined') return file
  if (!file.type.startsWith('image/')) return file
  if (file.size < SKIP_THRESHOLD) return file

  const maxSide = opts.maxSide ?? DEFAULT_MAX_SIDE
  const quality = opts.quality ?? DEFAULT_QUALITY

  // createImageBitmap es ~3x más rápido que <img> en iOS Safari
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // Algunos navegadores fallan con HEIC sin soporte → caemos al original
    return file
  }

  let { width, height } = bitmap
  if (width > maxSide || height > maxSide) {
    const ratio = Math.min(maxSide / width, maxSide / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob: Blob | null = await new Promise(resolve => {
    canvas.toBlob(b => resolve(b), 'image/jpeg', quality)
  })
  if (!blob) return file

  // Si por alguna razón comprimir resultó MÁS grande, mejor regresar el original
  if (blob.size >= file.size) return file

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto'
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
