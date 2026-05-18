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
  Clock,
  ShieldAlert,
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
  type DriverSummary,
  type VehicleSegment,
  type FraudFlag,
} from '@/lib/transaction-analysis'
import { geocodeLocations, geocodeAddresses, geoKey, addrGeoKey } from '@/lib/geocoding'
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

// ─── Behavioral Insights ─────────────────────────────────────────────────────

const SEGMENT_ORDER: VehicleSegment['segment'][] = ['ck-loyal', 'mixed', 'mostly-competitor', 'never-ck']

function ViewToggle({
  mode, setMode, hasDriver, hasVehicle,
}: {
  mode: 'driver' | 'vehicle'
  setMode: (m: 'driver' | 'vehicle') => void
  hasDriver: boolean
  hasVehicle: boolean
}) {
  if (!hasDriver || !hasVehicle) return null
  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold shrink-0">
      <button
        onClick={() => setMode('driver')}
        className={`px-3 py-1.5 transition-colors ${mode === 'driver' ? 'bg-zinc-800 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50'}`}
      >
        By Driver
      </button>
      <button
        onClick={() => setMode('vehicle')}
        className={`px-3 py-1.5 border-l border-zinc-200 transition-colors ${mode === 'vehicle' ? 'bg-zinc-800 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50'}`}
      >
        By Vehicle
      </button>
    </div>
  )
}

