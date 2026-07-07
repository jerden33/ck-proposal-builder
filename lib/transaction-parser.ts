// Flexible fleet transaction CSV parser
// Detects column headers automatically — supports Heartland, WEX, Fuelman, and generic formats

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FuelingTransaction {
  transDate: string
  transTime?: string      // HH:MM if source includes a timestamp
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
  driverName: string      // full driver/cardholder name — '' if not in source
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
  hasDriverData: boolean           // true if any transaction has a non-empty driverName
  isMobileFueling: boolean         // true if majority of gallons are from mobile fuel delivery vendors
}

// Vendors that deliver fuel to a customer's location — not physical stations.
// Proximity analysis is meaningless for these because there's no "pump" to compare against.
const MOBILE_FUEL_VENDORS = new Set([
  'DIESEL DIRECT', 'BOOSTER', 'BOOSTER FUELS', 'YOSHI', 'YOSHI MOBILITY',
  'FILLD', 'SPIFFY', 'FRESH FUEL', 'BATCH MOBILE',
])

// ─── Header alias map ─────────────────────────────────────────────────────────
// Keys are canonical field names; values are lists of header aliases (lowercase)

const FIELD_ALIASES: Record<string, string[]> = {
  date: [
    // Combined datetime fields first — avoids grabbing a date-only column when
    // a richer combined column (e.g. "Trans DateTime") is present in the same file
    'trans datetime', 'transaction datetime',
    'trans date', 'date', 'transaction date', 'posting date', 'posted date', 'post date',
    'tran date', 'service date', 'fill date', 'invoice date', 'sale date',
    'transactionposdate', 'pos date', 'transdate',
  ],
  // Separate time column — used as fallback when the date column has no time
  time: [
    'transaction time', 'trans time', 'tran time',
    'service time', 'fill time', 'time', 'local time',
  ],
  city: [
    'station city', 'city', 'site city', 'location city', 'trans city',
    'merchant city', 'fuel city', 'fueling city', 'store city',
    'truck stop city', 'locationcity', 'transcity', 'sitecity',
  ],
  state: [
    'station state', 'state', 'site state', 'location state',
    'merchant state', 'fuel state', 'fueling state', 'st', 'store state',
    'prov', 'province', 'locationstate', 'transstate',
    // WEX variants — "Merchant State / Province" normalizes to "merchant state province"
    'merchant state province', 'merchant state  province',
    'trans state', 'transaction state', 'service state', 'fill state',
    'loc state', 'mcht state', 'merch state',
    'truck stop state',
    // CamelCase variants (no space) from some export formats
    'sitestate', 'stationstate',
  ],
  gallons: [
    'gallons', 'quantity', 'gal', 'volume', 'fuel quantity', 'qty',
    'fuel gallons', 'net gallons', 'amount gallons', 'total gallons',
    'fuel volume',
    // RCPA format uses "Unit/Gallons" (normalizeKey strips the slash → "unitgallons")
    'unit/gallons', 'units/gallons', 'unit gallons', 'units gallons',
    // WEX standard export uses "Units" for fuel quantity
    'units',
    'net qty', 'net quantity', 'billed quantity', 'billed qty',
    // Product-typed gallons columns (e.g. "#2 Diesel Gallons" → "2 diesel gallons" after normalizeKey)
    '2 diesel gallons', 'diesel gallons', 'gasoline gallons', 'gas gallons',
    'unleaded gallons', 'def gallons',
    // Comdata — "Number of Tractor Gallons"
    'number of tractor gallons', 'tractor gallons',
    // Generic quantity-purchased column (e.g. WEX site-level export)
    'qty purchased', 'qtypurchased', 'quantity purchased', 'quantitypurchased',
  ],
  // Price-per-unit/gallon — used to derive total amount when no amount column exists
  ppu: [
    'ppu', 'ppu/amount', 'price per unit', 'price per gallon',
    'unit price', 'unit cost', 'ppg', 'ppu/gal', 'cost per gallon', 'price/gal',
    'cost/gal', 'retail price',
    // Comdata — "Tractor Fuel Price Per Gallon"
    'tractor fuel price per gallon',
  ],
  fuelType: [
    'epa fuel type purchased', 'epa fuel type', 'fuel type', 'product type',
    'fuel category', 'fuel class', 'energy type',
    'product code',  // e.g. "Diesel" / "Reefer" — spaced header variant
    // CamelCase / compact column names with descriptive fuel names (preferred over NACS codes)
    'productdesc', 'product desc', 'productdescription', 'product description',
    // NACS product category code column (e.g. 001 = Unleaded, 019 = Diesel, 020 = Premium Diesel)
    // Listed last — use only when no descriptive column is available
    'nacs',
    // Bare single-word column (e.g. "Type" with values "DSL", "GAS")
    'type',
  ],
  stationName: [
    'station name', 'site name', 'location name', 'merchant name',
    'store name', 'location description',
    'truck stop name', 'service center',
    // CamelCase variants
    'stationname', 'sitename',
    // Bare single-word column (e.g. "Merchant" with store name values)
    'merchant',
  ],
  stationBrand: [
    'station brand name', 'brand', 'network', 'station brand',
    'merchant brand', 'fuel brand', 'chain', 'oil company', 'brand name',
    // CamelCase variants
    'stationbrand', 'stationbrandname',
  ],
  stationAddress: [
    'station address', 'address', 'street', 'street address',
    'site address', 'location address', 'addr', 'address 1',
    'merchant address', 'merchant street',
    'service center address',
    // CamelCase variants
    'siteaddress', 'stationaddress',
  ],
  zipCode: [
    'zipcode', 'zip', 'zip code', 'postal code', 'zip_code',
    'postalcode', 'postal', 'zip/postal',
    // WEX — "Merchant Postal Code"
    'merchant postal code', 'merchant zip', 'merchant zipcode',
    'service center zip code',
  ],
  unitNumber: [
    'unit #', 'unit number', 'vehicle unit number', 'vehicle', 'card #', 'card number',
    'vehicle id', 'asset', 'unit', 'vehicle #', 'asset id', 'asset number',
    'equipment', 'truck #', 'truck number', 'unit id',
  ],
  driverCity: [
    'driver city', 'home city', 'driver home city', 'driver location',
    'driver base city', 'base city',
  ],
  // Combined driver/cardholder name (preferred when present)
  driverName: [
    'driver name', 'driver full name', 'cardholder name', 'cardholder',
    'employee name', 'employee', 'operator name', 'operator',
    'authorized name', 'driver authorized name',
    'driver',  // bare single-word column (e.g. some OTR exports)
  ],
  // Split first/last — combined in parser when no full-name column exists
  driverFirstName: [
    'driver first name', 'driver first', 'first name', 'cardholder first name',
    'employee first name', 'driver fname', 'first',
  ],
  driverLastName: [
    'driver last name', 'driver last', 'last name', 'cardholder last name',
    'employee last name', 'driver lname', 'last',
  ],
  amount: [
    'amount', 'total', 'total amount', 'spend', 'cost', 'sale amount',
    'net amount', 'transaction amount', 'charge', 'total cost', 'total charge',
    'invoice amount', 'billed amount', 'dollars',
    // WEX column names
    'net cost', 'total fuel cost', 'gross amount', 'gross cost',
    // Comdata — "Total Amount Due" / "Cost of Tractor Fuel"
    'total amount due', 'cost of tractor fuel',
  ],
  productName: [
    'product name', 'product', 'item', 'fuel grade', 'grade',
    'fuel product', 'product description', 'product desc',
    'fuel', 'productdescription', 'productcode',
    // CamelCase variants
    'productname', 'productdesc',
  ],
}

