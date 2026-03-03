'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { MapPoint } from '@/lib/transaction-analysis'
import { fmtGallons, fmtDollars, fmtMiles } from '@/lib/transaction-analysis'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

// ─── CK store shape we pull from stores-data.json ────────────────────────────

export interface CKStorePin {
  lat: number
  lng: number
  name: string
  city: string
  state: string
  zip: string
  truckAccessible: boolean
}

// ─── Color helpers ────────────────────────────────────────────────────────────

/** Determine dot color for a transaction point based on CK proximity */
function pointColor(p: MapPoint): string {
  if (p.isCircleK) return '#ED8B00'           // brand orange — already at CK
  const d = p.nearestCKDistanceMi
  if (d < 0)   return '#9ca3af'               // gray — no distance data
  if (d < 1)   return '#16a34a'               // green-600
  if (d < 2)   return '#22c55e'               // green-500
  if (d < 5)   return '#ca8a04'               // yellow-600
  if (d < 10)  return '#ea580c'               // orange-600
  return '#dc2626'                             // red-600
}

// ─── GeoJSON builders ─────────────────────────────────────────────────────────

function buildTransactionGeoJSON(points: MapPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map(p => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: {
        gallons: p.gallons,
        transactions: p.transactions,
        spend: p.spend,
        isCircleK: p.isCircleK,
        label: p.label,
        city: p.city,
        state: p.state,
        nearestCKDist: p.nearestCKDistanceMi,
        color: pointColor(p),
      },
    })),
  }
}

function buildCKGeoJSON(stores: CKStorePin[]) {
  return {
    type: 'FeatureCollection' as const,
    features: stores.map(s => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
      properties: {
        name: s.name,
        city: s.city,
        state: s.state,
        zip: s.zip,
        truckAccessible: s.truckAccessible,
      },
    })),
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FuelingMapProps {
  transactionPoints: MapPoint[]   // geocoded + analyzed
  ckStores: CKStorePin[]
  height?: number
  geocodingInProgress?: boolean
}