function BehavioralInsightsTab({ summary }: { summary: import('@/lib/transaction-analysis').TransactionSummary }) {
  const [showAll, setShowAll] = useState(false)
  const [mode, setMode] = useState<'driver' | 'vehicle'>(
    summary.hasDriverData ? 'driver' : 'vehicle'
  )

  const byDriver = mode === 'driver' && summary.hasDriverData
  const segments = SEGMENT_ORDER
    .map(s => (byDriver ? summary.driverSegments : summary.vehicleSegments).find(seg => seg.segment === s))
    .filter(Boolean) as VehicleSegment[]
  const totalEntities = byDriver ? summary.driverBreakdown.length : summary.vehicleBreakdown.length
  const entityLabel = byDriver ? 'drivers' : 'vehicles'

  const topOpportunityVehicles = [...summary.vehicleBreakdown]
    .filter(v => v.capturableGallons > 0)
    .sort((a, b) => b.capturableGallons - a.capturableGallons)
  const topOpportunityDrivers = [...summary.driverBreakdown]
    .filter(d => d.capturableGallons > 0)
    .sort((a, b) => b.capturableGallons - a.capturableGallons)
  const topOpportunity = byDriver ? topOpportunityDrivers : topOpportunityVehicles

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-bold text-off-black">Fleet CK Loyalty Segments</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              How your fleet&apos;s {totalEntities} {entityLabel} break down by Circle K capture rate
            </p>
          </div>
          <ViewToggle
            mode={mode} setMode={setMode}
            hasDriver={summary.hasDriverData}
            hasVehicle={summary.vehicleBreakdown.length > 0}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {segments.map(seg => {
            const pct = totalEntities > 0 ? (seg.count / totalEntities) * 100 : 0
            return (
              <div key={seg.segment} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                  <span className="font-bold text-off-black text-sm">{seg.label}</span>
                </div>
                <p className="text-2xl font-bold text-off-black">{seg.count}</p>
                <p className="text-xs text-gray-400 mt-0.5">{entityLabel} ({fmtPct(pct)})</p>
                <p className="text-xs text-gray-500 mt-2">{fmtGallons(seg.gallons)} gal</p>
                <p className="text-xs text-gray-400 mt-0.5">{seg.description}</p>
              </div>
            )
          })}
        </div>
      </div>

      {topOpportunity.length > 0 ? (
        <div>
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-bold text-off-black">
                Top Opportunity {byDriver ? 'Drivers' : 'Vehicles'}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {byDriver ? 'Drivers' : 'Units'} with the most capturable gallons — currently fueling at competitors where a CK exists in the same area
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {(byDriver
                    ? ['Driver', 'Home City', 'Vehicles Used', 'Capturable Gal', 'Top Competitor', 'Total Gal', 'CK Share', 'Avg Days / Fill']
                    : ['Unit #', 'Driver City', 'Capturable Gal', 'Top Competitor', 'Total Gal', 'CK Share', 'Avg Days / Fill']
                  ).map(h => (
                    <th
                      key={h}
                      className={`py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
                        ['Driver', 'Unit #', 'Home City', 'Driver City', 'Top Competitor', 'Vehicles Used'].includes(h)
                          ? 'text-left pr-4' : 'text-right px-4'
                      }`}
                    >{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(showAll ? topOpportunity : topOpportunity.slice(0, 15)).map(item => {
                  const isDriver = 'driverName' in item
                  const d = item as DriverSummary
                  const v = item as (typeof topOpportunityVehicles)[0]
                  return (
                    <tr key={isDriver ? d.driverName : v.unitNumber} className="hover:bg-gray-50">
                      {isDriver ? (
                        <>
                          <td className="py-2.5 pr-4 font-semibold text-off-black text-sm">{d.driverName}</td>
                          <td className="py-2.5 pr-4 text-gray-600 text-xs">{d.driverCity || '—'}</td>
                          <td className="py-2.5 pr-4 text-gray-500 text-xs">{d.unitNumbers.length > 0 ? d.unitNumbers.slice(0, 3).join(', ') + (d.unitNumbers.length > 3 ? ` +${d.unitNumbers.length - 3}` : '') : '—'}</td>
                        </>
                      ) : (
                        <>
                          <td className="py-2.5 pr-4 font-mono font-semibold text-off-black text-xs">{v.unitNumber}</td>
                          <td className="py-2.5 pr-4 text-gray-600 text-xs">{v.driverCity || '—'}</td>
                        </>
                      )}
                      <td className="py-2.5 px-4 text-right">
                        <span className="font-bold text-green-600">{fmtGallons(item.capturableGallons)}</span>
                      </td>
                      <td className="py-2.5 px-4 text-gray-600 text-xs">{item.topCompetitorBrand}</td>
                      <td className="py-2.5 px-4 text-right font-medium">{fmtGallons(item.gallons)}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${item.ckSharePct >= 20 ? 'bg-green-100 text-green-700' : item.ckSharePct > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                          {fmtPct(item.ckSharePct)}
                        </span>
                      </td>
                      <td className="py-2.5 pl-4 text-right text-gray-500 text-xs">
                        {item.avgDaysBetweenFills > 0 ? `${item.avgDaysBetweenFills}d` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {topOpportunity.length > 15 && (
            <button onClick={() => setShowAll(v => !v)} className="mt-3 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 transition-colors">
              {showAll ? <><ChevronUp size={16} />Show fewer</> : <><ChevronDown size={16} />Show all {topOpportunity.length} {entityLabel}</>}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-6 text-center text-sm text-gray-500">
          No capturable {entityLabel} found — either all fueling is already at Circle K or {byDriver ? 'Driver Name' : 'Unit #'} data is not present in this file.
        </div>
      )}
    </div>
  )
}

// ─── Time Patterns ────────────────────────────────────────────────────────────

function TimePatternsTab({ summary }: { summary: import('@/lib/transaction-analysis').TransactionSummary }) {
  if (!summary.hasTimeData) {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
        <Clock size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="font-semibold text-gray-600 mb-1">No timestamp data found</p>
        <p className="text-sm text-gray-400">
          Time pattern analysis requires a transaction export that includes a time alongside the date
          (e.g. <span className="font-mono bg-gray-100 px-1 rounded">01/15/2024 14:32:00</span>).
          WEX and most Fuelman exports include this — check your export settings.
        </p>
      </div>
    )
  }

  const maxHourlyGal = Math.max(...summary.hourlyBreakdown.map(h => h.gallons), 1)
  const maxDOWGal    = Math.max(...summary.dayOfWeekBreakdown.map(d => d.gallons), 1)

  const hourLabel = (h: number) => {
    if (h === 0) return '12a'
    if (h < 12) return `${h}a`
    if (h === 12) return '12p'
    return `${h - 12}p`
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-bold text-off-black mb-1">Fueling by Hour of Day</h3>
        <p className="text-xs text-gray-400 mb-4">
          Total gallons per hour &nbsp;·&nbsp;
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-600 inline-block" /> Circle K</span>
          &nbsp;
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-zinc-400 inline-block" /> Competitor</span>
        </p>
        <div className="flex items-end gap-px" style={{ height: 120 }}>
          {summary.hourlyBreakdown.map(h => {
            const totalH = (h.gallons / maxHourlyGal) * 100
            const ckH    = h.gallons > 0 ? (h.ckGallons / h.gallons) * totalH : 0
            const compH  = totalH - ckH
            return (
              <div key={h.hour} className="flex-1 flex flex-col justify-end group relative" style={{ height: '100%' }}>
                <div className="w-full flex flex-col justify-end" style={{ height: `${totalH}%` }}>
                  <div className="w-full bg-zinc-400 rounded-t-sm" style={{ height: `${compH > 0 ? (compH / totalH) * 100 : 0}%` }} />
                  <div className="w-full bg-green-600" style={{ height: `${ckH > 0 ? (ckH / totalH) * 100 : 0}%` }} />
                </div>
                {h.gallons > 0 && (
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-1.5 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                    {hourLabel(h.hour)}: {fmtGallons(h.gallons)} gal
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex mt-1" style={{ gap: 0 }}>
          {summary.hourlyBreakdown.map(h => (
            <div key={h.hour} className="flex-1 text-center" style={{ fontSize: 9, color: '#9ca3af' }}>
              {h.hour % 3 === 0 ? hourLabel(h.hour) : ''}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-bold text-off-black mb-1">Fueling by Day of Week</h3>
        <p className="text-xs text-gray-400 mb-4">Total gallons per day</p>
        <div className="space-y-2">
          {summary.dayOfWeekBreakdown.map(d => {
            const pct     = (d.gallons / maxDOWGal) * 100
            const ckPct   = d.gallons > 0 ? (d.ckGallons / maxDOWGal) * 100 : 0
            const compPct = pct - ckPct
            return (
              <div key={d.day} className="flex items-center gap-3">
                <span className="w-8 text-xs font-medium text-gray-600 shrink-0">{d.dayName.slice(0, 3)}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-green-600 rounded-l-full" style={{ width: `${ckPct}%` }} />
                  <div className="h-full bg-zinc-400" style={{ width: `${compPct}%` }} />
                </div>
                <span className="w-24 text-right text-xs font-semibold text-off-black shrink-0">{fmtGallons(d.gallons)} gal</span>
                <span className="w-16 text-right text-xs text-gray-400 shrink-0">{d.transactions.toLocaleString()} trans</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Fraud Flags ──────────────────────────────────────────────────────────────

const FRAUD_TYPE_LABELS: Record<FraudFlag['type'], string> = {
  'high-gallons': 'High Gallons',
  'multi-fill':   'Multi-Fill Day',
  'ppg-outlier':  'PPG Outlier',
  'state-hop':    'State Hop',
}

function FraudFlagsTab({ flags }: { flags: FraudFlag[] }) {
  const high   = flags.filter(f => f.severity === 'high')
  const medium = flags.filter(f => f.severity === 'medium')

  if (flags.length === 0) {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 p-8 text-center">
        <CheckCircle size={32} className="mx-auto text-green-500 mb-3" />
        <p className="font-semibold text-gray-700 mb-1">No anomalies detected</p>
        <p className="text-sm text-gray-500">No high-gallon fills, multi-fill days, PPG outliers, or state hops found in this data.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-bold text-off-black mb-1">Anomaly Summary</h3>
        <p className="text-xs text-gray-400 mb-4">
          These patterns may warrant review. They do not confirm fraud — mismatched data, multi-axle tanks, and multi-stop routes can trigger some flags.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            { label: 'High Gallons',   count: flags.filter(f => f.type === 'high-gallons').length, color: 'text-red-600',    bg: 'bg-red-50 border-red-200',       desc: 'Single fill > 200 gal' },
            { label: 'Multi-Fill Day', count: flags.filter(f => f.type === 'multi-fill').length,   color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', desc: '3+ fills same vehicle/day' },
            { label: 'PPG Outlier',    count: flags.filter(f => f.type === 'ppg-outlier').length,  color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', desc: 'Price > 2.5× fleet median' },
            { label: 'State Hop',      count: flags.filter(f => f.type === 'state-hop').length,    color: 'text-red-600',    bg: 'bg-red-50 border-red-200',       desc: '2+ states same vehicle/day' },
          ] as const).map(item => (
            <div key={item.label} className={`rounded-xl border p-4 ${item.bg}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{item.label}</p>
              <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-bold text-off-black mb-3">Flagged Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {['Severity', 'Type', 'Unit #', 'Date', 'Description', 'Gallons', 'Location'].map(h => (
                  <th key={h} className={`py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 ${['Severity','Type','Unit #','Date','Description'].includes(h) ? 'text-left pr-4' : 'text-right px-4'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {flags.map((f, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="py-2.5 pr-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${f.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {f.severity.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-gray-600">{FRAUD_TYPE_LABELS[f.type]}</td>
                  <td className="py-2.5 pr-4 font-mono font-semibold text-off-black text-xs">{f.unitNumber}</td>
                  <td className="py-2.5 pr-4 text-gray-500 text-xs whitespace-nowrap">{f.transDate}</td>
                  <td className="py-2.5 pr-4 text-gray-700 text-xs max-w-[220px]">{f.description}</td>
                  <td className="py-2.5 px-4 text-right font-medium">{fmtGallons(f.gallons)}</td>
                  <td className="py-2.5 pl-4 text-right text-gray-500 text-xs whitespace-nowrap">
                    {f.stationCity}{f.stationState ? `, ${f.stationState}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {high.length > 0 && (
          <p className="mt-3 text-xs text-red-600 font-medium">
            {high.length} high-severity flag{high.length !== 1 ? 's' : ''} · {medium.length} medium
          </p>
        )}
      </div>
    </div>
  )
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
      fetch('/api/stores-data').then(r => r.json()).then((data) => {
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
      const resp = await fetch('/api/stores-data')
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

      const uniqueAddresses = Array.from(
        new Set(
          transactions
            .filter(t => t.stationAddress && t.stationCity && t.stationState)
            .map(t => addrGeoKey(t.stationAddress, t.stationCity, t.stationState))
        )
      ).map(k => {
        const parts = k.split('|')
        const state = parts[parts.length - 1]
        const city  = parts[parts.length - 2]
        const address = parts.slice(0, parts.length - 2).join('|')
        return { address, city, state }
      })

      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!token) throw new Error('Mapbox token not configured.')

      const totalGeoItems = uniqueLocations.length + uniqueAddresses.length
      setGeocodingProgress({ done: 0, total: totalGeoItems })
      let geoDone = 0

      const geocodedCoords = await geocodeLocations(uniqueLocations, token, (done) => {
        geoDone = done
        setGeocodingProgress({ done: geoDone, total: totalGeoItems })
      })

      let geocodedAddrs = new Map<string, { lat: number; lng: number }>()
      if (uniqueAddresses.length > 0) {
        geocodedAddrs = await geocodeAddresses(
          uniqueAddresses,
          token,
          (done) => setGeocodingProgress({ done: geoDone + done, total: totalGeoItems })
        )
      }

      // 5. Re-analyze with geocoding
      const enriched = analyzeTransactions(transactions, truckZipSet, {
        detectedFormat,
        geocodedCoords,
        geocodedAddresses: geocodedAddrs,
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
      <div className="min-h-screen bg-off-white" style={{ backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)', backgroundSize: '28px 28px', backgroundAttachment: 'fixed' }}>
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 py-16">
          {/* Hero */}
          <div className="text-center mb-10 fade-in">
            <div className="inline-flex items-center gap-2 bg-white text-zinc-700 text-xs font-bold px-3 py-1.5 rounded-full mb-5 shadow-sm border border-zinc-200">
              <Truck size={13} className="float" />
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

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 slide-up-card">
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
            <div className="mt-5 grid grid-cols-3 gap-3 text-center text-xs text-gray-500 stagger-children">
              <div className="flex flex-col items-center gap-1.5 p-3 bg-white rounded-lg border border-zinc-100 shadow-sm">
                <Navigation size={15} className="text-brand-orange" />
                <span>39 Interstate Corridors</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 p-3 bg-white rounded-lg border border-zinc-100 shadow-sm">
                <Truck size={15} className="text-brand-orange" />
                <span>Truck-Accessible CK Only</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 p-3 bg-white rounded-lg border border-zinc-100 shadow-sm">
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
  const totalOpp = otrResult.corridorResults.reduce((s, r) => s + r.captureGallons, 0) + (otrResult.offCorridorCaptureGallons ?? 0)
  const totalCK = otrResult.corridorResults.reduce((s, r) => s + r.ckGallons, 0)
  const totalNearMiss = otrResult.corridorResults.reduce((s, r) => s + r.nearMissGallons, 0) + (otrResult.offCorridorNearMissGallons ?? 0)
  const annualOpp = months > 0 ? (totalOpp / months) * 12 : totalOpp
  const annualNearMiss = months > 0 ? (totalNearMiss / months) * 12 : totalNearMiss

  // ── Diesel fleet detection (Idea 3) ──────────────────────────────────────────
  const DIESEL_FLEET_THRESHOLD = 0.10
  const dieselGallons = summary.fuelTypeBreakdown
    .filter(ft => { const r = ft.type.toUpperCase().trim(); return r.includes('DIESEL') || r === 'DSL' || r === 'DSEL' })
    .reduce((s, ft) => s + ft.gallons, 0)
  const dieselPct = summary.totalGallons > 0 ? dieselGallons / summary.totalGallons : 0
  const isDieselFleet = dieselPct >= DIESEL_FLEET_THRESHOLD

  // ── Proximity-driven opportunity stats (Ideas 1 + 4) ─────────────────────────
  const proxTruck = summary.proximityBreakdown
  const proxAll   = summary.proximityBreakdownAll
  const proxTruckOpp = proxTruck
    ? proxTruck.within1mi.gallons + proxTruck.within2mi.gallons + proxTruck.within5mi.gallons + proxTruck.within10mi.gallons
    : null
  const proxAllOpp = proxAll
    ? proxAll.within1mi.gallons + proxAll.within2mi.gallons + proxAll.within5mi.gallons + proxAll.within10mi.gallons
    : null
  const proxCKTotal    = (proxTruck?.ckGallons ?? 0) + (proxAll?.ckGallons ?? 0)
  const totalProxOpp   = (proxTruckOpp ?? 0) + (proxAllOpp ?? 0)
  const monthlyProxOpp = months > 0 ? totalProxOpp / months : totalProxOpp
  const useProxHeader  = proxTruckOpp !== null || proxAllOpp !== null

  // Tiered monthly opportunity at each distance threshold
  const mo = (n: number) => months > 0 ? n / months : n
  const oppAt1mi  = mo((proxTruck?.within1mi.gallons ?? 0) + (proxAll?.within1mi.gallons ?? 0))
  const oppAt2mi  = mo((proxTruck?.within1mi.gallons ?? 0) + (proxTruck?.within2mi.gallons ?? 0) + (proxAll?.within1mi.gallons ?? 0) + (proxAll?.within2mi.gallons ?? 0))
  const oppAt5mi  = mo((proxTruck?.within1mi.gallons ?? 0) + (proxTruck?.within2mi.gallons ?? 0) + (proxTruck?.within5mi.gallons ?? 0) + (proxAll?.within1mi.gallons ?? 0) + (proxAll?.within2mi.gallons ?? 0) + (proxAll?.within5mi.gallons ?? 0))
  const oppAt10mi = monthlyProxOpp
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
            {(useProxHeader ? [
              {
                label: 'Total Gallons',
                value: fmtGallons(summary.totalGallons),
                sub: `${summary.totalTransactions.toLocaleString()} transactions`,
                accent: false,
                warn: false,
              },
              {
                label: 'Currently at CK',
                value: fmtGallons(proxCKTotal),
                sub: fmtPct(proxCKTotal / (summary.totalGallons || 1) * 100) + ' of total',
                accent: false,
                warn: false,
              },
              ...(proxTruckOpp !== null ? [{
                label: 'Diesel Opportunity',
                value: fmtGallons(proxTruckOpp),
                sub: `≤10mi of truck CK · ${fmtPct(dieselPct * 100)} diesel fleet`,
                accent: false,
                warn: false,
              }] : []),
              ...(proxAllOpp !== null ? [{
                label: 'Gas Opportunity',
                value: fmtGallons(proxAllOpp),
                sub: '≤10mi of any CK',
                accent: false,
                warn: false,
              }] : []),
              {
                label: 'Monthly Opportunity',
                value: '',
                sub: months !== 12 ? `from ${months.toFixed(1)} mo` : 'proximity-based',
                accent: true,
                warn: false,
                tiers: [
                  { dist: '≤1mi',  gal: oppAt1mi  },
                  { dist: '≤2mi',  gal: oppAt2mi  },
                  { dist: '≤5mi',  gal: oppAt5mi  },
                  { dist: '≤10mi', gal: oppAt10mi },
                ],
              },
            ] : [
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
            ]).map(({ label, value, sub, accent, warn, ...rest }) => {
              const tiers = (rest as { tiers?: { dist: string; gal: number }[] }).tiers
              return (
                <div
                  key={label}
                  className={`px-5 py-4 ${accent ? 'bg-accent' : warn ? 'bg-amber-50' : 'bg-white'}`}
                >
                  <p className={`text-xs font-medium uppercase tracking-wider mb-1.5 ${accent ? 'text-white/70' : warn ? 'text-amber-600' : 'text-zinc-400'}`}>
                    {label}
                  </p>
                  {tiers ? (
                    <div className="space-y-1.5 mt-1">
                      {tiers.map(({ dist, gal }) => (
                        <div key={dist} className="flex items-baseline justify-between gap-2">
                          <span className="text-xs text-white/60 w-10 shrink-0">{dist}</span>
                          <span className="text-sm font-bold text-white tabular-nums">{fmtGallons(gal)}<span className="text-xs font-normal text-white/50 ml-1">gal/mo</span></span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={`text-2xl font-bold leading-none ${accent ? 'text-white' : warn ? 'text-amber-700' : 'text-zinc-900'}`}>
                      {value}
                    </p>
                  )}
                  <p className={`text-xs mt-1.5 ${accent ? 'text-white/60' : warn ? 'text-amber-500' : 'text-zinc-400'}`}>{sub}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Route Coverage & Gaps map — only shown for diesel-heavy fleets */}
        {isDieselFleet && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden mb-6 fade-in">
            <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-zinc-900 font-bold text-lg">Route Coverage &amp; Gaps</h2>
                <p className="text-zinc-500 text-sm mt-0.5">
                  Where on the interstate network this fleet is fueling — orange = corridor activity · gap = no truck CK within 30mi
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
        )}

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

        {/* Corridor table — only for diesel fleets */}
        {isDieselFleet && <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm mb-6 fade-in">
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
                {(otrResult.offCorridorCaptureGallons ?? 0) > 0 && (
                  <> Of those, {fmtGallons(otrResult.offCorridorCaptureGallons)} are within {30} mi of a truck CK and included in the opportunity total.</>
                )}
              </p>
            )}
          </div>
        </div>}

        {/* Near-Miss Spotlight */}
        {isDieselFleet && totalNearMiss > 0 && (() => {
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
                        subtitle="UNL & Premium · full CK network"
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

        {/* Driver & Vehicle Insights */}
        {(summary.vehicleBreakdown.length > 0 || summary.hasDriverData) && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm mb-6 fade-in">
            <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-zinc-900 font-bold text-lg">Driver &amp; Vehicle Insights</h2>
                <p className="text-zinc-500 text-sm mt-0.5">
                  CK loyalty segments · top opportunity {summary.hasDriverData ? 'drivers' : 'vehicles'}
                </p>
              </div>
              <Users className="text-zinc-400 shrink-0" size={22} />
            </div>
            <div className="p-6">
              <BehavioralInsightsTab summary={summary} />
            </div>
          </div>
        )}

        {/* Time Patterns */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm mb-6 fade-in">
          <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-zinc-900 font-bold text-lg">Time Patterns</h2>
              <p className="text-zinc-500 text-sm mt-0.5">Hourly and day-of-week fueling distribution</p>
            </div>
            <Clock className="text-zinc-400 shrink-0" size={22} />
          </div>
          <div className="p-6">
            <TimePatternsTab summary={summary} />
          </div>
        </div>

        {/* Fraud Flags */}
        {summary.fraudFlags.length > 0 && (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm mb-6 fade-in">
            <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-zinc-900 font-bold text-lg flex items-center gap-2">
                  <ShieldAlert size={18} className="text-red-500" />
                  Fraud &amp; Anomaly Flags
                </h2>
                <p className="text-zinc-500 text-sm mt-0.5">
                  {summary.fraudFlags.length} flagged transaction{summary.fraudFlags.length !== 1 ? 's' : ''} — review recommended
                </p>
              </div>
              <span className="text-xs font-bold text-red-600 bg-red-100 rounded-full px-2.5 py-1">
                {summary.fraudFlags.filter(f => f.severity === 'high').length} HIGH
              </span>
            </div>
            <div className="p-6">
              <FraudFlagsTab flags={summary.fraudFlags} />
            </div>
          </div>
        )}

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
