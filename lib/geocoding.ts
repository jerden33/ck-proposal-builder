// Mapbox geocoding utility for fleet transaction locations
// Geocodes city+state combinations to lat/lng coordinates

export interface GeocodedCoord {
  lat: number
  lng: number
}

const GEOCODE_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places'
const CONCURRENCY = 8  // parallel requests

/**
 * Geocode a single query string (e.g. "Bethany Beach, DE").
 * Returns null if geocoding fails or no result found.
 */
async function geocodeOne(query: string, token: string): Promise<GeocodedCoord | null> {
  if (!query.trim() || !token) return null
  try {
    const encoded = encodeURIComponent(query)
    const url = `${GEOCODE_BASE}/${encoded}.json?country=US&types=place,locality,neighborhood&limit=1&access_token=${token}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const feature = data.features?.[0]
    if (!feature) return null
    const [lng, lat] = feature.center
    return { lat, lng }
  } catch {
    return null
  }
}

/**
 * Geocode an array of unique city+state combos in parallel batches.
 * Returns a Map keyed by the normalized "city|state" string.
 *
 * @param locations  Array of {city, state} objects (duplicates OK — deduped internally)
 * @param token      Mapbox public token
 * @param onProgress Optional callback called after each batch
 */
export async function geocodeLocations(
  locations: Array<{ city: string; state: string }>,
  token: string,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, GeocodedCoord>> {
  const results = new Map<string, GeocodedCoord>()

  // Deduplicate: key = "CITY|STATE" (uppercased)
  const uniqueKeys = new Set<string>()
  for (const { city, state } of locations) {
    const c = city.trim().toUpperCase()
    const s = state.trim().toUpperCase()
    if (c && s) uniqueKeys.add(`${c}|${s}`)
  }

  const keys = Array.from(uniqueKeys)
  const total = keys.length
  let done = 0

  // Process in batches of CONCURRENCY
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const batch = keys.slice(i, i + CONCURRENCY)
    const promises = batch.map(async key => {
      const [city, state] = key.split('|')
      const coord = await geocodeOne(`${city}, ${state}`, token)
      return { key, coord }
    })
    const batchResults = await Promise.all(promises)
    for (const { key, coord } of batchResults) {
      if (coord) results.set(key, coord)
    }
    done += batch.length
    onProgress?.(done, total)
  }

  return results
}

/**
 * Lookup key for geocoded results: uppercase "CITY|STATE"
 */
export function geoKey(city: string, state: string): string {
  return `${city.trim().toUpperCase()}|${state.trim().toUpperCase()}`
}
