'use client'

import { useActionState, useEffect, useState } from 'react'
import { Loader2, Plus, Stethoscope, DollarSign, ClipboardList, Trash2, PlusCircle, Star } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn, formatMoney } from '@/lib/utils'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'
import { toast } from '@/components/ui/toast'
import { registrarServicioClinica, registrarResenaClinica, eliminarServicioClinica, type ClinicaState } from '@/app/(app)/clinica/actions'
import { PushSection } from '@/components/config/push-section'
import { ClinicaPagoCard, type ClinicaPagoData } from '@/components/clinica/clinica-pago-card'
import { useTransition } from 'react'
import { Wallet } from 'lucide-react'

type TabKey = 'inicio' | 'registrar' | 'catalogo' | 'pagos'
function normalizeTab(t: string | null, allowPagos: boolean): TabKey {
  if (t === 'registrar') return 'registrar'
  if (t === 'catalogo') return 'catalogo'
  if (t === 'pagos' && allowPagos) return 'pagos'
  return 'inicio'
}

export type Servicio = {
  id: string
  categoria: string
  nombre_es: string
  nombre_en: string | null
  precio_cliente: number | null
  moneda_precio: string
  comision_enfermera: number | null
  comision_fuera_horario: number | null
  ingredientes: string | null
  para_que_sirve: string | null
}

export type Realizado = {
  id: string
  tipo?: string | null
  servicio_nombre: string | null
  fecha: string
  ubicacion: string | null
  pago_comision: number
  propina: number
  cobrado_cliente: number | null
  notas?: string | null
  pago_id?: string | null
  propina_pago_id?: string | null
  estado_aprobacion?: string | null
  foto_url?: string | null
}

export type Tabulador = {
  periodo: string
  comisiones: number
  propinas: number
  bono: number
  sueldoBase: number
  total: number
  numServicios: number
  reviews: number
}

const CAT_LABEL: Record<string, string> = {
  consulta: '🩺 Consultas',
  iv: '💉 IV Therapy',
  lab: '🧪 Laboratorios',
  inyeccion: '💊 Inyecciones',
  enfermeria: '🩹 Enfermería',
  otro: '· Otros',
}

