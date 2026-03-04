/**
 * OTR Corridor Analysis
 *
 * Replaces the aerial-radius proximity model with a highway-corridor model for
 * Over-The-Road fleet analysis.  For each fueling event we find which major
 * interstate it occurred on, then check whether a truck-accessible Circle K
 * exists on that same corridor within a reasonable driving distance.
 *
 * This produces a per-corridor breakdown that is far more meaningful for OTR
 * sales conversations than "CK exists within X aerial miles."
 */

import { haversineDistanceMi } from './transaction-analysis'
import type { MapPoint } from './transaction-analysis'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CorridorDefinition {
  id: string
  name: string
  direction: 'EW' | 'NS'
  states: string[]
  waypoints: Array<{ lat: number; lng: number }>
}

export interface CorridorResult {
  corridorId: string
  corridorName: string
  direction: 'EW' | 'NS'
  /** Total gallons (CK + competitor) fueled on this corridor */
  totalGallons: number
  totalTransactions: number
  /** Gallons already at a CK truck stop on this corridor */
  ckGallons: number
  /** Non-CK gallons where a truck-accessible CK exists within OPPORTUNITY_MI on the corridor */
  captureGallons: number
  /** Non-CK gallons with no truck-accessible CK within OPPORTUNITY_MI on the corridor */
  gapGallons: number
  captureRate: number    // ckGallons / totalGallons × 100
  potentialRate: number  // (ckGallons + captureGallons) / totalGallons × 100
  /** Number of truck-accessible CK stores on this corridor */
  truckCKStoreCount: number
  /** Top competitor brand by gallons on this corridor */
  topCompetitorBrand: string
}

export interface CKStorePinLite {
  lat: number
  lng: number
  truckAccessible?: boolean
}

export interface OTRAnalysis {
  corridorResults: CorridorResult[]
  /** Gallons/transactions not snapping to any major interstate */
  offCorridorGallons: number
  offCorridorTransactions: number
  /** Total on-corridor gallons (for quick summary math) */
  totalCorridorGallons: number
}

// ─── Corridor Definitions ─────────────────────────────────────────────────────
// Simplified polylines for major US truck freight corridors.
// Accuracy within ~10 miles is sufficient for the corridor-snapping use-case.

