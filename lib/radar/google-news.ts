/**
 * Cliente Google News RSS — GRATIS, sin API key.
 *
 * Google News expone feeds RSS por keyword en cualquier idioma/región.
 * Endpoint: https://news.google.com/rss/search?q=KEYWORDS&hl=es-MX&gl=MX
 *
 * Limitaciones:
 *  - No hay descripciones largas, solo título + extracto corto
 *  - No siempre trae imágenes
 *  - Rate limit informal: ~30 req/min razonable
 */

export type NoticiaResultado = {
  titulo: string
  resumen: string | null
  url: string
  fuente: string | null
  fuente_logo_url: string | null
  imagen_url: string | null
  publicada_at: string | null  // ISO
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; CaboAdmin/1.0; +https://cabo-admin.app)',
  'Accept': 'application/rss+xml, application/xml, text/xml',
}

function stripHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return m ? stripHtml(m[1]) : null
}

function extractAllItems(xml: string): string[] {
  const items: string[] = []
  const re = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) items.push(m[1])
  return items
}

/**
 * Parsea un <item> de RSS y extrae datos limpios.
 * Google News pone el medio dentro de <source url="...">NOMBRE</source>.
 */
function parseItem(itemXml: string): NoticiaResultado | null {
  const titulo = extractTag(itemXml, 'title')
  const link = extractTag(itemXml, 'link')
  if (!titulo || !link) return null

  const description = extractTag(itemXml, 'description')
  const pubDate = extractTag(itemXml, 'pubDate')
  const source = itemXml.match(/<source[^>]*>([^<]+)<\/source>/i)?.[1]?.trim() ?? null
  const sourceUrl = itemXml.match(/<source[^>]*url="([^"]+)"/i)?.[1] ?? null

  // El "description" suele contener HTML con link. Limpiamos para tener un resumen útil.
  const resumen = description
    ? description.replace(/^[\s\S]*?<\/a>/, '').slice(0, 280).trim() || null
    : null

  // Intentar extraer imagen de description (Google News a veces incluye <img>)
  const imgMatch = description?.match(/<img[^>]+src="([^"]+)"/i)
  const imagen_url = imgMatch?.[1] ?? null

  // Logo del medio (favicon-style) lo armamos con el dominio
  let fuente_logo_url: string | null = null
  if (sourceUrl) {
    try {
      const host = new URL(sourceUrl).hostname
      fuente_logo_url = `https://www.google.com/s2/favicons?domain=${host}&sz=64`
    } catch {
      // ignore
    }
  }

  let publicada_at: string | null = null
  if (pubDate) {
    const d = new Date(pubDate)
    if (!Number.isNaN(d.getTime())) publicada_at = d.toISOString()
  }

  return {
    titulo,
    resumen,
    url: link,
    fuente: source,
    fuente_logo_url,
    imagen_url,
    publicada_at,
  }
}

/**
 * Busca noticias en Google News.
 *
 * @param query   - keywords (ej: "Los Cabos farmacia")
 * @param opts.hl - idioma (default es-MX)
 * @param opts.gl - país (default MX)
 * @param opts.maxResults - tope (default 10, max 30)
 */
export async function buscarNoticiasGoogle(
  query: string,
  opts: { hl?: string; gl?: string; maxResults?: number } = {}
): Promise<NoticiaResultado[]> {
  const hl = opts.hl ?? 'es-MX'
  const gl = opts.gl ?? 'MX'
  const maxResults = Math.min(opts.maxResults ?? 10, 30)

  const params = new URLSearchParams({
    q: query,
    hl,
    gl,
    ceid: `${gl}:${hl.split('-')[0]}`,
  })
  const url = `https://news.google.com/rss/search?${params}`

  let xml = ''
  try {
    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Google News RSS HTTP ${res.status}`)
    }
    xml = await res.text()
  } catch (e) {
    throw new Error(`Fetch Google News falló: ${e instanceof Error ? e.message : String(e)}`)
  }

  const items = extractAllItems(xml).slice(0, maxResults)
  const parsed: NoticiaResultado[] = []
  for (const it of items) {
    const p = parseItem(it)
    if (p) parsed.push(p)
  }
  return parsed
}

/**
 * Filtra noticias frescas (últimos N días) y deduplica por título normalizado.
 */
export function filtrarFrescas(
  noticias: NoticiaResultado[],
  diasMaximo = 7
): NoticiaResultado[] {
  const cutoff = Date.now() - diasMaximo * 24 * 60 * 60 * 1000
  const seen = new Set<string>()
  const out: NoticiaResultado[] = []
  for (const n of noticias) {
    if (n.publicada_at) {
      const t = new Date(n.publicada_at).getTime()
      if (Number.isFinite(t) && t < cutoff) continue
    }
    const key = (n.titulo || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(n)
  }
  return out
}
