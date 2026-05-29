'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Sparkles, Brain, MessageSquare, Check, Archive, MessageCircle, Trash2, Plus, Loader2, ExternalLink } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { formatInTimeZone } from 'date-fns-tz'
import { TZ } from '@/lib/fechas'
import { toast } from '@/components/ui/toast'
import { AuditorClient } from './auditor-client'
import { marcarObservacion, responderPendiente, agregarMemoria, borrarMemoria } from '@/app/(app)/auditor/actions'

export type Observacion = {
  id: string
  severidad: 'grave' | 'atencion' | 'bien'
  titulo: string
  detalle: string | null
  recomendacion: string | null
  categoria: string | null
  datos: { link?: string } | null
  estado: string
  created_at: string
}
export type Pendiente = { id: string; pregunta: string; prioridad: 'alta' | 'media' | 'baja'; contexto: string | null; created_at: string }
export type MemoriaItem = { id: string; tipo: string; contenido: string; importancia: number; created_at: string }
export type Pulso = { utilidadMes: number; graves: number; atencion: number; preguntas: number }

const SEV: Record<Observacion['severidad'], { label: string; border: string; chip: string }> = {
  grave:    { label: '🔴 Graves',    border: 'border-rose-500/40',    chip: 'text-rose-300' },
  atencion: { label: '🟡 Atención',  border: 'border-amber-500/40',   chip: 'text-amber-300' },
  bien:     { label: '🟢 Bien',      border: 'border-emerald-500/40', chip: 'text-emerald-300' },
}

export function AuditorTabs({
  observaciones, pendientes, memoria, pulso, bienvenida,
}: {
  observaciones: Observacion[]
  pendientes: Pendiente[]
  memoria: MemoriaItem[]
  pulso: Pulso
  bienvenida: string
}) {
  const [tab, setTab] = useState<'highlights' | 'chat' | 'memoria'>('highlights')
  const [seed, setSeed] = useState<{ texto: string; nonce: number }>()
  const [obs, setObs] = useState(observaciones)

  const hablarDeEsto = (o: Observacion) => {
    setSeed({ texto: `Sobre "${o.titulo}": `, nonce: Date.now() })
    setTab('chat')
  }

  const totalAbiertas = obs.length + pendientes.length

  return (
    <div className="flex flex-col w-full">
      {/* Tabs */}
      <div className="px-4 grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] mx-4 mb-3">
        <TabBtn active={tab === 'highlights'} onClick={() => setTab('highlights')} icon={Sparkles} label="Highlights" badge={totalAbiertas} />
        <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')} icon={MessageSquare} label="Chat" />
        <TabBtn active={tab === 'memoria'} onClick={() => setTab('memoria')} icon={Brain} label="Memoria" badge={memoria.length} />
      </div>

      {tab === 'highlights' && (
        <HighlightsView obs={obs} setObs={setObs} pendientes={pendientes} pulso={pulso} onHablar={hablarDeEsto} memoriaCount={memoria.length} onVerMemoria={() => setTab('memoria')} />
      )}
      {tab === 'chat' && <AuditorClient bienvenidaInicial={bienvenida} seed={seed} />}
      {tab === 'memoria' && <MemoriaView memoria={memoria} />}
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label, badge }: { active: boolean; onClick: () => void; icon: typeof Sparkles; label: string; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold', active ? 'bg-cyan-500 text-white shadow' : 'text-zinc-400')}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
      {badge ? <span className={cn('ml-0.5 px-1.5 rounded-full text-[10px]', active ? 'bg-white/25' : 'bg-zinc-700')}>{badge}</span> : null}
    </button>
  )
}

