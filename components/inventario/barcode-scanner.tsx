'use client'

/**
 * Scanner de código de barras usando la cámara del teléfono.
 * Funciona en iOS Safari, Android Chrome, etc. (basado en zxing).
 *
 * Uso:
 *   <BarcodeScanner
 *     active={true}
 *     onResult={(code) => setCodigoBarras(code)}
 *     onClose={() => setScannerOpen(false)}
 *   />
 *
 * Pide acceso a la cámara, busca códigos en vivo. Cuando encuentra uno,
 * dispara onResult y opcionalmente cierra.
 */
import { useEffect, useRef, useState } from 'react'
import { X, Camera, Loader2, ScanLine } from 'lucide-react'
import { BrowserMultiFormatReader } from '@zxing/browser'

export function BarcodeScanner({
  active,
  onResult,
  onClose,
  autoClose = true,
}: {
  active: boolean
  onResult: (code: string) => void
  onClose: () => void
  /** Cierra el scanner después de detectar (true por default). */
  autoClose?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const [estado, setEstado] = useState<'iniciando' | 'escaneando' | 'detectado' | 'error'>('iniciando')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [ultimoCodigo, setUltimoCodigo] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false

    const start = async () => {
      try {
        readerRef.current = new BrowserMultiFormatReader()
        setEstado('iniciando')
        // Pedir cámara trasera (environment)
        const controls = await readerRef.current.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current!,
          (result, err) => {
            if (cancelled) return
            if (result) {
              const text = result.getText()
              setUltimoCodigo(text)
              setEstado('detectado')
              onResult(text)
              if (autoClose) {
                controls.stop()
                setTimeout(() => onClose(), 200)
              }
            }
            // No es necesario manejar NotFoundException — pasa todo el tiempo
          }
        )
        controlsRef.current = controls
        setEstado('escaneando')
      } catch (e) {
        if (cancelled) return
        setEstado('error')
        setErrorMsg(
          e instanceof Error
            ? e.message.includes('Permission')
              ? 'Da permiso de cámara a la app y vuelve a intentar'
              : e.message
            : 'No se pudo iniciar la cámara'
        )
      }
    }

    start()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [active, onResult, onClose, autoClose])

  if (!active) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="relative z-10 pt-safe-top px-4 py-3 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="text-white font-bold text-base inline-flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-emerald-400" />
          Escanea el código
        </h2>
        <button
          type="button"
          onClick={() => {
            controlsRef.current?.stop()
            onClose()
          }}
          className="h-10 w-10 rounded-full bg-zinc-900/80 text-white inline-flex items-center justify-center"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Video */}
      <div className="flex-1 relative overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

        {/* Overlay marco de escaneo */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-[85%] max-w-md aspect-[3/2]">
            {/* Esquinas del marco */}
            <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />
            {/* Línea de escaneo animada */}
            {estado === 'escaneando' && (
              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)] animate-pulse" />
            )}
          </div>
        </div>

        {/* Status bottom */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
          {estado === 'iniciando' && (
            <div className="flex items-center justify-center gap-2 text-zinc-300 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Activando cámara...
            </div>
          )}
          {estado === 'escaneando' && (
            <div className="text-center text-zinc-300 text-sm">
              <Camera className="h-4 w-4 inline mr-1 text-emerald-400" />
              Enfoca el código de barras en el cuadro
            </div>
          )}
          {estado === 'detectado' && ultimoCodigo && (
            <div className="text-center text-emerald-300 font-bold">
              ✓ Código: <span className="font-mono">{ultimoCodigo}</span>
            </div>
          )}
          {estado === 'error' && errorMsg && (
            <div className="text-center text-rose-300 text-sm bg-rose-900/30 rounded-lg p-3">
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
