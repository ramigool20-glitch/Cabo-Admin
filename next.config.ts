import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV !== 'production',
})

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  experimental: {
    serverActions: {
      // Default 1 MB rechazaba fotos de iPhone (3-5 MB) con 400 antes
      // de llegar al action. Subimos a 10 MB (mismo límite que valida la action).
      bodySizeLimit: '10mb',
    },
  },
}

export default withSerwist(nextConfig)
