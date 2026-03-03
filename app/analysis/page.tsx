'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import * as XLSX from 'xlsx'
import {
  Upload,
  BarChart2,
  MapPin,
  Fuel,
  Car,
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { parseFleetCSV } from '@/lib/transaction-parser'
import {
  analyzeTransactions,
  buildCKZipSet,
  nearestCKDistance,
  fmtGallons,
  fmtDollars,
  fmtPct,
  fmtMiles,
  type TransactionSummary,
  type BrandSummary,
  type CKStoreCoord,
} from '@/lib/transaction-analysis'
import { geocodeLocations, geocodeAddresses, geoKey, addrGeoKey } from '@/lib/geocoding'
import type { CKStorePin } from '@/components/FuelingMap'

// Dynamically import the map (Mapbox can't SSR)
const FuelingMap = dynamic(() => import('@/components/FuelingMap').then(m => m.FuelingMap), {
  ssr: false,
  loading: () => <div className="bg-gray-100 rounded-xl animate-pulse" style={{ height: 520 }} />,
})

// ─── CK store shape from stores-data.json ─────────────────────────────────────

interface StoreRecord {
  zip: string
  coordinates: { lat: number; lng: number }
  name: string
  city: string
  state: string
  truckAccessible: boolean
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-off-black">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Brand Bar ────────────────────────────────────────────────────────────────

function BrandBar({ brand, maxGallons }: { brand: BrandSummary; maxGallons: number }) {
  const pct = maxGallons > 0 ? (brand.gallons / maxGallons) * 100 : 0
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-36 text-sm text-gray-700 truncate font-medium shrink-0">{brand.displayName}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
        <div
          className={`h-5 rounded-full transition-all ${brand.isCircleK ? 'bg-brand-orange' : 'bg-gray-400'}`}
          style={{ width: `${Math.max(pct, 0.5)}%` }}
        />
      </div>
      <div className="w-28 text-right text-sm text-gray-600 shrink-0">
        <span className="font-semibold text-off-black">{fmtGallons(brand.gallons)}</span>
        <span className="text-gray-400"> gal</span>
      </div>
      <div className="w-24 text-right text-xs text-gray-400 shrink-0">{brand.transactions.toLocaleString()} trans</div>
    </div>
  )
}

// ─── Opportunity Panel ────────────────────────────────────────────────────────

function OpportunityPanel({ analysis, totalGallons }: { analysis: TransactionSummary['ckCaptureAnalysis']; totalGallons: number }) {
  const { captured, capturable, gap, captureRate, potentialRate } = analysis
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-off-black px-6 py-4">
        <h2 className="text-white font-bold text-lg">Circle K Fueling Opportunity</h2>
        <p className="text-gray-400 text-sm mt-0.5">Where your fleet's gallons go — and what Circle K can capture</p>
      </div>
      <div className="p-6">
        <div className="mb-6 space-y-3">
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Current Circle K capture</span>
              <span className="font-semibold text-brand-orange">{fmtPct(captureRate)}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full">
              <div className="h-3 bg-brand-orange rounded-full" style={{ width: `${captureRate}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Potential with Circle K network</span>
              <span className="font-semibold text-green-600">{fmtPct(potentialRate)}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full">
              <div className="h-3 bg-green-500 rounded-full" style={{ width: `${potentialRate}%` }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border-2 border-brand-orange bg-orange-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={18} className="text-brand-orange shrink-0" />
              <span className="font-bold text-off-black text-sm">Already at Circle K</span>
            </div>
            <p className="text-3xl font-bold text-off-black">{fmtGallons(captured.gallons)}</p>
            <p className="text-xs text-gray-500 mt-0.5">gallons</p>
            <p className="text-sm font-semibold text-brand-orange mt-2">{fmtDollars(captured.spend)}</p>
            <p className="text-xs text-gray-400 mt-1">{captured.transactions.toLocaleString()} transactions</p>
          </div>
          <div className="rounded-xl border-2 border-green-500 bg-green-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={18} className="text-green-600 shrink-0" />
              <span className="font-bold text-off-black text-sm">Opportunity — CK Available</span>
            </div>
            <p className="text-3xl font-bold text-off-black">{fmtGallons(capturable.gallons)}</p>
            <p className="text-xs text-gray-500 mt-0.5">gallons at non-CK stations</p>
            <p className="text-sm font-semibold text-green-600 mt-2">{fmtDollars(capturable.spend)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {capturable.transactions.toLocaleString()} transactions where CK exists in same area
            </p>
          </div>
          <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <XCircle size={18} className="text-gray-400 shrink-0" />
              <span className="font-bold text-off-black text-sm">Outside CK Footprint</span>
            </div>
            <p className="text-3xl font-bold text-off-black">{fmtGallons(gap.gallons)}</p>
            <p className="text-xs text-gray-500 mt-0.5">gallons in areas with no CK</p>
            <p className="text-sm font-semibold text-gray-500 mt-2">{fmtDollars(gap.spend)}</p>
            <p className="text-xs text-gray-400 mt-1">{gap.transactions.toLocaleString()} transactions</p>
          </div>
        </div>
        {capturable.gallons > 0 && (
          <div className="mt-5 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            <span className="font-bold">{fmtGallons(capturable.gallons)} gallons ({fmtPct((capturable.gallons / totalGallons) * 100)})</span>{' '}
            are currently going to competitors where a Circle K location already exists in the same area.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Proximity stats panel (shown in Map tab) ─────────────────────────────────

function ProximityPanel({ prox, totalGallons }: { prox: NonNullable<TransactionSummary['proximityBreakdown']>; totalGallons: number }) {
  const rows = [
    { label: 'Fueled at Circle K', gallons: prox.ckGallons, color: '#ED8B00', bg: 'bg-orange-50 border-orange-200', badge: 'text-orange-700' },
    { label: 'Competitor — within 1 mile of CK', gallons: prox.within1mi.gallons, color: '#16a34a', bg: 'bg-green-50 border-green-200', badge: 'text-green-700', opportunity: true },
    { label: 'Competitor — 1 – 2 miles of CK', gallons: prox.within2mi.gallons, color: '#22c55e', bg: 'bg-green-50 border-green-200', badge: 'text-green-600', opportunity: true },
    { label: 'Competitor — 2 – 5 miles of CK', gallons: prox.within5mi.gallons, color: '#ca8a04', bg: 'bg-yellow-50 border-yellow-200', badge: 'text-yellow-700' },
    { label: 'Competitor — 5 – 10 miles of CK', gallons: prox.within10mi.gallons, color: '#ea580c', bg: 'bg-orange-50 border-orange-200', badge: 'text-orange-600' },
    { label: 'Beyond 10 miles of any CK', gallons: prox.beyond10mi.gallons, color: '#dc2626', bg: 'bg-red-50 border-red-200', badge: 'text-red-600' },
  ]

  const opportunityGallons = prox.within1mi.gallons + prox.within2mi.gallons
  const opportunityPct = totalGallons > 0 ? (opportunityGallons / totalGallons) * 100 : 0

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-off-black">Distance-Based Proximity to Circle K</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Based on geocoded fueling locations · {fmtPct(prox.geocodedPct)} of total gallons geocoded
          </p>
        </div>
        {opportunityGallons > 0 && (
          <div className="rounded-lg bg-green-100 border border-green-300 px-3 py-1.5 text-xs text-green-800 text-right shrink-0 ml-4">
            <span className="font-bold">{fmtGallons(opportunityGallons)} gal</span><br />
            <span className="opacity-80">within 2 mi of CK ({fmtPct(opportunityPct)})</span>
          </div>
        )}
      </div>

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
        {rows.map(row => {
          const pct = totalGallons > 0 ? (row.gallons / totalGallons) * 100 : 0
          return (
            <div key={row.label} className="flex items-center gap-3 px-4 py-3 bg-white">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
              <span className="flex-1 text-sm text-gray-700">{row.label}</span>
              {row.opportunity && row.gallons > 0 && (
                <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-semibold">Opportunity</span>
              )}
              <span className="text-sm font-semibold text-off-black w-24 text-right">{fmtGallons(row.gallons)} gal</span>
              <span className="text-xs text-gray-400 w-12 text-right">{fmtPct(pct)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'brands' | 'geographic' | 'locations' | 'vehicles' | 'map'

export default function AnalysisPage() {
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [geocodingInProgress, setGeocodingInProgress] = useState(false)
  const [geocodingProgress, setGeocodingProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [fileName, setFileName] = useState('')
  const [detectedFormat, setDetectedFormat] = useState('')
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [ckStorePins, setCKStorePins] = useState<CKStorePin[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('brands')
  const [showAllBrands, setShowAllBrands] = useState(false)
  const [showAllVehicles, setShowAllVehicles] = useState(false)
  const [restoredFromCache, setRestoredFromCache] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Restore last analysis from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ck-analysis-v1')
      if (!raw) return
      const saved = JSON.parse(raw)
      if (!saved.summary) return
      setSummary(saved.summary)
      setFileName(saved.fileName ?? '')
      setCustomerName(saved.customerName ?? '')
      setDetectedFormat(saved.detectedFormat ?? '')
      setMissingFields(saved.missingFields ?? [])
      setRestoredFromCache(true)
      // Re-load CK pins from static data
      fetch('/stores-data.json')
        .then(r => r.json())
        .then((data) => {
          const storeRecords: StoreRecord[] = data.stores ?? []
          const pins: CKStorePin[] = storeRecords
            .filter(s => s.coordinates?.lat && s.coordinates?.lng)
            .map(s => ({
              lat: s.coordinates.lat,
              lng: s.coordinates.lng,
              name: s.name,
              city: s.city,
              state: s.state,
              zip: s.zip,
              truckAccessible: s.truckAccessible,
            }))
          setCKStorePins(pins)
        })
        .catch(() => { /* non-fatal */ })
    } catch {
      // Corrupted cache — ignore
    }
  }, [])

  const processFile = useCallback(async (file: File) => {
    const isExcel = /\.(xlsx|xls|XLSX|XLS)$/.test(file.name)
    const isCSV   = /\.(csv|CSV|txt|TXT)$/.test(file.name)
    if (!isExcel && !isCSV) {
      setError('Please upload a CSV, Excel (.xlsx / .xls), or text file.')
      return
    }
    setLoading(true)
    setError(null)
    setFileName(file.name)
    setGeocodingInProgress(false)
    setGeocodingProgress(null)

    try {
      // 1. Read file
      setLoadingStep('Reading file…')
      let content: string

      if (isExcel) {
        // Convert first sheet to CSV using SheetJS
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        content = XLSX.utils.sheet_to_csv(sheet)
      } else {
        content = await file.text()
      }

      // 2. Parse with flexible parser
      setLoadingStep('Detecting format and parsing transactions…')
      const parseResult = parseFleetCSV(content)
      const { transactions, detectedFormat: fmt, missingRequiredFields } = parseResult

      setDetectedFormat(fmt)
      setMissingFields(missingRequiredFields)

      if (transactions.length === 0) {
        setError(
          missingRequiredFields.length > 0
            ? `Could not find required columns: ${missingRequiredFields.join(', ')}. Please check your file format.`
            : 'No valid transactions found in this file.'
        )
        setLoading(false)
        return
      }

      // 3. Load Circle K stores
      setLoadingStep('Loading Circle K store locations…')
      const resp = await fetch('/stores-data.json')
      const data = await resp.json()
      const storeRecords: StoreRecord[] = data.stores ?? []

      const ckZipSet = buildCKZipSet(storeRecords)
      const ckStoreCoords: CKStoreCoord[] = storeRecords
        .filter(s => s.coordinates?.lat && s.coordinates?.lng)
        .map(s => ({ lat: s.coordinates.lat, lng: s.coordinates.lng }))

      const pins: CKStorePin[] = storeRecords
        .filter(s => s.coordinates?.lat && s.coordinates?.lng)
        .map(s => ({
          lat: s.coordinates.lat,
          lng: s.coordinates.lng,
          name: s.name,
          city: s.city,
          state: s.state,
          zip: s.zip,
          truckAccessible: s.truckAccessible,
        }))
      setCKStorePins(pins)

      // 4. Initial analysis (ZIP-based, immediate)
      setLoadingStep('Running analysis…')
      const result = analyzeTransactions(transactions, ckZipSet, { detectedFormat: fmt })
      setSummary(result)
      setRestoredFromCache(false)
      try {
        localStorage.setItem('ck-analysis-v1', JSON.stringify({
          summary: result, fileName: file.name, customerName, detectedFormat: fmt, missingFields: missingRequiredFields,
        }))
      } catch { /* storage full — ignore */ }
      setLoading(false)

      // 5. Background geocoding → re-run analysis with proximity data
      const uniqueLocations = Array.from(
        new Set(transactions.map(t => geoKey(t.stationCity, t.stationState)))
      )
        .filter(k => k !== '|')
        .map(k => {
          const [city, state] = k.split('|')
          return { city, state }
        })

      // Collect unique station addresses for non-CK transactions (for CK matching)
      const nonCKAddrKeys = new Set<string>()
      for (const t of transactions) {
        if (!t.isCircleK && t.stationAddress && t.stationCity && t.stationState) {
          nonCKAddrKeys.add(addrGeoKey(t.stationAddress, t.stationCity, t.stationState))
        }
      }
      const uniqueAddresses = Array.from(nonCKAddrKeys).map(k => {
        const parts = k.split('|')
        const state = parts[parts.length - 1]
        const city = parts[parts.length - 2]
        const address = parts.slice(0, parts.length - 2).join('|')
        return { address, city, state }
      })

      if (uniqueLocations.length === 0 || !process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return

      const totalGeoItems = uniqueLocations.length + uniqueAddresses.length
      setGeocodingInProgress(true)
      setGeocodingProgress({ done: 0, total: totalGeoItems })
      let geoDone = 0

      const geocodedCoords = await geocodeLocations(
        uniqueLocations,
        process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
        (done) => { geoDone = done; setGeocodingProgress({ done: geoDone, total: totalGeoItems }) }
      )

      // Geocode individual station addresses and reclassify any that land on a CK store
      const CK_MATCH_MILES = 0.1
      if (uniqueAddresses.length > 0 && ckStoreCoords.length > 0) {
        const geocodedAddrs = await geocodeAddresses(
          uniqueAddresses,
          process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
          (done) => setGeocodingProgress({ done: geoDone + done, total: totalGeoItems })
        )
        for (const t of transactions) {
          if (t.isCircleK || !t.stationAddress) continue
          const coord = geocodedAddrs.get(addrGeoKey(t.stationAddress, t.stationCity, t.stationState))
          if (!coord) continue
          const dist = nearestCKDistance(coord.lat, coord.lng, ckStoreCoords)
          if (dist >= 0 && dist <= CK_MATCH_MILES) {
            t.isCircleK = true
          }
        }
      }

      // Re-run analysis with geocoded coordinates (and any reclassified CK transactions)
      const enrichedResult = analyzeTransactions(transactions, ckZipSet, {
        detectedFormat: fmt,
        geocodedCoords,
        ckStores: ckStoreCoords,
      })
      setSummary(enrichedResult)
      try {
        localStorage.setItem('ck-analysis-v1', JSON.stringify({
          summary: enrichedResult, fileName: file.name, customerName, detectedFormat: fmt, missingFields: missingRequiredFields,
        }))
      } catch { /* storage full — ignore */ }
      setGeocodingInProgress(false)
      setGeocodingProgress(null)

    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : String(err)}`)
      setLoading(false)
      setGeocodingInProgress(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const reset = () => {
    setSummary(null)
    setFileName('')
    setCustomerName('')
    setError(null)
    setDetectedFormat('')
    setMissingFields([])
    setGeocodingInProgress(false)
    setGeocodingProgress(null)
    setCKStorePins([])
    setRestoredFromCache(false)
    try { localStorage.removeItem('ck-analysis-v1') } catch { /* ignore */ }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'brands',     label: 'Brand Breakdown',         icon: <BarChart2 size={16} /> },
    { id: 'geographic', label: 'Geographic',              icon: <MapPin size={16} /> },
    { id: 'locations',  label: 'Top Competitor Locations', icon: <Fuel size={16} /> },
    { id: 'vehicles',   label: 'Vehicles',                icon: <Car size={16} /> },
    { id: 'map',        label: 'Map View',                icon: <MapPin size={16} /> },
  ]

  return (
    <div className="min-h-screen bg-off-white">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-off-black">Transaction Analysis</h1>
          <p className="text-gray-500 mt-1">
            Upload a fleet fueling transaction report to compare against the Circle K store footprint.
          </p>
        </div>

        {/* ── Upload State ──────────────────────────────────────────────────── */}
        {!summary && (
          <div className="max-w-2xl mx-auto">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer / Account Name</label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="e.g. Heartland Logistics"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
              />
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-brand-orange bg-orange-50'
                  : 'border-gray-300 bg-white hover:border-brand-orange hover:bg-orange-50'
              }`}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.txt" onChange={handleFileChange} className="hidden" />
              {loading ? (
                <div>
                  <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-600 font-medium">{loadingStep}</p>
                </div>
              ) : (
                <>
                  <Upload size={40} className="mx-auto text-gray-400 mb-4" />
                  <p className="font-semibold text-off-black mb-1">Drop your fleet transaction file here</p>
                  <p className="text-sm text-gray-500">WEX, Fuelman, Fleetcor, Comdata, or any fleet card export</p>
                  <p className="text-xs text-gray-400 mt-3">Click to browse · .xlsx, .xls, .csv, .txt supported</p>
                </>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            {/* Required / optional field hint */}
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Required columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Date', 'City', 'State', 'Gallons', 'Fuel Type'].map(c => (
                    <span key={c} className="bg-orange-100 text-orange-700 text-xs rounded px-2 py-0.5 font-mono font-semibold">{c}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Optional (enhance analysis)</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Station Name', 'Brand', 'Address', 'ZIP', 'Vehicle / Unit #', 'Driver City', 'Amount'].map(c => (
                    <span key={c} className="bg-gray-100 text-gray-500 text-xs rounded px-2 py-0.5 font-mono">{c}</span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-400 flex items-start gap-1">
                <Info size={12} className="shrink-0 mt-0.5" />
                Column headers are detected automatically — exact names and order don't matter.
              </p>
            </div>
          </div>
        )}

        {/* ── Results State ──────────────────────────────────────────────────── */}
        {summary && (
          <div className="space-y-6">
            {/* Results header */}
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                {customerName && <p className="text-sm text-gray-500 mb-0.5">Analysis for</p>}
                <h2 className="text-2xl font-bold text-off-black">{customerName || 'Fleet Transaction Analysis'}</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {fileName} &bull; {summary.dateRange.start}
                  {summary.dateRange.end && summary.dateRange.end !== summary.dateRange.start ? ` – ${summary.dateRange.end}` : ''}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5 font-medium">
                    {summary.detectedFormat}
                  </span>
                  {missingFields.length > 0 && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 rounded px-2 py-0.5">
                      Missing: {missingFields.join(', ')}
                    </span>
                  )}
                  {restoredFromCache && (
                    <span className="text-xs bg-blue-50 text-blue-600 rounded px-2 py-0.5">Restored from last session</span>
                  )}
                  {geocodingInProgress && geocodingProgress && (
                    <span className="text-xs bg-blue-50 text-blue-600 rounded px-2 py-0.5 flex items-center gap-1">
                      <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Geocoding {geocodingProgress.done}/{geocodingProgress.total} locations…
                    </span>
                  )}
                </div>
              </div>
              <button onClick={reset} className="btn-secondary text-sm flex items-center gap-2">
                <Upload size={15} />
                New File
              </button>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="Transactions" value={summary.totalTransactions.toLocaleString()} />
              <StatCard label="Total Gallons" value={fmtGallons(summary.totalGallons)} />
              <StatCard label="Total Spend" value={fmtDollars(summary.totalSpend)} />
              <StatCard label="Vehicles" value={summary.uniqueVehicles.toLocaleString()} />
              <StatCard label="Unique Stations" value={summary.uniqueStations.toLocaleString()} />
              <StatCard
                label="States"
                value={summary.uniqueStates.length.toString()}
                sub={summary.uniqueStates.slice(0, 6).join(', ') + (summary.uniqueStates.length > 6 ? '…' : '')}
              />
            </div>

            {/* CK Opportunity Panel */}
            <OpportunityPanel analysis={summary.ckCaptureAnalysis} totalGallons={summary.totalGallons} />

            {/* Tabbed detail sections */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-200 overflow-x-auto">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                      activeTab === tab.id
                        ? 'border-b-2 border-brand-orange text-brand-orange bg-orange-50'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.id === 'map' && geocodingInProgress && (
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    )}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {/* ── Brands Tab ─────────────────────────────────────── */}
                {activeTab === 'brands' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-off-black">Gallons by Network / Brand</h3>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-brand-orange inline-block" />Circle K</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />Competitor</span>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {(showAllBrands ? summary.brandBreakdown : summary.brandBreakdown.slice(0, 15)).map(brand => (
                        <BrandBar key={brand.brand} brand={brand} maxGallons={summary.brandBreakdown[0]?.gallons ?? 1} />
                      ))}
                    </div>
                    {summary.brandBreakdown.length > 15 && (
                      <button onClick={() => setShowAllBrands(v => !v)} className="mt-4 flex items-center gap-1 text-sm text-brand-orange hover:underline">
                        {showAllBrands ? <><ChevronUp size={16} />Show fewer</> : <><ChevronDown size={16} />Show all {summary.brandBreakdown.length} brands</>}
                      </button>
                    )}
                  </div>
                )}

                {/* ── Geographic Tab ─────────────────────────────────── */}
                {activeTab === 'geographic' && (
                  <div>
                    <h3 className="font-bold text-off-black mb-4">Fueling Activity by State</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            {['State', 'Transactions', 'Gallons', 'Spend', 'CK Gallons', 'CK Share'].map(h => (
                              <th key={h} className={`py-2 ${h === 'State' ? 'text-left pr-4' : 'text-right px-4'} text-xs font-semibold uppercase tracking-wider text-gray-500`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {summary.stateBreakdown.map(row => (
                            <tr key={row.state} className="hover:bg-gray-50">
                              <td className="py-2.5 pr-4 font-semibold text-off-black">{row.state}</td>
                              <td className="py-2.5 px-4 text-right text-gray-600">{row.transactions.toLocaleString()}</td>
                              <td className="py-2.5 px-4 text-right font-medium">{fmtGallons(row.gallons)}</td>
                              <td className="py-2.5 px-4 text-right text-gray-600">{fmtDollars(row.spend)}</td>
                              <td className="py-2.5 px-4 text-right text-brand-orange font-medium">{fmtGallons(row.ckGallons)}</td>
                              <td className="py-2.5 pl-4 text-right">
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${row.ckSharePct >= 20 ? 'bg-green-100 text-green-700' : row.ckSharePct > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {fmtPct(row.ckSharePct)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Top Competitor Locations Tab ─────────────────────── */}
                {activeTab === 'locations' && (
                  <div>
                    <div className="mb-4">
                      <h3 className="font-bold text-off-black">Top Competitor Fueling Locations</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Non-Circle K stations ranked by gallons purchased</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            {['Station', 'Brand', 'Location', 'Trans', 'Gallons', 'Spend', 'Nearest CK', 'CK Nearby?'].map(h => (
                              <th key={h} className={`py-2 ${['Station','Brand','Location'].includes(h) ? 'text-left px-4 first:pl-0' : 'text-right px-4'} text-xs font-semibold uppercase tracking-wider text-gray-500`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {summary.topCompetitorLocations.map((loc, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="py-2.5 pr-4 font-medium text-off-black max-w-[180px] truncate">{loc.stationName}</td>
                              <td className="py-2.5 px-4 text-gray-600 text-xs">{loc.displayBrand}</td>
                              <td className="py-2.5 px-4 text-gray-500 text-xs whitespace-nowrap">{loc.city}, {loc.state} {loc.zipCode}</td>
                              <td className="py-2.5 px-4 text-right text-gray-600">{loc.transactions}</td>
                              <td className="py-2.5 px-4 text-right font-medium">{fmtGallons(loc.gallons)}</td>
                              <td className="py-2.5 px-4 text-right text-gray-600">{fmtDollars(loc.spend)}</td>
                              <td className="py-2.5 px-4 text-right text-xs text-gray-500">
                                {loc.nearestCKDistanceMi >= 0 ? fmtMiles(loc.nearestCKDistanceMi) : '—'}
                              </td>
                              <td className="py-2.5 pl-4 text-right">
                                {loc.hasCKNearby ? (
                                  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 rounded px-2 py-0.5 font-semibold"><CheckCircle size={11} />Yes</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5"><XCircle size={11} />No</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Vehicles Tab ─────────────────────────────────────── */}
                {activeTab === 'vehicles' && (
                  <div>
                    <div className="mb-4">
                      <h3 className="font-bold text-off-black">Vehicle Fueling Summary</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Per-unit breakdown sorted by total gallons</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            {['Unit #', 'Driver City', 'Trans', 'Gallons', 'Spend', 'CK Gallons', 'CK Share'].map(h => (
                              <th key={h} className={`py-2 ${['Unit #','Driver City'].includes(h) ? 'text-left pr-4' : 'text-right px-4'} text-xs font-semibold uppercase tracking-wider text-gray-500`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(showAllVehicles ? summary.vehicleBreakdown : summary.vehicleBreakdown.slice(0, 30)).map(v => (
                            <tr key={v.unitNumber} className="hover:bg-gray-50">
                              <td className="py-2 pr-4 font-mono font-semibold text-off-black text-xs">{v.unitNumber}</td>
                              <td className="py-2 px-4 text-gray-600 text-xs">{v.driverCity || '—'}</td>
                              <td className="py-2 px-4 text-right text-gray-600">{v.transactions}</td>
                              <td className="py-2 px-4 text-right font-medium">{fmtGallons(v.gallons)}</td>
                              <td className="py-2 px-4 text-right text-gray-600">{fmtDollars(v.spend)}</td>
                              <td className="py-2 px-4 text-right text-brand-orange font-medium">{fmtGallons(v.ckGallons)}</td>
                              <td className="py-2 pl-4 text-right">
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${v.ckSharePct >= 20 ? 'bg-green-100 text-green-700' : v.ckSharePct > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {fmtPct(v.ckSharePct)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {summary.vehicleBreakdown.length > 30 && (
                      <button onClick={() => setShowAllVehicles(v => !v)} className="mt-4 flex items-center gap-1 text-sm text-brand-orange hover:underline">
                        {showAllVehicles ? <><ChevronUp size={16} />Show fewer</> : <><ChevronDown size={16} />Show all {summary.vehicleBreakdown.length} vehicles</>}
                      </button>
                    )}
                  </div>
                )}

                {/* ── Map Tab ──────────────────────────────────────────── */}
                {activeTab === 'map' && (
                  <div className="space-y-6">
                    {/* Proximity breakdown (when geocoding is done) */}
                    {summary.proximityBreakdown && !geocodingInProgress ? (
                      <ProximityPanel prox={summary.proximityBreakdown} totalGallons={summary.totalGallons} />
                    ) : geocodingInProgress ? (
                      <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                        Geocoding locations for proximity analysis…
                        {geocodingProgress && ` (${geocodingProgress.done}/${geocodingProgress.total})`}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-500">
                        Proximity analysis requires a Mapbox token configured in your environment.
                      </div>
                    )}

                    {/* Map */}
                    <FuelingMap
                      transactionPoints={summary.mapPoints}
                      ckStores={ckStorePins}
                      height={560}
                      geocodingInProgress={geocodingInProgress}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Fuel type summary */}
            {summary.fuelTypeBreakdown.length > 1 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-bold text-off-black mb-3 text-sm">Fuel Type Breakdown</h3>
                <div className="flex flex-wrap gap-3">
                  {summary.fuelTypeBreakdown.map(ft => (
                    <div key={ft.type} className="bg-gray-50 rounded-lg px-4 py-3 text-center min-w-[120px]">
                      <p className="text-xs font-semibold text-gray-500 mb-1">{ft.type}</p>
                      <p className="text-lg font-bold text-off-black">{fmtGallons(ft.gallons)}</p>
                      <p className="text-xs text-gray-400">gallons</p>
                      <p className="text-xs text-gray-500 mt-1">{ft.transactions.toLocaleString()} trans</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
