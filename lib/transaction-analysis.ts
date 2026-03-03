// Transaction analysis engine — compares fueling data to Circle K store footprint

import type { FuelingTransaction } from './transaction-parser'
import { normalizeBrandName } from './transaction-parser'
import type { GeocodedCoord } from './geocoding'
import { geoKey } from './geocoding'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrandSummary {
  brand: string
  displayName: string
  transactions: number
  gallons: number
  spend: number
  isCircleK: boolean
}

export interface StateSummary {
  state: string
  transactions: number
  gallons: number
  spend: number
  ckTransactions: number
  ckGallons: number
  ckSharePct: number
}

export interface LocationSummary {
  stationName: string
  stationBrand: string
  displayBrand: string
  city: string
  state: string
  zipCode: string
  transactions: number
  gallons: number
  spend: number
  hasCKNearby: boolean       // CK store exists in same ZIP
  nearestCKDistanceMi: number // -1 = not geocoded
}

export interface VehicleSummary {
  unitNumber: string
  driverCity: string
  transactions: number
  gallons: number
  spend: number
  ckGallons: number
  ckTransactions: number
  ckSharePct: number
}

export interface FuelTypeSummary {
  type: string
  transactions: number
  gallons: number
  spend: number
}

export interface CKCaptureAnalysis {
  captured:   { transactions: number; gallons: number; spend: number }
  capturable: { transactions: number; gallons: number; spend: number }
  gap:        { transactions: number; gallons: number; spend: number }
  captureRate: number
  potentialRate: number
}

/** A single map point representing aggregated fueling in one city */
export interface MapPoint {
  lat: number
  lng: number
  gallons: number
  transactions: number
  spend: number
  isCircleK: boolean          // true if ALL transactions at this point are CK
  hasMixedBrands: boolean
  label: string               // display name: stationName or "city, state"
  city: string
  state: string
  nearestCKDistanceMi: number // -1 = no CK stores loaded
}

export interface ProximityBucket {
  gallons: number
  transactions: number
  spend: number
}

export interface ProximityBreakdown {
  ckGallons:     number
  within1mi:     ProximityBucket
  within2mi:     ProximityBucket   // 1–2mi
  within5mi:     ProximityBucket   // 2–5mi
  within10mi:    ProximityBucket   // 5–10mi
  beyond10mi:    ProximityBucket
  geocodedPct:   number            // % of total gallons that were geocoded
}

export interface TransactionSummary {
  totalTransactions: number
  totalGallons: number
  totalSpend: number
  uniqueVehicles: number
  uniqueStations: number
  uniqueStates: string[]
  dateRange: { start: string; end: string }
  detectedFormat: string
  brandBreakdown: BrandSummary[]
  ckCaptureAnalysis: CKCaptureAnalysis
  stateBreakdown: StateSummary[]
  topCompetitorLocations: LocationSummary[]
  fuelTypeBreakdown: FuelTypeSummary[]
  vehicleBreakdown: VehicleSummary[]
  // Map data — populated after geocoding
  mapPoints: MapPoint[]
  proximityBreakdown: ProximityBreakdown | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDate(dateStr: string): Date | null {
  // Handles M/D/YYYY and YYYY-MM-DD
  if (!dateStr) return null
  if (dateStr.includes('-')) {
    const d = new Date(dateStr + 'T00:00:00')
    return isNaN(d.getTime()) ? null : d
  }
  const parts = dateStr.split('/')
  if (parts.length !== 3) return null
  const d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]))
  return isNaN(d.getTime()) ? null : d
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Haversine distance in miles between two lat/lng points */
export function haversineDistanceMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

export interface CKStoreCoord {
  lat: number
  lng: number
}

/** Find the nearest CK store distance in miles for a given coordinate */
export function nearestCKDistance(
  lat: number,
  lng: number,
  ckStores: CKStoreCoord[]
): number {
  if (ckStores.length === 0) return -1
  let min = Infinity
  for (const store of ckStores) {
    const d = haversineDistanceMi(lat, lng, store.lat, store.lng)
    if (d < min) min = d
  }
  return min
}

