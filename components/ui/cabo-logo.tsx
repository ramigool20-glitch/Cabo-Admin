/**
 * Logo de Cabo Admin — marca minimalista estilo Tesla/Apple.
 * Tres líneas curvas blancas dentro de un cuadrado con gradiente verde→cyan.
 * Representan olas / horizonte del mar.
 */
export function CaboLogo({
  size = 36,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Cabo Admin"
    >
      <defs>
        <linearGradient id="cabologo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <filter id="cabologo-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1" />
        </filter>
      </defs>
      {/* Fondo redondeado con gradiente */}
      <rect
        x="0"
        y="0"
        width="40"
        height="40"
        rx="10"
        ry="10"
        fill="url(#cabologo-grad)"
      />
      {/* Tres olas / horizonte */}
      <path
        d="M7 15 Q12 12, 16 15 T26 15 T34 15"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M7 22 Q12 19, 16 22 T26 22 T34 22"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.75"
      />
      <path
        d="M7 29 Q12 26, 16 29 T26 29 T34 29"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.45"
      />
    </svg>
  )
}

/**
 * Wordmark "CABO ADMIN" estilo luxury.
 */
export function CaboWordmark({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' }) {
  const cls =
    size === 'sm' ? 'text-sm'
    : size === 'md' ? 'text-base'
    : 'text-lg'

  return (
    <span className={`${cls} font-black tracking-[0.04em] leading-none heading-gradient`}>
      CABO<span className="font-medium tracking-[0.12em] ml-0.5">ADMIN</span>
    </span>
  )
}
