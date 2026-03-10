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
  if (d < 10) return '#eab308'               // yellow — competitor, CK nearby
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
          isHighway: !c.id.startsWith('I-'),
          captureGallons: r?.captureGallons ?? 0,
          nearMissGallons: r?.nearMissGallons ?? 0,
          totalGallons: r?.totalGallons ?? 0,
          ckGallons: r?.ckGallons ?? 0,
          gapGallons: r?.gapGallons ?? 0,
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

      // Inactive interstates — gray
      m.addLayer({
        id: 'corridors-inactive',
        type: 'line',
        source: 'corridors',
        filter: ['all', ['==', ['get', 'active'], false], ['==', ['get', 'isHighway'], false]],
        paint: { 'line-color': '#e5e7eb', 'line-width': 1.2, 'line-opacity': 0.55 },
      })

      // Inactive US highways — dashed light blue
      m.addLayer({
        id: 'corridors-inactive-hwy',
        type: 'line',
        source: 'corridors',
        filter: ['all', ['==', ['get', 'active'], false], ['==', ['get', 'isHighway'], true]],
        paint: { 'line-color': '#bfdbfe', 'line-width': 1.2, 'line-opacity': 0.6, 'line-dasharray': [4, 3] },
      })

      // Active interstates — amber → orange gradient
      m.addLayer({
        id: 'corridors-active',
        type: 'line',
        source: 'corridors',
        filter: ['all', ['==', ['get', 'active'], true], ['==', ['get', 'isHighway'], false]],
        paint: {
          'line-color': [
            'interpolate', ['linear'], ['get', 'intensity'],
            0,   '#fde68a',   // amber-200
            0.3, '#f97316',   // orange-500
            1,   '#c2410c',   // orange-700
          ],
          'line-width': ['interpolate', ['linear'], ['get', 'intensity'], 0, 2.5, 1, 6],
          'line-opacity': 0.9,
        },
      })

      // Active US highways — sky → blue gradient
      m.addLayer({
        id: 'corridors-active-hwy',
        type: 'line',
        source: 'corridors',
        filter: ['all', ['==', ['get', 'active'], true], ['==', ['get', 'isHighway'], true]],
        paint: {
          'line-color': [
            'interpolate', ['linear'], ['get', 'intensity'],
            0,   '#bae6fd',   // sky-200
            0.3, '#0ea5e9',   // sky-500
            1,   '#0369a1',   // sky-700
          ],
          'line-width': ['interpolate', ['linear'], ['get', 'intensity'], 0, 2.5, 1, 6],
          'line-opacity': 0.9,
          'line-dasharray': [6, 2],
        },
      })

      // ── CK truck store pins ────────────────────────────────────────────────
      m.addSource('ck-stores', { type: 'geojson', data: buildCKGeoJSON(ckStores) })

      const truckSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="22" viewBox="0 0 36 22">
        <rect x="1" y="3" width="21" height="13" rx="2" fill="#ea580c"/>
        <rect x="23" y="6" width="11" height="10" rx="2" fill="#ea580c"/>
        <rect x="24.5" y="7.5" width="7" height="5" rx="1" fill="#fef3c7" opacity="0.9"/>
        <rect x="33" y="12" width="2.5" height="4" rx="0.5" fill="#c2410c"/>
        <circle cx="6" cy="18" r="3.5" fill="#1f2937"/><circle cx="6" cy="18" r="1.4" fill="#9ca3af"/>
        <circle cx="17" cy="18" r="3.5" fill="#1f2937"/><circle cx="17" cy="18" r="1.4" fill="#9ca3af"/>
        <circle cx="29" cy="18" r="3.5" fill="#1f2937"/><circle cx="29" cy="18" r="1.4" fill="#9ca3af"/>
      </svg>`
      const truckImg = new Image(36, 22)
      truckImg.onload = () => {
        if (!m.hasImage('ck-truck')) m.addImage('ck-truck', truckImg)
        m.addLayer({
          id: 'ck-stores-layer',
          type: 'symbol',
          source: 'ck-stores',
          layout: {
            'icon-image': 'ck-truck',
            'icon-size': 1,
            'icon-allow-overlap': true,
            'icon-anchor': 'bottom',
          },
        })
      }
      truckImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(truckSvg)

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
          'circle-radius': ['step', ['get', 'point_count'], 10, 10, 14, 50, 18],
          'circle-opacity': 0.55,
        },
      })

      // Cluster count labels
      m.addLayer({
        id: 'tx-cluster-count',
        type: 'symbol',
        source: 'transactions',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 11,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        },
        paint: {
          'text-color': '#ffffff',
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
      const showCorridorPopup = (e: mapboxgl.MapLayerMouseEvent) => {
        m.getCanvas().style.cursor = 'pointer'
        const props = e.features?.[0]?.properties
        if (!props) return
        const oppColor = props.isHighway ? '#0ea5e9' : '#f97316'
        popup.setLngLat(e.lngLat).setHTML(
          `<div style="font-family:system-ui,sans-serif;font-size:12px;padding:6px 8px;line-height:1.7">
            <strong style="font-size:13px">${props.name}</strong><br/>
            <span style="color:#6b7280">Total: ${fmtGallons(props.totalGallons)}</span><br/>
            <span style="color:#16a34a">Circle K: ${fmtGallons(props.ckGallons)}</span><br/>
            <span style="color:#d97706">Near-Miss (≤5 mi): ${fmtGallons(props.nearMissGallons)}</span><br/>
            <span style="color:${oppColor}">Opportunity (≤30 mi): ${fmtGallons(props.captureGallons)}</span><br/>
            <span style="color:#dc2626">True Gap: ${fmtGallons(props.gapGallons)}</span>
          </div>`
        ).addTo(m)
      }
      const hideCorridorPopup = () => { m.getCanvas().style.cursor = ''; popup.remove() }
      m.on('mouseenter', 'corridors-active',     showCorridorPopup)
      m.on('mouseleave', 'corridors-active',     hideCorridorPopup)
      m.on('mouseenter', 'corridors-active-hwy', showCorridorPopup)
      m.on('mouseleave', 'corridors-active-hwy', hideCorridorPopup)

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
          <span className="w-3 h-3 rounded-full bg-yellow-400 shrink-0" />
          <span className="text-gray-600">Competitor (CK within 10 mi)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-600 shrink-0" />
          <span className="text-gray-600">Competitor (no CK nearby)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">🚛</span>
          <span className="text-gray-600">CK Truck Location</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-gray-500 shrink-0 opacity-60" />
          <span className="text-gray-600">Clustered fills (zoom in)</span>
        </div>
        <div className="border-t border-gray-100 pt-1.5 mt-1.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-amber-300 shrink-0" />
            <span className="text-gray-400">→</span>
            <span className="h-0.5 w-4 bg-orange-700 shrink-0" />
            <span className="text-gray-400 ml-1">Interstate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-sky-300 shrink-0" style={{ borderBottom: '2px dashed #7dd3fc' }} />
            <span className="text-gray-400">→</span>
            <span className="h-0.5 w-4 bg-sky-700 shrink-0" style={{ borderBottom: '2px dashed #0369a1' }} />
            <span className="text-gray-400 ml-1">US/state highway</span>
          </div>
          <p className="text-gray-400 text-[10px] pt-0.5">Hover corridors for detail</p>
        </div>
      </div>
    </div>
  )
}
