'use client'

import { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import * as XLSX from 'xlsx'
import { useSearchParams } from 'next/navigation'
import {
  Upload,
  Truck,
  BarChart2,
  MapPin,
  TrendingUp,
  CheckCircle,
  Share2,
  ClipboardCopy,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  AlertCircle,
  Fuel,
  Navigation,
  Save,
  Target,
  Globe,
  Users,
  Zap,
} from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { parseFleetCSV } from '@/lib/transaction-parser'
import {
  analyzeTransactions,
  buildCKZipSet,
  fmtGallons,
  fmtPct,
  fmtDollars,
  type TransactionSummary,
} from '@/lib/transaction-analysis'
import { geocodeLocations, geoKey } from '@/lib/geocoding'
import { runOTRAnalysis, type OTRAnalysis } from '@/lib/otr-analysis'
import { createAnalysis, createAnalysisShare, getAnalysis } from '@/lib/supabase/queries'
import type { OTRMapStore } from '@/components/OTRMap'
import type { CKStorePin } from '@/components/FuelingMap'

// Dynamically import the maps (Mapbox can't SSR)
const OTRMap = dynamic(() => import('@/components/OTRMap').then(m => m.OTRMap), {
  ssr: false,
  loading: () => <div className="bg-gray-100 animate-pulse" style={{ height: 580 }} />,
})
const FuelingMap = dynamic(() => import('@/components/FuelingMap').then(m => m.FuelingMap), {
  ssr: false,
  loading: () => <div className="bg-gray-100 animate-pulse" style={{ height: 560 }} />,
})

// ─── Store record shape from stores-data.json ─────────────────────────────────

interface StoreRecord {
  zip: string
  coordinates: { lat: number; lng: number }
  name: string
  city: string
  state: string
  truckAccessible: boolean
  siteNumber?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Phase = 'upload' | 'parsing' | 'geocoding' | 'done'

function computeMonthSpan(dateRange: { start: string; end: string }): number {
  if (!dateRange.start || !dateRange.end) return 1
  const start = new Date(dateRange.start)
  const end = new Date(dateRange.end)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1
  return Math.max((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44), 0.5)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function OTRPageInner() {
  const searchParams = useSearchParams()
  const [phase, setPhase] = useState<Phase>('upload')
  const [customerName, setCustomerName] = useState('')
  const [fileName, setFileName] = useState('')
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [otrResult, setOtrResult] = useState<OTRAnalysis | null>(null)
  const [ckStores, setCKStores] = useState<OTRMapStore[]>([])
  const [geocodingProgress, setGeocodingProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [expandedTable, setExpandedTable] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const customerNameRef = useRef(customerName)
  useEffect(() => { customerNameRef.current = customerName }, [customerName])

  // ── Load saved analysis from ?load=<id> ─────────────────────────────────────
  useEffect(() => {
    const loadId = searchParams.get('load')
    if (!loadId) return
    setPhase('parsing')
    getAnalysis(loadId).then(record => {
      if (!record) { setError('Saved analysis not found.'); setPhase('upload'); return }
      const loaded = record.data as TransactionSummary
      setSummary(loaded)
      setOtrResult(loaded.otrAnalysis ?? null)
      setCustomerName(record.account_name)
      setFileName(record.file_name)
      setSavedId(record.id)
      // Load truck stores for map
      fetch('/stores-data.json').then(r => r.json()).then((data) => {
        const truckStores: OTRMapStore[] = (data.stores ?? [])
          .filter((s: StoreRecord) => s.truckAccessible && s.coordinates?.lat && s.coordinates?.lng)
          .map((s: StoreRecord) => ({ lat: s.coordinates.lat, lng: s.coordinates.lng, name: s.name, city: s.city, state: s.state }))
        setCKStores(truckStores)
      }).catch(() => {})
      setPhase('done')
    }).catch(() => { setError('Failed to load saved analysis.'); setPhase('upload') })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── File processing pipeline ────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    setError(null)
    setPhase('parsing')
    setFileName(file.name)
    setSummary(null)
    setOtrResult(null)
    setCKStores([])
    setSavedId(null)
    setShareToken(null)
    setExpandedTable(false)

    try {
      // 1. Read file
      const isExcel = /\.(xlsx|xls|xlsb)$/i.test(file.name)
      let content: string
      if (isExcel) {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        content = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]])
      } else {
        content = await file.text()
      }

      // 2. Parse
      const { transactions, detectedFormat, missingRequiredFields } = parseFleetCSV(content)
      if (transactions.length === 0) {
        throw new Error(
          missingRequiredFields.length > 0
            ? `Could not find required columns: ${missingRequiredFields.join(', ')}.`
            : 'No valid transactions found in this file.'
        )
      }

      // 3. Load CK stores — truck-accessible only for OTR
      const resp = await fetch('/stores-data.json')
      const storeData = await resp.json()
      const storeRecords: StoreRecord[] = storeData.stores ?? []
      const truckRecords = storeRecords.filter(
        s => s.truckAccessible && s.coordinates?.lat && s.coordinates?.lng
      )

      const truckZipSet = buildCKZipSet(truckRecords)
      const truckStoreCoords = truckRecords.map(s => ({ lat: s.coordinates.lat, lng: s.coordinates.lng, name: s.name, city: s.city, state: s.state, truckAccessible: true as const, siteNumber: s.siteNumber }))
      const allStoreCoords = storeRecords
        .filter(s => s.coordinates?.lat && s.coordinates?.lng)
        .map(s => ({ lat: s.coordinates.lat, lng: s.coordinates.lng, name: s.name, city: s.city, state: s.state, truckAccessible: s.truckAccessible, siteNumber: s.siteNumber }))
      const mapStores: OTRMapStore[] = truckRecords.map(s => ({
        lat: s.coordinates.lat,
        lng: s.coordinates.lng,
        name: s.name,
        city: s.city,
        state: s.state,
      }))
      setCKStores(mapStores)

      // 4. Geocode locations
      setPhase('geocoding')
      const uniqueLocations = Array.from(
        new Set(transactions.map(t => geoKey(t.stationCity, t.stationState)))
      )
        .filter(k => k !== '|')
        .map(k => {
          const [city, state] = k.split('|')
          return { city, state }
        })

      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!token) throw new Error('Mapbox token not configured.')

      setGeocodingProgress({ done: 0, total: uniqueLocations.length })
      const geocodedCoords = await geocodeLocations(uniqueLocations, token, (done, total) => {
        setGeocodingProgress({ done, total })
      })

      // 5. Re-analyze with geocoding
      const enriched = analyzeTransactions(transactions, truckZipSet, {
        detectedFormat,
        geocodedCoords,
        ckStores: truckStoreCoords,
        ckStoresAll: allStoreCoords,
      })

      // 6. Run corridor analysis
      const otr = runOTRAnalysis(
        enriched.mapPoints,
        truckRecords.map(s => ({ lat: s.coordinates.lat, lng: s.coordinates.lng, truckAccessible: true }))
      )
      enriched.otrAnalysis = otr
      enriched.truckMode = true

      setSummary(enriched)
      setOtrResult(otr)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('upload')
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
    setPhase('upload')
    setCustomerName('')
    setFileName('')
    setSummary(null)
    setOtrResult(null)
    setCKStores([])
    setGeocodingProgress(null)
    setError(null)
    setSavedId(null)
    setShareToken(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Save / Share ─────────────────────────────────────────────────────────────

  const saveAnalysis = async (): Promise<string | null> => {
    if (!summary) return null
    if (savedId) return savedId
    const result = await createAnalysis(
      customerNameRef.current || 'OTR Fleet',
      fileName,
      { ...summary, analysisType: 'otr' } as unknown as Record<string, unknown>
    )
    if (!result) return null
    setSavedId(result.id)
    window.history.replaceState(null, '', `/otr?load=${result.id}`)
    return result.id
  }

  const handleSave = async () => {
    if (!summary) return
    setSaving(true)
    setSaveError(null)
    const id = await saveAnalysis()
    if (!id) setSaveError('Failed to save — are you logged in?')
    setSaving(false)
  }

  const handleShare = async () => {
    if (!summary) return
    setSharing(true)
    try {
      const id = await saveAnalysis()
      if (!id) throw new Error('Failed to save analysis')
      const share = await createAnalysisShare(id, 'customer')
      if (!share) throw new Error('Failed to create share link')
      setShareToken(share.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link')
    } finally {
      setSharing(false)
    }
  }

  const copyShareLink = () => {
    if (!shareToken) return
    navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Upload phase ─────────────────────────────────────────────────────────────

  if (phase === 'upload') {
    return (
      <div className="min-h-screen bg-off-white">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 py-16">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-zinc-100 text-zinc-700 text-xs font-bold px-3 py-1.5 rounded-full mb-4">
              <Truck size={13} />
              OTR Fleet Analysis
            </div>
            <h1 className="text-3xl font-bold text-off-black mb-3">
              Corridor-Based Opportunity Analysis
            </h1>
            <p className="text-gray-500 text-base leading-relaxed max-w-lg mx-auto">
              Upload fleet transaction data to see fueling patterns along major interstate corridors
              — and exactly where truck-accessible Circle K locations can capture more gallons.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-6">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            {/* Customer name */}
            <div className="mb-5">
              <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                Fleet / Account Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="e.g. Acme Logistics"
                className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-brand-orange bg-orange-50'
                  : 'border-gray-300 hover:border-brand-orange hover:bg-orange-50/30'
              }`}
            >
              <Upload size={32} className={`mx-auto mb-3 ${isDragging ? 'text-brand-orange' : 'text-gray-400'}`} />
              <p className="font-semibold text-gray-700 mb-1">Drop your fleet data file here</p>
              <p className="text-sm text-gray-400">
                CSV or Excel (.xlsx, .xls) — WEX, Fleetcor, Comdata, Mastercard formats
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.xlsb"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Feature callouts */}
            <div className="mt-5 grid grid-cols-3 gap-3 text-center text-xs text-gray-500">
              <div className="flex flex-col items-center gap-1.5 p-3 bg-gray-50 rounded-lg">
                <Navigation size={15} className="text-brand-orange" />
                <span>39 Interstate Corridors</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 p-3 bg-gray-50 rounded-lg">
                <Truck size={15} className="text-brand-orange" />
                <span>Truck-Accessible CK Only</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 p-3 bg-gray-50 rounded-lg">
                <Share2 size={15} className="text-brand-orange" />
                <span>Shareable Customer Report</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Parsing / geocoding phase ─────────────────────────────────────────────────

  if (phase === 'parsing' || phase === 'geocoding') {
    const pct = geocodingProgress
      ? Math.round((geocodingProgress.done / geocodingProgress.total) * 100)
      : 0

    return (
      <div className="min-h-screen bg-off-white">
        <Navbar />
        <div className="max-w-md mx-auto px-6 py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-6">
            <Truck size={24} className="text-zinc-500 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-off-black mb-2">
            {phase === 'parsing' ? 'Parsing transactions…' : 'Geocoding locations…'}
          </h2>
          {phase === 'geocoding' && geocodingProgress ? (
            <>
              <p className="text-sm text-gray-500 mb-5">
                Locating {geocodingProgress.total.toLocaleString()} unique fueling points on the map
              </p>
              <div className="bg-zinc-200 rounded-full h-1.5 w-full mb-2">
                <div
                  className="bg-accent h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                {geocodingProgress.done.toLocaleString()} / {geocodingProgress.total.toLocaleString()} ({pct}%)
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Reading and parsing your fleet data file…</p>
          )}
        </div>
      </div>
    )
  }

  // ── Results phase ─────────────────────────────────────────────────────────────

  if (!summary || !otrResult) return null

  const months = computeMonthSpan(summary.dateRange)
  const totalOpp = otrResult.corridorResults.reduce((s, r) => s + r.captureGallons, 0)
  const totalCK = otrResult.corridorResults.reduce((s, r) => s + r.ckGallons, 0)
  const totalNearMiss = otrResult.corridorResults.reduce((s, r) => s + r.nearMissGallons, 0)
  const annualOpp = months > 0 ? (totalOpp / months) * 12 : totalOpp
  const annualNearMiss = months > 0 ? (totalNearMiss / months) * 12 : totalNearMiss
  const shownCorridors = expandedTable
    ? otrResult.corridorResults
    : otrResult.corridorResults.slice(0, 12)
  const shareUrl = shareToken ? `${window.location.origin}/share/${shareToken}` : null

  return (
    <div className="min-h-screen bg-off-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* Page header */}
        <div className="flex items-start justify-between mb-6 fade-in">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                <Truck size={11} />
                OTR Analysis
              </span>
              {summary.dateRange.start && (
                <span className="text-xs text-zinc-400">
                  {summary.dateRange.start} – {summary.dateRange.end}
                  {months !== 12 && ` (${months.toFixed(1)} mo)`}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-off-black">
              {customerName || 'Fleet'} — OTR Analysis
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {summary.totalTransactions.toLocaleString()} transactions · {fmtGallons(summary.totalGallons)} total · {fileName}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {savedId ? (
              <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                <CheckCircle size={13} />
                Saved
              </span>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <Save size={15} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
            {shareUrl ? (
              <button
                onClick={copyShareLink}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                {copied ? <CheckCircle size={15} className="text-green-500" /> : <ClipboardCopy size={15} />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            ) : (
              <button
                onClick={handleShare}
                disabled={sharing}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <Share2 size={15} />
                {sharing ? 'Creating…' : 'Share Report'}
              </button>
            )}
            <button onClick={reset} className="btn-secondary flex items-center gap-2 text-sm">
              <RefreshCw size={15} />
              New
            </button>
          </div>
        </div>

        {saveError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={14} className="shrink-0" />
            {saveError}
          </div>
        )}

        {/* Summary stats */}
        <div className="rounded-xl border border-zinc-200 overflow-hidden bg-zinc-100 shadow-sm mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px stagger-stats">
            {[
              {
                label: 'Active Corridors',
                value: otrResult.corridorResults.length.toString(),
                sub: `of 39 interstates`,
                accent: false,
                warn: false,
              },
              {
                label: 'On-Corridor Gallons',
                value: fmtGallons(otrResult.totalCorridorGallons),
                sub: fmtPct(otrResult.totalCorridorGallons / (summary.totalGallons || 1) * 100) + ' of total',
                accent: false,
                warn: false,
              },
              {
                label: 'CK Captured',
                value: fmtGallons(totalCK),
                sub: fmtPct(totalCK / (otrResult.totalCorridorGallons || 1) * 100) + ' capture rate',
                accent: false,
                warn: false,
              },
              {
                label: 'Near-Miss Gallons',
                value: fmtGallons(totalNearMiss),
                sub: 'drove past a CK · highest priority',
                accent: false,
                warn: totalNearMiss > 1000,
              },
              {
                label: 'Annual Opportunity',
                value: fmtGallons(annualOpp),
                sub: months !== 12 ? `annualized from ${months.toFixed(1)} mo` : 'capturable gallons',
                accent: true,
                warn: false,
              },
            ].map(({ label, value, sub, accent, warn }) => (
              <div
                key={label}
                className={`px-5 py-4 ${accent ? 'bg-accent' : warn ? 'bg-amber-50' : 'bg-white'}`}
              >
                <p className={`text-xs font-medium uppercase tracking-wider mb-1.5 ${accent ? 'text-white/70' : warn ? 'text-amber-600' : 'text-zinc-400'}`}>
                  {label}
                </p>
                <p className={`text-2xl font-bold leading-none ${accent ? 'text-white' : warn ? 'text-amber-700' : 'text-zinc-900'}`}>
                  {value}
                </p>
                <p className={`text-xs mt-1.5 ${accent ? 'text-white/60' : warn ? 'text-amber-500' : 'text-zinc-400'}`}>{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden mb-6 fade-in">
          <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-zinc-900 font-bold text-lg">Highway Corridor Map</h2>
              <p className="text-zinc-500 text-sm mt-0.5">
                Orange = interstate · Blue dashed = US highway · Intensity reflects opportunity gallons
              </p>
            </div>
            <MapPin className="text-zinc-400 shrink-0" size={22} />
          </div>
          <Suspense fallback={<div className="bg-gray-100 animate-pulse" style={{ height: 580 }} />}>
            <OTRMap
              transactionPoints={summary.mapPoints}
              ckStores={ckStores}
              corridorResults={otrResult.corridorResults}
              height={580}
            />
          </Suspense>
        </div>

        {/* Fueling Locations Map */}
        {summary.mapPoints.length > 0 && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden mb-6 fade-in">
            <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-zinc-900 font-bold text-lg">All Fueling Locations</h2>
                <p className="text-zinc-500 text-sm mt-0.5">
                  Customer fueling stops · truck-accessible Circle K sites · color = proximity
                </p>
              </div>
              <MapPin className="text-zinc-400 shrink-0" size={22} />
            </div>
            <Suspense fallback={<div className="bg-gray-100 animate-pulse" style={{ height: 560 }} />}>
              <FuelingMap
                transactionPoints={summary.mapPoints}
                ckStores={ckStores.map((s): CKStorePin => ({ ...s, zip: '', truckAccessible: true }))}
                height={560}
                truckMode={true}
              />
            </Suspense>
          </div>
        )}

        {/* Corridor table */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm mb-6 fade-in">
          <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-zinc-900 font-bold text-lg">Corridor Breakdown</h2>
              <p className="text-zinc-500 text-sm mt-0.5">
                Ranked by total gallons · capturable = competitor fill within 30 mi of a truck-accessible CK
              </p>
            </div>
            <BarChart2 className="text-zinc-400 shrink-0" size={22} />
          </div>

          <div className="p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
                    <th className="text-left pb-3 pr-4">Corridor</th>
                    <th className="text-right pb-3 px-3">Total Gal</th>
                    <th className="text-right pb-3 px-3 text-green-700">CK Captured</th>
                    <th className="text-right pb-3 px-3 text-zinc-600">Opportunity</th>
                    <th className="text-right pb-3 px-3 text-gray-400">Gap</th>
                    <th className="text-right pb-3 px-3">CK Sites</th>
                    <th className="text-right pb-3">Top Competitor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shownCorridors.map(r => {
                    const oppPct = r.totalGallons > 0 ? (r.captureGallons / r.totalGallons) * 100 : 0
                    const ckPct = r.totalGallons > 0 ? (r.ckGallons / r.totalGallons) * 100 : 0
                    return (
                      <tr key={r.corridorId} className="hover:bg-gray-50">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-off-black">{r.corridorName}</span>
                            {r.isHighway ? (
                              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">US Hwy</span>
                            ) : (
                              <span className="text-xs text-gray-400">{r.direction === 'EW' ? 'E↔W' : 'N↕S'}</span>
                            )}
                          </div>
                        </td>
                        <td className="text-right px-3 tabular-nums text-gray-700">
                          {fmtGallons(r.totalGallons)}
                        </td>
                        <td className="text-right px-3 tabular-nums">
                          <span className="text-green-700 font-medium">{fmtGallons(r.ckGallons)}</span>
                          {ckPct > 0 && (
                            <span className="text-xs text-gray-400 ml-1">({fmtPct(ckPct)})</span>
                          )}
                        </td>
                        <td className="text-right px-3 tabular-nums">
                          <span className="text-accent font-semibold">{fmtGallons(r.captureGallons)}</span>
                          {oppPct > 0 && (
                            <span className="text-xs text-gray-400 ml-1">({fmtPct(oppPct)})</span>
                          )}
                        </td>
                        <td className="text-right px-3 tabular-nums text-gray-400">
                          {fmtGallons(r.gapGallons)}
                        </td>
                        <td className="text-right px-3">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                            r.truckCKStoreCount > 0
                              ? 'bg-accent-muted text-accent'
                              : 'bg-zinc-100 text-zinc-400'
                          }`}>
                            {r.truckCKStoreCount}
                          </span>
                        </td>
                        <td className="text-right text-gray-500 text-xs">
                          {r.topCompetitorBrand || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {otrResult.corridorResults.length > 12 && (
              <button
                onClick={() => setExpandedTable(v => !v)}
                className="mt-4 flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
              >
                {expandedTable
                  ? <><ChevronUp size={14} />Show fewer corridors</>
                  : <><ChevronDown size={14} />Show all {otrResult.corridorResults.length} corridors</>}
              </button>
            )}

            {otrResult.offCorridorGallons > 0 && (
              <p className="mt-4 text-xs text-gray-400 flex items-start gap-1.5">
                <Info size={12} className="shrink-0 mt-0.5" />
                {fmtGallons(otrResult.offCorridorGallons)} gallons (
                {otrResult.offCorridorTransactions.toLocaleString()} transactions) did not snap to a
                major interstate — likely local delivery or regional routes.
              </p>
            )}
          </div>
        </div>

        {/* Near-Miss Spotlight */}
        {totalNearMiss > 0 && (() => {
          const nearMissCorridors = otrResult.corridorResults
            .filter(r => r.nearMissGallons > 0)
            .sort((a, b) => b.nearMissGallons - a.nearMissGallons)
            .slice(0, 8)
          return (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-sm mb-6 fade-in">
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-zinc-900 font-bold text-lg flex items-center gap-2">
                    <Target size={18} className="text-amber-500" />
                    Near-Miss Opportunities
                  </h2>
                  <p className="text-zinc-500 text-sm mt-0.5">
                    Competitor fills within 5 mi of a truck-accessible CK — drivers who passed one and didn't stop
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-amber-700">{fmtGallons(totalNearMiss)}</p>
                  <p className="text-xs text-amber-500 mt-0.5">
                    {months !== 12 ? `${fmtGallons(annualNearMiss)} / yr` : 'gallons'}
                  </p>
                </div>
              </div>
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
                        <th className="text-left pb-3 pr-4">Corridor</th>
                        <th className="text-right pb-3 px-3">Near-Miss Gal</th>
                        <th className="text-right pb-3 px-3">% of Corridor</th>
                        <th className="text-right pb-3">Annualized</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {nearMissCorridors.map(r => {
                        const pct = r.totalGallons > 0 ? (r.nearMissGallons / r.totalGallons) * 100 : 0
                        const ann = months > 0 ? (r.nearMissGallons / months) * 12 : r.nearMissGallons
                        return (
                          <tr key={r.corridorId} className="hover:bg-gray-50">
                            <td className="py-2.5 pr-4 font-bold text-off-black">{r.corridorName}</td>
                            <td className="text-right px-3 tabular-nums font-semibold text-amber-700">
                              {fmtGallons(r.nearMissGallons)}
                            </td>
                            <td className="text-right px-3 tabular-nums text-gray-500">
                              {fmtPct(pct)}
                            </td>
                            <td className="text-right tabular-nums text-gray-400">
                              {months !== 12 ? fmtGallons(ann) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Geographic State Breakdown */}
        {summary.stateBreakdown.length > 0 && (() => {
          const states = summary.stateBreakdown
            .filter(s => s.gallons > 0)
            .sort((a, b) => b.gallons - a.gallons)
          const shown = states.slice(0, 15)
          const maxGal = Math.max(...shown.map(s => s.gallons), 1)
          const totalGal = states.reduce((sum, s) => sum + s.gallons, 0)
          // Roll up on-corridor gallons per state from corridor stateBreakdowns
          const onCorridorByState = new Map<string, number>()
          for (const r of otrResult.corridorResults) {
            for (const [st, gal] of Object.entries(r.stateBreakdown)) {
              onCorridorByState.set(st, (onCorridorByState.get(st) ?? 0) + gal)
            }
          }
          return (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm mb-6 fade-in">
              <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-zinc-900 font-bold text-lg">Geographic Breakdown</h2>
                  <p className="text-zinc-500 text-sm mt-0.5">
                    Gallons by state · {summary.uniqueStates.length} states · CK share and on-corridor volume
                  </p>
                </div>
                <Globe className="text-zinc-400 shrink-0" size={22} />
              </div>
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
                        <th className="text-left pb-3 pr-4 w-12">State</th>
                        <th className="text-left pb-3 px-3 w-full">Volume</th>
                        <th className="text-right pb-3 px-3">Total Gal</th>
                        <th className="text-right pb-3 px-3">Share</th>
                        <th className="text-right pb-3 px-3">CK %</th>
                        <th className="text-right pb-3">On-Corridor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {shown.map(s => {
                        const barPct = (s.gallons / maxGal) * 100
                        const ckBarPct = s.gallons > 0 ? (s.ckGallons / maxGal) * 100 : 0
                        const sharePct = totalGal > 0 ? (s.gallons / totalGal) * 100 : 0
                        const onCorridor = onCorridorByState.get(s.state) ?? 0
                        const onCorridorPct = s.gallons > 0 ? (onCorridor / s.gallons) * 100 : 0
                        return (
                          <tr key={s.state} className="hover:bg-gray-50">
                            <td className="py-2.5 pr-4 font-bold text-off-black">{s.state}</td>
                            <td className="py-2.5 px-3">
                              <div className="h-3 bg-zinc-100 rounded-full overflow-hidden w-full min-w-[80px]">
                                <div className="h-3 rounded-full overflow-hidden bg-zinc-300 bar-grow" style={{ width: `${barPct}%` }}>
                                  <div className="h-full bg-brand-orange" style={{ width: `${s.gallons > 0 ? (ckBarPct / barPct) * 100 : 0}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums font-medium text-gray-700">
                              {fmtGallons(s.gallons)}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-gray-500">
                              {fmtPct(sharePct)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                s.ckSharePct >= 20 ? 'bg-green-100 text-green-700'
                                : s.ckSharePct > 0 ? 'bg-orange-100 text-orange-700'
                                : 'bg-gray-100 text-gray-500'
                              }`}>
                                {fmtPct(s.ckSharePct)}
                              </span>
                            </td>
                            <td className="py-2.5 pl-3 text-right tabular-nums text-gray-400">
                              {onCorridor > 0 ? `${fmtGallons(onCorridor)} (${fmtPct(onCorridorPct)})` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {states.length > 15 && (
                  <p className="mt-2 text-xs text-gray-400">+ {states.length - 15} more states</p>
                )}
                <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-brand-orange inline-block" />CK gallons
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-gray-300 inline-block" />Competitor gallons
                  </span>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Competitor Concentration */}
        {(() => {
          // Roll up competitor gallons across all corridors
          const compMap = new Map<string, number>()
          for (const r of otrResult.corridorResults) {
            for (const { brand, gallons } of r.competitorBreakdown) {
              if (brand && brand !== '—') {
                compMap.set(brand, (compMap.get(brand) ?? 0) + gallons)
              }
            }
          }
          const compRanked = Array.from(compMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
          if (compRanked.length === 0) return null
          const compTotal = compRanked.reduce((s, [, g]) => s + g, 0)
          const compMax = Math.max(...compRanked.map(([, g]) => g), 1)
          const top = compRanked[0]
          const topPct = compTotal > 0 ? (top[1] / compTotal) * 100 : 0
          return (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm mb-6 fade-in">
              <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-zinc-900 font-bold text-lg">Competitor Concentration</h2>
                  <p className="text-zinc-500 text-sm mt-0.5">
                    Where non-CK corridor gallons are going · rolled up across all active corridors
                  </p>
                </div>
                <BarChart2 className="text-zinc-400 shrink-0" size={22} />
              </div>
              <div className="p-6">
                {topPct >= 40 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
                    <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800 leading-snug">
                      <strong>{fmtPct(topPct)}</strong> of non-CK corridor fills are at{' '}
                      <strong>{top[0]}</strong> — a concentrated loyalty relationship.
                      Displacement strategy should prioritize this brand.
                    </p>
                  </div>
                )}
                <div className="space-y-3">
                  {compRanked.map(([brand, gallons]) => {
                    const pct = compTotal > 0 ? (gallons / compTotal) * 100 : 0
                    return (
                      <div key={brand}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">{brand}</span>
                          <span className="text-sm font-semibold text-gray-800 tabular-nums">
                            {fmtGallons(gallons)}{' '}
                            <span className="text-gray-400 font-normal text-xs">({fmtPct(pct)})</span>
                          </span>
                        </div>
                        <div className="h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div
                            className="h-2.5 bg-zinc-600 rounded-full bar-grow"
                            style={{ width: `${(gallons / compMax) * 100}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-4 text-xs text-gray-400 flex items-start gap-1.5">
                  <Info size={12} className="shrink-0 mt-0.5" />
                  Gallons represent on-corridor competitor fills only. Brands are sourced from station name data in the fleet report.
                </p>
              </div>
            </div>
          )
        })()}

        {/* Fleet Loyalty Segments */}
        {summary.vehicleSegments.length > 0 && (() => {
          const SEGMENT_ORDER = ['ck-loyal', 'mixed', 'mostly-competitor', 'never-ck'] as const
          const segments = SEGMENT_ORDER
            .map(s => summary.vehicleSegments.find(seg => seg.segment === s))
            .filter(Boolean) as typeof summary.vehicleSegments
          const totalVehicles = summary.vehicleBreakdown.length
          const avgFillSize = summary.totalTransactions > 0
            ? summary.totalGallons / summary.totalTransactions
            : 0
          const compVehicles = summary.vehicleBreakdown.filter(v => v.ckSharePct === 0)
          const compGallons = compVehicles.reduce((s, v) => s + v.gallons, 0)
          if (totalVehicles === 0) return null
          return (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm mb-6 fade-in">
              <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-zinc-900 font-bold text-lg">Fleet Behavior</h2>
                  <p className="text-zinc-500 text-sm mt-0.5">
                    CK loyalty segmentation · fill patterns across {totalVehicles} vehicles
                  </p>
                </div>
                <Users className="text-zinc-400 shrink-0" size={22} />
              </div>
              <div className="p-6 space-y-6">
                {/* Segment cards */}
                <div>
                  <h3 className="font-bold text-off-black text-sm uppercase tracking-wide mb-3">CK Loyalty Segments</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {segments.map(seg => {
                      const pct = totalVehicles > 0 ? (seg.count / totalVehicles) * 100 : 0
                      return (
                        <div key={seg.segment} className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                            <span className="font-bold text-off-black text-sm">{seg.label}</span>
                          </div>
                          <p className="text-2xl font-bold text-off-black">{seg.count}</p>
                          <p className="text-xs text-gray-400 mt-0.5">vehicles ({fmtPct(pct)})</p>
                          <p className="text-xs text-gray-500 mt-2">{fmtGallons(seg.gallons)} gal</p>
                          <p className="text-xs text-gray-400 mt-0.5 leading-tight">{seg.description}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Fill size + cadence stats */}
                <div className="border-t border-gray-100 pt-4">
                  <h3 className="font-bold text-off-black text-sm uppercase tracking-wide mb-3">Fill Patterns</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">Avg Fill Size</p>
                      <p className="text-xl font-bold text-off-black">{avgFillSize.toFixed(0)} gal</p>
                      <p className="text-xs text-gray-400 mt-0.5">per transaction</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">Total Vehicles</p>
                      <p className="text-xl font-bold text-off-black">{totalVehicles.toLocaleString()}</p>
                      <p className="text-xs text-gray-400 mt-0.5">in data window</p>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">Never-CK Vehicles</p>
                      <p className="text-xl font-bold text-amber-700">{compVehicles.length.toLocaleString()}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtGallons(compGallons)} gal</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">States Covered</p>
                      <p className="text-xl font-bold text-off-black">{summary.uniqueStates.length}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{summary.uniqueStates.slice(0, 4).join(', ')}{summary.uniqueStates.length > 4 ? ` +${summary.uniqueStates.length - 4}` : ''}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Fleet Fuel Profile */}
        {(summary.proximityBreakdown || summary.fuelTypeBreakdown.length > 0) && (() => {
          // ── Fuel type helpers ──────────────────────────────────────────────────
          const normalizeFuelLabel = (raw: string) => {
            const r = raw.toUpperCase().trim()
            if (r === '' || r === 'UNKNOWN') return 'Unknown'
            if (r.includes('DEF') || r.includes('EXHAUST') || r === 'UREA') return 'DEF / Exhaust Fluid'
            if (r.includes('DIESEL') || r === 'DSL' || r === 'DSEL') return 'Diesel'
            if (r.includes('PREMIUM') || r === 'PRM' || r === 'PRML') return 'Premium Unleaded'
            if (r.includes('MIDGRADE') || r === 'MID') return 'Midgrade Unleaded'
            if (r.includes('UNLEAD') || r === 'UNL' || r === 'REG' || r === 'REGULAR' || r === 'GASOLINE' || r === 'GAS') return 'Unleaded'
            if (r.includes('CNG') || r.includes('NATURAL GAS')) return 'CNG'
            if (r.includes('PROPANE') || r === 'LPG') return 'Propane'
            if (r.includes('ELECTRIC') || r === 'EV') return 'Electric'
            return raw
          }
          const fuelColors: Record<string, string> = {
            'Diesel':            'bg-blue-500',
            'DEF / Exhaust Fluid': 'bg-cyan-400',
            'Unleaded':          'bg-orange-400',
            'Premium Unleaded':  'bg-purple-400',
            'Midgrade Unleaded': 'bg-pink-400',
            'CNG':               'bg-teal-400',
            'Propane':           'bg-lime-400',
          }

          // Merge raw types into normalized labels
          const fuelMerged = new Map<string, number>()
          for (const ft of summary.fuelTypeBreakdown) {
            const label = normalizeFuelLabel(ft.type)
            fuelMerged.set(label, (fuelMerged.get(label) ?? 0) + ft.gallons)
          }
          const fuelRows = Array.from(fuelMerged.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
          const fuelMax = Math.max(...fuelRows.map(([, g]) => g), 1)
          const fuelTotal = fuelRows.reduce((s, [, g]) => s + g, 0)

          // ── Proximity helpers ──────────────────────────────────────────────────
          const proxRows = (p: NonNullable<typeof summary.proximityBreakdown>, label0: string) => {
            const ck  = p.ckGallons
            const w2  = p.within1mi.gallons + p.within2mi.gallons
            const w5  = p.within5mi.gallons
            const w10 = p.within10mi.gallons
            const b10 = p.beyond10mi.gallons
            const tot = ck + w2 + w5 + w10 + b10
            const mx  = Math.max(ck, w2, w5, w10, b10, 1)
            return {
              w2, tot, mx,
              rows: [
                { label: label0,          gallons: ck,  color: 'bg-green-500',   text: 'text-green-700',   note: 'Already at CK' },
                { label: 'Within 2 mi',   gallons: w2,  color: 'bg-emerald-400', text: 'text-emerald-700', note: 'Drove right past' },
                { label: '2–5 mi',        gallons: w5,  color: 'bg-amber-400',   text: 'text-amber-700',   note: 'Strong opportunity' },
                { label: '5–10 mi',       gallons: w10, color: 'bg-orange-400',  text: 'text-orange-700',  note: 'Moderate detour' },
                { label: '10+ mi',        gallons: b10, color: 'bg-red-400',     text: 'text-red-700',     note: 'No nearby CK' },
              ],
            }
          }

          const truckProx = summary.proximityBreakdown  ? proxRows(summary.proximityBreakdown,  'At CK (truck stop)') : null
          const allProx   = summary.proximityBreakdownAll ? proxRows(summary.proximityBreakdownAll, 'At Circle K') : null

          // ── Brands ────────────────────────────────────────────────────────────
          const topBrands = summary.brandBreakdown.slice(0, 6)
          const brandMax  = Math.max(...topBrands.map(b => b.gallons), 1)
          const compSpend = summary.brandBreakdown.filter(b => !b.isCircleK).reduce((s, b) => s + b.spend, 0)

          const ProxPanel = ({ data, title, subtitle }: { data: NonNullable<typeof truckProx>; title: string; subtitle: string }) => (
            <div>
              <h3 className="font-bold text-off-black text-sm uppercase tracking-wide mb-0.5">{title}</h3>
              <p className="text-xs text-gray-400 mb-3">{subtitle}</p>
              {data.w2 > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
                  <CheckCircle size={12} className="text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-800 leading-snug">
                    <strong>{fmtGallons(data.w2)}</strong> gal within 2 mi
                    {months > 0 ? ` · ${fmtGallons((data.w2 / months) * 12)} / yr` : ''}
                    {' '}— drove right past.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                {data.rows.map(({ label, gallons, color, text, note }) => {
                  const pct = data.tot > 0 ? (gallons / data.tot) * 100 : 0
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-700">{label}</span>
                        <span className={`text-xs font-semibold ${text}`}>{fmtGallons(gallons)} <span className="text-gray-400 font-normal">({fmtPct(pct)})</span></span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-1.5 ${color} rounded-full`} style={{ width: `${(gallons / data.mx) * 100}%` }} />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 leading-none">{note}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )

          return (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-6">
              <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-zinc-900 font-bold text-lg">Fleet Fuel Profile</h2>
                  <p className="text-zinc-500 text-sm mt-0.5">Fuel mix · proximity to Circle K · key competitors</p>
                </div>
                <Fuel className="text-zinc-400 shrink-0" size={22} />
              </div>

              <div className="p-6 space-y-6">

                {/* ── Fuel type mix ── */}
                {fuelRows.length > 0 && (
                  <div>
                    <h3 className="font-bold text-off-black text-sm uppercase tracking-wide mb-3">Fuel Mix</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                      {fuelRows.map(([label, gallons]) => {
                        const pct = fuelTotal > 0 ? (gallons / fuelTotal) * 100 : 0
                        const color = fuelColors[label] ?? 'bg-gray-400'
                        return (
                          <div key={label}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs text-gray-700 font-medium">{label}</span>
                              <span className="text-xs font-semibold text-gray-800">{fmtGallons(gallons)} <span className="text-gray-400 font-normal">({fmtPct(pct)})</span></span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-2 ${color} rounded-full`} style={{ width: `${(gallons / fuelMax) * 100}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {summary.fuelTypeBreakdown.length > 6 && (
                      <p className="mt-1.5 text-xs text-gray-400">+ {summary.fuelTypeBreakdown.length - 6} more fuel types</p>
                    )}
                  </div>
                )}

                {(truckProx || allProx) && <div className="border-t border-gray-100" />}

                {/* ── Dual proximity ── */}
                {(truckProx || allProx) && (
                  <div className={`grid gap-6 ${truckProx && allProx ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                    {truckProx && (
                      <ProxPanel
                        data={truckProx}
                        title="Truck-Accessible Circle K"
                        subtitle={`Diesel & DEF · ${ckStores.length} truck stop CK locations`}
                      />
                    )}
                    {allProx && (
                      <ProxPanel
                        data={allProx}
                        title="Any Circle K (incl. c-stores)"
                        subtitle="All fuel types · full CK network"
                      />
                    )}
                  </div>
                )}

                {topBrands.length > 0 && <div className="border-t border-gray-100" />}

                {/* ── Competitor brands ── */}
                {topBrands.length > 0 && (
                  <div>
                    <h3 className="font-bold text-off-black text-sm uppercase tracking-wide mb-3">Where Drivers Are Fueling</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                      {topBrands.map(b => {
                        const pct = summary.totalGallons > 0 ? (b.gallons / summary.totalGallons) * 100 : 0
                        return (
                          <div key={b.brand}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className={`text-xs font-medium ${b.isCircleK ? 'text-brand-orange' : 'text-gray-700'}`}>
                                {b.displayName || b.brand}
                              </span>
                              <span className={`text-xs font-semibold ${b.isCircleK ? 'text-brand-orange' : 'text-gray-700'}`}>
                                {fmtGallons(b.gallons)} <span className="text-gray-400 font-normal">({fmtPct(pct)})</span>
                              </span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-2 rounded-full ${b.isCircleK ? 'bg-brand-orange' : 'bg-gray-400'}`}
                                style={{ width: `${(b.gallons / brandMax) * 100}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-0.5">Competitor Spend</p>
                        <p className="font-bold text-off-black text-sm">{fmtDollars(compSpend)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-0.5">Unique Brands</p>
                        <p className="font-bold text-off-black text-sm">{summary.brandBreakdown.filter(b => !b.isCircleK).length}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center sm:block hidden">
                        <p className="text-xs text-gray-500 mb-0.5">Fuel Types</p>
                        <p className="font-bold text-off-black text-sm">{summary.fuelTypeBreakdown.length}</p>
                      </div>
                    </div>
                    {summary.proximityBreakdown && summary.proximityBreakdown.geocodedPct < 90 && (
                      <p className="mt-3 text-xs text-gray-400 flex items-start gap-1.5">
                        <Info size={12} className="shrink-0 mt-0.5" />
                        {fmtPct(summary.proximityBreakdown.geocodedPct)} of gallons geocoded — proximity covers geocoded transactions only.
                      </p>
                    )}
                  </div>
                )}

              </div>
            </div>
          )
        })()}

        {/* Top CK Opportunity Locations */}
        {summary.topCKOpportunityLocations.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-6">
            <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-zinc-900 font-bold text-lg">Top Circle K Opportunity Locations</h2>
                <p className="text-zinc-500 text-sm mt-0.5">
                  Truck-accessible CK stores with the most competitor gallons fueled within 5 miles
                </p>
              </div>
              <MapPin className="text-zinc-400 shrink-0" size={22} />
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      {['Circle K Location', 'City / State', 'Type', 'Competitor Gallons Nearby', 'Stations', 'Comp. Spend'].map(h => (
                        <th key={h} className={`py-2 ${['Circle K Location', 'City / State', 'Type'].includes(h) ? 'text-left px-4 first:pl-0' : 'text-right px-4'} text-xs font-semibold uppercase tracking-wider text-gray-500`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {summary.topCKOpportunityLocations.map((loc, i) => {
                      const annualized = months > 0 ? (loc.competitorGallons / months) * 12 : 0
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="py-3 pr-4 font-medium text-off-black max-w-[200px] truncate">
                            {loc.ckName}
                            {loc.siteNumber && <span className="ml-1.5 text-xs text-gray-400 font-normal">#{loc.siteNumber}</span>}
                          </td>
                          <td className="py-3 px-4 text-gray-500 text-xs whitespace-nowrap">{loc.city}, {loc.state}</td>
                          <td className="py-3 px-4">
                            {loc.truckAccessible
                              ? <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5 font-semibold"><Truck size={10} />Truck</span>
                              : <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5">C-Store</span>}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="font-semibold text-brand-orange">{fmtGallons(loc.competitorGallons)}</span>
                            {annualized > 0 && <span className="block text-xs text-gray-400">{fmtGallons(annualized)} / yr</span>}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">{loc.nearbyStationCount}</td>
                          <td className="py-3 pl-4 text-right text-gray-600">{fmtDollars(loc.competitorSpend)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-gray-400 flex items-start gap-1.5">
                <Info size={12} className="shrink-0 mt-0.5" />
                Competitor gallons aggregated from geocoded fueling stops within 5 miles of each CK location.
              </p>
            </div>
          </div>
        )}

        {/* Share section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-off-black mb-1">Share with Customer</h3>
              <p className="text-sm text-gray-500">
                Generate a customer-facing link with the corridor breakdown and key stats.
              </p>
            </div>
            {!shareUrl && (
              <button
                onClick={handleShare}
                disabled={sharing}
                className="btn-primary flex items-center gap-2 shrink-0"
              >
                <Share2 size={16} />
                {sharing ? 'Saving…' : 'Create Share Link'}
              </button>
            )}
          </div>

          {shareUrl && (
            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-600 truncate font-mono">
                {shareUrl}
              </div>
              <button
                onClick={copyShareLink}
                className={`btn-secondary flex items-center gap-2 shrink-0 ${
                  copied ? 'text-green-600 border-green-300 bg-green-50' : ''
                }`}
              >
                {copied ? <CheckCircle size={15} /> : <ClipboardCopy size={15} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary shrink-0"
              >
                Open ↗
              </a>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default function OTRPage() {
  return (
    <Suspense>
      <OTRPageInner />
    </Suspense>
  )
}