function HighlightsView({
  obs, setObs, pendientes, pulso, onHablar, memoriaCount, onVerMemoria,
}: {
  obs: Observacion[]
  setObs: React.Dispatch<React.SetStateAction<Observacion[]>>
  pendientes: Pendiente[]
  pulso: Pulso
  onHablar: (o: Observacion) => void
  memoriaCount: number
  onVerMemoria: () => void
}) {
  const [preguntas, setPreguntas] = useState(pendientes)
  const grupos: Observacion['severidad'][] = ['grave', 'atencion', 'bien']

  return (
    <div className="px-4 pb-28 space-y-4">
      {/* Pulso de hoy */}
      <section className="rounded-2xl p-4 bg-gradient-to-br from-cyan-500/15 to-emerald-500/5 border border-cyan-500/30 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-cyan-300">⚡ Pulso de hoy</p>
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-zinc-400">Utilidad del mes</span>
          <span className={cn('text-xl font-black tabular-nums', pulso.utilidadMes >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
            {pulso.utilidadMes >= 0 ? '+' : ''}{formatMoney(pulso.utilidadMes, 'MXN')}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300">{pulso.graves} graves</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">{pulso.atencion} atención</span>
          <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">{preguntas.length} preguntas</span>
        </div>
      </section>

      {/* Observaciones por gravedad */}
      {grupos.map((sev) => {
        const items = obs.filter((o) => o.severidad === sev)
        if (items.length === 0) return null
        return (
          <section key={sev} className="space-y-2">
            <h2 className={cn('text-sm font-bold', SEV[sev].chip)}>{SEV[sev].label} ({items.length})</h2>
            <div className="space-y-2">
              {items.map((o) => (
                <ObservacionCard key={o.id} o={o} onHablar={onHablar} onQuitar={(id) => setObs((p) => p.filter((x) => x.id !== id))} />
              ))}
            </div>
          </section>
        )
      })}

      {obs.length === 0 && (
        <div className="card border-dashed p-8 text-center text-sm text-zinc-500">
          Sin observaciones abiertas. El auditor revisa tus datos 3 veces al día. 🧠
        </div>
      )}

      {/* Preguntas del auditor */}
      {preguntas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-cyan-300">❓ Preguntas del auditor ({preguntas.length})</h2>
          <div className="space-y-2">
            {preguntas.map((p) => (
              <PreguntaCard key={p.id} p={p} onCerrar={(id) => setPreguntas((prev) => prev.filter((x) => x.id !== id))} />
            ))}
          </div>
        </section>
      )}

      {/* Acceso a memoria */}
      <button type="button" onClick={onVerMemoria} className="w-full card p-3 flex items-center gap-3 hover:bg-[var(--bg-card-hover)]">
        <Brain className="h-5 w-5 text-purple-400" />
        <span className="flex-1 text-left text-sm text-zinc-300">🧠 Memoria del auditor</span>
        <span className="text-xs text-zinc-500">{memoriaCount} aprendidas ›</span>
      </button>
    </div>
  )
}

function ObservacionCard({ o, onHablar, onQuitar }: { o: Observacion; onHablar: (o: Observacion) => void; onQuitar: (id: string) => void }) {
  const [pending, start] = useTransition()
  const link = o.datos?.link

  const accion = (estado: 'resuelta' | 'archivada') => {
    start(async () => {
      const res = await marcarObservacion(o.id, estado)
      if (res.ok) { onQuitar(o.id); toast.success(estado === 'resuelta' ? '✓ Resuelta' : 'Archivada') }
      else toast.error('Error', res.error)
    })
  }

  return (
    <div className={cn('rounded-xl border bg-[var(--bg-card)] p-3 space-y-2', SEV[o.severidad].border)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-white leading-snug">{o.titulo}</p>
        {link && (
          <Link href={link} className="text-zinc-500 hover:text-cyan-400 shrink-0"><ExternalLink className="h-4 w-4" /></Link>
        )}
      </div>
      {o.detalle && <p className="text-xs text-zinc-400 leading-snug">{o.detalle}</p>}
      {o.recomendacion && <p className="text-[11px] text-cyan-300">💡 {o.recomendacion}</p>}
      <div className="flex items-center gap-1.5 pt-1">
        <button type="button" disabled={pending} onClick={() => accion('resuelta')} className="h-8 px-2.5 rounded-lg border border-emerald-500/30 text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50">
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Listo
        </button>
        <button type="button" disabled={pending} onClick={() => accion('archivada')} className="h-8 px-2.5 rounded-lg border border-zinc-700 text-zinc-400 text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50">
          <Archive className="h-3 w-3" /> Archivar
        </button>
        <button type="button" onClick={() => onHablar(o)} className="h-8 px-2.5 rounded-lg border border-cyan-500/30 text-cyan-300 text-[11px] font-bold inline-flex items-center gap-1">
          <MessageCircle className="h-3 w-3" /> Hablar de esto
        </button>
      </div>
    </div>
  )
}

function PreguntaCard({ p, onCerrar }: { p: Pendiente; onCerrar: (id: string) => void }) {
  const [respuesta, setRespuesta] = useState('')
  const [pending, start] = useTransition()

  const responder = () => {
    start(async () => {
      const res = await responderPendiente(p.id, respuesta)
      if (res.ok) { onCerrar(p.id); toast.success('✓ Respondido', 'El auditor lo guardó en su memoria') }
      else toast.error('Error', res.error)
    })
  }

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-[var(--bg-card)] p-3 space-y-2">
      <p className="text-sm font-medium text-white leading-snug">{p.pregunta}</p>
      {p.contexto && <p className="text-[11px] text-zinc-500">{p.contexto}</p>}
      <div className="flex items-center gap-1.5">
        <input
          value={respuesta}
          onChange={(e) => setRespuesta(e.target.value)}
          placeholder="Tu respuesta…"
          className="input-base flex-1 h-9 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter' && respuesta.trim()) responder() }}
        />
        <button type="button" disabled={pending || !respuesta.trim()} onClick={responder} className="btn-primary h-9 px-3 text-xs disabled:opacity-50">
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Responder'}
        </button>
        <button type="button" onClick={() => onCerrar(p.id)} className="h-9 w-9 rounded-lg text-zinc-500 hover:text-zinc-300 inline-flex items-center justify-center text-xs">✕</button>
      </div>
    </div>
  )
}

function MemoriaView({ memoria }: { memoria: MemoriaItem[] }) {
  const [items, setItems] = useState(memoria)
  const [nuevo, setNuevo] = useState('')
  const [pending, start] = useTransition()

  const agregar = () => {
    start(async () => {
      const res = await agregarMemoria(nuevo)
      if (res.ok) { setNuevo(''); toast.success('Guardado en memoria'); location.reload() }
      else toast.error('Error', res.error)
    })
  }
  const borrar = (id: string) => {
    start(async () => {
      const res = await borrarMemoria(id)
      if (res.ok) { setItems((p) => p.filter((x) => x.id !== id)); toast.info('Olvidado') }
      else toast.error('Error', res.error)
    })
  }

  return (
    <div className="px-4 pb-28 space-y-3">
      <p className="text-xs text-zinc-400">Lo que el auditor ha aprendido de ti y de tus respuestas. Lo usa para afinar sus observaciones.</p>

      <div className="flex items-center gap-1.5">
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="Enséñale algo (ej: la luz de CVU la paga Sergio)"
          className="input-base flex-1 h-10 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter' && nuevo.trim()) agregar() }}
        />
        <button type="button" disabled={pending || !nuevo.trim()} onClick={agregar} className="btn-primary h-10 px-3 text-sm disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card border-dashed p-8 text-center text-sm text-zinc-500">Aún no aprende nada. Respóndele preguntas o enséñale arriba.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id} className="card p-3 flex items-start gap-3">
              <span className="text-sm shrink-0">{m.tipo === 'feedback' ? '🗣️' : m.tipo === 'alerta' ? '⚠️' : m.tipo === 'preferencia' ? '⭐' : '🧠'}</span>
              <div className="flex-1 min-w-0 leading-tight">
                <p className="text-sm text-white">{m.contenido}</p>
                <p className="text-[10px] text-zinc-600">{formatInTimeZone(new Date(m.created_at), TZ, 'dd MMM yyyy')} · imp. {m.importancia}</p>
              </div>
              <button type="button" onClick={() => borrar(m.id)} className="h-7 w-7 rounded text-zinc-500 hover:text-rose-400 inline-flex items-center justify-center shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
