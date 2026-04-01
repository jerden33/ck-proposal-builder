// Transaction analysis engine — compares fueling data to Circle K store footprint

import type { FuelingTransaction } from './transaction-parser'
import { normalizeBrandName } from './transaction-parser'
import type { GeocodedCoord } from './geocoding'
import { geoKey, addrGeoKey } from './geocoding'

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
  capturableGallons: number  // non-CK gallons where a CK exists in the same ZIP
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
  hasCKNearby: boolean       // CK within 2 mi (geocoded) or same ZIP (fallback)
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
  capturableGallons: number   // non-CK gallons where CK exists in same ZIP
  topCompetitorBrand: string  // competitor brand with most gallons for this vehicle
  avgDaysBetweenFills: number // avg days between transaction dates (0 if < 2 fills)
}

/** Per-driver behavioral summary — keyed by driverName, parallel to VehicleSummary */
export interface DriverSummary {
  driverName: string
  driverCity: string
  unitNumbers: string[]       // unique vehicles this driver used
  transactions: number
  gallons: number
  spend: number
  ckGallons: number
  ckTransactions: number
  ckSharePct: number
  capturableGallons: number
  topCompetitorBrand: string
  avgDaysBetweenFills: number
}

export interface HourlyBucket {
  hour: number   // 0–23
  gallons: number
  transactions: number
  ckGallons: number
}

export interface DayOfWeekBucket {
  day: number    // 0=Sun … 6=Sat
  dayName: string
  gallons: number
  transactions: number
  ckGallons: number
}

export interface VehicleSegment {
  segment: 'ck-loyal' | 'mixed' | 'mostly-competitor' | 'never-ck'
  label: string
  description: string
  color: string
  count: number
  gallons: number
  unitNumbers: string[]
}

export interface FraudFlag {
  type: 'high-gallons' | 'multi-fill' | 'ppg-outlier' | 'state-hop'
  severity: 'high' | 'medium'
  unitNumber: string
  transDate: string
  description: string
  gallons: number
  amount: number
  stationCity: string
  stationState: string
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
  // Driver-keyed breakdown — populated only when source data includes driver names
  hasDriverData: boolean
  driverBreakdown: DriverSummary[]
  driverSegments: VehicleSegment[]
  // Behavioral / timing
  hasTimeData: boolean
  hourlyBreakdown: HourlyBucket[]    // empty if no time data
  dayOfWeekBreakdown: DayOfWeekBucket[]
  vehicleSegments: VehicleSegment[]
  fraudFlags: FraudFlag[]
  // Map data — populated after geocoding
  mapPoints: MapPoint[]
  proximityBreakdown: ProximityBreakdown | null
  proximityBreakdownAll: ProximityBreakdown | null  // against all CK sites (not just truck)
  topCKOpportunityLocations: CKOpportunityLocation[]  // CK stores with most nearby competitor gallons
  // Rep-configured rebate rate (¢/gal), saved with analysis
  rebateRate?: number
  // Whether OTR/truck mode was active when analysis was saved
  truckMode?: boolean
  // Corridor-based OTR opportunity analysis (populated after geocoding)
  otrAnalysis?: import('./otr-analysis').OTRAnalysis
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
  // optional enrichment — used for CK opportunity aggregation
  name?: string
  city?: string
  state?: string
  truckAccessible?: boolean
  siteNumber?: string
}

