'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Maximize2, Minimize2 } from 'lucide-react'
import type { FMCSACarrier } from '@/lib/fmcsa-parser'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CKTruckSitePin {
  id: string
  name: string
  address: string
  city: string
  state: string
  coordinates: { lat: number; lng: number }
}

interface ProspectsMapProps {
  carriers: FMCSACarrier[]
  ckTruckSites: CKTruckSitePin[]
  proximityActive: boolean
  radiusMiles: number
  onCarrierClick: (dotNumber: string) => void
  height?: number
}

// ─── GeoJSON builders ─────────────────────────────────────────────────────────

function buildCKSitesGeoJSON(sites: CKTruckSitePin[]) {
  return {
    type: 'FeatureCollection' as const,
    features: sites.map(s => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [s.coordinates.lng, s.coordinates.lat],
      },
      properties: {
        id: s.id, name: s.name,
        address: s.address, city: s.city, state: s.state,
      },
    })),
  }
}

// Approximate lat/lng circle polygon (64 segments, no turf dependency)
function circleCoords(lat: number, lng: number, miles: number): number[][] {
  const latR = lat * Math.PI / 180
  const pts = 64
  const coords = Array.from({ length: pts }, (_, i) => {
    const angle = (i / pts) * 2 * Math.PI
    const dlat = (miles / 3959) * (180 / Math.PI) * Math.sin(angle)
    const dlng = (miles / 3959) * (180 / Math.PI) / Math.cos(latR) * Math.cos(angle)
    return [lng + dlng, lat + dlat]
  })
  coords.push(coords[0]) // close ring
  return coords
}

function buildRadiusGeoJSON(sites: CKTruckSitePin[], miles: number) {
  return {
    type: 'FeatureCollection' as const,
    features: sites.map(s => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [circleCoords(s.coordinates.lat, s.coordinates.lng, miles)],
      },
      properties: { name: s.name },
    })),
  }
}

function buildCarrierGeoJSON(
  carriers: FMCSACarrier[],
  radiusMiles: number,
  proximityActive: boolean
) {
  const geocoded = carriers.filter(c => c.lat !== undefined && c.lng !== undefined)
  return {
    type: 'FeatureCollection' as const,
    features: geocoded.map(c => {
      const inRadius = proximityActive && c.nearestCKTruckSite
        ? c.nearestCKTruckSite.distance <= radiusMiles
        : !proximityActive
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lng!, c.lat!] },
        properties: {
          dotNumber: c.dotNumber,
          legalName: c.legalName,
          powerUnits: c.powerUnits,
          isHotZone: c.isHotZone ?? false,
          inRadius,
        },
      }
    }),
  }
}

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] }

// ─── Component ────────────────────────────────────────────────────────────────

