'use client'
import {useState} from 'react'
import {useRouter} from 'next/navigation'
import {anularVenta} from '@/app/(app)/transacciones/anular-venta'
export function AnularVenta({id,anulada}:{id:string;anulada:boolean}) {
 const [motivo,setMotivo]=useState('');const [error,setError]=useState('');const [pending,setPending]=useState(false);const router=useRouter()
 if(anulada)return <div className="card p-4 text-sm text-amber-200">Venta anulada. Conserva su evidencia; ya no suma ingresos y el stock se restituyó una sola vez.</div>
 return <form className="card space-y-3 p-4" onSubmit={async e=>{e.preventDefault();if(pending)return;setPending(true);try{const result=await anularVenta(id,motivo);if(result.error)setError(result.error);else router.refresh()}finally{setPending(false)}}}><p className="text-sm text-zinc-300">Para corregir esta venta, anúlala y registra una nueva. Se conserva el historial y se devuelve el stock.</p><label className="block text-xs text-zinc-400">Motivo de anulación<input value={motivo} onChange={e=>setMotivo(e.target.value)} required minLength={5} maxLength={500} className="input-base mt-1 w-full"/></label>{error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}<button disabled={pending} className="rounded-lg border border-rose-400/30 px-4 py-2 text-sm text-rose-300 disabled:opacity-50">{pending?'Anulando…':'Anular venta y devolver stock'}</button></form>
}
