// Heartland CSV transaction data parser

export interface FuelingTransaction {
  unitNumber: string
  driverCity: string
  transDate: string
  amount: number
  gallons: number
  productName: string
  epaFuelType: string
  stationBrand: string
  stationName: string
  stationAddress: string
  stationState: string
  stationCity: string
  zipCode: string       // normalized to 5 digits
  isCircleK: boolean
}

// Normalize brand codes to readable names
export const BRAND_DISPLAY_NAMES: Record<string, string> = {
  'CIRCLE K': 'Circle K',
  'SPEEDWAY': 'Speedway',
  'EXXONMOB': 'ExxonMobil',
  'BP PRODU': 'BP',
  'KWIK TRI': 'Kwik Trip',
  'MARATHON': 'Marathon',
  'SHELL': 'Shell',
  'QUIKTRIP': 'QuikTrip',
  'UNBRANDE': 'Unbranded',
  "CASEY'S": "Casey's",
  'ROYAL FA': 'Royal Farms',
  'SHEETZ': 'Sheetz',
  'CITGO': 'Citgo',
  'PHILLIPS': 'Phillips 66',
  'SUNOCO': 'Sunoco',
  'UNKNOWN': 'Unknown',
  'MARTIN &': 'Martin & Martin',
  'GIANT EA': 'Giant Eagle',
  'HY VEE': 'Hy-Vee',
  'HOLIDAY': 'Holiday',
  'LOVES': "Love's Travel Stops",
  'PILOT': 'Pilot Flying J',
  'FLYING J': 'Flying J',
  'THORNTON': 'Thorntons',
  'WAWA': 'Wawa',
  'COSTCO': 'Costco',
  'BPAMOCO': 'BP Amoco',
  'MURPHY O': 'Murphy Oil',
  'RACETRAC': 'RaceTrac',
  'PUMP N M': 'Pump-N-Munch',
  'BUCKEYE': 'Buckeye',
  'MEIJER': 'Meijer',
  'KROGER': 'Kroger',
}

export function normalizeBrandName(raw: string): string {
  const upper = raw.trim().toUpperCase()
  return BRAND_DISPLAY_NAMES[upper] || BRAND_DISPLAY_NAMES[raw.trim()] || titleCase(raw.trim())
}

function titleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Parse a single CSV line, respecting quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

/**
 * Normalize a ZIP code to 5 digits (strips +4 extensions and corrects 6-digit errors)
 */
function normalizeZip(raw: string): string {
  const clean = raw.replace(/[^0-9]/g, '')
  return clean.substring(0, 5)
}

/**
 * Parse Heartland CSV file content into FuelingTransaction array
 *
 * Expected columns (0-indexed):
 * 0: Unit #
 * 1: Driver City
 * 2: Trans Date
 * 3: Transaction Time
 * 4: Trans DateTime
 * 5: Amount
 * 6: Gallons
 * 7: Product Name
 * 8: EPA Fuel Type Purchased
 * 9: Station brand name
 * 10: Station name
 * 11: Station address
 * 12: Station state
 * 13: Station city
 * 14: ZipCode
 */
export function parseHeartlandCSV(content: string): { transactions: FuelingTransaction[]; errors: string[] } {
  // Strip BOM if present
  const clean = content.replace(/^\uFEFF/, '')
  const lines = clean.split(/\r?\n/)
  const transactions: FuelingTransaction[] = []
  const errors: string[] = []

  // Skip header row (index 0)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = parseCSVLine(line)
    if (cols.length < 15) {
      errors.push(`Row ${i + 1}: expected 15 columns, got ${cols.length}`)
      continue
    }

    const stationBrand = cols[9].trim()
    const isCircleK = stationBrand.toUpperCase().includes('CIRCLE K')

    const amountStr = cols[5].trim().replace('$', '').replace(/,/g, '')
    const amount = parseFloat(amountStr) || 0
    const gallons = parseFloat(cols[6].trim()) || 0

    transactions.push({
      unitNumber: cols[0].trim(),
      driverCity: cols[1].trim(),
      transDate: cols[2].trim(),
      amount,
      gallons,
      productName: cols[7].trim(),
      epaFuelType: cols[8].trim(),
      stationBrand,
      stationName: cols[10].trim(),
      stationAddress: cols[11].trim(),
      stationState: cols[12].trim(),
      stationCity: cols[13].trim(),
      zipCode: normalizeZip(cols[14].trim()),
      isCircleK,
    })
  }

  return { transactions, errors }
}
