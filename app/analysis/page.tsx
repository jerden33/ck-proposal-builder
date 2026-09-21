'use client'

import { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import * as XLSX from 'xlsx'
import { useSearchParams } from 'next/navigation'
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
  Settings2,
  Users,
  Clock,
  ShieldAlert,
  Zap,
  Save,
  BookOpen,
  Share2,
  ClipboardCopy,
  Truck,
} from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { ShareModal } from '@/components/ShareModal'
import { parseFleetCSV, type CustomerLocationInput } from '@/lib/transaction-parser'
import { createAnalysis, getAnalysis, getAppSettings } from '@/lib/supabase/queries'
import {
  analyzeTransactions,
  buildCKZipSet,
  nearestCKDistance,
  attachNearestCKToCustomerLocations,
  fmtGallons,
  fmtDollars,
  fmtPct,
  fmtMiles,
  type TransactionSummary,
  type BrandSummary,
  type CitySummary,
  type CKStoreCoord,
  type CustomerLocation,
} from '@/lib/transaction-analysis'
import { geocodeLocations, geocodeAddresses, geoKey, addrGeoKey } from '@/lib/geocoding'
import { runOTRAnalysis } from '@/lib/otr-analysis'
import type { CKStorePin } from '@/components/FuelingMap'
import { TopCKLocationsCard } from '@/components/analysis/TopCKLocationsCard'
import { CustomerLocationProximityPanel } from '@/components/analysis/CustomerLocationProximityPanel'
import { OpportunityPanel } from '@/components/analysis/OpportunityPanel'
import { DetailedProximityPanel } from '@/components/analysis/ProximityPanel'
import { SavingsCalculatorPanel } from '@/components/analysis/SavingsCalculatorPanel'
import { OTRAnalysisPanel } from '@/components/analysis/OTRAnalysisPanel'
import { AnnualizedPanel } from '@/components/analysis/AnnualizedPanel'
import { VehiclesTab } from '@/components/analysis/VehiclesTab'
import { BehavioralInsightsTab } from '@/components/analysis/BehavioralInsightsTab'
import { TimePatternsTab } from '@/components/analysis/TimePatternsTab'
import { FraudFlagsTab } from '@/components/analysis/FraudFlagsTab'
import { CustomerLocationsInput } from '@/components/analysis/CustomerLocationsInput'

// Dynamically import the maps (Mapbox can't SSR)
const FuelingMap = dynamic(() => import('@/components/FuelingMap').then(m => m.FuelingMap), {
  ssr: false,
  loading: () => <div className="bg-gray-100 rounded-xl animate-pulse" style={{ height: 520 }} />,
})
const OTRMap = dynamic(() => import('@/components/OTRMap').then(m => m.OTRMap), {
  ssr: false,
  loading: () => <div className="bg-gray-100 rounded-xl animate-pulse" style={{ height: 580 }} />,
})

// ─── CK store shape from stores-data.json ─────────────────────────────────────

interface StoreRecord {
  zip: string
  coordinates: { lat: number; lng: number }
  name: string
  city: string
  state: string
  truckAccessible: boolean
  siteNumber?: string
}

// ─── Feature flags ─────────────────────────────────────────────────────────────

type FeatureKey =
  | 'brandBreakdown'
  | 'geographic'
  | 'competitorLocations'
  | 'vehicles'
  | 'mapView'
  | 'fuelTypeSplit'
  | 'savingsCalc'
  | 'annualized'
  | 'behavioralInsights'
  | 'timeOfDay'
  | 'fraudFlags'
  | 'otrCorridors'   // auto-enabled when OTR corridor data is detected
  | 'skipGeocoding'  // processing option — skips API calls, disables map/proximity

type FeatureFlags = Record<FeatureKey, boolean>

const DEFAULT_FEATURES: FeatureFlags = {
  brandBreakdown: true,
  geographic: true,
  competitorLocations: true,
  vehicles: true,
  mapView: true,
  fuelTypeSplit: true,
  savingsCalc: true,
  annualized: true,
  behavioralInsights: true,
  timeOfDay: true,
  fraudFlags: true,
  otrCorridors: false,
  skipGeocoding: false,
}

interface FeatureDef {
  key: FeatureKey
  label: string
  desc: string
}

