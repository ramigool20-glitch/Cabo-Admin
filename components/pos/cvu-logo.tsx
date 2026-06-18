/**
 * Logo CVU Pharmacy — corazón rojo + tipografía bold + línea separadora.
 * SVG inline con viewBox amplio para evitar recortes.
 */

export function CvuLogo({ height = 42 }: { height?: number }) {
  // Proporción 2.2 : 1 (ancho : alto) — más ancho que la original para que
  // "Pharmacy" quepa cómodo sin recortes.
  const width = Math.round(height * 2.2)
  return (
    <svg
      viewBox="0 0 220 100"
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      aria-label="CVU Pharmacy"
    >
      {/* Corazón rojo — path estándar centrado en (40, 45) */}
      <path
        d="M 40 80
           C 40 80, 8 56, 8 32
           C 8 18, 18 8, 28 8
           C 34 8, 38 12, 40 18
           C 42 12, 46 8, 52 8
           C 62 8, 72 18, 72 32
           C 72 56, 40 80, 40 80 Z"
        fill="#ef4444"
      />
      {/* "CVU" texto grande */}
      <text
        x="86"
        y="50"
        fontFamily="Arial Black, system-ui, -apple-system, sans-serif"
        fontSize="46"
        fontWeight="900"
        fill="#0a0a0a"
        letterSpacing="-1"
      >
        CVU
      </text>
      {/* Línea separadora */}
      <line x1="86" y1="62" x2="208" y2="62" stroke="#0a0a0a" strokeWidth="3.5" strokeLinecap="round" />
      {/* "Pharmacy" */}
      <text
        x="108"
        y="88"
        fontFamily="Arial Black, system-ui, -apple-system, sans-serif"
        fontSize="20"
        fontWeight="900"
        fill="#0a0a0a"
        letterSpacing="0"
      >
        Pharmacy
      </text>
    </svg>
  )
}
