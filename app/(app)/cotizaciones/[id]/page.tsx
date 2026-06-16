import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { CotizacionDetalleClient } from '@/components/cotizaciones/cotizacion-detalle-client'
import type { Cotizacion, NegocioBranding } from '@/lib/cotizaciones/tipos'

export const dynamic = 'force-dynamic'

export default async function CotizacionDetallePage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: cot, error } = await admin
    .from('cotizaciones')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !cot) notFound()

  const { data: neg } = await admin
    .from('negocios')
    .select('id, nombre, tipo, slogan, rfc, direccion, telefono, email, url, color_primario, color_secundario')
    .eq('id', cot.negocio_id as string)
    .single()

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-3xl mx-auto">
      <Link href="/cotizaciones" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" />
        Cotizaciones
      </Link>

      <CotizacionDetalleClient
        cotizacion={cot as unknown as Cotizacion}
        negocio={neg as unknown as NegocioBranding}
      />
    </div>
  )
}