export function FuelingMap({
  transactionPoints,
  ckStores,
  height = 520,
  geocodingInProgress = false,
}: FuelingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const loadedRef = useRef(false)

  // ── Initialize map once ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!mapboxgl.accessToken) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-95.7, 37.1],  // center of US
      zoom: 3.8,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', () => {
      loadedRef.current = true

      // ── CK store layer ──────────────────────────────────────────────────
      map.addSource('ck-stores', {
        type: 'geojson',
        data: buildCKGeoJSON(ckStores),
      })
      map.addLayer({
        id: 'ck-stores-layer',
        type: 'circle',
        source: 'ck-stores',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 2, 7, 5, 10, 8,
          ],
          'circle-color': '#ED8B00',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.7,
        },
      })

      // ── Transaction points layer ────────────────────────────────────────
      map.addSource('transaction-points', {
        type: 'geojson',
        data: buildTransactionGeoJSON(transactionPoints),
      })
      map.addLayer({
        id: 'transaction-points-layer',
        type: 'circle',
        source: 'transaction-points',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'gallons'],
            0, 7, 5000, 12, 20000, 18, 100000, 28,
          ],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.88,
        },
      })

      // ── Popups ──────────────────────────────────────────────────────────
      const popup = new mapboxgl.Popup({ closeButton: false, maxWidth: '260px' })

      // Transaction point popup
      map.on('mouseenter', 'transaction-points-layer', e => {
        map.getCanvas().style.cursor = 'pointer'
        const p = e.features?.[0]?.properties
        if (!p || !e.lngLat) return
        const dist = p.nearestCKDist >= 0 ? `${p.nearestCKDist.toFixed(1)} mi` : '—'
        const isCK = p.isCircleK
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:sans-serif;padding:4px 2px">
              <div style="font-weight:700;font-size:14px;margin-bottom:4px">${p.label}</div>
              <div style="font-size:12px;color:#555;margin-bottom:6px">${p.city}, ${p.state}</div>
              <div style="font-size:13px"><b>${Number(p.gallons).toLocaleString()}</b> gal &nbsp;·&nbsp; ${Number(p.transactions).toLocaleString()} trans</div>
              ${p.spend > 0 ? `<div style="font-size:12px;color:#888;margin-top:2px">$${Math.round(p.spend).toLocaleString()}</div>` : ''}
              <div style="margin-top:6px;font-size:12px;padding:3px 6px;border-radius:4px;display:inline-block;background:${isCK ? '#FFF3E0' : '#f3f4f6'};color:${isCK ? '#b45309' : '#444'}">
                ${isCK ? '✓ Circle K' : `Nearest CK: ${dist}`}
              </div>
            </div>
          `)
          .addTo(map)
      })
      map.on('mouseleave', 'transaction-points-layer', () => {
        map.getCanvas().style.cursor = ''
        popup.remove()
      })

      // CK store popup
      map.on('mouseenter', 'ck-stores-layer', e => {
        map.getCanvas().style.cursor = 'pointer'
        const p = e.features?.[0]?.properties
        if (!p || !e.lngLat) return
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:sans-serif;padding:4px 2px">
              <div style="font-weight:700;font-size:13px;color:#ED8B00">Circle K</div>
              <div style="font-size:12px;color:#555">${p.city}, ${p.state} ${p.zip}</div>
              ${p.truckAccessible ? '<div style="font-size:11px;color:#ED8B00;margin-top:2px">✓ Truck accessible</div>' : ''}
            </div>
          `)
          .addTo(map)
      })
      map.on('mouseleave', 'ck-stores-layer', () => {
        map.getCanvas().style.cursor = ''
        popup.remove()
      })
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      loadedRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // only run once — data updates handled below

  // ── Update transaction source when points change ─────────────────────────
  useEffect(() => {
    if (!loadedRef.current || !mapRef.current) return
    const src = mapRef.current.getSource('transaction-points') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    src.setData(buildTransactionGeoJSON(transactionPoints))

    // Fit map to transaction points once they arrive
    if (transactionPoints.length > 0) {
      const bounds = new mapboxgl.LngLatBounds()
      transactionPoints.forEach(p => bounds.extend([p.lng, p.lat]))
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 10, duration: 800 })
    }
  }, [transactionPoints])

  // ── Update CK stores source ───────────────────────────────────────────────
  useEffect(() => {
    if (!loadedRef.current || !mapRef.current) return
    const src = mapRef.current.getSource('ck-stores') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    src.setData(buildCKGeoJSON(ckStores))
  }, [ckStores])

  if (!mapboxgl.accessToken) {
    return (
      <div className="flex items-center justify-center bg-gray-100 rounded-xl text-gray-500 text-sm" style={{ height }}>
        Mapbox token not configured — add <code className="bg-gray-200 px-1 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to your environment.
      </div>
    )
  }

  return (
    <div className="relative" style={{ height }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden' }} />

      {/* Geocoding overlay */}
      {geocodingInProgress && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-xl">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-medium">Geocoding locations…</p>
            <p className="text-xs text-gray-400 mt-0.5">Circle K stores shown · transaction pins loading</p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-6 left-4 bg-white/95 rounded-xl shadow-md p-3 text-xs space-y-1.5 border border-gray-200">
        <LegendDot color="#ED8B00" label="Fueling at Circle K" />
        <LegendDot color="#16a34a" label="< 1 mi from CK" />
        <LegendDot color="#22c55e" label="1 – 2 mi from CK" />
        <LegendDot color="#ca8a04" label="2 – 5 mi from CK" />
        <LegendDot color="#ea580c" label="5 – 10 mi from CK" />
        <LegendDot color="#dc2626" label="> 10 mi from CK" />
        <div className="border-t border-gray-200 pt-1.5 mt-1">
          <LegendDot color="#ED8B00" small label="Circle K store" />
        </div>
      </div>
    </div>
  )
}

function LegendDot({ color, label, small }: { color: string; label: string; small?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        style={{ backgroundColor: color, width: small ? 8 : 10, height: small ? 8 : 10, opacity: small ? 0.7 : 1 }}
        className="rounded-full shrink-0"
      />
      <span className="text-gray-600">{label}</span>
    </div>
  )
}
