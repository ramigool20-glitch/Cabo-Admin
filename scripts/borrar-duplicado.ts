/**
 * Borra una transacción duplicada junto con sus referencias.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ID_A_BORRAR = '3ff0c8ce-e8e5-4785-85b5-b8dfb7c8effe' // la más reciente

async function main() {
  console.log(`→ Borrando transacción ${ID_A_BORRAR}\n`)

  // 1) Borrar referencias en recurrentes_pagados
  const { data: pagosVinc, error: e1 } = await supabase
    .from('recurrentes_pagados')
    .select('id, recurrente_id, fecha_pago, monto_pagado')
    .eq('transaccion_id', ID_A_BORRAR)

  if (e1) {
    console.error('Error consultando pagos vinculados:', e1.message)
  } else {
    console.log(`  Encontrados ${pagosVinc?.length ?? 0} pago(s) en recurrentes_pagados vinculados:`)
    for (const p of pagosVinc ?? []) {
      console.log(`    - ${p.id} | recurrente ${p.recurrente_id} | ${p.fecha_pago} | $${p.monto_pagado}`)
    }
    if (pagosVinc && pagosVinc.length > 0) {
      const { error: e2 } = await supabase
        .from('recurrentes_pagados')
        .delete()
        .eq('transaccion_id', ID_A_BORRAR)
      if (e2) {
        console.error('  Error borrando pagos:', e2.message)
      } else {
        console.log('  ✓ Pagos borrados')
      }
    }
  }

  // 2) Borrar la transacción
  const { error: eTx } = await supabase
    .from('transacciones')
    .delete()
    .eq('id', ID_A_BORRAR)

  if (eTx) {
    console.error('Error borrando transacción:', eTx.message)
    process.exit(1)
  }
  console.log('  ✓ Transacción borrada')

  // 3) Mostrar las restantes con monto 23500
  const { data: restantes } = await supabase
    .from('transacciones')
    .select('id, fecha, monto, moneda, concepto')
    .eq('monto', 23500)
    .ilike('concepto', '%renta%')

  console.log(`\nTransacciones restantes con renta $23,500: ${restantes?.length ?? 0}`)
  for (const t of restantes ?? []) {
    console.log(`  ${t.id} · ${t.fecha} · "${t.concepto}"`)
  }
  console.log('\n✅ Listo. Prueba borrar la restante desde la app para verificar el fix.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
