'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { MapPoint } from '@/lib/transaction-analysis'
import { fmtGallons } from '@/lib/transaction-analysis'
import { CORRIDORS } from '@/lib/otr-analysis'
import type { CorridorResult } from '@/lib/otr-analysis'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OTRMapStore {
  lat: number
  lng: number
  name: string
  city: string
  state: string
}

interface OTRMapProps {
  transactionPoints: MapPoint[]
  ckStores: OTRMapStore[]
  corridorResults: CorridorResult[]
  height?: number
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function pointColor(p: MapPoint): string {
  if (p.isCircleK) return '#16a34a'          // green — fueled at CK
  const d = p.nearestCKDistanceMi
  if (d < 0) return '#9ca3af'                // gray — no distance data
  if (d < 10) return '#f59e0b'               // amber — competitor, CK nearby
  return '#dc2626'                           // red — competitor, no CK nearby
}

// ─── GeoJSON builders ─────────────────────────────────────────────────────────

function buildCorridorGeoJSON(corridorResults: CorridorResult[]) {
  const resultMap = new Map(corridorResults.map(r => [r.corridorId, r]))
  const maxCapture = Math.max(...corridorResults.map(r => r.captureGallons), 1)

  return {
    type: 'FeatureCollection' as const,
    features: CORRIDORS.map(c => {
      const r = resultMap.get(c.id)
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          // CORRIDORS store { lat, lng }; Mapbox needs [lng, lat]
          coordinates: c.waypoints.map(w => [w.lng, w.lat]),
        },
        properties: {
          corridorId: c.id,
          name: c.name,
          active: !!r,
          captureGallons: r?.captureGallons ?? 0,
          totalGallons: r?.totalGallons ?? 0,
          ckGallons: r?.ckGallons ?? 0,
          intensity: r ? r.captureGallons / maxCapture : 0,
        },
      }
    }),
  }
}

function buildTxGeoJSON(points: MapPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map(p => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: {
        gallons: p.gallons,
        transactions: p.transactions,
        isCircleK: p.isCircleK,
        label: p.label ?? '',
        color: pointColor(p),
      },
    })),
  }
}

