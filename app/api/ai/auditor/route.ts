import { NextResponse } from 'next/server'
import { openai, OPENAI_MODEL } from '@/lib/ai/openai'
import { PROMPT_AUDITOR, type ChatMessage } from '@/lib/ai/prompts'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos, inicioDelMesISO } from '@/lib/fechas'
import { totalizar, porCategoria } from '@/lib/agregaciones'
import { siguientePago, proximoConDiaDelMes } from '@/lib/proximo-pago'
import { formatMoney } from '@/lib/utils'
import type OpenAIType from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 60

// =============================================================
// Tools del Auditor
// =============================================================
const TOOLS: OpenAIType.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'crear_gasto_fijo',
      description: 'Crea un nuevo gasto fijo / recurrente en la base. Úsalo cuando el usuario te confirme un gasto recurrente que aún no estaba registrado (ej: "la luz se paga 1200 al mes el día 10").',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          monto: { type: 'number' },
          moneda: { type: 'string', enum: ['MXN', 'USD'] },
          frecuencia: { type: 'string', enum: ['mensual', 'quincenal', 'semanal', 'anual'] },
          dia_del_mes: { type: 'number' },
          negocio_nombre: { type: 'string' },
          cuenta_nombre: { type: 'string' },
          responsable_nombre: { type: 'string' },
          proveedor: { type: 'string' },
          categoria: { type: 'string' },
        },
        required: ['nombre', 'monto', 'frecuencia'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_empleado',
      description: 'Da de alta un nuevo empleado. Después puedes agregarle compensación con agregar_compensacion.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          puesto: { type: 'string' },
          fecha_ingreso: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['nombre'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_pendiente',
      description: 'Crea una pregunta pendiente dirigida a un socio (Miguel o Sergio). Úsala cuando necesites info que solo el otro socio puede dar.',
      parameters: {
        type: 'object',
        properties: {
          pregunta: { type: 'string' },
          contexto: { type: 'string' },
          dirigida_a_nombre: { type: 'string', description: '"Miguel" o "Sergio"' },
          prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['pregunta', 'dirigida_a_nombre'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_negocio',
      description: 'Devuelve métricas detalladas de un negocio en un periodo: ingresos, gastos, utilidad, # transacciones, top categorías. Úsala cuando te pregunten "cómo va X negocio" o quieras comparar.',
      parameters: {
        type: 'object',
        properties: {
          negocio_nombre: { type: 'string' },
          dias_atras: { type: 'number', description: 'Días hacia atrás desde hoy (default 30)' },
        },
        required: ['negocio_nombre'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'comparar_periodos',
      description: 'Compara dos periodos del mismo negocio o globalmente. Devuelve % de crecimiento de ingresos, gastos, utilidad.',
      parameters: {
        type: 'object',
        properties: {
          negocio_nombre: { type: 'string', description: 'Opcional. Vacío = global' },
          periodo: { type: 'string', enum: ['mes_vs_anterior', 'semana_vs_anterior', 'año_vs_anterior'] },
        },
        required: ['periodo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'detectar_alertas',
      description: 'Escanea los últimos 7-30 días buscando anomalías: gastos atípicos (>2× promedio), negocios sin movimiento, transacciones sin categoría, gastos fijos vencidos.',
      parameters: {
        type: 'object',
        properties: {
          dias_atras: { type: 'number', description: 'default 7' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'top_categorias',
      description: 'Devuelve las top categorías de gasto/ingreso del periodo. Úsala para opinar sobre cómo se gasta.',
      parameters: {
        type: 'object',
        properties: {
          dias_atras: { type: 'number', description: 'default 30' },
          tipo: { type: 'string', enum: ['gasto', 'ingreso'] },
        },
      },
    },
  },
]

async function construirContexto(admin: ReturnType<typeof createAdminClient>) {
  const desde = inicioDelMesISO()
  const hasta = hoyEnCabos()

  const [
    { data: tx },
    { data: negocios },
    { data: cuentas },
    { data: empleados },
    { data: recurrentes },
    { data: pendientes },
  ] = await Promise.all([
    admin.from('transacciones').select('tipo, monto, moneda, fecha, categoria, negocio_id').gte('fecha', desde).lte('fecha', hasta),
    admin.from('negocios').select('nombre, tipo').eq('activo', true).order('nombre'),
    admin.from('cuentas').select('nombre, moneda').eq('activo', true).order('nombre'),
    admin.from('empleados').select('nombre, puesto').eq('activo', true),
    admin.from('gastos_recurrentes').select('nombre, monto, moneda, frecuencia, categoria').eq('activo', true),
    admin.from('auditor_pendientes').select('pregunta, prioridad').eq('estado', 'abierta').limit(10),
  ])

  const t = totalizar(tx ?? [])
  const top = porCategoria(tx ?? [], 5)

  return {
    contexto: [
      `Resumen del mes (${desde} a ${hasta}):`,
      `- Ingresos MXN: ${formatMoney(t.ingresos_mxn, 'MXN')}`,
      `- Gastos MXN: ${formatMoney(t.gastos_mxn, 'MXN')}`,
      `- Utilidad MXN: ${formatMoney(t.utilidad_mxn, 'MXN')}`,
      `- # transacciones: ${tx?.length ?? 0}`,
      `- Top categorías: ${top.map((c) => `${c.categoria} ${formatMoney(c.monto, 'MXN')}`).join(', ') || 'sin gastos'}`,
    ].join('\n'),
    negocios: (negocios ?? []).map((n) => `${n.nombre} (${n.tipo})`).join(', '),
    cuentas: (cuentas ?? []).map((c) => `${c.nombre} (${c.moneda})`).join(', '),
    empleados: (empleados ?? []).map((e) => `${e.nombre}${e.puesto ? ` (${e.puesto})` : ''}`).join(', ') || 'ninguno aún',
    recurrentes: (recurrentes ?? []).map((r) => `${r.nombre} ${r.monto} ${r.moneda} ${r.frecuencia}`).join(', ') || 'ninguno aún',
    pendientes: (pendientes ?? []).map((p) => `[${p.prioridad}] ${p.pregunta}`).join(' | ') || 'ninguno',
  }
}

function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

async function ejecutarTool(
  admin: ReturnType<typeof createAdminClient>,
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  if (name === 'crear_gasto_fijo') {
    const [{ data: negocios }, { data: cuentas }, { data: perfiles }] = await Promise.all([
      admin.from('negocios').select('id, nombre').eq('activo', true),
      admin.from('cuentas').select('id, nombre').eq('activo', true),
      admin.from('profiles').select('id, nombre').eq('activo', true),
    ])
    const findId = (list: { id: string; nombre: string }[] | null, hint: string) => {
      if (!hint || !list) return null
      const h = norm(hint)
      return list.find((x) => norm(x.nombre).includes(h) || h.includes(norm(x.nombre)))?.id ?? null
    }
    const dia = input.dia_del_mes ? Number(input.dia_del_mes) : null
    const proximo = dia
      ? proximoConDiaDelMes(dia, hoyEnCabos())
      : siguientePago(hoyEnCabos(), (input.frecuencia as 'mensual' | 'quincenal' | 'semanal' | 'anual') || 'mensual')

    const { error } = await admin.from('gastos_recurrentes').insert({
      nombre: String(input.nombre),
      monto: Number(input.monto),
      moneda: (input.moneda as 'MXN' | 'USD') || 'MXN',
      frecuencia: (input.frecuencia as 'mensual' | 'quincenal' | 'semanal' | 'anual') || 'mensual',
      dia_del_mes: dia,
      proximo_pago: proximo,
      negocio_id: findId(negocios, input.negocio_nombre as string),
      cuenta_id: findId(cuentas, input.cuenta_nombre as string),
      responsable_id: findId(perfiles, input.responsable_nombre as string),
      proveedor: (input.proveedor as string) || null,
      categoria: (input.categoria as string) || null,
      activo: true,
    })
    return error ? `Error: ${error.message}` : `✓ Gasto fijo "${input.nombre}" creado.`
  }

  if (name === 'crear_empleado') {
    const { error } = await admin.from('empleados').insert({
      nombre: String(input.nombre),
      puesto: (input.puesto as string) || null,
      fecha_ingreso: (input.fecha_ingreso as string) || null,
      activo: true,
    })
    return error ? `Error: ${error.message}` : `✓ Empleado "${input.nombre}" creado.`
  }

  if (name === 'crear_pendiente') {
    const { data: perfil } = await admin
      .from('profiles')
      .select('id, nombre')
      .ilike('nombre', String(input.dirigida_a_nombre))
      .maybeSingle()
    if (!perfil) return `No encontré socio "${input.dirigida_a_nombre}"`
    const { error } = await admin.from('auditor_pendientes').insert({
      pregunta: String(input.pregunta),
      contexto: (input.contexto as string) || null,
      dirigida_a: perfil.id,
      prioridad: (input.prioridad as 'alta' | 'media' | 'baja') || 'media',
      estado: 'abierta',
    })
    return error ? `Error: ${error.message}` : `✓ Pendiente creado para ${perfil.nombre}.`
  }

  // ============================================================
  // TOOLS DE ANÁLISIS
  // ============================================================

  if (name === 'consultar_negocio') {
    const negocioHint = String(input.negocio_nombre || '')
    const dias = Number(input.dias_atras ?? 30)
    const { data: negocios } = await admin.from('negocios').select('id, nombre, tipo').eq('activo', true)
    const h = norm(negocioHint)
    const neg = (negocios ?? []).find((n) => norm(n.nombre).includes(h) || h.includes(norm(n.nombre)))
    if (!neg) return `No encontré "${negocioHint}". Negocios: ${(negocios ?? []).map(n => n.nombre).join(', ')}`

    const desde = new Date()
    desde.setDate(desde.getDate() - dias)
    const desdeISO = desde.toISOString().slice(0, 10)

    const { data: tx } = await admin
      .from('transacciones')
      .select('tipo, monto, moneda, fecha, categoria, negocio_id')
      .eq('negocio_id', neg.id)
      .gte('fecha', desdeISO)

    const t = totalizar(tx ?? [])
    const top = porCategoria(tx ?? [], 3)
    return JSON.stringify({
      negocio: neg.nombre,
      tipo: neg.tipo,
      periodo_dias: dias,
      ingresos_mxn: t.ingresos_mxn,
      ingresos_usd: t.ingresos_usd,
      gastos_mxn: t.gastos_mxn,
      gastos_usd: t.gastos_usd,
      utilidad_mxn: t.utilidad_mxn,
      utilidad_usd: t.utilidad_usd,
      num_transacciones: tx?.length ?? 0,
      top_categorias: top,
    })
  }

  if (name === 'comparar_periodos') {
    const periodo = String(input.periodo)
    const negocioHint = (input.negocio_nombre as string) || ''
    let negId: string | null = null
    if (negocioHint) {
      const { data: negs } = await admin.from('negocios').select('id, nombre')
      const h = norm(negocioHint)
      negId = (negs ?? []).find((n) => norm(n.nombre).includes(h))?.id ?? null
    }

    const dias = periodo === 'semana_vs_anterior' ? 7 : periodo === 'año_vs_anterior' ? 365 : 30
    const ahora = new Date()
    const inicioActual = new Date(ahora); inicioActual.setDate(ahora.getDate() - dias)
    const inicioAnterior = new Date(ahora); inicioAnterior.setDate(ahora.getDate() - dias * 2)

    let qActual = admin.from('transacciones').select('tipo, monto, moneda, fecha, categoria, negocio_id').gte('fecha', inicioActual.toISOString().slice(0,10)).lte('fecha', ahora.toISOString().slice(0,10))
    let qAnterior = admin.from('transacciones').select('tipo, monto, moneda, fecha, categoria, negocio_id').gte('fecha', inicioAnterior.toISOString().slice(0,10)).lt('fecha', inicioActual.toISOString().slice(0,10))
    if (negId) {
      qActual = qActual.eq('negocio_id', negId)
      qAnterior = qAnterior.eq('negocio_id', negId)
    }
    const [{ data: actual }, { data: anterior }] = await Promise.all([qActual, qAnterior])
    const tA = totalizar(actual ?? [])
    const tB = totalizar(anterior ?? [])

    const pct = (a: number, b: number) => b === 0 ? null : Math.round(((a - b) / b) * 1000) / 10

    return JSON.stringify({
      negocio: negocioHint || 'GLOBAL',
      periodo_dias: dias,
      actual: { ingresos: tA.ingresos_mxn, gastos: tA.gastos_mxn, utilidad: tA.utilidad_mxn, tx: actual?.length ?? 0 },
      anterior: { ingresos: tB.ingresos_mxn, gastos: tB.gastos_mxn, utilidad: tB.utilidad_mxn, tx: anterior?.length ?? 0 },
      cambio_pct: {
        ingresos: pct(tA.ingresos_mxn, tB.ingresos_mxn),
        gastos: pct(tA.gastos_mxn, tB.gastos_mxn),
        utilidad: pct(tA.utilidad_mxn, tB.utilidad_mxn),
      },
    })
  }

  if (name === 'detectar_alertas') {
    const dias = Number(input.dias_atras ?? 7)
    const desde = new Date()
    desde.setDate(desde.getDate() - dias)
    const desdeISO = desde.toISOString().slice(0, 10)
    const hoy = hoyEnCabos()

    const alertas: string[] = []

    // 1) Gastos fijos vencidos
    const { data: vencidos } = await admin
      .from('gastos_recurrentes')
      .select('nombre, monto, moneda, proximo_pago')
      .eq('activo', true)
      .lt('proximo_pago', hoy)
    if (vencidos && vencidos.length > 0) {
      for (const v of vencidos) {
        alertas.push(`VENCIDO: "${v.nombre}" ${v.monto} ${v.moneda} (debió pagarse ${v.proximo_pago})`)
      }
    }

    // 2) Transacciones sin categoría
    const { count: sinCat } = await admin
      .from('transacciones')
      .select('id', { count: 'exact', head: true })
      .gte('fecha', desdeISO)
      .or('categoria.is.null,categoria.eq.')
    if ((sinCat ?? 0) >= 5) {
      alertas.push(`${sinCat} transacciones sin categoría en los últimos ${dias} días`)
    }

    // 3) Negocios sin movimiento
    const { data: negs } = await admin.from('negocios').select('id, nombre').eq('activo', true).neq('tipo', 'general')
    for (const n of negs ?? []) {
      const { count } = await admin
        .from('transacciones')
        .select('id', { count: 'exact', head: true })
        .eq('negocio_id', n.id)
        .gte('fecha', desdeISO)
      if ((count ?? 0) === 0) {
        alertas.push(`Sin movimiento: "${n.nombre}" no ha tenido transacciones en ${dias} días`)
      }
    }

    return JSON.stringify({ dias_revisados: dias, alertas, total: alertas.length })
  }

  if (name === 'top_categorias') {
    const dias = Number(input.dias_atras ?? 30)
    const tipo = (input.tipo as 'gasto' | 'ingreso') || 'gasto'
    const desde = new Date()
    desde.setDate(desde.getDate() - dias)
    const desdeISO = desde.toISOString().slice(0, 10)

    const { data: tx } = await admin
      .from('transacciones')
      .select('tipo, monto, moneda, categoria, negocio_id')
      .eq('tipo', tipo)
      .gte('fecha', desdeISO)

    const top = porCategoria((tx ?? []).map(t => ({ ...t, tipo, categoria: t.categoria, fecha: '', negocio_id: t.negocio_id })), 8)
    return JSON.stringify({ tipo, dias, top })
  }

  return `Tool ${name} no implementada.`
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const body = (await req.json()) as { messages: ChatMessage[] }
    if (!body.messages?.length) {
      return NextResponse.json({ error: 'Faltan mensajes' }, { status: 400 })
    }

    const admin = createAdminClient()
    const ctx = await construirContexto(admin)
    const systemText = PROMPT_AUDITOR
      .replace('{CONTEXTO}', ctx.contexto)
      .replace('{FECHA_HOY}', hoyEnCabos())
      .replace('{NEGOCIOS}', ctx.negocios)
      .replace('{CUENTAS}', ctx.cuentas)
      .replace('{EMPLEADOS}', ctx.empleados)
      .replace('{RECURRENTES}', ctx.recurrentes)
      .replace('{PENDIENTES}', ctx.pendientes)

    // Guardar mensajes de usuario en BD para memoria persistente
    const ultimoMsg = body.messages[body.messages.length - 1]
    if (ultimoMsg?.role === 'user') {
      await admin.from('auditor_conversaciones').insert({
        profile_id: user.id,
        rol: 'user',
        contenido: ultimoMsg.content,
      })
    }

    const oaiMessages: OpenAIType.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemText },
      ...body.messages.map((m) => ({ role: m.role, content: m.content })),
    ]

    let finalReply = ''
    const accionesEjecutadas: string[] = []
    const MAX_ITERS = 4

    for (let i = 0; i < MAX_ITERS; i++) {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: oaiMessages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.4,
        max_tokens: 1024,
      })

      const msg = completion.choices[0]?.message
      if (!msg) break
      if (msg.content) finalReply = msg.content

      if (!msg.tool_calls || msg.tool_calls.length === 0) break

      oaiMessages.push({
        role: 'assistant',
        content: msg.content ?? '',
        tool_calls: msg.tool_calls,
      })

      for (const tc of msg.tool_calls) {
        if (tc.type !== 'function') continue
        let input: Record<string, unknown> = {}
        try { input = JSON.parse(tc.function.arguments || '{}') } catch {}

        const resultado = await ejecutarTool(admin, tc.function.name, input)
        accionesEjecutadas.push(resultado)
        oaiMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: resultado,
        })
      }
    }

    // Guardar respuesta del assistant
    await admin.from('auditor_conversaciones').insert({
      profile_id: user.id,
      rol: 'assistant',
      contenido: finalReply,
      tool_calls: accionesEjecutadas.length > 0 ? { acciones: accionesEjecutadas } : null,
    })

    return NextResponse.json({
      reply: finalReply || '…',
      acciones: accionesEjecutadas,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