export const CORRIDORS: CorridorDefinition[] = [
  {
    id: 'I-5',
    name: 'I-5',
    direction: 'NS',
    states: ['CA', 'OR', 'WA'],
    waypoints: [
      { lat: 32.72, lng: -117.15 }, // San Diego
      { lat: 33.93, lng: -118.18 }, // Los Angeles
      { lat: 36.74, lng: -119.79 }, // Fresno
      { lat: 38.58, lng: -121.49 }, // Sacramento
      { lat: 42.44, lng: -122.90 }, // Medford, OR
      { lat: 44.94, lng: -123.03 }, // Salem
      { lat: 45.52, lng: -122.68 }, // Portland
      { lat: 47.61, lng: -122.33 }, // Seattle
    ],
  },
  {
    id: 'I-10',
    name: 'I-10',
    direction: 'EW',
    states: ['CA', 'AZ', 'NM', 'TX', 'LA', 'MS', 'AL', 'FL'],
    waypoints: [
      { lat: 34.05, lng: -118.25 }, // Los Angeles
      { lat: 33.45, lng: -112.07 }, // Phoenix
      { lat: 32.25, lng: -110.94 }, // Tucson
      { lat: 31.76, lng: -106.49 }, // El Paso
      { lat: 29.42, lng: -98.49 },  // San Antonio
      { lat: 29.76, lng: -95.37 },  // Houston
      { lat: 30.45, lng: -91.19 },  // Baton Rouge
      { lat: 30.69, lng: -88.04 },  // Mobile
      { lat: 30.33, lng: -81.66 },  // Jacksonville
    ],
  },
  {
    id: 'I-15',
    name: 'I-15',
    direction: 'NS',
    states: ['CA', 'NV', 'UT', 'ID', 'MT'],
    waypoints: [
      { lat: 32.72, lng: -117.15 }, // San Diego
      { lat: 34.10, lng: -117.29 }, // San Bernardino
      { lat: 36.17, lng: -115.14 }, // Las Vegas
      { lat: 37.09, lng: -113.58 }, // St. George, UT
      { lat: 40.76, lng: -111.89 }, // Salt Lake City
      { lat: 41.73, lng: -111.84 }, // Ogden
      { lat: 43.49, lng: -112.04 }, // Idaho Falls
      { lat: 45.78, lng: -111.50 }, // Butte, MT
      { lat: 47.50, lng: -111.30 }, // Great Falls
    ],
  },
  {
    id: 'I-20',
    name: 'I-20',
    direction: 'EW',
    states: ['TX', 'LA', 'MS', 'AL', 'GA', 'SC'],
    waypoints: [
      { lat: 31.84, lng: -102.37 }, // Odessa, TX
      { lat: 32.73, lng: -97.31 },  // Fort Worth
      { lat: 32.79, lng: -96.80 },  // Dallas
      { lat: 32.50, lng: -93.75 },  // Shreveport
      { lat: 32.29, lng: -90.18 },  // Jackson
      { lat: 33.52, lng: -86.80 },  // Birmingham
      { lat: 33.75, lng: -84.39 },  // Atlanta
      { lat: 33.99, lng: -81.04 },  // Columbia, SC
    ],
  },
  {
    id: 'I-25',
    name: 'I-25',
    direction: 'NS',
    states: ['NM', 'CO', 'WY'],
    waypoints: [
      { lat: 32.32, lng: -106.77 }, // Las Cruces
      { lat: 35.08, lng: -106.65 }, // Albuquerque
      { lat: 35.69, lng: -105.94 }, // Santa Fe
      { lat: 38.83, lng: -104.82 }, // Colorado Springs
      { lat: 39.74, lng: -104.98 }, // Denver
      { lat: 40.59, lng: -105.08 }, // Fort Collins
      { lat: 41.13, lng: -104.82 }, // Cheyenne
    ],
  },
  {
    id: 'I-35',
    name: 'I-35',
    direction: 'NS',
    states: ['TX', 'OK', 'KS', 'MO', 'IA', 'MN'],
    waypoints: [
      { lat: 29.42, lng: -98.49 },  // San Antonio
      { lat: 30.27, lng: -97.74 },  // Austin
      { lat: 31.55, lng: -97.15 },  // Waco
      { lat: 32.79, lng: -96.80 },  // Dallas
      { lat: 35.47, lng: -97.52 },  // Oklahoma City
      { lat: 37.69, lng: -97.34 },  // Wichita
      { lat: 39.10, lng: -94.58 },  // Kansas City
      { lat: 41.26, lng: -95.94 },  // Omaha
      { lat: 44.98, lng: -93.27 },  // Minneapolis
    ],
  },
  {
    id: 'I-40',
    name: 'I-40',
    direction: 'EW',
    states: ['CA', 'AZ', 'NM', 'TX', 'OK', 'AR', 'TN', 'NC'],
    waypoints: [
      { lat: 34.90, lng: -117.02 }, // Barstow, CA
      { lat: 35.19, lng: -114.05 }, // Needles/Kingman area
      { lat: 35.08, lng: -106.65 }, // Albuquerque
      { lat: 35.19, lng: -101.83 }, // Amarillo
      { lat: 35.47, lng: -97.52 },  // Oklahoma City
      { lat: 35.38, lng: -94.40 },  // Fort Smith, AR
      { lat: 35.15, lng: -90.05 },  // Memphis
      { lat: 36.17, lng: -86.78 },  // Nashville
      { lat: 35.23, lng: -80.84 },  // Charlotte
      { lat: 35.91, lng: -78.79 },  // Raleigh
    ],
  },
  {
    id: 'I-55',
    name: 'I-55',
    direction: 'NS',
    states: ['LA', 'MS', 'TN', 'AR', 'MO', 'IL'],
    waypoints: [
      { lat: 29.95, lng: -90.07 },  // New Orleans
      { lat: 32.29, lng: -90.18 },  // Jackson
      { lat: 35.15, lng: -90.05 },  // Memphis
      { lat: 38.63, lng: -90.20 },  // St. Louis
      { lat: 39.80, lng: -89.65 },  // Springfield, IL
      { lat: 41.88, lng: -87.63 },  // Chicago
    ],
  },
  {
    id: 'I-65',
    name: 'I-65',
    direction: 'NS',
    states: ['AL', 'TN', 'KY', 'IN'],
    waypoints: [
      { lat: 30.69, lng: -88.04 },  // Mobile
      { lat: 33.52, lng: -86.80 },  // Birmingham
      { lat: 36.17, lng: -86.78 },  // Nashville
      { lat: 38.26, lng: -85.76 },  // Louisville
      { lat: 39.77, lng: -86.16 },  // Indianapolis
      { lat: 41.60, lng: -87.30 },  // Gary (Chicago area)
    ],
  },
  {
    id: 'I-70',
    name: 'I-70',
    direction: 'EW',
    states: ['CO', 'KS', 'MO', 'IL', 'IN', 'OH', 'PA', 'MD'],
    waypoints: [
      { lat: 39.74, lng: -104.98 }, // Denver
      { lat: 38.98, lng: -95.68 },  // Topeka
      { lat: 39.10, lng: -94.58 },  // Kansas City
      { lat: 38.63, lng: -90.20 },  // St. Louis
      { lat: 39.77, lng: -86.16 },  // Indianapolis
      { lat: 40.44, lng: -80.00 },  // Pittsburgh
      { lat: 39.29, lng: -76.61 },  // Baltimore
    ],
  },
  {
    id: 'I-75',
    name: 'I-75',
    direction: 'NS',
    states: ['FL', 'GA', 'TN', 'KY', 'OH', 'MI'],
    waypoints: [
      { lat: 25.77, lng: -80.19 },  // Miami
      { lat: 27.95, lng: -82.46 },  // Tampa
      { lat: 33.75, lng: -84.39 },  // Atlanta
      { lat: 35.96, lng: -83.92 },  // Knoxville
      { lat: 37.04, lng: -84.62 },  // London, KY
      { lat: 39.10, lng: -84.51 },  // Cincinnati
      { lat: 41.66, lng: -83.56 },  // Toledo
      { lat: 42.33, lng: -83.05 },  // Detroit
    ],
  },
  {
    id: 'I-80',
    name: 'I-80',
    direction: 'EW',
    states: ['CA', 'NV', 'UT', 'WY', 'NE', 'IA', 'IL', 'IN', 'OH', 'PA', 'NJ'],
    waypoints: [
      { lat: 37.79, lng: -122.39 }, // San Francisco
      { lat: 38.58, lng: -121.49 }, // Sacramento
      { lat: 39.53, lng: -119.81 }, // Reno
      { lat: 40.76, lng: -111.89 }, // Salt Lake City
      { lat: 41.13, lng: -104.82 }, // Cheyenne
      { lat: 41.26, lng: -95.94 },  // Omaha
      { lat: 41.59, lng: -93.62 },  // Des Moines
      { lat: 41.88, lng: -87.63 },  // Chicago
      { lat: 41.49, lng: -81.69 },  // Cleveland
      { lat: 40.44, lng: -80.00 },  // Pittsburgh
      { lat: 40.70, lng: -74.04 },  // Newark / New York
    ],
  },
  {
    id: 'I-81',
    name: 'I-81',
    direction: 'NS',
    states: ['TN', 'VA', 'MD', 'PA', 'NY'],
    waypoints: [
      { lat: 36.15, lng: -83.75 },  // Knoxville
      { lat: 36.54, lng: -82.56 },  // Bristol, TN/VA
      { lat: 37.27, lng: -80.01 },  // Roanoke
      { lat: 38.46, lng: -78.87 },  // Harrisonburg
      { lat: 39.97, lng: -76.73 },  // York, PA
      { lat: 40.26, lng: -76.88 },  // Harrisburg
      { lat: 41.41, lng: -75.66 },  // Scranton
      { lat: 43.05, lng: -76.15 },  // Syracuse
    ],
  },
  {
    id: 'I-85',
    name: 'I-85',
    direction: 'NS',
    states: ['AL', 'GA', 'SC', 'NC', 'VA'],
    waypoints: [
      { lat: 32.37, lng: -86.30 },  // Montgomery
      { lat: 33.75, lng: -84.39 },  // Atlanta
      { lat: 34.54, lng: -82.65 },  // Anderson, SC
      { lat: 35.23, lng: -80.84 },  // Charlotte
      { lat: 36.07, lng: -79.79 },  // Greensboro
      { lat: 36.69, lng: -78.89 },  // Henderson area
      { lat: 37.23, lng: -77.40 },  // Petersburg, VA
    ],
  },
  {
    id: 'I-90',
    name: 'I-90',
    direction: 'EW',
    states: ['WA', 'ID', 'MT', 'WY', 'SD', 'MN', 'WI', 'IL', 'IN', 'OH', 'PA', 'NY', 'MA'],
    waypoints: [
      { lat: 47.61, lng: -122.33 }, // Seattle
      { lat: 47.66, lng: -117.43 }, // Spokane
      { lat: 45.79, lng: -108.50 }, // Billings
      { lat: 44.06, lng: -103.23 }, // Rapid City
      { lat: 43.55, lng: -96.73 },  // Sioux Falls
      { lat: 43.05, lng: -89.40 },  // Madison, WI
      { lat: 41.88, lng: -87.63 },  // Chicago
      { lat: 41.49, lng: -81.69 },  // Cleveland
      { lat: 43.16, lng: -77.61 },  // Rochester
      { lat: 42.36, lng: -71.06 },  // Boston
    ],
  },
  {
    id: 'I-95',
    name: 'I-95',
    direction: 'NS',
    states: ['FL', 'GA', 'SC', 'NC', 'VA', 'MD', 'DE', 'PA', 'NJ', 'NY', 'CT', 'RI', 'MA'],
    waypoints: [
      { lat: 25.77, lng: -80.19 },  // Miami
      { lat: 30.33, lng: -81.66 },  // Jacksonville
      { lat: 33.84, lng: -78.64 },  // Wilmington, NC
      { lat: 34.00, lng: -79.93 },  // Florence, SC (I-95 runs through here)
      { lat: 36.85, lng: -76.29 },  // Norfolk area
      { lat: 38.90, lng: -77.04 },  // Washington DC
      { lat: 39.29, lng: -76.61 },  // Baltimore
      { lat: 39.95, lng: -75.17 },  // Philadelphia
      { lat: 40.71, lng: -74.01 },  // New York
      { lat: 41.82, lng: -71.41 },  // Providence
      { lat: 42.36, lng: -71.06 },  // Boston
    ],
  },

  // ── Additional corridors ──────────────────────────────────────────────────

  {
    id: 'I-27',
    name: 'I-27',
    direction: 'NS',
    states: ['TX'],
    waypoints: [
      { lat: 33.58, lng: -101.85 }, // Lubbock
      { lat: 34.18, lng: -101.71 }, // Plainview
      { lat: 35.22, lng: -101.83 }, // Amarillo
    ],
  },
  {
    id: 'I-29',
    name: 'I-29',
    direction: 'NS',
    states: ['MO', 'IA', 'SD', 'ND'],
    waypoints: [
      { lat: 39.10, lng: -94.58 },  // Kansas City, MO
      { lat: 39.77, lng: -94.85 },  // St. Joseph, MO
      { lat: 42.50, lng: -96.40 },  // Sioux City, IA
      { lat: 43.55, lng: -96.73 },  // Sioux Falls, SD
      { lat: 44.90, lng: -97.12 },  // Watertown, SD
      { lat: 46.88, lng: -96.79 },  // Fargo, ND
      { lat: 47.92, lng: -97.03 },  // Grand Forks, ND
      { lat: 48.97, lng: -97.24 },  // Pembina, ND (border)
    ],
  },
  {
    id: 'I-30',
    name: 'I-30',
    direction: 'EW',
    states: ['TX', 'AR'],
    waypoints: [
      { lat: 32.73, lng: -97.31 },  // Fort Worth
      { lat: 32.79, lng: -96.80 },  // Dallas
      { lat: 33.14, lng: -96.11 },  // Greenville, TX
      { lat: 33.43, lng: -94.05 },  // Texarkana
      { lat: 33.67, lng: -93.59 },  // Hope, AR
      { lat: 34.74, lng: -92.29 },  // Little Rock
    ],
  },
  {
    id: 'I-37',
    name: 'I-37',
    direction: 'NS',
    states: ['TX'],
    waypoints: [
      { lat: 29.42, lng: -98.49 },  // San Antonio
      { lat: 28.97, lng: -98.48 },  // Pleasanton
      { lat: 28.46, lng: -98.18 },  // Three Rivers
      { lat: 27.80, lng: -97.40 },  // Corpus Christi
    ],
  },
  {
    id: 'I-39',
    name: 'I-39',
    direction: 'NS',
    states: ['IL', 'WI'],
    waypoints: [
      { lat: 40.48, lng: -88.99 },  // Bloomington, IL
      { lat: 40.88, lng: -88.63 },  // Pontiac, IL
      { lat: 41.35, lng: -88.84 },  // Ottawa, IL
      { lat: 42.27, lng: -89.09 },  // Rockford, IL
      { lat: 42.50, lng: -89.02 },  // Beloit, WI
    ],
  },
  {
    id: 'I-41',
    name: 'I-41',
    direction: 'NS',
    states: ['WI'],
    waypoints: [
      { lat: 43.04, lng: -87.91 },  // Milwaukee
      { lat: 43.42, lng: -88.18 },  // Hartford, WI
      { lat: 43.77, lng: -88.45 },  // Fond du Lac
      { lat: 44.02, lng: -88.54 },  // Oshkosh
      { lat: 44.26, lng: -88.41 },  // Appleton
      { lat: 44.52, lng: -88.02 },  // Green Bay
    ],
  },
  {
    id: 'I-44',
    name: 'I-44',
    direction: 'EW',
    states: ['OK', 'MO'],
    waypoints: [
      { lat: 35.41, lng: -99.40 },  // Elk City, OK (I-40 junction)
      { lat: 35.47, lng: -97.52 },  // Oklahoma City
      { lat: 36.15, lng: -95.99 },  // Tulsa
      { lat: 37.08, lng: -94.51 },  // Joplin, MO
      { lat: 37.22, lng: -93.29 },  // Springfield, MO
      { lat: 38.63, lng: -90.20 },  // St. Louis
    ],
  },
  {
    id: 'I-45',
    name: 'I-45',
    direction: 'NS',
    states: ['TX'],
    waypoints: [
      { lat: 32.79, lng: -96.80 },  // Dallas
      { lat: 32.09, lng: -96.47 },  // Corsicana
      { lat: 30.72, lng: -95.55 },  // Huntsville
      { lat: 29.76, lng: -95.37 },  // Houston
      { lat: 29.30, lng: -94.80 },  // Galveston
    ],
  },
  {
    id: 'I-49',
    name: 'I-49',
    direction: 'NS',
    states: ['MO', 'AR', 'LA'],
    waypoints: [
      { lat: 39.10, lng: -94.58 },  // Kansas City, MO
      { lat: 37.08, lng: -94.51 },  // Joplin, MO
      { lat: 36.07, lng: -94.16 },  // Fayetteville, AR
      { lat: 35.38, lng: -94.40 },  // Fort Smith, AR
      { lat: 33.43, lng: -94.05 },  // Texarkana
      { lat: 32.52, lng: -93.75 },  // Shreveport, LA
      { lat: 30.22, lng: -92.02 },  // Lafayette, LA
      { lat: 29.95, lng: -90.07 },  // New Orleans
    ],
  },
  {
    id: 'I-59',
    name: 'I-59',
    direction: 'NS',
    states: ['AL', 'MS', 'LA'],
    waypoints: [
      { lat: 33.52, lng: -86.80 },  // Birmingham, AL
      { lat: 33.40, lng: -87.28 },  // Tuscaloosa
      { lat: 32.37, lng: -88.70 },  // Meridian, MS
      { lat: 31.33, lng: -89.29 },  // Hattiesburg
      { lat: 30.50, lng: -89.75 },  // Picayune, MS
      { lat: 29.95, lng: -90.07 },  // New Orleans
    ],
  },
  {
    id: 'I-64',
    name: 'I-64',
    direction: 'EW',
    states: ['MO', 'IL', 'KY', 'WV', 'VA'],
    waypoints: [
      { lat: 38.63, lng: -90.20 },  // St. Louis
      { lat: 38.26, lng: -85.76 },  // Louisville
      { lat: 38.04, lng: -84.50 },  // Lexington, KY
      { lat: 38.35, lng: -81.63 },  // Charleston, WV
      { lat: 37.54, lng: -77.44 },  // Richmond, VA
      { lat: 36.85, lng: -76.29 },  // Norfolk/Hampton Roads
    ],
  },
  {
    id: 'I-69',
    name: 'I-69',
    direction: 'NS',
    states: ['MI', 'IN'],
    waypoints: [
      { lat: 42.97, lng: -82.43 },  // Port Huron, MI
      { lat: 43.01, lng: -83.69 },  // Flint, MI
      { lat: 42.73, lng: -84.56 },  // Lansing, MI
      { lat: 41.08, lng: -85.14 },  // Fort Wayne, IN
      { lat: 39.77, lng: -86.16 },  // Indianapolis
      { lat: 37.97, lng: -87.57 },  // Evansville, IN
    ],
  },
  {
    id: 'I-71',
    name: 'I-71',
    direction: 'NS',
    states: ['OH', 'KY'],
    waypoints: [
      { lat: 41.50, lng: -81.69 },  // Cleveland
      { lat: 40.87, lng: -82.32 },  // Mansfield, OH
      { lat: 39.96, lng: -82.99 },  // Columbus
      { lat: 39.10, lng: -84.51 },  // Cincinnati
      { lat: 38.26, lng: -85.76 },  // Louisville
    ],
  },
  {
    id: 'I-74',
    name: 'I-74',
    direction: 'EW',
    states: ['OH', 'IN', 'IL'],
    waypoints: [
      { lat: 39.10, lng: -84.51 },  // Cincinnati
      { lat: 39.76, lng: -84.19 },  // Dayton
      { lat: 39.77, lng: -86.16 },  // Indianapolis
      { lat: 40.12, lng: -88.25 },  // Champaign, IL
      { lat: 40.48, lng: -88.99 },  // Bloomington, IL
      { lat: 41.51, lng: -90.52 },  // Moline/Rock Island
    ],
  },
  {
    id: 'I-76',
    name: 'I-76 (PA Turnpike)',
    direction: 'EW',
    states: ['OH', 'PA'],
    waypoints: [
      { lat: 41.07, lng: -80.67 },  // Youngstown, OH (I-80 junction)
      { lat: 40.44, lng: -80.00 },  // Pittsburgh
      { lat: 40.07, lng: -78.50 },  // Bedford, PA
      { lat: 40.20, lng: -77.19 },  // Carlisle, PA
      { lat: 40.26, lng: -76.88 },  // Harrisburg
      { lat: 40.10, lng: -75.38 },  // King of Prussia
      { lat: 39.95, lng: -75.17 },  // Philadelphia
    ],
  },
  {
    id: 'I-77',
    name: 'I-77',
    direction: 'NS',
    states: ['SC', 'NC', 'WV', 'OH'],
    waypoints: [
      { lat: 34.00, lng: -81.03 },  // Columbia, SC
      { lat: 35.23, lng: -80.84 },  // Charlotte
      { lat: 35.78, lng: -80.88 },  // Statesville, NC
      { lat: 37.27, lng: -81.22 },  // Bluefield, WV
      { lat: 38.35, lng: -81.63 },  // Charleston, WV
      { lat: 39.27, lng: -81.56 },  // Parkersburg, WV
      { lat: 40.80, lng: -81.38 },  // Canton, OH
      { lat: 41.08, lng: -81.52 },  // Akron
      { lat: 41.50, lng: -81.69 },  // Cleveland
    ],
  },
  {
    id: 'I-78',
    name: 'I-78',
    direction: 'EW',
    states: ['PA', 'NJ', 'NY'],
    waypoints: [
      { lat: 40.26, lng: -76.88 },  // Harrisburg
      { lat: 40.60, lng: -75.49 },  // Allentown, PA
      { lat: 40.69, lng: -74.72 },  // Clinton, NJ
      { lat: 40.74, lng: -74.17 },  // Newark, NJ
      { lat: 40.71, lng: -74.01 },  // New York City
    ],
  },
  {
    id: 'I-79',
    name: 'I-79',
    direction: 'NS',
    states: ['WV', 'PA'],
    waypoints: [
      { lat: 38.35, lng: -81.63 },  // Charleston, WV
      { lat: 39.63, lng: -79.96 },  // Morgantown, WV
      { lat: 40.44, lng: -80.00 },  // Pittsburgh
      { lat: 40.86, lng: -79.90 },  // Butler, PA
      { lat: 42.13, lng: -80.09 },  // Erie, PA
    ],
  },
  {
    id: 'I-83',
    name: 'I-83',
    direction: 'NS',
    states: ['MD', 'PA'],
    waypoints: [
      { lat: 39.29, lng: -76.61 },  // Baltimore
      { lat: 39.97, lng: -76.73 },  // York, PA
      { lat: 40.26, lng: -76.88 },  // Harrisburg
    ],
  },
  {
    id: 'I-84-OR',
    name: 'I-84 (Pacific NW)',
    direction: 'EW',
    states: ['OR', 'ID', 'UT'],
    waypoints: [
      { lat: 45.52, lng: -122.68 }, // Portland, OR
      { lat: 45.60, lng: -121.18 }, // The Dalles
      { lat: 45.67, lng: -118.79 }, // Pendleton
      { lat: 44.32, lng: -116.98 }, // Ontario/Boise area
      { lat: 43.62, lng: -116.20 }, // Boise, ID
      { lat: 42.56, lng: -114.47 }, // Twin Falls
      { lat: 42.54, lng: -113.79 }, // Burley
      { lat: 41.22, lng: -111.97 }, // Ogden, UT (I-84/I-15 junction)
    ],
  },
  {
    id: 'I-87',
    name: 'I-87 (NY Thruway)',
    direction: 'NS',
    states: ['NY'],
    waypoints: [
      { lat: 40.71, lng: -74.01 },  // New York City
      { lat: 41.50, lng: -74.01 },  // Newburgh
      { lat: 42.65, lng: -73.76 },  // Albany
      { lat: 43.31, lng: -73.64 },  // Glens Falls
      { lat: 44.70, lng: -73.45 },  // Plattsburgh
      { lat: 45.00, lng: -73.43 },  // Canadian border
    ],
  },
  {
    id: 'I-88-NY',
    name: 'I-88 (Albany–Binghamton)',
    direction: 'EW',
    states: ['NY'],
    waypoints: [
      { lat: 42.82, lng: -73.95 },  // Schenectady / Albany junction
      { lat: 42.46, lng: -75.07 },  // Oneonta
      { lat: 42.10, lng: -75.91 },  // Binghamton (I-81/I-86 junction)
    ],
  },
  {
    id: 'I-91',
    name: 'I-91',
    direction: 'NS',
    states: ['CT', 'MA', 'VT'],
    waypoints: [
      { lat: 41.31, lng: -72.93 },  // New Haven, CT
      { lat: 41.76, lng: -72.68 },  // Hartford
      { lat: 42.10, lng: -72.59 },  // Springfield, MA
      { lat: 42.85, lng: -72.56 },  // Brattleboro, VT
      { lat: 43.65, lng: -72.32 },  // White River Junction
      { lat: 44.48, lng: -73.21 },  // Burlington, VT
    ],
  },
  {
    id: 'I-94',
    name: 'I-94',
    direction: 'EW',
    states: ['MT', 'ND', 'MN', 'WI', 'IL', 'IN', 'MI'],
    waypoints: [
      { lat: 45.79, lng: -108.50 }, // Billings, MT (I-90 junction)
      { lat: 46.81, lng: -100.79 }, // Bismarck, ND
      { lat: 46.88, lng: -96.79 },  // Fargo, ND
      { lat: 44.98, lng: -93.27 },  // Minneapolis / St. Paul
      { lat: 44.81, lng: -91.50 },  // Eau Claire, WI
      { lat: 43.07, lng: -89.40 },  // Madison, WI
      { lat: 43.04, lng: -87.91 },  // Milwaukee
      { lat: 41.88, lng: -87.63 },  // Chicago
      { lat: 41.60, lng: -87.34 },  // Gary, IN
      { lat: 42.33, lng: -83.05 },  // Detroit
      { lat: 42.97, lng: -82.43 },  // Port Huron, MI
    ],
  },
  {
    id: 'I-96',
    name: 'I-96',
    direction: 'EW',
    states: ['MI'],
    waypoints: [
      { lat: 42.33, lng: -83.05 },  // Detroit
      { lat: 42.28, lng: -83.74 },  // Ann Arbor
      { lat: 42.73, lng: -84.56 },  // Lansing
      { lat: 42.96, lng: -85.67 },  // Grand Rapids
      { lat: 43.23, lng: -86.25 },  // Muskegon
    ],
  },
]

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/**
 * Minimum distance (miles) from point P to the line segment AB.
 * Uses a lat/lng Cartesian projection — accurate to within a few percent
 * at US latitudes for the segment lengths we deal with here.
 */
