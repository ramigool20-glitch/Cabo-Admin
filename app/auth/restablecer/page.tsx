'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { restablecerPassword } from './actions'

export default function RestablecerPage() {
  const [state, action, pending] = useActionState(restablecerPassword, {})
  return <main className="mx-auto w-full max-w-md p-6 space-y-5">
    <h1 className="text-2xl font-bold">Nueva contraseña</h1>
    <p>Primero abre el enlace de recuperación en el navegador donde lo solicitaste.</p>
    <form action={action} className="space-y-4">
      <label className="block">Nueva contraseña
        <input className="input-base w-full" type="password" name="password" minLength={12} maxLength={128} required autoComplete="new-password" />
      </label>
      <label className="block">Confirmar contraseña
        <input className="input-base w-full" type="password" name="confirmacion" minLength={12} maxLength={128} required autoComplete="new-password" />
      </label>
      {state.error && <p role="alert">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? 'Guardando…' : 'Guardar contraseña'}</button>
    </form>
    <Link href="/recuperar">Solicitar otro enlace</Link>
  </main>
}
