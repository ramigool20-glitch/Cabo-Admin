'use client'

/**
 * Client component para registrar huella de empleados.
 *
 * Flujo:
 *   1. Admin selecciona empleado de la lista
 *   2. Click "Registrar huella"
 *   3. Browser llama navigator.credentials.create() con WebAuthn
 *   4. Lector USB pide poner el dedo → registra
 *   5. Server guarda credential_id + public_key
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Fingerprint, Loader2, CheckCircle2, AlertTriangle, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { registrarHuella } from '@/app/(app)/checador/huellas-actions'

type Empleado = {
  id: string
  nombre: string
  rol: string
  huellasCount: number
}

// Convierte ArrayBuffer a base64url (sin padding)
function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Convierte UUID a Uint8Array
function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  return bytes
}

export function HuellasClient({ empleados, tablaExiste }: { empleados: Empleado[]; tablaExiste: boolean }) {
  const router = useRouter()
  const [registrando, setRegistrando] = useState<string | null>(null)

  const registrar = async (empleado: Empleado) => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      return toast.error('No soportado', 'Tu navegador no soporta WebAuthn')
    }
    setRegistrando(empleado.id)
    try {
      // Challenge aleatorio (en producción debería venir del server, pero
      // como NO validamos firma en server, esto basta)
      const challenge = new Uint8Array(32)
      crypto.getRandomValues(challenge)

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challenge.buffer as ArrayBuffer,
          rp: { name: 'CVU Pharmacy', id: window.location.hostname },
          user: {
            id: uuidToBytes(empleado.id).buffer as ArrayBuffer,
            name: empleado.nombre.toLowerCase().replace(/\s+/g, '-'),
            displayName: empleado.nombre,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },   // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'cross-platform',  // lector USB externo
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
          attestation: 'none',
        },
      }) as PublicKeyCredential

      if (!credential) {
        setRegistrando(null)
        return toast.error('Cancelado', 'No se obtuvo credential')
      }

      const response = credential.response as AuthenticatorAttestationResponse
      const credentialId = bufferToBase64url(credential.rawId)
      const publicKeyBuf = response.getPublicKey?.()
      const publicKey = publicKeyBuf ? bufferToBase64url(publicKeyBuf) : ''

      if (!publicKey) {
        setRegistrando(null)
        return toast.error('Sin publicKey', 'Lector incompatible — usa uno FIDO2')
      }

      // Guardar en server
      const r = await registrarHuella({
        profile_id: empleado.id,
        credential_id: credentialId,
        public_key: publicKey,
        device_info: navigator.userAgent.includes('Mac') ? 'Mac' : navigator.userAgent.includes('Windows') ? 'Windows' : 'Otro',
      })
      setRegistrando(null)
      if (r.error) return toast.error('No se guardó', r.error)
      toast.success(`✓ Huella de ${empleado.nombre} registrada`, 'Ya puede usar el lector al checar')
      router.refresh()
    } catch (e) {
      setRegistrando(null)
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('NotAllowed')) {
        toast.error('Cancelado', 'No pusiste el dedo')
      } else if (msg.includes('Excluded')) {
        toast.error('Ya registrado', 'Esta huella ya está en BD')
      } else {
        toast.error('Error', msg || 'Falló el lector')
      }
    }
  }

  if (!tablaExiste) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-3">
        <AlertTriangle className="h-12 w-12 text-amber-300 mx-auto" />
        <p className="text-lg font-bold text-amber-200">Aplica la migración 0047</p>
        <p className="text-xs text-amber-200/80">
          La tabla <code className="font-mono">huellas_dactilares</code> aún no existe.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Instrucciones */}
      <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-2">
        <p className="text-sm font-bold text-cyan-200 inline-flex items-center gap-2">
          <Fingerprint className="h-4 w-4" />
          Cómo registrar una huella
        </p>
        <ol className="text-xs text-zinc-400 list-decimal pl-5 space-y-1">
          <li>Conecta el lector USB de huellas a esta compu</li>
          <li>Tap "Registrar huella" en el empleado</li>
          <li>El sistema pedirá poner el dedo en el lector</li>
          <li>El empleado pone su dedo (3-5 seg)</li>
          <li>Listo — su huella queda asociada a su perfil</li>
        </ol>
        <p className="text-[10px] text-zinc-500 pt-1">
          ⚠ Esta compu debe ser la misma donde Tania checará todos los días (o usar lectores
          compatibles FIDO2 en cada compu si tienes varias).
        </p>
      </div>

      {/* Lista empleados */}
      <ul className="space-y-2">
        {empleados.map(e => (
          <li key={e.id} className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-zinc-800 inline-flex items-center justify-center text-sm font-black text-zinc-300 shrink-0">
              {e.nombre.split(' ').map(p => p[0]).slice(0, 2).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-zinc-100 truncate">{e.nombre}</p>
              <p className="text-[10px] text-zinc-500">{e.rol}</p>
            </div>
            <div className="text-right">
              <p className={cn(
                'text-xs font-bold inline-flex items-center gap-1',
                e.huellasCount > 0 ? 'text-emerald-300' : 'text-zinc-500'
              )}>
                {e.huellasCount > 0 ? (
                  <><CheckCircle2 className="h-3 w-3" /> {e.huellasCount} {e.huellasCount === 1 ? 'huella' : 'huellas'}</>
                ) : (
                  <>Sin huella</>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => registrar(e)}
              disabled={registrando !== null}
              className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              {registrando === e.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <UserPlus className="h-3 w-3" />
              )}
              {registrando === e.id ? 'Pon dedo…' : 'Registrar'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
