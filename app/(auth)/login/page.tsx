import { LoginForm } from './login-form'
import { Clock } from './clock'
import { VideoBg } from './video-bg'
import { CaboLogo, CaboWordmark } from '@/components/ui/cabo-logo'

export default function LoginPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--bg-base)] flex items-center justify-center p-5">
      {/* Video de fondo en loop infinito */}
      <VideoBg />

      {/* Overlay gradiente para legibilidad sobre el video */}
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-base)]/30 via-[var(--bg-base)]/45 to-[var(--bg-base)]/75" />

      {/* Card de login */}
      <div className="relative z-10 w-full max-w-md">
        <div className="card-glow p-6 space-y-6 backdrop-blur-xl bg-[var(--bg-card)]/85">
          {/* Logo nuevo */}
          <div className="flex justify-center">
            <CaboLogo size={80} className="rounded-2xl shadow-2xl shadow-emerald-500/40" />
          </div>

          {/* Título + clock */}
          <div className="text-center space-y-2">
            <div className="text-center">
              <CaboWordmark size="lg" />
            </div>
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