export interface CKOpportunityLocation {
  ckName: string
  city: string
  state: string
  lat: number
  lng: number
  truckAccessible: boolean
  siteNumber?: string
  competitorGallons: number
  competitorTransactions: number
  competitorSpend: number
  nearbyStationCount: number   // distinct competitor stations within radius
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

/** Find the nearest CK store and its distance for a given coordinate */
function findNearestCKStore(
  lat: number,
  lng: number,
  ckStores: CKStoreCoord[]
): { store: CKStoreCoord; distanceMi: number } | null {
  if (ckStores.length === 0) return null
  let best: CKStoreCoord | null = null
  let bestDist = Infinity
  for (const store of ckStores) {
    const d = haversineDistanceMi(lat, lng, store.lat, store.lng)
    if (d < bestDist) { bestDist = d; best = store }
  }
  return best ? { store: best, distanceMi: bestDist } : null
}

export function buildCKZipSet(stores: Array<{ zip: string }>): Set<string> {
  const zips = new Set<string>()
  for (const store of stores) {
    const zip = store.zip.replace(/[^0-9]/g, '').substring(0, 5)
    if (zip.length === 5) zips.add(zip)
  }
  return zips
}

// ─── Behavioural / timing helpers ─────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Normalize a date string to "YYYY-MM-DD" so new Date() always parses it correctly.
 * Handles "MM/DD/YYYY", "M/D/YYYY", and already-ISO "YYYY-MM-DD" forms.
 */
function toISODate(dateStr: string): string {
  if (!dateStr) return ''
  // Already ISO — just return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  // US M/D/YYYY or MM/DD/YYYY
  const mdy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  return dateStr  // unknown format — let Date() try
}

function buildHourlyBreakdown(transactions: FuelingTransaction[]): HourlyBucket[] {
  const buckets: HourlyBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h, gallons: 0, transactions: 0, ckGallons: 0,
  }))
  for (const t of transactions) {
    if (!t.transTime) continue
    const h = parseInt(t.transTime.split(':')[0])
    if (isNaN(h) || h < 0 || h > 23) continue
    buckets[h].gallons += t.gallons
    buckets[h].transactions++
    if (t.isCircleK) buckets[h].ckGallons += t.gallons
  }
  return buckets
}

function buildDayOfWeekBreakdown(transactions: FuelingTransaction[]): DayOfWeekBucket[] {
  const buckets: DayOfWeekBucket[] = Array.from({ length: 7 }, (_, d) => ({
    day: d, dayName: DAY_NAMES[d], gallons: 0, transactions: 0, ckGallons: 0,
  }))
  for (const t of transactions) {
    if (!t.transDate) continue
    const d = new Date(toISODate(t.transDate) + 'T00:00:00')
    if (isNaN(d.getTime())) continue
    const dow = d.getDay()
    buckets[dow].gallons += t.gallons
    buckets[dow].transactions++
    if (t.isCircleK) buckets[dow].ckGallons += t.gallons
  }
  return buckets
}

function buildVehicleSegments(vehicleBreakdown: VehicleSummary[]): VehicleSegment[] {
  const defs: { segment: VehicleSegment['segment']; label: string; description: string; color: string; test: (v: VehicleSummary) => boolean }[] = [
    { segment: 'ck-loyal',          label: 'CK Loyal',         description: '≥ 70% of gallons at Circle K',       color: '#16a34a', test: v => v.ckSharePct >= 70 },
    { segment: 'mixed',             label: 'Mixed',             description: '20–69% at Circle K',                 color: '#3b82f6', test: v => v.ckSharePct >= 20 && v.ckSharePct < 70 },
    { segment: 'mostly-competitor', label: 'Mostly Competitor', description: '1–19% at Circle K',                  color: '#f59e0b', test: v => v.ckSharePct > 0  && v.ckSharePct < 20 },
    { segment: 'never-ck',          label: 'Never CK',          description: '0% at Circle K',                     color: '#dc2626', test: v => v.ckSharePct === 0 },
  ]
  return defs.map(def => {
    const matched = vehicleBreakdown.filter(def.test)
    return {
      segment: def.segment,
      label: def.label,
      description: def.description,
      color: def.color,
      count: matched.length,
      gallons: matched.reduce((s, v) => s + v.gallons, 0),
      unitNumbers: matched.map(v => v.unitNumber),
    }
  })
}

