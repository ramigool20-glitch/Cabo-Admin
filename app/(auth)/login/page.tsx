import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-sm space-y-8">
        <header className="text-center space-y-2">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white text-2xl font-bold">
            CA
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Cabo Admin</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Control de gastos e ingresos
          </p>
        </header>

        <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="text-xs text-center text-zinc-500">
          Solo Miguel y Sergio tienen acceso.
        </p>
      </div>
    </main>
  )
}