function pointToSegmentDistanceMi(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const abLat = bLat - aLat
  const abLng = bLng - aLng
  const len2  = abLat * abLat + abLng * abLng
  if (len2 < 1e-12) return haversineDistanceMi(pLat, pLng, aLat, aLng)
  const t = Math.max(0, Math.min(1,
    ((pLat - aLat) * abLat + (pLng - aLng) * abLng) / len2
  ))
  return haversineDistanceMi(pLat, pLng, aLat + t * abLat, aLng + t * abLng)
}

/** Minimum distance from a point to a polyline (series of segments). */
function pointToPolylineMi(
  lat: number, lng: number,
  waypoints: Array<{ lat: number; lng: number }>,
): number {
  let min = Infinity
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = pointToSegmentDistanceMi(
      lat, lng,
      waypoints[i].lat, waypoints[i].lng,
      waypoints[i + 1].lat, waypoints[i + 1].lng,
    )
    if (d < min) min = d
  }
  return min
}

// ─── Analysis constants ───────────────────────────────────────────────────────

/** A fueling point is "on" a corridor if it's within this many miles of the polyline */
const TRANSACTION_SNAP_MI = 15

/** A CK store is "on" a corridor if it's within this many miles of the polyline */
const CK_STORE_SNAP_MI = 8