function detectFraudFlags(transactions: FuelingTransaction[]): FraudFlag[] {
  const flags: FraudFlag[] = []

  // 1. High gallons per fill (standard diesel tank ≈ 150 gal; flag > 200)
  for (const t of transactions) {
    if (t.gallons >= 200) {
      flags.push({
        type: 'high-gallons',
        severity: t.gallons >= 300 ? 'high' : 'medium',
        unitNumber: t.unitNumber || 'Unknown',
        transDate: t.transDate,
        description: `Single fill of ${t.gallons.toFixed(0)} gal — exceeds typical tank capacity`,
        gallons: t.gallons,
        amount: t.amount,
        stationCity: t.stationCity,
        stationState: t.stationState,
      })
    }
  }

  // 2. Multi-fill same vehicle same day (≥ 3 fills)
  const byUnitDate = new Map<string, FuelingTransaction[]>()
  for (const t of transactions) {
    const key = `${t.unitNumber || 'Unknown'}|${t.transDate}`
    const arr = byUnitDate.get(key) ?? []
    arr.push(t)
    byUnitDate.set(key, arr)
  }
  for (const [key, fills] of Array.from(byUnitDate)) {
    if (fills.length < 3) continue
    const [unit, date] = key.split('|')
    const totalGal = fills.reduce((s, t) => s + t.gallons, 0)
    flags.push({
      type: 'multi-fill',
      severity: fills.length >= 4 ? 'high' : 'medium',
      unitNumber: unit,
      transDate: date,
      description: `${fills.length} fills in one day totaling ${totalGal.toFixed(0)} gal`,
      gallons: totalGal,
      amount: fills.reduce((s, t) => s + t.amount, 0),
      stationCity: fills[0].stationCity,
      stationState: fills[0].stationState,
    })
  }

  // 3. PPG outlier (only when spend data is present)
  const ppgValues = transactions
    .filter(t => t.gallons > 5 && t.amount > 0)
    .map(t => t.amount / t.gallons)
    .sort((a, b) => a - b)
  if (ppgValues.length > 10) {
    const medianPPG = ppgValues[Math.floor(ppgValues.length / 2)]
    for (const t of transactions) {
      if (t.gallons <= 5 || t.amount <= 0) continue
      const ppg = t.amount / t.gallons
      if (ppg > medianPPG * 2.5 || ppg < 1.0) {
        flags.push({
          type: 'ppg-outlier',
          severity: 'medium',
          unitNumber: t.unitNumber || 'Unknown',
          transDate: t.transDate,
          description: `$${ppg.toFixed(2)}/gal vs fleet median $${medianPPG.toFixed(2)}/gal`,
          gallons: t.gallons,
          amount: t.amount,
          stationCity: t.stationCity,
          stationState: t.stationState,
        })
      }
    }
  }

  // 4. State hop — same vehicle in 2+ states on same day
  for (const [key, fills] of Array.from(byUnitDate)) {
    const states = new Set(fills.map(t => t.stationState).filter(Boolean))
    if (states.size < 2) continue
    const [unit, date] = key.split('|')
    flags.push({
      type: 'state-hop',
      severity: 'high',
      unitNumber: unit,
      transDate: date,
      description: `Vehicle in ${states.size} states on same day: ${Array.from(states).join(', ')}`,
      gallons: fills.reduce((s, t) => s + t.gallons, 0),
      amount: fills.reduce((s, t) => s + t.amount, 0),
      stationCity: fills[0].stationCity,
      stationState: fills[0].stationState,
    })
  }

  // Deduplicate: if a multi-fill and state-hop fire for the same (unit, date), keep both but flag once
  return flags.sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1))
}

// ─── Core analysis ────────────────────────────────────────────────────────────