export function buildCKZipSet(stores: Array<{ zip: string }>): Set<string> {
  const zips = new Set<string>()
  for (const store of stores) {
    const zip = store.zip.replace(/[^0-9]/g, '').substring(0, 5)
    if (zip.length === 5) zips.add(zip)
  }
  return zips
}

// ─── Core analysis ────────────────────────────────────────────────────────────

export function analyzeTransactions(
  transactions: FuelingTransaction[],
  ckZipSet: Set<string>,
  options?: {
    detectedFormat?: string
    geocodedCoords?: Map<string, GeocodedCoord>  // key: geoKey(city, state)
    ckStores?: CKStoreCoord[]
  }
): TransactionSummary {
  if (transactions.length === 0) return createEmptySummary()

  const { detectedFormat = 'Unknown', geocodedCoords, ckStores } = options ?? {}

  const totalTransactions = transactions.length
  const totalGallons = transactions.reduce((s, t) => s + t.gallons, 0)
  const totalSpend = transactions.reduce((s, t) => s + t.amount, 0)
  const uniqueVehicles = new Set(transactions.map(t => t.unitNumber || '?')).size
  const uniqueStations = new Set(transactions.map(t => `${t.stationName}||${t.zipCode}`)).size
  const uniqueStates = Array.from(new Set(transactions.map(t => t.stationState).filter(Boolean))).sort()

  // Date range
  const dates = transactions.map(t => parseDate(t.transDate)).filter((d): d is Date => d !== null)
  const dateRange =
    dates.length > 0
      ? {
          start: formatDate(new Date(Math.min(...dates.map(d => d.getTime())))),
          end: formatDate(new Date(Math.max(...dates.map(d => d.getTime())))),
        }
      : { start: '', end: '' }

  // Brand breakdown
  const brandMap = new Map<string, BrandSummary>()
  for (const t of transactions) {
    const brand = t.stationBrand || 'UNKNOWN'
    const existing = brandMap.get(brand) ?? {
      brand,
      displayName: normalizeBrandName(brand),
      transactions: 0,
      gallons: 0,
      spend: 0,
      isCircleK: t.isCircleK,
    }
    existing.transactions++
    existing.gallons += t.gallons
    existing.spend += t.amount
    brandMap.set(brand, existing)
  }
  const brandBreakdown = Array.from(brandMap.values()).sort((a, b) => b.gallons - a.gallons)

  // CK capture analysis (ZIP-based)
  const captured   = { transactions: 0, gallons: 0, spend: 0 }
  const capturable = { transactions: 0, gallons: 0, spend: 0 }
  const gap        = { transactions: 0, gallons: 0, spend: 0 }

  for (const t of transactions) {
    if (t.isCircleK) {
      captured.transactions++; captured.gallons += t.gallons; captured.spend += t.amount
    } else if (ckZipSet.has(t.zipCode)) {
      capturable.transactions++; capturable.gallons += t.gallons; capturable.spend += t.amount
    } else {
      gap.transactions++; gap.gallons += t.gallons; gap.spend += t.amount
    }
  }

  const captureRate  = totalGallons > 0 ? (captured.gallons / totalGallons) * 100 : 0
  const potentialRate = totalGallons > 0 ? ((captured.gallons + capturable.gallons) / totalGallons) * 100 : 0

  // State breakdown
  const stateMap = new Map<string, StateSummary>()
  for (const t of transactions) {
    const state = t.stationState || 'Unknown'
    const existing = stateMap.get(state) ?? { state, transactions: 0, gallons: 0, spend: 0, ckTransactions: 0, ckGallons: 0, ckSharePct: 0 }
    existing.transactions++; existing.gallons += t.gallons; existing.spend += t.amount
    if (t.isCircleK) { existing.ckTransactions++; existing.ckGallons += t.gallons }
    stateMap.set(state, existing)
  }
  const stateBreakdown = Array.from(stateMap.values())
    .map(s => ({ ...s, ckSharePct: s.gallons > 0 ? (s.ckGallons / s.gallons) * 100 : 0 }))
    .sort((a, b) => b.gallons - a.gallons)

  // Top competitor locations
  const locMap = new Map<string, LocationSummary>()
  for (const t of transactions) {
    if (t.isCircleK) continue
    const key = `${t.stationName}||${t.stationCity}||${t.stationState}||${t.zipCode}`
    const existing = locMap.get(key) ?? {
      stationName: t.stationName || `${t.stationCity}, ${t.stationState}`,
      stationBrand: t.stationBrand,
      displayBrand: normalizeBrandName(t.stationBrand || 'Unknown'),
      city: t.stationCity,
      state: t.stationState,
      zipCode: t.zipCode,
      transactions: 0,
      gallons: 0,
      spend: 0,
      hasCKNearby: ckZipSet.has(t.zipCode),
      nearestCKDistanceMi: -1,
    }
    existing.transactions++; existing.gallons += t.gallons; existing.spend += t.amount
    locMap.set(key, existing)
  }

  // Enrich with geocoded distance
  if (geocodedCoords && ckStores) {
    for (const loc of locMap.values()) {
      const coord = geocodedCoords.get(geoKey(loc.city, loc.state))
      if (coord) {
        loc.nearestCKDistanceMi = nearestCKDistance(coord.lat, coord.lng, ckStores)
      }
    }
  }

  const topCompetitorLocations = Array.from(locMap.values())
    .sort((a, b) => b.gallons - a.gallons)
    .slice(0, 25)

  // Fuel type breakdown
  const fuelMap = new Map<string, FuelTypeSummary>()
  for (const t of transactions) {
    const type = t.fuelType || 'Unknown'
    const existing = fuelMap.get(type) ?? { type, transactions: 0, gallons: 0, spend: 0 }
    existing.transactions++; existing.gallons += t.gallons; existing.spend += t.amount
    fuelMap.set(type, existing)
  }
  const fuelTypeBreakdown = Array.from(fuelMap.values()).sort((a, b) => b.gallons - a.gallons)

  // Vehicle breakdown
  const vehicleMap = new Map<string, VehicleSummary>()
  for (const t of transactions) {
    const unit = t.unitNumber || 'Unknown'
    const existing = vehicleMap.get(unit) ?? {
      unitNumber: unit,
      driverCity: t.driverCity,
      transactions: 0, gallons: 0, spend: 0, ckGallons: 0, ckTransactions: 0, ckSharePct: 0,
    }
    existing.transactions++; existing.gallons += t.gallons; existing.spend += t.amount
    if (t.isCircleK) { existing.ckGallons += t.gallons; existing.ckTransactions++ }
    vehicleMap.set(unit, existing)
  }
  const vehicleBreakdown = Array.from(vehicleMap.values())
    .map(v => ({ ...v, ckSharePct: v.gallons > 0 ? (v.ckGallons / v.gallons) * 100 : 0 }))
    .sort((a, b) => b.gallons - a.gallons)

  // Map points + proximity breakdown (requires geocoding)
  const { mapPoints, proximityBreakdown } = buildMapData(transactions, geocodedCoords, ckStores, totalGallons)

  return {
    totalTransactions, totalGallons, totalSpend, uniqueVehicles, uniqueStations, uniqueStates,
    dateRange, detectedFormat,
    brandBreakdown,
    ckCaptureAnalysis: { captured, capturable, gap, captureRate, potentialRate },
    stateBreakdown,
    topCompetitorLocations,
    fuelTypeBreakdown,
    vehicleBreakdown,
    mapPoints,
    proximityBreakdown,
  }
}

