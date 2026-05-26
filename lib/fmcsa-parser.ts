// FMCSA SAFER carrier data parser — handles both pipe-delimited Census files
// and simplified comma-separated exports.

export interface FMCSACarrier {
  dotNumber: string
  legalName: string
  dbaName: string
  address: string
  city: string
  state: string
  zip: string
  phone: string
  powerUnits: number
  drivers: number
  carrierOperation: string
  cargoCarried: string[]
  operatingStatus: string
  mcs150Date: string | null
  hmFlag: boolean       // hazmat authority
  pcFlag: boolean       // passenger carrier authority
  // Enriched after geocoding + proximity analysis (optional)
  lat?: number
  lng?: number
  nearestCKTruckSite?: {
    id: string
    name: string
    city: string
    state: string
    address: string
    distance: number
  }
  opportunityScore?: number
  isHotZone?: boolean
  isStaleMCS150?: boolean
}

export interface ParseResult {
  carriers: FMCSACarrier[]
  errors: string[]
  statesCovered: string[]
}

// ─── Carrier operation normalizer ─────────────────────────────────────────────

const OP_MAP: Record<string, string> = {
  A: 'For-Hire', D: 'For-Hire',
  B: 'Private',  C: 'Private',
  E: 'Both',     F: 'Both',
}

