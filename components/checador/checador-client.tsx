'use client'

/**
 * Checador con biometría (Touch ID/Face ID via Web Authn / Credential Mgmt API).
 *
 * Flujo:
 *   1. Usuario tap "Checar entrada" o "Checar salida"
 *   2. Si el navegador soporta biométrico → prompt huella/face
 *   3. Si autoriza → registra checada
 *   4. Si llega tarde + retardo: aviso "Llegaste X min tarde"
 *   5. Si 3 retardos en el mes: aviso "Multa aplicada"
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Fingerprint, Clock, CheckCircle2, AlertTriangle, Loader2, Calendar, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { crearChecada } from '@/app/(app)/checador/actions'
import { verificarHuella } from '@/app/(app)/checador/huellas-actions'

type Horario = {
  hora_entrada: string
  hora_salida: string
  tolerancia_minutos: number
  retardos_para_multa: number
  monto_multa_mxn: number
} | null

type Checada = {
  id: string
  tipo: string
  timestamp_at: string
  retardo_minutos: number
  es_retardo: boolean
}

export function ChecadorClient({
  nombre,
  horario,
  checadasHoy,
  retardosMes,
  tablaPendiente,
}: {
  nombre: string
  horario: Horario
  checadasHoy: Checada[]
  retardosMes: number
  tablaPendiente: boolean
}) {
  const router = useRouter()
  const [ahora, setAhora] = useState(new Date())
  const [procesando, setProcesando] = useState(false)
  const [biometricoDisponible, setBiometricoDisponible] = useState(false)
  const [tomandoFoto, setTomandoFoto] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Reloj en vivo
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Detectar soporte biométrico
  useEffect(() => {
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      // navigator.credentials con publicKey opciones para verificar biometría disponible
      // PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() es la API moderna
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
        .then((available) => setBiometricoDisponible(available))
        .catch(() => setBiometricoDisponible(false))
    }
  }, [])

  if (tablaPendiente) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-3">
        <AlertTriangle className="h-12 w-12 text-amber-300 mx-auto" />
        <p className="text-lg font-bold text-amber-200">Aplica la migración 0046</p>
        <p className="text-xs text-amber-200/80">
          La tabla <code className="font-mono">checadas</code> aún no existe.
        </p>
      </div>
    )
  }

  if (!horario) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center space-y-3">
        <AlertTriangle className="h-12 w-12 text-rose-300 mx-auto" />
        <p className="text-lg font-bold text-rose-200">No tienes horario asignado</p>
        <p className="text-xs text-rose-200/80">Pide a admin que configure tu horario en BD.</p>
      </div>
    )
  }

  const yaChecoEntrada = checadasHoy.some(c => c.tipo === 'entrada')
  const yaChecoSalida = checadasHoy.some(c => c.tipo === 'salida')
  const checadaEntrada = checadasHoy.find(c => c.tipo === 'entrada')
  const checadaSalida = checadasHoy.find(c => c.tipo === 'salida')

  // Tiempo hasta entrada o salida
  const hoyStr = ahora.toISOString().slice(0, 10)
  const horaEntrada = new Date(`${hoyStr}T${horario.hora_entrada}:00`)
  const horaSalida = new Date(`${hoyStr}T${horario.hora_salida}:00`)
  const limiteEntrada = new Date(horaEntrada.getTime() + horario.tolerancia_minutos * 60000)

  // Estado del día
  const proxAccion: 'entrada' | 'salida' | 'completo' =
    !yaChecoEntrada ? 'entrada'
    : !yaChecoSalida ? 'salida'
    : 'completo'

  // Indicador "puntual / retardo proyectado"
  let estadoEntrada: 'pendiente' | 'puntual' | 'tarde' | 'hecha' = 'pendiente'
  if (yaChecoEntrada && checadaEntrada) {
    estadoEntrada = checadaEntrada.es_retardo ? 'tarde' : 'hecha'
  } else if (ahora <= limiteEntrada) {
    estadoEntrada = 'puntual'
  } else if (ahora > limiteEntrada) {
    estadoEntrada = 'tarde'
  }

  // Mensaje para botón
  let botonLabel = ''
  let botonTipo: 'entrada' | 'salida' | null = null
  let botonHabilitado = true
  if (proxAccion === 'entrada') {
    botonLabel = '🟢 Checar ENTRADA'
    botonTipo = 'entrada'
  } else if (proxAccion === 'salida') {
    botonLabel = '🔴 Checar SALIDA'
    botonTipo = 'salida'
    // No permitir salida antes de la hora de salida (ventana = 15 min antes)
    const ventanaInicio = new Date(horaSalida.getTime() - 15 * 60 * 1000)
    if (ahora < ventanaInicio) {
      botonHabilitado = false
      const min = Math.ceil((ventanaInicio.getTime() - ahora.getTime()) / 60000)
      botonLabel = `⏳ Salida disponible en ${min} min`
    }
  } else {
    botonLabel = '✅ Jornada completa'
    botonHabilitado = false
  }

  // Estado del preview de cámara
  const [previewOpen, setPreviewOpen] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const previewVideoRef = useRef<HTMLVideoElement | null>(null)

  // Abrir preview con molde biométrico y countdown
  const abrirPreviewYCapturar = async (): Promise<string | null> => {
    setPreviewOpen(true)
    setTomandoFoto(true)
    return new Promise(async (resolve) => {
      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        })
        streamRef.current = stream

        // Esperar a que el video esté en DOM (un tick)
        await new Promise(r => setTimeout(r, 100))
        const video = previewVideoRef.current
        if (!video) throw new Error('video element no listo')

        video.srcObject = stream
        video.playsInline = true
        video.muted = true
        await video.play()

        // Esperar dimensiones reales
        let tries = 0
        while ((video.videoWidth === 0 || video.videoHeight === 0) && tries < 30) {
          await new Promise(r => setTimeout(r, 100))
          tries++
        }
        if (video.videoWidth === 0) throw new Error('cámara sin dimensiones')

        // Countdown 3...2...1 con flash visual
        for (const n of [3, 2, 1]) {
          setCountdown(n)
          await new Promise(r => setTimeout(r, 1000))
        }
        setCountdown(null)

        // Capturar
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('sin contexto')
        ctx.drawImage(video, 0, 0)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

        // Cleanup
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setTomandoFoto(false)
        // Mantener preview abierto 500ms más para feedback "✓ Capturado"
        await new Promise(r => setTimeout(r, 500))
        setPreviewOpen(false)
        resolve(dataUrl)
      } catch (e) {
        console.error('Cámara error:', e)
        if (stream) stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setTomandoFoto(false)
        setPreviewOpen(false)
        setCountdown(null)
        resolve(null)
      }
    })
  }

  // Convertir base64url ↔ Uint8Array para WebAuthn
  function base64urlToBuffer(b64url: string): ArrayBuffer {
    const padding = '='.repeat((4 - (b64url.length % 4)) % 4)
    const b64 = (b64url + padding).replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes.buffer
  }
  function bufferToBase64url(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf)
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  // Verificar huella con lector USB (si está registrada)
  const verificarConHuella = async (credentialIds: string[]): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return false
    if (credentialIds.length === 0) return false
    try {
      const challenge = new Uint8Array(32)
      crypto.getRandomValues(challenge)
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: credentialIds.map(id => ({
            id: base64urlToBuffer(id),
            type: 'public-key' as const,
          })),
          userVerification: 'required',
          timeout: 30000,
        },
      }) as PublicKeyCredential | null

      if (!credential) return false

      // Verifica en server que el credentialId existe y pertenece al usuario actual
      const credId = bufferToBase64url(credential.rawId)
      const r = await verificarHuella({ credential_id: credId })
      return r.ok === true
    } catch (e) {
      console.error('Error huella:', e)
      return false
    }
  }

  // Iniciar checada con biometría + foto
  const checar = async () => {
    if (!botonTipo || !botonHabilitado || procesando) return
    setProcesando(true)
    let biometricoOk = false

    // Intentar prompt biométrico si está disponible
    if (biometricoDisponible) {
      try {
        // navigator.credentials.get con publicKey usa Touch ID/Face ID si está disponible
        // sin necesidad de registrar credenciales primero, lo cual hace una verificación rápida
        await navigator.credentials.get({
          publicKey: {
            challenge: new Uint8Array(32),
            rpId: window.location.hostname,
            userVerification: 'required',
            timeout: 30000,
            allowCredentials: [],
          },
        }).catch(() => {
          // Si falla la API biométrica, simplemente confirmamos sin biometría
          // (algunos navegadores tronan si no hay credenciales registradas)
          throw new Error('biometric_skipped')
        })
        biometricoOk = true
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (msg === 'biometric_skipped') {
          // OK, continuamos sin biométrico
          biometricoOk = false
        } else if (msg.includes('NotAllowed')) {
          setProcesando(false)
          return toast.error('Verificación cancelada', '')
        }
      }
    }

    // Tomar foto con preview + molde biométrico
    const fotoBase64 = await abrirPreviewYCapturar()

    const r = await crearChecada({
      tipo: botonTipo,
      biometrico_verificado: biometricoOk,
      foto_base64: fotoBase64,
    })

    setProcesando(false)
    if (r.error) return toast.error('No se registró', r.error)

    // Dispara análisis IA en background (no bloquea al usuario)
    if (r.checada_id && fotoBase64) {
      fetch('/api/ai/analizar-checada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checada_id: r.checada_id }),
      }).catch(() => { /* silent: análisis es bonus */ })
    }

    if (r.multa) {
      toast.error('🚨 Multa aplicada', `${horario.retardos_para_multa} retardos este mes`)
    } else if (r.retardo) {
      toast.error(`⏰ Retardo: ${r.minutos} min tarde`, `Tienes ${retardosMes + 1}/${horario.retardos_para_multa} retardos este mes`)
    } else {
      toast.success(`✓ ${botonTipo === 'entrada' ? 'Entrada' : 'Salida'} registrada`, biometricoOk ? '🔐 Verificado biométrico' : '')
    }
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Preview de cámara con molde biométrico */}
      {previewOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          <div className="relative w-full h-full max-w-md mx-auto flex flex-col">
            {/* Video full-screen mirror */}
            <div className="relative flex-1 overflow-hidden">
              <video
                ref={previewVideoRef}
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}  // efecto espejo
              />

              {/* Molde biométrico (óvalo guía) */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 400 600"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <mask id="oval-mask">
                    <rect width="400" height="600" fill="white" />
                    <ellipse cx="200" cy="280" rx="130" ry="180" fill="black" />
                  </mask>
                </defs>
                {/* Overlay oscuro con hueco oval */}
                <rect width="400" height="600" fill="rgba(0,0,0,0.55)" mask="url(#oval-mask)" />
                {/* Borde del óvalo */}
                <ellipse
                  cx="200" cy="280" rx="130" ry="180"
                  fill="none"
                  stroke={countdown !== null ? '#10b981' : '#06b6d4'}
                  strokeWidth="3"
                  strokeDasharray={countdown !== null ? '0' : '8 8'}
                  className={countdown !== null ? 'animate-pulse' : ''}
                />
                {/* Esquinas decorativas */}
                {[
                  [70, 100], [330, 100], [70, 460], [330, 460]
                ].map(([cx, cy], i) => (
                  <g key={i}>
                    <line x1={cx} y1={cy} x2={cx + (cx < 200 ? 20 : -20)} y2={cy} stroke="#06b6d4" strokeWidth="2" />
                    <line x1={cx} y1={cy} x2={cx} y2={cy + (cy < 200 ? 20 : -20)} stroke="#06b6d4" strokeWidth="2" />
                  </g>
                ))}
              </svg>

              {/* Instrucción y countdown */}
              <div className="absolute inset-x-0 top-8 text-center px-4">
                <p className="text-white text-sm font-bold tracking-wide">
                  {countdown !== null ? 'Toma de evidencia…' : 'Pon tu cara dentro del molde'}
                </p>
              </div>

              {/* Countdown gigante */}
              {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="h-32 w-32 rounded-full bg-emerald-500/30 backdrop-blur-md flex items-center justify-center border-4 border-emerald-400 animate-pulse"
                  >
                    <span className="text-7xl font-black text-white tabular-nums">{countdown}</span>
                  </div>
                </div>
              )}

              {/* Estado "Capturando" después */}
              {tomandoFoto && countdown === null && (
                <div className="absolute inset-x-0 bottom-24 text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/90 backdrop-blur text-white font-bold text-sm">
                    <CheckCircle2 className="h-4 w-4" /> ✓ Capturado
                  </div>
                </div>
              )}
            </div>

            {/* Botón cancelar */}
            <div className="p-4 bg-black">
              <button
                type="button"
                onClick={() => {
                  if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop())
                    streamRef.current = null
                  }
                  setPreviewOpen(false)
                  setCountdown(null)
                  setTomandoFoto(false)
                  setProcesando(false)
                }}
                className="w-full h-11 rounded-xl bg-zinc-800 text-zinc-200 text-sm font-bold"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reloj y nombre */}
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-emerald-500/5 to-transparent p-4 text-center space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold">Hola, {nombre}</p>
        <p className="text-5xl font-black tabular-nums text-cyan-300 leading-none">
          {ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
        </p>
        <p className="text-xs text-zinc-500">
          {ahora.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long' })}
        </p>
      </div>

      {/* Horario configurado */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-zinc-900/40 border border-zinc-800 p-2">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Entrada</p>
          <p className="text-sm font-black text-emerald-300 tabular-nums">{horario.hora_entrada}</p>
        </div>
        <div className="rounded-xl bg-zinc-900/40 border border-zinc-800 p-2">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Salida</p>
          <p className="text-sm font-black text-rose-300 tabular-nums">{horario.hora_salida}</p>
        </div>
        <div className="rounded-xl bg-zinc-900/40 border border-zinc-800 p-2">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Tolerancia</p>
          <p className="text-sm font-black text-amber-300 tabular-nums">{horario.tolerancia_minutos} min</p>
        </div>
      </div>

      {/* Status del día */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-zinc-800">
        <DiaRow
          label="Entrada"
          checada={checadaEntrada}
          horaEsperada={horario.hora_entrada}
          estado={estadoEntrada}
        />
        <DiaRow
          label="Salida"
          checada={checadaSalida}
          horaEsperada={horario.hora_salida}
          estado={yaChecoSalida ? 'hecha' : 'pendiente'}
        />
      </div>

      {/* Botón checar */}
      <button
        type="button"
        onClick={checar}
        disabled={!botonHabilitado || procesando}
        className={cn(
          'w-full h-20 rounded-2xl text-white font-black text-lg inline-flex items-center justify-center gap-2 disabled:opacity-30 active:scale-[0.98] shadow-2xl',
          botonTipo === 'entrada'
            ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 shadow-emerald-500/30'
            : botonTipo === 'salida'
              ? 'bg-gradient-to-r from-rose-600 to-orange-600 shadow-rose-500/30'
              : 'bg-zinc-700 shadow-none'
        )}
      >
        {procesando ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <>
            {biometricoDisponible && botonHabilitado && <Fingerprint className="h-6 w-6" />}
            {botonLabel}
          </>
        )}
      </button>

      {botonHabilitado && (
        <p className="text-center text-[10px] text-cyan-300/70 flex items-center justify-center gap-1.5">
          {tomandoFoto ? (
            <><Camera className="h-3 w-3 animate-pulse" /> Tomando foto…</>
          ) : (
            <>
              {biometricoDisponible && <><Fingerprint className="h-3 w-3" /> Touch ID/Face ID + </>}
              <Camera className="h-3 w-3" /> Foto automática como evidencia
            </>
          )}
        </p>
      )}

      {/* Retardos del mes */}
      <div className={cn(
        'rounded-2xl border p-3 flex items-center gap-3',
        retardosMes >= horario.retardos_para_multa
          ? 'border-rose-500/30 bg-rose-500/5'
          : retardosMes >= horario.retardos_para_multa - 1
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-emerald-500/20 bg-emerald-500/5'
      )}>
        <Calendar className={cn(
          'h-8 w-8',
          retardosMes >= horario.retardos_para_multa ? 'text-rose-300'
            : retardosMes >= horario.retardos_para_multa - 1 ? 'text-amber-300'
            : 'text-emerald-300'
        )} />
        <div className="flex-1">
          <p className="text-sm font-bold text-zinc-100">
            {retardosMes} / {horario.retardos_para_multa} retardos este mes
          </p>
          <p className="text-[10px] text-zinc-500">
            {retardosMes >= horario.retardos_para_multa
              ? `Ya tienes multa pendiente de $${horario.monto_multa_mxn}`
              : retardosMes >= horario.retardos_para_multa - 1
                ? `1 retardo más = multa de $${horario.monto_multa_mxn}`
                : `${horario.retardos_para_multa - retardosMes} retardos para multa de $${horario.monto_multa_mxn}`}
          </p>
        </div>
      </div>
    </div>
  )
}

function DiaRow({ label, checada, horaEsperada, estado }: {
  label: string
  checada?: Checada
  horaEsperada: string
  estado: 'pendiente' | 'puntual' | 'tarde' | 'hecha'
}) {
  return (
    <div className="p-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {checada ? (
          <CheckCircle2 className={cn(
            'h-5 w-5',
            checada.es_retardo ? 'text-amber-300' : 'text-emerald-300'
          )} />
        ) : estado === 'tarde' ? (
          <AlertTriangle className="h-5 w-5 text-amber-300" />
        ) : (
          <Clock className="h-5 w-5 text-zinc-500" />
        )}
        <div>
          <p className="text-sm font-bold text-zinc-100">{label}</p>
          <p className="text-[10px] text-zinc-500">Esperada: {horaEsperada}</p>
        </div>
      </div>
      {checada ? (
        <div className="text-right">
          <p className="text-sm font-bold text-zinc-200 tabular-nums">
            {new Date(checada.timestamp_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </p>
          {checada.es_retardo && (
            <p className="text-[10px] text-amber-300 font-bold">+{checada.retardo_minutos} min tarde</p>
          )}
        </div>
      ) : (
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Pendiente</span>
      )}
    </div>
  )
}