// ─── Map data builder ─────────────────────────────────────────────────────────

function buildMapData(
  transactions: FuelingTransaction[],
  geocodedCoords: Map<string, GeocodedCoord> | undefined,
  ckStores: CKStoreCoord[] | undefined,
  totalGallons: number
): { mapPoints: MapPoint[]; proximityBreakdown: ProximityBreakdown | null } {
  if (!geocodedCoords || geocodedCoords.size === 0) {
    return { mapPoints: [], proximityBreakdown: null }
  }

  // Aggregate transactions by city+state
  type CityKey = string
  const cityMap = new Map<CityKey, {
    gallons: number; transactions: number; spend: number
    ckGallons: number; brands: Set<string>; label: string
    city: string; state: string
  }>()

  for (const t of transactions) {
    const key = geoKey(t.stationCity, t.stationState)
    const existing = cityMap.get(key) ?? {
      gallons: 0, transactions: 0, spend: 0, ckGallons: 0,
      brands: new Set(),
      label: t.stationName || `${t.stationCity}, ${t.stationState}`,
      city: t.stationCity,
      state: t.stationState,
    }
    existing.gallons += t.gallons
    existing.transactions++
    existing.spend += t.amount
    if (t.isCircleK) existing.ckGallons += t.gallons
    if (t.stationBrand) existing.brands.add(t.stationBrand)
    cityMap.set(key, existing)
  }

  const mapPoints: MapPoint[] = []

  // Proximity buckets (non-CK only)
  const prox = {
    ckGallons:  0,
    within1mi:  { gallons: 0, transactions: 0, spend: 0 },
    within2mi:  { gallons: 0, transactions: 0, spend: 0 },
    within5mi:  { gallons: 0, transactions: 0, spend: 0 },
    within10mi: { gallons: 0, transactions: 0, spend: 0 },
    beyond10mi: { gallons: 0, transactions: 0, spend: 0 },
    geocodedGallons: 0,
  }

  for (const [key, agg] of cityMap) {
    const coord = geocodedCoords.get(key)
    if (!coord) continue

    const dist = ckStores ? nearestCKDistance(coord.lat, coord.lng, ckStores) : -1
    const allCK = agg.ckGallons === agg.gallons

    mapPoints.push({
      lat: coord.lat,
      lng: coord.lng,
      gallons: agg.gallons,
      transactions: agg.transactions,
      spend: agg.spend,
      isCircleK: allCK,
      hasMixedBrands: agg.brands.size > 1,
      label: `${agg.city}, ${agg.state}`,
      city: agg.city,
      state: agg.state,
      nearestCKDistanceMi: dist,
    })

    prox.geocodedGallons += agg.gallons
    prox.ckGallons += agg.ckGallons

    const nonCKGallons = agg.gallons - agg.ckGallons
    const nonCKTrans = Math.round(agg.transactions * (nonCKGallons / Math.max(agg.gallons, 1)))
    const nonCKSpend = agg.spend * (nonCKGallons / Math.max(agg.gallons, 1))

    if (dist >= 0 && !allCK) {
      const bucket =
        dist < 1 ? prox.within1mi :
        dist < 2 ? prox.within2mi :
        dist < 5 ? prox.within5mi :
        dist < 10 ? prox.within10mi :
        prox.beyond10mi

      bucket.gallons += nonCKGallons
      bucket.transactions += nonCKTrans
      bucket.spend += nonCKSpend
    }
  }

  const geocodedPct = totalGallons > 0 ? (prox.geocodedGallons / totalGallons) * 100 : 0

  return {
    mapPoints,
    proximityBreakdown: {
      ckGallons:   prox.ckGallons,
      within1mi:   prox.within1mi,
      within2mi:   prox.within2mi,
      within5mi:   prox.within5mi,
      within10mi:  prox.within10mi,
      beyond10mi:  prox.beyond10mi,
      geocodedPct,
    },
  }
}

// ─── Empty summary ────────────────────────────────────────────────────────────

function createEmptySummary(): TransactionSummary {
  return {
    totalTransactions: 0, totalGallons: 0, totalSpend: 0,
    uniqueVehicles: 0, uniqueStations: 0, uniqueStates: [],
    dateRange: { start: '', end: '' }, detectedFormat: 'Unknown',
    brandBreakdown: [],
    ckCaptureAnalysis: {
      captured:   { transactions: 0, gallons: 0, spend: 0 },
      capturable: { transactions: 0, gallons: 0, spend: 0 },
      gap:        { transactions: 0, gallons: 0, spend: 0 },
      captureRate: 0, potentialRate: 0,
    },
    stateBreakdown: [],
    topCompetitorLocations: [],
    fuelTypeBreakdown: [],
    vehicleBreakdown: [],
    mapPoints: [],
    proximityBreakdown: null,
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function fmtGallons(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function fmtDollars(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function fmtPct(n: number): string {
  return n.toFixed(1) + '%'
}

export function fmtMiles(n: number): string {
  return n < 0 ? '—' : n.toFixed(1) + ' mi'
}
