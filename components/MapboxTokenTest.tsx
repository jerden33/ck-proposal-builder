'use client'

import { useEffect, useState } from 'react'

export function MapboxTokenTest() {
  const [tokenStatus, setTokenStatus] = useState<'checking' | 'valid' | 'missing'>('checking')

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    
    if (!token) {
      console.error('❌ MAPBOX TOKEN MISSING!')
      setTokenStatus('missing')
    } else {
      console.log('✅ Mapbox token found:', token.substring(0, 20) + '...')
      setTokenStatus('valid')
    }
  }, [])

  if (tokenStatus === 'missing') {
    return (
      <div className="fixed bottom-4 left-4 bg-red-500 text-white p-4 rounded-lg shadow-lg z-50">
        <p className="font-bold">⚠️ Mapbox Token Missing</p>
        <p className="text-sm">Maps and geocoding will not work</p>
      </div>
    )
  }

  return null
}