export function ClinicaClient({
  servicios, realizados, tabulador, fxRate, esEnfermera = false,
  pagosData = null, cuentas = [],
}: {
  servicios: Servicio[]
  realizados: Realizado[]
  tabulador: Tabulador
  fxRate: number
  esEnfermera?: boolean
  pagosData?: ClinicaPagoData | null
  cuentas?: Array<{ id: string; nombre: string }>
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const allowPagos = !esEnfermera && !!pagosData
  const tab = normalizeTab(sp.get('tab'), allowPagos)
  const goTab = (t: TabKey) => router.replace(`/clinica?tab=${t}`, { scroll: false })

  return (
    <div className="space-y-4">
      {/* Pestañas superiores: solo para socios/admin. La enfermera usa su menú inferior. */}
      {!esEnfermera && (
        <div className={cn('grid gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]', allowPagos ? 'grid-cols-4' : 'grid-cols-3')}>
          <TabBtn active={tab === 'inicio'} onClick={() => goTab('inicio')} icon={DollarSign} label="Tabulador" />
          <TabBtn active={tab === 'registrar'} onClick={() => goTab('registrar')} icon={Plus} label="Registrar" />
          <TabBtn active={tab === 'catalogo'} onClick={() => goTab('catalogo')} icon={ClipboardList} label="Catálogo" />
          {allowPagos && <TabBtn active={tab === 'pagos'} onClick={() => goTab('pagos')} icon={Wallet} label="Pagos" />}
        </div>
      )}

      {tab === 'inicio' && <TabuladorView tabulador={tabulador} realizados={realizados} esEnfermera={esEnfermera} onGoTab={goTab} />}
      {tab === 'registrar' && <RegistrarView servicios={servicios} esEnfermera={esEnfermera} />}
      {tab === 'catalogo' && <CatalogoView servicios={servicios} fxRate={fxRate} />}
      {tab === 'pagos' && allowPagos && pagosData && (
        <ClinicaPagoCard data={pagosData} cuentas={cuentas} />
      )}
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof DollarSign; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold', active ? 'bg-cyan-500 text-white shadow' : 'text-zinc-400')}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

function TabuladorView({ tabulador, realizados, esEnfermera, onGoTab }: { tabulador: Tabulador; realizados: Realizado[]; esEnfermera?: boolean; onGoTab?: (t: TabKey) => void }) {
  const [, start] = useTransition()

  // Separar servicios de reseñas para los historiales
  const servicios = realizados.filter((r) => r.tipo !== 'review')
  const reviewsList = realizados.filter((r) => r.tipo === 'review')

  // Gamificación: progreso de reviews hacia el siguiente paquete de 10
  const reviews = tabulador.reviews
  const siguienteHito = Math.ceil((reviews + 1) / 10) * 10
  const progresoReviews = ((reviews % 10) / 10) * 100
  // Mensaje motivador
  const ganadoExtra = tabulador.comisiones + tabulador.propinas + tabulador.bono
  const mensaje =
    ganadoExtra >= 3000 ? '🔥 ¡Vas increíble este periodo!'
    : ganadoExtra >= 1500 ? '💪 ¡Buen ritmo, sigue así!'
    : ganadoExtra > 0 ? '🌱 ¡Vamos sumando!'
    : '👋 Registra tu primer servicio del periodo'

  return (
    <div className="space-y-3">
      {/* HERO gamificado */}
      <section className="rounded-2xl p-5 space-y-3 bg-gradient-to-br from-emerald-500/20 via-cyan-500/10 to-purple-500/15 border border-emerald-500/30">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">💰 Llevas ganado · {tabulador.periodo}</p>
          <span className="text-[10px] text-zinc-400">{mensaje}</span>
        </div>
        <p className="text-5xl font-black tabular-nums bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">
          {formatMoney(tabulador.total, 'MXN')}
        </p>

        {/* Servicios = puntos */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 text-xs font-bold">
            🎯 {tabulador.numServicios} servicios
          </span>
          {tabulador.propinas > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-bold">
              💵 {formatMoney(tabulador.propinas, 'MXN')} propinas
            </span>
          )}
        </div>
      </section>

      {/* Acceso rápido (solo enfermera): registrar lo hace el admin, no ella */}
      {esEnfermera && onGoTab && (
        <button
          type="button"
          onClick={() => onGoTab('catalogo')}
          className="w-full rounded-xl p-3 flex items-center justify-center gap-2 bg-purple-500/15 border border-purple-500/40 text-purple-200 font-bold text-sm active:scale-[0.98] transition-transform"
        >
          <ClipboardList className="h-5 w-5" /> Ver catálogo
        </button>
      )}

      {/* Desglose en cards */}
      <div className="grid grid-cols-2 gap-2">
        <Linea label="💼 Sueldo base" monto={tabulador.sueldoBase} />
        <Linea label="🩺 Comisiones" monto={tabulador.comisiones} sub={`${tabulador.numServicios} servicios`} color="text-cyan-300" />
        <Linea label="💵 Propinas" monto={tabulador.propinas} color="text-emerald-400" />
        <Linea label="⭐ Bono reviews" monto={tabulador.bono} sub={`${reviews} reviews`} color="text-amber-400" />
      </div>

      {/* Progreso de reviews (gamificado) */}
      <section className="rounded-2xl p-4 space-y-2.5 bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/30">
        <div className="flex items-center justify-between">
          <p className="text-sm font-black text-amber-300 inline-flex items-center gap-1.5">
            <Star className="h-4 w-4 fill-amber-300" /> {reviews} reseñas
          </p>
          <p className="text-sm font-black tabular-nums text-amber-200">+{formatMoney(tabulador.bono, 'MXN')}</p>
        </div>
        <div className="h-2.5 rounded-full bg-black/40 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all"
            style={{ width: `${Math.max(4, progresoReviews)}%` }}
          />
        </div>
        <p className="text-[10px] text-amber-200/70">
          {siguienteHito - reviews === 10
            ? '⭐ ¡Suma tu primera reseña del periodo!'
            : `Faltan ${siguienteHito - reviews} para llegar a ${siguienteHito} 🎉 · cada reseña suma $50`}
        </p>
      </section>

      {/* Historial de reseñas */}
      {reviewsList.length > 0 && (
        <section className="space-y-2">
          <h3 className="label-caps inline-flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-400" /> Reseñas del periodo ({reviewsList.length})</h3>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {reviewsList.map((r) => (
              <li key={r.id} className="p-3 flex items-center gap-3">
                <span className="text-lg">⭐</span>
                <div className="flex-1 min-w-0 leading-tight">
                  <p className="text-sm font-medium text-white truncate">{r.servicio_nombre?.replace(/^⭐ /, '') || 'Reseña'}</p>
                  <p className="text-[10px] text-zinc-500">{formatearFecha(r.fecha, 'dd MMM')}{r.notas ? ` · ${r.notas}` : ''}</p>
                </div>
                <p className="text-sm font-bold tabular-nums text-amber-300">+{formatMoney(r.pago_comision, 'MXN')}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm('¿Eliminar esta reseña?')) return
                    start(async () => { await eliminarServicioClinica(r.id); toast.info('Eliminada') })
                  }}
                  className="h-7 w-7 rounded text-zinc-500 hover:text-rose-400 inline-flex items-center justify-center"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="label-caps">🩺 Servicios del periodo ({servicios.length})</h3>
        {servicios.length === 0 ? (
          <div className="card border-dashed p-6 text-center text-sm text-zinc-500">Sin servicios registrados en este periodo.</div>
        ) : (
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {servicios.map((r) => (
              <li key={r.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0 leading-tight">
                  <p className="text-sm font-medium text-white truncate">{r.servicio_nombre}</p>
                  <p className="text-[10px] text-zinc-500">
                    {formatearFecha(r.fecha, 'dd MMM')}{r.ubicacion ? ` · ${r.ubicacion}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-emerald-300">{formatMoney(r.pago_comision, 'MXN')}</p>
                  {r.propina > 0 && <p className="text-[10px] text-emerald-400 tabular-nums">+{formatMoney(r.propina, 'MXN')} prop</p>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm('¿Eliminar este registro?')) return
                    start(async () => { await eliminarServicioClinica(r.id); toast.info('Eliminado') })
                  }}
                  className="h-7 w-7 rounded text-zinc-500 hover:text-rose-400 inline-flex items-center justify-center"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Notificaciones (solo enfermera): para que reciba tareas de los socios */}
      {esEnfermera && (
        <section className="space-y-2">
          <h3 className="label-caps">🔔 Mis notificaciones</h3>
          <PushSection />
        </section>
      )}
    </div>
  )
}

function Linea({ label, monto, sub, color }: { label: string; monto: number; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg bg-black/30 p-2">
      <p className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums', color ?? 'text-white')}>{formatMoney(monto, 'MXN')}</p>
      {sub && <p className="text-[9px] text-zinc-600">{sub}</p>}
    </div>
  )
}

function RegistrarView({ servicios, esEnfermera }: { servicios: Servicio[]; esEnfermera: boolean }) {
  const [modo, setModo] = useState<'servicio' | 'resena'>('servicio')
  return (
    <div className="space-y-3">
      {esEnfermera && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-200">
          📸 Foto obligatoria como comprobante. Tu registro se envía a aprobación de Miguel/Sergio. Cuenta cuando lo aprueben.
        </div>
      )}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => setModo('servicio')}
          className={cn('h-9 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5', modo === 'servicio' ? 'bg-cyan-500 text-white shadow' : 'text-zinc-400')}
        >
          <Stethoscope className="h-3.5 w-3.5" /> Servicio
        </button>
        <button
          type="button"
          onClick={() => setModo('resena')}
          className={cn('h-9 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5', modo === 'resena' ? 'bg-amber-500 text-zinc-950 shadow' : 'text-zinc-400')}
        >
          <Star className="h-3.5 w-3.5" /> Reseña
        </button>
      </div>
      {modo === 'servicio' ? <ServicioForm servicios={servicios} esEnfermera={esEnfermera} /> : <ResenaForm esEnfermera={esEnfermera} />}
    </div>
  )
}

function ResenaForm({ esEnfermera = false }: { esEnfermera?: boolean }) {
  const [state, formAction, pending] = useActionState<ClinicaState, FormData>(registrarResenaClinica, {})
  useEffect(() => {
    if (state.ok) toast.success(esEnfermera ? 'Enviado a aprobación' : 'Reseña registrada', esEnfermera ? 'Patricia: espera que el admin apruebe' : 'Sumada al bono de la enfermera ⭐')
    else if (state.error) toast.error('Error', state.error)
  }, [state, esEnfermera])

  return (
    <form action={formAction} key={state.ok ? Math.random() : 'resena'} className="rounded-2xl p-4 space-y-3 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/30">
      <p className="text-sm font-bold text-amber-300 inline-flex items-center gap-1.5">
        <Star className="h-4 w-4 fill-amber-300" /> Registrar reseña ⭐
      </p>
      <p className="text-[11px] text-amber-200/70">Cada reseña suma al bono de Patricia en su tabulador.</p>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="label-caps">Fecha</label>
          <input name="fecha" type="date" required defaultValue={hoyEnCabos()} className="input-base w-full h-10 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="label-caps">Bono (MXN)</label>
          <input name="monto" type="text" inputMode="decimal" defaultValue="50" className="input-base w-full h-10 text-sm font-bold tabular-nums" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="label-caps">Cliente (opcional)</label>
        <input name="cliente" placeholder="Nombre del cliente que dejó la reseña" className="input-base w-full h-10 text-sm" />
      </div>

      <div className="space-y-1.5">
        <label className="label-caps">Nota (opcional)</label>
        <input name="nota" placeholder="Ej: 5 estrellas en Google" className="input-base w-full h-10 text-sm" />
      </div>

      <div className="space-y-1.5">
        <label className="label-caps">{esEnfermera ? '📸 Foto comprobante (obligatoria)' : '📸 Foto (opcional)'}</label>
        <input name="foto" type="file" accept="image/*" required={esEnfermera} className="text-xs text-zinc-300 file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-amber-500/20 file:text-amber-200 file:text-[11px] file:font-bold" />
      </div>

      {state.error && <p className="text-xs text-rose-400">{state.error}</p>}

      <button type="submit" disabled={pending} className="w-full h-10 text-sm rounded-xl font-bold bg-amber-500 text-zinc-950 inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4 fill-zinc-950" />}
        Registrar reseña
      </button>
    </form>
  )
}

function ServicioForm({ servicios, esEnfermera = false }: { servicios: Servicio[]; esEnfermera?: boolean }) {
  const [state, formAction, pending] = useActionState<ClinicaState, FormData>(registrarServicioClinica, {})
  const [servicioId, setServicioId] = useState('')
  const [fueraHorario, setFueraHorario] = useState(false)
  const [comisionStr, setComisionStr] = useState('')
  const sel = servicios.find((s) => s.id === servicioId)

  // Al cambiar servicio o toggle de horario, autocompleta la comisión correcta
  function aplicarServicio(id: string, fuera: boolean) {
    const s = servicios.find((x) => x.id === id)
    if (!s) { setComisionStr(''); return }
    const c = fuera ? (s.comision_fuera_horario ?? s.comision_enfermera) : s.comision_enfermera
    setComisionStr(c != null ? String(c) : '')
  }

  useEffect(() => {
    if (state.ok) toast.success('Servicio registrado')
    else if (state.error) toast.error('Error', state.error)
  }, [state])

  return (
    <form action={formAction} key={state.ok ? Math.random() : 'form'} className="card-glow p-4 space-y-3">
      <p className="text-sm font-bold text-cyan-300 inline-flex items-center gap-1.5">
        <Stethoscope className="h-4 w-4" /> Registrar servicio realizado
      </p>

      <div className="space-y-1.5">
        <label className="label-caps">Servicio del catálogo</label>
        <select
          name="servicio_id"
          value={servicioId}
          onChange={(e) => { setServicioId(e.target.value); aplicarServicio(e.target.value, fueraHorario) }}
          className="input-base w-full h-10 text-sm"
        >
          <option value="">— Elige o escribe abajo —</option>
          {servicios.map((s) => (
            <option key={s.id} value={s.id}>{CAT_LABEL[s.categoria]?.replace(/^[^ ]+ /, '') ?? s.categoria}: {s.nombre_es}</option>
          ))}
        </select>
      </div>

      {/* Toggle horario */}
      <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => { setFueraHorario(false); aplicarServicio(servicioId, false) }}
          className={cn('h-8 rounded text-[11px] font-bold', !fueraHorario ? 'bg-cyan-500 text-white' : 'text-zinc-400')}
        >
          ☀️ Horario normal
        </button>
        <button
          type="button"
          onClick={() => { setFueraHorario(true); aplicarServicio(servicioId, true) }}
          className={cn('h-8 rounded text-[11px] font-bold', fueraHorario ? 'bg-indigo-500 text-white' : 'text-zinc-400')}
        >
          🌙 Fuera de horario
        </button>
      </div>
      <input type="hidden" name="fuera_horario" value={fueraHorario ? '1' : '0'} />

      <input
        type="hidden" name="servicio_nombre"
        value={sel?.nombre_es ?? ''}
      />
      {!servicioId && (
        <div className="space-y-1.5">
          <label className="label-caps">O escribe el servicio</label>
          <input name="servicio_nombre" placeholder="Ej: IV Katherine, Lab móvil..." className="input-base w-full h-10 text-sm" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="label-caps">Fecha</label>
          <input name="fecha" type="date" required defaultValue={hoyEnCabos()} className="input-base w-full h-10 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="label-caps">Ubicación</label>
          <input name="ubicacion" placeholder="clínica, mobile, Katherine..." className="input-base w-full h-10 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="label-caps">Mi comisión (MXN)</label>
          <input
            name="pago_comision" type="text" inputMode="decimal" required
            value={comisionStr}
            onChange={(e) => setComisionStr(e.target.value)}
            placeholder="250" className="input-base w-full h-10 text-sm font-bold tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <label className="label-caps">Propina (MXN)</label>
          <input name="propina" type="text" inputMode="decimal" defaultValue="0" placeholder="0" className="input-base w-full h-10 text-sm tabular-nums" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="label-caps">Cobrado al cliente (opcional)</label>
        <input name="cobrado_cliente" type="text" inputMode="decimal" placeholder="0" className="input-base w-full h-10 text-sm tabular-nums" />
      </div>

      <div className="space-y-1.5">
        <label className="label-caps">Notas</label>
        <input name="notas" placeholder="opcional" className="input-base w-full h-10 text-sm" />
      </div>

      <div className="space-y-1.5">
        <label className="label-caps">{esEnfermera ? '📸 Foto comprobante (obligatoria)' : '📸 Foto (opcional)'}</label>
        <input name="foto" type="file" accept="image/*" required={esEnfermera} className="text-xs text-zinc-300 file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-cyan-500/20 file:text-cyan-200 file:text-[11px] file:font-bold" />
      </div>

      {state.error && <p className="text-xs text-rose-400">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full h-10 text-sm">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {esEnfermera ? 'Enviar a aprobación' : 'Registrar'}
      </button>
    </form>
  )
}

function CatalogoView({ servicios, fxRate }: { servicios: Servicio[]; fxRate: number }) {
  const cats = ['consulta', 'iv', 'lab', 'inyeccion', 'enfermeria', 'otro']
  return (
    <div className="space-y-3">
      {cats.map((cat) => {
        const items = servicios.filter((s) => s.categoria === cat)
        if (items.length === 0) return null
        return (
          <section key={cat} className="space-y-1.5">
            <h3 className="label-caps">{CAT_LABEL[cat]} ({items.length})</h3>
            <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
              {items.map((s) => (
                <li key={s.id} className="p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{s.nombre_es}</p>
                      {s.nombre_en && <p className="text-[10px] text-zinc-500">{s.nombre_en}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {s.precio_cliente != null && (
                        <>
                          <p className="text-sm font-bold tabular-nums text-cyan-300">
                            {formatMoney(s.precio_cliente, s.moneda_precio as 'MXN' | 'USD')}
                          </p>
                          {s.moneda_precio === 'USD' && (
                            <p className="text-[10px] text-zinc-500 tabular-nums">≈ {formatMoney(s.precio_cliente * fxRate, 'MXN')}</p>
                          )}
                        </>
                      )}
                      {s.comision_enfermera != null && (
                        <p className="text-[10px] text-emerald-400 tabular-nums">comisión {formatMoney(s.comision_enfermera, 'MXN')}</p>
                      )}
                    </div>
                  </div>
                  {s.ingredientes && <p className="text-[11px] text-zinc-400">🧪 {s.ingredientes}</p>}
                  {s.para_que_sirve && <p className="text-[11px] text-zinc-500">{s.para_que_sirve}</p>}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
