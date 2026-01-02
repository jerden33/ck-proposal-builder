// Mapbox API service

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

export interface Coordinates {
  lat: number
  lng: number
}

export interface GeocodingResult {
  coordinates: Coordinates
  formattedAddress: string
}

/**
 * Geocode an address using Mapbox Geocoding API
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  if (!MAPBOX_TOKEN) {
    console.error('Mapbox token not configured')
    return null
  }

  try {
    // Clean up the address
    const cleanAddress = address.trim()
    
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanAddress)}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1&types=address,place`
    )
    
    if (!response.ok) {
      console.error('Geocoding API error:', response.status, response.statusText)
      return null
    }

    const data = await response.json()
    
    console.log('Geocoding response:', data)
    
    if (data.features && data.features.length > 0) {
      const feature = data.features[0]
      
      // Check if we got a reasonable match
      const relevance = feature.relevance || 0
      
      // Log the result for debugging
      console.log('Found location:', feature.place_name, 'Relevance:', relevance)
      
      return {
        coordinates: {
          lng: feature.center[0],
          lat: feature.center[1]
        },
        formattedAddress: feature.place_name
      }
    }
    
    console.log('No results found for address:', cleanAddress)
    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in miles
 */
export function calculateDistance(
  coord1: Coordinates,
  coord2: Coordinates
): number {
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
 * Generate static map URL for embedding in PDFs
 */
export function getStaticMapUrl(
  center: Coordinates,
  markers: Coordinates[],
  width: number = 800,
  height: number = 600
): string {
  if (!MAPBOX_TOKEN) {
    return ''
  }

  // Create marker overlay string
  let markerOverlay = ''
  
  // Add center marker (customer location) in dark orange
  markerOverlay += `pin-l-circle+D64303(${center.lng},${center.lat})`
  
  // Add nearby store markers in brand orange (limit to 20 for URL length)
  markers.slice(0, 20).forEach(marker => {
    markerOverlay += `,pin-s-fuel+ED8B00(${marker.lng},${marker.lat})`
  })

  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${markerOverlay}/auto/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`
}

/**
 * Get bounds for multiple coordinates
 */
export function getBounds(coordinates: Coordinates[]): {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
} {
  const lngs = coordinates.map(c => c.lng)
  const lats = coordinates.map(c => c.lat)
  
  return {
    minLng: Math.min(...lngs),
    minLat: Math.min(...lats),
    maxLng: Math.max(...lngs),
    maxLat: Math.max(...lats)
  }
}