// 'state' is intentionally omitted — it can be inferred from city + zip during geocoding
const REQUIRED_FIELDS = ['date', 'city', 'gallons']

// ─── Brand display names ───────────────────────────────────────────────────────

export const BRAND_DISPLAY_NAMES: Record<string, string> = {
  'CIRCLE K': 'Circle K',
  'SPEEDWAY': 'Speedway',
  'EXXONMOB': 'ExxonMobil',
  'EXXONMOBIL': 'ExxonMobil',
  'EXXON': 'ExxonMobil',
  'MOBIL': 'Mobil',
  'BP PRODU': 'BP',
  'BP': 'BP',
  'CHEVRON': 'Chevron',
  'TEXACO': 'Texaco',
  'ARCO': 'Arco',
  'GULF': 'Gulf',
  'CONOCO': 'Conoco',
  'VALERO': 'Valero',
  'SINCLAIR': 'Sinclair',
  'KWIK TRI': 'Kwik Trip',
  'KWIK TRIP': 'Kwik Trip',
  'MARATHON': 'Marathon',
  'SHELL': 'Shell',
  'QUIKTRIP': 'QuikTrip',
  'UNBRANDE': 'Unbranded',
  'UNBRANDED': 'Unbranded',
  "CASEY'S": "Casey's",
  'CASEYS': "Casey's",
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
  'CENEX': 'Cenex',
  'KWIK STAR': 'Kwik Star',
  'CASEY': "Casey's",
  'MAVERICK': 'Maverick',
  'STRIPES': 'Stripes',
  'FAS MART': 'Fas Mart',
  'FASMART': 'Fas Mart',
  'MAPCO': 'Mapco',
  'CIRCLE B': 'Circle B',
}

