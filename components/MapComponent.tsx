'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Coordinates } from '@/lib/mapbox'
import { CircleKStore } from '@/lib/stores'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

interface MapComponentProps {
  center: Coordinates
  stores: CircleKStore[]
  height?: number
}

export function MapComponent({ center, stores, height = 400 }: MapComponentProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [center.lng, center.lat],
      zoom: 11
    })

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.current.on('load', () => {
      setMapLoaded(true)
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    if (!map.current || !mapLoaded) return

    // Clear existing markers
    const markers = document.querySelectorAll('.mapboxgl-marker')
    markers.forEach(marker => marker.remove())

    // Add customer location marker (large dark orange)
    const customerMarker = document.createElement('div')
    customerMarker.className = 'customer-marker'
    customerMarker.style.width = '32px'
    customerMarker.style.height = '32px'
    customerMarker.style.borderRadius = '50%'
    customerMarker.style.backgroundColor = '#D64303'
    customerMarker.style.border = '3px solid white'
    customerMarker.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
    customerMarker.style.cursor = 'pointer'

    new mapboxgl.Marker(customerMarker)
      .setLngLat([center.lng, center.lat])
      .setPopup(
        new mapboxgl.Popup({ offset: 25 })
          .setHTML('<div style="font-weight: 600; padding: 4px;">Customer Location</div>')
      )
      .addTo(map.current)

    // Add store markers (smaller brand orange)
    stores.forEach(store => {
      const storeMarker = document.createElement('div')
      storeMarker.className = 'store-marker'
      storeMarker.style.width = '20px'
      storeMarker.style.height = '20px'
      storeMarker.style.borderRadius = '50%'
      storeMarker.style.backgroundColor = '#ED8B00'
      storeMarker.style.border = '2px solid white'
      storeMarker.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)'
      storeMarker.style.cursor = 'pointer'

      new mapboxgl.Marker(storeMarker)
        .setLngLat([store.coordinates.lng, store.coordinates.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 20 })
            .setHTML(`
              <div style="padding: 8px;">
                <div style="font-weight: 600; margin-bottom: 4px;">${store.name}</div>
                <div style="font-size: 13px; color: #666;">${store.address}</div>
                <div style="font-size: 13px; color: #666;">${store.city}, ${store.state} ${store.zip}</div>
                ${store.truckAccessible ? '<div style="font-size: 12px; color: #ED8B00; margin-top: 4px;">✓ Truck Accessible</div>' : ''}
              </div>
            `)
        )
        .addTo(map.current)
    })

    // Fit bounds to show all markers
    if (stores.length > 0) {
      const bounds = new mapboxgl.LngLatBounds()
      bounds.extend([center.lng, center.lat])
      stores.forEach(store => {
        bounds.extend([store.coordinates.lng, store.coordinates.lat])
      })
      map.current.fitBounds(bounds, { padding: 50, maxZoom: 13 })
    } else {
      map.current.setCenter([center.lng, center.lat])
      map.current.setZoom(11)
    }
  }, [center, stores, mapLoaded])

  return (
    <div 
      ref={mapContainer} 
      style={{ width: '100%', height: `${height}px`, borderRadius: '12px', overflow: 'hidden' }}
      className="shadow-md"
    />
  )
}
