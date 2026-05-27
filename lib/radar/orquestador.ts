/**
 * Orquestador del Radar:
 *  - Trae noticias frescas (Google News RSS) por keywords de cada negocio
 *  - Espía competidores en Meta Ad Library
 *  - Detecta ads nuevos (diff con snapshot anterior)
 *  - Sugiere nuevos competidores (top anunciantes que matchean keywords)
 *  - Marca ads que ya no están activos
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { buscarNoticiasGoogle, filtrarFrescas, type NoticiaResultado } from './google-news'
import { buscarAds, parseKeywords, type MetaAd } from './meta-ads'
import { analizarAmenaza } from './amenaza-score'

type Negocio = {
  id: string
  nombre: string
  tipo: string
  activo: boolean
  keywords_busqueda: string | null
  notas: string | null
}

type Competidor = {
  id: string
  competidor_nombre: string
  competidor_url: string | null
  descripcion: string | null
  tipo: string
  negocio_id: string | null
  dominio_propio: string
  keywords_match: string | null
  pagina_fb: string | null
  pagina_ig: string | null
  score_amenaza: number | null
  score_analisis_at: string | null
  ultima_revision_at: string | null
}

export type RadarMonitorResultado = {
  noticias_guardadas: number
  ads_nuevos: number
  ads_inactivados: number
  sugerencias_nuevas: number
  scores_recalculados: number
  errores: string[]
}

/**
 * Trae las queries de noticias para cada negocio.
 * Si el negocio tiene keywords_busqueda, las usa; si no, infiere de nombre/tipo.
 */
function queriesParaNegocio(n: Negocio): string[] {
  const kws = parseKeywords(n.keywords_busqueda)
  if (kws.length > 0) return kws

  // Inferencia por tipo
  const queries: string[] = []
  switch (n.tipo) {
    case 'farmacia':
      queries.push(`farmacias Los Cabos`, `medicamentos Baja California Sur`)
      break
    case 'consultorio':
      queries.push(`consultorio médico Los Cabos`, `turistas salud Baja California Sur`)
      break
    case 'salon_eventos':
      queries.push(`bodas Los Cabos`, `eventos Cabo San Lucas`)
      break
    case 'pagina_digital':
      queries.push(n.nombre)
      break
    default:
      queries.push(`${n.nombre} Cabo`)
  }
  return queries
}

/**
 * 1) Refresca noticias usando Google News RSS.
 */
