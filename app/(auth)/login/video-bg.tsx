'use client'

import { useEffect, useRef } from 'react'

export function VideoBg() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    // Atributos legacy de iOS Safari para autoplay inline
    v.setAttribute('webkit-playsinline', 'true')
    v.setAttribute('x5-playsinline', 'true')
    v.muted = true
    v.defaultMuted = true

    const tryPlay = () => {
      v.play().catch(() => {
        // Si bloquea por política, esperamos al primer touch del usuario
        const unlock = () => {
          v.play().catch(() => {})
          document.removeEventListener('touchstart', unlock)
          document.removeEventListener('click', unlock)
        }
        document.addEventListener('touchstart', unlock, { passive: true, once: true })
        document.addEventListener('click', unlock, { once: true })
      })
    }

    tryPlay()
    document.addEventListener('visibilitychange', tryPlay)
    return () => document.removeEventListener('visibilitychange', tryPlay)
  }, [])

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 h-full w-full object-cover"
      autoPlay
      loop
      muted
      playsInline
      controls={false}
      disablePictureInPicture
      preload="auto"
      poster="/media/login-bg-poster.jpg"
    >
      <source src="/media/login-bg.mp4" type="video/mp4" />
    </video>
  )
}