/**
 * On-corridor opportunity threshold: if a truck-accessible CK is within this
 * many miles of a non-CK fill (both on the same corridor), we call it capturable.
 * 30 mi ≈ reasonable detour range for an OTR driver.
 */
const OPPORTUNITY_MI = 30

// ─── Main analysis function ───────────────────────────────────────────────────

export function runOTRAnalysis(
  mapPoints: MapPoint[],
  ckStores: CKStorePinLite[],
): OTRAnalysis {
  if (mapPoints.length === 0) {
    return { corridorResults: [], offCorridorGallons: 0, offCorridorTransactions: 0, totalCorridorGallons: 0 }
  }

  // 1. Map each truck-accessible CK store to every corridor it lies on
  const ckOnCorridor = new Map<string, CKStorePinLite[]>()
  CORRIDORS.forEach(c => ckOnCorridor.set(c.id, []))
  const truckCKStores = ckStores.filter(s => s.truckAccessible)

  for (const ck of truckCKStores) {
    for (const corridor of CORRIDORS) {
      if (pointToPolylineMi(ck.lat, ck.lng, corridor.waypoints) <= CK_STORE_SNAP_MI) {
        ckOnCorridor.get(corridor.id)!.push(ck)
      }
    }
  }

  // 2. Accumulate per-corridor stats from map points
  type CorridorAcc = {
    gallons: number; transactions: number
    ckGallons: number; captureGallons: number; gapGallons: number
    competitorBrands: Map<string, number>
  }
  const acc = new Map<string, CorridorAcc>()
  CORRIDORS.forEach(c => acc.set(c.id, {
    gallons: 0, transactions: 0, ckGallons: 0, captureGallons: 0, gapGallons: 0,
    competitorBrands: new Map(),
  }))

  let offCorridorGallons = 0
  let offCorridorTransactions = 0

  for (const pt of mapPoints) {
    // Snap to nearest corridor within threshold
    let bestId: string | null = null
    let bestDist = Infinity
    for (const corridor of CORRIDORS) {
      const d = pointToPolylineMi(pt.lat, pt.lng, corridor.waypoints)
      if (d < TRANSACTION_SNAP_MI && d < bestDist) {
        bestDist = d
        bestId = corridor.id
      }
    }

    if (!bestId) {
      offCorridorGallons += pt.gallons
      offCorridorTransactions += pt.transactions
      continue
    }

    const data = acc.get(bestId)!
    data.gallons += pt.gallons
    data.transactions += pt.transactions

    if (pt.isCircleK) {
      data.ckGallons += pt.gallons
    } else {
      // Is there a truck-accessible CK within OPPORTUNITY_MI on the same corridor?
      const truckCKs = ckOnCorridor.get(bestId) ?? []
      let nearestMi = Infinity
      for (const ck of truckCKs) {
        const d = haversineDistanceMi(pt.lat, pt.lng, ck.lat, ck.lng)
        if (d < nearestMi) nearestMi = d
      }
      if (nearestMi <= OPPORTUNITY_MI) {
        data.captureGallons += pt.gallons
      } else {
        data.gapGallons += pt.gallons
      }

      // Track competitor brand for top-brand calc
      if (pt.label) {
        const prev = data.competitorBrands.get(pt.label) ?? 0
        data.competitorBrands.set(pt.label, prev + pt.gallons)
      }
    }
  }

  // 3. Build sorted results (only corridors with activity)
  const corridorResults: CorridorResult[] = CORRIDORS
    .filter(c => (acc.get(c.id)?.gallons ?? 0) > 0)
    .map(c => {
      const d = acc.get(c.id)!
      const truckCKCount = ckOnCorridor.get(c.id)!.length

      let topCompetitorBrand = '—'
      let topGallons = 0
      for (const [brand, gal] of d.competitorBrands) {
        if (gal > topGallons) { topGallons = gal; topCompetitorBrand = brand }
      }

      return {
        corridorId: c.id,
        corridorName: c.name,
        direction: c.direction,
        totalGallons: d.gallons,
        totalTransactions: d.transactions,
        ckGallons: d.ckGallons,
        captureGallons: d.captureGallons,
        gapGallons: d.gapGallons,
        captureRate:   d.gallons > 0 ? (d.ckGallons / d.gallons) * 100 : 0,
        potentialRate: d.gallons > 0 ? ((d.ckGallons + d.captureGallons) / d.gallons) * 100 : 0,
        truckCKStoreCount: truckCKCount,
        topCompetitorBrand,
      }
    })
    .sort((a, b) => b.totalGallons - a.totalGallons)

  const totalCorridorGallons = corridorResults.reduce((s, r) => s + r.totalGallons, 0)

  return { corridorResults, offCorridorGallons, offCorridorTransactions, totalCorridorGallons }
}
