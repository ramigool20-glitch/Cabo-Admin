'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { solicitarRecuperacion } from './actions'

export default function RecuperarPage() {
  const [state, action, pending] = useActionState(solicitarRecuperacion, {})
  return <main className="mx-auto w-full max-w-md p-6 space-y-5">
    <h1 className="text-2xl font-bold">Recuperar acceso</h1>
    <p>Solicita un enlace para elegir una nueva contraseña. Ábrelo en este mismo navegador.</p>
    {state.ok ? <p role="status">Si la cuenta está habilitada, recibirás un correo. Revisa también spam.</p> :
      <form action={action} className="space-y-4">
        <label className="block">Correo
          <input className="input-base w-full" type="email" name="email" required autoComplete="email" />
        </label>
        {state.error && <p role="alert">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? 'Solicitando…' : 'Enviar enlace'}</button>
      </form>}
    <Link href="/login">Volver al acceso</Link>
  </main>
}
