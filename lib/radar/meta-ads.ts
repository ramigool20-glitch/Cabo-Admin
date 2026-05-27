/**
 * Cliente Meta Ad Library API
 * https://www.facebook.com/ads/library/api
 *
 * Requiere:
 *  - META_AD_LIBRARY_TOKEN: access token de un usuario verificado para anuncios políticos
 *    (la API genérica también funciona con cualquier user access token básico para ads no políticos)
 *  - Para ads políticos/sociales hay que verificar identidad como anunciante
 *  - Para ads comerciales generales basta con un user access token
 *
 * El endpoint principal es:
 *  GET https://graph.facebook.com/v18.0/ads_archive
 *  ?search_terms=KEYWORDS
 *  &ad_reached_countries=['MX']
 *  &ad_active_status=ACTIVE
 *  &fields=ad_creative_bodies,ad_snapshot_url,page_name,...
 *  &access_token=TOKEN
 *
 * IMPORTANTE: Meta cambió políticas. La API solo trae datos completos para ads políticos
 * en algunos países. Para ads comerciales en MX trae datos limitados pero usables (page name,
 * ad copy, snapshot URL, fechas, alcance estimado).
 */

export type MetaAd = {
  ad_archive_id: string
  page_name: string | null
  page_id: string | null
  ad_creative_body: string | null
  ad_creative_link_caption: string | null
  ad_creative_link_title: string | null
  ad_creative_link_description: string | null
  ad_snapshot_url: string | null
  imagen_url: string | null
  inicio: string | null  // YYYY-MM-DD
  fin: string | null     // YYYY-MM-DD
  paises: string[]
  impresiones_min: number | null
  impresiones_max: number | null
  gasto_min: number | null
  gasto_max: number | null
  raw: Record<string, unknown>
}

type MetaApiResponse = {
  data?: Array<Record<string, unknown>>
  paging?: { cursors?: { after?: string }; next?: string }
  error?: { message: string; type: string; code: number }
}

const API_VERSION = 'v18.0'
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`

const FIELDS = [
  'id',
  'ad_creative_bodies',
  'ad_creative_link_captions',
  'ad_creative_link_titles',
  'ad_creative_link_descriptions',
  'ad_snapshot_url',
  'ad_delivery_start_time',
  'ad_delivery_stop_time',
  'page_id',
  'page_name',
  'impressions',
  'spend',
  'currency',
  'languages',
  'publisher_platforms',
  'target_locations',
].join(',')

export type MetaAdSearchOpts = {
  searchTerms?: string          // ej: "tequila cabo"
  pageIds?: string[]            // si conocemos páginas, las traemos puntuales
  paises?: string[]             // default MX
  ad_active_status?: 'ACTIVE' | 'INACTIVE' | 'ALL'
  limit?: number                // default 25
  /**
   * Si es político/social en US, Meta da más datos. Default 'ALL' para abarcar
   * comerciales también (datos limitados pero suficiente).
   */
  ad_type?: 'POLITICAL_AND_ISSUE_ADS' | 'ALL'
}

function token(): string | null {
  return process.env.META_AD_LIBRARY_TOKEN || null
}

function parseAd(raw: Record<string, unknown>): MetaAd {
  const get = (k: string): unknown => raw[k]
  const arrStr = (k: string): string | null => {
    const v = get(k)
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0]
    return null
  }
  const dateFmt = (k: string): string | null => {
    const v = get(k)
    if (!v || typeof v !== 'string') return null
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }

  // impressions y spend en Meta vienen como { lower_bound, upper_bound } strings
  let impMin: number | null = null
  let impMax: number | null = null
  const imp = get('impressions') as Record<string, string> | undefined
  if (imp) {
    if (imp.lower_bound) impMin = Number(imp.lower_bound) || null
    if (imp.upper_bound) impMax = Number(imp.upper_bound) || null
  }
  let spendMin: number | null = null
  let spendMax: number | null = null
  const sp = get('spend') as Record<string, string> | undefined
  if (sp) {
    if (sp.lower_bound) spendMin = Number(sp.lower_bound) || null
    if (sp.upper_bound) spendMax = Number(sp.upper_bound) || null
  }

  let paises: string[] = []
  const targets = get('target_locations')
  if (Array.isArray(targets)) {
    paises = targets
      .map((t) => (t as { country?: string })?.country)
      .filter((x): x is string => typeof x === 'string')
  }

  return {
    ad_archive_id: String(get('id') ?? ''),
    page_name: typeof get('page_name') === 'string' ? (get('page_name') as string) : null,
    page_id: typeof get('page_id') === 'string' ? (get('page_id') as string) : null,
    ad_creative_body: arrStr('ad_creative_bodies'),
    ad_creative_link_caption: arrStr('ad_creative_link_captions'),
    ad_creative_link_title: arrStr('ad_creative_link_titles'),
    ad_creative_link_description: arrStr('ad_creative_link_descriptions'),
    ad_snapshot_url: typeof get('ad_snapshot_url') === 'string' ? (get('ad_snapshot_url') as string) : null,
    imagen_url: null, // Meta no expone imagen directa; snapshot_url es preview
    inicio: dateFmt('ad_delivery_start_time'),
    fin: dateFmt('ad_delivery_stop_time'),
    paises,
    impresiones_min: impMin,
    impresiones_max: impMax,
    gasto_min: spendMin,
    gasto_max: spendMax,
    raw,
  }
}

/**
 * Busca ads activos por keyword o page IDs.
 * Retorna array vacío si no hay token configurado o si la API falla (no crashea).
 */
export async function buscarAds(opts: MetaAdSearchOpts): Promise<{ ads: MetaAd[]; error?: string }> {
  const t = token()
  if (!t) return { ads: [], error: 'META_AD_LIBRARY_TOKEN no configurado' }

  const params = new URLSearchParams({
    access_token: t,
    fields: FIELDS,
    ad_reached_countries: JSON.stringify(opts.paises ?? ['MX']),
    ad_active_status: opts.ad_active_status ?? 'ACTIVE',
    ad_type: opts.ad_type ?? 'ALL',
    limit: String(Math.min(opts.limit ?? 25, 100)),
  })
  if (opts.searchTerms) params.set('search_terms', opts.searchTerms)
  if (opts.pageIds && opts.pageIds.length > 0) {
    params.set('search_page_ids', JSON.stringify(opts.pageIds))
  }
  if (!opts.searchTerms && (!opts.pageIds || opts.pageIds.length === 0)) {
    return { ads: [], error: 'Falta searchTerms o pageIds' }
  }

  const url = `${BASE_URL}/ads_archive?${params}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    const json = (await res.json()) as MetaApiResponse
    if (json.error) {
      return { ads: [], error: `Meta API: ${json.error.message}` }
    }
    const ads = (json.data ?? []).map(parseAd)
    return { ads }
  } catch (e) {
    return { ads: [], error: e instanceof Error ? e.message : 'Error red Meta' }
  }
}

/**
 * Helper para parsear keywords separados por coma.
 */
export function parseKeywords(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[,;\n]/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
}