function normalizeOperation(raw: string): string {
  const u = raw.trim().toUpperCase()
  if (OP_MAP[u]) return OP_MAP[u]
  if (u.includes('FOR') || u.includes('HIRE')) return 'For-Hire'
  if (u.includes('PRIV')) return 'Private'
  if (u.includes('BOTH')) return 'Both'
  return raw.trim() || 'Unknown'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCargo(raw: string): string[] {
  if (!raw || raw.toLowerCase() === 'n/a') return []
  return raw.split(/[|;,]+/).map(s => s.trim()).filter(Boolean)
}

function parsePhone(raw: string): string {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  return raw.trim()
}

function parseDate(raw: string): string | null {
  const s = (raw || '').trim()
  if (!s || s === '0' || /^null$/i.test(s)) return null
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s || null
}

// CSV-safe row splitter: handles quoted commas
function splitRow(line: string, delim: string): string[] {
  if (delim !== ',') return line.split(delim)
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQ = !inQ; continue }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseFMCSAFile(text: string): ParseResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) {
    return { carriers: [], errors: ['File is empty or has only a header row.'], statesCovered: [] }
  }

  const headerLine = lines[0]
  const delim = (headerLine.match(/\|/g) || []).length > 3 ? '|' : ','
  const headers = splitRow(headerLine, delim).map(h =>
    h.trim().replace(/^["']|["']$/g, '').toUpperCase()
  )

  // Find column index by any of several possible names
  const col = (...names: string[]): number => {
    for (const n of names) {
      const i = headers.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }

  const iDot    = col('DOT_NUMBER', 'DOT NUMBER', 'USDOT_NUMBER', 'USDOT', 'DOT')
  const iLegal  = col('LEGAL_NAME', 'LEGAL NAME', 'COMPANY_NAME', 'COMPANY NAME', 'NAME')
  const iDba    = col('DBA_NAME', 'DBA NAME', 'DBA')
  const iStreet = col('PHY_STREET', 'PHYSICAL_STREET', 'STREET', 'ADDRESS', 'PHY STREET', 'MAILING_STREET')
  const iCity   = col('PHY_CITY', 'PHYSICAL_CITY', 'CITY', 'PHY CITY', 'MAILING_CITY')
  const iState  = col('PHY_STATE', 'PHYSICAL_STATE', 'STATE', 'PHY STATE', 'MAILING_STATE')
  const iZip    = col('PHY_ZIP', 'PHYSICAL_ZIP', 'ZIP', 'ZIPCODE', 'ZIP_CODE', 'PHY ZIP', 'MAILING_ZIP')
  const iPhone  = col('TELEPHONE', 'PHONE', 'PHONE_NUMBER', 'TEL', 'PHONE NUMBER')
  const iPower  = col('NBR_POWER_UNIT', 'POWER_UNITS', 'POWER UNITS', 'NBR POWER UNIT', 'TRUCKS', 'POWER_UNIT')
  const iDriver = col('DRIVER_TOTAL', 'DRIVERS', 'TOTAL_DRIVERS', 'DRIVER TOTAL', 'DRIVER_TOTAL')
  const iOp     = col('CARRIER_OPERATION', 'CARRIER OPERATION', 'OPERATION_TYPE', 'OPERATION', 'OP_TYPE')
  const iCargo  = col('CARGO_CARRIED', 'CARGO CARRIED', 'CARGO_TYPES', 'CARGO', 'CARGO TYPE')
  const iStatus = col('RECORD_STATUS', 'STATUS', 'OPERATING_STATUS', 'RECORD STATUS', 'ACTIVE_FLAG')
  const iMcs    = col('MCS150_DATE', 'MCS150 DATE', 'MCS_150_DATE', 'BIENNIAL_DATE', 'LAST_MCS150', 'MCS150DATE')
  const iHm     = col('HM_FLAG', 'HM FLAG', 'HAZMAT_FLAG', 'HAZMAT', 'HM')
  const iPc     = col('PC_FLAG', 'PC FLAG', 'PASSENGER_FLAG', 'PASSENGER_CARRIER', 'PC')

  if (iDot < 0 && iLegal < 0) {
    return {
      carriers: [],
      errors: [
        'Could not identify required columns. ' +
        'Ensure the file has DOT_NUMBER and LEGAL_NAME columns in the header row.',
      ],
      statesCovered: [],
    }
  }

  const carriers: FMCSACarrier[] = []
  const errors: string[] = []

  for (let lineNo = 1; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo].trim()
    if (!line) continue

    const row = splitRow(line, delim).map(c => c.trim().replace(/^["']|["']$/g, ''))
    const g = (i: number) => (i >= 0 && i < row.length ? row[i] : '')

    const dotNumber = g(iDot)
    const legalName = g(iLegal)
    if (!dotNumber && !legalName) continue

    const rawStatus = g(iStatus)
    const opStatus =
      rawStatus === 'A' || rawStatus.toUpperCase() === 'ACTIVE' ? 'ACTIVE'
      : rawStatus === 'I' || rawStatus.toUpperCase() === 'INACTIVE' ? 'INACTIVE'
      : rawStatus.toUpperCase() || 'ACTIVE'

    carriers.push({
      dotNumber,
      legalName,
      dbaName: g(iDba),
      address: g(iStreet),
      city: g(iCity),
      state: g(iState).toUpperCase().slice(0, 2),
      zip: g(iZip),
      phone: parsePhone(g(iPhone)),
      powerUnits: parseInt(g(iPower)) || 0,
      drivers: parseInt(g(iDriver)) || 0,
      carrierOperation: normalizeOperation(g(iOp)),
      cargoCarried: parseCargo(g(iCargo)),
      operatingStatus: opStatus,
      mcs150Date: parseDate(g(iMcs)),
      hmFlag: g(iHm).toUpperCase() === 'Y',
      pcFlag: g(iPc).toUpperCase() === 'Y',
    })
  }

  const statesCovered = Array.from(new Set(carriers.map(c => c.state).filter(Boolean))).sort()
  return { carriers, errors, statesCovered }
}

// ─── Scoring & enrichment helpers ─────────────────────────────────────────────

export function isStaleMCS150Date(date: string | null): boolean {
  if (!date) return false
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return false
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 2)
    return d < cutoff
  } catch {
    return false
  }
}

export function computeOpportunityScore(carrier: FMCSACarrier): number {
  let score = 0

  // Fleet size (0–40 pts)
  const u = carrier.powerUnits
  score += u >= 100 ? 40 : u >= 50 ? 30 : u >= 20 ? 20 : u >= 5 ? 12 : 5

  // High-frequency-fueling cargo: tanker / reefer fuel far more often (+25 pts)
  if (carrier.cargoCarried.some(c => /refrigerat|reefer|tanker|liquid|gas/i.test(c))) score += 25

  // Proximity bonus (0–35 pts)
  if (carrier.nearestCKTruckSite) {
    const d = carrier.nearestCKTruckSite.distance
    score += d <= 1 ? 35 : d <= 5 ? 25 : d <= 10 ? 15 : d <= 25 ? 10 : d <= 50 ? 5 : 0
  }

  // Active status (+5 pts)
  if (carrier.operatingStatus === 'ACTIVE') score += 5

  return score
}

// Haversine distance in miles
export function haversineDistanceMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3959
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
