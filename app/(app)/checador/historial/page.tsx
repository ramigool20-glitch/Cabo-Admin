import Link from 'next/link'
import { ChevronLeft, Camera, Clock, AlertCircle, CheckCircle2 } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type SearchParams = { empleado?: string; fecha?: string }

export default async function HistorialChecadasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const admin = createAdminClient()

  // Lista de empleados con horario
  const { data: empleados } = await admin
    .from('profiles')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  // Fecha objetivo (default hoy)
  const fecha = sp.fecha ?? new Date().toISOString().slice(0, 10)

  // Query checadas (incluye análisis IA si la migración 0048 está aplicada)
  const colsBase = 'id, profile_id, profile_nombre, tipo, timestamp_at, esperado_at, retardo_minutos, es_retardo, biometrico_verificado, foto_url, notas'
  const colsExt = `${colsBase}, analisis_estado, analisis_score, analisis_observaciones, analisis_alerta`
  let q = admin
    .from('checadas')
    .select(colsExt)
    .gte('timestamp_at', `${fecha}T00:00:00`)
    .lte('timestamp_at', `${fecha}T23:59:59`)
    .order('timestamp_at', { ascending: false })

  if (sp.empleado) q = q.eq('profile_id', sp.empleado)

  // Defensive: si migración 0048 no aplicada, retry sin esas columnas
  let { data: checadas, error: qErr } = await q
  if (qErr) {
    let q2 = admin.from('checadas').select(colsBase)
      .gte('timestamp_at', `${fecha}T00:00:00`)
      .lte('timestamp_at', `${fecha}T23:59:59`)
      .order('timestamp_at', { ascending: false })
    if (sp.empleado) q2 = q2.eq('profile_id', sp.empleado)
    const r = await q2
    checadas = r.data as never
  }

  // Signed URLs para las fotos
  const fotoPaths = (checadas ?? []).map(c => c.foto_url).filter(Boolean) as string[]
  const signedByPath = new Map<string, string>()
  if (fotoPaths.length > 0) {
    const { data: signed } = await admin.storage
      .from('evidencias')
      .createSignedUrls(fotoPaths, 60 * 60 * 8) // 8h
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) signedByPath.set(s.path, s.signedUrl)
    }
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-4xl mx-auto">
      <Link href="/checador" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Checador
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
          <Camera className="h-6 w-6 text-emerald-400" />
          Historial de checadas
        </h1>
        <p className="text-[11px] text-zinc-500">
          {fecha} · {checadas?.length ?? 0} checadas
        </p>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/checador/historial?fecha=${fecha}`}
          className={cn(
            'h-9 px-3 rounded-full text-xs border inline-flex items-center transition-all',
            !sp.empleado
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
          )}
        >
          Todos ({checadas?.length ?? 0})
        </Link>
        {(empleados ?? []).map(e => (
          <Link
            key={e.id}
            href={`/checador/historial?empleado=${e.id}&fecha=${fecha}`}
            className={cn(
              'h-9 px-3 rounded-full text-xs border inline-flex items-center transition-all',
              sp.empleado === e.id
                ? 'border-cyan-500 bg-cyan-500 text-white'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            )}
          >
            {e.nombre}
          </Link>
        ))}
      </div>

      {/* Date picker */}
      <form className="flex items-center gap-2">
        <label className="text-xs text-zinc-500 uppercase tracking-wider font-bold">Fecha:</label>
        <input
          type="date"
          name="fecha"
          defaultValue={fecha}
          className="h-9 px-3 rounded-lg border border-zinc-700 bg-zinc-900 text-sm"
        />
        {sp.empleado && <input type="hidden" name="empleado" value={sp.empleado} />}
        <button
          type="submit"
          className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold"
        >
          Ver
        </button>
      </form>

      {/* Lista de checadas con fotos */}
      {checadas && checadas.length > 0 ? (
        <ul className="space-y-2">
          {checadas.map(c => {
            const signedUrl = c.foto_url ? signedByPath.get(c.foto_url) : null
            return (
              <li
                key={c.id}
                className={cn(
                  'rounded-2xl border p-3 flex items-start gap-3',
                  c.es_retardo
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-emerald-500/20 bg-emerald-500/5'
                )}
              >
                {/* Foto */}
                {signedUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <a
                    href={signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block shrink-0 h-20 w-20 rounded-xl overflow-hidden border-2 border-zinc-700 hover:border-cyan-500 transition-colors"
                    title="Click para ver en grande"
                  >
                    <img src={signedUrl} alt="evidencia" className="w-full h-full object-cover" />
                  </a>
                ) : (
                  <div className="shrink-0 h-20 w-20 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900 inline-flex items-center justify-center">
                    <Camera className="h-6 w-6 text-zinc-600" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {c.tipo === 'entrada' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 h-5 text-[10px] font-bold text-emerald-200 uppercase tracking-wider">
                        🟢 ENTRADA
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-500/30 px-2 h-5 text-[10px] font-bold text-rose-200 uppercase tracking-wider">
                        🔴 SALIDA
                      </span>
                    )}
                    {c.es_retardo && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/30 px-2 h-5 text-[10px] font-bold text-amber-200">
                        <AlertCircle className="h-3 w-3" />
                        +{c.retardo_minutos} min tarde
                      </span>
                    )}
                    {c.biometrico_verificado && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2 h-5 text-[10px] font-bold text-cyan-200">
                        🔐 Bio
                      </span>
                    )}
                    {(c as { analisis_estado?: string }).analisis_estado && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 h-5 text-[10px] font-bold border ${
                        (c as { analisis_estado?: string }).analisis_estado === 'no_apto' ? 'bg-rose-500/20 border-rose-500/40 text-rose-200'
                        : (c as { analisis_estado?: string }).analisis_estado === 'precaucion' ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                        : (c as { analisis_estado?: string }).analisis_estado === 'apto' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                        : 'bg-zinc-700/40 border-zinc-700 text-zinc-300'
                      }`}>
                        {(c as { analisis_estado?: string }).analisis_estado === 'no_apto' ? '🚨'
                          : (c as { analisis_estado?: string }).analisis_estado === 'precaucion' ? '⚠️'
                          : (c as { analisis_estado?: string }).analisis_estado === 'apto' ? '✅'
                          : '❓'}
                        {(c as { analisis_estado?: string }).analisis_estado?.toUpperCase()}
                        {(c as { analisis_score?: number }).analisis_score != null && ` ${(c as { analisis_score?: number }).analisis_score}/10`}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-zinc-100">{c.profile_nombre}</p>
                  <p className="text-xs text-zinc-400 tabular-nums">
                    <Clock className="h-3 w-3 inline mr-1" />
                    {new Date(c.timestamp_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                    {c.esperado_at && (
                      <span className="text-zinc-500 ml-2">
                        · esperado: {new Date(c.esperado_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </span>
                    )}
                  </p>
                  {c.notas && (
                    <p className="text-[11px] text-zinc-500 italic mt-1">{c.notas as string}</p>
                  )}
                  {(c as { analisis_observaciones?: string }).analisis_observaciones && (
                    <p className="text-[11px] text-cyan-300/80 italic mt-1">
                      🤖 IA: {(c as { analisis_observaciones?: string }).analisis_observaciones}
                    </p>
                  )}
                </div>

                {/* Status icon grande */}
                <div className="shrink-0">
                  {c.es_retardo ? (
                    <AlertCircle className="h-6 w-6 text-amber-400" />
                  ) : (
                    <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center">
          <Camera className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-bold text-zinc-300">Sin checadas en esta fecha</p>
          <p className="text-xs text-zinc-500 mt-1">
            {sp.empleado ? 'Prueba con otro empleado o cambia la fecha' : 'Tania aún no ha checado hoy'}
          </p>
        </div>
      )}
    </div>
  )
}
