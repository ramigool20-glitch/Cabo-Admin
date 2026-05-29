import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { hoyEnCabos, TZ } from '@/lib/fechas'
import { eventosDelMes } from '@/lib/calendario'
import { formatInTimeZone } from 'date-fns-tz'
import { CalendarioCliente } from '@/components/calendario/calendario-cliente'

type SearchParams = { ym?: string }  // formato 2026-05

function parseYM(ym?: string): { año: number; mes: number } {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [a, m] = ym.split('-').map(Number)
    return { año: a, mes: m - 1 }
  }
  // Mes actual según hora de Cabo (no UTC del servidor)
  const hoy = hoyEnCabos() // "2026-05-28"
  return { año: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) - 1 }
}

function fmtYM(año: number, mes: number): string {
  return `${año}-${String(mes + 1).padStart(2, '0')}`
}

export default async function CalendarioPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const { año, mes } = parseYM(sp.ym)

  const eventos = await eventosDelMes(año, mes)
  const hoy = hoyEnCabos()

  const inicio = new Date(año, mes, 1)
  const fin = new Date(año, mes + 1, 0)
  const diasMes = fin.getDate()
  const primerDiaSemana = inicio.getDay() // 0=dom

  // Matriz de la grid (celdas vacías al inicio)
  const celdas: { dia: number | null; fecha: string | null }[] = []
  for (let i = 0; i < primerDiaSemana; i++) celdas.push({ dia: null, fecha: null })
  for (let d = 1; d <= diasMes; d++) {
    const fecha = `${año}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    celdas.push({ dia: d, fecha })
  }

  const prevMes = mes === 0 ? { año: año - 1, mes: 11 } : { año, mes: mes - 1 }
  const nextMes = mes === 11 ? { año: año + 1, mes: 0 } : { año, mes: mes + 1 }
  const tituloMes = formatInTimeZone(inicio, TZ, 'MMMM yyyy')
  const esMesActual = fmtYM(año, mes) === hoy.slice(0, 7)

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient">Calendario</h1>
          <span className="chip">{eventos.length} eventos</span>
        </div>
        <p className="text-sm text-zinc-400">Todos los pagos, eventos, vencimientos y tareas del mes.</p>
      </header>

      {/* Navegación de mes */}
      <div className="flex items-center justify-between card p-3">
        <Link
          href={`/calendario?ym=${fmtYM(prevMes.año, prevMes.mes)}`}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-cyan-400"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="text-center leading-tight">
          <p className="text-base font-bold text-white capitalize">{tituloMes}</p>
          {!esMesActual && (
            <Link href="/calendario" className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300">
              ← Volver a hoy
            </Link>
          )}
        </div>
        <Link
          href={`/calendario?ym=${fmtYM(nextMes.año, nextMes.mes)}`}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-cyan-400"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>

      <CalendarioCliente eventos={eventos} celdas={celdas} hoy={hoy} />
    </div>
  )
}
