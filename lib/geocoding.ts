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
 * Retries with backoff on rate-limit (429) and transient network errors rather
 * than silently dropping the location — large files (1000+ unique locations)
 * can otherwise exceed Mapbox's per-minute rate limit partway through and lose
 * a large fraction of coordinates with no indication why.
 */
async function geocodeOne(query: string, token: string, types?: string, attempt = 0): Promise<GeocodedCoord | null> {
  if (!query.trim() || !token) return null
  const MAX_RATE_LIMIT_RETRIES = 4
  const MAX_NETWORK_RETRIES = 2
  try {
    const encoded = encodeURIComponent(query)
    const typesParam = types ?? 'place,locality,neighborhood'
    const url = `${GEOCODE_BASE}/${encoded}.json?country=US&types=${typesParam}&limit=1&access_token=${token}`
    const res = await fetch(url)
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterHeader = parseFloat(res.headers.get('retry-after') ?? '')
      const delayMs = !isNaN(retryAfterHeader) ? retryAfterHeader * 1000 : 400 * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, delayMs))
      return geocodeOne(query, token, types, attempt + 1)
    }
    if (!res.ok) return null
    const data = await res.json()
    const feature = data.features?.[0]
    if (!feature) return null
    const [lng, lat] = feature.center
    return { lat, lng }
  } catch {
    if (attempt < MAX_NETWORK_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)))
      return geocodeOne(query, token, types, attempt + 1)
    }
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

  // Deduplicate: key = "CITY|STATE" (uppercased).
  // State may be empty (e.g. WEX exports without a state column) — geocode by city alone in that case.
  const uniqueKeys = new Set<string>()
  for (const { city, state } of locations) {
    const c = city.trim().toUpperCase()
    const s = state.trim().toUpperCase()
    if (c) uniqueKeys.add(`${c}|${s}`)
  }

  const keys = Array.from(uniqueKeys)
  const total = keys.length
  let done = 0

  // Process in batches of CONCURRENCY
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const batch = keys.slice(i, i + CONCURRENCY)
    const promises = batch.map(async key => {
      const [city, state] = key.split('|')
      const query = state ? `${city}, ${state}` : city
      const coord = await geocodeOne(query, token)
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

/**
 * Lookup key for address-level geocoded results: uppercase "ADDRESS|CITY|STATE"
 */
export function addrGeoKey(address: string, city: string, state: string): string {
  return `${address.trim().toUpperCase()}|${city.trim().toUpperCase()}|${state.trim().toUpperCase()}`
}

/**
 * Geocode individual station addresses to lat/lng.
 * Uses address+poi types for precise location matching.
 * Returns a Map keyed by addrGeoKey(address, city, state).
 */
export async function geocodeAddresses(
  locations: Array<{ address: string; city: string; state: string }>,
  token: string,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, GeocodedCoord>> {
  const results = new Map<string, GeocodedCoord>()

  const uniqueKeys = new Set<string>()
  for (const { address, city, state } of locations) {
    const key = addrGeoKey(address, city, state)
    if (address.trim() && city.trim() && state.trim()) uniqueKeys.add(key)
  }

  const keys = Array.from(uniqueKeys)
  const total = keys.length
  let done = 0

  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const batch = keys.slice(i, i + CONCURRENCY)
    const promises = batch.map(async key => {
      const parts = key.split('|')
      // key format: ADDRESS|CITY|STATE (address itself may contain '|' if malformed, but we uppercase-trim so it's fine)
      const state = parts[parts.length - 1]
      const city = parts[parts.length - 2]
      const address = parts.slice(0, parts.length - 2).join('|')
      const query = `${address}, ${city}, ${state}`
      const coord = await geocodeOne(query, token, 'address,poi')
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
