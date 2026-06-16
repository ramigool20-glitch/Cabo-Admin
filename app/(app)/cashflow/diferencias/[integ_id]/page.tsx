/**
 * Pantalla de "conciliación": muestra los pagos que MP reporta en los últimos
 * 30 días y marca cuáles ya están en BD (`mp_pagos_procesados`) y cuáles NO.
 * Los faltantes se pueden importar con un botón.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney } from '@/lib/utils'
import { ImportarPagoBoton } from '@/components/cashflow/importar-pago-boton'

type MPPayment = {
  id: number
  status: string
  transaction_amount: number
  currency_id: string
  date_approved: string | null
  date_created: string
  description: string | null
  payment_method_id: string | null
}

async function buscarPagosMP(accessToken: string, dias: number): Promise<MPPayment[]> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
  const url = `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=${desde}&end_date=NOW&limit=100`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`MP search ${res.status}`)
  const data = await res.json()
  return (data.results ?? []) as MPPayment[]
}

export default async function DiferenciasMPPage(
  props: { params: Promise<{ integ_id: string }> }
) {
  const { integ_id } = await props.params
  const admin = createAdminClient()

  const { data: integ } = await admin
    .from('integraciones_mp')
    .select('id, nombre, access_token, cuenta_id, cuentas(nombre)')
    .eq('id', integ_id)
    .maybeSingle()
  if (!integ) notFound()

  let pagos: MPPayment[] = []
  let errorMP: string | null = null
  try {
    pagos = await buscarPagosMP(integ.access_token, 30)
  } catch (e) {
    errorMP = e instanceof Error ? e.message : 'Error MP'
  }

  // ¿Cuáles ya tenemos?
  const ids = pagos.map((p) => String(p.id))
  let yaProc = new Set<string>()
  if (ids.length > 0) {
    const { data } = await admin
      .from('mp_pagos_procesados')
      .select('mp_payment_id')
      .in('mp_payment_id', ids)
    yaProc = new Set((data ?? []).map((r) => r.mp_payment_id as string))
  }

  const faltantes = pagos.filter((p) => p.status === 'approved' && !yaProc.has(String(p.id)))
  const yaImportados = pagos.filter((p) => p.status === 'approved' && yaProc.has(String(p.id)))
  const noAprobados = pagos.filter((p) => p.status !== 'approved')

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-2xl mx-auto">
      <Link href="/cashflow" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" />
        Cashflow
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient">Conciliar {integ.nombre}</h1>
        <p className="text-xs text-zinc-500">
          Cuenta: {(integ.cuentas as unknown as { nombre: string } | null)?.nombre ?? '—'} · Últimos 30 días
        </p>
      </header>

      {errorMP && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
          <p className="text-xs text-rose-300">
            MP respondió con error: <span className="font-mono">{errorMP}</span>
          </p>
        </div>
      )}

      {!errorMP && (
        <>
          <section className="space-y-2">
            <h2 className="label-caps text-amber-300">
              {faltantes.length} pagos en MP que NO están en la app
            </h2>
            {faltantes.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Nada que importar — todo está sincronizado.</p>
            ) : (
              <ul className="rounded-2xl border border-amber-500/30 bg-amber-500/5 divide-y divide-amber-500/20 overflow-hidden">
                {faltantes.map((p) => (
                  <li key={p.id} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-semibold truncate">
                        {p.description || `Cobro MP (${p.payment_method_id ?? 'card'})`}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {(p.date_approved ?? p.date_created).slice(0, 16).replace('T', ' ')}
                        {' · '}
                        ID {String(p.id).slice(-6)}
                      </p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-emerald-400">
                      +{formatMoney(Number(p.transaction_amount), p.currency_id === 'USD' ? 'USD' : 'MXN')}
                    </p>
                    <ImportarPagoBoton integId={integ_id} paymentId={String(p.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {yaImportados.length > 0 && (
            <section className="space-y-2">
              <h2 className="label-caps text-emerald-300">
                {yaImportados.length} pagos ya importados ✓
              </h2>
              <p className="text-[11px] text-zinc-500">
                Estos ya están en la app. No tienes que hacer nada.
              </p>
            </section>
          )}

          {noAprobados.length > 0 && (
            <section className="space-y-2">
              <h2 className="label-caps text-zinc-400">
                {noAprobados.length} pagos no aprobados
              </h2>
              <p className="text-[11px] text-zinc-500">
                Pendientes, rechazados o reembolsados. No se importan automáticamente.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
