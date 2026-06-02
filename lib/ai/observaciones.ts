/**
 * Genera y persiste las OBSERVACIONES del Auditor IA.
 * Fuente 100% datos reales de la BD: detectarIrregularidades() + ejecutarRadar().
 * NADA inventado. La IA solo se usa para redactar el push resumen, no para
 * crear observaciones.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { detectarIrregularidades, type Irregularidad } from './irregularidades'
import { ejecutarRadar, type RadarInsight } from './radar'
import { enviarPushAProfiles } from '@/lib/push/server'
import { hoyEnCabos } from '@/lib/fechas'

export type Severidad = 'grave' | 'atencion' | 'bien'

export type ObservacionInput = {
  severidad: Severidad
  titulo: string
  detalle: string | null
  recomendacion: string | null
  categoria: string | null
  clave: string
  datos: Record<string, unknown> | null
  fuente: 'cron' | 'chat' | 'movimiento'
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[0-9$%,.]/g, '')          // quita números/moneda → clave estable aunque cambien las cifras
    .replace(/[^a-z]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

const RECO_IRREG: Record<Irregularidad['tipo'], string> = {
  duplicado: 'Compara las dos transacciones y borra la repetida.',
  monto_anomalo: 'Confirma que el monto es correcto; si no, corrígelo.',
  sin_categoria: 'Categoriza estos gastos para que los reportes cuadren.',
  sobregiro: 'Registra el ingreso faltante o revisa el saldo inicial.',
  fijo_vencido: 'Márcalo pagado o reprograma la fecha.',
  evento_sin_anticipo: 'Confirma el anticipo o el evento está en riesgo.',
  fx_viejo: 'Actualiza el tipo de cambio del día.',
  usd_sin_fx: 'Aplica el tipo de cambio a la transacción USD.',
  split_incompleto: 'Verifica las filas del grupo: deben ser 2. Repone o elimina la suelta.',
  cpp_vencida: 'Págala, abona parcial, o reprograma su fecha de vencimiento.',
  cpc_vencida: 'Cóbrale al cliente o reprograma; si ya no se va a cobrar, márcala perdida.',
}

const sevIrreg = (s: Irregularidad['severidad']): Severidad => (s === 'alta' ? 'grave' : 'atencion')
const sevRadar = (ins: RadarInsight): Severidad =>
  ins.tipo === 'oportunidad' ? 'bien' : ins.impacto === 'alta' ? 'grave' : 'atencion'

/**
 * Construye la lista de observaciones desde los detectores deterministas.
 */
export async function construirObservaciones(): Promise<ObservacionInput[]> {
  const [irregs, radar] = await Promise.all([detectarIrregularidades(), ejecutarRadar()])
  const obs: ObservacionInput[] = []
  const vistas = new Set<string>()

  for (const ir of irregs) {
    const clave = `irreg:${ir.tipo}:${(ir.ids ?? []).slice().sort().join('-') || 'global'}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    obs.push({
      severidad: sevIrreg(ir.severidad),
      titulo: ir.titulo,
      detalle: ir.detalle,
      recomendacion: RECO_IRREG[ir.tipo] ?? null,
      categoria: ir.tipo,
      clave,
      datos: { tipo: ir.tipo, ids: ir.ids ?? [], link: ir.link },
      fuente: 'cron',
    })
  }

  for (const ins of radar.insights) {
    const clave = `radar:${ins.tipo}:${slug(ins.titulo)}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    obs.push({
      severidad: sevRadar(ins),
      titulo: ins.titulo,
      detalle: ins.resumen,
      recomendacion: ins.recomendacion,
      categoria: ins.tipo,
      clave,
      datos: { tipo: ins.tipo, aplica_a: ins.aplica_a, link: ins.fuente_url },
      fuente: 'cron',
    })
  }

  return obs
}

/**
 * Upsert por clave: refresca el contenido si ya existe (sin tocar el estado
 * que el usuario haya puesto: vista/archivada/resuelta) y crea las nuevas.
 * Devuelve solo las claves que NO existían (para el push).
 */