// Display modules shown in both the upload selector and results toggle bar
const FEATURE_DEFS: FeatureDef[] = [
  { key: 'brandBreakdown',      label: 'Brand Breakdown',        desc: 'Gallons by network & brand' },
  { key: 'geographic',          label: 'Geographic',             desc: 'State-level fueling & CK share' },
  { key: 'competitorLocations', label: 'Competitor Locations',   desc: 'Top non-CK stations ranked by gallons' },
  { key: 'vehicles',            label: 'Vehicle Breakdown',      desc: 'Per-unit stats (needs Unit # column)' },
  { key: 'mapView',             label: 'Map View',               desc: 'Interactive fueling location map' },
  { key: 'fuelTypeSplit',       label: 'Fuel Type Split',        desc: 'Diesel vs. unleaded breakdown' },
  { key: 'savingsCalc',         label: 'Savings Calculator',     desc: 'Estimated $ opportunity with a CK rebate' },
  { key: 'annualized',          label: 'Annualized View',        desc: 'Monthly & yearly projections from data window' },
  { key: 'behavioralInsights',  label: 'Behavioral Insights',    desc: 'Vehicle segments, top opportunity units & fill frequency' },
  { key: 'timeOfDay',           label: 'Time Patterns',          desc: 'Hourly & day-of-week fueling (needs timestamp data)' },
  { key: 'fraudFlags',          label: 'Transaction Flags',      desc: 'High-gallon fills, multi-fill days, PPG outliers & state hops' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute approximate months spanned by the formatted date strings (e.g. "Jan 1, 2024") */
function computeMonthSpan(dateRange: { start: string; end: string }): number {
  if (!dateRange.start || !dateRange.end) return 1
  const start = new Date(dateRange.start)
  const end   = new Date(dateRange.end)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1
  const months = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  return Math.max(months, 0.5) // at least half a month to avoid divide-by-zero
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-1.5 leading-tight">{sub}</p>}
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

// ─── Feature Selector (upload screen) ────────────────────────────────────────

function FeatureSelector({
  flags,
  onChange,
}: {
  flags: FeatureFlags
  onChange: (key: FeatureKey, val: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 size={14} className="text-gray-400" />
          Advanced options
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
          {/* Analysis modules */}
          <div className="pt-3">
            <p className="text-xs text-gray-400 mb-3">Choose what to include. You can also toggle these after upload.</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {FEATURE_DEFS.map(def => (
                <label key={def.key} className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={flags[def.key]}
                    onChange={e => onChange(def.key, e.target.checked)}
                    className="accent-[#0EA5E9] w-4 h-4 mt-0.5 shrink-0"
                  />
                  <div>
                    <span className="text-sm font-medium text-off-black group-hover:text-zinc-700 transition-colors">
                      {def.label}
                    </span>
                    <p className="text-xs text-gray-400 leading-tight mt-0.5">{def.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {/* Processing option */}
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-gray-500" />
              <p className="text-sm font-semibold text-off-black">Processing Options</p>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={flags.skipGeocoding}
                onChange={e => onChange('skipGeocoding', e.target.checked)}
                className="accent-[#0EA5E9] w-4 h-4 mt-0.5 shrink-0"
              />
              <div>
                <span className="text-sm font-medium text-off-black group-hover:text-zinc-700 transition-colors">
                  Quick Analysis (skip geocoding)
                </span>
                <p className="text-xs text-gray-400 leading-tight mt-0.5">
                  Faster load, no Mapbox API calls. Disables map pins and proximity analysis.
                </p>
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Feature Toggle Bar (results screen) ─────────────────────────────────────

function FeatureToggleBar({
  flags,
  onChange,
}: {
  flags: FeatureFlags
  onChange: (key: FeatureKey, val: boolean) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 size={13} className="text-gray-400 shrink-0" />
          <span className="text-xs font-medium text-gray-500">
            {FEATURE_DEFS.filter(d => !flags[d.key]).length > 0
              ? `${FEATURE_DEFS.filter(d => !flags[d.key]).length} section${FEATURE_DEFS.filter(d => !flags[d.key]).length > 1 ? 's' : ''} hidden`
              : 'All sections visible'}
          </span>
        </div>
        <button
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-label="Customize visible sections"
          className="text-xs text-zinc-500 hover:text-zinc-800 flex items-center gap-1 font-medium transition-colors border border-zinc-200 rounded-lg px-2.5 py-1.5 hover:border-zinc-300"
        >
          {open ? <><ChevronUp size={13} />Done</> : <><Settings2 size={13} />Customize view</>}
        </button>
      </div>

      {/* Popover panel */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-20 bg-white rounded-xl border border-gray-200 shadow-lg p-5">
          <p className="text-xs text-gray-400 mb-4">Toggle sections on or off. Changes take effect immediately.</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            {FEATURE_DEFS.map(def => (
              <label key={def.key} className="flex items-center justify-between gap-3 cursor-pointer group">
                <div>
                  <p className="text-sm font-medium text-off-black group-hover:text-zinc-700 transition-colors">{def.label}</p>
                  <p className="text-xs text-gray-400 leading-tight mt-0.5">{def.desc}</p>
                </div>
                {/* Styled toggle switch */}
                <button
                  role="switch"
                  aria-checked={flags[def.key]}
                  aria-label={`Toggle ${def.label}`}
                  onClick={() => onChange(def.key, !flags[def.key])}
                  className={`relative shrink-0 w-9 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                    flags[def.key] ? 'bg-accent' : 'bg-gray-200'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    flags[def.key] ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </label>
            ))}
          </div>
          {/* Quick Analysis toggle */}
          <div className="border-t border-gray-100 mt-4 pt-4">
            <label className="flex items-center justify-between gap-3 cursor-pointer group">
              <div>
                <div className="flex items-center gap-1.5">
                  <Zap size={13} className="text-gray-400" />
                  <p className="text-sm font-medium text-off-black">Quick Analysis (skip geocoding)</p>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">Disables map pins and proximity analysis. Faster for quick reviews.</p>
              </div>
              <button
                role="switch"
                aria-checked={flags.skipGeocoding}
                aria-label="Toggle quick analysis mode"
                onClick={() => onChange('skipGeocoding', !flags.skipGeocoding)}
                className={`relative shrink-0 w-9 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                  flags.skipGeocoding ? 'bg-accent' : 'bg-gray-200'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  flags.skipGeocoding ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Summary text generator ───────────────────────────────────────────────────

function buildAnalysisSummary(
  summary: TransactionSummary,
  customerName: string,
  months: number
): string {
  const { captureRate, capturable, captured } = summary.ckCaptureAnalysis
  const subj = customerName || 'This fleet'
  const annualCapturable = months > 0 ? (capturable.gallons / months) * 12 : capturable.gallons
  const annualSavings = annualCapturable * 0.03

  const dateRange = summary.dateRange.end && summary.dateRange.end !== summary.dateRange.start
    ? `${summary.dateRange.start} – ${summary.dateRange.end}`
    : summary.dateRange.start

  const parts: string[] = []

  // Fleet overview
  const vehicleStr = summary.uniqueVehicles > 0 ? ` across ${summary.uniqueVehicles.toLocaleString()} vehicles` : ''
  const stateStr   = summary.uniqueStates.length > 0 ? ` in ${summary.uniqueStates.length} state${summary.uniqueStates.length !== 1 ? 's' : ''}` : ''
  parts.push(
    `${subj} ran ${summary.totalTransactions.toLocaleString()} transactions (${dateRange})${vehicleStr}${stateStr} — ${fmtGallons(summary.totalGallons)} and ${fmtDollars(summary.totalSpend)} in total spend.`
  )

  // CK share
  if (captureRate > 0) {
    parts.push(
      `${fmtPct(captureRate)} of that volume went through Circle K (${fmtGallons(captured.gallons)} gal, ${captured.transactions.toLocaleString()} fills).`
    )
  } else {
    parts.push('None of the volume in this dataset went through Circle K locations.')
  }

  // Capturable opportunity
  if (capturable.gallons > 0) {
    const annualNote = months < 11 ? `, or roughly ${fmtGallons(annualCapturable)} annualized` : ''
    parts.push(
      `Another ${fmtGallons(capturable.gallons)}${annualNote} went to other stations in areas where a CK already exists — at 3¢/gal that's about ${fmtDollars(annualSavings)}/year.`
    )
  }

  return parts.join(' ')
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'brands' | 'geographic' | 'locations' | 'vehicles' | 'map' | 'insights' | 'timing' | 'fraud' | 'otr'

const TAB_FEATURE_MAP: Record<Tab, FeatureKey> = {
  brands:    'brandBreakdown',
  geographic:'geographic',
  locations: 'competitorLocations',
  vehicles:  'vehicles',
  map:       'mapView',
  insights:  'behavioralInsights',
  timing:    'timeOfDay',
  fraud:     'fraudFlags',
  otr:       'otrCorridors',
}

const ALL_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'map',       label: 'Map View',                 icon: <MapPin size={16} /> },
  { id: 'vehicles',  label: 'Vehicles',                 icon: <Car size={16} /> },
  { id: 'geographic',label: 'Geographic',               icon: <MapPin size={16} /> },
  { id: 'brands',    label: 'Brand Breakdown',          icon: <BarChart2 size={16} /> },
  { id: 'locations', label: 'Top Competitor Locations', icon: <Fuel size={16} /> },
  { id: 'insights',  label: 'Behavioral Insights',      icon: <Users size={16} /> },
  { id: 'timing',    label: 'Time Patterns',            icon: <Clock size={16} /> },
  { id: 'fraud',     label: 'Transaction Flags',        icon: <ShieldAlert size={16} /> },
  { id: 'otr',       label: 'OTR Corridors',            icon: <Truck size={16} /> },
]

function AnalysisPageInner() {
  const searchParams = useSearchParams()
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [geocodingInProgress, setGeocodingInProgress] = useState(false)
  const [geocodingProgress, setGeocodingProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [fileName, setFileName] = useState('')
  const [detectedFormat, setDetectedFormat] = useState('')
  const [isMobileFueling, setIsMobileFueling] = useState(false)
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [ckStorePins, setCKStorePins] = useState<CKStorePin[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('map')
  const [showAllBrands, setShowAllBrands] = useState(false)
  const [showAllVehicles, setShowAllVehicles] = useState(false)
  const [restoredFromCache, setRestoredFromCache] = useState(false)
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(DEFAULT_FEATURES)
  const [savedAnalysisId, setSavedAnalysisId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [manualMonthSpan, setManualMonthSpan] = useState<number | null>(null)
  const [editingPeriod, setEditingPeriod] = useState(false)
  const [periodInputVal, setPeriodInputVal] = useState('')
  const [summaryCopied, setSummaryCopied] = useState(false)
  const [rebateRate, setRebateRate] = useState(3)
  const [geoView, setGeoView] = useState<'state' | 'city'>('state')
  const [geoStateFilter, setGeoStateFilter] = useState('all')
  const [captureRadius, setCaptureRadius] = useState(10)
  const [fleetType, setFleetType] = useState<'auto' | 'truck' | 'mixed'>('auto')
  const [customerLocationInputs, setCustomerLocationInputs] = useState<CustomerLocationInput[]>([])
  const [adminLoyalThreshold, setAdminLoyalThreshold]     = useState(70)
  const [adminMixedThreshold, setAdminMixedThreshold]     = useState(20)
  const [adminOTRDieselThreshold, setAdminOTRDieselThreshold] = useState(60)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const geocodingStartRef = useRef<number | null>(null)
  // Always-current refs so processFile can read values without stale closure
  const featureFlagsRef = useRef<FeatureFlags>(DEFAULT_FEATURES)
  useEffect(() => { featureFlagsRef.current = featureFlags }, [featureFlags])
  const captureRadiusRef = useRef(10)
  useEffect(() => { captureRadiusRef.current = captureRadius }, [captureRadius])
  const fleetTypeRef = useRef<'auto' | 'truck' | 'mixed'>('auto')
  useEffect(() => { fleetTypeRef.current = fleetType }, [fleetType])
  const customerLocationInputsRef = useRef<CustomerLocationInput[]>([])
  useEffect(() => { customerLocationInputsRef.current = customerLocationInputs }, [customerLocationInputs])
  const adminLoyalThresholdRef = useRef(70)
  useEffect(() => { adminLoyalThresholdRef.current = adminLoyalThreshold }, [adminLoyalThreshold])
  const adminMixedThresholdRef = useRef(20)
  useEffect(() => { adminMixedThresholdRef.current = adminMixedThreshold }, [adminMixedThreshold])
  const adminOTRDieselThresholdRef = useRef(60)
  useEffect(() => { adminOTRDieselThresholdRef.current = adminOTRDieselThreshold }, [adminOTRDieselThreshold])

  const toggleFeature = useCallback((key: FeatureKey, val: boolean) => {
    setFeatureFlags(prev => ({ ...prev, [key]: val }))
  }, [])

  // Load admin-configured defaults on mount
  useEffect(() => {
    getAppSettings().then(settings => {
      const get = (key: string, fallback: number) => {
        const v = settings.find(s => s.key === key)?.value
        return v !== undefined ? parseFloat(v) : fallback
      }
      setCaptureRadius(get('capture_radius', 10))
      setRebateRate(get('default_rebate_cents', 3))
      setAdminLoyalThreshold(get('loyal_threshold', 70))
      setAdminMixedThreshold(get('mixed_threshold', 20))
      setAdminOTRDieselThreshold(get('otr_diesel_threshold', 60))
    }).catch(() => {})
  }, [])

  // Restore last analysis from localStorage on mount (skip if ?new=1 — user wants fresh upload)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      try { localStorage.removeItem('ck-analysis-v1') } catch { /* ignore */ }
      window.history.replaceState(null, '', '/analysis')
      return
    }
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
      if (saved.featureFlags) setFeatureFlags({ ...DEFAULT_FEATURES, ...saved.featureFlags })
      if (saved.summary?.rebateRate) setRebateRate(saved.summary.rebateRate)
      setRestoredFromCache(true)
      // Re-load CK pins from static data
      fetch('/api/stores-data')
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

  // Load a saved analysis from DB when ?load=<id> is in the URL
  useEffect(() => {
    const loadId = searchParams.get('load')
    if (!loadId) return
    setLoading(true)
    setLoadingStep('Loading saved analysis…')
    getAnalysis(loadId).then(record => {
      if (!record) {
        setError('Saved analysis not found.')
        setLoading(false)
        return
      }
      const loadedData = record.data as TransactionSummary
      setSummary(loadedData)
      if (loadedData.rebateRate) setRebateRate(loadedData.rebateRate)
      setCustomerName(record.account_name)
      setFileName(record.file_name)
      setDetectedFormat(record.detected_format)
      setSavedAnalysisId(record.id)
      if (loadedData.otrAnalysis?.corridorResults?.length) {
        setFeatureFlags(prev => ({ ...prev, otrCorridors: true }))
      }
      setLoading(false)
      // Load CK pins for map
      fetch('/api/stores-data')
        .then(r => r.json())
        .then((data) => {
          const pins: CKStorePin[] = (data.stores ?? [])
            .filter((s: StoreRecord) => s.coordinates?.lat && s.coordinates?.lng)
            .map((s: StoreRecord) => ({
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
    }).catch(() => {
      setError('Failed to load saved analysis.')
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save feature flags to cache whenever they change (after initial load)
  useEffect(() => {
    if (!summary) return
    try {
      const raw = localStorage.getItem('ck-analysis-v1')
      if (!raw) return
      const saved = JSON.parse(raw)
      localStorage.setItem('ck-analysis-v1', JSON.stringify({ ...saved, featureFlags }))
    } catch { /* ignore */ }
  }, [featureFlags, summary])

  // Auto-fix activeTab when its feature gets disabled
  useEffect(() => {
    if (!featureFlags[TAB_FEATURE_MAP[activeTab]]) {
      const fallback = ALL_TABS.find(t => featureFlags[TAB_FEATURE_MAP[t.id]])
      if (fallback) setActiveTab(fallback.id)
    }
  }, [featureFlags, activeTab])

  const handleSave = async () => {
    if (!summary) return
    setSaving(true)
    setSaveError(null)
    const hasOTR = !!(summary.otrAnalysis?.corridorResults?.length)
    const result = await createAnalysis(customerName, fileName, { ...summary, rebateRate, ...(hasOTR ? { analysisType: 'otr' } : {}) } as unknown as Record<string, unknown>)
    if (result) {
      setSavedAnalysisId(result.id)
      // Update browser URL so a refresh keeps it linked, without full navigation
      window.history.replaceState(null, '', `/analysis?load=${result.id}`)
    } else {
      setSaveError('Failed to save — are you logged in?')
    }
    setSaving(false)
  }

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
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        content = XLSX.utils.sheet_to_csv(sheet)
      } else {
        content = await file.text()
      }

      // 2. Parse
      setLoadingStep('Detecting format and parsing transactions…')
      const parseResult = parseFleetCSV(content)
      const { transactions, detectedFormat: fmt, missingRequiredFields, isMobileFueling: isMobile } = parseResult

      setDetectedFormat(fmt)
      setIsMobileFueling(isMobile)
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
      const resp = await fetch('/api/stores-data')
      const data = await resp.json()
      const storeRecords: StoreRecord[] = data.stores ?? []

      const ckZipSet = buildCKZipSet(storeRecords)
      const ckStoreCoords: CKStoreCoord[] = storeRecords
        .filter(s => s.coordinates?.lat && s.coordinates?.lng)
        .map(s => ({ lat: s.coordinates.lat, lng: s.coordinates.lng, name: s.name, city: s.city, state: s.state, truckAccessible: s.truckAccessible, siteNumber: s.siteNumber }))

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

      // 4. Initial analysis (ZIP-based)
      setLoadingStep('Running analysis…')
      const result = analyzeTransactions(transactions, ckZipSet, { detectedFormat: fmt })
      setRestoredFromCache(false)

      // 5. Skip geocoding — show results immediately
      if (featureFlagsRef.current.skipGeocoding) {
        setSummary(result)
        setFeatureFlags(prev => {
          try {
            localStorage.setItem('ck-analysis-v1', JSON.stringify({
              summary: result, fileName: file.name, customerName,
              detectedFormat: fmt, missingFields: missingRequiredFields, featureFlags: prev,
            }))
          } catch { /* storage full */ }
          return prev
        })
        setLoading(false)
        return
      }

      // 6. Geocoding — keep loading screen showing until complete
      const uniqueLocations = Array.from(
        new Set(transactions.map(t => geoKey(t.stationCity, t.stationState)))
      )
        .filter(k => k !== '|')
        .map(k => {
          const [city, state] = k.split('|')
          return { city, state }
        })

      const nonCKAddrKeys = new Set<string>()
      for (const t of transactions) {
        if (!t.isCircleK && t.stationAddress && t.stationCity && t.stationState) {
          nonCKAddrKeys.add(addrGeoKey(t.stationAddress, t.stationCity, t.stationState))
        }
      }
      const uniqueAddresses = Array.from(nonCKAddrKeys).map(k => {
        const parts = k.split('|')
        const state = parts[parts.length - 1]
        const city  = parts[parts.length - 2]
        const address = parts.slice(0, parts.length - 2).join('|')
        return { address, city, state }
      })

      if (uniqueLocations.length === 0 || !process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
        // No geocoding possible — show results
        setSummary(result)
        setLoading(false)
        return
      }

      setLoading(false)
      setGeocodingInProgress(true)
      geocodingStartRef.current = Date.now()
      const totalGeoItems = uniqueLocations.length + uniqueAddresses.length
      setGeocodingProgress({ done: 0, total: totalGeoItems })
      let geoDone = 0

      const geocodedCoords = await geocodeLocations(
        uniqueLocations,
        process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
        (done) => { geoDone = done; setGeocodingProgress({ done: geoDone, total: totalGeoItems }) }
      )

      const CK_MATCH_MILES = 0.1
      let geocodedAddrs = new Map<string, { lat: number; lng: number }>()
      if (uniqueAddresses.length > 0 && ckStoreCoords.length > 0) {
        geocodedAddrs = await geocodeAddresses(
          uniqueAddresses,
          process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
          (done) => setGeocodingProgress({ done: geoDone + done, total: totalGeoItems })
        )
        for (const t of transactions) {
          if (t.isCircleK || !t.stationAddress) continue
          const coord = geocodedAddrs.get(addrGeoKey(t.stationAddress, t.stationCity, t.stationState))
          if (!coord) continue
          const dist = nearestCKDistance(coord.lat, coord.lng, ckStoreCoords)
          if (dist >= 0 && dist <= CK_MATCH_MILES) t.isCircleK = true
        }
      }

      // Filter to truck-accessible stores for diesel proximity analysis
      const truckStoreCoords = ckStoreCoords.filter(s => s.truckAccessible)

      // Geocode customer-supplied facility locations (optional, entered at upload)
      const customerLocInputs = customerLocationInputsRef.current.filter(l => l.address && l.city)
      let customerLocations: CustomerLocation[] = []
      if (customerLocInputs.length > 0) {
        const geocodedCustomerAddrs = await geocodeAddresses(
          customerLocInputs.map(l => ({ address: l.address, city: l.city, state: l.state })),
          process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        )
        customerLocations = customerLocInputs.map(l => {
          const coord = geocodedCustomerAddrs.get(addrGeoKey(l.address, l.city, l.state))
          return { ...l, lat: coord?.lat, lng: coord?.lng }
        })
        customerLocations = attachNearestCKToCustomerLocations(customerLocations, ckStoreCoords, truckStoreCoords)
      }

      // Pass truck-only stores as ckStores so diesel proximity is measured against
      // truck-accessible CK only; ckStoresAll (full network) drives gas proximity.
      const enrichedResult = analyzeTransactions(transactions, ckZipSet, {
        detectedFormat: fmt,
        geocodedCoords,
        geocodedAddresses: geocodedAddrs,
        ckStores: truckStoreCoords,
        ckStoresAll: ckStoreCoords,
        captureRadiusMi: captureRadiusRef.current,
        loyalThreshold: adminLoyalThresholdRef.current,
        mixedThreshold: adminMixedThresholdRef.current,
        explicitTruckMode: fleetTypeRef.current === 'auto' ? undefined : fleetTypeRef.current === 'truck',
      })
      enrichedResult.customerLocations = customerLocations

      // Run OTR corridor analysis only for diesel-heavy fleets
      const inlineDieselGal = enrichedResult.fuelTypeBreakdown
        .filter(ft => {
          const r = ft.type.toUpperCase().trim()
          return r === 'DIESEL' || r === 'DEF' || r.includes('DIESEL') ||
            r === 'DSL' || r === 'DSEL' || r === 'ULSD' || r === 'HSD' || r === 'LSD' ||
            r.includes('REEFER') || r.includes('BIODIESEL')
        })
        .reduce((s, ft) => s + ft.gallons, 0)
      const inlineDieselPct = enrichedResult.totalGallons > 0
        ? (inlineDieselGal / enrichedResult.totalGallons) * 100 : 0
      const isOTRFleet = inlineDieselPct >= adminOTRDieselThresholdRef.current

      if (isOTRFleet && truckStoreCoords.length > 0 && enrichedResult.mapPoints.some(p => p.lat != null && p.lng != null)) {
        const otr = runOTRAnalysis(
          enrichedResult.mapPoints,
          truckStoreCoords.map(s => ({ lat: s.lat, lng: s.lng, truckAccessible: true }))
        )
        enrichedResult.otrAnalysis = otr
      }

      setSummary(enrichedResult)

      setFeatureFlags(prev => {
        const hasOTR = !!(enrichedResult.otrAnalysis?.corridorResults?.length)
        try {
          localStorage.setItem('ck-analysis-v1', JSON.stringify({
            summary: enrichedResult, fileName: file.name, customerName,
            detectedFormat: fmt, missingFields: missingRequiredFields, featureFlags: { ...prev, otrCorridors: hasOTR },
          }))
        } catch { /* storage full */ }
        return { ...prev, otrCorridors: hasOTR }
      })

      setGeocodingInProgress(false)
      setGeocodingProgress(null)
      // Auto-switch to Map View once geocoding completes — the map is now ready
      if (featureFlagsRef.current.mapView) setActiveTab('map')

    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : String(err)}`)
      setLoading(false)
      setGeocodingInProgress(false)
    }
  }, [customerName])

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
    setIsMobileFueling(false)
    setMissingFields([])
    setGeocodingInProgress(false)
    setGeocodingProgress(null)
    setCKStorePins([])
    setRestoredFromCache(false)
    setFeatureFlags(DEFAULT_FEATURES)
    setSavedAnalysisId(null)
    setSaveError(null)
    setManualMonthSpan(null)
    setEditingPeriod(false)
    setCustomerLocationInputs([])
    try { localStorage.removeItem('ck-analysis-v1') } catch { /* ignore */ }
    if (fileInputRef.current) fileInputRef.current.value = ''
    window.history.replaceState(null, '', '/analysis')
  }

  // Tabs filtered to only those whose feature is enabled
  const visibleTabs = ALL_TABS.filter(t => featureFlags[TAB_FEATURE_MAP[t.id]])

  // Months spanned by data (used by Savings Calc and Annualized panels).
  // manualMonthSpan overrides the date-detected value — used when transaction
  // dates are missing or placeholder (e.g. full-year data loaded as 1 month).
  const detectedMonthSpan = summary ? computeMonthSpan(summary.dateRange) : 1
  const monthSpan = manualMonthSpan ?? detectedMonthSpan

  // OTR / diesel detection — for banner and tab indicator.
  // After normalizeFuelType() runs at parse time, values are canonical ("DIESEL",
  // "GASOLINE", "DEF", etc.).  The raw-variant fallbacks cover legacy cached data.
  const dieselGallons = summary
    ? summary.fuelTypeBreakdown
        .filter(ft => {
          const r = ft.type.toUpperCase().trim()
          return (
            r === 'DIESEL' || r === 'DEF' ||
            // legacy raw variants (cached analyses pre-normalisation)
            r === 'D2' || r === 'D-2' || r === '#2' ||
            r.includes('DIESEL') || r === 'DSL' || r === 'DSEL' ||
            r === 'ULSD' || r === 'HSD' || r === 'LSD' ||
            r.includes('REEFER') || r.includes('BIODIESEL') ||
            r.startsWith('B20') || r.startsWith('B10') || r.startsWith('B5 ') || r.startsWith('B2 ') ||
            r.includes('DEF') || r.includes('EXHAUST') || r === 'UREA' || r === 'ADBLUE'
          )
        })
        .reduce((s, ft) => s + ft.gallons, 0)
    : 0

  // Gallons whose fuel type could not be classified as diesel or gas.
  // A high ratio signals a column-mapping or normalisation gap worth flagging.
  const unknownFuelGallons = summary
    ? summary.fuelTypeBreakdown
        .filter(ft => {
          const r = ft.type.toUpperCase().trim()
          const isKnownDiesel = r === 'DIESEL' || r === 'DEF' || r === 'D2' || r === 'D-2' ||
            r === '#2' || r.includes('DIESEL') || r === 'DSL' || r === 'DSEL' ||
            r === 'ULSD' || r === 'HSD' || r === 'LSD' || r.includes('REEFER') ||
            r.includes('BIODIESEL') || r.startsWith('B20') || r.startsWith('B10') ||
            r.startsWith('B5 ') || r.startsWith('B2 ') ||
            r.includes('DEF') || r.includes('EXHAUST') || r === 'UREA' || r === 'ADBLUE'
          const isKnownGas = r === 'GASOLINE' || r === 'GAS' || r.includes('UNL') ||
            r.includes('UNLEAD') || r === 'REG' || r === 'REGULAR' ||
            r.includes('PREMIUM') || r.includes('MIDGRADE') || r.includes('MID-GRADE') ||
            r === 'PRM' || r === 'PRML' || r === 'MID' || r === 'SUPER' || r === 'PLUS' ||
            r.startsWith('E85') || r === 'ETHANOL' || r.includes('FLEX FUEL') ||
            r.includes('LEADED') ||
            r.match(/^(87|89|91|93)(\s*OCT)?$/) !== null
          return !isKnownDiesel && !isKnownGas && r !== 'UNKNOWN' && r !== ''
        })
        .reduce((s, ft) => s + ft.gallons, 0)
    : 0
  const unknownFuelPct = summary && summary.totalGallons > 0
    ? (unknownFuelGallons / summary.totalGallons) * 100
    : 0
  // Show a warning when unclassified gallons exceed 5% — likely a column-mapping gap
  const showFuelTypeWarning = unknownFuelPct >= 5
  const dieselPct = summary && summary.totalGallons > 0 ? dieselGallons / summary.totalGallons : 0
  // Use explicit truckMode from summary (set at upload) if present; fall back to diesel % auto-detect
  const isDieselFleet = summary?.truckMode !== undefined ? summary.truckMode : dieselPct >= 0.10

  // Tiered proximity opportunity for OTR banner
  const proxTruck = summary?.proximityBreakdown ?? null
  const proxAll   = summary?.proximityBreakdownAll ?? null
  const mo = (n: number) => monthSpan > 0 ? n / monthSpan : n

  // Combined tiers (legacy — kept for fallback)
  const otrOppAt1mi  = mo((proxTruck?.within1mi.gallons ?? 0) + (proxAll?.within1mi.gallons ?? 0))
  const otrOppAt2mi  = mo((proxTruck?.within1mi.gallons ?? 0) + (proxTruck?.within2mi.gallons ?? 0) + (proxAll?.within1mi.gallons ?? 0) + (proxAll?.within2mi.gallons ?? 0))
  const otrOppAt5mi  = mo((proxTruck?.within1mi.gallons ?? 0) + (proxTruck?.within2mi.gallons ?? 0) + (proxTruck?.within5mi.gallons ?? 0) + (proxAll?.within1mi.gallons ?? 0) + (proxAll?.within2mi.gallons ?? 0) + (proxAll?.within5mi.gallons ?? 0))
  const otrOppAt10mi = mo((proxTruck?.within1mi.gallons ?? 0) + (proxTruck?.within2mi.gallons ?? 0) + (proxTruck?.within5mi.gallons ?? 0) + (proxTruck?.within10mi.gallons ?? 0) + (proxAll?.within1mi.gallons ?? 0) + (proxAll?.within2mi.gallons ?? 0) + (proxAll?.within5mi.gallons ?? 0) + (proxAll?.within10mi.gallons ?? 0))

  // Diesel-only monthly tiers (from proxTruck)
  const dieselAt1mi  = mo(proxTruck?.within1mi.gallons ?? 0)
  const dieselAt2mi  = mo((proxTruck?.within1mi.gallons ?? 0) + (proxTruck?.within2mi.gallons ?? 0))
  const dieselAt5mi  = mo((proxTruck?.within1mi.gallons ?? 0) + (proxTruck?.within2mi.gallons ?? 0) + (proxTruck?.within5mi.gallons ?? 0))
  const dieselAt10mi = mo((proxTruck?.within1mi.gallons ?? 0) + (proxTruck?.within2mi.gallons ?? 0) + (proxTruck?.within5mi.gallons ?? 0) + (proxTruck?.within10mi.gallons ?? 0))

  // Gas-only monthly tiers (from proxAll)
  const gasAt1mi  = mo(proxAll?.within1mi.gallons ?? 0)
  const gasAt2mi  = mo((proxAll?.within1mi.gallons ?? 0) + (proxAll?.within2mi.gallons ?? 0))
  const gasAt5mi  = mo((proxAll?.within1mi.gallons ?? 0) + (proxAll?.within2mi.gallons ?? 0) + (proxAll?.within5mi.gallons ?? 0))
  const gasAt10mi = mo((proxAll?.within1mi.gallons ?? 0) + (proxAll?.within2mi.gallons ?? 0) + (proxAll?.within5mi.gallons ?? 0) + (proxAll?.within10mi.gallons ?? 0))

  const hasProxTiers = proxTruck !== null || proxAll !== null
  const proxTruckOpp = proxTruck
    ? proxTruck.within1mi.gallons + proxTruck.within2mi.gallons + proxTruck.within5mi.gallons + proxTruck.within10mi.gallons
    : null
  const proxAllOpp = proxAll
    ? proxAll.within1mi.gallons + proxAll.within2mi.gallons + proxAll.within5mi.gallons + proxAll.within10mi.gallons
    : null
  const proxCKTotal   = (proxTruck?.ckGallons ?? 0) + (proxAll?.ckGallons ?? 0)
  const useProxHeader = proxTruckOpp !== null || proxAllOpp !== null

  // ── Full-page loading screen (parsing or geocoding) ──────────────────────────
  if (loading || geocodingInProgress) {
    const isGeocoding = geocodingInProgress
    const pct = geocodingProgress
      ? Math.round((geocodingProgress.done / geocodingProgress.total) * 100)
      : 0

    // Estimate remaining time based on observed geocoding rate
    let etaText: string | null = null
    if (isGeocoding && geocodingProgress && geocodingProgress.done > 5 && geocodingStartRef.current) {
      const elapsedSec = (Date.now() - geocodingStartRef.current) / 1000
      const rate = geocodingProgress.done / elapsedSec
      const remaining = geocodingProgress.total - geocodingProgress.done
      const etaSec = Math.ceil(remaining / rate)
      if (etaSec >= 60) etaText = `~${Math.ceil(etaSec / 60)} min remaining`
      else if (etaSec > 5) etaText = `~${etaSec}s remaining`
    }

    return (
      <div className="min-h-screen bg-off-white">
        <Navbar />
        <div className="max-w-md mx-auto px-6 py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-6">
            <BarChart2 size={24} className="text-zinc-500 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-off-black mb-2">
            {isGeocoding ? 'Geocoding locations…' : loadingStep || 'Processing…'}
          </h2>
          {isGeocoding && geocodingProgress ? (
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
                {etaText && <span className="ml-2 text-gray-400">· {etaText}</span>}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Reading and analyzing your fleet data…</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-off-white" style={{ backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)', backgroundSize: '28px 28px' }}>
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8 fade-in">
          <h1 className="text-3xl font-bold text-off-black">Transaction Analysis</h1>
          <p className="text-gray-500 mt-1">
            Upload a fleet fueling transaction report to compare against the Circle K store footprint.
          </p>
        </div>

        {/* ── Upload State ──────────────────────────────────────────────────── */}
        {!summary && (
          <div className="max-w-2xl mx-auto slide-up-card">
            {/* Customer Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer / Account Name</label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="e.g. Heartland Logistics"
                className="w-full border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>

            {/* Data period override */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-0.5">
                Data Period <span className="text-gray-400 font-normal text-xs">— optional</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Set this if your file has no dates or placeholder dates. Controls all monthly and annual figures.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {([null, 1, 3, 6, 12] as (number | null)[]).map(mo => (
                  <button
                    key={mo ?? 'auto'}
                    type="button"
                    onClick={() => setManualMonthSpan(mo)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      manualMonthSpan === mo
                        ? 'bg-accent text-white border-accent'
                        : 'bg-white text-gray-600 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    {mo === null ? 'Auto-detect' : mo === 1 ? '1 month' : `${mo} months`}
                  </button>
                ))}
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    placeholder="Other"
                    value={manualMonthSpan !== null && ![1, 3, 6, 12].includes(manualMonthSpan) ? manualMonthSpan : ''}
                    onChange={e => {
                      const v = parseFloat(e.target.value)
                      if (v > 0) setManualMonthSpan(v)
                      else if (e.target.value === '') setManualMonthSpan(null)
                    }}
                    className="w-20 border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                  <span className="text-xs text-gray-400">mo</span>
                </div>
              </div>
            </div>

            {/* Fleet Type */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-0.5">
                Fleet Type <span className="text-gray-400 font-normal text-xs">— controls which CK sites are used for opportunity analysis</span>
              </label>
              <div className="flex flex-wrap gap-2 mt-1">
                {([
                  { value: 'auto',  label: 'Auto-detect',     desc: 'Engine decides based on fuel mix' },
                  { value: 'truck', label: 'OTR / Truck',     desc: 'Truck-accessible CK sites only' },
                  { value: 'mixed', label: 'Mixed / General', desc: 'Full CK network (incl. c-stores)' },
                ] as const).map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFleetType(value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors text-left ${
                      fleetType === value
                        ? 'bg-accent text-white border-accent'
                        : 'bg-white text-gray-600 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    {label}
                    <span className={`block text-xs mt-0.5 font-normal ${fleetType === value ? 'text-white/80' : 'text-gray-400'}`}>{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Capture radius */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-0.5">
                Capture Radius <span className="text-gray-400 font-normal text-xs">— how far from a CK counts as &ldquo;capturable&rdquo;</span>
              </label>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {[2, 5, 10, 15, 25].map(mi => (
                  <button
                    key={mi}
                    type="button"
                    onClick={() => setCaptureRadius(mi)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      captureRadius === mi
                        ? 'bg-accent text-white border-accent'
                        : 'bg-white text-gray-600 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    {mi} mi
                  </button>
                ))}
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    placeholder="Other"
                    value={![2, 5, 10, 15, 25].includes(captureRadius) ? captureRadius : ''}
                    onChange={e => {
                      const v = parseInt(e.target.value)
                      if (v > 0) setCaptureRadius(v)
                    }}
                    className="w-20 border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                  <span className="text-xs text-gray-400">mi</span>
                </div>
              </div>
            </div>

            <CustomerLocationsInput locations={customerLocationInputs} onChange={setCustomerLocationInputs} />

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-accent bg-accent-muted/20'
                  : 'border-zinc-300 bg-white hover:border-accent hover:bg-accent-muted/10'
              }`}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.txt" onChange={handleFileChange} className="hidden" />
              <Upload size={40} className="mx-auto text-gray-400 mb-4" />
              <p className="font-semibold text-off-black mb-1">Drop your fleet transaction file here</p>
              <p className="text-sm text-gray-500">WEX, Fuelman, Fleetcor, Comdata, or any fleet card export</p>
              <p className="text-xs text-gray-400 mt-3">Click to browse · .xlsx, .xls, .csv, .txt supported</p>
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            {/* Column hint */}
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Required columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Date', 'City', 'State', 'Gallons'].map(c => (
                    <span key={c} className="bg-zinc-100 text-zinc-600 text-xs rounded px-2 py-0.5 font-mono font-semibold">{c}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Optional (enhance analysis)</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Fuel Type', 'Station Name', 'Brand', 'Address', 'ZIP', 'Vehicle / Unit #', 'Driver City', 'Amount'].map(c => (
                    <span key={c} className="bg-gray-100 text-gray-500 text-xs rounded px-2 py-0.5 font-mono">{c}</span>
                  ))}
                </div>
              </div>
              {/* Format example */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Example rows</p>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-zinc-50 border-b border-gray-100">
                      <tr>
                        {['Date', 'City', 'State', 'Gallons', 'Fuel Type', 'Brand', 'Amount'].map(h => (
                          <th key={h} className="px-2.5 py-1.5 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[
                        ['2024-03-01', 'Dallas',    'TX', '87.4',  'Diesel', 'Pilot',    '$354.10'],
                        ['2024-03-01', 'Atlanta',   'GA', '62.1',  'Gas',    'Circle K', '$208.55'],
                        ['2024-03-02', 'Nashville', 'TN', '110.0', 'Diesel', 'Love\'s',  '$446.30'],
                      ].map((row, i) => (
                        <tr key={i} className="bg-white">
                          {row.map((cell, j) => (
                            <td key={j} className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-gray-400 flex items-start gap-1">
                <Info size={12} className="shrink-0 mt-0.5" />
                Column headers are detected automatically — exact names and order don't matter.
              </p>
            </div>

            {/* Advanced options (collapsed by default) */}
            <FeatureSelector flags={featureFlags} onChange={toggleFeature} />
          </div>
        )}

        {/* ── Results State ──────────────────────────────────────────────────── */}
        {summary && (
          <div className="space-y-6">
            {/* Results header */}
            <div className="flex items-start justify-between flex-wrap gap-4 fade-in">
              <div>
                <p className="text-sm text-gray-500 mb-0.5">Analysis for</p>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Enter account name…"
                  className="text-2xl font-bold text-zinc-900 bg-transparent border-b-2 border-transparent hover:border-zinc-200 focus:border-accent focus:outline-none placeholder:font-normal placeholder:text-zinc-300 w-full"
                />
                <p className="text-sm text-gray-400 mt-0.5">
                  {fileName} &bull; {summary.dateRange.start}
                  {summary.dateRange.end && summary.dateRange.end !== summary.dateRange.start ? ` – ${summary.dateRange.end}` : ''}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5 font-medium">
                    {summary.detectedFormat}
                  </span>
                  {missingFields.length > 0 && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 rounded px-2 py-0.5">
                      Missing: {missingFields.join(', ')}
                    </span>
                  )}
                  {restoredFromCache && (
                    <button
                      type="button"
                      onClick={reset}
                      className="text-xs bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 rounded px-2 py-0.5 transition-colors"
                      title="This is a cached result from your last upload, not freshly processed — click to start a new upload"
                    >
                      Restored from last session — click for a fresh upload
                    </button>
                  )}
                  {featureFlags.skipGeocoding && (
                    <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 rounded px-2 py-0.5 flex items-center gap-1">
                      <Zap size={11} />Quick mode — no geocoding
                    </span>
                  )}
                  {geocodingInProgress && geocodingProgress && (
                    <span className="text-xs bg-accent-muted text-accent rounded px-2 py-0.5 flex items-center gap-1">
                      <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      Geocoding {geocodingProgress.done}/{geocodingProgress.total} locations…
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const text = buildAnalysisSummary(summary, customerName, monthSpan)
                    await navigator.clipboard.writeText(text)
                    setSummaryCopied(true)
                    setTimeout(() => setSummaryCopied(false), 2500)
                  }}
                  className="btn-secondary text-sm flex items-center gap-2"
                  title="Copy a plain-text summary to clipboard"
                >
                  <ClipboardCopy size={15} />
                  {summaryCopied ? 'Copied!' : 'Copy summary'}
                </button>
                {savedAnalysisId ? (
                  <>
                    <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <BookOpen size={13} />
                      Saved
                    </span>
                    <button
                      onClick={() => setShowShareModal(true)}
                      className="btn-secondary text-sm flex items-center gap-2"
                    >
                      <Share2 size={15} />
                      Share
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save size={15} />
                    {saving ? 'Saving…' : 'Save Analysis'}
                  </button>
                )}
                <button onClick={reset} className="btn-secondary text-sm flex items-center gap-2">
                  <Upload size={15} />
                  New File
                </button>
              </div>
            </div>
            {saveError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{saveError}</div>
            )}

            {/* Feature Toggle Bar */}
            <FeatureToggleBar flags={featureFlags} onChange={toggleFeature} />

            {/* Unclassified fuel type warning */}
            {showFuelTypeWarning && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3 text-sm text-amber-800">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <span className="font-semibold">{fmtPct(unknownFuelPct)} of gallons ({fmtGallons(unknownFuelGallons)}) have an unrecognised fuel type.</span>
                  {' '}Diesel/gas opportunity figures may be understated. See the{' '}
                  <span className="font-semibold">Fuel Type Split</span>
                  {' '}section below to see which values are unclassified — if a common code is missing, contact support so it can be added.
                </div>
              </div>
            )}

            {/* Summary stats — meta strip */}
            <div className="rounded-xl border border-zinc-200 overflow-hidden bg-zinc-100 shadow-sm">
              {useProxHeader ? (
                // Compact 4-stat strip when proximity data is available
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px stagger-stats">
                  <div className="px-5 py-4 bg-white">
                    <p className="text-xs font-medium uppercase tracking-wider mb-1.5 text-zinc-400">Total Gallons</p>
                    <p className="text-2xl font-bold leading-none text-zinc-900">{fmtGallons(summary.totalGallons)}</p>
                    <p className="text-xs mt-1.5 text-zinc-400">{summary.totalTransactions.toLocaleString()} transactions</p>
                  </div>
                  <div className="px-5 py-4 bg-white">
                    <p className="text-xs font-medium uppercase tracking-wider mb-1.5 text-zinc-400">Currently at CK</p>
                    <p className="text-2xl font-bold leading-none text-zinc-900">{fmtGallons(proxCKTotal)}</p>
                    <p className="text-xs mt-1.5 text-zinc-400">
                      {fmtPct(proxCKTotal / (summary.totalGallons || 1) * 100)} of total
                      {isDieselFleet && <span className="ml-2 inline-flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 text-[10px] font-semibold"><Truck size={9} />{fmtPct(dieselPct * 100)} diesel</span>}
                    </p>
                  </div>
                  <div className="px-5 py-4 bg-white">
                    <p className="text-xs font-medium uppercase tracking-wider mb-1.5 text-zinc-400">Vehicles</p>
                    <p className="text-2xl font-bold leading-none text-zinc-900">{summary.uniqueVehicles.toLocaleString()}</p>
                    <p className="text-xs mt-1.5 text-zinc-400">{summary.uniqueStates.length} states · {summary.uniqueStations.toLocaleString()} stations</p>
                  </div>
                  <div className="px-5 py-4 bg-white">
                    <p className="text-xs font-medium uppercase tracking-wider mb-1.5 text-zinc-400">Data Period</p>
                    {editingPeriod ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0.5}
                            max={60}
                            step={0.5}
                            value={periodInputVal}
                            onChange={e => setPeriodInputVal(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const v = parseFloat(periodInputVal)
                                if (v > 0) setManualMonthSpan(v)
                                setEditingPeriod(false)
                              }
                              if (e.key === 'Escape') setEditingPeriod(false)
                            }}
                            autoFocus
                            className="w-14 border border-accent rounded px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/30"
                          />
                          <span className="text-xs text-zinc-400">months</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const v = parseFloat(periodInputVal)
                              if (v > 0) setManualMonthSpan(v)
                              setEditingPeriod(false)
                            }}
                            className="text-xs bg-accent text-white rounded px-2 py-0.5 font-semibold"
                          >Set</button>
                          {manualMonthSpan !== null && (
                            <button
                              onClick={() => { setManualMonthSpan(null); setEditingPeriod(false) }}
                              className="text-xs text-zinc-400 hover:text-zinc-700 underline"
                            >Auto-detect</button>
                          )}
                          <button
                            onClick={() => setEditingPeriod(false)}
                            className="text-xs text-zinc-300 hover:text-zinc-500"
                          >Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setPeriodInputVal(monthSpan.toFixed(1)); setEditingPeriod(true) }}
                        className="group text-left w-full"
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-bold leading-none text-zinc-900">{monthSpan.toFixed(1)} months</span>
                          {manualMonthSpan !== null && (
                            <span className="text-[10px] font-semibold text-accent bg-accent/10 rounded px-1 py-0.5 leading-none">override</span>
                          )}
                          <span className="text-[10px] text-zinc-300 group-hover:text-zinc-400 transition-colors leading-none">edit</span>
                        </div>
                        <p className="text-xs mt-1.5 text-zinc-400">
                          {manualMonthSpan !== null
                            ? `dates ignored · set to ${manualMonthSpan} mo`
                            : `${summary.dateRange.start} – ${summary.dateRange.end || summary.dateRange.start}`}
                        </p>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                // No proximity data — show basic fleet stats
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px stagger-stats">
                  {[
                    { label: 'Transactions',    value: summary.totalTransactions.toLocaleString(), sub: undefined },
                    { label: 'Total Gallons',   value: fmtGallons(summary.totalGallons),           sub: undefined },
                    ...(summary.totalSpend > 0 ? [{ label: 'Total Spend', value: fmtDollars(summary.totalSpend), sub: undefined }] : []),
                    { label: 'Vehicles',        value: summary.uniqueVehicles.toLocaleString(),    sub: undefined },
                    { label: 'Unique Stations', value: summary.uniqueStations.toLocaleString(),    sub: undefined },
                    {
                      label: 'States',
                      value: summary.uniqueStates.length.toString(),
                      sub: summary.uniqueStates.slice(0, 6).join(', ') + (summary.uniqueStates.length > 6 ? '…' : ''),
                    },
                  ].map(({ label, value, sub }) => (
                    <div key={label} className="px-5 py-4 bg-white">
                      <p className="text-xs font-medium uppercase tracking-wider mb-1.5 text-zinc-400">{label}</p>
                      <p className="text-2xl font-bold leading-none text-zinc-900">{value}</p>
                      {sub && <p className="text-xs mt-1.5 text-zinc-400">{sub}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hero: Monthly Gallon Opportunity by Proximity */}
            {hasProxTiers && !geocodingInProgress && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden fade-in">
                <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-zinc-900 font-bold text-lg">Monthly Gallon Opportunity</h2>
                    <p className="text-zinc-500 text-sm mt-0.5">
                      Non-CK gallons by distance to nearest Circle K · averaged over {monthSpan.toFixed(1)} months
                      {(() => {
                        const geocodedPct = summary.proximityBreakdownAll?.geocodedPct ?? summary.proximityBreakdown?.geocodedPct ?? null
                        if (geocodedPct !== null && geocodedPct < 99) {
                          return <span className="ml-2 text-amber-600 text-xs font-medium">· based on {fmtPct(geocodedPct)} of gallons geocoded</span>
                        }
                        return null
                      })()}
                    </p>
                  </div>
                  <MapPin className="text-zinc-400 shrink-0" size={22} />
                </div>
                {(() => {
                    const proxAll = summary.proximityBreakdownAll
                    // For diesel fleets: only show the gas panel when there are actual non-CK gas gallons
                    const gasNonCKGallons = proxAll
                      ? proxAll.within1mi.gallons + proxAll.within2mi.gallons + proxAll.within5mi.gallons + proxAll.within10mi.gallons + proxAll.beyond10mi.gallons
                      : 0
                    const showGasPanel = !!proxAll && (!isDieselFleet || gasNonCKGallons > 0)
                    const showBothPanels = isDieselFleet && !!summary.proximityBreakdown && showGasPanel
                    return (
                      <div className={`p-6 grid gap-6 ${showBothPanels ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                        {isDieselFleet && summary.proximityBreakdown && (
                          <DetailedProximityPanel
                            prox={summary.proximityBreakdown}
                            title="Diesel — Truck CK"
                            subtitle="Non-CK diesel gallons vs. truck-accessible CK sites only"
                            monthSpan={monthSpan}
                            captureRadiusMi={summary.captureRadiusMi ?? 10}
                          />
                        )}
                        {showGasPanel && proxAll && (
                          <DetailedProximityPanel
                            prox={proxAll}
                            title={isDieselFleet ? 'Gas — Full CK Network' : 'Circle K Proximity'}
                            subtitle={isDieselFleet ? 'Non-CK gas gallons vs. all CK sites (incl. c-stores)' : 'Full CK network'}
                            monthSpan={monthSpan}
                            captureRadiusMi={summary.captureRadiusMi ?? 10}
                            capturedGallons={!isDieselFleet ? summary.ckCaptureAnalysis.captured.gallons : undefined}
                          />
                        )}
                      </div>
                    )
                  })()}
              </div>
            )}

            {/* Savings Calculator — follows the hero opportunity card */}
            {featureFlags.savingsCalc && (
              <div className="fade-in"><SavingsCalculatorPanel
                captured={summary.ckCaptureAnalysis.captured}
                capturable={summary.ckCaptureAnalysis.capturable}
                months={monthSpan}
                rebateRate={rebateRate}
                onRebateChange={setRebateRate}
              /></div>
            )}

            {/* Annualized Projections (if enabled) */}
            {featureFlags.annualized && (
              <div className="fade-in"><AnnualizedPanel summary={summary} months={monthSpan} /></div>
            )}

            {/* CK Opportunity Panel */}
            <div className="fade-in"><OpportunityPanel analysis={summary.ckCaptureAnalysis} totalGallons={summary.totalGallons} captureRadiusMi={summary.captureRadiusMi ?? 10} truckMode={isDieselFleet} /></div>

            {/* Top CK Opportunity Locations — standalone card */}
            {summary.topCKOpportunityLocations.length > 0 && (
              <TopCKLocationsCard locations={summary.topCKOpportunityLocations} truckMode={isDieselFleet} />
            )}

            {/* Customer Location Proximity — standalone card */}
            {summary.customerLocations && summary.customerLocations.length > 0 && (
              <CustomerLocationProximityPanel locations={summary.customerLocations} />
            )}

            {/* Tabbed detail sections — only shown if at least one tab is visible */}
            {visibleTabs.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden fade-in">
                <div className="flex border-b border-gray-200 overflow-x-auto">
                  {visibleTabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                        activeTab === tab.id
                          ? 'border-b-2 border-accent text-accent bg-accent-muted/20'
                          : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                      {tab.id === 'map' && geocodingInProgress && (
                        <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="p-6">
                  {/* ── Brands Tab ──────────────────────────────────────── */}
                  {activeTab === 'brands' && featureFlags.brandBreakdown && (
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
                        <button onClick={() => setShowAllBrands(v => !v)} className="mt-4 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 transition-colors">
                          {showAllBrands ? <><ChevronUp size={16} />Show fewer</> : <><ChevronDown size={16} />Show all {summary.brandBreakdown.length} brands</>}
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Geographic Tab ──────────────────────────────────── */}
                  {activeTab === 'geographic' && featureFlags.geographic && (() => {
                    const cityRows = geoView === 'city'
                      ? (geoStateFilter === 'all' ? summary.cityBreakdown : summary.cityBreakdown.filter((c: CitySummary) => c.state === geoStateFilter))
                      : []
                    const cityStates = Array.from(new Set(summary.cityBreakdown.map((c: CitySummary) => c.state))).sort() as string[]
                    return (
                      <div>
                        {/* Header + toggle */}
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                          <div>
                            <h3 className="font-bold text-off-black">
                              {geoView === 'state' ? 'Fueling Activity by State' : 'Fueling Activity by City'}
                            </h3>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Opp. Gal/mo = non-CK gallons within {summary.captureRadiusMi ?? 10} mi of a Circle K, averaged per month over the {monthSpan.toFixed(1)}-month data period
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {geoView === 'city' && cityStates.length > 1 && (
                              <select
                                value={geoStateFilter}
                                onChange={e => setGeoStateFilter(e.target.value)}
                                className="text-xs border border-zinc-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                              >
                                <option value="all">All states</option>
                                {cityStates.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            )}
                            <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-xs font-medium">
                              {(['state', 'city'] as const).map(v => (
                                <button
                                  key={v}
                                  onClick={() => { setGeoView(v); setGeoStateFilter('all') }}
                                  className={`px-3 py-1.5 transition-colors ${geoView === v ? 'bg-zinc-800 text-white' : 'bg-white text-zinc-500 hover:bg-zinc-50'}`}
                                >
                                  {v === 'state' ? 'By State' : 'By City'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* State table */}
                        {geoView === 'state' && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  {['State', 'Transactions', 'Gallons', 'Spend', 'CK Gallons', 'Opp. Gal/mo', 'CK Share'].map(h => (
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
                                    <td className="py-2.5 px-4 text-right text-gray-600">{row.spend > 0 ? fmtDollars(row.spend) : <span className="text-gray-300">—</span>}</td>
                                    <td className="py-2.5 px-4 text-right text-accent font-medium">{fmtGallons(row.ckGallons)}</td>
                                    <td className="py-2.5 px-4 text-right text-green-600 font-medium">
                                      {row.capturableGallons > 0 ? fmtGallons(mo(row.capturableGallons)) : <span className="text-gray-300">—</span>}
                                    </td>
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
                        )}

                        {/* City table */}
                        {geoView === 'city' && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  {['City', 'State', 'Transactions', 'Gallons', 'Spend', 'CK Gallons', 'Opp. Gal/mo', 'CK Share'].map(h => (
                                    <th key={h} className={`py-2 ${['City', 'State'].includes(h) ? 'text-left pr-4' : 'text-right px-4'} text-xs font-semibold uppercase tracking-wider text-gray-500`}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {cityRows.map((row: CitySummary) => (
                                  <tr key={`${row.city}||${row.state}`} className="hover:bg-gray-50">
                                    <td className="py-2.5 pr-4 font-semibold text-off-black">{row.city}</td>
                                    <td className="py-2.5 pr-4 text-gray-500 text-xs">{row.state}</td>
                                    <td className="py-2.5 px-4 text-right text-gray-600">{row.transactions.toLocaleString()}</td>
                                    <td className="py-2.5 px-4 text-right font-medium">{fmtGallons(row.gallons)}</td>
                                    <td className="py-2.5 px-4 text-right text-gray-600">{row.spend > 0 ? fmtDollars(row.spend) : <span className="text-gray-300">—</span>}</td>
                                    <td className="py-2.5 px-4 text-right text-accent font-medium">{fmtGallons(row.ckGallons)}</td>
                                    <td className="py-2.5 px-4 text-right text-green-600 font-medium">
                                      {row.capturableGallons > 0 ? fmtGallons(mo(row.capturableGallons)) : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="py-2.5 pl-4 text-right">
                                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${row.ckSharePct >= 20 ? 'bg-green-100 text-green-700' : row.ckSharePct > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {fmtPct(row.ckSharePct)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                                {cityRows.length === 0 && (
                                  <tr><td colSpan={8} className="py-8 text-center text-sm text-zinc-400">No cities match the selected filter.</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* ── Competitor Locations Tab ─────────────────────────── */}
                  {activeTab === 'locations' && featureFlags.competitorLocations && (
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
                                <td className="py-2.5 px-4 text-right text-gray-600">{loc.spend > 0 ? fmtDollars(loc.spend) : <span className="text-gray-300">—</span>}</td>
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

                      {/* Top CK Opportunity Locations — moved to standalone card below */}
                    </div>
                  )}

                  {/* ── Vehicles Tab ─────────────────────────────────────── */}
                  {activeTab === 'vehicles' && featureFlags.vehicles && (
                    <VehiclesTab summary={summary} showAll={showAllVehicles} setShowAll={setShowAllVehicles} />
                  )}

                  {/* ── Map Tab ──────────────────────────────────────────── */}
                  {activeTab === 'map' && featureFlags.mapView && (
                    <div className="space-y-4">
                      <FuelingMap
                        transactionPoints={summary.mapPoints}
                        ckStores={ckStorePins}
                        customerLocations={summary.customerLocations}
                        height={560}
                        geocodingInProgress={geocodingInProgress}
                        truckMode={isDieselFleet}
                      />
                      {geocodingInProgress && (
                        <div className="rounded-xl bg-accent-muted border border-accent/20 px-4 py-3 text-sm text-accent flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                          Geocoding locations for proximity analysis…
                          {geocodingProgress && ` (${geocodingProgress.done}/${geocodingProgress.total})`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Behavioral Insights Tab ──────────────────────── */}
                  {activeTab === 'insights' && featureFlags.behavioralInsights && (
                    <BehavioralInsightsTab summary={summary} />
                  )}

                  {/* ── Time Patterns Tab ────────────────────────────── */}
                  {activeTab === 'timing' && featureFlags.timeOfDay && (
                    <TimePatternsTab summary={summary} />
                  )}

                  {/* ── Fraud Flags Tab ──────────────────────────────── */}
                  {activeTab === 'fraud' && featureFlags.fraudFlags && (
                    <FraudFlagsTab flags={summary.fraudFlags} />
                  )}

                  {/* ── OTR Corridors Tab ────────────────────────────── */}
                  {activeTab === 'otr' && featureFlags.otrCorridors && summary.otrAnalysis && (
                    <OTRAnalysisPanel
                      otr={summary.otrAnalysis}
                      months={monthSpan}
                      mapPoints={summary.mapPoints}
                      ckStorePins={ckStorePins}
                      isDieselFleet={isDieselFleet}
                      customerLocations={summary.customerLocations}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Fuel Type Split (if enabled) */}
            {featureFlags.fuelTypeSplit && summary.fuelTypeBreakdown.length > 1 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-bold text-off-black mb-3 text-sm">Transaction Breakdown</h3>
                <div className="flex flex-wrap gap-3">
                  {summary.fuelTypeBreakdown.map(ft => (
                    <div key={ft.type} className="bg-gray-50 rounded-lg px-4 py-3 text-center min-w-[120px]">
                      <p className="text-xs font-semibold text-gray-500 mb-1">{ft.type}</p>
                      <p className="text-lg font-bold text-off-black">{fmtGallons(ft.gallons)}</p>
                      <p className="text-xs text-gray-500 mt-1">{ft.transactions.toLocaleString()} trans</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showShareModal && savedAnalysisId && (
        <ShareModal analysisId={savedAnalysisId} onClose={() => setShowShareModal(false)} />
      )}
    </div>
  )
}

export default function AnalysisPage() {
  return (
    <Suspense>
      <AnalysisPageInner />
    </Suspense>
  )
}
