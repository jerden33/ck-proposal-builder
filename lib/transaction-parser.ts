// Flexible fleet transaction CSV parser
// Detects column headers automatically — supports Heartland, WEX, Fuelman, and generic formats

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FuelingTransaction {
  transDate: string
  stationCity: string
  stationState: string
  gallons: number
  fuelType: string        // e.g. GASOLINE, DIESEL
  stationName: string
  stationBrand: string
  stationAddress: string
  zipCode: string
  unitNumber: string
  driverCity: string
  amount: number
  productName: string
  isCircleK: boolean
}

export interface ParseResult {
  transactions: FuelingTransaction[]
  errors: string[]
  detectedFormat: string
  missingRequiredFields: string[]  // canonical names that weren't found in headers
  foundFields: string[]            // canonical names that were detected
}

// ─── Header alias map ─────────────────────────────────────────────────────────
// Keys are canonical field names; values are lists of header aliases (lowercase)

const FIELD_ALIASES: Record<string, string[]> = {
  date: [
    'trans date', 'date', 'transaction date', 'trans datetime',
    'transaction datetime', 'posting date', 'post date', 'tran date',
    'service date', 'fill date', 'invoice date', 'sale date',
  ],
  city: [
    'station city', 'city', 'site city', 'location city', 'trans city',
    'merchant city', 'fuel city', 'fueling city', 'store city',
  ],
  state: [
    'station state', 'state', 'site state', 'location state',
    'merchant state', 'fuel state', 'fueling state', 'st', 'store state',
    'prov', 'province',
  ],
  gallons: [
    'gallons', 'quantity', 'gal', 'volume', 'fuel quantity', 'qty',
    'fuel gallons', 'net gallons', 'amount gallons', 'total gallons',
    'fuel volume',
  ],
  fuelType: [
    'epa fuel type purchased', 'epa fuel type', 'fuel type', 'product type',
    'fuel category', 'fuel class', 'energy type',
  ],
  stationName: [
    'station name', 'site name', 'location name', 'merchant name',
    'store name', 'location description',
  ],
  stationBrand: [
    'station brand name', 'brand', 'network', 'station brand',
    'merchant brand', 'fuel brand', 'chain', 'oil company', 'brand name',
  ],
  stationAddress: [
    'station address', 'address', 'street', 'street address',
    'site address', 'location address', 'addr', 'address 1',
  ],
  zipCode: [
    'zipcode', 'zip', 'zip code', 'postal code', 'zip_code',
    'postalcode', 'postal', 'zip/postal',
  ],
  unitNumber: [
    'unit #', 'unit number', 'vehicle', 'card #', 'card number',
    'vehicle id', 'asset', 'unit', 'vehicle #', 'asset id', 'asset number',
    'equipment', 'truck #', 'truck number', 'unit id',
  ],
  driverCity: [
    'driver city', 'home city', 'driver home city', 'driver location',
    'driver base city', 'base city',
  ],
  amount: [
    'amount', 'total', 'total amount', 'spend', 'cost', 'sale amount',
    'net amount', 'transaction amount', 'charge', 'total cost', 'total charge',
    'invoice amount', 'billed amount', 'dollars',
  ],
  productName: [
    'product name', 'product', 'item', 'fuel grade', 'grade',
    'fuel product', 'product description', 'product desc',
  ],
}

const REQUIRED_FIELDS = ['date', 'city', 'state', 'gallons']

// ─── Brand display names ───────────────────────────────────────────────────────

export const BRAND_DISPLAY_NAMES: Record<string, string> = {
  'CIRCLE K': 'Circle K',
  'SPEEDWAY': 'Speedway',
  'EXXONMOB': 'ExxonMobil',
  'EXXON': 'ExxonMobil',
  'BP PRODU': 'BP',
  'BP': 'BP',
  'KWIK TRI': 'Kwik Trip',
  'KWIK TRIP': 'Kwik Trip',
  'MARATHON': 'Marathon',
  'SHELL': 'Shell',
  'QUIKTRIP': 'QuikTrip',
  'UNBRANDE': 'Unbranded',
  'UNBRANDED': 'Unbranded',
  "CASEY'S": "Casey's",
  'ROYAL FA': 'Royal Farms',
  'ROYAL FARMS': 'Royal Farms',
  'SHEETZ': 'Sheetz',
  'CITGO': 'Citgo',
  'PHILLIPS': 'Phillips 66',
  'PHILLIPS 66': 'Phillips 66',
  'SUNOCO': 'Sunoco',
  'UNKNOWN': 'Unknown',
  'MARTIN &': 'Martin & Martin',
  'GIANT EA': 'Giant Eagle',
  'GIANT EAGLE': 'Giant Eagle',
  'HY VEE': 'Hy-Vee',
  'HOLIDAY': 'Holiday',
  'LOVES': "Love's Travel Stops",
  "LOVE'S": "Love's Travel Stops",
  'PILOT': 'Pilot Flying J',
  'FLYING J': 'Flying J',
  'THORNTON': 'Thorntons',
  'THORNTONS': 'Thorntons',
  'WAWA': 'Wawa',
  'COSTCO': 'Costco',
  'BPAMOCO': 'BP Amoco',
  'BP AMOCO': 'BP Amoco',
  'MURPHY O': 'Murphy Oil',
  'MURPHY OIL': 'Murphy Oil',
  'RACETRAC': 'RaceTrac',
  'PUMP N M': 'Pump-N-Munch',
  'BUCKEYE': 'Buckeye',
  'MEIJER': 'Meijer',
  'KROGER': 'Kroger',
  'WALMART': 'Walmart',
  "SAM'S CLUB": "Sam's Club",
  'PETRO': 'Petro',
  'TA': 'TravelCenters of America',
  'AMBEST': 'AmBest',
  'TUCKER': 'Tucker',
}