export function normalizeBrandName(raw: string): string {
  const upper = raw.trim().toUpperCase()
  return BRAND_DISPLAY_NAMES[upper] ?? titleCase(raw.trim())
}

// ─── Fuel type normalisation ───────────────────────────────────────────────────
/**
 * Map WEX/NACS numeric product-category codes to canonical fuel names.
 * Codes sourced from NACS product-category specification and WEX feed docs.
 */
const NACS_FUEL_CODES: Record<string, string> = {
  // Gasoline grades
  '001': 'GASOLINE', '002': 'GASOLINE', '003': 'GASOLINE', '004': 'GASOLINE',
  '005': 'GASOLINE', // Ethanol / E85
  '058': 'GASOLINE', '059': 'GASOLINE', '060': 'GASOLINE', // Mid / Premium variants
  // Diesel — all ULSD / #2 / premium / off-road / dyed variants
  '019': 'DIESEL', '020': 'DIESEL', '021': 'DIESEL', '022': 'DIESEL',
  '023': 'DIESEL', '024': 'DIESEL', '025': 'DIESEL', '017': 'DIESEL',
  '018': 'DIESEL',
  // Reefer / auxiliary diesel
  '057': 'DIESEL',
  // DEF / exhaust fluid
  '065': 'DEF', '054': 'DEF',
  // CNG / LNG / propane — classify as gas for reporting
  '006': 'GASOLINE', '007': 'GASOLINE', '008': 'GASOLINE',
}

/**
 * Normalise a raw fuel-type string from any fleet-card format into a
 * consistent canonical value (e.g. "DIESEL", "GASOLINE", "DEF").
 * Called at parse time so every downstream consumer sees unified values.
 */
