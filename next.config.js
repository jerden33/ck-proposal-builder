/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['api.mapbox.com'],
  },
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },
}

module.exports = nextConfig
