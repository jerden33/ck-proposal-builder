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

export interface CitySummary {
  city: string
  state: string
  transactions: number
  gallons: number
  spend: number
  ckGallons: number
  ckSharePct: number
  capturableGallons: number
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
  /** How capturable/gap were computed — 'proximity' when geocoding was available, 'zip' otherwise */
  methodology: 'zip' | 'proximity'
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

/** A customer-supplied facility location (depot, yard, corporate office) shown on the map */
/** Nearest Circle K store match attached to a customer location */
export interface NearestCKInfo {
  name: string
  siteNumber?: string
  city: string
  state: string
  distanceMi: number
  truckAccessible: boolean
}

export interface CustomerLocation {
  name: string
  address: string
  city: string
  state: string
  zip: string
  lat?: number   // set after geocoding; absent if geocoding failed or wasn't run
  lng?: number
  nearestCK?: NearestCKInfo       // nearest CK store from the full network (incl. c-stores)
  nearestTruckCK?: NearestCKInfo  // nearest truck-accessible CK store
}

/**
 * Compute nearest-CK and nearest-truck-CK for each geocoded customer location.
 * Locations without lat/lng (failed geocoding) are returned unchanged.
 */
export function attachNearestCKToCustomerLocations(
  locations: CustomerLocation[],
  allStores: CKStoreCoord[],
  truckStores: CKStoreCoord[]
): CustomerLocation[] {
  return locations.map(loc => {
    if (loc.lat == null || loc.lng == null) return loc
    const toInfo = (match: { store: CKStoreCoord; distanceMi: number } | null): NearestCKInfo | undefined =>
      match
        ? {
            name: match.store.name ?? 'Circle K',
            siteNumber: match.store.siteNumber,
            city: match.store.city ?? '',
            state: match.store.state ?? '',
            distanceMi: match.distanceMi,
            truckAccessible: !!match.store.truckAccessible,
          }
        : undefined
    return {
      ...loc,
      nearestCK: toInfo(findNearestCKStore(loc.lat, loc.lng, allStores)),
      nearestTruckCK: toInfo(findNearestCKStore(loc.lat, loc.lng, truckStores)),
    }
  })
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
  cityBreakdown: CitySummary[]
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
  // Capture radius (miles) used when this analysis was run — needed for correct display after restore
  captureRadiusMi?: number
  // Whether OTR/truck mode was active when analysis was saved
  truckMode?: boolean
  // Corridor-based OTR opportunity analysis (populated after geocoding)
  otrAnalysis?: import('./otr-analysis').OTRAnalysis
  // Customer-supplied facility locations (depots, yards, offices) — optional, shown on the map
  customerLocations?: CustomerLocation[]
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
  // JS's Date(year, ...) constructor treats a 2-digit year (0-99) as 1900+year —
  // "6/1/26" would silently become 1926, not 2026. Fleet transaction data is
  // never from the 1900s, so normalize any 2-digit year to the 2000s.
  let year = parseInt(parts[2])
  if (year >= 0 && year < 100) year += 2000
  const d = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]))
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
  dieselGallons: number        // non-CK diesel gallons attributed to this CK
  gasGallons: number           // non-CK gas gallons attributed to this CK
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
export function findNearestCKStore(
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

function buildVehicleSegments(vehicleBreakdown: VehicleSummary[], loyalT = 70, mixedT = 20): VehicleSegment[] {
  const defs: { segment: VehicleSegment['segment']; label: string; description: string; color: string; test: (v: VehicleSummary) => boolean }[] = [
    { segment: 'ck-loyal',          label: 'CK Loyal',         description: `≥ ${loyalT}% of gallons at Circle K`,              color: '#16a34a', test: v => v.ckSharePct >= loyalT },
    { segment: 'mixed',             label: 'Mixed',             description: `${mixedT}–${loyalT - 1}% at Circle K`,             color: '#3b82f6', test: v => v.ckSharePct >= mixedT && v.ckSharePct < loyalT },
    { segment: 'mostly-competitor', label: 'Mostly Competitor', description: `1–${mixedT - 1}% at Circle K`,                     color: '#f59e0b', test: v => v.ckSharePct > 0  && v.ckSharePct < mixedT },
    { segment: 'never-ck',          label: 'Never CK',          description: '0% at Circle K',                                   color: '#dc2626', test: v => v.ckSharePct === 0 },
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
  // Date-dependent checks (multi-fill, state-hop) require genuine per-transaction
  // dates — skip them entirely when no transaction has one (e.g. pre-aggregated
  // rollup formats with no per-fill date), otherwise every unit with 3+ synthetic
  // records or fills across 2+ states would collapse onto one blank-date key and
  // spuriously trigger these flags for nearly every row.
  const hasRealDates = transactions.some(t => t.transDate)
  const byUnitDate = new Map<string, FuelingTransaction[]>()
  if (hasRealDates) {
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
    captureRadiusMi?: number      // miles threshold for "capturable" gallons (default 10)
    loyalThreshold?: number       // min CK share % for "CK Loyal" segment (default 70)
    mixedThreshold?: number       // min CK share % for "Mixed" segment (default 20)
    explicitTruckMode?: boolean   // true = OTR/truck only, false = full network, undefined = auto-detect
  }
): TransactionSummary {
  if (transactions.length === 0) return createEmptySummary()

  const { detectedFormat = 'Unknown', geocodedCoords, geocodedAddresses, ckStores, ckStoresAll } = options ?? {}
  const captureRadiusMi = options?.captureRadiusMi ?? 10
  const loyalThreshold  = options?.loyalThreshold  ?? 70
  const mixedThreshold  = options?.mixedThreshold  ?? 20
  const explicitTruckMode = options?.explicitTruckMode

  const totalTransactions = transactions.length
  const totalGallons = transactions.reduce((s, t) => s + t.gallons, 0)
  const totalSpend = transactions.reduce((s, t) => s + t.amount, 0)
  const uniqueVehicles = new Set(transactions.map(t => t.unitNumber || '?')).size
  const uniqueStations = new Set(transactions.map(t => `${t.stationName}||${t.zipCode}`)).size
  const uniqueStates = Array.from(new Set(transactions.map(t => t.stationState).filter(Boolean))).sort()

  // Auto-detect truck mode: ≥10% diesel gallons → treat as truck/OTR fleet
  const autoDieselGallons = transactions.reduce((s, t) => s + (t.fuelType === 'DIESEL' ? t.gallons : 0), 0)
  const truckMode = explicitTruckMode !== undefined
    ? explicitTruckMode
    : (totalGallons > 0 && autoDieselGallons / totalGallons >= 0.10)

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

  // City breakdown
  const cityMap = new Map<string, CitySummary>()
  for (const t of transactions) {
    const city  = t.stationCity  || 'Unknown'
    const state = t.stationState || 'Unknown'
    const key   = `${city}||${state}`
    const existing = cityMap.get(key) ?? { city, state, transactions: 0, gallons: 0, spend: 0, ckGallons: 0, ckSharePct: 0, capturableGallons: 0 }
    existing.transactions++; existing.gallons += t.gallons; existing.spend += t.amount
    if (t.isCircleK) existing.ckGallons += t.gallons
    else if (ckZipSet.has(t.zipCode)) existing.capturableGallons += t.gallons
    cityMap.set(key, existing)
  }
  const cityBreakdown = Array.from(cityMap.values())
    .map(c => ({ ...c, ckSharePct: c.gallons > 0 ? (c.ckGallons / c.gallons) * 100 : 0 }))
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
  // Use truck-only stores in truck mode so "Nearest CK" means nearest CK with diesel lanes
  const competitorDistStores = truckMode ? ckStores : (ckStoresAll ?? ckStores)
  if (geocodedCoords && competitorDistStores) {
    for (const loc of Array.from(locMap.values())) {
      const coord = geocodedCoords.get(geoKey(loc.city, loc.state))
      if (coord) {
        loc.nearestCKDistanceMi = nearestCKDistance(coord.lat, coord.lng, competitorDistStores)
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
    driverBreakdown.map(d => ({ ...d, unitNumber: d.driverName })),
    loyalThreshold, mixedThreshold
  )

  // Map points + proximity breakdown + CK opportunity locations (requires geocoding)
  const { mapPoints, proximityBreakdown, proximityBreakdownAll, topCKOpportunityLocations, proxCapturable, stationCapturable } = buildMapData(transactions, geocodedCoords, ckStores, totalGallons, geocodedAddresses, ckStoresAll, captureRadiusMi)

  // Correct state/city/vehicle/driver "capturable" gallons to respect the proximity-
  // based capture radius, same as ckCaptureAnalysis below — they were built above
  // using the coarser "CK exists somewhere in this ZIP code" fallback, which ignores
  // captureRadiusMi entirely. Only run when geocoding succeeded; otherwise the
  // ZIP-based figures already computed above remain the correct fallback.
  if (proxCapturable !== null) {
    const stateCap   = new Map<string, number>()
    const cityCap    = new Map<string, number>()
    const vehicleCap = new Map<string, number>()
    const driverCap  = new Map<string, number>()

    for (const t of transactions) {
      if (t.isCircleK) continue
      const stationKey = `${t.stationName}||${t.stationAddress}||${t.stationCity}||${t.stationState}`
      const cap = stationCapturable.get(stationKey)
      if (!cap) continue
      const isCapturable = fuelCategory(t.fuelType) === 'diesel' ? cap.diesel : cap.gas
      if (!isCapturable) continue

      const state = t.stationState || 'Unknown'
      stateCap.set(state, (stateCap.get(state) ?? 0) + t.gallons)

      const cityKey = `${t.stationCity || 'Unknown'}||${state}`
      cityCap.set(cityKey, (cityCap.get(cityKey) ?? 0) + t.gallons)

      const unit = t.unitNumber || 'Unknown'
      vehicleCap.set(unit, (vehicleCap.get(unit) ?? 0) + t.gallons)

      if (t.driverName) driverCap.set(t.driverName, (driverCap.get(t.driverName) ?? 0) + t.gallons)
    }

    for (const s of stateBreakdown)   s.capturableGallons = stateCap.get(s.state) ?? 0
    for (const c of cityBreakdown)    c.capturableGallons = cityCap.get(`${c.city}||${c.state}`) ?? 0
    for (const v of vehicleBreakdown) v.capturableGallons = vehicleCap.get(v.unitNumber) ?? 0
    for (const d of driverBreakdown)  d.capturableGallons = driverCap.get(d.driverName) ?? 0
  }

  // Use proximity-based capture when geocoding was done; fall back to ZIP-based otherwise
  let ckCaptureAnalysis: CKCaptureAnalysis
  if (proxCapturable !== null) {
    const proxGap = {
      gallons:      Math.max(0, totalGallons - captured.gallons - proxCapturable.gallons),
      transactions: Math.max(0, totalTransactions - captured.transactions - proxCapturable.transactions),
      spend:        Math.max(0, totalSpend - captured.spend - proxCapturable.spend),
    }
    ckCaptureAnalysis = {
      captured,
      capturable: proxCapturable,
      gap: proxGap,
      captureRate,
      potentialRate: totalGallons > 0 ? ((captured.gallons + proxCapturable.gallons) / totalGallons) * 100 : 0,
      methodology: 'proximity',
    }
  } else {
    ckCaptureAnalysis = { captured, capturable, gap, captureRate, potentialRate, methodology: 'zip' }
  }

  // Behavioural / timing
  const hasTimeData = transactions.some(t => !!t.transTime)
  const hourlyBreakdown = buildHourlyBreakdown(transactions)
  const dayOfWeekBreakdown = buildDayOfWeekBreakdown(transactions)
  const vehicleSegments = buildVehicleSegments(vehicleBreakdown, loyalThreshold, mixedThreshold)
  const fraudFlags = detectFraudFlags(transactions)

  return {
    totalTransactions, totalGallons, totalSpend, uniqueVehicles, uniqueStations, uniqueStates,
    dateRange, detectedFormat,
    brandBreakdown,
    ckCaptureAnalysis,
    stateBreakdown,
    cityBreakdown,
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
    captureRadiusMi,
    truckMode,
  }
}

// ─── Map data builder ─────────────────────────────────────────────────────────

/**
 * Classify a fuel-type string into 'diesel', 'gas', or 'other'.
 * Input is expected to be normalised by normalizeFuelType() in the parser;
 * raw variants are also handled here as a safety net for legacy cached data.
 */
function fuelCategory(fuelType: string | undefined): 'diesel' | 'gas' | 'other' {
  const r = (fuelType ?? '').toUpperCase().trim()
  if (!r || r === 'UNKNOWN') return 'other'

  // ── Diesel (normalised canonical values from normalizeFuelType) ───────────
  if (r === 'DIESEL') return 'diesel'
  if (r === 'DEF')    return 'diesel'   // DEF is a diesel-adjacent product

  // ── Diesel raw variants (safety net for un-normalised / legacy cached data) ─
  if (r.startsWith('D2') || r === 'D-2' || r === '#2' || r.startsWith('#2 ') ||
      r.includes('DIESEL') || r === 'DSL' || r === 'DSEL' ||
      r === 'ULSD' || r.includes('ULTRA LOW SULFUR') || r === 'HSD' || r === 'LSD' ||
      r.includes('REEFER') || r.includes('OFF ROAD') || r.includes('OFF-ROAD') ||
      r.includes('DYE') || r.includes('DYED') || r.includes('BIODIESEL') ||
      r.startsWith('B20') || r.startsWith('B10') || r.startsWith('B5 ') || r.startsWith('B2 ') ||
      r === 'NO2' || r === 'NO. 2' || r === 'NUMBER 2' ||
      r.includes('DEF') || r.includes('EXHAUST') || r === 'UREA' || r === 'ADBLUE'
  ) return 'diesel'

  // ── Gasoline (normalised) ─────────────────────────────────────────────────
  if (r === 'GASOLINE') return 'gas'

  // ── Gasoline raw variants ─────────────────────────────────────────────────
  if (r.includes('UNL') || r.includes('UNLEAD') ||   // catches UNL*, ETUNL*, MEUNL*, etc.
      r === 'REG' || r === 'REGULAR' ||
      r === 'GAS' || r.includes('PREMIUM') || r.includes('MIDGRADE') ||
      r.includes('MID-GRADE') || r === 'PRM' || r === 'PRML' || r === 'MID' ||
      r === 'SUPER' || r === 'PLUS' || r.startsWith('E85') || r === 'ETHANOL' ||
      r.includes('LEADED') ||                         // Me Reg Leaded, Reg Leaded Gas
      r.includes('FLEX FUEL') || r.match(/^(87|89|91|93)(\s*OCT)?$/) !== null
  ) return 'gas'

  return 'other'
}

function buildMapData(
  transactions: FuelingTransaction[],
  geocodedCoords: Map<string, GeocodedCoord> | undefined,
  ckStores: CKStoreCoord[] | undefined,
  totalGallons: number,
  geocodedAddresses?: Map<string, GeocodedCoord>,
  ckStoresAll?: CKStoreCoord[],
  captureRadiusMi = 10
): { mapPoints: MapPoint[]; proximityBreakdown: ProximityBreakdown | null; proximityBreakdownAll: ProximityBreakdown | null; topCKOpportunityLocations: CKOpportunityLocation[]; proxCapturable: { gallons: number; transactions: number; spend: number } | null; stationCapturable: Map<string, { diesel: boolean; gas: boolean }> } {
  if (!geocodedCoords || geocodedCoords.size === 0) {
    return { mapPoints: [], proximityBreakdown: null, proximityBreakdownAll: null, topCKOpportunityLocations: [], proxCapturable: null, stationCapturable: new Map() }
  }

  // Aggregate transactions by individual fueling station (not city)
  type StationKey = string
  const stationMap = new Map<StationKey, {
    gallons: number; transactions: number; spend: number
    ckGallons: number; brands: Set<string>; label: string
    city: string; state: string; stationAddress: string
    // Fuel-type-split gallons for fuel-appropriate proximity panels
    ckDieselGallons: number; ckGasGallons: number
    nonCKDieselGallons: number; nonCKGasGallons: number; nonCKOtherGallons: number
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
      nonCKDieselGallons: 0, nonCKGasGallons: 0, nonCKOtherGallons: 0,
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
      else existing.nonCKOtherGallons += t.gallons
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
  // Combined proximity capture (for opportunity panel): non-CK gallons within 10 mi of appropriate CK
  const proxCapt = { gallons: 0, transactions: 0, spend: 0 }
  // Per-station capturability, keyed the same as stationMap — lets callers correct
  // state/city/vehicle/driver "capturable" figures to respect captureRadiusMi
  // instead of the coarser same-ZIP-code fallback used when those are first built.
  const stationCapturable = new Map<string, { diesel: boolean; gas: boolean }>()

  for (const [stationKey, agg] of Array.from(stationMap)) {
    // Prefer address-level coords (precise) over city centroid
    const addrKey = addrGeoKey(agg.stationAddress, agg.city, agg.state)
    const coord = geocodedAddresses?.get(addrKey) ?? geocodedCoords.get(geoKey(agg.city, agg.state))
    if (!coord) continue

    const ckNearest    = ckStores?.length    ? findNearestCKStore(coord.lat, coord.lng, ckStores)    : null
    const ckNearestAll = ckStoresAll?.length ? findNearestCKStore(coord.lat, coord.lng, ckStoresAll) : null
    const dist    = ckNearest    ? ckNearest.distanceMi    : -1
    const distAll = ckNearestAll ? ckNearestAll.distanceMi : -1
    const allCK = agg.ckGallons === agg.gallons

    stationCapturable.set(stationKey, {
      diesel: dist >= 0 && dist <= captureRadiusMi,
      gas: distAll >= 0 && distAll <= captureRadiusMi,
    })

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
      nearestCKDistanceMi: distAll >= 0 ? distAll : dist,
    })

    prox.geocodedGallons    += agg.gallons
    proxAll.geocodedGallons += agg.gallons
    // Truck panel: diesel gallons at CK; Full-network panel: gas gallons at CK
    // (share view uses ckCaptureAnalysis.captured.gallons for the total CK row)
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

    // Bucket non-CK 'other'/unknown fuel type gallons against full CK network
    // (covers files where fuel type column is missing or uses unrecognized codes)
    if (agg.nonCKOtherGallons > 0 && distAll >= 0) {
      const r = agg.nonCKOtherGallons / Math.max(agg.gallons, 1)
      const bg = distAll < 1 ? proxAll.within1mi : distAll < 2 ? proxAll.within2mi : distAll < 5 ? proxAll.within5mi : distAll < 10 ? proxAll.within10mi : proxAll.beyond10mi
      bg.gallons += agg.nonCKOtherGallons
      bg.transactions += Math.round(agg.transactions * r)
      bg.spend += agg.spend * r
    }

    const nonCKGallons = agg.gallons - agg.ckGallons

    if (!allCK) {
      // Proximity-based opportunity capture: classify non-CK gallons by distance to CK
      // Diesel uses truck-accessible CK distance; gas uses full-network CK distance;
      // unknown fuel type uses the best available distance.
      const diesel = agg.nonCKDieselGallons
      const gas    = agg.nonCKGasGallons
      const other  = nonCKGallons - diesel - gas

      // Attribute diesel competitor gallons → nearest truck-accessible CK
      if (diesel > 0 && ckNearest && ckNearest.distanceMi <= captureRadiusMi) {
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
          dieselGallons: 0, gasGallons: 0,
        }
        const r = diesel / Math.max(agg.gallons, 1)
        entry.competitorGallons += diesel
        entry.competitorTransactions += Math.round(agg.transactions * r)
        entry.competitorSpend += agg.spend * r
        entry.dieselGallons += diesel
        entry.nearbyStationCount++
        ckOppMap.set(k, entry)
      }

      // Attribute gas + unknown fuel competitor gallons → nearest full-network CK
      const gasOther = gas + other
      if (gasOther > 0 && ckNearestAll && ckNearestAll.distanceMi <= captureRadiusMi) {
        const k = `${ckNearestAll.store.lat.toFixed(6)},${ckNearestAll.store.lng.toFixed(6)}`
        const entry = ckOppMap.get(k) ?? {
          ckName: ckNearestAll.store.name ?? 'Circle K',
          city: ckNearestAll.store.city ?? '',
          state: ckNearestAll.store.state ?? '',
          lat: ckNearestAll.store.lat,
          lng: ckNearestAll.store.lng,
          truckAccessible: ckNearestAll.store.truckAccessible ?? false,
          siteNumber: ckNearestAll.store.siteNumber,
          competitorGallons: 0, competitorTransactions: 0, competitorSpend: 0, nearbyStationCount: 0,
          dieselGallons: 0, gasGallons: 0,
        }
        const r = gasOther / Math.max(agg.gallons, 1)
        entry.competitorGallons += gasOther
        entry.competitorTransactions += Math.round(agg.transactions * r)
        entry.competitorSpend += agg.spend * r
        entry.gasGallons += gas
        entry.nearbyStationCount++
        ckOppMap.set(k, entry)
      }

      if (diesel > 0) {
        const r = diesel / Math.max(agg.gallons, 1)
        if (dist >= 0 && dist < captureRadiusMi) {
          proxCapt.gallons      += diesel
          proxCapt.transactions += Math.round(agg.transactions * r)
          proxCapt.spend        += agg.spend * r
        }
      }
      if (gas > 0) {
        const r = gas / Math.max(agg.gallons, 1)
        if (distAll >= 0 && distAll < captureRadiusMi) {
          proxCapt.gallons      += gas
          proxCapt.transactions += Math.round(agg.transactions * r)
          proxCapt.spend        += agg.spend * r
        }
      }
      if (other > 0) {
        // Unknown fuel type: use whichever distance is available (prefer smaller)
        const bestDist = dist >= 0 ? (distAll >= 0 ? Math.min(dist, distAll) : dist) : distAll
        const r = other / Math.max(agg.gallons, 1)
        if (bestDist >= 0 && bestDist < captureRadiusMi) {
          proxCapt.gallons      += other
          proxCapt.transactions += Math.round(agg.transactions * r)
          proxCapt.spend        += agg.spend * r
        }
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
    proxCapturable: (ckStores?.length || ckStoresAll?.length) ? proxCapt : null,
    stationCapturable,
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
      methodology: 'zip' as const,
    },
    stateBreakdown: [],
    cityBreakdown: [],
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
    captureRadiusMi: 10,
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