export function normalizeFuelType(raw: string): string {
  if (!raw || raw.trim() === '') return 'Unknown'
  const r = raw.trim().toUpperCase()

  // Pure NACS numeric code (e.g. "019", "019-DIESEL #2", "019 Diesel")
  const nacsMatch = r.match(/^(\d{3})/)
  if (nacsMatch && NACS_FUEL_CODES[nacsMatch[1]]) return NACS_FUEL_CODES[nacsMatch[1]]

  // ── Diesel variants ────────────────────────────────────────────────────────
  if (
    r === 'D2' || r === 'D-2' || r === '#2' ||
    r.startsWith('D2 ') || r.startsWith('#2 ') ||
    r.includes('DIESEL') || r === 'DSL' || r === 'DSEL' ||
    r === 'ULSD' || r.includes('ULTRA LOW SULFUR') || r.includes('LOW SULFUR DIESEL') ||
    r === 'HSD' || r === 'LS' ||                     // High-Speed Diesel / Low Sulphur
    r === 'LSD' ||                                   // Low Sulphur Diesel
    r.includes('REEFER') ||                          // Reefer/refrigerated trailer diesel
    r === 'REEFER FUEL' || r === 'REEFERF' ||
    r.includes('OFF ROAD') || r.includes('OFF-ROAD') ||
    r.includes('DYE') || r.includes('RED DSL') || r.includes('DYED') ||
    r.includes('BIODIESEL') || r.startsWith('B20') || r.startsWith('B5') ||
    r.startsWith('B10') || r.startsWith('B2 ') ||   // biodiesel blends
    r.includes('WINTER DIESEL') || r.includes('ARCTIC DIESEL') ||
    r === 'CLEAR DIESEL' || r === 'HEATING OIL' ||
    r === 'NO2' || r === 'NO. 2' || r === 'NUMBER 2'
  ) return 'DIESEL'

  // ── DEF / exhaust fluid ────────────────────────────────────────────────────
  if (
    r === 'DEF' || r.includes('EXHAUST FLUID') || r.includes('EXHAUST') ||
    r === 'ADBLUE' || r === 'UREA' || r.includes('SCR FLUID')
  ) return 'DEF'

  // ── Gasoline variants ──────────────────────────────────────────────────────
  if (
    r.includes('UNL') || r.includes('UNLEAD') ||   // catches UNL*, ETUNL*, MEUNL*, etc.
    r === 'UNRG' || r === 'UNPR' || r === 'UNMD' || r === 'UNMID' || // Comdata UN* product codes
    r === 'REG' || r === 'REGULAR' || r === 'GASOLINE' || r === 'GAS' ||
    r.includes('PREMIUM') || r.includes('MIDGRADE') || r.includes('MID-GRADE') ||
    r === 'PRM' || r === 'PRML' || r === 'MID' || r === 'SUPER' || r === 'PLUS' ||
    r.startsWith('E85') || r === 'ETHANOL' || r.includes('FLEX FUEL') || // E85 (Et 85%) etc.
    r.includes('LEADED') ||                         // Me Reg Leaded, Reg Leaded Gas
    r === '87' || r === '89' || r === '91' || r === '93' || // octane grades
    r.match(/^(87|89|91|93)\s*OCT/) !== null ||
    r === 'REGULAR UNLEADED' || r === 'PREMIUM UNLEADED'
  ) return 'GASOLINE'

  // Not recognised — preserve the original value so the Fuel Type Breakdown
  // tab can surface it and the user/analyst can see what's unclassified.
  return raw.trim()
}

/**
 * When no dedicated brand column is present (e.g. RCPA format), try to infer
 * the brand from the station name by matching known brand prefixes.
 * "CHEVRON 0207755" → "Chevron", "CIRCLE K #12345" → "Circle K"
 */
export function inferBrandFromName(stationName: string): string {
  if (!stationName) return ''
  const upper = stationName.trim().toUpperCase()
  // Sort keys longest-first so "CIRCLE K" beats "CK", "BP AMOCO" beats "BP", etc.
  const keys = Object.keys(BRAND_DISPLAY_NAMES).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (upper === key || upper.startsWith(key + ' ') || upper.startsWith(key + '#') || upper.startsWith(key + '_')) {
      return BRAND_DISPLAY_NAMES[key]
    }
  }
  return ''
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

