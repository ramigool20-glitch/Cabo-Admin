'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Camera, ScanLine, ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { BarcodeScanner } from '@/components/inventario/barcode-scanner'

const EMOJI_CAT: Record<string, string> = {
  GENERICO: '💊', PATENTE: '🏥', OTC: '🩹',
  'Cuidado Personal': '🧴', Bebidas: '🥤',
  'Departamento de bebe': '👶', Antiácido: '🌿',
  Choco: '🍫',
}

export function NuevoProductoClient({ categorias }: { categorias: string[] }) {
  const router = useRouter()
  const [scannerOpen, setScannerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [yaExiste, setYaExiste] = useState<{ id: string; nombre: string } | null>(null)
  const [sugiriendo, setSugiriendo] = useState(false)
  const [sugerenciaIA, setSugerenciaIA] = useState<{
    nombre: string | null
    categoria_sugerida: string | null
    precio_estimado_mxn: number | null
    descripcion: string | null
    confianza: 'alta' | 'media' | 'baja'
  } | null>(null)

  // Form
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [stock, setStock] = useState('1')
  const [categoria, setCategoria] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')

  const pedirSugerenciaIA = async (code: string) => {
    setSugiriendo(true)
    setSugerenciaIA(null)
    try {
      const r = await fetch('/api/ai/sugerir-producto-codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: code, categorias }),
      })
      const data = await r.json()
      if (r.ok && data.sugerencia) {
        setSugerenciaIA(data.sugerencia)
        if (data.sugerencia.confianza !== 'baja') {
          toast.success('IA identificó el producto', 'Tap "Usar sugerencia" para llenar')
        }
      }
    } catch {
      // silent fail — el usuario llena manual
    } finally {
      setSugiriendo(false)
    }
  }

  const aplicarSugerencia = () => {
    if (!sugerenciaIA) return
    if (sugerenciaIA.nombre) setNombre(sugerenciaIA.nombre)
    if (sugerenciaIA.precio_estimado_mxn != null) setPrecio(String(sugerenciaIA.precio_estimado_mxn))
    // Solo aplica categoría si ya existe en la lista (no inventamos)
    if (sugerenciaIA.categoria_sugerida && categorias.includes(sugerenciaIA.categoria_sugerida)) {
      setCategoria(sugerenciaIA.categoria_sugerida)
    }
    setSugerenciaIA(null)
    toast.success('Aplicado', 'Revisa precio y categoría antes de guardar')
  }

  const onScanResult = async (code: string) => {
    setCodigoBarras(code)
    toast.success('Código escaneado', code)
    // Verificar si ya existe en BD
    let yaExisteEnBd = false
    try {
      const res = await fetch(`/api/inventario/buscar-codigo?code=${encodeURIComponent(code)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.producto) {
          setYaExiste(data.producto)
          yaExisteEnBd = true
        }
      }
    } catch {}
    // Si no existe, pedirle a IA que sugiera (best-effort, no bloquea)
    if (!yaExisteEnBd) {
      pedirSugerenciaIA(code)
    }
  }

  const onGuardar = async () => {
    if (!nombre.trim()) {
      toast.error('Falta', 'Pon el nombre del producto')
      return
    }
    const precioNum = Number(precio)
    if (isNaN(precioNum) || precioNum < 0) {
      toast.error('Falta', 'Pon un precio válido')
      return
    }
    const stockNum = Number(stock) || 0

    setBusy(true)
    try {
      const res = await fetch('/api/inventario/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          precio_mxn: precioNum,
          stock: stockNum,
          categoria: categoria || null,
          codigo_barras: codigoBarras || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error desconocido')
      toast.success('Producto creado', nombre)
      router.push('/inventario')
      router.refresh()
    } catch (e) {
      toast.error('No se creó', e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="space-y-5">
        {/* Botón gigante de escáner */}
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="w-full p-6 rounded-2xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 inline-flex flex-col items-center justify-center gap-2 hover:bg-emerald-500/10 active:scale-[0.98] transition-all"
        >
          <ScanLine className="h-10 w-10 text-emerald-400" />
          <span className="text-base font-bold text-emerald-300">Escanear código de barras</span>
          <span className="text-[11px] text-zinc-500">Con la cámara del teléfono</span>
        </button>

        {/* Sugerencia IA */}
        {sugiriendo && (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            <span className="text-sm text-cyan-200">Identificando producto con IA…</span>
          </div>
        )}
        {sugerenciaIA && sugerenciaIA.nombre && !yaExiste && (
          <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-emerald-500/5 to-transparent p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                IA sugiere
              </span>
              <span className={`ml-auto text-[10px] font-bold rounded-full px-2 py-0.5 ${
                sugerenciaIA.confianza === 'alta' ? 'bg-emerald-500/20 text-emerald-200' :
                sugerenciaIA.confianza === 'media' ? 'bg-amber-500/20 text-amber-200' :
                'bg-zinc-700/50 text-zinc-400'
              }`}>
                {sugerenciaIA.confianza}
              </span>
            </div>
            <p className="text-sm font-bold text-zinc-100 leading-tight">{sugerenciaIA.nombre}</p>
            <div className="flex flex-wrap gap-2 text-[11px]">
              {sugerenciaIA.categoria_sugerida && (
                <span className="rounded-md bg-zinc-800/60 px-2 py-0.5 text-zinc-300">
                  {EMOJI_CAT[sugerenciaIA.categoria_sugerida] ?? '📦'} {sugerenciaIA.categoria_sugerida}
                </span>
              )}
              {sugerenciaIA.precio_estimado_mxn != null && (
                <span className="rounded-md bg-emerald-500/10 text-emerald-200 px-2 py-0.5 font-mono">
                  ~${sugerenciaIA.precio_estimado_mxn.toLocaleString('es-MX')} MXN
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={aplicarSugerencia}
              className="w-full h-9 rounded-lg bg-cyan-600 text-white text-xs font-bold active:scale-[0.98]"
            >
              Usar sugerencia
            </button>
            <p className="text-[10px] text-zinc-500 leading-tight">
              Revisa y ajusta antes de guardar — la IA puede equivocarse en precios.
            </p>
          </div>
        )}

        {/* Aviso si el código ya existe */}
        {yaExiste && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <p className="text-sm font-bold text-amber-200">
              ⚠ Este código ya está registrado:
            </p>
            <p className="text-sm text-zinc-200 truncate">{yaExiste.nombre}</p>
            <Link
              href={`/inventario?q=${encodeURIComponent(yaExiste.nombre)}`}
              className="inline-flex items-center gap-1 text-cyan-400 text-xs font-medium"
            >
              <ExternalLink className="h-3 w-3" />
              Ver producto existente
            </Link>
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">
          <Field label="Nombre del producto" required>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Paracetamol 500mg 10 tabletas"
              className="input-base w-full h-12 px-3"
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio MXN" required>
              <input
                type="text"
                inputMode="decimal"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0.00"
                className="input-base w-full h-12 px-3 text-xl font-bold tabular-nums"
              />
            </Field>

            <Field label="Stock inicial">
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="input-base w-full h-12 px-3 text-xl font-bold tabular-nums"
              />
            </Field>
          </div>

          <Field label="Categoría">
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="input-base w-full h-12 px-3"
            >
              <option value="">— Sin categoría —</option>
              {categorias.map((c) => (
                <option key={c} value={c}>{EMOJI_CAT[c] ?? '📦'} {c}</option>
              ))}
            </select>
          </Field>

          <Field label="Código de barras">
            <div className="relative">
              <input
                type="text"
                value={codigoBarras}
                onChange={(e) => setCodigoBarras(e.target.value)}
                placeholder="Manual o escanea con la cámara"
                className="input-base w-full h-12 px-3 pr-12 font-mono"
              />
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md bg-emerald-500/20 text-emerald-300 inline-flex items-center justify-center"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
          </Field>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={onGuardar}
          disabled={busy || !nombre.trim() || !precio}
          className="w-full h-14 rounded-2xl bg-emerald-600 text-white font-bold text-base inline-flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Crear producto'}
        </button>
      </div>

      {/* Scanner */}
      <BarcodeScanner
        active={scannerOpen}
        onResult={onScanResult}
        onClose={() => setScannerOpen(false)}
        autoClose={true}
      />
    </>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
        {label}
        {required && <span className="text-rose-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}
