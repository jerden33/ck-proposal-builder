// Transaction analysis engine — compares fueling data to Circle K store footprint

import type { FuelingTransaction } from './transaction-parser'
import { normalizeBrandName } from './transaction-parser'

export interface BrandSummary {
  brand: string          // raw brand code
  displayName: string    // human-readable name
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
  hasCKNearby: boolean   // CK store exists in same ZIP
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
  // Already fueling at Circle K
  captured: { transactions: number; gallons: number; spend: number }
  // Fueling at competitor where a Circle K exists in the same ZIP
  capturable: { transactions: number; gallons: number; spend: number }
  // Fueling at competitor in an area with NO nearby Circle K
  gap: { transactions: number; gallons: number; spend: number }
  // Current capture rate (% of total gallons already at CK)
  captureRate: number
  // Potential capture rate if capturable volume is won (% of total gallons)
  potentialRate: number
}

export interface TransactionSummary {
  totalTransactions: number
  totalGallons: number
  totalSpend: number
  uniqueVehicles: number
  uniqueStations: number
  uniqueStates: string[]
  dateRange: { start: string; end: string }
  brandBreakdown: BrandSummary[]
  ckCaptureAnalysis: CKCaptureAnalysis
  stateBreakdown: StateSummary[]
  topCompetitorLocations: LocationSummary[]
  fuelTypeBreakdown: FuelTypeSummary[]
  vehicleBreakdown: VehicleSummary[]
}

function parseDate(dateStr: string): Date | null {
  // Handles M/D/YYYY format
  const parts = dateStr.split('/')
  if (parts.length !== 3) return null
  const d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]))
  return isNaN(d.getTime()) ? null : d
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Build a Set of 5-digit ZIP codes that have at least one Circle K store.
 * Handles ZIP+4 formats by taking the first 5 characters.
 */
export function buildCKZipSet(stores: Array<{ zip: string }>): Set<string> {
  const zips = new Set<string>()
  for (const store of stores) {
    const zip = store.zip.replace(/[^0-9]/g, '').substring(0, 5)
    if (zip.length === 5) zips.add(zip)
  }
  return zips
}

/**
 * Run full analysis on a set of fueling transactions against the CK store footprint.
 */