export function ProspectsMap({
  carriers,
  ckTruckSites,
  proximityActive,
  radiusMiles,
  onCarrierClick,
  height = 520,
}: ProspectsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const loadedRef = useRef(false)
  const frameRef = useRef<number>(0)
  const onClickRef = useRef(onCarrierClick)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => { onClickRef.current = onCarrierClick }, [onCarrierClick])

  // ── Initialize map once ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !mapboxgl.accessToken) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-93.5, 44.8],  // Minnesota center
      zoom: 6.2,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', () => {
      loadedRef.current = true

      // ── CK truck site sources & layers ──────────────────────────────────
      map.addSource('ck-truck-sites', {
        type: 'geojson',
        data: buildCKSitesGeoJSON(ckTruckSites),
      })
      // Pulsing ring (animated in rAF loop below)
      map.addLayer({
        id: 'ck-sites-pulse',
        type: 'circle',
        source: 'ck-truck-sites',
        paint: {
          'circle-radius': 14,
          'circle-color': '#ED8B00',
          'circle-opacity': 0.25,
          'circle-stroke-width': 0,
        },
      })
      // Solid pin
      map.addLayer({
        id: 'ck-sites',
        type: 'circle',
        source: 'ck-truck-sites',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 8, 8, 12, 11],
          'circle-color': '#ED8B00',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#7c3a00',
          'circle-opacity': 1,
        },
      })

      // ── Radius buffer ────────────────────────────────────────────────────
      map.addSource('radius-buffers', { type: 'geojson', data: EMPTY_FC })
      map.addLayer({
        id: 'radius-fill',
        type: 'fill',
        source: 'radius-buffers',
        paint: { 'fill-color': '#ED8B00', 'fill-opacity': 0.07 },
      })
      map.addLayer({
        id: 'radius-outline',
        type: 'line',
        source: 'radius-buffers',
        paint: {
          'line-color': '#ED8B00',
          'line-width': 1.5,
          'line-opacity': 0.55,
          'line-dasharray': [3, 3],
        },
      })

      // ── Carrier pins (clustered) ──────────────────────────────────────────
      map.addSource('carriers', {
        type: 'geojson',
        data: buildCarrierGeoJSON(carriers, radiusMiles, proximityActive),
        cluster: true,
        clusterMaxZoom: 11,
        clusterRadius: 45,
      })

      // Cluster circles — color by size
      map.addLayer({
        id: 'carrier-clusters',
        type: 'circle',
        source: 'carriers',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            '#93c5fd', 10,
            '#3b82f6', 50,
            '#1d4ed8',
          ],
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 30],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.9,
        },
      })
      // Cluster count label
      map.addLayer({
        id: 'carrier-cluster-count',
        type: 'symbol',
        source: 'carriers',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#fff' },
      })
      // Individual pins
      map.addLayer({
        id: 'carrier-pins',
        type: 'circle',
        source: 'carriers',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 7, 12, 10],
          'circle-color': [
            'case',
            ['==', ['get', 'isHotZone'], true], '#ED8B00',
            ['==', ['get', 'inRadius'], true], '#16a34a',
            '#fff',
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'isHotZone'], true], '#7c3a00',
            ['==', ['get', 'inRadius'], true], '#14532d',
            '#374151',
          ],
          'circle-opacity': 0.95,
        },
      })

      // ── Popups ───────────────────────────────────────────────────────────
      const popup = new mapboxgl.Popup({ closeButton: false, maxWidth: '230px' })

      // CK truck site hover
      map.on('mouseenter', 'ck-sites', e => {
        map.getCanvas().style.cursor = 'pointer'
        const p = e.features?.[0]?.properties
        if (!p || !e.lngLat) return
        popup.setLngLat(e.lngLat).setHTML(`
          <div style="font-family:sans-serif;padding:4px 2px">
            <div style="font-weight:700;font-size:13px;color:#ED8B00">Circle K Truck Stop</div>
            <div style="font-size:12px;color:#555;margin-top:2px">${p.address || ''}</div>
            <div style="font-size:12px;color:#777">${p.city}, ${p.state}</div>
          </div>
        `).addTo(map)
      })
      map.on('mouseleave', 'ck-sites', () => { map.getCanvas().style.cursor = ''; popup.remove() })

      // Carrier hover
      map.on('mouseenter', 'carrier-pins', e => {
        map.getCanvas().style.cursor = 'pointer'
        const p = e.features?.[0]?.properties
        if (!p || !e.lngLat) return
        const badge = p.isHotZone
          ? `<div style="font-size:11px;font-weight:600;color:#7c3a00;background:#fff7ed;padding:2px 6px;border-radius:3px;display:inline-block;margin-top:4px">🔥 Hot Zone</div>`
          : p.inRadius
          ? `<div style="font-size:11px;font-weight:600;color:#14532d;background:#f0fdf4;padding:2px 6px;border-radius:3px;display:inline-block;margin-top:4px">✓ In Radius</div>`
          : ''
        popup.setLngLat(e.lngLat).setHTML(`
          <div style="font-family:sans-serif;padding:4px 2px">
            <div style="font-weight:700;font-size:13px">${p.legalName || ''}</div>
            <div style="font-size:12px;color:#555;margin-top:2px">${p.powerUnits ?? 0} power units</div>
            ${badge}
            <div style="font-size:11px;color:#999;margin-top:4px">Click to view details</div>
          </div>
        `).addTo(map)
      })
      map.on('mouseleave', 'carrier-pins', () => { map.getCanvas().style.cursor = ''; popup.remove() })

      // Carrier click → notify parent
      map.on('click', 'carrier-pins', e => {
        const p = e.features?.[0]?.properties
        if (p?.dotNumber) onClickRef.current(p.dotNumber)
      })

      // Cluster click → zoom in
      map.on('click', 'carrier-clusters', e => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['carrier-clusters'] })
        const clusterId = features[0]?.properties?.cluster_id
        const src = map.getSource('carriers') as mapboxgl.GeoJSONSource
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || !e.lngLat) return
          map.easeTo({ center: e.lngLat, zoom: zoom ?? 10 })
        })
      })
      map.on('mouseenter', 'carrier-clusters', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'carrier-clusters', () => { map.getCanvas().style.cursor = '' })

      // ── Pulse animation ──────────────────────────────────────────────────
      let phase = 0
      const tick = () => {
        phase = (phase + 0.04) % (Math.PI * 2)
        if (map.isStyleLoaded()) {
          map.setPaintProperty('ck-sites-pulse', 'circle-radius', 11 + 7 * Math.sin(phase))
          map.setPaintProperty('ck-sites-pulse', 'circle-opacity', 0.12 + 0.14 * Math.sin(phase))
        }
        frameRef.current = requestAnimationFrame(tick)
      }
      tick()
    })

    mapRef.current = map
    return () => {
      cancelAnimationFrame(frameRef.current)
      map.remove()
      mapRef.current = null
      loadedRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Update CK sites source ────────────────────────────────────────────────
  useEffect(() => {
    if (!loadedRef.current || !mapRef.current) return
    const src = mapRef.current.getSource('ck-truck-sites') as mapboxgl.GeoJSONSource | undefined
    src?.setData(buildCKSitesGeoJSON(ckTruckSites))
  }, [ckTruckSites])

  // ── Update radius buffers ─────────────────────────────────────────────────
  useEffect(() => {
    if (!loadedRef.current || !mapRef.current) return
    const src = mapRef.current.getSource('radius-buffers') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    src.setData(proximityActive ? buildRadiusGeoJSON(ckTruckSites, radiusMiles) : EMPTY_FC)
  }, [ckTruckSites, proximityActive, radiusMiles])

  // ── Update carriers source ────────────────────────────────────────────────
  useEffect(() => {
    if (!loadedRef.current || !mapRef.current) return
    const src = mapRef.current.getSource('carriers') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    src.setData(buildCarrierGeoJSON(carriers, radiusMiles, proximityActive))

    // Fit bounds to geocoded carriers on first data arrival
    const geocoded = carriers.filter(c => c.lat !== undefined && c.lng !== undefined)
    if (geocoded.length > 0 && mapRef.current) {
      const bounds = new mapboxgl.LngLatBounds()
      geocoded.forEach(c => bounds.extend([c.lng!, c.lat!]))
      ckTruckSites.forEach(s => bounds.extend([s.coordinates.lng, s.coordinates.lat]))
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 10, duration: 800 })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carriers, radiusMiles, proximityActive])

  if (!mapboxgl.accessToken) {
    return (
      <div
        className="flex items-center justify-center bg-zinc-100 rounded-xl text-zinc-500 text-sm"
        style={{ height }}
      >
        Mapbox token not configured — add <code className="bg-zinc-200 px-1 rounded mx-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> to your environment.
      </div>
    )
  }

  const outerStyle = fullscreen
    ? { position: 'fixed' as const, inset: 0, zIndex: 50, height: '100vh' }
    : { height }

  return (
    <div className="relative" style={outerStyle}>
      <div
        ref={containerRef}
        style={{
          width: '100%', height: '100%',
          borderRadius: fullscreen ? 0 : '12px',
          overflow: 'hidden',
        }}
      />

      <button
        onClick={() => setFullscreen(v => !v)}
        aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        className="absolute top-3 right-14 z-10 bg-white/95 rounded-lg border border-gray-200 shadow-sm p-1.5 text-gray-500 hover:text-gray-800 hover:bg-white transition-colors"
      >
        {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>

      {/* Legend */}
      <div className="absolute bottom-6 left-4 bg-white/95 rounded-xl shadow-md p-3 text-xs space-y-1.5 border border-gray-200">
        <p className="text-gray-400 font-semibold uppercase tracking-wide mb-2" style={{ fontSize: 10 }}>
          Legend
        </p>
        <LegendItem color="#ED8B00" stroke="#7c3a00" label="Circle K Truck Stop" />
        <LegendItem color="#ED8B00" stroke="#7c3a00" label="Hot Zone carrier (≤ 1 mi)" dimFill />
        <LegendItem color="#16a34a" stroke="#14532d" label="Carrier in radius" />
        <LegendItem color="#fff" stroke="#374151" label="Carrier outside radius" />
        <div className="flex items-center gap-2">
          <span className="inline-block rounded" style={{ width: 18, height: 10, background: '#3b82f6', opacity: 0.85 }} />
          <span className="text-gray-600">Cluster (click to expand)</span>
        </div>
      </div>
    </div>
  )
}

function LegendItem({
  color, stroke, label, dimFill,
}: {
  color: string; stroke: string; label: string; dimFill?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="rounded-full shrink-0 border"
        style={{
          backgroundColor: color,
          borderColor: stroke,
          width: 10, height: 10,
          opacity: dimFill ? 0.6 : 1,
        }}
      />
      <span className="text-gray-600">{label}</span>
    </div>
  )
}