export async function refrescarNoticias(): Promise<{ guardadas: number; errores: string[] }> {
  const admin = createAdminClient()
  const errores: string[] = []
  let guardadas = 0

  const { data: negocios, error } = await admin
    .from('negocios')
    .select('id, nombre, tipo, activo, keywords_busqueda, notas')
    .eq('activo', true)
  if (error) {
    errores.push(`Negocios: ${error.message}`)
    return { guardadas, errores }
  }

  // Recopila queries únicas para no llamar dos veces lo mismo
  const queriesMap = new Map<string, string[]>()  // query -> [tags aplicables]
  for (const n of (negocios ?? []) as Negocio[]) {
    for (const q of queriesParaNegocio(n)) {
      const ya = queriesMap.get(q) ?? []
      ya.push(n.tipo)
      queriesMap.set(q, ya)
    }
  }
  // Siempre incluir Los Cabos en general
  queriesMap.set('Los Cabos turismo', ['general', 'turismo'])
  queriesMap.set('Baja California Sur', ['general'])

  for (const [q, tags] of queriesMap.entries()) {
    try {
      const raw = await buscarNoticiasGoogle(q, { maxResults: 8 })
      const fresh = filtrarFrescas(raw, 7)
      if (fresh.length === 0) continue

      const filas = fresh.map((n: NoticiaResultado) => ({
        titulo: n.titulo,
        resumen: n.resumen,
        url: n.url,
        fuente: n.fuente,
        fuente_logo_url: n.fuente_logo_url,
        imagen_url: n.imagen_url,
        publicada_at: n.publicada_at,
        query_origen: q,
        aplica_a: tags,
        fetched_at: new Date().toISOString(),
      }))

      // upsert por URL (unique constraint)
      const { error: insertErr, count } = await admin
        .from('radar_noticias')
        .upsert(filas, { onConflict: 'url', ignoreDuplicates: true, count: 'exact' })
      if (insertErr) errores.push(`Noticias query "${q}": ${insertErr.message}`)
      else guardadas += count ?? 0
    } catch (e) {
      errores.push(`Query "${q}": ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { guardadas, errores }
}

/**
 * 2) Espionaje de ads — busca por competidor y guarda snapshots.
 * Marca como inactivos los que no aparecen ya.
 */
export async function espiarAdsCompetidores(): Promise<{
  nuevos: number
  inactivados: number
  errores: string[]
}> {
  const admin = createAdminClient()
  const errores: string[] = []
  let nuevos = 0
  let inactivados = 0

  const { data: competidores, error } = await admin
    .from('radar_competidores')
    .select('id, competidor_nombre, competidor_url, descripcion, tipo, negocio_id, dominio_propio, keywords_match, pagina_fb, pagina_ig, score_amenaza, score_analisis_at, ultima_revision_at')
    .eq('activo', true)
  if (error) {
    errores.push(`Competidores: ${error.message}`)
    return { nuevos, inactivados, errores }
  }

  for (const c of (competidores ?? []) as Competidor[]) {
    try {
      // Si tenemos pagina_fb o pagina_ig, buscamos por page IDs
      // Si no, search_terms con el nombre
      const searchTerms = c.competidor_nombre
      const { ads, error: adsErr } = await buscarAds({
        searchTerms,
        paises: ['MX'],
        ad_active_status: 'ACTIVE',
        limit: 25,
      })

      if (adsErr && ads.length === 0) {
        errores.push(`${c.competidor_nombre}: ${adsErr}`)
        continue
      }

      const activosVistos = new Set(ads.map((a) => a.ad_archive_id))

      // Marcar ads previos como inactivos si ya no aparecen
      const { data: previos } = await admin
        .from('radar_ads_snapshots')
        .select('id, ad_id, activo')
        .eq('competidor_id', c.id)
        .eq('activo', true)
      for (const p of previos ?? []) {
        if (!activosVistos.has(p.ad_id)) {
          await admin
            .from('radar_ads_snapshots')
            .update({ activo: false, ultima_vez_visto_at: new Date().toISOString() })
            .eq('id', p.id)
          inactivados++
        }
      }

      // Insertar/actualizar ads vistos
      for (const a of ads) {
        const fila = {
          competidor_id: c.id,
          ad_id: a.ad_archive_id,
          plataforma: 'meta',
          page_name: a.page_name,
          page_id: a.page_id,
          ad_creative_body: a.ad_creative_body,
          ad_creative_link_caption: a.ad_creative_link_caption,
          ad_creative_link_title: a.ad_creative_link_title,
          ad_creative_link_description: a.ad_creative_link_description,
          ad_snapshot_url: a.ad_snapshot_url,
          imagen_url: a.imagen_url,
          inicio: a.inicio,
          fin: a.fin,
          paises: a.paises,
          impresiones_min: a.impresiones_min,
          impresiones_max: a.impresiones_max,
          gasto_min: a.gasto_min,
          gasto_max: a.gasto_max,
          ultima_vez_visto_at: new Date().toISOString(),
          activo: true,
        }
        const { error: upErr, data: upserted } = await admin
          .from('radar_ads_snapshots')
          .upsert(fila, { onConflict: 'competidor_id,ad_id' })
          .select('id, primera_vez_visto_at, created_at')

        if (upErr) {
          errores.push(`Upsert ad ${a.ad_archive_id}: ${upErr.message}`)
        }
        // Detectar si es la primera vez que lo vemos: insightaríamos algo, pero por simplicidad
        // contamos como nuevo si el row es reciente (último minuto)
        if (upserted && upserted[0]) {
          const first = new Date(upserted[0].primera_vez_visto_at as string).getTime()
          if (Date.now() - first < 60_000) nuevos++
        }
      }

      // Actualizar timestamp del competidor
      await admin
        .from('radar_competidores')
        .update({ ultima_revision_at: new Date().toISOString() })
        .eq('id', c.id)
    } catch (e) {
      errores.push(`${c.competidor_nombre}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { nuevos, inactivados, errores }
}

/**
 * 3) Descubre potenciales competidores nuevos para cada negocio.
 * Para cada negocio con keywords, busca ads de Meta y agrupa por page_name.
 * Los top anunciantes que no son competidores ya registrados se guardan en sugeridos.
 */
export async function descubrirSugerencias(): Promise<{ nuevas: number; errores: string[] }> {
  const admin = createAdminClient()
  const errores: string[] = []
  let nuevas = 0

  const { data: negocios, error: nErr } = await admin
    .from('negocios')
    .select('id, nombre, tipo, activo, keywords_busqueda, notas')
    .eq('activo', true)
  if (nErr) {
    errores.push(`Negocios: ${nErr.message}`)
    return { nuevas, errores }
  }

  const { data: yaRegistrados } = await admin
    .from('radar_competidores')
    .select('competidor_nombre, negocio_id')

  for (const n of (negocios ?? []) as Negocio[]) {
    const kws = parseKeywords(n.keywords_busqueda)
    if (kws.length === 0) continue

    for (const kw of kws.slice(0, 3)) {  // top 3 keywords por negocio
      try {
        const { ads, error: adsErr } = await buscarAds({
          searchTerms: kw,
          paises: ['MX'],
          ad_active_status: 'ACTIVE',
          limit: 50,
        })
        if (adsErr) {
          errores.push(`kw "${kw}": ${adsErr}`)
          continue
        }

        // Agrupa por page_name
        const porPagina = new Map<string, { count: number; ads: MetaAd[]; page_id: string | null }>()
        for (const a of ads) {
          if (!a.page_name) continue
          const k = a.page_name
          if (!porPagina.has(k)) porPagina.set(k, { count: 0, ads: [], page_id: a.page_id })
          const slot = porPagina.get(k)!
          slot.count++
          slot.ads.push(a)
        }

        // Filtra: solo páginas con 2+ ads (señal de inversión activa)
        const top = Array.from(porPagina.entries())
          .filter(([, v]) => v.count >= 2)
          .sort(([, a], [, b]) => b.count - a.count)
          .slice(0, 5)

        const yaRegSet = new Set(
          (yaRegistrados ?? [])
            .filter((y) => y.negocio_id === n.id)
            .map((y) => y.competidor_nombre.toLowerCase())
        )

        for (const [pageName, info] of top) {
          if (yaRegSet.has(pageName.toLowerCase())) continue

          const motivo = `Aparece con ${info.count} ads activos en Meta para keyword "${kw}". Inversión continua en Facebook/Instagram.`

          const { error: upErr } = await admin
            .from('radar_competidores_sugeridos')
            .upsert({
              negocio_id: n.id,
              competidor_nombre: pageName,
              pagina_fb: info.page_id,
              ads_activos_count: info.count,
              keywords_match: kw,
              motivo,
              primera_vez_visto_at: new Date().toISOString(),
              estado: 'pendiente',
            }, { onConflict: 'negocio_id,competidor_nombre', ignoreDuplicates: true })

          if (upErr) {
            errores.push(`Sugerencia ${pageName}: ${upErr.message}`)
          } else {
            nuevas++
          }
        }
      } catch (e) {
        errores.push(`kw "${kw}": ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  return { nuevas, errores }
}

/**
 * 4) Recalcula scores de amenaza para competidores sin score o con score viejo (>7 días).
 */
export async function recalcularScoresAmenaza(): Promise<{ recalculados: number; errores: string[] }> {
  const admin = createAdminClient()
  const errores: string[] = []
  let recalculados = 0

  const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: competidores, error } = await admin
    .from('radar_competidores')
    .select('id, competidor_nombre, competidor_url, descripcion, tipo, negocio_id, score_amenaza, score_analisis_at')
    .eq('activo', true)
    .or(`score_amenaza.is.null,score_analisis_at.lt.${hace7dias}`)
  if (error) {
    errores.push(`Competidores: ${error.message}`)
    return { recalculados, errores }
  }

  for (const c of competidores ?? []) {
    try {
      let neg: { nombre: string; tipo: string; descripcion: string | null; keywords: string | null } | null = null
      if (c.negocio_id) {
        const { data: n } = await admin
          .from('negocios')
          .select('nombre, tipo, notas, keywords_busqueda')
          .eq('id', c.negocio_id)
          .single()
        if (n) {
          neg = {
            nombre: n.nombre,
            tipo: n.tipo,
            descripcion: n.notas,
            keywords: n.keywords_busqueda,
          }
        }
      }
      if (!neg) {
        // No vinculado a negocio → score heurístico simple
        await admin
          .from('radar_competidores')
          .update({
            score_amenaza: c.tipo === 'directo' ? 6 : c.tipo === 'indirecto' ? 4 : 3,
            score_razon: 'Sin negocio vinculado (heurístico por tipo)',
            score_analisis_at: new Date().toISOString(),
          })
          .eq('id', c.id)
        recalculados++
        continue
      }

      // Contar ads activos del competidor
      const { count: adsCount } = await admin
        .from('radar_ads_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('competidor_id', c.id)
        .eq('activo', true)

      const score = await analizarAmenaza({
        miNegocio: neg,
        competidor: {
          nombre: c.competidor_nombre,
          url: c.competidor_url,
          descripcion: c.descripcion,
          tipo: c.tipo,
        },
        adsActivos: adsCount ?? 0,
      })

      await admin
        .from('radar_competidores')
        .update({
          score_amenaza: score.score,
          score_razon: score.razon,
          score_analisis_at: new Date().toISOString(),
        })
        .eq('id', c.id)
      recalculados++
    } catch (e) {
      errores.push(`${c.competidor_nombre}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { recalculados, errores }
}

/**
 * Ejecutor completo del Radar — corre todo de seguido.
 * Pensado para ser llamado por el cron diario o manualmente.
 */
export async function ejecutarRadarCompleto(): Promise<RadarMonitorResultado> {
  const errores: string[] = []
  let noticias_guardadas = 0
  let ads_nuevos = 0
  let ads_inactivados = 0
  let sugerencias_nuevas = 0
  let scores_recalculados = 0

  try {
    const r1 = await refrescarNoticias()
    noticias_guardadas = r1.guardadas
    errores.push(...r1.errores)
  } catch (e) {
    errores.push(`Noticias: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const r2 = await espiarAdsCompetidores()
    ads_nuevos = r2.nuevos
    ads_inactivados = r2.inactivados
    errores.push(...r2.errores)
  } catch (e) {
    errores.push(`Ads: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const r3 = await descubrirSugerencias()
    sugerencias_nuevas = r3.nuevas
    errores.push(...r3.errores)
  } catch (e) {
    errores.push(`Sugerencias: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const r4 = await recalcularScoresAmenaza()
    scores_recalculados = r4.recalculados
    errores.push(...r4.errores)
  } catch (e) {
    errores.push(`Scores: ${e instanceof Error ? e.message : String(e)}`)
  }

  return {
    noticias_guardadas,
    ads_nuevos,
    ads_inactivados,
    sugerencias_nuevas,
    scores_recalculados,
    errores,
  }
}
