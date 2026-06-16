import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TransactionForm } from '@/components/transacciones/transaction-form'
import { hoyEnCabos } from '@/lib/fechas'

export default async function NuevaTransaccionPage() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const [{ data: negocios }, { data: cuentas }, { data: socios }, { data: integMp }] = await Promise.all([
    supabase.from('negocios').select('id, nombre, tipo, moneda_principal').eq('activo', true).order('nombre'),
    supabase.from('cuentas').select('id, nombre, tipo, moneda').eq('activo', true).order('nombre'),
    admin.from('profiles').select('id, nombre, role_id, roles(nombre)').eq('activo', true),
    admin.from('integraciones_mp').select('cuenta_id').eq('activa', true),
  ])

  const sociosFiltered = (socios ?? [])
    .filter((p) => {
      const r = p.roles as unknown as { nombre: string } | null
      return r?.nombre === 'admin' || r?.nombre === 'socio'
    })
    .map((p) => ({ id: p.id, nombre: p.nombre }))

  const cuentasConIntegMp = new Set((integMp ?? []).map((r) => r.cuenta_id).filter(Boolean) as string[])
  const cuentasOpts = (cuentas ?? []).map((c) => ({
    ...c,
    integracion_mp: cuentasConIntegMp.has(c.id),
  }))

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <Link
        href="/transacciones"
        className="inline-flex items-center gap-1 text-sm text-zinc-400"
      >
        <ChevronLeft className="h-4 w-4" />
        Transacciones
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Nueva transacción</h1>
      </header>

      <TransactionForm
        negocios={negocios ?? []}
        cuentas={cuentasOpts}
        socios={sociosFiltered}
        defaults={{
          tipo: 'gasto',
          moneda: 'MXN',
          fecha: hoyEnCabos(),
        }}
      />
    </div>
  )
}
