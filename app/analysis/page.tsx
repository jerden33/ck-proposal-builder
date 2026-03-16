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
  DollarSign,
  TrendingUp,
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
import { parseFleetCSV } from '@/lib/transaction-parser'
import { createAnalysis, getAnalysis } from '@/lib/supabase/queries'
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
  type VehicleSegment,
  type DriverSummary,
  type FraudFlag,
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
  | 'skipGeocoding'  // processing option — skips API calls, disables map/proximity

type FeatureFlags = Record<FeatureKey, boolean>

const DEFAULT_FEATURES: FeatureFlags = {
  brandBreakdown: true,
  geographic: true,
  competitorLocations: true,
  vehicles: true,
  mapView: true,
  fuelTypeSplit: true,
  savingsCalc: false,
  annualized: false,
  behavioralInsights: true,
  timeOfDay: true,
  fraudFlags: false,
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
  { key: 'fraudFlags',          label: 'Fraud Flags',            desc: 'High-gallon fills, multi-fill days, PPG outliers & state hops' },
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

// ─── Opportunity Panel ────────────────────────────────────────────────────────

function OpportunityPanel({ analysis, totalGallons, truckMode = false }: { analysis: TransactionSummary['ckCaptureAnalysis']; totalGallons: number; truckMode?: boolean }) {
  const { captured, capturable, gap, captureRate, potentialRate } = analysis
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-zinc-900 font-bold text-lg">Circle K Fueling Opportunity</h2>
          {truckMode && (
            <span className="text-xs font-semibold bg-zinc-200 text-zinc-600 rounded px-2 py-0.5 flex items-center gap-1">
              <Truck size={11} /> OTR / Truck Mode
            </span>
          )}
        </div>
        <p className="text-zinc-500 text-sm mt-0.5">
          {truckMode
            ? "Opportunity scoped to truck-accessible CK locations only (451 sites with truck lanes)"
            : "Where your fleet's gallons go — and what Circle K can capture"}
        </p>
      </div>
      <div className="p-6">
        {/* Hero capture rate */}
        <div className="flex items-end gap-6 mb-5">
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Current CK Share</p>
            <p className="text-4xl font-bold text-zinc-900 leading-none">{fmtPct(captureRate)}</p>
          </div>
          <span className="text-zinc-200 text-2xl font-light pb-0.5">→</span>
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Potential</p>
            <p className="text-4xl font-bold text-green-600 leading-none">{fmtPct(potentialRate)}</p>
          </div>
        </div>

        {/* Slim progress bars */}
        <div className="space-y-2 mb-6">
          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Current Circle K capture</span>
              <span className="font-semibold text-zinc-600">{fmtPct(captureRate)}</span>
            </div>
            <div className="h-1.5 bg-zinc-100 rounded-full">
              <div className="h-1.5 bg-accent rounded-full transition-all" style={{ width: `${captureRate}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Potential with Circle K {truckMode ? 'truck-accessible ' : ''}network</span>
              <span className="font-semibold text-zinc-600">{fmtPct(potentialRate)}</span>
            </div>
            <div className="h-1.5 bg-zinc-100 rounded-full">
              <div className="h-1.5 bg-green-500 rounded-full transition-all" style={{ width: `${potentialRate}%` }} />
            </div>
          </div>
        </div>

        {/* Data grid — 3 segments */}
        <div className="rounded-xl border border-zinc-200 overflow-hidden bg-zinc-100">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px">
            <div className="bg-white px-5 py-4">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Already at Circle K</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900">{fmtGallons(captured.gallons)}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{captured.transactions.toLocaleString()} transactions</p>
              {captured.spend > 0 && <p className="text-sm font-semibold text-zinc-700 mt-2">{fmtDollars(captured.spend)}</p>}
            </div>
            <div className="bg-white px-5 py-4">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  {truckMode ? 'Opportunity — Truck CK' : 'Opportunity — CK Nearby'}
                </span>
              </div>
              <p className="text-2xl font-bold text-zinc-900">{fmtGallons(capturable.gallons)}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{capturable.transactions.toLocaleString()} transactions</p>
              {capturable.spend > 0 && <p className="text-sm font-semibold text-zinc-700 mt-2">{fmtDollars(capturable.spend)}</p>}
            </div>
            <div className="bg-white px-5 py-4">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="w-2 h-2 rounded-full bg-zinc-300 shrink-0" />
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Outside CK Footprint</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900">{fmtGallons(gap.gallons)}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{gap.transactions.toLocaleString()} transactions</p>
              {gap.spend > 0 && <p className="text-sm font-semibold text-zinc-700 mt-2">{fmtDollars(gap.spend)}</p>}
            </div>
          </div>
        </div>

        {capturable.gallons > 0 && (
          <p className="mt-4 text-sm text-zinc-500">
            <span className="font-semibold text-zinc-800">{fmtGallons(capturable.gallons)} gallons ({fmtPct((capturable.gallons / totalGallons) * 100)})</span>{' '}
            are going to competitors where a {truckMode ? 'truck-accessible Circle K' : 'Circle K'} already exists nearby.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Proximity Panel (shown in Map tab) ───────────────────────────────────────

function ProximityPanel({ prox, totalGallons, isMobileFueling }: { prox: NonNullable<TransactionSummary['proximityBreakdown']>; totalGallons: number; isMobileFueling: boolean }) {
  // Combine all within-10mi buckets into one "opportunity" figure — matches map logic
  const opportunityGallons =
    prox.within1mi.gallons + prox.within2mi.gallons +
    prox.within5mi.gallons + prox.within10mi.gallons
  const opportunityPct = totalGallons > 0 ? (opportunityGallons / totalGallons) * 100 : 0

  const rows = [
    { label: 'Fueled at Circle K',              gallons: prox.ckGallons,            color: '#16a34a', opportunity: false },
    { label: 'Competitor — CK within 10 mi',    gallons: opportunityGallons,         color: '#3b82f6', opportunity: true  },
    { label: 'Competitor — no CK within 10 mi', gallons: prox.beyond10mi.gallons,   color: '#dc2626', opportunity: false },
  ]

  return (
    <div className="space-y-3">
      {isMobileFueling && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <AlertCircle size={13} className="mt-0.5 shrink-0 text-amber-600" />
          <span>
            <strong>Mobile fueling detected.</strong> This report contains fuel deliveries (e.g. Diesel Direct) made directly to the customer's location — not purchases at a fixed pump. Proximity-to-CK figures are based on the delivery city only and are not meaningful for conversion analysis.
          </span>
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-off-black">Distance-Based Proximity to Circle K</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Based on geocoded fueling locations · {fmtPct(prox.geocodedPct)} of total gallons geocoded
          </p>
        </div>
        {opportunityGallons > 0 && (
          <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 text-right shrink-0 ml-4">
            <span className="font-bold">{fmtGallons(opportunityGallons)} gal</span><br />
            <span className="opacity-80">within 10 mi of CK ({fmtPct(opportunityPct)})</span>
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
                <span className="text-xs bg-green-50 text-green-700 rounded px-1.5 py-0.5 font-semibold">Opportunity</span>
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

// ─── Detailed Proximity Panel (OTR-style 5-band breakdown) ───────────────────

function DetailedProximityPanel({
  prox,
  title,
  subtitle,
  monthSpan,
}: {
  prox: NonNullable<TransactionSummary['proximityBreakdown']>
  title: string
  subtitle: string
  monthSpan: number
}) {
  const ck  = prox.ckGallons
  const w2  = prox.within1mi.gallons + prox.within2mi.gallons
  const w5  = prox.within5mi.gallons
  const w10 = prox.within10mi.gallons
  const b10 = prox.beyond10mi.gallons
  const tot = ck + w2 + w5 + w10 + b10
  const mx  = Math.max(ck, w2, w5, w10, b10, 1)

  const rows = [
    { label: 'At Circle K',  gallons: ck,  color: 'bg-green-500',   text: 'text-green-700',   note: 'Already at CK' },
    { label: 'Within 2 mi',  gallons: w2,  color: 'bg-emerald-400', text: 'text-emerald-700', note: 'Drove right past' },
    { label: '2–5 mi',       gallons: w5,  color: 'bg-amber-400',   text: 'text-amber-700',   note: 'Strong opportunity' },
    { label: '5–10 mi',      gallons: w10, color: 'bg-orange-400',  text: 'text-orange-700',  note: 'Moderate detour' },
    { label: '10+ mi',       gallons: b10, color: 'bg-red-400',     text: 'text-red-700',     note: 'No nearby CK' },
  ]

  return (
    <div>
      <h3 className="font-bold text-off-black text-sm uppercase tracking-wide mb-0.5">{title}</h3>
      <p className="text-xs text-gray-400 mb-3">{subtitle}</p>
      {w2 > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
          <CheckCircle size={12} className="text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-800 leading-snug">
            <strong>{fmtGallons(w2)}</strong> gal within 2 mi
            {monthSpan > 0 ? ` · ${fmtGallons((w2 / monthSpan) * 12)} / yr` : ''}
            {' '}— drove right past.
          </p>
        </div>
      )}
      <div className="space-y-2">
        {rows.map(({ label, gallons, color, text, note }) => {
          const pct = tot > 0 ? (gallons / tot) * 100 : 0
          return (
            <div key={label}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-gray-700">{label}</span>
                <span className={`text-xs font-semibold ${text}`}>
                  {fmtGallons(gallons)} <span className="text-gray-400 font-normal">({fmtPct(pct)})</span>
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-1.5 ${color} rounded-full`} style={{ width: `${(gallons / mx) * 100}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-0.5 leading-none">{note}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Savings Calculator ────────────────────────────────────────────────────────

function SavingsCalculatorPanel({
  captured,
  capturable,
  months,
  rebateRate,
  onRebateChange,
}: {
  captured: { gallons: number; spend: number }
  capturable: { gallons: number; spend: number }
  months: number
  rebateRate: number
  onRebateChange: (v: number) => void
}) {
  const eligibleGallons = captured.gallons + capturable.gallons

  const monthlyGal    = eligibleGallons / months
  const annualGal     = monthlyGal * 12
  const monthlySavings = monthlyGal * (rebateRate / 100)
  const annualSavings  = annualGal  * (rebateRate / 100)

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-zinc-900 font-bold text-lg">Savings Calculator</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Estimated value of switching capturable gallons to Circle K</p>
        </div>
        <DollarSign className="text-zinc-400" size={26} />
      </div>
      <div className="p-6">
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Circle K Rebate Rate
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={rebateRate}
              onChange={e => onRebateChange(Number(e.target.value))}
              className="flex-1 h-2 cursor-pointer accent-[#0EA5E9]"
            />
            <div className="shrink-0 flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={rebateRate}
                onChange={e => onRebateChange(Number(e.target.value))}
                className="w-16 border border-zinc-200 rounded-lg px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <span className="text-sm text-gray-500 font-medium">¢/gal</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-center">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total CK Gallons</p>
            <p className="text-2xl font-bold text-off-black">{fmtGallons(annualGal)}</p>
            <p className="text-xs text-gray-400 mt-0.5">per year &nbsp;·&nbsp; {fmtGallons(monthlyGal)}/mo</p>
          </div>
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Monthly Savings</p>
            <p className="text-2xl font-bold text-green-600">{fmtDollars(monthlySavings)}</p>
            <p className="text-xs text-gray-400 mt-0.5">at {rebateRate}¢/gal</p>
          </div>
          <div className="rounded-xl bg-green-50 border border-green-300 p-4 text-center">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Annual Savings</p>
            <p className="text-2xl font-bold text-green-700">{fmtDollars(annualSavings)}</p>
            <p className="text-xs text-gray-400 mt-0.5">projected per year</p>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-400 flex items-start gap-1.5">
          <Info size={12} className="shrink-0 mt-0.5" />
          Based on {fmtGallons(eligibleGallons)} eligible gallons ({fmtGallons(captured.gallons)} current CK + {fmtGallons(capturable.gallons)} capturable) across {months.toFixed(1)} months of data, extrapolated to 12 months.
        </p>
      </div>
    </div>
  )
}

// ─── OTR Corridor Analysis Panel ─────────────────────────────────────────────

function OTRAnalysisPanel({ otr, months }: {
  otr: NonNullable<TransactionSummary['otrAnalysis']>
  months: number
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? otr.corridorResults : otr.corridorResults.slice(0, 8)
  const totalOpp = otr.corridorResults.reduce((s, r) => s + r.captureGallons, 0)
  const annualOpp = months > 0 ? (totalOpp / months) * 12 : totalOpp

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-zinc-900 font-bold text-lg">OTR Corridor Analysis</h2>
            <span className="bg-zinc-200 text-zinc-600 text-xs font-bold px-2 py-0.5 rounded-full">OTR</span>
          </div>
          <p className="text-zinc-500 text-sm mt-0.5">
            Opportunity mapped to major interstate corridors — not aerial radius
          </p>
        </div>
        <Truck className="text-zinc-400 shrink-0" size={26} />
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-b border-gray-200 divide-x divide-gray-200">
        {[
          { label: 'Active Corridors',   value: otr.corridorResults.length.toString() },
          { label: 'On-Corridor Gallons', value: fmtGallons(otr.totalCorridorGallons) },
          { label: 'Annual Opp. Gallons', value: fmtGallons(annualOpp), accent: true },
          { label: 'Off-Corridor Gallons', value: fmtGallons(otr.offCorridorGallons), dim: true },
        ].map(({ label, value, accent, dim }) => (
          <div key={label} className="px-4 py-3 text-center">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
            <p className={`text-xl font-bold ${accent ? 'text-green-600' : dim ? 'text-gray-400' : 'text-off-black'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Corridor table */}
      <div className="p-5">
        <p className="text-xs text-gray-400 mb-3">
          A fueling event is <span className="font-semibold text-gray-600">on-corridor</span> if it occurred within 15 mi of the interstate.
          It is <span className="font-semibold text-green-700">capturable</span> if a truck-accessible CK exists on the same corridor within 30 mi.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {['Corridor', 'Gallons', 'CK Now', 'Opp. Gallons', 'Gap Gallons', 'Truck CK Stores', 'CK Potential', 'Top Competitor'].map(h => (
                  <th key={h} className={`py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 ${h === 'Corridor' || h === 'Top Competitor' ? 'text-left pr-4' : 'text-right px-3'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map(r => {
                const oppPct = r.totalGallons > 0 ? (r.captureGallons / r.totalGallons) * 100 : 0
                return (
                  <tr key={r.corridorId} className="hover:bg-gray-50">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900">{r.corridorName}</span>
                        {r.isHighway ? (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">US Hwy</span>
                        ) : (
                          <span className="text-xs text-zinc-400">{r.direction === 'EW' ? 'E↔W' : 'N↕S'}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">{fmtGallons(r.totalGallons)}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${r.captureRate >= 20 ? 'bg-green-100 text-green-700' : r.captureRate > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                        {fmtPct(r.captureRate)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {r.captureGallons > 0 ? (
                        <span className="text-green-700 font-semibold">{fmtGallons(r.captureGallons)}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-400 text-xs">{r.gapGallons > 0 ? fmtGallons(r.gapGallons) : '—'}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`text-xs font-semibold ${r.truckCKStoreCount >= 5 ? 'text-green-600' : r.truckCKStoreCount > 0 ? 'text-orange-600' : 'text-red-500'}`}>
                        {r.truckCKStoreCount}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-2 bg-green-500 rounded-full" style={{ width: `${Math.min(r.potentialRate, 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{fmtPct(r.potentialRate)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pl-3 text-xs text-gray-500 max-w-[120px] truncate">{r.topCompetitorBrand}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {otr.corridorResults.length > 8 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-3 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            {expanded
              ? <><ChevronUp size={15} />Show fewer</>
              : <><ChevronDown size={15} />Show all {otr.corridorResults.length} corridors</>}
          </button>
        )}

        {otr.offCorridorGallons > 0 && (
          <p className="mt-4 text-xs text-gray-400 flex items-start gap-1.5">
            <Info size={12} className="shrink-0 mt-0.5" />
            {fmtGallons(otr.offCorridorGallons)} gallons ({otr.offCorridorTransactions.toLocaleString()} transactions) did not snap to a
            major interstate corridor — likely local delivery or regional routes.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Annualized Projections ───────────────────────────────────────────────────

function AnnualizedPanel({
  summary,
  months,
}: {
  summary: TransactionSummary
  months: number
}) {
  const monthly = (n: number) => (months > 0 ? n / months : 0)
  const annual  = (n: number) => monthly(n) * 12

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={16} className="text-accent" />
        <h3 className="font-bold text-off-black text-sm">Annualized Projections</h3>
        <span className="text-xs text-gray-400">
          {months.toFixed(1)} mo of data → extrapolated to 12 mo
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Gallons / Yr</p>
          <p className="text-2xl font-bold text-off-black">{fmtGallons(annual(summary.totalGallons))}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtGallons(monthly(summary.totalGallons))} / mo</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Spend / Yr</p>
          <p className="text-2xl font-bold text-off-black">{fmtDollars(annual(summary.totalSpend))}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtDollars(monthly(summary.totalSpend))} / mo</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">CK Gallons / Yr</p>
          <p className="text-2xl font-bold text-brand-orange">{fmtGallons(annual(summary.ckCaptureAnalysis.captured.gallons))}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtGallons(monthly(summary.ckCaptureAnalysis.captured.gallons))} / mo</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Opportunity / Yr</p>
          <p className="text-2xl font-bold text-green-600">{fmtGallons(annual(summary.ckCaptureAnalysis.capturable.gallons))}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtGallons(monthly(summary.ckCaptureAnalysis.capturable.gallons))} / mo</p>
        </div>
      </div>
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
  return (
    <div className="mb-5 bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      {/* Analysis modules */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Settings2 size={15} className="text-gray-500" />
          <p className="text-sm font-semibold text-off-black">Analysis Modules</p>
        </div>
        <p className="text-xs text-gray-400 mb-3 ml-[23px]">
          Choose what to include. You can toggle these after upload too.
        </p>
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
              Best for quick reviews — re-upload to enable full analysis.
            </p>
          </div>
        </label>
      </div>
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
  const [expanded, setExpanded] = useState(false)
  const activeCount = FEATURE_DEFS.filter(d => flags[d.key]).length

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Settings2 size={15} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">Modules</span>
          <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
            {activeCount} of {FEATURE_DEFS.length} active
          </span>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-zinc-400 hover:text-zinc-700 flex items-center gap-1 font-medium transition-colors"
        >
          {expanded ? 'Collapse' : 'Edit'}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Collapsed: clickable pills */}
      {!expanded && (
        <div className="flex flex-wrap gap-1.5">
          {FEATURE_DEFS.map(def => (
            <button
              key={def.key}
              onClick={() => onChange(def.key, !flags[def.key])}
              title={def.desc}
              className={`text-xs rounded-full px-3 py-1 font-medium transition-all border ${
                flags[def.key]
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700'
              }`}
            >
              {def.label}
            </button>
          ))}
        </div>
      )}

      {/* Expanded: full grid with descriptions */}
      {expanded && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-1">
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
      )}
    </div>
  )
}

// ─── Vehicles Tab ────────────────────────────────────────────────────────────

function VehiclesTab({
  summary,
  showAll,
  setShowAll,
}: {
  summary: TransactionSummary
  showAll: boolean
  setShowAll: (v: boolean) => void
}) {
  const [mode, setMode] = useState<'driver' | 'vehicle'>(
    summary.hasDriverData ? 'driver' : 'vehicle'
  )
  const [query, setQuery] = useState('')
  const byDriver = mode === 'driver' && summary.hasDriverData
  const allRows = byDriver ? summary.driverBreakdown : summary.vehicleBreakdown

  const rows = query.trim()
    ? allRows.filter(row => {
        const q = query.toLowerCase()
        if ('driverName' in row) {
          const d = row as DriverSummary
          return d.driverName.toLowerCase().includes(q) || d.driverCity.toLowerCase().includes(q)
        }
        const v = row as (typeof summary.vehicleBreakdown)[0]
        return v.unitNumber.toLowerCase().includes(q) || v.driverCity.toLowerCase().includes(q)
      })
    : allRows

  const shown = (query.trim() || showAll) ? rows : rows.slice(0, 30)
  const entityLabel = byDriver ? 'drivers' : 'vehicles'

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="font-bold text-off-black">
            {byDriver ? 'Driver' : 'Vehicle'} Fueling Summary
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Per-{byDriver ? 'driver' : 'unit'} breakdown sorted by total gallons
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${entityLabel}…`}
            className="text-xs border border-zinc-200 rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <ViewToggle
            mode={mode} setMode={(m) => { setMode(m); setQuery('') }}
            hasDriver={summary.hasDriverData}
            hasVehicle={summary.vehicleBreakdown.length > 0}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {(byDriver
                ? ['Driver', 'Home City', 'Units', 'Trans', 'Gallons', 'Spend', 'CK Gallons', 'CK Share']
                : ['Unit #', 'Driver City', 'Trans', 'Gallons', 'Spend', 'CK Gallons', 'CK Share']
              ).map(h => (
                <th
                  key={h}
                  className={`py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
                    ['Driver', 'Unit #', 'Home City', 'Driver City', 'Units'].includes(h)
                      ? 'text-left pr-4' : 'text-right px-4'
                  }`}
                >{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map(row => {
              const isDriver = 'driverName' in row
              const d = row as DriverSummary
              const v = row as (typeof summary.vehicleBreakdown)[0]
              return (
                <tr key={isDriver ? d.driverName : v.unitNumber} className="hover:bg-gray-50">
                  {isDriver ? (
                    <>
                      <td className="py-2 pr-4 font-semibold text-off-black text-sm">{d.driverName}</td>
                      <td className="py-2 px-4 text-gray-600 text-xs">{d.driverCity || '—'}</td>
                      <td className="py-2 px-4 text-gray-500 text-xs">{d.unitNumbers.length || '—'}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 pr-4 font-mono font-semibold text-off-black text-xs">{v.unitNumber}</td>
                      <td className="py-2 px-4 text-gray-600 text-xs">{v.driverCity || '—'}</td>
                    </>
                  )}
                  <td className="py-2 px-4 text-right text-gray-600">{row.transactions}</td>
                  <td className="py-2 px-4 text-right font-medium">{fmtGallons(row.gallons)}</td>
                  <td className="py-2 px-4 text-right text-gray-600">{fmtDollars(row.spend)}</td>
                  <td className="py-2 px-4 text-right text-brand-orange font-medium">{fmtGallons(row.ckGallons)}</td>
                  <td className="py-2 pl-4 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      row.ckSharePct >= 20 ? 'bg-green-100 text-green-700'
                      : row.ckSharePct > 0 ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-500'
                    }`}>
                      {fmtPct(row.ckSharePct)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!query.trim() && rows.length > 30 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-4 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          {showAll
            ? <><ChevronUp size={16} />Show fewer</>
            : <><ChevronDown size={16} />Show all {rows.length} {entityLabel}</>}
        </button>
      )}
      {query.trim() && rows.length === 0 && (
        <p className="mt-4 text-sm text-gray-400 text-center py-4">No results for "{query}"</p>
      )}
    </div>
  )
}

// ─── Behavioral Insights Tab ─────────────────────────────────────────────────

const SEGMENT_ORDER: VehicleSegment['segment'][] = ['ck-loyal', 'mixed', 'mostly-competitor', 'never-ck']

/** Toggle pill used to switch between "By Driver" and "By Vehicle" views */
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

function BehavioralInsightsTab({ summary }: { summary: TransactionSummary }) {
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

  // Top opportunity list — works for both modes
  const topOpportunityVehicles = [...summary.vehicleBreakdown]
    .filter(v => v.capturableGallons > 0)
    .sort((a, b) => b.capturableGallons - a.capturableGallons)
  const topOpportunityDrivers = [...summary.driverBreakdown]
    .filter(d => d.capturableGallons > 0)
    .sort((a, b) => b.capturableGallons - a.capturableGallons)
  const topOpportunity = byDriver ? topOpportunityDrivers : topOpportunityVehicles

  return (
    <div className="space-y-8">
      {/* Segment cards */}
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

      {/* Top opportunity table */}
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

// ─── Time Patterns Tab ────────────────────────────────────────────────────────

function TimePatternsTab({ summary }: { summary: TransactionSummary }) {
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
      {/* Hourly chart */}
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

      {/* Day of week */}
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

// ─── Fraud Flags Tab ──────────────────────────────────────────────────────────

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
      {/* Summary */}
      <div>
        <h3 className="font-bold text-off-black mb-1">Anomaly Summary</h3>
        <p className="text-xs text-gray-400 mb-4">
          These patterns may warrant review. They do not confirm fraud — mismatched data, multi-axle tanks, and multi-stop routes can trigger some flags.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            { label: 'High Gallons',   count: flags.filter(f => f.type === 'high-gallons').length, color: 'text-red-600',    bg: 'bg-red-50 border-red-200',    desc: 'Single fill > 200 gal' },
            { label: 'Multi-Fill Day', count: flags.filter(f => f.type === 'multi-fill').length,   color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', desc: '3+ fills same vehicle/day' },
            { label: 'PPG Outlier',    count: flags.filter(f => f.type === 'ppg-outlier').length,  color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', desc: 'Price > 2.5× fleet median' },
            { label: 'State Hop',      count: flags.filter(f => f.type === 'state-hop').length,    color: 'text-red-600',    bg: 'bg-red-50 border-red-200',    desc: '2+ states same vehicle/day' },
          ] as const).map(item => (
            <div key={item.label} className={`rounded-xl border p-4 ${item.bg}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{item.label}</p>
              <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Flag table */}
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
      </div>
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

type Tab = 'brands' | 'geographic' | 'locations' | 'vehicles' | 'map' | 'insights' | 'timing' | 'fraud'

const TAB_FEATURE_MAP: Record<Tab, FeatureKey> = {
  brands:    'brandBreakdown',
  geographic:'geographic',
  locations: 'competitorLocations',
  vehicles:  'vehicles',
  map:       'mapView',
  insights:  'behavioralInsights',
  timing:    'timeOfDay',
  fraud:     'fraudFlags',
}

const ALL_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'brands',    label: 'Brand Breakdown',          icon: <BarChart2 size={16} /> },
  { id: 'geographic',label: 'Geographic',               icon: <MapPin size={16} /> },
  { id: 'locations', label: 'Top Competitor Locations', icon: <Fuel size={16} /> },
  { id: 'vehicles',  label: 'Vehicles',                 icon: <Car size={16} /> },
  { id: 'map',       label: 'Map View',                 icon: <MapPin size={16} /> },
  { id: 'insights',  label: 'Behavioral Insights',      icon: <Users size={16} /> },
  { id: 'timing',    label: 'Time Patterns',            icon: <Clock size={16} /> },
  { id: 'fraud',     label: 'Fraud Flags',              icon: <ShieldAlert size={16} /> },
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
  const [activeTab, setActiveTab] = useState<Tab>('brands')
  const [showAllBrands, setShowAllBrands] = useState(false)
  const [showAllVehicles, setShowAllVehicles] = useState(false)
  const [restoredFromCache, setRestoredFromCache] = useState(false)
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(DEFAULT_FEATURES)
  const [savedAnalysisId, setSavedAnalysisId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [summaryCopied, setSummaryCopied] = useState(false)
  const [rebateRate, setRebateRate] = useState(3)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Always-current ref so processFile can read flags without stale closure
  const featureFlagsRef = useRef<FeatureFlags>(DEFAULT_FEATURES)
  useEffect(() => { featureFlagsRef.current = featureFlags }, [featureFlags])

  const toggleFeature = useCallback((key: FeatureKey, val: boolean) => {
    setFeatureFlags(prev => ({ ...prev, [key]: val }))
  }, [])

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
      if (saved.featureFlags) setFeatureFlags({ ...DEFAULT_FEATURES, ...saved.featureFlags })
      if (saved.summary?.rebateRate) setRebateRate(saved.summary.rebateRate)
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
      setLoading(false)
      // Load CK pins for map
      fetch('/stores-data.json')
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
    const result = await createAnalysis(customerName, fileName, { ...summary, rebateRate } as unknown as Record<string, unknown>)
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
      const resp = await fetch('/stores-data.json')
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

      const enrichedResult = analyzeTransactions(transactions, ckZipSet, {
        detectedFormat: fmt,
        geocodedCoords,
        geocodedAddresses: geocodedAddrs,
        ckStores: ckStoreCoords,
      })

      setSummary(enrichedResult)

      setFeatureFlags(prev => {
        try {
          localStorage.setItem('ck-analysis-v1', JSON.stringify({
            summary: enrichedResult, fileName: file.name, customerName,
            detectedFormat: fmt, missingFields: missingRequiredFields, featureFlags: prev,
          }))
        } catch { /* storage full */ }
        return prev
      })

      setGeocodingInProgress(false)
      setGeocodingProgress(null)

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
    try { localStorage.removeItem('ck-analysis-v1') } catch { /* ignore */ }
    if (fileInputRef.current) fileInputRef.current.value = ''
    window.history.replaceState(null, '', '/analysis')
  }

  // Tabs filtered to only those whose feature is enabled
  const visibleTabs = ALL_TABS.filter(t => featureFlags[TAB_FEATURE_MAP[t.id]])

  // Months spanned by data (used by Savings Calc and Annualized panels)
  const monthSpan = summary ? computeMonthSpan(summary.dateRange) : 1

  // ── Full-page loading screen (parsing or geocoding) ──────────────────────────
  if (loading || geocodingInProgress) {
    const isGeocoding = geocodingInProgress
    const pct = geocodingProgress
      ? Math.round((geocodingProgress.done / geocodingProgress.total) * 100)
      : 0

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
    <div className="min-h-screen bg-off-white" style={{ backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)', backgroundSize: '28px 28px', backgroundAttachment: 'fixed' }}>
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

            {/* Feature Selector */}
            <FeatureSelector flags={featureFlags} onChange={toggleFeature} />

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
                  {['Date', 'City', 'State', 'Gallons', 'Fuel Type'].map(c => (
                    <span key={c} className="bg-zinc-100 text-zinc-600 text-xs rounded px-2 py-0.5 font-mono font-semibold">{c}</span>
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
                    <span className="text-xs bg-zinc-100 text-zinc-500 rounded px-2 py-0.5">Restored from last session</span>
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

            {/* Summary stats */}
            <div className="rounded-xl border border-zinc-200 overflow-hidden bg-zinc-100 shadow-sm">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px stagger-stats">
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
            </div>

            {/* Annualized Projections (if enabled) */}
            {featureFlags.annualized && (
              <div className="fade-in"><AnnualizedPanel summary={summary} months={monthSpan} /></div>
            )}

            {/* CK Opportunity Panel */}
            <div className="fade-in"><OpportunityPanel analysis={summary.ckCaptureAnalysis} totalGallons={summary.totalGallons} /></div>

            {/* Savings Calculator (if enabled) */}
            {featureFlags.savingsCalc && (
              <div className="fade-in"><SavingsCalculatorPanel
                captured={summary.ckCaptureAnalysis.captured}
                capturable={summary.ckCaptureAnalysis.capturable}
                months={monthSpan}
                rebateRate={rebateRate}
                onRebateChange={setRebateRate}
              /></div>
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
                  {activeTab === 'geographic' && featureFlags.geographic && (
                    <div>
                      <h3 className="font-bold text-off-black mb-4">Fueling Activity by State</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              {['State', 'Transactions', 'Gallons', 'Spend', 'CK Gallons', 'Opp. Gallons', 'CK Share'].map(h => (
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
                                <td className="py-2.5 px-4 text-right text-accent font-medium">{fmtGallons(row.ckGallons)}</td>
                                <td className="py-2.5 px-4 text-right text-green-600 font-medium">
                                  {row.capturableGallons > 0 ? fmtGallons(row.capturableGallons) : <span className="text-gray-300">—</span>}
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
                    </div>
                  )}

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

                      {/* Top CK Opportunity Locations */}
                      {summary.topCKOpportunityLocations.length > 0 && (
                        <div className="mt-8">
                          <div className="mb-4">
                            <h3 className="font-bold text-off-black">Top Circle K Opportunity Locations</h3>
                            <p className="text-xs text-gray-400 mt-0.5">Circle K stores with the most competitor gallons fueled within 5 miles — sorted by capture potential</p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  {['Circle K Location', 'City / State', 'Truck Stop', 'Competitor Gallons', 'Stations', 'Comp. Spend'].map(h => (
                                    <th key={h} className={`py-2 ${['Circle K Location', 'City / State', 'Truck Stop'].includes(h) ? 'text-left px-4 first:pl-0' : 'text-right px-4'} text-xs font-semibold uppercase tracking-wider text-gray-500`}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {summary.topCKOpportunityLocations.map((loc, i) => (
                                  <tr key={i} className="hover:bg-gray-50">
                                    <td className="py-2.5 pr-4 font-medium text-off-black max-w-[200px] truncate">
                                      {loc.ckName}
                                      {loc.siteNumber && <span className="ml-1.5 text-xs text-gray-400 font-normal">#{loc.siteNumber}</span>}
                                    </td>
                                    <td className="py-2.5 px-4 text-gray-500 text-xs whitespace-nowrap">{loc.city}, {loc.state}</td>
                                    <td className="py-2.5 px-4">
                                      {loc.truckAccessible
                                        ? <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-600 rounded px-2 py-0.5 font-semibold">Truck</span>
                                        : <span className="inline-flex items-center gap-1 text-xs bg-zinc-50 text-zinc-400 rounded px-2 py-0.5">C-Store</span>}
                                    </td>
                                    <td className="py-2.5 px-4 text-right font-semibold text-zinc-700">{fmtGallons(loc.competitorGallons)}</td>
                                    <td className="py-2.5 px-4 text-right text-gray-600">{loc.nearbyStationCount}</td>
                                    <td className="py-2.5 pl-4 text-right text-gray-600">{fmtDollars(loc.competitorSpend)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Vehicles Tab ─────────────────────────────────────── */}
                  {activeTab === 'vehicles' && featureFlags.vehicles && (
                    <VehiclesTab summary={summary} showAll={showAllVehicles} setShowAll={setShowAllVehicles} />
                  )}

                  {/* ── Map Tab ──────────────────────────────────────────── */}
                  {activeTab === 'map' && featureFlags.mapView && (
                    <div className="space-y-6">
                      {summary.proximityBreakdownAll && !geocodingInProgress ? (
                        <>
                          <ProximityPanel prox={summary.proximityBreakdownAll} totalGallons={summary.totalGallons} isMobileFueling={isMobileFueling} />
                          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
                              <div>
                                <h2 className="text-zinc-900 font-bold text-lg">Proximity Breakdown</h2>
                                <p className="text-zinc-500 text-sm mt-0.5">Distance bands to nearest Circle K</p>
                              </div>
                              <MapPin className="text-zinc-400 shrink-0" size={22} />
                            </div>
                            <div className="p-6 grid grid-cols-1">
                              <DetailedProximityPanel
                                prox={summary.proximityBreakdownAll}
                                title="Circle K"
                                subtitle="Full CK network"
                                monthSpan={monthSpan}
                              />
                            </div>
                          </div>
                        </>
                      ) : geocodingInProgress ? (
                        <div className="rounded-xl bg-accent-muted border border-accent/20 px-4 py-3 text-sm text-accent flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                          Geocoding locations for proximity analysis…
                          {geocodingProgress && ` (${geocodingProgress.done}/${geocodingProgress.total})`}
                        </div>
                      ) : (
                        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-500">
                          Proximity analysis requires a Mapbox token configured in your environment.
                        </div>
                      )}
                      <FuelingMap
                        transactionPoints={summary.mapPoints}
                        ckStores={ckStorePins}
                        height={560}
                        geocodingInProgress={geocodingInProgress}
                      />
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
                </div>
              </div>
            )}

            {/* Fuel Type Split (if enabled) */}
            {featureFlags.fuelTypeSplit && summary.fuelTypeBreakdown.length > 1 && (
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
