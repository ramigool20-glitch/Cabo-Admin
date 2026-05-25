'use client'

import { useEffect, useState } from 'react'

export function Clock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  if (!now) {
    return <div className="h-5" />
  }

  const hora = now.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'America/Mazatlan',
  })
  const fecha = now.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Mazatlan',
  })

  return (
    <div className="text-sm text-cyan-300/80 inline-flex items-center gap-2">
      <span>🕘</span>
      <span className="font-medium tabular-nums">{hora}</span>
      <span className="text-cyan-300/40">·</span>
      <span>{fecha}</span>
    </div>
  )
}
