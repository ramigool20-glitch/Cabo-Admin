/**
 * Logo CVU Pharmacy — corazón rojo + tipografía bold + línea separadora.
 * Recreado en SVG inline para ser escalable y ligero.
 */

export function CvuLogo({ height = 36 }: { height?: number }) {
  // Proporción del original 1.7 : 1 (ancho : alto)
  const width = Math.round(height * 1.7)
  return (
    <svg
      viewBox="0 0 200 120"
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="CVU Pharmacy"
    >
      {/* Corazón rojo */}
      <g transform="translate(2, 18)">
        <path
          d="M 36 12
             C 36 3, 26 -2, 18 2
             C 14 4, 12 7, 12 12
             C 12 7, 10 4, 6 2
             C -2 -2, -12 3, -12 12
             C -12 28, 4 42, 12 50
             C 20 42, 36 28, 36 12 Z"
          transform="translate(20, 0)"
          fill="#ef4444"
        />
      </g>
      {/* "CVU" texto */}
      <text
        x="68"
        y="58"
        fontFamily="Arial Black, system-ui, -apple-system, sans-serif"
        fontSize="50"
        fontWeight="900"
        fill="#0a0a0a"
        letterSpacing="-1"
      >
        CVU
      </text>
      {/* Línea separadora */}
      <line x1="68" y1="72" x2="186" y2="72" stroke="#0a0a0a" strokeWidth="3.5" strokeLinecap="round" />
      {/* "Pharmacy" */}
      <text
        x="92"
        y="103"
        fontFamily="Arial Black, system-ui, -apple-system, sans-serif"
        fontSize="22"
        fontWeight="900"
        fill="#0a0a0a"
        letterSpacing="-0.5"
      >
        Pharmacy
      </text>
    </svg>
  )
}