export async function persistirObservaciones(
  obs: ObservacionInput[]
): Promise<{ ok: boolean; nuevas: ObservacionInput[]; error?: string }> {
  if (obs.length === 0) return { ok: true, nuevas: [] }
  const admin = createAdminClient()

  const claves = obs.map((o) => o.clave)
  const { data: existentes, error: selErr } = await admin
    .from('auditor_observaciones')
    .select('clave')
    .in('clave', claves)
  if (selErr) {
    if (/relation .*auditor_observaciones.* does not exist/i.test(selErr.message)) {
      return { ok: false, nuevas: [], error: 'Falta crear la tabla auditor_observaciones (SQL 0030).' }
    }
    return { ok: false, nuevas: [], error: selErr.message }
  }
  const yaExisten = new Set((existentes ?? []).map((e) => e.clave))
  const nuevas = obs.filter((o) => !yaExisten.has(o.clave))

  const rows = obs.map((o) => ({
    severidad: o.severidad,
    titulo: o.titulo,
    detalle: o.detalle,
    recomendacion: o.recomendacion,
    categoria: o.categoria,
    clave: o.clave,
    datos: o.datos,
    fuente: o.fuente,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await admin
    .from('auditor_observaciones')
    .upsert(rows, { onConflict: 'clave' })
  if (error) return { ok: false, nuevas: [], error: error.message }

  return { ok: true, nuevas }
}

/**
 * Vigilancia EN CADA MOVIMIENTO: chequeo ligero al crear una transacción.
 * Detecta duplicado inmediato y monto anómalo; si aplica crea observación
 * (fuente='movimiento') y manda push. Nunca rompe la captura.
 */
export async function vigilarMovimiento(tx: {
  id: string
  tipo: string
  monto: number
  moneda: string
  fecha: string
  concepto: string | null
  categoria: string | null
  cuenta_id: string | null
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const hallazgos: ObservacionInput[] = []

    // Duplicado: misma cuenta + tipo + moneda + monto en ±1 día
    if (tx.cuenta_id) {
      const f = new Date(tx.fecha + 'T00:00:00').getTime()
      const desde = new Date(f - 86400000).toISOString().slice(0, 10)
      const hasta = new Date(f + 86400000).toISOString().slice(0, 10)
      const { data: similares } = await admin
        .from('transacciones')
        .select('id')
        .eq('cuenta_id', tx.cuenta_id)
        .eq('tipo', tx.tipo)
        .eq('moneda', tx.moneda)
        .eq('monto', tx.monto)
        .neq('id', tx.id)
        .gte('fecha', desde)
        .lte('fecha', hasta)
      if (similares && similares.length > 0) {
        hallazgos.push({
          severidad: 'grave',
          titulo: `Posible duplicado: ${tx.concepto || 'movimiento'}`,
          detalle: `Acabas de capturar ${tx.monto} ${tx.moneda} y ya había otro igual en la misma cuenta en estas fechas. ¿Lo metiste dos veces?`,
          recomendacion: 'Compara y borra el repetido.',
          categoria: 'duplicado',
          clave: `mov:dup:${tx.id}`,
          datos: { link: `/transacciones/${tx.id}` },
          fuente: 'movimiento',
        })
      }
    }

    // Monto anómalo: gasto > 3x el promedio de su categoría (30 días)
    if (tx.tipo === 'gasto' && tx.categoria && tx.monto > 1000) {
      const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const { data: hist } = await admin
        .from('transacciones')
        .select('monto')
        .eq('tipo', 'gasto')
        .eq('categoria', tx.categoria)
        .neq('id', tx.id)
        .gte('fecha', hace30)
      const montos = (hist ?? []).map((h) => Number(h.monto))
      if (montos.length >= 4) {
        const prom = montos.reduce((s, m) => s + m, 0) / montos.length
        if (prom > 0 && tx.monto > prom * 3) {
          hallazgos.push({
            severidad: 'atencion',
            titulo: `Gasto inusual en "${tx.categoria}"`,
            detalle: `${tx.monto} ${tx.moneda} es ${(tx.monto / prom).toFixed(1)}x el promedio de "${tx.categoria}" (${prom.toFixed(0)}).`,
            recomendacion: 'Verifica que el monto sea correcto.',
            categoria: 'monto_anomalo',
            clave: `mov:anom:${tx.id}`,
            datos: { link: `/transacciones/${tx.id}` },
            fuente: 'movimiento',
          })
        }
      }
    }

    if (hallazgos.length === 0) return
    await persistirObservaciones(hallazgos)

    const { data: socios } = await admin
      .from('profiles')
      .select('id, role_id, roles(nombre)')
      .eq('activo', true)
    const dest = (socios ?? [])
      .filter((p) => {
        const r = p.roles as unknown as { nombre: string } | null
        return r?.nombre === 'admin' || r?.nombre === 'socio'
      })
      .map((p) => p.id)
    if (dest.length > 0) {
      await enviarPushAProfiles(dest, {
        title: '🧠 Alerta del Auditor',
        body: hallazgos[0].titulo,
        url: '/auditor',
        tag: `mov-${tx.id}`,
      })
    }
  } catch {
    // nunca romper la captura
  }
}

/**
 * Genera preguntas de datos faltantes (auditor_pendientes), sin duplicar las
 * que ya están abiertas. Por ahora: negocios activos sin movimientos este mes.
 */
export async function generarPreguntasDatosFaltantes(): Promise<number> {
  const admin = createAdminClient()
  const hoy = hoyEnCabos()
  const inicioMes = hoy.slice(0, 7) + '-01'

  const [{ data: negocios }, { data: txMes }, { data: abiertas }] = await Promise.all([
    admin.from('negocios').select('id, nombre, tipo').eq('activo', true),
    admin.from('transacciones').select('negocio_id').gte('fecha', inicioMes).lte('fecha', hoy),
    admin.from('auditor_pendientes').select('pregunta').eq('estado', 'abierta'),
  ])

  const conMovimiento = new Set((txMes ?? []).map((t) => t.negocio_id).filter(Boolean))
  const preguntasAbiertas = new Set((abiertas ?? []).map((p) => p.pregunta))

  const nuevas: Array<{ pregunta: string; contexto: string; prioridad: string }> = []
  for (const n of negocios ?? []) {
    if (n.tipo === 'casa' || n.tipo === 'general') continue
    if (conMovimiento.has(n.id)) continue
    const pregunta = `¿"${n.nombre}" no tuvo movimientos este mes o falta capturarlos?`
    if (preguntasAbiertas.has(pregunta)) continue
    nuevas.push({
      pregunta,
      contexto: `No hay transacciones de "${n.nombre}" desde el ${inicioMes}. Si vendió, hay que capturarlo; si no, ignóralo.`,
      prioridad: 'media',
    })
  }

  if (nuevas.length === 0) return 0
  const { error } = await admin.from('auditor_pendientes').insert(
    nuevas.map((q) => ({ ...q, estado: 'abierta' }))
  )
  return error ? 0 : nuevas.length
}