export function analyzeTransactions(
  transactions: FuelingTransaction[],
  ckZipSet: Set<string>
): TransactionSummary {
  if (transactions.length === 0) return createEmptySummary()

  const totalTransactions = transactions.length
  const totalGallons = transactions.reduce((s, t) => s + t.gallons, 0)
  const totalSpend = transactions.reduce((s, t) => s + t.amount, 0)
  const uniqueVehicles = new Set(transactions.map(t => t.unitNumber)).size
  const uniqueStations = new Set(transactions.map(t => `${t.stationName}||${t.zipCode}`)).size
  const uniqueStates = [...new Set(transactions.map(t => t.stationState).filter(Boolean))].sort()

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
  const brandBreakdown = [...brandMap.values()].sort((a, b) => b.gallons - a.gallons)

  // CK capture analysis
  const captured = { transactions: 0, gallons: 0, spend: 0 }
  const capturable = { transactions: 0, gallons: 0, spend: 0 }
  const gap = { transactions: 0, gallons: 0, spend: 0 }

  for (const t of transactions) {
    if (t.isCircleK) {
      captured.transactions++
      captured.gallons += t.gallons
      captured.spend += t.amount
    } else if (ckZipSet.has(t.zipCode)) {
      capturable.transactions++
      capturable.gallons += t.gallons
      capturable.spend += t.amount
    } else {
      gap.transactions++
      gap.gallons += t.gallons
      gap.spend += t.amount
    }
  }

  const captureRate = totalGallons > 0 ? (captured.gallons / totalGallons) * 100 : 0
  const potentialRate = totalGallons > 0 ? ((captured.gallons + capturable.gallons) / totalGallons) * 100 : 0

  // State breakdown
  const stateMap = new Map<string, StateSummary>()
  for (const t of transactions) {
    const state = t.stationState || 'Unknown'
    const existing = stateMap.get(state) ?? {
      state,
      transactions: 0,
      gallons: 0,
      spend: 0,
      ckTransactions: 0,
      ckGallons: 0,
      ckSharePct: 0,
    }
    existing.transactions++
    existing.gallons += t.gallons
    existing.spend += t.amount
    if (t.isCircleK) {
      existing.ckTransactions++
      existing.ckGallons += t.gallons
    }
    stateMap.set(state, existing)
  }
  const stateBreakdown = [...stateMap.values()]
    .map(s => ({ ...s, ckSharePct: s.gallons > 0 ? (s.ckGallons / s.gallons) * 100 : 0 }))
    .sort((a, b) => b.gallons - a.gallons)

  // Top competitor locations (non-CK, sorted by gallons)
  const locMap = new Map<string, LocationSummary>()
  for (const t of transactions) {
    if (t.isCircleK) continue
    const key = `${t.stationName}||${t.zipCode}`
    const existing = locMap.get(key) ?? {
      stationName: t.stationName,
      stationBrand: t.stationBrand,
      displayBrand: normalizeBrandName(t.stationBrand),
      city: t.stationCity,
      state: t.stationState,
      zipCode: t.zipCode,
      transactions: 0,
      gallons: 0,
      spend: 0,
      hasCKNearby: ckZipSet.has(t.zipCode),
    }
    existing.transactions++
    existing.gallons += t.gallons
    existing.spend += t.amount
    locMap.set(key, existing)
  }
  const topCompetitorLocations = [...locMap.values()]
    .sort((a, b) => b.gallons - a.gallons)
    .slice(0, 25)

  // Fuel type breakdown
  const fuelMap = new Map<string, FuelTypeSummary>()
  for (const t of transactions) {
    const type = t.epaFuelType || 'Unknown'
    const existing = fuelMap.get(type) ?? { type, transactions: 0, gallons: 0, spend: 0 }
    existing.transactions++
    existing.gallons += t.gallons
    existing.spend += t.amount
    fuelMap.set(type, existing)
  }
  const fuelTypeBreakdown = [...fuelMap.values()].sort((a, b) => b.gallons - a.gallons)

  // Vehicle breakdown
  const vehicleMap = new Map<string, VehicleSummary>()
  for (const t of transactions) {
    const unit = t.unitNumber
    const existing = vehicleMap.get(unit) ?? {
      unitNumber: unit,
      driverCity: t.driverCity,
      transactions: 0,
      gallons: 0,
      spend: 0,
      ckGallons: 0,
      ckTransactions: 0,
      ckSharePct: 0,
    }
    existing.transactions++
    existing.gallons += t.gallons
    existing.spend += t.amount
    if (t.isCircleK) {
      existing.ckGallons += t.gallons
      existing.ckTransactions++
    }
    vehicleMap.set(unit, existing)
  }
  const vehicleBreakdown = [...vehicleMap.values()]
    .map(v => ({ ...v, ckSharePct: v.gallons > 0 ? (v.ckGallons / v.gallons) * 100 : 0 }))
    .sort((a, b) => b.gallons - a.gallons)

  return {
    totalTransactions,
    totalGallons,
    totalSpend,
    uniqueVehicles,
    uniqueStations,
    uniqueStates,
    dateRange,
    brandBreakdown,
    ckCaptureAnalysis: { captured, capturable, gap, captureRate, potentialRate },
    stateBreakdown,
    topCompetitorLocations,
    fuelTypeBreakdown,
    vehicleBreakdown,
  }
}

function createEmptySummary(): TransactionSummary {
  return {
    totalTransactions: 0,
    totalGallons: 0,
    totalSpend: 0,
    uniqueVehicles: 0,
    uniqueStations: 0,
    uniqueStates: [],
    dateRange: { start: '', end: '' },
    brandBreakdown: [],
    ckCaptureAnalysis: {
      captured: { transactions: 0, gallons: 0, spend: 0 },
      capturable: { transactions: 0, gallons: 0, spend: 0 },
      gap: { transactions: 0, gallons: 0, spend: 0 },
      captureRate: 0,
      potentialRate: 0,
    },
    stateBreakdown: [],
    topCompetitorLocations: [],
    fuelTypeBreakdown: [],
    vehicleBreakdown: [],
  }
}

// Formatting helpers used in the UI
export function fmtGallons(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function fmtDollars(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function fmtPct(n: number): string {
  return n.toFixed(1) + '%'
}
