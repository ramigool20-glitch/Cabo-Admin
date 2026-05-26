'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const TRIGGER_PX = 70
const MAX_PULL_PX = 110

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [pullPx, setPullPx] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      // Solo arranca si estamos arriba de la página
      if (window.scrollY > 0 || refreshing) {
        startY.current = null
        return
      }
      startY.current = e.touches[0].clientY
      dragging.current = false
    }

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) return
      // Solo activa drag si claramente es pull-down vertical y aún estamos arriba
      if (window.scrollY > 0) {
        startY.current = null
        setPullPx(0)
        return
      }
      dragging.current = true
      // Resistencia exponencial
      const resisted = Math.min(MAX_PULL_PX, dy * 0.5)
      setPullPx(resisted)
    }

    const onTouchEnd = async () => {
      if (!dragging.current) {
        startY.current = null
        setPullPx(0)
        return
      }
      dragging.current = false
      const reached = pullPx >= TRIGGER_PX
      startY.current = null
      if (reached) {
        setRefreshing(true)
        setPullPx(TRIGGER_PX)
        if ('vibrate' in navigator) { try { navigator.vibrate(20) } catch {} }
        router.refresh()
        // Da tiempo a que React Server Components vuelvan a renderizar
        setTimeout(() => {
          setRefreshing(false)
          setPullPx(0)
        }, 800)
      } else {
        setPullPx(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [pullPx, refreshing, router])

  const progress = Math.min(1, pullPx / TRIGGER_PX)
  const rotation = progress * 270

  return (
    <>
      {/* Indicador visual */}
      <div
        className="pointer-events-none fixed top-0 left-0 right-0 z-[90] flex justify-center"
        style={{
          paddingTop: `calc(env(safe-area-inset-top) + ${Math.max(0, pullPx - 40)}px)`,
          opacity: pullPx > 8 || refreshing ? 1 : 0,
          transition: refreshing || pullPx === 0 ? 'opacity 200ms, padding-top 200ms' : 'none',
        }}
      >
        <div className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-[var(--bg-card)] border border-cyan-500/40 shadow-lg shadow-cyan-500/20">
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? 'ptr-spin text-cyan-300' : 'text-cyan-400'}`}
            style={{ transform: refreshing ? undefined : `rotate(${rotation}deg)` }}
          />
        </div>
      </div>

      {/* Contenido empujado hacia abajo durante el pull */}
      <div
        style={{
          transform: pullPx > 0 ? `translateY(${pullPx * 0.6}px)` : undefined,
          transition: refreshing || pullPx === 0 ? 'transform 200ms ease-out' : 'none',
        }}
      >
        {children}
      </div>
    </>
  )
}
