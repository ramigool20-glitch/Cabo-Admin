'use client'

/**
 * Sheet de cobro del POS. 3 métodos: Efectivo (con cambio + denominaciones rápidas),
 * Mercado Pago (link automático), Tarjeta (marca manual).
 *
 * Al cobrar: llama crearVentaConItems que ya descontaba stock + calcula
 * ganancia automáticamente. Después abre el ticket PNG.
 */

import { useState, useEffect } from 'react'
import { X, Banknote, CreditCard, Smartphone, Loader2, CheckCircle2, Printer, Share2, DollarSign } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { crearVentaConItems } from '@/app/(app)/transacciones/venta-actions'
import { agregarACola } from '@/lib/pos/offline-queue'
import type { VentaItemInput } from '@/lib/ventas/items'

type Cuenta = { id: string; nombre: string; moneda: string; tipo: string }
type Metodo = 'efectivo' | 'efectivo_usd' | 'mp' | 'tarjeta'

const DENOMS_MXN = [50, 100, 200, 500, 1000]
const DENOMS_USD = [5, 10, 20, 50, 100]

export function CobroSheet({
  open,
  onClose,
  items,
  totalMxn,
  negocioId,
  cuentas,
  rate = 17,
  onSuccess,
  onOfflineQueued,
}: {
  open: boolean
  onClose: () => void
  items: VentaItemInput[]
  totalMxn: number
  negocioId: string
  cuentas: Cuenta[]
  rate?: number
  onSuccess: () => void
  onOfflineQueued?: () => void
}) {
  // Total en USD para mostrar siempre como referencia
  const totalUsd = totalMxn / rate
  const [metodo, setMetodo] = useState<Metodo>('efectivo')
  const [recibido, setRecibido] = useState<string>(String(Math.ceil(totalMxn)))
  const [cobrando, setCobrando] = useState(false)
  const [ventaId, setVentaId] = useState<string | null>(null)

  // Cuenta auto-seleccionada según método
  const cuentaSugerida = (m: Metodo): string => {
    const efectivoMxn = cuentas.find(c => /efectivo/i.test(c.nombre) && c.moneda === 'MXN')
    const efectivoUsd = cuentas.find(c => /efectivo/i.test(c.nombre) && c.moneda === 'USD')
    const mp = cuentas.find(c => /mp|mercado/i.test(c.nombre))
    const tarjeta = cuentas.find(c => /tarjeta|stripe|fiscal/i.test(c.nombre))
    if (m === 'efectivo') return efectivoMxn?.id ?? cuentas[0].id
    if (m === 'efectivo_usd') return efectivoUsd?.id ?? efectivoMxn?.id ?? cuentas[0].id
    if (m === 'mp') return mp?.id ?? cuentas[0].id
    if (m === 'tarjeta') return tarjeta?.id ?? cuentas[0].id
    return cuentas[0].id
  }
  const [cuentaId, setCuentaId] = useState<string>(cuentaSugerida('efectivo'))

  // Cuando cambias método, auto-selecciona cuenta + ajusta el "recibido" sugerido
  useEffect(() => {
    setCuentaId(cuentaSugerida(metodo))
    if (metodo === 'efectivo_usd') {
      setRecibido(String(Math.ceil(totalUsd)))
    } else if (metodo === 'efectivo') {
      setRecibido(String(Math.ceil(totalMxn)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metodo])

  // Bloquear scroll body
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const recibidoNum = Number(recibido) || 0
  // Para efectivo USD, todo está en USD. Para los demás, en MXN.
  const totalParaMetodo = metodo === 'efectivo_usd' ? totalUsd : totalMxn
  const cambio = Math.max(0, recibidoNum - totalParaMetodo)
  const faltante = Math.max(0, totalParaMetodo - recibidoNum)
  const monedaSimbolo = metodo === 'efectivo_usd' ? 'USD' : 'MXN'

  // Mapea método visual → metodo_pago de BD
  const metodoPagoBd = (): string => {
    if (metodo === 'efectivo') return 'efectivo_mxn'
    if (metodo === 'efectivo_usd') return 'efectivo_usd'
    if (metodo === 'mp') return 'mp_terminal'
    if (metodo === 'tarjeta') return 'tarjeta'
    return 'otro'
  }

  const cobrar = async () => {
    if (cobrando) return
    if ((metodo === 'efectivo' || metodo === 'efectivo_usd') && recibidoNum < totalParaMetodo) {
      return toast.error('Falta efectivo', `Recibido ${monedaSimbolo} ${recibidoNum} < total ${totalParaMetodo.toFixed(2)}`)
    }
    setCobrando(true)

    const conceptoLabel = metodo === 'efectivo' ? 'Efectivo MXN'
      : metodo === 'efectivo_usd' ? 'Efectivo USD'
      : metodo === 'mp' ? 'Mercado Pago' : 'Tarjeta'
    const notasCambio = (metodo === 'efectivo' || metodo === 'efectivo_usd') && cambio > 0
      ? `Recibido ${monedaSimbolo} ${recibidoNum} · cambio ${monedaSimbolo} ${cambio.toFixed(2)}` + (metodo === 'efectivo_usd' ? ` · TC ${rate.toFixed(2)}` : '')
      : null

    const input = {
      fecha: new Date().toISOString().slice(0, 10),
      negocio_id: negocioId,
      cuenta_id: cuentaId,
      metodo_pago: metodoPagoBd(),
      concepto: `POS · ${conceptoLabel}`,
      cliente_nombre: null,
      notas: notasCambio,
      items: items.map(i => ({
        producto_id: i.producto_id,
        nombre_snapshot: i.nombre_snapshot,
        codigo_barras_snapshot: i.codigo_barras_snapshot ?? null,
        categoria_snapshot: i.categoria_snapshot ?? null,
        costo_unitario_snapshot_mxn: i.costo_unitario_snapshot_mxn,
        cantidad: i.cantidad,
        precio_unitario_mxn: i.precio_unitario_mxn,
        descuento_pct: i.descuento_pct,
      })),
      descuento_global_pct: 0,
      descontar_stock: true,
      no_redirect: true,
      moneda_cobro: (metodo === 'efectivo_usd' ? 'USD' : 'MXN') as 'MXN' | 'USD',
    }

    // 🌐 OFFLINE: encola y muestra éxito local (sync automático al volver online)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        agregarACola(input)
        setVentaId('offline_' + Date.now())
        toast.success('📡 Sin internet — encolado', 'Se sincronizará al recuperar conexión')
        onOfflineQueued?.()
      } catch (e) {
        toast.error('No se pudo encolar', e instanceof Error ? e.message : '')
      }
      setCobrando(false)
      return
    }

    // 🌐 ONLINE: cobro normal
    try {
      const r = await crearVentaConItems(input)
      if (r?.error) {
        setCobrando(false)
        return toast.error('No se cobró', r.error)
      }
      if (r?.id) {
        setVentaId(r.id)
        toast.success('✓ Cobro registrado', '')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('NEXT_REDIRECT')) {
        toast.success('✓ Venta registrada', 'Revisa /transacciones')
        onSuccess()
        return
      }
      setCobrando(false)
      toast.error('Error', msg || 'Error desconocido')
    } finally {
      setCobrando(false)
    }
  }

  const cerrarTodo = () => {
    onSuccess()
  }

  const imprimirTicket = () => {
    if (!ventaId) return
    window.open(`/api/pos/ticket/${ventaId}/imagen`, '_blank')
  }

  const compartirTicket = async () => {
    if (!ventaId) return
    try {
      const res = await fetch(`/api/pos/ticket/${ventaId}/imagen`)
      const blob = await res.blob()
      const file = new File([blob], `ticket-${ventaId.slice(0, 8)}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Ticket de compra' })
      } else {
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')
      }
    } catch {
      toast.error('No se compartió', '')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ height: '100dvh' }}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={ventaId ? cerrarTodo : onClose} />

      <div className="relative w-full max-w-md max-h-[90dvh] bg-zinc-950 border border-emerald-500/30 rounded-2xl flex flex-col overflow-hidden mx-4">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-base font-black text-zinc-100 leading-tight">
              {ventaId ? '✓ Cobro exitoso' : 'Cobrar venta'}
            </p>
            <p className="text-[10px] text-zinc-500">{items.length} producto{items.length === 1 ? '' : 's'}</p>
          </div>
          <button onClick={ventaId ? cerrarTodo : onClose} className="h-9 w-9 rounded-full hover:bg-zinc-800 inline-flex items-center justify-center">
            <X className="h-5 w-5 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ overscrollBehavior: 'contain' }}>
          {/* Total destacado MXN + USD */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Total a cobrar</p>
            <p className="text-4xl font-black text-emerald-300 tabular-nums leading-none">
              {formatMoney(totalMxn, 'MXN')}
            </p>
            <p className="text-sm text-cyan-300/80 tabular-nums">
              🇺🇸 ${totalUsd.toFixed(2)} USD <span className="text-zinc-500">(TC ${rate.toFixed(2)})</span>
            </p>
          </div>

          {ventaId ? (
            // ─── ÉXITO ──────────────
            <div className="space-y-3 text-center">
              <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto" />
              <p className="text-sm text-zinc-300">
                {ventaId.startsWith('offline_')
                  ? '📡 Encolado offline · se sincronizará al recuperar internet'
                  : 'Stock descontado · ganancia calculada'}
              </p>
              {metodo === 'efectivo' && cambio > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-amber-200 font-bold">Cambio a entregar</p>
                  <p className="text-3xl font-black text-amber-300 tabular-nums">{formatMoney(cambio, 'MXN')}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <button
                  onClick={imprimirTicket}
                  className="h-12 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-bold inline-flex flex-col items-center justify-center gap-0.5 active:scale-95"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir
                </button>
                <button
                  onClick={compartirTicket}
                  className="h-12 rounded-xl bg-cyan-600 text-white text-xs font-bold inline-flex flex-col items-center justify-center gap-0.5 active:scale-95"
                >
                  <Share2 className="h-4 w-4" />
                  Compartir
                </button>
                <button
                  onClick={cerrarTodo}
                  className="h-12 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex flex-col items-center justify-center gap-0.5 active:scale-95"
                >
                  Nueva venta
                </button>
              </div>
            </div>
          ) : (
            // ─── COBRO ──────────────
            <>
              {/* Selector método — 4 opciones (incluye USD) */}
              <div className="grid grid-cols-4 gap-1.5">
                <MetodoButton activo={metodo === 'efectivo'}     onClick={() => setMetodo('efectivo')}     icon={<Banknote className="h-5 w-5" />}    label="MXN" />
                <MetodoButton activo={metodo === 'efectivo_usd'} onClick={() => setMetodo('efectivo_usd')} icon={<DollarSign className="h-5 w-5" />} label="USD" />
                <MetodoButton activo={metodo === 'mp'}           onClick={() => setMetodo('mp')}           icon={<Smartphone className="h-5 w-5" />}  label="MP" />
                <MetodoButton activo={metodo === 'tarjeta'}      onClick={() => setMetodo('tarjeta')}      icon={<CreditCard className="h-5 w-5" />}  label="Tarjeta" />
              </div>

              {/* Cuenta donde se asienta */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Cuenta del ingreso</label>
                <select
                  value={cuentaId}
                  onChange={e => setCuentaId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-zinc-700 bg-zinc-900 text-sm"
                >
                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              {/* Efectivo MXN o USD — shared UI */}
              {(metodo === 'efectivo' || metodo === 'efectivo_usd') && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                      Efectivo recibido ({monedaSimbolo})
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-lg">
                        {metodo === 'efectivo_usd' ? '🇺🇸 $' : '$'}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={recibido}
                        onChange={e => setRecibido(e.target.value)}
                        className={cn(
                          'w-full h-14 pr-4 rounded-xl border border-zinc-700 bg-zinc-900 text-2xl font-black tabular-nums focus:outline-none focus:ring-2',
                          metodo === 'efectivo_usd' ? 'pl-12 focus:ring-cyan-500' : 'pl-9 focus:ring-emerald-500'
                        )}
                      />
                    </div>
                  </div>

                  {/* Denominaciones rápidas según moneda */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => setRecibido(String(Math.ceil(totalParaMetodo)))}
                      className="h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs font-bold active:scale-95"
                    >
                      ${Math.ceil(totalParaMetodo)} (exacto)
                    </button>
                    {(metodo === 'efectivo_usd' ? DENOMS_USD : DENOMS_MXN).filter(d => d >= totalParaMetodo).slice(0, 5).map(d => (
                      <button
                        key={d}
                        onClick={() => setRecibido(String(d))}
                        className="h-10 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold tabular-nums active:scale-95"
                      >
                        ${d}
                      </button>
                    ))}
                  </div>

                  {/* Cambio o faltante */}
                  {recibidoNum >= totalParaMetodo ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider font-bold text-amber-200">Cambio ({monedaSimbolo})</span>
                      <span className="text-2xl font-black text-amber-300 tabular-nums">
                        {monedaSimbolo === 'USD' ? `🇺🇸 $${cambio.toFixed(2)}` : formatMoney(cambio, 'MXN')}
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider font-bold text-rose-200">Falta ({monedaSimbolo})</span>
                      <span className="text-2xl font-black text-rose-300 tabular-nums">
                        {monedaSimbolo === 'USD' ? `🇺🇸 $${faltante.toFixed(2)}` : formatMoney(faltante, 'MXN')}
                      </span>
                    </div>
                  )}

                  {/* Aviso USD */}
                  {metodo === 'efectivo_usd' && (
                    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2 text-[10px] text-cyan-200/80">
                      💡 La venta se registra en USD. Equivalencia MXN: <strong>{formatMoney(totalMxn, 'MXN')}</strong> al tipo de cambio de hoy (${rate.toFixed(2)})
                    </div>
                  )}
                </div>
              )}

              {/* Específico de MP */}
              {metodo === 'mp' && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 text-center space-y-2">
                  <Smartphone className="h-10 w-10 text-cyan-300 mx-auto" />
                  <p className="text-sm font-bold text-zinc-200">Cobro con Mercado Pago terminal</p>
                  <p className="text-[11px] text-zinc-500">Cobra desde tu terminal MP. El webhook va a confirmar automático cuando llegue. Tap "Cobrar" para registrar como recibido.</p>
                </div>
              )}

              {/* Específico de Tarjeta */}
              {metodo === 'tarjeta' && (
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 text-center space-y-2">
                  <CreditCard className="h-10 w-10 text-blue-300 mx-auto" />
                  <p className="text-sm font-bold text-zinc-200">Cobro con tarjeta</p>
                  <p className="text-[11px] text-zinc-500">Usa tu terminal externa. Cuando confirmes el cobro, tap "Cobrar".</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer: botón cobrar */}
        {!ventaId && (
          <div className="border-t border-zinc-800 p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <button
              type="button"
              onClick={cobrar}
              disabled={cobrando || (metodo === 'efectivo' && recibidoNum < totalMxn)}
              className={cn(
                'w-full h-14 rounded-xl text-white font-black text-base inline-flex items-center justify-center gap-2 disabled:opacity-30 active:scale-[0.98] shadow-lg',
                'bg-gradient-to-r from-emerald-600 to-cyan-600 shadow-emerald-500/30',
              )}
            >
              {cobrando ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  ✓ COBRAR {formatMoney(totalMxn, 'MXN')}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function MetodoButton({ activo, onClick, icon, label }: {
  activo: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border p-2.5 flex flex-col items-center justify-center gap-1 transition-all',
        activo
          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200 shadow-lg shadow-emerald-500/20'
          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
      )}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  )
}