export function normalizeBrandName(raw: string): string {
  const upper = raw.trim().toUpperCase()
  return BRAND_DISPLAY_NAMES[upper] ?? titleCase(raw.trim())
}

function titleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function normalizeKey(h: string): string {
  return h.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ')
}

function buildColumnIndex(headers: string[]): Record<string, number> {
  const index: Record<string, number> = {}
  const normalized = headers.map(normalizeKey)

  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const colIdx = normalized.indexOf(normalizeKey(alias))
      if (colIdx !== -1) {
        index[canonical] = colIdx
        break
      }
    }
  }
  return index
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function normalizeZip(raw: string): string {
  return raw.replace(/[^0-9]/g, '').substring(0, 5)
}

function col(cols: string[], idx: number | undefined): string {
  if (idx === undefined || idx < 0 || idx >= cols.length) return ''
  return cols[idx].trim()
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseFleetCSV(content: string): ParseResult {
  const clean = content.replace(/^\uFEFF/, '') // strip UTF-8 BOM
  const rawLines = clean.split(/\r?\n/)
  const transactions: FuelingTransaction[] = []
  const errors: string[] = []

  // Find first non-empty line as the header
  let headerIdx = 0
  while (headerIdx < rawLines.length && !rawLines[headerIdx].trim()) headerIdx++
  if (headerIdx >= rawLines.length) {
    return { transactions, errors: ['File is empty'], detectedFormat: 'Unknown', missingRequiredFields: REQUIRED_FIELDS, foundFields: [] }
  }

  const headers = parseCSVLine(rawLines[headerIdx])
  const colIdx = buildColumnIndex(headers)
  const foundFields = Object.keys(colIdx)
  const missingRequiredFields = REQUIRED_FIELDS.filter(f => !(f in colIdx))

  // Detect format by header fingerprint
  const headerJoined = headers.map(normalizeKey).join('|')
  let detectedFormat = 'Generic Fleet'
  if (headerJoined.includes('station brand name')) detectedFormat = 'WEX'
  else if (headerJoined.includes('posting date') || headerJoined.includes('post date')) detectedFormat = 'WEX / Fleet One'
  else if (headerJoined.includes('invoice date')) detectedFormat = 'Fuelman / Fleetcor'

  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const line = rawLines[i].trim()
    if (!line) continue

    const cols = parseCSVLine(line)
    const gallons = parseFloat(col(cols, colIdx['gallons'])) || 0
    if (gallons <= 0) continue  // skip summary/blank rows

    const rawAmount = col(cols, colIdx['amount']).replace(/[$,]/g, '')
    const amount = parseFloat(rawAmount) || 0

    // Date: strip time portion if datetime
    const rawDate = col(cols, colIdx['date'])
    const transDate = rawDate.split(' ')[0].split('T')[0]

    const stationBrand = col(cols, colIdx['stationBrand'])
    const stationName = col(cols, colIdx['stationName'])
    const isCircleK =
      stationBrand.toUpperCase().includes('CIRCLE K') ||
      stationName.toUpperCase().includes('CIRCLE K')

    // fuelType: prefer dedicated field, fall back to productName
    const fuelType =
      col(cols, colIdx['fuelType']) ||
      col(cols, colIdx['productName']) ||
      'Unknown'

    transactions.push({
      transDate,
      stationCity: col(cols, colIdx['city']),
      stationState: col(cols, colIdx['state']),
      gallons,
      fuelType,
      stationName,
      stationBrand,
      stationAddress: col(cols, colIdx['stationAddress']),
      zipCode: normalizeZip(col(cols, colIdx['zipCode'])),
      unitNumber: col(cols, colIdx['unitNumber']),
      driverCity: col(cols, colIdx['driverCity']),
      amount,
      productName: col(cols, colIdx['productName']),
      isCircleK,
    })
  }

  return { transactions, errors, detectedFormat, missingRequiredFields, foundFields }
}

// Backward-compatible alias (used by existing imports)
export function parseHeartlandCSV(content: string): { transactions: FuelingTransaction[]; errors: string[] } {
  const { transactions, errors } = parseFleetCSV(content)
  return { transactions, errors }
}
