/**
 * Detector de irregularidades y errores en la data.
 * El cerebro proactivo: corre a diario, encuentra problemas de calidad
 * de datos y anomalías financieras que un humano pasaría por alto.
 *
 * Tipos de detección:
 *  - Transacciones duplicadas (misma cuenta + monto + fecha cercana)
 *  - Montos anómalos (3x+ el promedio de su categoría)
 *  - Tx sin categoría
 *  - Cuentas en sobregiro (saldo negativo)
 *  - Gastos fijos vencidos sin marcar pagados
 *  - Eventos próximos (<7 días) sin anticipo
 *  - FX no capturado en >2 días
 *  - Gastos USD sin tipo de cambio aplicado
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'

export type Irregularidad = {
  tipo: 'duplicado' | 'monto_anomalo' | 'sin_categoria' | 'sobregiro' | 'fijo_vencido' | 'evento_sin_anticipo' | 'fx_viejo' | 'usd_sin_fx'
       | 'split_incompleto' | 'cpp_vencida' | 'cpc_vencida'
  severidad: 'alta' | 'media' | 'baja'
  titulo: string
  detalle: string
  link: string
  ids?: string[]
}

export async function detectarIrregularidades(): Promise<Irregularidad[]> {
  const admin = createAdminClient()
  const irregularidades: Irregularidad[] = []
  const hoy = hoyEnCabos()
  const hace30 = new Date(new Date(hoy + 'T00:00:00').getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // ============================================================
  // 1. DUPLICADOS — misma cuenta + monto + tipo, fecha ±1 día
  // ============================================================
  const { data: txRecientes } = await admin
    .from('transacciones')
    .select('id, tipo, monto, moneda, fecha, concepto, categoria, cuenta_id, negocio_id')
    .gte('fecha', hace30)
    .order('fecha', { ascending: false })

  const txs = txRecientes ?? []

  // Agrupar por firma (cuenta+monto+tipo+moneda) y revisar fechas cercanas
  const firmas = new Map<string, typeof txs>()
  for (const t of txs) {
    if (!t.cuenta_id) continue
    const key = `${t.cuenta_id}|${t.tipo}|${t.moneda}|${Number(t.monto).toFixed(2)}`
    if (!firmas.has(key)) firmas.set(key, [])
    firmas.get(key)!.push(t)
  }
  for (const [, grupo] of firmas) {
    if (grupo.length < 2) continue
    // Ordena por fecha y busca pares con ≤1 día de diferencia
    const ordenado = [...grupo].sort((a, b) => a.fecha.localeCompare(b.fecha))
    for (let i = 0; i < ordenado.length - 1; i++) {
      const a = ordenado[i]
      const b = ordenado[i + 1]
      const diffDias = Math.abs(
        (new Date(b.fecha + 'T00:00:00').getTime() - new Date(a.fecha + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
      )
      if (diffDias <= 1) {
        irregularidades.push({
          tipo: 'duplicado',
          severidad: 'alta',
          titulo: `Posible duplicado: ${a.concepto || 'sin concepto'}`,
          detalle: `2 ${a.tipo}s de ${Number(a.monto).toFixed(2)} ${a.moneda} en la misma cuenta el ${a.fecha} y ${b.fecha}. ¿Capturaste dos veces?`,
          link: `/transacciones/${b.id}`,
          ids: [a.id, b.id],
        })
        break // solo un aviso por firma
      }
    }
  }

  // ============================================================
  // 2. MONTOS ANÓMALOS — gasto 3x+ el promedio de su categoría
  // ============================================================
  const gastos = txs.filter((t) => t.tipo === 'gasto' && t.categoria)
  const porCat = new Map<string, number[]>()
  for (const g of gastos) {
    const cat = g.categoria as string
    if (!porCat.has(cat)) porCat.set(cat, [])
    porCat.get(cat)!.push(Number(g.monto))
  }
  for (const g of gastos) {
    const cat = g.categoria as string
    const montos = porCat.get(cat)!
    if (montos.length < 4) continue // necesita historial
    const promedio = montos.reduce((s, m) => s + m, 0) / montos.length
    if (promedio > 0 && Number(g.monto) > promedio * 3 && Number(g.monto) > 1000) {
      irregularidades.push({
        tipo: 'monto_anomalo',
        severidad: 'media',
        titulo: `Gasto inusual en "${cat}"`,
        detalle: `${Number(g.monto).toFixed(0)} ${g.moneda} es ${(Number(g.monto) / promedio).toFixed(1)}x el promedio de "${cat}" (${promedio.toFixed(0)}). Verifica que sea correcto.`,
        link: `/transacciones/${g.id}`,
        ids: [g.id],
      })
    }
  }

  // ============================================================
  // 3. TX SIN CATEGORÍA (últimos 30 días)
  // ============================================================
  const sinCat = txs.filter((t) => !t.categoria && t.tipo === 'gasto')
  if (sinCat.length >= 3) {
    irregularidades.push({
      tipo: 'sin_categoria',
      severidad: 'baja',
      titulo: `${sinCat.length} gastos sin categoría`,
      detalle: `Tienes ${sinCat.length} gastos sin categorizar en los últimos 30 días. Categorizar mejora los reportes y análisis.`,
      link: '/transacciones?tipo=gasto',
    })
  }

  // ============================================================
  // 4. SOBREGIRO — cuentas con saldo negativo
  // ============================================================
  try {
    const { calcularSaldos } = await import('@/lib/saldos')
    const [{ data: cuentas }, { data: txAll }, { data: fx }] = await Promise.all([
      admin.from('cuentas').select('id, nombre, titular, tipo, moneda, saldo_inicial_mxn, saldo_inicial_usd, saldo_inicial_fecha, saldo_inicial_locked, saldo_inicial_notas').eq('activo', true),
      admin.from('transacciones').select('tipo, monto, moneda, cuenta_id, fecha'),
      admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
    ])
    const rate = fx ? Number(fx.rate_compra) : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saldos = calcularSaldos((cuentas ?? []) as any, (txAll ?? []) as any, rate)
    for (const c of saldos.por_cuenta) {
      if (!c.locked) continue
      if (c.saldo_mxn < -1 || c.saldo_usd < -1) {
        irregularidades.push({
          tipo: 'sobregiro',
          severidad: 'alta',
          titulo: `${c.nombre} en negativo`,
          detalle: `Saldo: ${c.saldo_mxn < 0 ? c.saldo_mxn.toFixed(0) + ' MXN' : ''}${c.saldo_usd < 0 ? ' ' + c.saldo_usd.toFixed(0) + ' USD' : ''}. Revisa si falta registrar un ingreso o el saldo inicial está mal.`,
          link: '/cashflow',
        })
      }
    }
  } catch { /* skip */ }

  // ============================================================
  // 5. GASTOS FIJOS VENCIDOS
  // ============================================================
  const { data: fijosVencidos } = await admin
    .from('gastos_recurrentes')
    .select('id, nombre, monto, moneda, proximo_pago')
    .eq('activo', true)
    .lt('proximo_pago', hoy)
  if (fijosVencidos && fijosVencidos.length > 0) {
    irregularidades.push({
      tipo: 'fijo_vencido',
      severidad: 'alta',
      titulo: `${fijosVencidos.length} gasto${fijosVencidos.length > 1 ? 's' : ''} fijo${fijosVencidos.length > 1 ? 's' : ''} vencido${fijosVencidos.length > 1 ? 's' : ''}`,
      detalle: `${fijosVencidos.slice(0, 3).map((f) => f.nombre).join(', ')}. Márcalos pagados o reprograma.`,
      link: '/recurrentes',
    })
  }

  // ============================================================
  // 6. EVENTOS PRÓXIMOS (<7 días) SIN ANTICIPO
  // ============================================================
  const en7 = new Date(new Date(hoy + 'T00:00:00').getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: eventosProx } = await admin
    .from('eventos')
    .select('id, cliente_nombre, fecha_evento, monto_total, eventos_pagos(monto)')
    .in('estado', ['reservado', 'confirmado'])
    .gte('fecha_evento', hoy)
    .lte('fecha_evento', en7)
  for (const e of eventosProx ?? []) {
    const pagos = (e.eventos_pagos as Array<{ monto: number }>) ?? []
    const cobrado = pagos.reduce((s, p) => s + Number(p.monto), 0)
    if (cobrado <= 0.01) {
      irregularidades.push({
        tipo: 'evento_sin_anticipo',
        severidad: 'alta',
        titulo: `${e.cliente_nombre}: evento en <7 días SIN anticipo`,
        detalle: `Evento ${e.fecha_evento} por ${Number(e.monto_total).toFixed(0)} y no hay ningún pago registrado. Confirma el anticipo.`,
        link: `/eventos/${e.id}`,
      })
    }
  }

  // ============================================================
  // 7. FX VIEJO — sin captura en >2 días
  // ============================================================
  const { data: fxUlt } = await admin
    .from('fx_rates')
    .select('fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (fxUlt) {
    const diasFx = Math.floor(
      (new Date(hoy + 'T00:00:00').getTime() - new Date(fxUlt.fecha + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
    )
    if (diasFx > 2) {
      irregularidades.push({
        tipo: 'fx_viejo',
        severidad: 'media',
        titulo: `Tipo de cambio sin actualizar (${diasFx} días)`,
        detalle: `El último rate USD/MXN es del ${fxUlt.fecha}. Las conversiones usan ese valor. Actualízalo.`,
        link: '/fx',
      })
    }
  }

  // ============================================================
  // 9. SPLITS INCOMPLETOS — split_grupo_id con != 2 filas
  // ============================================================
  const { data: splits } = await admin
    .from('transacciones')
    .select('id, split_grupo_id, concepto, fecha, monto')
    .not('split_grupo_id', 'is', null)
    .gte('fecha', hace30)
  type SplitRow = { id: string; split_grupo_id: string | null; concepto: string | null; fecha: string; monto: number }
  const grupos = new Map<string, SplitRow[]>()
  for (const s of (splits ?? []) as SplitRow[]) {
    const k = s.split_grupo_id as string
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(s)
  }
  for (const [grupoId, rows] of grupos.entries()) {
    if (rows.length === 2) continue // OK
    irregularidades.push({
      tipo: 'split_incompleto',
      severidad: 'alta',
      titulo: `Pago dividido huérfano (${rows.length} ${rows.length === 1 ? 'fila' : 'filas'})`,
      detalle: `El split ${grupoId.slice(0, 8)} (${rows[0].concepto ?? 'sin concepto'} · ${rows[0].fecha}) tiene ${rows.length} fila${rows.length !== 1 ? 's' : ''} en vez de 2. Revisa si una se borró por error o si tiene 3+ filas por accidente.`,
      link: `/transacciones/${rows[0].id}`,
      ids: rows.map((r) => r.id),
    })
  }

  // ============================================================
  // 10. CUENTAS POR PAGAR VENCIDAS — fecha_vencimiento pasada
  // ============================================================
  const { data: cppV } = await admin
    .from('cuentas_por_pagar')
    .select('id, concepto, proveedor, monto_total, monto_pagado, moneda, fecha_vencimiento')
    .neq('estado', 'pagada')
    .lt('fecha_vencimiento', hoy)
  for (const c of cppV ?? []) {
    const dias = Math.floor((new Date(hoy + 'T00:00:00').getTime() - new Date(c.fecha_vencimiento + 'T00:00:00').getTime()) / 86_400_000)
    const pendiente = Number(c.monto_total) - Number(c.monto_pagado ?? 0)
    if (pendiente <= 0) continue
    irregularidades.push({
      tipo: 'cpp_vencida',
      severidad: dias > 7 ? 'alta' : 'media',
      titulo: `Cuenta por pagar vencida ${dias}d`,
      detalle: `"${c.concepto}"${c.proveedor ? ' · ' + c.proveedor : ''} venció el ${c.fecha_vencimiento}. Saldo pendiente: ${c.moneda} ${pendiente.toFixed(2)}.`,
      link: '/por-pagar',
      ids: [c.id],
    })
  }

  // ============================================================
  // 11. CUENTAS POR COBRAR VENCIDAS
  // ============================================================
  const { data: cpcV } = await admin
    .from('cuentas_por_cobrar')
    .select('id, concepto, cliente_nombre, monto_total, monto_cobrado, moneda, fecha_vencimiento')
    .neq('estado', 'cobrada')
    .lt('fecha_vencimiento', hoy)
  for (const c of cpcV ?? []) {
    const dias = Math.floor((new Date(hoy + 'T00:00:00').getTime() - new Date(c.fecha_vencimiento + 'T00:00:00').getTime()) / 86_400_000)
    const pendiente = Number(c.monto_total) - Number(c.monto_cobrado ?? 0)
    if (pendiente <= 0) continue
    irregularidades.push({
      tipo: 'cpc_vencida',
      severidad: dias > 7 ? 'alta' : 'media',
      titulo: `Cuenta por cobrar vencida ${dias}d`,
      detalle: `"${c.concepto}"${c.cliente_nombre ? ' · ' + c.cliente_nombre : ''} venció el ${c.fecha_vencimiento}. Por cobrar: ${c.moneda} ${pendiente.toFixed(2)}.`,
      link: '/por-cobrar',
      ids: [c.id],
    })
  }

  // Ordenar por severidad
  const orden = { alta: 0, media: 1, baja: 2 }
  return irregularidades.sort((a, b) => orden[a.severidad] - orden[b.severidad])
}