function buildCKGeoJSON(stores: OTRMapStore[]) {
  return {
    type: 'FeatureCollection' as const,
    features: stores.map(s => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
      properties: { name: s.name, city: s.city, state: s.state },
    })),
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OTRMap({ transactionPoints, ckStores, corridorResults, height = 580 }: OTRMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const loadedRef = useRef(false)
  const pendingRef = useRef(false)

  // Update all sources (safe to call before or after map loads)
  const updateSources = (
    txPts: MapPoint[],
    stores: OTRMapStore[],
    results: CorridorResult[],
  ) => {
    const m = mapRef.current
    if (!m || !loadedRef.current) { pendingRef.current = true; return }
    ;(m.getSource('corridors') as mapboxgl.GeoJSONSource | undefined)?.setData(buildCorridorGeoJSON(results))
    ;(m.getSource('transactions') as mapboxgl.GeoJSONSource | undefined)?.setData(buildTxGeoJSON(txPts))
    ;(m.getSource('ck-stores') as mapboxgl.GeoJSONSource | undefined)?.setData(buildCKGeoJSON(stores))
  }

  // Mount map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const m = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-96, 39],
      zoom: 3.8,
    })
    mapRef.current = m
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

    m.on('load', () => {
      // ── Corridor lines ─────────────────────────────────────────────────────
      m.addSource('corridors', { type: 'geojson', data: buildCorridorGeoJSON(corridorResults) })

      // All inactive corridors (road network context)
      m.addLayer({
        id: 'corridors-inactive',
        type: 'line',
        source: 'corridors',
        filter: ['==', ['get', 'active'], false],
        paint: { 'line-color': '#e5e7eb', 'line-width': 1.2, 'line-opacity': 0.55 },
      })

      // Active corridors — colored by opportunity intensity
      m.addLayer({
        id: 'corridors-active',
        type: 'line',
        source: 'corridors',
        filter: ['==', ['get', 'active'], true],
        paint: {
          'line-color': [
            'interpolate', ['linear'], ['get', 'intensity'],
            0,   '#fde68a',   // amber-200 — low opportunity
            0.3, '#f97316',   // orange-500 — moderate
            1,   '#c2410c',   // orange-700 — high opportunity
          ],
          'line-width': [
            'interpolate', ['linear'], ['get', 'intensity'],
            0, 2.5,
            1, 6,
          ],
          'line-opacity': 0.9,
        },
      })

      // ── CK truck store pins ────────────────────────────────────────────────
      m.addSource('ck-stores', { type: 'geojson', data: buildCKGeoJSON(ckStores) })
      m.addLayer({
        id: 'ck-stores-layer',
        type: 'circle',
        source: 'ck-stores',
        paint: {
          'circle-color': '#ea580c',
          'circle-radius': 5,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.85,
        },
      })

      // ── Transaction points ─────────────────────────────────────────────────
      m.addSource('transactions', {
        type: 'geojson',
        data: buildTxGeoJSON(transactionPoints),
        cluster: true,
        clusterRadius: 40,
      })

      // Cluster circles
      m.addLayer({
        id: 'tx-clusters',
        type: 'circle',
        source: 'transactions',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#6b7280',
          'circle-radius': ['step', ['get', 'point_count'], 8, 10, 12, 50, 16],
          'circle-opacity': 0.6,
        },
      })

      // Individual points
      m.addLayer({
        id: 'tx-points',
        type: 'circle',
        source: 'transactions',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 5,
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
        },
      })

      // ── Fit to transaction bounds ──────────────────────────────────────────
      if (transactionPoints.length > 0) {
        const lngs = transactionPoints.map(p => p.lng)
        const lats = transactionPoints.map(p => p.lat)
        m.fitBounds(
          [[Math.min(...lngs) - 2, Math.min(...lats) - 1], [Math.max(...lngs) + 2, Math.max(...lats) + 1]],
          { padding: 50, duration: 0, maxZoom: 8 },
        )
      }

      // ── Corridor hover tooltip ─────────────────────────────────────────────
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 5 })
      m.on('mouseenter', 'corridors-active', (e) => {
        m.getCanvas().style.cursor = 'pointer'
        const props = e.features?.[0]?.properties
        if (!props) return
        popup.setLngLat(e.lngLat).setHTML(
          `<div style="font-family:system-ui,sans-serif;font-size:12px;padding:6px 8px;line-height:1.5">
            <strong style="font-size:13px">${props.name}</strong><br/>
            <span style="color:#6b7280">Total: ${fmtGallons(props.totalGallons)}</span><br/>
            <span style="color:#16a34a">Circle K: ${fmtGallons(props.ckGallons)}</span><br/>
            <span style="color:#f97316">Opportunity: ${fmtGallons(props.captureGallons)}</span>
          </div>`
        ).addTo(m)
      })
      m.on('mouseleave', 'corridors-active', () => {
        m.getCanvas().style.cursor = ''
        popup.remove()
      })

      // ── Transaction point tooltip ──────────────────────────────────────────
      const txPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 8 })
      m.on('mouseenter', 'tx-points', (e) => {
        m.getCanvas().style.cursor = 'pointer'
        const props = e.features?.[0]?.properties
        if (!props) return
        const label = props.isCircleK ? 'Circle K' : (props.label || 'Competitor')
        txPopup.setLngLat((e.features![0].geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(
            `<div style="font-family:system-ui,sans-serif;font-size:12px;padding:6px 8px;line-height:1.5">
              <strong>${label}</strong><br/>
              ${fmtGallons(props.gallons)} · ${props.transactions} fill${props.transactions === 1 ? '' : 's'}
            </div>`
          ).addTo(m)
      })
      m.on('mouseleave', 'tx-points', () => {
        m.getCanvas().style.cursor = ''
        txPopup.remove()
      })

      loadedRef.current = true
      if (pendingRef.current) {
        pendingRef.current = false
        updateSources(transactionPoints, ckStores, corridorResults)
      }
    })

    return () => {
      m.remove()
      mapRef.current = null
      loadedRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync data when props change
  useEffect(() => {
    updateSources(transactionPoints, ckStores, corridorResults)
  }, [transactionPoints, ckStores, corridorResults]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-lg px-3.5 py-3 text-xs space-y-1.5 pointer-events-none">
        <p className="font-semibold text-gray-700 text-xs uppercase tracking-wide mb-2">Legend</p>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-600 shrink-0" />
          <span className="text-gray-600">Fueled at Circle K</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
          <span className="text-gray-600">Competitor (CK within 10 mi)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-600 shrink-0" />
          <span className="text-gray-600">Competitor (no CK nearby)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-orange-600 shrink-0" />
          <span className="text-gray-600">CK Truck Location</span>
        </div>
        <div className="border-t border-gray-100 pt-1.5 mt-1.5 flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-amber-300 shrink-0" />
          <span className="text-gray-400">→</span>
          <span className="h-0.5 w-4 bg-orange-700 shrink-0" />
          <span className="text-gray-400 ml-1">Corridor opportunity</span>
        </div>
      </div>
    </div>
  )
}
