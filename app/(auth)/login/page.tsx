import { LoginForm } from './login-form'
import { Clock } from './clock'

export default function LoginPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--bg-base)] flex items-center justify-center p-5">
      {/* Video de fondo en loop */}
      <video
        className="absolute inset-0 h-full w-full object-cover opacity-60"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster="/media/login-bg-poster.jpg"
      >
        <source src="/media/login-bg.mp4" type="video/mp4" />
      </video>

      {/* Overlay gradiente para legibilidad */}
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-base)]/40 via-[var(--bg-base)]/60 to-[var(--bg-base)]/80" />

      {/* Card de login */}
      <div className="relative z-10 w-full max-w-md">
        <div className="card-glow p-6 space-y-6 backdrop-blur-xl bg-[var(--bg-card)]/85">
          {/* Logo CA */}
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-2xl bg-black/90 ring-1 ring-white/10 flex items-center justify-center shadow-2xl">
              <span className="text-white text-2xl font-black tracking-tight">CA</span>
            </div>
          </div>

          {/* Título + clock */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-black heading-gradient">Cabo Admin</h1>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-300/70">
              Sistema de Gestión Inteligente
            </p>
            <Clock />
          </div>

          {/* Form */}
          <LoginForm />
        </div>

        {/* Footer */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-[11px] text-cyan-300/40 tracking-wider">
            CABO ADMIN v1.0
          </p>
          <div className="flex items-center justify-between text-[11px] text-cyan-300/40 px-2">
            <span>🏖️ Los Cabos, México</span>
            <span className="heading-gradient font-bold">Migue G Technology</span>
          </div>
        </div>
      </div>
    </main>
  )
}
