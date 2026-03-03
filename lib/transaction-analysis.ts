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
  // Behavioral / timing
  hasTimeData: boolean
  hourlyBreakdown: HourlyBucket[]    // empty if no time data
  dayOfWeekBreakdown: DayOfWeekBucket[]
  vehicleSegments: VehicleSegment[]
  fraudFlags: FraudFlag[]
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

// ─── Behavioural / timing helpers ─────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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
    const d = new Date(t.transDate + 'T00:00:00')
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
    { segment: 'mixed',             label: 'Mixed',             description: '20–69% at Circle K',                 color: '#3b82f6', test: v => v.ckSharePct >= 20 },
    { segment: 'mostly-competitor', label: 'Mostly Competitor', description: '1–19% at Circle K',                  color: '#f59e0b', test: v => v.ckSharePct > 0 },
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
  }
): TransactionSummary {
  if (transactions.length === 0) return createEmptySummary()

  const { detectedFormat = 'Unknown', geocodedCoords, geocodedAddresses, ckStores } = options ?? {}

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
      .map(d => new Date(d + 'T00:00:00'))
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

  // Map points + proximity breakdown (requires geocoding)
  const { mapPoints, proximityBreakdown } = buildMapData(transactions, geocodedCoords, ckStores, totalGallons, geocodedAddresses)

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
    hasTimeData,
    hourlyBreakdown,
    dayOfWeekBreakdown,
    vehicleSegments,
    fraudFlags,
    mapPoints,
    proximityBreakdown,
  }
}

// ─── Map data builder ─────────────────────────────────────────────────────────

function buildMapData(
  transactions: FuelingTransaction[],
  geocodedCoords: Map<string, GeocodedCoord> | undefined,
  ckStores: CKStoreCoord[] | undefined,
  totalGallons: number,
  geocodedAddresses?: Map<string, GeocodedCoord>
): { mapPoints: MapPoint[]; proximityBreakdown: ProximityBreakdown | null } {
  if (!geocodedCoords || geocodedCoords.size === 0) {
    return { mapPoints: [], proximityBreakdown: null }
  }

  // Aggregate transactions by individual fueling station (not city)
  type StationKey = string
  const stationMap = new Map<StationKey, {
    gallons: number; transactions: number; spend: number
    ckGallons: number; brands: Set<string>; label: string
    city: string; state: string; stationAddress: string
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
    }
    existing.gallons += t.gallons
    existing.transactions++
    existing.spend += t.amount
    if (t.isCircleK) existing.ckGallons += t.gallons
    if (t.stationBrand) existing.brands.add(t.stationBrand)
    stationMap.set(key, existing)
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

  for (const [, agg] of Array.from(stationMap)) {
    // Prefer address-level coords (precise) over city centroid
    const addrKey = addrGeoKey(agg.stationAddress, agg.city, agg.state)
    const coord = geocodedAddresses?.get(addrKey) ?? geocodedCoords.get(geoKey(agg.city, agg.state))
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
      label: agg.label,
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
    hasTimeData: false,
    hourlyBreakdown: [],
    dayOfWeekBreakdown: [],
    vehicleSegments: [],
    fraudFlags: [],
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
