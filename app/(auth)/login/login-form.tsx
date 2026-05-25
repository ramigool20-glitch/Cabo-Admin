'use client'

import { useActionState } from 'react'
import { loginAction } from './actions'

type State = { error?: string }

async function action(_prev: State, formData: FormData): Promise<State> {
  const result = await loginAction(formData)
  return result ?? {}
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {})

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          className="w-full h-12 px-4 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="tu@email.com"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full h-12 px-4 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="••••••••"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
