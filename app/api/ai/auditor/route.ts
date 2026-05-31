import { NextResponse } from 'next/server'
import { requireSocio } from '@/lib/auth/require-socio'
import { openai, OPENAI_MODEL } from '@/lib/ai/openai'
import { PROMPT_AUDITOR, type ChatMessage } from '@/lib/ai/prompts'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos, inicioDelMesISO } from '@/lib/fechas'
import { totalizar, porCategoria } from '@/lib/agregaciones'
import { siguientePago, proximoConDiaDelMes } from '@/lib/proximo-pago'
import { formatMoney } from '@/lib/utils'
import { enviarPushAProfiles } from '@/lib/push/server'
import { getAIProvider } from '@/lib/ai/provider'
import { runAnthropicLoop } from '@/lib/ai/anthropic-loop'
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
  {
    type: 'function',
    function: {
      name: 'crear_cuenta_por_pagar',
      description: 'Crea una cuenta por pagar (deuda a proveedor). Úsala cuando digan "le debo X a Y", "tengo pendiente pagar a Z", etc.',
      parameters: {
        type: 'object',
        properties: {
          proveedor: { type: 'string' },
          concepto: { type: 'string' },
          monto_total: { type: 'number' },
          moneda: { type: 'string', enum: ['MXN', 'USD'] },
          fecha_vencimiento: { type: 'string', description: 'YYYY-MM-DD opcional' },
          negocio_nombre: { type: 'string' },
          categoria: { type: 'string' },
          referencia: { type: 'string' },
        },
        required: ['proveedor', 'concepto', 'monto_total'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_tarea',
      description: 'Crea una tarea asignada a Miguel, Sergio o ambos.',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          descripcion: { type: 'string' },
          asignada_a_nombres: { type: 'array', items: { type: 'string' } },
          fecha_limite: { type: 'string', description: 'ISO YYYY-MM-DDTHH:mm' },
          prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
          multa_monto: { type: 'number' },
        },
        required: ['titulo', 'asignada_a_nombres', 'fecha_limite'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_evento',
      description: 'Crea un evento de Rancho McCoy (bodas, etc.) con datos del cliente y fecha.',
      parameters: {
        type: 'object',
        properties: {
          cliente_nombre: { type: 'string' },
          tipo_evento: { type: 'string' },
          fecha_evento: { type: 'string', description: 'YYYY-MM-DD' },
          monto_total: { type: 'number' },
          moneda: { type: 'string', enum: ['MXN', 'USD'] },
          comision_porcentaje: { type: 'number', description: 'default 25' },
          paquete: { type: 'string', description: 'ELIT, PLATINO, VIP, etc' },
          num_personas: { type: 'number' },
          duracion_horas: { type: 'number' },
        },
        required: ['cliente_nombre', 'fecha_evento', 'monto_total'],
      },
    },
  },
  // ============================================================
  // EVENTOS — análisis específico
  // ============================================================
  {
    type: 'function',
    function: {
      name: 'consultar_eventos',
      description: 'Devuelve eventos del Rancho con desglose de cobrado/pendiente. Filtros por estado y rango. Úsala para "¿cuánto debo cobrar este mes?", "¿qué eventos vienen?", "¿quién no ha pagado?"',
      parameters: {
        type: 'object',
        properties: {
          estado: { type: 'string', enum: ['todos', 'reservado', 'confirmado', 'realizado', 'pagado_proveedor', 'cancelado', 'con_pendiente'] },
          desde: { type: 'string', description: 'YYYY-MM-DD inicio. Default: hoy.' },
          hasta: { type: 'string', description: 'YYYY-MM-DD fin. Default: +90 días.' },
        },
      },
    },
  },
  // ============================================================
  // CASA — balance entre roomates
  // ============================================================
  {
    type: 'function',
    function: {
      name: 'consultar_casa_balance',
      description: 'Devuelve el balance de Casa entre roomates (Miguel y Sergio): compartido, personal de cada uno, quién le debe a quién. Úsala para "¿cuánto debo en casa?", "¿cuánto puso Sergio?", "¿quién paga más?"',
      parameters: {
        type: 'object',
        properties: {
          dias_atras: { type: 'number', description: 'Default 30 (mes actual)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_avances',
      description: 'CRÍTICO: La empresa cubre TODOS los gastos de Casa. Cuando un socio captura un gasto Casa "atribuido a él", eso es un AVANCE que recibió de la empresa y se DEDUCIRÁ de su utilidad al corte (mes/quincena). Esta tool devuelve avances por socio en el período. Úsala para "¿cuánto llevo de avance?", "¿cuánto me van a deducir del corte?", "¿cuánto sacó Sergio personal?"',
      parameters: {
        type: 'object',
        properties: {
          dias_atras: { type: 'number', description: 'Default 30 (mes en curso típicamente)' },
          socio_nombre: { type: 'string', description: 'Opcional. Si se da, devuelve solo el avance de ese socio.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_venta',
      description: 'Registra una venta de página digital. Úsala si dicen "vendí X producto por $Y" o "vendí 3 piezas a $50 USD c/u".',
      parameters: {
        type: 'object',
        properties: {
          negocio_nombre: { type: 'string', description: 'Nombre del negocio (página)' },
          precio_venta: { type: 'number' },
          moneda: { type: 'string', enum: ['MXN', 'USD'] },
          producto: { type: 'string' },
          costo_producto: { type: 'number' },
          fecha: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['negocio_nombre', 'precio_venta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_gasto_ads',
      description: 'Registra un gasto de publicidad (Meta/Google/TikTok) para página digital. Úsala si dicen "gasté $50 USD en Meta ads".',
      parameters: {
        type: 'object',
        properties: {
          negocio_nombre: { type: 'string' },
          monto: { type: 'number' },
          moneda: { type: 'string', enum: ['MXN', 'USD'] },
          plataforma: { type: 'string', description: 'meta, google, tiktok, otro' },
          fecha: { type: 'string' },
        },
        required: ['negocio_nombre', 'monto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_metricas_pagina',
      description: 'Devuelve métricas de página digital: ROAS, margen real, ventas, gasto ads. Úsala para "¿cómo va la página X?", "¿cuál es mi ROAS?", "¿estoy rentable?"',
      parameters: {
        type: 'object',
        properties: {
          negocio_nombre: { type: 'string' },
          dias_atras: { type: 'number', description: 'default 30' },
        },
        required: ['negocio_nombre'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_competidores',
      description: 'Devuelve competidores registrados en el Radar, opcionalmente filtrados por dominio (farmacia/consultorio/rancho_mccoy/pagina_X). Úsala cuando preguntan sobre competencia o quieres sugerir análisis.',
      parameters: {
        type: 'object',
        properties: {
          dominio: { type: 'string', description: 'Opcional. farmacia, consultorio, rancho_mccoy, pagina_1-8' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agregar_competidor',
      description: 'Registra un competidor en el Radar. Úsala cuando el usuario diga "el competidor X de farmacia es Y".',
      parameters: {
        type: 'object',
        properties: {
          dominio_propio: { type: 'string', description: 'farmacia, consultorio, rancho_mccoy, pagina_1-8' },
          competidor_nombre: { type: 'string' },
          competidor_url: { type: 'string' },
          tipo: { type: 'string', enum: ['directo', 'indirecto', 'referencia'] },
          descripcion: { type: 'string', description: 'qué venden, precios, notas relevantes' },
        },
        required: ['dominio_propio', 'competidor_nombre'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cerrar_pendiente',
      description: 'Marca una pregunta pendiente como resuelta o descartada. Úsala cuando el usuario haya respondido la info o cuando ya no aplique. Identifica el pendiente por substring de la pregunta.',
      parameters: {
        type: 'object',
        properties: {
          pregunta_substring: { type: 'string', description: 'Pedazo del texto de la pregunta del pendiente a cerrar' },
          accion: { type: 'string', enum: ['resuelta', 'descartada'] },
        },
        required: ['pregunta_substring', 'accion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_shopping_item',
      description: 'Agrega un item a la lista de compras de Casa (papel, leche, etc.). Si es urgente, prioridad alta dispara push al otro roomate.',
      parameters: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          cantidad: { type: 'string', description: 'opcional. Ej: "2 cajas"' },
          prioridad: { type: 'string', enum: ['alta', 'normal', 'baja'] },
        },
        required: ['item'],
      },
    },
  },
  // ============================================================
  // CASHFLOW / SALDOS / POR COBRAR / POR PAGAR
  // ============================================================
  {
    type: 'function',
    function: {
      name: 'consultar_saldos_cuentas',
      description: 'Devuelve saldos actuales por cuenta (Mercado Pago, Stripe, Efectivo, etc) y total del sistema en MXN. Úsala para "¿cuánto tengo en X cuenta?", "¿cuál es mi saldo total?", "¿en qué cuenta tengo más dinero?"',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_por_cobrar',
      description: 'Devuelve resumen de cuentas/eventos por cobrar (clientes que deben a la empresa + eventos Rancho con anticipo pendiente). Úsala para "¿quién me debe?", "¿cuánto me deben?", "¿qué eventos faltan por cobrar?"',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_por_pagar',
      description: 'Devuelve resumen de cuentas por pagar (deudas con proveedores). Úsala para "¿a quién le debo?", "¿qué tengo pendiente de pagar?"',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_cashflow',
      description: 'Resumen completo: saldo total + por cobrar + por pagar + obligaciones + proyección neto. Úsala para "¿cómo voy en general?", "¿cuál es mi situación financiera?", "¿tengo suficiente para pagar todo?"',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_cuenta_por_cobrar',
      description: 'Registra una deuda de cliente hacia la empresa. Úsala cuando el usuario diga "X me debe Y", "fulano quedó debiendo Z".',
      parameters: {
        type: 'object',
        properties: {
          cliente_nombre: { type: 'string' },
          concepto: { type: 'string', description: 'Qué te debe' },
          monto: { type: 'number' },
          moneda: { type: 'string', enum: ['MXN', 'USD'] },
          fecha_vencimiento: { type: 'string', description: 'opcional, YYYY-MM-DD' },
          negocio_nombre: { type: 'string', description: 'opcional, a cuál negocio le debe' },
          notas: { type: 'string' },
        },
        required: ['cliente_nombre', 'concepto', 'monto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ajustar_saldo_cuenta',
      description: 'Registra un ajuste manual de saldo en una cuenta (ej: comisión bancaria detectada, intereses recibidos, cargo no registrado). Crea una transacción con motivo obligatorio.',
      parameters: {
        type: 'object',
        properties: {
          cuenta_nombre: { type: 'string' },
          tipo: { type: 'string', enum: ['entrada', 'salida'] },
          monto: { type: 'number' },
          moneda: { type: 'string', enum: ['MXN', 'USD'] },
          motivo: { type: 'string', description: 'OBLIGATORIO. Por qué el ajuste.' },
        },
        required: ['cuenta_nombre', 'tipo', 'monto', 'motivo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'guardar_memoria',
      description: 'Guarda algo importante en tu memoria persistente: preferencias del usuario, hechos confirmados, alertas a vigilar, contexto de negocio. Úsalo cuando aprendas algo nuevo que debas recordar en futuras conversaciones.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['preferencia', 'hecho', 'alerta', 'contexto', 'feedback'] },
          contenido: { type: 'string', description: 'Lo que vas a recordar, en una frase corta y concreta.' },
          ambito: { type: 'string', description: 'opcional. Ej: casa, pagina_1, rancho_mccoy, general' },
          importancia: { type: 'number', description: '1-10. Default 5. Alto = se incluye siempre en contexto.' },
        },
        required: ['tipo', 'contenido'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recordar_memorias',
      description: 'Lista todas las memorias guardadas, opcionalmente filtradas por tipo o ámbito. Úsalo cuando quieras consultar qué sabes sobre algo o el usuario pregunte "¿qué recuerdas de X?"',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['preferencia', 'hecho', 'alerta', 'contexto', 'feedback'] },
          ambito: { type: 'string' },
        },
      },
    },
  },
]

async function construirContexto(admin: ReturnType<typeof createAdminClient>) {
  const desde = inicioDelMesISO()
  const hasta = hoyEnCabos()
  const en90 = new Date(new Date(hasta + 'T00:00:00').getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Buscar negocio Casa para incluir su balance
  const { data: casaNeg } = await admin.from('negocios').select('id').eq('tipo', 'casa').maybeSingle()

  const [
    { data: tx },
    { data: txMesAnterior },
    { data: negocios },
    { data: cuentas },
    { data: empleados },
    { data: recurrentes },
    { data: pendientes },
    { data: porPagar },
    { data: eventos },
    { data: multas },
    { data: txCasa },
    { data: socios },
    { data: shoppingItems },
  ] = await Promise.all([
    admin.from('transacciones').select('tipo, monto, moneda, fecha, categoria, negocio_id, monto_mxn_equivalente').gte('fecha', desde).lte('fecha', hasta),
    admin.from('transacciones').select('tipo, monto, moneda, fecha, categoria, negocio_id, monto_mxn_equivalente').gte('fecha', new Date(new Date(desde).setMonth(new Date(desde).getMonth() - 1)).toISOString().slice(0, 10)).lt('fecha', desde),
    admin.from('negocios').select('nombre, tipo, url').eq('activo', true).order('nombre'),
    admin.from('cuentas').select('nombre, moneda, tipo').eq('activo', true).order('nombre'),
    admin.from('empleados').select('nombre, puesto, empleado_compensacion(sueldo_base, moneda, frecuencia_pago)').eq('activo', true),
    admin.from('gastos_recurrentes').select('nombre, monto, moneda, frecuencia, categoria, proximo_pago').eq('activo', true).order('proximo_pago'),
    admin.from('auditor_pendientes').select('pregunta, prioridad').eq('estado', 'abierta').limit(10),
    admin.from('cuentas_por_pagar').select('proveedor, concepto, monto_total, monto_pagado, moneda, fecha_vencimiento, estado').neq('estado', 'cancelado').neq('estado', 'pagado'),
    // Eventos con sus pagos (próximos 90 días)
    admin.from('eventos').select('id, cliente_nombre, fecha_evento, monto_total, moneda, estado, paquete, num_personas, eventos_pagos(monto)').gte('fecha_evento', desde).lte('fecha_evento', en90).neq('estado', 'cancelado').order('fecha_evento').limit(20),
    admin.from('multas').select('motivo, monto_propuesto, moneda, estado').in('estado', ['propuesta', 'justificada', 'reduccion_solicitada', 'pendiente_conversacion']).limit(5),
    // Transacciones de Casa del mes (para balance)
    casaNeg
      ? admin.from('transacciones').select('tipo, monto, moneda, capturado_por, atribuido_a, monto_mxn_equivalente').eq('negocio_id', casaNeg.id).gte('fecha', desde).lte('fecha', hasta)
      : Promise.resolve({ data: [] as Array<{ tipo: string; monto: number; moneda: string; capturado_por: string | null; atribuido_a: string | null; monto_mxn_equivalente: number | null }> }),
    admin.from('profiles').select('id, nombre, role_id, roles(nombre)').eq('activo', true),
    admin.from('casa_shopping').select('item, prioridad, comprado').eq('comprado', false).order('created_at', { ascending: false }).limit(10),
  ])

  // Memorias IA activas (top por importancia)
  let memorias: Array<{ tipo: string; contenido: string; ambito: string | null; importancia: number }> = []
  try {
    const { data: memData } = await admin
      .from('memoria_ia')
      .select('tipo, contenido, ambito, importancia')
      .eq('activa', true)
      .order('importancia', { ascending: false })
      .limit(20)
    memorias = memData ?? []
  } catch { /* tabla no existe aún */ }

  // Saldos del sistema (cashflow resumen rápido)
  let saldosResumen = ''
  try {
    const { calcularSaldos } = await import('@/lib/saldos')
    const [{ data: cuentasSaldo }, { data: txAll }, { data: fxRow }] = await Promise.all([
      admin.from('cuentas').select('id, nombre, titular, tipo, moneda, saldo_inicial_mxn, saldo_inicial_usd, saldo_inicial_fecha, saldo_inicial_locked, saldo_inicial_notas').eq('activo', true),
      admin.from('transacciones').select('tipo, monto, moneda, cuenta_id, fecha'),
      admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
    ])
    const rate = fxRow ? Number(fxRow.rate_compra) : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saldos = calcularSaldos((cuentasSaldo ?? []) as any, (txAll ?? []) as any, rate)
    const lineas = saldos.por_cuenta.filter((c) => c.locked).map((c) => {
      const p: string[] = []
      if (c.saldo_mxn !== 0) p.push(formatMoney(c.saldo_mxn, 'MXN'))
      if (c.saldo_usd !== 0) p.push(formatMoney(c.saldo_usd, 'USD'))
      return `${c.nombre}: ${p.join(' + ') || '$0'}`
    })
    saldosResumen = `Total sistema: ${formatMoney(saldos.total_mxn, 'MXN')}. ${lineas.join(' | ')}`
  } catch { /* skip */ }

  const t = totalizar(tx ?? [])
  const tAnt = totalizar(txMesAnterior ?? [])
  const top = porCategoria(tx ?? [], 5)

  // Crecimiento vs mes anterior
  const pct = (a: number, b: number) => b === 0 ? null : Math.round(((a - b) / b) * 100)
  const utilidadDelta = pct(t.utilidad_mxn, tAnt.utilidad_mxn)
  const ingresosDelta = pct(t.ingresos_mxn, tAnt.ingresos_mxn)

  // Por pagar totales
  const totalPorPagar = (porPagar ?? []).reduce((s, c) => s + (Number(c.monto_total) - Number(c.monto_pagado)), 0)
  const porPagarVencidos = (porPagar ?? []).filter((c) => c.fecha_vencimiento && c.fecha_vencimiento < hasta)

  // Recurrentes vencidos
  const recVencidos = (recurrentes ?? []).filter((r) => r.proximo_pago && r.proximo_pago < hasta)
  const recProximos = (recurrentes ?? []).filter((r) => r.proximo_pago && r.proximo_pago >= hasta).slice(0, 5)

  // Nómina total mensual estimada
  const nominaTotal = (empleados ?? []).reduce((s, e) => {
    const comps = (e.empleado_compensacion as Array<{ sueldo_base: number; moneda: string; frecuencia_pago: string }> | null) ?? []
    for (const c of comps) {
      const factor = c.frecuencia_pago === 'mensual' ? 1 : c.frecuencia_pago === 'quincenal' ? 2 : c.frecuencia_pago === 'semanal' ? 4.33 : 0
      if (c.moneda === 'MXN') s += Number(c.sueldo_base) * factor
    }
    return s
  }, 0)

  // ============================================================
  // EVENTOS DETALLADOS — cobrado y pendiente
  // ============================================================
  type EvRow = {
    id: string
    cliente_nombre: string
    fecha_evento: string
    monto_total: number
    moneda: string
    estado: string
    paquete: string | null
    num_personas: number | null
    eventos_pagos: Array<{ monto: number }> | null
  }
  const evDetalle = (eventos as EvRow[] ?? []).map((e) => {
    const cobrado = (e.eventos_pagos ?? []).reduce((s, p) => s + Number(p.monto), 0)
    const pendiente = Number(e.monto_total) - cobrado
    return { ...e, cobrado, pendiente }
  })
  const eventosTotalMxn = evDetalle.filter((e) => e.moneda === 'MXN').reduce((s, e) => s + Number(e.monto_total), 0)
  const eventosCobradoMxn = evDetalle.filter((e) => e.moneda === 'MXN').reduce((s, e) => s + e.cobrado, 0)
  const eventosPendienteMxn = evDetalle.filter((e) => e.moneda === 'MXN' && e.pendiente > 0.01).reduce((s, e) => s + e.pendiente, 0)

  // ============================================================
  // BALANCE CASA — entre roomates
  // ============================================================
  const sociosFiltered = (socios ?? []).filter((p) => {
    const r = p.roles as unknown as { nombre: string } | null
    return r?.nombre === 'admin' || r?.nombre === 'socio'
  })
  const nSocios = Math.max(1, sociosFiltered.length)
  let casaCompartido = 0
  const casaPersonal = new Map<string, number>() // socio_id → personal
  const casaPagado = new Map<string, number>()   // socio_id → pagó físicamente
  for (const s of sociosFiltered) {
    casaPersonal.set(s.id, 0)
    casaPagado.set(s.id, 0)
  }
  for (const t of (txCasa ?? [])) {
    if (t.tipo !== 'gasto' && t.tipo !== 'multa_interna') continue
    const equiv = t.monto_mxn_equivalente != null ? Number(t.monto_mxn_equivalente) : (t.moneda === 'MXN' ? Number(t.monto) : 0)
    if (t.atribuido_a) {
      casaPersonal.set(t.atribuido_a, (casaPersonal.get(t.atribuido_a) ?? 0) + equiv)
    } else {
      casaCompartido += equiv
    }
    if (t.capturado_por) {
      casaPagado.set(t.capturado_por, (casaPagado.get(t.capturado_por) ?? 0) + equiv)
    }
  }
  const cuotaCompartida = casaCompartido / nSocios
  const casaReporte = sociosFiltered.map((s) => {
    const personal = casaPersonal.get(s.id) ?? 0
    const pago = casaPagado.get(s.id) ?? 0
    const leToca = cuotaCompartida + personal
    const diff = pago - leToca
    return { nombre: s.nombre, personal, leToca, pago, diff }
  })

  return {
    contexto: [
      `📊 ESTADO ACTUAL — Hoy ${hasta}:`,
      ``,
      `MES ACTUAL (${desde} a ${hasta}):`,
      `- Ingresos MXN: ${formatMoney(t.ingresos_mxn, 'MXN')}${t.ingresos_usd > 0 ? `, USD ${formatMoney(t.ingresos_usd, 'USD')}` : ''}${ingresosDelta !== null ? ` (${ingresosDelta >= 0 ? '+' : ''}${ingresosDelta}% vs mes anterior)` : ''}`,
      `- Gastos MXN: ${formatMoney(t.gastos_mxn, 'MXN')}${t.gastos_usd > 0 ? `, USD ${formatMoney(t.gastos_usd, 'USD')}` : ''}`,
      `- Utilidad MXN: ${formatMoney(t.utilidad_mxn, 'MXN')}${utilidadDelta !== null ? ` (${utilidadDelta >= 0 ? '+' : ''}${utilidadDelta}% vs mes anterior)` : ''}`,
      `- # transacciones: ${tx?.length ?? 0}`,
      `- Top categorías de gasto: ${top.map((c) => `${c.categoria} ${formatMoney(c.monto, 'MXN')}`).join(', ') || 'sin gastos'}`,
      ``,
      `🔴 PENDIENTES CRÍTICOS:`,
      `- Gastos fijos VENCIDOS: ${recVencidos.length === 0 ? 'ninguno ✓' : recVencidos.map((r) => `${r.nombre} (${formatMoney(Number(r.monto), r.moneda as 'MXN' | 'USD')} desde ${r.proximo_pago})`).join('; ')}`,
      `- Cuentas por pagar vencidas: ${porPagarVencidos.length === 0 ? 'ninguna ✓' : porPagarVencidos.map((c) => `${c.proveedor} ${formatMoney(Number(c.monto_total) - Number(c.monto_pagado), c.moneda as 'MXN' | 'USD')}`).join('; ')}`,
      `- Multas sin resolver: ${(multas ?? []).length}`,
      ``,
      `💰 OBLIGACIONES:`,
      `- Total adeudado a proveedores: ${formatMoney(totalPorPagar, 'MXN')}`,
      `- Nómina mensual estimada: ${formatMoney(nominaTotal, 'MXN')}`,
      `- Gastos fijos próximos: ${recProximos.map((r) => `${r.nombre} ${r.proximo_pago}`).join(', ') || 'ninguno'}`,
      ``,
      `🎉 EVENTOS RANCHO MC COY (próx 90 días):`,
      `- Total ingreso estimado: ${formatMoney(eventosTotalMxn, 'MXN')}`,
      `- Cobrado (anticipos): ${formatMoney(eventosCobradoMxn, 'MXN')} · Pendiente: ${formatMoney(eventosPendienteMxn, 'MXN')}`,
      evDetalle.length > 0
        ? evDetalle.slice(0, 8).map((e) => `  · ${e.cliente_nombre} ${e.fecha_evento}${e.paquete ? ` [${e.paquete}]` : ''}${e.num_personas ? ` ${e.num_personas}pax` : ''} — Total ${formatMoney(Number(e.monto_total), e.moneda as 'MXN' | 'USD')}, falta ${formatMoney(e.pendiente, e.moneda as 'MXN' | 'USD')}`).join('\n')
        : '- ninguno agendado',
      ``,
      `🏠 BALANCE CASA (mes actual):`,
      `- Compartido: ${formatMoney(casaCompartido, 'MXN')} (cuota /persona ${formatMoney(cuotaCompartida, 'MXN')})`,
      casaReporte.length > 0
        ? casaReporte.map((b) => `  · ${b.nombre}: personal ${formatMoney(b.personal, 'MXN')} + ½ compartido = le toca ${formatMoney(b.leToca, 'MXN')}, pagó ${formatMoney(b.pago, 'MXN')} (${b.diff > 0.01 ? `le deben ${formatMoney(b.diff, 'MXN')}` : b.diff < -0.01 ? `debe ${formatMoney(Math.abs(b.diff), 'MXN')}` : 'empatado'})`).join('\n')
        : '- sin actividad en Casa este mes',
      shoppingItems && shoppingItems.length > 0
        ? `\n🛒 SHOPPING LIST PENDIENTE (Casa): ${shoppingItems.map((s) => `${s.item}${s.prioridad === 'alta' ? ' [URGENTE]' : ''}`).join(', ')}`
        : '',
    ].filter(Boolean).join('\n'),
    negocios: (negocios ?? []).map((n) => `${n.nombre} (${n.tipo})`).join(', '),
    cuentas: (cuentas ?? []).map((c) => `${c.nombre} (${c.moneda})`).join(', '),
    empleados: (empleados ?? []).map((e) => `${e.nombre}${e.puesto ? ` (${e.puesto})` : ''}`).join(', ') || 'ninguno aún',
    recurrentes: (recurrentes ?? []).slice(0, 10).map((r) => `${r.nombre} ${formatMoney(Number(r.monto), r.moneda as 'MXN' | 'USD')} ${r.frecuencia} (próx: ${r.proximo_pago})`).join('; ') || 'ninguno aún',
    pendientes: (pendientes ?? []).map((p) => `[${p.prioridad}] ${p.pregunta}`).join(' | ') || 'ninguno',
    memorias: memorias.length > 0
      ? memorias.map((m) => `[${m.tipo}${m.ambito ? `/${m.ambito}` : ''}] ${m.contenido}`).join('\n')
      : 'Sin memorias guardadas todavía.',
    saldos_resumen: saldosResumen || 'Sin saldos capturados todavía.',
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

  if (name === 'crear_cuenta_por_pagar') {
    const { data: negocios } = await admin.from('negocios').select('id, nombre').eq('activo', true)
    const h = norm(input.negocio_nombre as string || '')
    const neg = (negocios ?? []).find((x) => norm(x.nombre).includes(h) || h.includes(norm(x.nombre)))

    const { error } = await admin.from('cuentas_por_pagar').insert({
      proveedor: String(input.proveedor),
      concepto: String(input.concepto),
      monto_total: Number(input.monto_total),
      moneda: (input.moneda as 'MXN' | 'USD') || 'MXN',
      fecha_vencimiento: (input.fecha_vencimiento as string) || null,
      negocio_id: neg?.id || null,
      categoria: (input.categoria as string) || null,
      referencia: (input.referencia as string) || null,
      monto_pagado: 0,
      estado: 'pendiente',
    })
    return error ? `Error: ${error.message}` : `✓ Cuenta por pagar creada: ${input.proveedor} ${input.monto_total} ${input.moneda || 'MXN'}`
  }

  if (name === 'crear_tarea') {
    const { data: perfiles } = await admin.from('profiles').select('id, nombre').eq('activo', true)
    const asignados = (input.asignada_a_nombres as string[] || [])
      .map((nombre) => {
        const h = norm(nombre)
        return (perfiles ?? []).find((p) => norm(p.nombre) === h)?.id
      })
      .filter(Boolean) as string[]

    if (asignados.length === 0) return 'No encontré los socios asignados'

    const { error } = await admin.from('tareas').insert({
      titulo: String(input.titulo),
      descripcion: (input.descripcion as string) || null,
      asignada_a: asignados,
      fecha_limite: String(input.fecha_limite),
      prioridad: (input.prioridad as string) || 'media',
      multa_monto: input.multa_monto ? Number(input.multa_monto) : null,
      moneda_multa: 'MXN',
      estado: 'pendiente',
    })
    return error ? `Error: ${error.message}` : `✓ Tarea creada: ${input.titulo}`
  }

  if (name === 'crear_evento') {
    const { data: rancho } = await admin
      .from('negocios')
      .select('id')
      .ilike('nombre', '%rancho%')
      .eq('activo', true)
      .maybeSingle()
    if (!rancho) return 'No encontré negocio Rancho McCoy activo'

    const { error } = await admin.from('eventos').insert({
      cliente_nombre: String(input.cliente_nombre),
      tipo_evento: (input.tipo_evento as string) || null,
      fecha_evento: String(input.fecha_evento),
      monto_total: Number(input.monto_total),
      moneda: (input.moneda as 'MXN' | 'USD') || 'MXN',
      comision_porcentaje: input.comision_porcentaje ? Number(input.comision_porcentaje) : 25,
      paquete: (input.paquete as string) || null,
      num_personas: input.num_personas ? Number(input.num_personas) : null,
      duracion_horas: input.duracion_horas ? Number(input.duracion_horas) : null,
      negocio_id: rancho.id,
      estado: 'reservado',
    })
    return error ? `Error: ${error.message}` : `✓ Evento reservado: ${input.cliente_nombre} el ${input.fecha_evento}`
  }

  if (name === 'consultar_eventos') {
    const estado = (input.estado as string) || 'con_pendiente'
    const desde = (input.desde as string) || hoyEnCabos()
    const hasta = (input.hasta as string) ||
      new Date(new Date(desde + 'T00:00:00').getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    let q = admin
      .from('eventos')
      .select('id, cliente_nombre, fecha_evento, monto_total, moneda, estado, paquete, num_personas, duracion_horas, cliente_telefono, eventos_pagos(monto)')
      .gte('fecha_evento', desde)
      .lte('fecha_evento', hasta)
      .order('fecha_evento')
      .limit(50)

    if (estado !== 'todos' && estado !== 'con_pendiente') {
      q = q.eq('estado', estado)
    } else if (estado === 'con_pendiente') {
      q = q.neq('estado', 'cancelado').neq('estado', 'pagado_proveedor')
    }

    const { data } = await q
    const items = (data ?? []).map((e) => {
      const cobrado = ((e.eventos_pagos as Array<{ monto: number }>) ?? []).reduce((s, p) => s + Number(p.monto), 0)
      const pendiente = Number(e.monto_total) - cobrado
      return {
        cliente: e.cliente_nombre,
        fecha: e.fecha_evento,
        estado: e.estado,
        paquete: e.paquete,
        personas: e.num_personas,
        horas: e.duracion_horas,
        telefono: e.cliente_telefono,
        total: Number(e.monto_total),
        moneda: e.moneda,
        cobrado,
        pendiente,
      }
    }).filter((e) => estado !== 'con_pendiente' || e.pendiente > 0.01)

    const totales = items.reduce((acc, e) => {
      const k = e.moneda
      acc[`total_${k}`] = (acc[`total_${k}`] ?? 0) + e.total
      acc[`cobrado_${k}`] = (acc[`cobrado_${k}`] ?? 0) + e.cobrado
      acc[`pendiente_${k}`] = (acc[`pendiente_${k}`] ?? 0) + e.pendiente
      return acc
    }, {} as Record<string, number>)

    return JSON.stringify({ rango: `${desde} a ${hasta}`, estado, count: items.length, totales, eventos: items })
  }

  if (name === 'consultar_casa_balance') {
    const dias = Number(input.dias_atras ?? 30)
    const desde = new Date()
    desde.setDate(desde.getDate() - dias)
    const desdeISO = desde.toISOString().slice(0, 10)

    const { data: casa } = await admin.from('negocios').select('id').eq('tipo', 'casa').maybeSingle()
    if (!casa) return JSON.stringify({ error: 'No existe negocio Casa' })

    const [{ data: txCasa }, { data: socios }] = await Promise.all([
      admin.from('transacciones').select('tipo, monto, moneda, capturado_por, atribuido_a, monto_mxn_equivalente').eq('negocio_id', casa.id).gte('fecha', desdeISO),
      admin.from('profiles').select('id, nombre, role_id, roles(nombre)').eq('activo', true),
    ])

    const sFiltered = (socios ?? []).filter((p) => {
      const r = p.roles as unknown as { nombre: string } | null
      return r?.nombre === 'admin' || r?.nombre === 'socio'
    })
    const N = Math.max(1, sFiltered.length)
    let compartido = 0
    const personal = new Map<string, number>()
    const pagado = new Map<string, number>()
    for (const s of sFiltered) { personal.set(s.id, 0); pagado.set(s.id, 0) }
    for (const t of (txCasa ?? [])) {
      if (t.tipo !== 'gasto' && t.tipo !== 'multa_interna') continue
      const equiv = t.monto_mxn_equivalente != null ? Number(t.monto_mxn_equivalente) : (t.moneda === 'MXN' ? Number(t.monto) : 0)
      if (t.atribuido_a) personal.set(t.atribuido_a, (personal.get(t.atribuido_a) ?? 0) + equiv)
      else compartido += equiv
      if (t.capturado_por) pagado.set(t.capturado_por, (pagado.get(t.capturado_por) ?? 0) + equiv)
    }
    const cuota = compartido / N
    const totalCasa = compartido + Array.from(personal.values()).reduce((a, b) => a + b, 0)

    return JSON.stringify({
      dias_revisados: dias,
      total_casa_mxn: totalCasa,
      compartido_mxn: compartido,
      cuota_por_persona: cuota,
      por_socio: sFiltered.map((s) => {
        const p = personal.get(s.id) ?? 0
        const pago = pagado.get(s.id) ?? 0
        const leToca = cuota + p
        const diff = pago - leToca
        return {
          nombre: s.nombre,
          personal_mxn: p,
          cuota_compartida_mxn: cuota,
          le_toca_mxn: leToca,
          pagado_mxn: pago,
          diferencia_mxn: diff,
          estado: diff > 0.01 ? 'le_deben' : diff < -0.01 ? 'debe' : 'empatado',
        }
      }),
    })
  }

  if (name === 'consultar_avances') {
    const dias = Number(input.dias_atras ?? 30)
    const socioNombre = (input.socio_nombre as string) || ''
    const desde = new Date()
    desde.setDate(desde.getDate() - dias)
    const desdeISO = desde.toISOString().slice(0, 10)

    const { data: casa } = await admin.from('negocios').select('id').eq('tipo', 'casa').maybeSingle()
    if (!casa) return JSON.stringify({ error: 'No existe negocio Casa' })

    const [{ data: txCasa }, { data: socios }] = await Promise.all([
      admin.from('transacciones').select('tipo, monto, moneda, capturado_por, atribuido_a, monto_mxn_equivalente').eq('negocio_id', casa.id).gte('fecha', desdeISO),
      admin.from('profiles').select('id, nombre, role_id, roles(nombre)').eq('activo', true),
    ])

    const sFiltered = (socios ?? []).filter((p) => {
      const r = p.roles as unknown as { nombre: string } | null
      return r?.nombre === 'admin' || r?.nombre === 'socio'
    })

    let compartido = 0
    const avancePor = new Map<string, number>()
    for (const s of sFiltered) avancePor.set(s.id, 0)

    for (const t of (txCasa ?? [])) {
      if (t.tipo !== 'gasto' && t.tipo !== 'multa_interna') continue
      const equiv = t.monto_mxn_equivalente != null ? Number(t.monto_mxn_equivalente) : (t.moneda === 'MXN' ? Number(t.monto) : 0)
      if (t.atribuido_a) {
        avancePor.set(t.atribuido_a, (avancePor.get(t.atribuido_a) ?? 0) + equiv)
      } else {
        compartido += equiv
      }
    }

    const reporte = sFiltered.map((s) => ({
      nombre: s.nombre,
      avance_mxn: avancePor.get(s.id) ?? 0,
      explicacion: `Este monto se DEDUCIRÁ de la utilidad de ${s.nombre} al hacer el corte (mes/quincena).`,
    }))

    if (socioNombre) {
      const h = norm(socioNombre)
      const match = reporte.find((r) => norm(r.nombre).includes(h) || h.includes(norm(r.nombre)))
      if (match) {
        return JSON.stringify({
          periodo_dias: dias,
          desde: desdeISO,
          socio: match,
        })
      }
    }

    return JSON.stringify({
      periodo_dias: dias,
      desde: desdeISO,
      compartido_mxn: compartido,
      avances_por_socio: reporte,
      nota: 'Compartido = gasto operativo de la sociedad (no se deduce a nadie). Avance = la empresa adelantó esa lana al socio, se deduce de su utilidad al corte.',
    })
  }

  if (name === 'registrar_venta') {
    const { data: negocios } = await admin.from('negocios').select('id, nombre').eq('activo', true)
    const h = norm(input.negocio_nombre as string || '')
    const neg = (negocios ?? []).find((x) => norm(x.nombre).includes(h) || h.includes(norm(x.nombre)))
    if (!neg) return `No encontré negocio "${input.negocio_nombre}"`
    const fecha = (input.fecha as string) || hoyEnCabos()
    const precio = Number(input.precio_venta)
    const moneda = (input.moneda as 'MXN' | 'USD') || 'MXN'
    const costo = input.costo_producto ? Number(input.costo_producto) : null
    // FX
    const { aMxnEquivalente } = await import('@/lib/fx/server')
    const fxPrecio = await aMxnEquivalente(precio, moneda, fecha)
    const fxCosto = costo ? await aMxnEquivalente(costo, moneda, fecha) : null
    const { error } = await admin.from('ventas').insert({
      negocio_id: neg.id,
      fecha,
      producto: (input.producto as string) || null,
      precio_venta: precio,
      moneda,
      costo_producto: costo,
      precio_venta_mxn: fxPrecio.monto_mxn_equivalente,
      costo_producto_mxn: fxCosto?.monto_mxn_equivalente ?? null,
      tipo_cambio_usado: fxPrecio.tipo_cambio_usado,
    })
    return error ? `Error: ${error.message}` : `✓ Venta de ${precio} ${moneda} registrada en "${neg.nombre}"`
  }

  if (name === 'registrar_gasto_ads') {
    const { data: negocios } = await admin.from('negocios').select('id, nombre').eq('activo', true)
    const h = norm(input.negocio_nombre as string || '')
    const neg = (negocios ?? []).find((x) => norm(x.nombre).includes(h) || h.includes(norm(x.nombre)))
    if (!neg) return `No encontré negocio "${input.negocio_nombre}"`
    const fecha = (input.fecha as string) || hoyEnCabos()
    const monto = Number(input.monto)
    const moneda = (input.moneda as 'MXN' | 'USD') || 'USD'
    const { aMxnEquivalente } = await import('@/lib/fx/server')
    const fx = await aMxnEquivalente(monto, moneda, fecha)
    const { error } = await admin.from('gastos_ads').insert({
      negocio_id: neg.id,
      fecha,
      monto,
      moneda,
      plataforma: (input.plataforma as string) || 'meta',
      monto_mxn: fx.monto_mxn_equivalente,
      tipo_cambio_usado: fx.tipo_cambio_usado,
      metodo_captura: 'manual',
    })
    return error ? `Error: ${error.message}` : `✓ Gasto ads ${monto} ${moneda} registrado en "${neg.nombre}"`
  }

  if (name === 'consultar_metricas_pagina') {
    const { data: negocios } = await admin.from('negocios').select('id, nombre, tipo, moneda_principal').eq('activo', true)
    const h = norm(input.negocio_nombre as string || '')
    const neg = (negocios ?? []).find((x) => norm(x.nombre).includes(h) || h.includes(norm(x.nombre)))
    if (!neg) return `No encontré negocio "${input.negocio_nombre}"`
    const dias = Number(input.dias_atras ?? 30)
    const desde = new Date()
    desde.setDate(desde.getDate() - dias)
    const desdeISO = desde.toISOString().slice(0, 10)

    const [{ data: ventas }, { data: gastos_ads }, { data: fx }] = await Promise.all([
      admin.from('ventas').select('precio_venta, costo_producto, moneda, precio_venta_mxn, costo_producto_mxn').eq('negocio_id', neg.id).gte('fecha', desdeISO),
      admin.from('gastos_ads').select('monto, moneda, monto_mxn').eq('negocio_id', neg.id).gte('fecha', desdeISO),
      admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
    ])
    const rate = fx ? Number(fx.rate_compra) : 17

    type V = { precio_venta: number; precio_venta_mxn: number | null; costo_producto: number | null; costo_producto_mxn: number | null; moneda: string }
    type GA = { monto: number; monto_mxn: number | null; moneda: string }
    let ventasMxn = 0, costoMxn = 0, adsMxn = 0
    for (const v of ((ventas ?? []) as V[])) {
      ventasMxn += v.precio_venta_mxn != null ? Number(v.precio_venta_mxn) : (v.moneda === 'MXN' ? Number(v.precio_venta) : Number(v.precio_venta) * rate)
      const c = v.costo_producto_mxn != null ? Number(v.costo_producto_mxn) : (v.moneda === 'MXN' ? Number(v.costo_producto ?? 0) : Number(v.costo_producto ?? 0) * rate)
      costoMxn += c
    }
    for (const g of ((gastos_ads ?? []) as GA[])) {
      adsMxn += g.monto_mxn != null ? Number(g.monto_mxn) : (g.moneda === 'MXN' ? Number(g.monto) : Number(g.monto) * rate)
    }
    const numVentas = (ventas ?? []).length
    const roas = adsMxn > 0 ? ventasMxn / adsMxn : null
    const margenReal = ventasMxn - costoMxn - adsMxn
    const margenPct = ventasMxn > 0 ? (margenReal / ventasMxn) : null
    const costoPorVenta = numVentas > 0 ? adsMxn / numVentas : null

    return JSON.stringify({
      negocio: neg.nombre,
      tipo: neg.tipo,
      periodo_dias: dias,
      ventas_total_mxn: Math.round(ventasMxn * 100) / 100,
      num_ventas: numVentas,
      gasto_ads_mxn: Math.round(adsMxn * 100) / 100,
      costo_producto_mxn: Math.round(costoMxn * 100) / 100,
      roas: roas !== null ? Math.round(roas * 100) / 100 : null,
      margen_real_mxn: Math.round(margenReal * 100) / 100,
      margen_pct: margenPct !== null ? Math.round(margenPct * 1000) / 10 : null,
      costo_por_venta_mxn: costoPorVenta !== null ? Math.round(costoPorVenta * 100) / 100 : null,
      interpretacion: roas === null
        ? 'Sin ads registrados, no se puede calcular ROAS.'
        : roas >= 2
          ? 'ROAS saludable (>=2): cada peso en ads genera $' + roas.toFixed(2) + ' en ventas.'
          : roas >= 1
            ? 'ROAS apenas rentable. Margen ajustado.'
            : 'ROAS por debajo de 1: estás perdiendo dinero en ads.',
    })
  }

  if (name === 'consultar_competidores') {
    const dominio = (input.dominio as string) || ''
    let q = admin.from('radar_competidores')
      .select('id, dominio_propio, competidor_nombre, competidor_url, descripcion, tipo, notas, created_at')
      .eq('activo', true)
      .order('dominio_propio')
    if (dominio) q = q.eq('dominio_propio', dominio.toLowerCase().trim())

    const { data, error } = await q
    if (error) {
      if (/relation.*does not exist/i.test(error.message)) {
        return JSON.stringify({
          error: 'Tabla radar_competidores no existe',
          sugerencia: 'Pega la migración 0015_radar_competidores.sql en Supabase',
        })
      }
      return JSON.stringify({ error: error.message })
    }

    const total = (data ?? []).length
    if (total === 0) {
      return JSON.stringify({
        total: 0,
        dominio_filtrado: dominio || null,
        sugerencia: 'No hay competidores registrados. Sugiere al usuario agregar en /radar tab Competidores. Recomienda registrar al menos 3 competidores principales por cada dominio activo.',
      })
    }

    // Agrupar por dominio
    const porDominio = new Map<string, typeof data>()
    for (const c of data ?? []) {
      if (!porDominio.has(c.dominio_propio)) porDominio.set(c.dominio_propio, [])
      porDominio.get(c.dominio_propio)!.push(c)
    }

    return JSON.stringify({
      total,
      por_dominio: Object.fromEntries(
        Array.from(porDominio.entries()).map(([dom, comps]) => [dom, comps.length])
      ),
      competidores: (data ?? []).map((c) => ({
        dominio: c.dominio_propio,
        nombre: c.competidor_nombre,
        tipo: c.tipo,
        url: c.competidor_url,
        descripcion: c.descripcion,
      })),
    })
  }

  if (name === 'agregar_competidor') {
    const { error } = await admin.from('radar_competidores').insert({
      dominio_propio: String(input.dominio_propio || '').toLowerCase().trim(),
      competidor_nombre: String(input.competidor_nombre),
      competidor_url: (input.competidor_url as string) || null,
      tipo: (input.tipo as string) || 'directo',
      descripcion: (input.descripcion as string) || null,
      activo: true,
    })
    if (error) {
      if (/relation.*does not exist/i.test(error.message)) {
        return 'Error: Tabla radar_competidores no existe. Pega migración 0015 primero.'
      }
      return `Error: ${error.message}`
    }
    return `✓ Competidor "${input.competidor_nombre}" agregado al dominio "${input.dominio_propio}"`
  }

  if (name === 'cerrar_pendiente') {
    const sub = String(input.pregunta_substring || '').toLowerCase()
    const accionUI = (input.accion as 'resuelta' | 'descartada') || 'resuelta'
    const estadoBD = accionUI === 'resuelta' ? 'contestada' : 'descartada'
    const { data: pends } = await admin
      .from('auditor_pendientes')
      .select('id, pregunta')
      .eq('estado', 'abierta')
    const match = (pends ?? []).find((p) => (p.pregunta ?? '').toLowerCase().includes(sub))
    if (!match) return `No encontré pendiente con texto similar a "${input.pregunta_substring}"`
    const { error } = await admin
      .from('auditor_pendientes')
      .update({ estado: estadoBD, contestada_at: new Date().toISOString() })
      .eq('id', match.id)
    return error ? `Error: ${error.message}` : `✓ Pendiente "${match.pregunta}" marcado como ${accionUI}`
  }

  if (name === 'crear_shopping_item') {
    const prioridad = (input.prioridad as string) || 'normal'
    const item = String(input.item)
    const cantidad = (input.cantidad as string) || null
    const { error } = await admin.from('casa_shopping').insert({
      item,
      cantidad,
      prioridad,
      comprado: false,
    })
    if (error) return `Error: ${error.message}`

    // Si es alta, dispara push a todos los socios activos
    if (prioridad === 'alta') {
      try {
        const { data: socios } = await admin
          .from('profiles')
          .select('id, role_id, roles(nombre)')
          .eq('activo', true)
        const destinatarios = (socios ?? [])
          .filter((p) => {
            const r = p.roles as unknown as { nombre: string } | null
            return r?.nombre === 'admin' || r?.nombre === 'socio'
          })
          .map((p) => p.id)
        if (destinatarios.length > 0) {
          await enviarPushAProfiles(destinatarios, {
            title: '🛒 URGENTE para Casa',
            body: `🤖 Auditor agregó: ${item}${cantidad ? ` (${cantidad})` : ''}`,
            url: '/casa',
            tag: 'casa-shopping-alta',
            data: { prioridad: 'alta' },
          })
        }
      } catch {}
    }
    return `✓ Agregado a shopping list: ${item}${prioridad === 'alta' ? ' (URGENTE — push enviada)' : ''}`
  }

  // ============================================================
  // CASHFLOW / SALDOS HANDLERS
  // ============================================================
  if (name === 'consultar_saldos_cuentas') {
    const { calcularSaldos } = await import('@/lib/saldos')
    const [{ data: cuentas }, { data: txs }, { data: fx }] = await Promise.all([
      admin.from('cuentas').select('id, nombre, titular, tipo, moneda, saldo_inicial_mxn, saldo_inicial_usd, saldo_inicial_fecha, saldo_inicial_locked, saldo_inicial_notas').eq('activo', true),
      admin.from('transacciones').select('tipo, monto, moneda, cuenta_id, fecha'),
      admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
    ])
    const fxRate = fx ? Number(fx.rate_compra) : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saldos = calcularSaldos((cuentas ?? []) as any, (txs ?? []) as any, fxRate)
    const detalle = saldos.por_cuenta
      .filter((c) => c.locked)
      .map((c) => {
        const parts: string[] = []
        if (c.saldo_mxn !== 0) parts.push(formatMoney(c.saldo_mxn, 'MXN'))
        if (c.saldo_usd !== 0) parts.push(formatMoney(c.saldo_usd, 'USD'))
        return `• ${c.nombre}: ${parts.join(' + ') || '$0'}`
      }).join('\n')
    const sinCapturar = saldos.por_cuenta.filter((c) => !c.locked).map((c) => c.nombre)
    return [
      `💵 Saldo total del sistema: ${formatMoney(saldos.total_mxn, 'MXN')}`,
      `Desglose: ${formatMoney(saldos.total_solo_mxn, 'MXN')} en cuentas MXN + ${formatMoney(saldos.total_solo_usd, 'USD')} en cuentas USD${fxRate ? ` (rate ${fxRate.toFixed(2)})` : ''}`,
      '',
      detalle,
      sinCapturar.length > 0 ? `\n⚠ Sin saldo inicial capturado: ${sinCapturar.join(', ')}` : '',
    ].filter(Boolean).join('\n')
  }

  if (name === 'consultar_por_cobrar') {
    const [{ data: cobr }, { data: ev }, { data: fx }] = await Promise.all([
      admin.from('cuentas_por_cobrar').select('cliente_nombre, concepto, monto_total, monto_cobrado, moneda, fecha_vencimiento, estado').neq('estado', 'cobrado').neq('estado', 'cancelado'),
      admin.from('eventos').select('cliente_nombre, monto_total, moneda, fecha_evento, estado, eventos_pagos(monto)').in('estado', ['reservado', 'confirmado']),
      admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
    ])
    const rate = fx ? Number(fx.rate_compra) : 17
    let totalMxn = 0, totalUsd = 0
    const items: string[] = []
    for (const c of cobr ?? []) {
      const r = Number(c.monto_total) - Number(c.monto_cobrado)
      if (r <= 0) continue
      if (c.moneda === 'USD') totalUsd += r; else totalMxn += r
      items.push(`• ${c.cliente_nombre} (${c.concepto}): ${formatMoney(r, c.moneda as 'MXN' | 'USD')}${c.fecha_vencimiento ? ` · vence ${c.fecha_vencimiento}` : ''}`)
    }
    for (const e of ev ?? []) {
      const pagos = (e.eventos_pagos as Array<{ monto: number }>) ?? []
      const cobrado = pagos.reduce((s, p) => s + Number(p.monto), 0)
      const pend = Number(e.monto_total) - cobrado
      if (pend <= 0.01) continue
      if (e.moneda === 'USD') totalUsd += pend; else totalMxn += pend
      items.push(`🎉 ${e.cliente_nombre} (evento Rancho): ${formatMoney(pend, e.moneda as 'MXN' | 'USD')} · ${e.fecha_evento}`)
    }
    const equivTotal = totalMxn + totalUsd * rate
    return [
      `📈 Por cobrar: ${formatMoney(equivTotal, 'MXN')} equivalente`,
      `${formatMoney(totalMxn, 'MXN')}${totalUsd > 0 ? ` + ${formatMoney(totalUsd, 'USD')} (≈ ${formatMoney(totalUsd * rate, 'MXN')})` : ''}`,
      items.length > 0 ? '\n' + items.slice(0, 10).join('\n') : 'Sin pendientes.',
    ].join('\n')
  }

  if (name === 'consultar_por_pagar') {
    const [{ data: pag }, { data: fx }] = await Promise.all([
      admin.from('cuentas_por_pagar').select('proveedor, concepto, monto_total, monto_pagado, moneda, fecha_vencimiento, estado').neq('estado', 'pagado').neq('estado', 'cancelado'),
      admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
    ])
    const rate = fx ? Number(fx.rate_compra) : 17
    const hoy = hoyEnCabos()
    let totalMxn = 0, totalUsd = 0, vencidoMxn = 0
    const items: string[] = []
    for (const c of pag ?? []) {
      const r = Number(c.monto_total) - Number(c.monto_pagado)
      if (r <= 0) continue
      const venc = !!c.fecha_vencimiento && c.fecha_vencimiento < hoy
      if (c.moneda === 'USD') totalUsd += r; else { totalMxn += r; if (venc) vencidoMxn += r }
      items.push(`${venc ? '⚠ VENCIDO ' : ''}• ${c.proveedor} (${c.concepto}): ${formatMoney(r, c.moneda as 'MXN' | 'USD')}${c.fecha_vencimiento ? ` · vence ${c.fecha_vencimiento}` : ''}`)
    }
    const equivTotal = totalMxn + totalUsd * rate
    return [
      `📉 Por pagar: ${formatMoney(equivTotal, 'MXN')} equivalente`,
      `${formatMoney(totalMxn, 'MXN')}${totalUsd > 0 ? ` + ${formatMoney(totalUsd, 'USD')} (≈ ${formatMoney(totalUsd * rate, 'MXN')})` : ''}`,
      vencidoMxn > 0 ? `⚠ Vencido: ${formatMoney(vencidoMxn, 'MXN')}` : '',
      items.length > 0 ? '\n' + items.slice(0, 10).join('\n') : 'Sin pendientes.',
    ].filter(Boolean).join('\n')
  }

  if (name === 'consultar_cashflow') {
    const { calcularSaldos } = await import('@/lib/saldos')
    const [{ data: cuentas }, { data: txs }, { data: fx }, { data: cobr }, { data: ev }, { data: pag }] = await Promise.all([
      admin.from('cuentas').select('id, nombre, titular, tipo, moneda, saldo_inicial_mxn, saldo_inicial_usd, saldo_inicial_fecha, saldo_inicial_locked, saldo_inicial_notas').eq('activo', true),
      admin.from('transacciones').select('tipo, monto, moneda, cuenta_id, fecha'),
      admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
      admin.from('cuentas_por_cobrar').select('monto_total, monto_cobrado, moneda, estado').neq('estado', 'cobrado').neq('estado', 'cancelado'),
      admin.from('eventos').select('monto_total, moneda, estado, eventos_pagos(monto)').in('estado', ['reservado', 'confirmado']),
      admin.from('cuentas_por_pagar').select('monto_total, monto_pagado, moneda, estado').neq('estado', 'pagado').neq('estado', 'cancelado'),
    ])
    const rate = fx ? Number(fx.rate_compra) : 17
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saldos = calcularSaldos((cuentas ?? []) as any, (txs ?? []) as any, rate)
    let pcMxn = 0, pcUsd = 0
    for (const c of cobr ?? []) {
      const r = Number(c.monto_total) - Number(c.monto_cobrado)
      if (r <= 0) continue
      if (c.moneda === 'USD') pcUsd += r; else pcMxn += r
    }
    for (const e of ev ?? []) {
      const pagos = (e.eventos_pagos as Array<{ monto: number }>) ?? []
      const cobrado = pagos.reduce((s, p) => s + Number(p.monto), 0)
      const pend = Number(e.monto_total) - cobrado
      if (pend <= 0.01) continue
      if (e.moneda === 'USD') pcUsd += pend; else pcMxn += pend
    }
    let ppMxn = 0, ppUsd = 0
    for (const c of pag ?? []) {
      const r = Number(c.monto_total) - Number(c.monto_pagado)
      if (r <= 0) continue
      if (c.moneda === 'USD') ppUsd += r; else ppMxn += r
    }
    const pcTotal = pcMxn + pcUsd * rate
    const ppTotal = ppMxn + ppUsd * rate
    const neto = saldos.total_mxn + pcTotal - ppTotal
    return [
      `💵 SITUACIÓN FINANCIERA`,
      `Saldo en cuentas: ${formatMoney(saldos.total_mxn, 'MXN')}`,
      `Por cobrar (clientes + eventos): ${formatMoney(pcTotal, 'MXN')}`,
      `Por pagar (proveedores): ${formatMoney(ppTotal, 'MXN')}`,
      ``,
      `Neto si cobras todo y pagas todo: ${formatMoney(neto, 'MXN')}`,
      neto >= 0 ? '✓ Tienes capacidad de pago.' : '⚠ Faltarían recursos.',
    ].join('\n')
  }

  if (name === 'crear_cuenta_por_cobrar') {
    const { data: negs } = await admin.from('negocios').select('id, nombre').eq('activo', true)
    const findId = (list: { id: string; nombre: string }[] | null, hint: string) => {
      if (!hint || !list) return null
      const h = norm(hint)
      return list.find((x) => norm(x.nombre).includes(h) || h.includes(norm(x.nombre)))?.id ?? null
    }
    const { error } = await admin.from('cuentas_por_cobrar').insert({
      cliente_nombre: String(input.cliente_nombre),
      concepto: String(input.concepto),
      monto_total: Number(input.monto),
      monto_cobrado: 0,
      moneda: (input.moneda as 'MXN' | 'USD') || 'MXN',
      fecha_vencimiento: (input.fecha_vencimiento as string) || null,
      negocio_id: findId(negs, input.negocio_nombre as string),
      notas: (input.notas as string) || null,
      estado: 'pendiente',
    })
    return error ? `Error: ${error.message}` : `✓ Registrada deuda de ${input.cliente_nombre}: ${formatMoney(Number(input.monto), (input.moneda as 'MXN' | 'USD') || 'MXN')}`
  }

  if (name === 'guardar_memoria') {
    const { error } = await admin.from('memoria_ia').insert({
      tipo: String(input.tipo),
      contenido: String(input.contenido),
      ambito: (input.ambito as string) || null,
      importancia: Number(input.importancia ?? 5),
      activa: true,
    })
    if (error) {
      if (/relation.*does not exist/i.test(error.message)) {
        return 'Error: Tabla memoria_ia no existe. Pega la migración 0022_memoria_ia.sql en Supabase.'
      }
      return `Error: ${error.message}`
    }
    return `✓ Memoria guardada: "${input.contenido}"`
  }

  if (name === 'recordar_memorias') {
    let q = admin.from('memoria_ia').select('tipo, contenido, ambito, importancia, created_at').eq('activa', true)
    if (input.tipo) q = q.eq('tipo', input.tipo as string)
    if (input.ambito) q = q.eq('ambito', input.ambito as string)
    const { data, error } = await q.order('importancia', { ascending: false }).limit(30)
    if (error) {
      if (/relation.*does not exist/i.test(error.message)) {
        return 'Tabla memoria_ia no existe aún. Pega la migración 0022_memoria_ia.sql para activar memoria persistente.'
      }
      return `Error: ${error.message}`
    }
    if (!data || data.length === 0) return 'Sin memorias guardadas todavía.'
    return data.map((m) => `[${m.tipo}${m.ambito ? `/${m.ambito}` : ''}] ${m.contenido}`).join('\n')
  }

  if (name === 'ajustar_saldo_cuenta') {
    const { data: cuentas } = await admin.from('cuentas').select('id, nombre').eq('activo', true)
    const h = norm(input.cuenta_nombre as string)
    const cuenta = (cuentas ?? []).find((c) => norm(c.nombre).includes(h) || h.includes(norm(c.nombre)))
    if (!cuenta) return `Error: No encontré cuenta "${input.cuenta_nombre}". Disponibles: ${(cuentas ?? []).map((c) => c.nombre).join(', ')}`
    const tipoTx = input.tipo === 'entrada' ? 'ingreso' : 'gasto'
    const monto = Number(input.monto)
    const moneda = (input.moneda as 'MXN' | 'USD') || 'MXN'
    const fx = await (await import('@/lib/fx/server')).aMxnEquivalente(monto, moneda, hoyEnCabos())
    const { error } = await admin.from('transacciones').insert({
      tipo: tipoTx,
      monto,
      moneda,
      monto_mxn_equivalente: fx.monto_mxn_equivalente,
      tipo_cambio_usado: fx.tipo_cambio_usado,
      fecha: hoyEnCabos(),
      cuenta_id: cuenta.id,
      categoria: 'ajuste-saldo',
      concepto: `Ajuste: ${input.motivo}`,
      notas: `Ajuste manual desde IA. Motivo: ${input.motivo}`,
      metodo_pago: 'otro',
      metodo_captura: 'api',
    })
    return error ? `Error: ${error.message}` : `✓ Ajuste registrado en ${cuenta.nombre}: ${input.tipo === 'entrada' ? '+' : '−'}${formatMoney(monto, moneda)}. Motivo: ${input.motivo}`
  }

  return `Tool ${name} no implementada.`
}

export async function POST(req: Request) {
  try {
    const g = await requireSocio()
    if (g instanceof NextResponse) return g
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
      .replace('{MEMORIAS}', ctx.memorias)
      .replace('{SALDOS_RESUMEN}', ctx.saldos_resumen)

    // Guardar mensajes de usuario en BD para memoria persistente
    const ultimoMsg = body.messages[body.messages.length - 1]
    if (ultimoMsg?.role === 'user') {
      await admin.from('auditor_conversaciones').insert({
        profile_id: user.id,
        rol: 'user',
        contenido: ultimoMsg.content,
      })
    }

    let finalReply = ''
    let accionesEjecutadas: string[] = []
    const MAX_ITERS = 4

    if (getAIProvider() === 'anthropic') {
      // ===== Claude (Anthropic) =====
      const res = await runAnthropicLoop({
        system: systemText,
        mensajes: body.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: TOOLS as any,
        ejecutarTool: (name, input) => ejecutarTool(admin, name, input),
        maxIters: MAX_ITERS,
        maxTokens: 1024,
      })
      finalReply = res.finalReply
      accionesEjecutadas = res.accionesEjecutadas
    } else {
      // ===== OpenAI (GPT) =====
      const oaiMessages: OpenAIType.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemText },
        ...body.messages.map((m) => ({ role: m.role, content: m.content })),
      ]

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
