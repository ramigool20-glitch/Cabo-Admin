'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, Building2, ChevronRight, Globe2, Layers3, Plus, Search, Wallet, X } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'

type Business = {id:string;nombre:string;tipo:string;url:string|null;color_primario:string|null;moneda_principal:string;ingresos:number;gastos:number;resultado:number;movimientos:number}
const labels:Record<string,string> = {farmacia:'Farmacia física',consultorio:'Clínica',pagina_digital:'Negocio digital',general:'Gastos generales',casa:'Personal'}
const groups = [{id:'todos',label:'Todos'},{id:'salud',label:'Salud y farmacias'},{id:'digital',label:'Otros negocios'},{id:'interno',label:'Personal y general'}]
function group(b:Business){if(['general','casa'].includes(b.tipo))return 'interno';if(b.tipo==='farmacia'||b.tipo==='consultorio'||/pharmacy|care|therapy/i.test(b.nombre))return 'salud';return 'digital'}
function domain(value:string|null){if(!value)return null;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.hostname:null}catch{return null}}

export function BusinessPortfolio({businesses,desde}:{businesses:Business[];desde:string}) {
  const [search,setSearch]=useState('')
  const [filter,setFilter]=useState('todos')
  const operating=businesses.filter(b=>group(b)!=='interno')
  const total=operating.reduce((s,b)=>({ingresos:s.ingresos+b.ingresos,gastos:s.gastos+b.gastos,resultado:s.resultado+b.resultado}),{ingresos:0,gastos:0,resultado:0})
  const filtered=useMemo(()=>businesses.filter(b=>(filter==='todos'||group(b)===filter)&&`${b.nombre} ${b.url??''}`.toLowerCase().includes(search.trim().toLowerCase())),[businesses,filter,search])
  const date=new Date(`${desde}T12:00:00`).toLocaleDateString('es-MX',{day:'numeric',month:'long'})
  return <div className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 sm:px-6 sm:pt-8 space-y-6">
    <header className="relative overflow-hidden rounded-[28px] border border-teal-300/15 bg-[#0a1922] p-6 sm:p-8">
      <div aria-hidden="true" className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl"/>
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-300"><span className="h-1.5 w-1.5 rounded-full bg-teal-300"/> Tu portafolio · Cabo Admin</div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">Mis negocios<span className="text-teal-300">.</span></h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-400">Una vista clara de cada marca. Registra, compara y decide con tus números.</p>
        </div>
        <Link href="/transacciones/nueva" className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-teal-300 px-4 py-3 text-sm font-bold text-[#063b38] transition-colors hover:bg-teal-200"><Plus size={17}/> Registrar movimiento</Link>
      </div>
      <div className="relative mt-7 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 sm:grid-cols-4">
        <Metric label="Negocios activos" value={String(operating.length)} icon={<Building2 size={15}/>}/>
        <Metric label="Ingresos" value={formatMoney(total.ingresos,'MXN')} icon={<ArrowDownLeft size={15}/>} color="text-teal-200"/>
        <Metric label="Gastos" value={formatMoney(total.gastos,'MXN')} icon={<ArrowUpRight size={15}/>} color="text-rose-200"/>
        <Metric label="Resultado" value={formatMoney(total.resultado,'MXN')} icon={<Wallet size={15}/>} color={total.resultado<0?'text-rose-200':'text-white'}/>
      </div>
      <p className="relative mt-4 text-[11px] text-slate-500">Desde el {date} · importes en MXN · personal y general se muestran por separado.</p>
    </header>
    <section aria-label="Filtrar negocios" className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div><h2 className="text-lg font-semibold text-white">Tus marcas y espacios</h2><p className="mt-1 text-xs text-slate-500">{businesses.length} espacios disponibles para tu operación.</p></div>
        <div className="relative w-full md:w-72"><Search className="absolute left-3.5 top-3.5 text-slate-500" size={16}/><input aria-label="Buscar negocio o dominio" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar marca o dominio" className="w-full rounded-xl border border-white/10 bg-white/[0.035] py-3 pl-10 pr-10 text-sm text-white outline-none transition-colors focus:border-teal-300/50"/>{search&&<button type="button" aria-label="Limpiar búsqueda" onClick={()=>setSearch('')} className="absolute right-3 top-3 text-slate-400"><X size={18}/></button>}</div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Tipo de negocio">{groups.map(g=><button key={g.id} type="button" aria-pressed={filter===g.id} onClick={()=>setFilter(g.id)} className={cn('shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition-colors',filter===g.id?'border-teal-300/30 bg-teal-300/10 text-teal-200':'border-white/10 text-slate-400 hover:border-white/25 hover:text-white')}>{g.label}</button>)}</div>
    </section>
    {filtered.length===0?<div className="rounded-2xl border border-dashed border-white/15 p-12 text-center"><Search size={24} className="mx-auto mb-3 text-slate-500"/><p className="text-sm text-slate-300">No encontramos negocios con esa búsqueda.</p><button onClick={()=>{setSearch('');setFilter('todos')}} className="mt-3 text-sm text-teal-300">Ver todos</button></div>:
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(b=><BusinessCard key={b.id} business={b}/>)}</div>}
    <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs leading-relaxed text-slate-500"><Layers3 size={17} className="shrink-0 text-slate-400"/><p>Nueva etapa desde cero. El único movimiento inicial registrado es Google Ads por $1,200 MXN para IV Therapy Cabo.</p></div>
  </div>
}
function Metric({label,value,icon,color='text-white'}:{label:string;value:string;icon:React.ReactNode;color?:string}){return <div><p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">{icon}{label}</p><p className={cn('mt-2 text-xl sm:text-2xl font-semibold tracking-tight tabular-nums',color)}>{value}</p></div>}
function BusinessCard({business:b}:{business:Business}) {
  const host=domain(b.url);const color=/^#[0-9a-f]{6}$/i.test(b.color_primario??'')?b.color_primario!:'#5eead4'
  const initials=b.nombre.split(' ').filter(w=>!['in','de','online'].includes(w.toLowerCase())).slice(0,2).map(w=>w[0]).join('')
  return <article className="group relative flex flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#101923] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl hover:shadow-black/20">
    <div className="h-0.5 w-full opacity-80" style={{background:`linear-gradient(90deg,${color},transparent)`}}/>
    <div className="flex flex-1 flex-col p-5">
      <div className="mb-6 flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-sm font-bold tracking-tight" style={{color,backgroundColor:color+'10',borderColor:color+'25'}}>{initials}</div><div className="min-w-0"><Link href={`/negocios/${b.id}`} className="block text-base font-semibold leading-tight text-white hover:text-teal-200">{b.nombre}</Link><p className="mt-1.5 text-[11px] text-slate-500">{labels[b.tipo]??'Negocio'}</p></div></div><span title="Negocio activo" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{background:color}}/></div>
      <div className="mb-5"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Resultado del periodo</p><p className={cn('mt-2 text-[28px] leading-none font-semibold tracking-tight tabular-nums',b.movimientos===0?'text-slate-300':b.resultado<0?'text-rose-300':'text-teal-200')}>{formatMoney(b.resultado,'MXN')}</p><p className="mt-2 text-[11px] text-slate-500">{b.movimientos===0?'Listo para tu primer movimiento':`${b.movimientos} movimiento${b.movimientos===1?'':'s'} registrado${b.movimientos===1?'':'s'}`}</p></div>
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-black/15 p-3"><div><p className="text-[10px] text-slate-500">Ingresos</p><p className="mt-1 text-sm font-medium tabular-nums text-teal-200">{formatMoney(b.ingresos,'MXN')}</p></div><div><p className="text-[10px] text-slate-500">Gastos</p><p className="mt-1 text-sm font-medium tabular-nums text-rose-200">{formatMoney(b.gastos,'MXN')}</p></div></div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">{host?<a href={`https://${host}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500 hover:text-white"><Globe2 size={12} className="shrink-0"/><span className="truncate">{host}</span><ArrowUpRight size={11} className="shrink-0"/></a>:<span className="text-[11px] text-slate-600">Espacio interno</span>}<Link href={`/negocios/${b.id}`} aria-label={`Abrir ${b.nombre}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-teal-300 hover:text-teal-100">Abrir<ChevronRight size={14}/></Link></div>
    </div>
  </article>
}