/** Convert "HH:MM" + optional "AM"/"PM" suffix to 24-hour "HH:MM" */
function to24h(hhmm: string, ampm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  let h = parseInt(hStr, 10)
  if (isNaN(h) || !mStr) return hhmm
  const pm = ampm.toUpperCase() === 'PM'
  if (pm && h !== 12) h += 12
  if (!pm && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${mStr}`
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
    return { transactions, errors: ['File is empty'], detectedFormat: 'Unknown', missingRequiredFields: REQUIRED_FIELDS, foundFields: [], hasDriverData: false, isMobileFueling: false }
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
  else if (headerJoined.includes('unitgallons') || headerJoined.includes('unit/gallons')) detectedFormat = 'RCPA'
  else if (headerJoined.includes('truck stop name') || headerJoined.includes('truck stop city')) detectedFormat = 'OTR Fuel Card'
  else if (headerJoined.includes('qtypurchased') || (headerJoined.includes('nacs') && headerJoined.includes('sitecity'))) detectedFormat = 'WEX Site-Level'

  // Infer default fuel type from the gallons column name when no fuel type column exists.
  // "Number of Tractor Gallons" / "Diesel Gallons" → DIESEL; "Gas Gallons" → GASOLINE.
  // Used only as a fallback when neither fuelType nor productName columns are present.
  let gallonsImpliedFuelType = ''
  if (colIdx['gallons'] !== undefined && !('fuelType' in colIdx) && !('productName' in colIdx)) {
    const gallonsHeader = normalizeKey(headers[colIdx['gallons']])
    if (gallonsHeader.includes('tractor') || gallonsHeader.includes('diesel') || gallonsHeader === '2 diesel gallons') {
      gallonsImpliedFuelType = 'DIESEL'
    } else if (gallonsHeader.includes('gasoline') || gallonsHeader.includes('gas') || gallonsHeader.includes('unlead')) {
      gallonsImpliedFuelType = 'GASOLINE'
    }
  }

  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const line = rawLines[i].trim()
    if (!line) continue

    const cols = parseCSVLine(line)
    const gallons = parseFloat(col(cols, colIdx['gallons'])) || 0
    if (gallons <= 0) continue  // skip summary/blank rows

    const rawAmount = col(cols, colIdx['amount']).replace(/[$,]/g, '')
    let amount = parseFloat(rawAmount) || 0
    // RCPA and some formats have no total-amount column — derive from PPU × gallons
    if (amount === 0 && colIdx['ppu'] !== undefined) {
      const ppuVal = parseFloat(col(cols, colIdx['ppu']).replace(/[$,]/g, '')) || 0
      if (ppuVal > 0) amount = gallons * ppuVal
    }

    // Date: separate date from time when datetime field is present
    const rawDate = col(cols, colIdx['date'])
    const transDate = rawDate.split(' ')[0].split('T')[0]

    let transTime: string | undefined
    if (rawDate.includes('T')) {
      // ISO: "2024-01-15T14:32:00"
      const t = rawDate.split('T')[1]
      if (t) transTime = t.substring(0, 5)
    } else {
      // Space-separated: "01/06/2026 04:44:00 PM" → parts ["01/06/2026","04:44:00","PM"]
      const parts = rawDate.split(' ')
      if (parts.length >= 2 && parts[1].includes(':')) {
        transTime = to24h(parts[1].substring(0, 5), parts[2] ?? '')
      }
    }
    // Fallback: separate "Transaction Time" column (e.g. "04:44:00 PM" or "16:44")
    if (!transTime) {
      const rawTimeCol = col(cols, colIdx['time'])
      if (rawTimeCol && rawTimeCol.includes(':')) {
        const tParts = rawTimeCol.trim().split(' ')
        transTime = to24h(tParts[0].substring(0, 5), tParts[1] ?? '')
      }
    }

    const stationBrandRaw = col(cols, colIdx['stationBrand'])
    const stationName = col(cols, colIdx['stationName'])
    const stationAddressRaw = col(cols, colIdx['stationAddress'])
    // If no dedicated brand column, infer from station name (handles RCPA / no-brand formats)
    const stationBrand = stationBrandRaw || inferBrandFromName(stationName)
    const isCircleK =
      stationBrand.toUpperCase().includes('CIRCLE K') ||
      stationName.toUpperCase().includes('CIRCLE K') ||
      stationAddressRaw.toUpperCase().includes('CIRCLE K')

    // fuelType: prefer dedicated field → productName → gallons-column-implied type
    const fuelType = normalizeFuelType(
      col(cols, colIdx['fuelType']) ||
      col(cols, colIdx['productName']) ||
      gallonsImpliedFuelType
    )

    // Driver name: prefer combined column; fall back to first + last
    const rawFullName = col(cols, colIdx['driverName'])
    const rawFirst    = col(cols, colIdx['driverFirstName'])
    const rawLast     = col(cols, colIdx['driverLastName'])
    const driverName  = rawFullName
      || (rawFirst && rawLast ? `${rawFirst} ${rawLast}` : rawFirst || rawLast)

    transactions.push({
      transDate,
      transTime,
      stationCity: col(cols, colIdx['city']),
      stationState: col(cols, colIdx['state']),
      gallons,
      fuelType,
      stationName,
      stationBrand,
      stationAddress: stationAddressRaw,
      zipCode: normalizeZip(col(cols, colIdx['zipCode'])),
      unitNumber: col(cols, colIdx['unitNumber']),
      driverCity: col(cols, colIdx['driverCity']),
      driverName,
      amount,
      productName: col(cols, colIdx['productName']),
      isCircleK,
    })
  }

  const hasDriverData = transactions.some(t => !!t.driverName)

  // Detect mobile fueling: check stationName and productName against known vendors.
  // "BATCH MOBILE FUEL ONLY" in the product name is also a strong signal.
  const totalGallons = transactions.reduce((s, t) => s + t.gallons, 0)
  const mobileGallons = transactions
    .filter(t => {
      const name = (t.stationName ?? '').toUpperCase().trim()
      const prod = (t.productName ?? '').toUpperCase()
      return MOBILE_FUEL_VENDORS.has(name) || prod.includes('BATCH MOBILE')
    })
    .reduce((s, t) => s + t.gallons, 0)
  const isMobileFueling = totalGallons > 0 && mobileGallons / totalGallons > 0.3

  return { transactions, errors, detectedFormat, missingRequiredFields, foundFields, hasDriverData, isMobileFueling }
}

// Backward-compatible alias (used by existing imports)
export function parseHeartlandCSV(content: string): { transactions: FuelingTransaction[]; errors: string[] } {
  const { transactions, errors } = parseFleetCSV(content)
  return { transactions, errors }
}

// ─── Customer location CSV parser ──────────────────────────────────────────────
// A separate, much smaller parser for the optional "customer facility locations"
// upload (depots, yards, corporate offices) — distinct from fleet transaction data.

export interface CustomerLocationInput {
  name: string
  address: string
  city: string
  state: string
  zip: string
}

const CUSTOMER_LOCATION_ALIASES: Record<string, string[]> = {
  name:    ['name', 'location name', 'site name', 'facility name', 'customer location', 'facility'],
  address: ['address', 'street address', 'street', 'location address', 'addr'],
  city:    ['city', 'location city'],
  state:   ['state', 'location state', 'st', 'prov', 'province'],
  zip:     ['zip', 'zip code', 'zipcode', 'postal code', 'postal'],
}

function buildCustomerLocationColumnIndex(headers: string[]): Record<string, number> {
  const index: Record<string, number> = {}
  const normalized = headers.map(normalizeKey)
  for (const [canonical, aliases] of Object.entries(CUSTOMER_LOCATION_ALIASES)) {
    for (const alias of aliases) {
      const colIdx = normalized.indexOf(normalizeKey(alias))
      if (colIdx !== -1) { index[canonical] = colIdx; break }
    }
  }
  return index
}

/**
 * Parse a small CSV of customer facility locations (Name, Address, City, State, Zip).
 * Rows missing an address are skipped — geocoding requires at least a street address.
 */
export function parseCustomerLocationsCSV(content: string): { locations: CustomerLocationInput[]; errors: string[] } {
  const clean = content.replace(/^\uFEFF/, '')
  const rawLines = clean.split(/\r?\n/)
  const locations: CustomerLocationInput[] = []
  const errors: string[] = []

  let headerIdx = 0
  while (headerIdx < rawLines.length && !rawLines[headerIdx].trim()) headerIdx++
  if (headerIdx >= rawLines.length) {
    return { locations, errors: ['File is empty'] }
  }

  const headers = parseCSVLine(rawLines[headerIdx])
  const colIdx = buildCustomerLocationColumnIndex(headers)

  if (colIdx['address'] === undefined || colIdx['city'] === undefined) {
    errors.push('Could not find Address and City columns — expected headers like "Name, Address, City, State, Zip".')
    return { locations, errors }
  }

  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const line = rawLines[i].trim()
    if (!line) continue
    const cols = parseCSVLine(line)
    const address = col(cols, colIdx['address'])
    const city = col(cols, colIdx['city'])
    if (!address || !city) continue
    locations.push({
      name: col(cols, colIdx['name']) || `${city}`,
      address,
      city,
      state: col(cols, colIdx['state']),
      zip: normalizeZip(col(cols, colIdx['zip'])),
    })
  }

  return { locations, errors }
}
