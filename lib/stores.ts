// Circle K store location data service

import { Coordinates } from './mapbox'

export interface CircleKStore {
  id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  coordinates: Coordinates
  siteNumber?: string
  status?: string
  truckAccessible?: boolean
  numTruckLanes?: number
}

let storeData: CircleKStore[] = []
let dataLoaded = false

/**
 * Load Circle K store data from JSON file
 */
export async function loadStoreData(): Promise<void> {
  if (dataLoaded) return
  
  try {
    const response = await fetch('/stores-data.json')
    const data = await response.json()
    storeData = data.stores || []
    dataLoaded = true
    console.log(`Loaded ${storeData.length} Circle K stores`)
  } catch (error) {
    console.error('Error loading store data:', error)
    storeData = []
  }
}

/**
 * Get all stores
 */
export function getAllStores(): CircleKStore[] {
  return storeData
}

/**
 * Get store count
 */
export function getStoreCount(): number {
  return storeData.length
}

/**
 * Find stores within a radius (in miles) of a coordinate
 */
export function findStoresWithinRadius(
  center: Coordinates,
  radiusMiles: number,
  truckAccessibleOnly: boolean = false
): CircleKStore[] {
  return storeData.filter(store => {
    // Calculate distance
    const distance = calculateDistance(center, store.coordinates)
    
    // Check radius
    if (distance > radiusMiles) return false
    
    // Check truck accessibility if required
    if (truckAccessibleOnly && !store.truckAccessible) return false
    
    return true
  }).sort((a, b) => {
    // Sort by distance
    const distA = calculateDistance(center, a.coordinates)
    const distB = calculateDistance(center, b.coordinates)
    return distA - distB
  })
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 3959 // Earth's radius in miles
  const dLat = toRad(coord2.lat - coord1.lat)
  const dLng = toRad(coord2.lng - coord1.lng)
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) *
    Math.cos(toRad(coord2.lat)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180)
}

/**
 * Get coverage statistics for a location
 */
export function getCoverageStats(center: Coordinates): {
  within2mi: number
  within10mi: number
  within25mi: number
  truckAccessible2mi: number
  truckAccessible10mi: number
} {
  const within2 = findStoresWithinRadius(center, 2)
  const within10 = findStoresWithinRadius(center, 10)
  const within25 = findStoresWithinRadius(center, 25)

  return {
    within2mi: within2.length,
    within10mi: within10.length,
    within25mi: within25.length,
    truckAccessible2mi: within2.filter(s => s.truckAccessible).length,
    truckAccessible10mi: within10.filter(s => s.truckAccessible).length
  }
}
