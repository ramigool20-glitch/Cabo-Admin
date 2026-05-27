import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TransactionForm } from '@/components/transacciones/transaction-form'
import { hoyEnCabos } from '@/lib/fechas'

export default async function NuevaTransaccionPage() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const [{ data: negocios }, { data: cuentas }, { data: socios }] = await Promise.all([
    supabase.from('negocios').select('id, nombre, tipo, moneda_principal').eq('activo', true).order('nombre'),
    supabase.from('cuentas').select('id, nombre, tipo, moneda').eq('activo', true).order('nombre'),
    admin.from('profiles').select('id, nombre, role_id, roles(nombre)').eq('activo', true),
  ])

  const sociosFiltered = (socios ?? [])
    .filter((p) => {
      const r = p.roles as unknown as { nombre: string } | null
      return r?.nombre === 'admin' || r?.nombre === 'socio'
    })
    .map((p) => ({ id: p.id, nombre: p.nombre }))

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
        cuentas={cuentas ?? []}
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
