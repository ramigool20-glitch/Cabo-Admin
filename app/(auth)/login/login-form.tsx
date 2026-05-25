'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff, User, Lock, ArrowRight, Loader2 } from 'lucide-react'
import { loginAction } from './actions'

type State = { error?: string }

async function action(_prev: State, formData: FormData): Promise<State> {
  const result = await loginAction(formData)
  return result ?? {}
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {})
  const [showPwd, setShowPwd] = useState(false)

  return (
    <form action={formAction} className="space-y-3">
      {/* Email */}
      <div className="relative">
        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cyan-400/60 pointer-events-none" />
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="Email"
          className="input-base w-full pl-10"
        />
      </div>

      {/* Password */}
      <div className="relative">
        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cyan-400/60 pointer-events-none" />
        <input
          name="password"
          type={showPwd ? 'text' : 'password'}
          required
          autoComplete="current-password"
          placeholder="Contraseña"
          className="input-base w-full pl-10 pr-10"
        />
        <button
          type="button"
          onClick={() => setShowPwd((v) => !v)}
          aria-label={showPwd ? 'Ocultar contraseña' : 'Ver contraseña'}
          className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center text-cyan-400/60 hover:text-cyan-300"
        >
          {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {/* Recordar */}
      <label className="flex items-center gap-2 cursor-pointer select-none py-1">
        <input
          type="checkbox"
          name="remember"
          defaultChecked
          className="h-4 w-4 rounded border-cyan-500/40 bg-[var(--bg-input)] text-cyan-500 focus:ring-cyan-500/30"
        />
        <span className="text-sm text-cyan-300/70">Recordar sesión por 7 días</span>
      </label>

      {/* Error */}
      {state.error && (
        <p className="text-sm text-rose-400 text-center" role="alert">
          {state.error}
        </p>
      )}

      {/* Submit */}
      <button type="submit" disabled={pending} className="btn-primary w-full text-base">
        {pending ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Entrando…</>
        ) : (
          <>Entrar <ArrowRight className="h-4 w-4" /></>
        )}
      </button>
    </form>
  )
}