export function analyzeTransactions(
  transactions: FuelingTransaction[],
  ckZipSet: Set<string>,
  options?: {
    detectedFormat?: string
    geocodedCoords?: Map<string, GeocodedCoord>    // key: geoKey(city, state)
    geocodedAddresses?: Map<string, GeocodedCoord> // key: addrGeoKey(addr, city, state)
    ckStores?: CKStoreCoord[]
    ckStoresAll?: CKStoreCoord[]  // all CK sites (c-stores + truck), for mixed-fleet proximity
  }
): TransactionSummary {
  if (transactions.length === 0) return createEmptySummary()

  const { detectedFormat = 'Unknown', geocodedCoords, geocodedAddresses, ckStores, ckStoresAll } = options ?? {}

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
    const existing = stateMap.get(state) ?? { state, transactions: 0, gallons: 0, spend: 0, ckTransactions: 0, ckGallons: 0, ckSharePct: 0, capturableGallons: 0 }
    existing.transactions++; existing.gallons += t.gallons; existing.spend += t.amount
    if (t.isCircleK) { existing.ckTransactions++; existing.ckGallons += t.gallons }
    else if (ckZipSet.has(t.zipCode)) { existing.capturableGallons += t.gallons }
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

  // Enrich with geocoded distance; update hasCKNearby to distance-based (≤2mi)
  if (geocodedCoords && ckStores) {
    for (const loc of Array.from(locMap.values())) {
      const coord = geocodedCoords.get(geoKey(loc.city, loc.state))
      if (coord) {
        loc.nearestCKDistanceMi = nearestCKDistance(coord.lat, coord.lng, ckStores)
        loc.hasCKNearby = loc.nearestCKDistanceMi >= 0 && loc.nearestCKDistanceMi <= 2
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

  // Vehicle breakdown — include capturable gallons, top competitor brand, avg fill frequency
  type VehicleAcc = Omit<VehicleSummary, 'ckSharePct' | 'topCompetitorBrand' | 'avgDaysBetweenFills'> & {
    competitorBrandGallons: Map<string, number>
    fillDates: string[]
  }
  const vehicleMap = new Map<string, VehicleAcc>()
  for (const t of transactions) {
    const unit = t.unitNumber || 'Unknown'
    const existing = vehicleMap.get(unit) ?? {
      unitNumber: unit,
      driverCity: t.driverCity,
      transactions: 0, gallons: 0, spend: 0, ckGallons: 0, ckTransactions: 0,
      capturableGallons: 0,
      competitorBrandGallons: new Map<string, number>(),
      fillDates: [] as string[],
    }
    existing.transactions++
    existing.gallons += t.gallons
    existing.spend += t.amount
    if (t.transDate) existing.fillDates.push(t.transDate)
    if (t.isCircleK) {
      existing.ckGallons += t.gallons
      existing.ckTransactions++
    } else {
      if (ckZipSet.has(t.zipCode)) existing.capturableGallons += t.gallons
      const brand = t.stationBrand || 'Unknown'
      existing.competitorBrandGallons.set(brand, (existing.competitorBrandGallons.get(brand) ?? 0) + t.gallons)
    }
    vehicleMap.set(unit, existing)
  }
  const vehicleBreakdown: VehicleSummary[] = Array.from(vehicleMap.values()).map(v => {
    // top competitor brand
    let topBrand = ''; let topGal = 0
    for (const [brand, gal] of Array.from(v.competitorBrandGallons)) {
      if (gal > topGal) { topGal = gal; topBrand = brand }
    }
    // avg days between fills
    const uniqueDates = Array.from(new Set(v.fillDates))
      .map(d => new Date(toISODate(d) + 'T00:00:00'))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())
    const avgDaysBetweenFills = uniqueDates.length < 2 ? 0
      : (uniqueDates[uniqueDates.length - 1].getTime() - uniqueDates[0].getTime())
        / (1000 * 60 * 60 * 24) / (uniqueDates.length - 1)
    return {
      unitNumber: v.unitNumber, driverCity: v.driverCity,
      transactions: v.transactions, gallons: v.gallons, spend: v.spend,
      ckGallons: v.ckGallons, ckTransactions: v.ckTransactions,
      ckSharePct: v.gallons > 0 ? (v.ckGallons / v.gallons) * 100 : 0,
      capturableGallons: v.capturableGallons,
      topCompetitorBrand: topBrand ? normalizeBrandName(topBrand) : '—',
      avgDaysBetweenFills: Math.round(avgDaysBetweenFills * 10) / 10,
    }
  }).sort((a, b) => b.gallons - a.gallons)

  // Driver breakdown — parallel to vehicle breakdown, keyed by driverName
  type DriverAcc = Omit<DriverSummary, 'ckSharePct' | 'topCompetitorBrand' | 'avgDaysBetweenFills' | 'unitNumbers'> & {
    competitorBrandGallons: Map<string, number>
    fillDates: string[]
    unitNumberSet: Set<string>
  }
  const driverMap = new Map<string, DriverAcc>()
  const hasDriverData = transactions.some(t => !!t.driverName)
  if (hasDriverData) {
    for (const t of transactions) {
      const key = t.driverName || 'Unknown'
      const existing = driverMap.get(key) ?? {
        driverName: key,
        driverCity: t.driverCity,
        transactions: 0, gallons: 0, spend: 0, ckGallons: 0, ckTransactions: 0,
        capturableGallons: 0,
        competitorBrandGallons: new Map<string, number>(),
        fillDates: [] as string[],
        unitNumberSet: new Set<string>(),
      }
      existing.transactions++
      existing.gallons += t.gallons
      existing.spend += t.amount
      if (t.transDate) existing.fillDates.push(t.transDate)
      if (t.unitNumber) existing.unitNumberSet.add(t.unitNumber)
      if (t.isCircleK) {
        existing.ckGallons += t.gallons
        existing.ckTransactions++
      } else {
        if (ckZipSet.has(t.zipCode)) existing.capturableGallons += t.gallons
        const brand = t.stationBrand || 'Unknown'
        existing.competitorBrandGallons.set(brand, (existing.competitorBrandGallons.get(brand) ?? 0) + t.gallons)
      }
      driverMap.set(key, existing)
    }
  }
  const driverBreakdown: DriverSummary[] = Array.from(driverMap.values()).map(d => {
    let topBrand = ''; let topGal = 0
    for (const [brand, gal] of Array.from(d.competitorBrandGallons)) {
      if (gal > topGal) { topGal = gal; topBrand = brand }
    }
    const uniqueDates = Array.from(new Set(d.fillDates))
      .map(s => new Date(toISODate(s) + 'T00:00:00'))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())
    const avgDaysBetweenFills = uniqueDates.length < 2 ? 0
      : (uniqueDates[uniqueDates.length - 1].getTime() - uniqueDates[0].getTime())
        / (1000 * 60 * 60 * 24) / (uniqueDates.length - 1)
    return {
      driverName: d.driverName, driverCity: d.driverCity,
      unitNumbers: Array.from(d.unitNumberSet),
      transactions: d.transactions, gallons: d.gallons, spend: d.spend,
      ckGallons: d.ckGallons, ckTransactions: d.ckTransactions,
      ckSharePct: d.gallons > 0 ? (d.ckGallons / d.gallons) * 100 : 0,
      capturableGallons: d.capturableGallons,
      topCompetitorBrand: topBrand ? normalizeBrandName(topBrand) : '—',
      avgDaysBetweenFills: Math.round(avgDaysBetweenFills * 10) / 10,
    }
  }).sort((a, b) => b.gallons - a.gallons)

  // Reuse segment logic for drivers (unitNumbers field holds driver names in driverSegments)
  const driverSegments = buildVehicleSegments(
    driverBreakdown.map(d => ({ ...d, unitNumber: d.driverName }))
  )

  // Map points + proximity breakdown + CK opportunity locations (requires geocoding)
  const { mapPoints, proximityBreakdown, proximityBreakdownAll, topCKOpportunityLocations } = buildMapData(transactions, geocodedCoords, ckStores, totalGallons, geocodedAddresses, ckStoresAll)

  // Behavioural / timing
  const hasTimeData = transactions.some(t => !!t.transTime)
  const hourlyBreakdown = buildHourlyBreakdown(transactions)
  const dayOfWeekBreakdown = buildDayOfWeekBreakdown(transactions)
  const vehicleSegments = buildVehicleSegments(vehicleBreakdown)
  const fraudFlags = detectFraudFlags(transactions)

  return {
    totalTransactions, totalGallons, totalSpend, uniqueVehicles, uniqueStations, uniqueStates,
    dateRange, detectedFormat,
    brandBreakdown,
    ckCaptureAnalysis: { captured, capturable, gap, captureRate, potentialRate },
    stateBreakdown,
    topCompetitorLocations,
    fuelTypeBreakdown,
    vehicleBreakdown,
    hasDriverData,
    driverBreakdown,
    driverSegments,
    hasTimeData,
    hourlyBreakdown,
    dayOfWeekBreakdown,
    vehicleSegments,
    fraudFlags,
    mapPoints,
    proximityBreakdown,
    proximityBreakdownAll,
    topCKOpportunityLocations,
  }
}

// ─── Map data builder ─────────────────────────────────────────────────────────

/**
 * Classify a raw fuel-type string into 'diesel' (truck fuels: D2, Diesel, DEF),
 * 'gas' (car/light-truck fuels: UNL, Premium, Midgrade), or 'other'.
 * Used to route gallons to the correct proximity panel.
 */
function fuelCategory(fuelType: string | undefined): 'diesel' | 'gas' | 'other' {
  const r = (fuelType ?? '').toUpperCase().trim()
  if (!r || r === 'UNKNOWN') return 'other'
  if (r.startsWith('D2') || r.includes('DIESEL') || r === 'DSL' || r === 'DSEL' ||
      r.includes('DEF') || r.includes('EXHAUST') || r === 'UREA') return 'diesel'
  if (r.startsWith('UNL') || r.includes('UNLEAD') || r === 'REG' || r === 'REGULAR' ||
      r === 'GASOLINE' || r === 'GAS' || r.includes('PREMIUM') || r.includes('MIDGRADE') ||
      r === 'PRM' || r === 'PRML' || r === 'MID') return 'gas'
  return 'other'
}

function buildMapData(
  transactions: FuelingTransaction[],
  geocodedCoords: Map<string, GeocodedCoord> | undefined,
  ckStores: CKStoreCoord[] | undefined,
  totalGallons: number,
  geocodedAddresses?: Map<string, GeocodedCoord>,
  ckStoresAll?: CKStoreCoord[]
): { mapPoints: MapPoint[]; proximityBreakdown: ProximityBreakdown | null; proximityBreakdownAll: ProximityBreakdown | null; topCKOpportunityLocations: CKOpportunityLocation[] } {
  if (!geocodedCoords || geocodedCoords.size === 0) {
    return { mapPoints: [], proximityBreakdown: null, proximityBreakdownAll: null, topCKOpportunityLocations: [] }
  }

  // Aggregate transactions by individual fueling station (not city)
  type StationKey = string
  const stationMap = new Map<StationKey, {
    gallons: number; transactions: number; spend: number
    ckGallons: number; brands: Set<string>; label: string
    city: string; state: string; stationAddress: string
    // Fuel-type-split gallons for fuel-appropriate proximity panels
    ckDieselGallons: number; ckGasGallons: number
    nonCKDieselGallons: number; nonCKGasGallons: number
  }>()

  for (const t of transactions) {
    const key = `${t.stationName}||${t.stationAddress}||${t.stationCity}||${t.stationState}`
    const existing = stationMap.get(key) ?? {
      gallons: 0, transactions: 0, spend: 0, ckGallons: 0,
      brands: new Set(),
      label: t.stationName || t.stationAddress || `${t.stationCity}, ${t.stationState}`,
      city: t.stationCity,
      state: t.stationState,
      stationAddress: t.stationAddress,
      ckDieselGallons: 0, ckGasGallons: 0,
      nonCKDieselGallons: 0, nonCKGasGallons: 0,
    }
    existing.gallons += t.gallons
    existing.transactions++
    existing.spend += t.amount
    const cat = fuelCategory(t.fuelType)
    if (t.isCircleK) {
      existing.ckGallons += t.gallons
      if (cat === 'diesel') existing.ckDieselGallons += t.gallons
      else if (cat === 'gas') existing.ckGasGallons += t.gallons
    } else {
      if (cat === 'diesel') existing.nonCKDieselGallons += t.gallons
      else if (cat === 'gas') existing.nonCKGasGallons += t.gallons
    }
    if (t.stationBrand) existing.brands.add(t.stationBrand)
    stationMap.set(key, existing)
  }

  const mapPoints: MapPoint[] = []

  const mkProxBuckets = () => ({
    ckGallons:  0,
    within1mi:  { gallons: 0, transactions: 0, spend: 0 },
    within2mi:  { gallons: 0, transactions: 0, spend: 0 },
    within5mi:  { gallons: 0, transactions: 0, spend: 0 },
    within10mi: { gallons: 0, transactions: 0, spend: 0 },
    beyond10mi: { gallons: 0, transactions: 0, spend: 0 },
    geocodedGallons: 0,
  })

  // Proximity buckets (non-CK only)
  const prox    = mkProxBuckets()
  const proxAll = mkProxBuckets()  // against all CK sites
  const ckOppMap = new Map<string, CKOpportunityLocation>()

  for (const [, agg] of Array.from(stationMap)) {
    // Prefer address-level coords (precise) over city centroid
    const addrKey = addrGeoKey(agg.stationAddress, agg.city, agg.state)
    const coord = geocodedAddresses?.get(addrKey) ?? geocodedCoords.get(geoKey(agg.city, agg.state))
    if (!coord) continue

    const ckNearest    = ckStores?.length    ? findNearestCKStore(coord.lat, coord.lng, ckStores)    : null
    const ckNearestAll = ckStoresAll?.length ? findNearestCKStore(coord.lat, coord.lng, ckStoresAll) : null
    const dist    = ckNearest    ? ckNearest.distanceMi    : -1
    const distAll = ckNearestAll ? ckNearestAll.distanceMi : -1
    const allCK = agg.ckGallons === agg.gallons

    mapPoints.push({
      lat: coord.lat,
      lng: coord.lng,
      gallons: agg.gallons,
      transactions: agg.transactions,
      spend: agg.spend,
      isCircleK: allCK,
      hasMixedBrands: agg.brands.size > 1,
      label: agg.label,
      city: agg.city,
      state: agg.state,
      nearestCKDistanceMi: dist,
    })

    prox.geocodedGallons    += agg.gallons
    proxAll.geocodedGallons += agg.gallons
    // Truck panel: diesel gallons at CK; Any-CK panel: gas gallons at CK
    prox.ckGallons    += agg.ckDieselGallons
    proxAll.ckGallons += agg.ckGasGallons

    // Bucket non-CK diesel gallons against truck-accessible CK
    if (agg.nonCKDieselGallons > 0 && dist >= 0) {
      const r = agg.nonCKDieselGallons / Math.max(agg.gallons, 1)
      const bd = dist < 1 ? prox.within1mi : dist < 2 ? prox.within2mi : dist < 5 ? prox.within5mi : dist < 10 ? prox.within10mi : prox.beyond10mi
      bd.gallons += agg.nonCKDieselGallons
      bd.transactions += Math.round(agg.transactions * r)
      bd.spend += agg.spend * r
    }

    // Bucket non-CK gas gallons against full CK network (any CK incl. c-stores)
    if (agg.nonCKGasGallons > 0 && distAll >= 0) {
      const r = agg.nonCKGasGallons / Math.max(agg.gallons, 1)
      const bg = distAll < 1 ? proxAll.within1mi : distAll < 2 ? proxAll.within2mi : distAll < 5 ? proxAll.within5mi : distAll < 10 ? proxAll.within10mi : proxAll.beyond10mi
      bg.gallons += agg.nonCKGasGallons
      bg.transactions += Math.round(agg.transactions * r)
      bg.spend += agg.spend * r
    }

    const nonCKGallons = agg.gallons - agg.ckGallons
    const nonCKTrans = Math.round(agg.transactions * (nonCKGallons / Math.max(agg.gallons, 1)))
    const nonCKSpend = agg.spend * (nonCKGallons / Math.max(agg.gallons, 1))

    if (!allCK) {
      // Attribute competitor gallons (any fuel type) to the nearest truck CK within 5 mi
      if (ckNearest && ckNearest.distanceMi <= 5) {
        const k = `${ckNearest.store.lat.toFixed(6)},${ckNearest.store.lng.toFixed(6)}`
        const entry = ckOppMap.get(k) ?? {
          ckName: ckNearest.store.name ?? 'Circle K',
          city: ckNearest.store.city ?? '',
          state: ckNearest.store.state ?? '',
          lat: ckNearest.store.lat,
          lng: ckNearest.store.lng,
          truckAccessible: ckNearest.store.truckAccessible ?? false,
          siteNumber: ckNearest.store.siteNumber,
          competitorGallons: 0, competitorTransactions: 0, competitorSpend: 0, nearbyStationCount: 0,
        }
        entry.competitorGallons += nonCKGallons
        entry.competitorTransactions += nonCKTrans
        entry.competitorSpend += nonCKSpend
        entry.nearbyStationCount++
        ckOppMap.set(k, entry)
      }
    }
  }

  const geocodedPct = totalGallons > 0 ? (prox.geocodedGallons / totalGallons) * 100 : 0

  const toBreakdown = (p: typeof prox): ProximityBreakdown => ({
    ckGallons:  p.ckGallons,
    within1mi:  p.within1mi,
    within2mi:  p.within2mi,
    within5mi:  p.within5mi,
    within10mi: p.within10mi,
    beyond10mi: p.beyond10mi,
    geocodedPct,
  })

  const topCKOpportunityLocations = Array.from(ckOppMap.values())
    .sort((a, b) => b.competitorGallons - a.competitorGallons)
    .slice(0, 15)

  return {
    mapPoints,
    proximityBreakdown:    ckStores    ? toBreakdown(prox)    : null,
    proximityBreakdownAll: ckStoresAll ? toBreakdown(proxAll) : null,
    topCKOpportunityLocations,
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
    hasDriverData: false,
    driverBreakdown: [],
    driverSegments: [],
    hasTimeData: false,
    hourlyBreakdown: [],
    dayOfWeekBreakdown: [],
    vehicleSegments: [],
    fraudFlags: [],
    mapPoints: [],
    proximityBreakdown: null,
    proximityBreakdownAll: null,
    topCKOpportunityLocations: [],
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
