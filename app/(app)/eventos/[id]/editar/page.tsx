import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EventoForm } from '@/components/eventos/evento-form'

export default async function EditarEventoPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  const supabase = await createClient()

  const [{ data: evento }, { data: negocios }] = await Promise.all([
    supabase.from('eventos').select('*').eq('id', id).single(),
    supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  if (!evento) notFound()

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-2xl mx-auto">
      <Link href={`/eventos/${id}`} className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Volver al evento
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient">Editar evento</h1>
        <p className="text-sm text-zinc-400">Modifica cualquier detalle. Los cambios se guardan al hacer click en &quot;Guardar cambios&quot;.</p>
      </header>

      <EventoForm
        negocios={negocios ?? []}
        modo="editar"
        evento={{
          id: evento.id,
          negocio_id: evento.negocio_id,
          cliente_nombre: evento.cliente_nombre,
          cliente_telefono: evento.cliente_telefono,
          cliente_email: evento.cliente_email,
          tipo_evento: evento.tipo_evento,
          paquete: evento.paquete,
          num_personas: evento.num_personas,
          duracion_horas: evento.duracion_horas,
          fecha_evento: evento.fecha_evento,
          hora_evento: evento.hora_evento,
          monto_total: Number(evento.monto_total),
          moneda: evento.moneda as 'MXN' | 'USD',
          comision_porcentaje: Number(evento.comision_porcentaje),
          proveedor_nombre: evento.proveedor_nombre,
          estado: evento.estado,
          notas: evento.notas,
        }}
      />
    </div>
  )
}
