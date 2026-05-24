import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Imágenes desde Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

export default nextConfig
