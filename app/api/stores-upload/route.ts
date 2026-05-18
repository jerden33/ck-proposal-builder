import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── CSV parser ────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += line[i]
    }
  }
  result.push(current.trim())
  return result
}

function csvToStores(csv: string) {
  const lines = csv.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row')

  const headers = parseCSVLine(lines[0]).map(h =>
    h.toLowerCase().replace(/[^a-z0-9]/g, '')
  )

  const col = (aliases: string[]): number => {
    for (const a of aliases) {
      const i = headers.indexOf(a)
      if (i !== -1) return i
    }
    return -1
  }

  const latIdx  = col(['latitude', 'lat'])
  const lngIdx  = col(['longitude', 'lng', 'long', 'lon'])
  const cityIdx = col(['city'])
  const stateIdx = col(['state', 'st'])

  if (latIdx === -1 || lngIdx === -1)
    throw new Error('CSV must include Latitude and Longitude columns')
  if (cityIdx === -1 || stateIdx === -1)
    throw new Error('CSV must include City and State columns')

  const siteIdx    = col(['sitenumber', 'storenumber', 'id', 'siteid', 'storeid', 'number', 'site'])
  const nameIdx    = col(['name', 'storename', 'sitename'])
  const addrIdx    = col(['address', 'streetaddress', 'addr', 'street'])
  const zipIdx     = col(['zip', 'zipcode', 'postalcode', 'postal'])
  const truckIdx   = col(['truckaccessible', 'hastruck', 'truck', 'truckstop', 'truckaccess'])
  const lanesIdx   = col(['numtrucklanes', 'trucklanes', 'lanes', 'numberoflanes'])
  const statusIdx  = col(['status'])

  const stores = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length < 2) continue

    const lat = parseFloat(cols[latIdx] ?? '')
    const lng = parseFloat(cols[lngIdx] ?? '')
    if (isNaN(lat) || isNaN(lng)) continue

    const city  = cols[cityIdx]?.trim()  ?? ''
    const state = cols[stateIdx]?.trim() ?? ''
    if (!city && !state) continue

    const siteNumber    = siteIdx  >= 0 ? cols[siteIdx]?.trim()  ?? `${i}` : `${i}`
    const truckRaw      = truckIdx >= 0 ? (cols[truckIdx] ?? '').trim().toLowerCase() : ''
    const truckAccessible = truckRaw === 'true' || truckRaw === 'yes' || truckRaw === '1'

    stores.push({
      id:         siteNumber,
      name:       nameIdx  >= 0 ? cols[nameIdx]?.trim()  ?? 'Circle K' : 'Circle K',
      address:    addrIdx  >= 0 ? cols[addrIdx]?.trim()  ?? '' : '',
      city,
      state,
      zip:        zipIdx   >= 0 ? cols[zipIdx]?.trim()   ?? '' : '',
      coordinates: { lat, lng },
      siteNumber,
      status:     statusIdx >= 0 ? cols[statusIdx]?.trim() ?? 'Open' : 'Open',
      truckAccessible,
      numTruckLanes: lanesIdx >= 0 ? parseInt(cols[lanesIdx] ?? '0', 10) || 0 : 0,
    })
  }

  return stores
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()
  return data?.is_super_admin ? supabase : null
}

// ─── GET — store info (count + whether custom file is active) ─────────────────

export async function GET() {
  const supabase = await requireSuperAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await supabase.storage
    .from('proposal-assets')
    .list('stores')

  const customFile = data?.find(f => f.name === 'stores-data.json')
  return NextResponse.json({
    hasCustomFile: !!customFile,
    updatedAt: customFile?.updated_at ?? null,
  })
}

// ─── POST — upload new store data (CSV or JSON) ───────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await requireSuperAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const text = await file.text()
  let storesJson: string
  let storeCount: number

  const isCSV = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv'

  try {
    if (isCSV) {
      const stores = csvToStores(text)
      if (stores.length === 0)
        return NextResponse.json({ error: 'No valid stores found in CSV' }, { status: 400 })
      storesJson = JSON.stringify({ stores })
      storeCount = stores.length
    } else {
      const parsed = JSON.parse(text)
      const stores = Array.isArray(parsed) ? parsed : parsed.stores
      if (!Array.isArray(stores))
        return NextResponse.json({ error: 'JSON must contain a "stores" array' }, { status: 400 })
      storeCount = stores.length
      storesJson = JSON.stringify({ stores })
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse file' },
      { status: 400 }
    )
  }

  const blob = new Blob([storesJson], { type: 'application/json' })
  const { error } = await supabase.storage
    .from('proposal-assets')
    .upload('stores/stores-data.json', blob, {
      contentType: 'application/json',
      upsert: true,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, storeCount })
}

// ─── DELETE — revert to bundled static file ───────────────────────────────────

export async function DELETE() {
  const supabase = await requireSuperAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await supabase.storage
    .from('proposal-assets')
    .remove(['stores/stores-data.json'])

  return NextResponse.json({ success: true })
}
