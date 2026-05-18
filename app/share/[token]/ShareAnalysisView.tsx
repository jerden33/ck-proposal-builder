'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { CKStorePin } from '@/components/FuelingMap'
import type { OTRMapStore } from '@/components/OTRMap'
import type { MapPoint } from '@/lib/transaction-analysis'

const FuelingMap = dynamic(() => import('@/components/FuelingMap').then(m => m.FuelingMap), {
  ssr: false,
  loading: () => <div className="bg-gray-100 rounded-xl animate-pulse" style={{ height: 480 }} />,
})

const OTRMap = dynamic(() => import('@/components/OTRMap').then(m => m.OTRMap), {
  ssr: false,
  loading: () => <div className="bg-gray-100 rounded-xl animate-pulse" style={{ height: 420 }} />,
})
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Info,
  DollarSign,
  TrendingUp,
  Clock,
  Mail,
  User,
  Truck,
  Zap,
} from 'lucide-react'
import type { OTRAnalysis } from '@/lib/otr-analysis'
import {
  fmtGallons,
  fmtDollars,
  fmtPct,
  fmtMiles,
  type TransactionSummary,
  type FraudFlag,
} from '@/lib/transaction-analysis'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShareData {
  id: string
  analysis_id: string
  token: string
  type: 'internal' | 'customer'
  view_count: number
  created_at: string
}

interface AnalysisData {
  id: string
  account_name: string
  file_name: string
  detected_format: string
  date_range_start: string | null
  date_range_end: string | null
  total_transactions: number
  total_gallons: number
  total_spend: number
  data: TransactionSummary
}

interface RepData {
  full_name: string | null
  email: string
}

interface Props {
  share: ShareData
  analysis: AnalysisData
  rep: RepData
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeMonthSpan(dateRange: { start: string; end: string }): number {
  if (!dateRange.start || !dateRange.end) return 1
  const start = new Date(dateRange.start)
  const end   = new Date(dateRange.end)
  const diff  = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  return Math.max(diff, 1)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-1.5 leading-tight truncate">{sub}</p>}
    </div>
  )
}

function BrandBar({ brand, maxGallons }: { brand: TransactionSummary['brandBreakdown'][0]; maxGallons: number }) {
  const pct = maxGallons > 0 ? (brand.gallons / maxGallons) * 100 : 0
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-36 shrink-0">
        <span className={`text-sm font-medium ${brand.isCircleK ? 'text-brand-orange' : 'text-off-black'}`}>
          {brand.brand}
        </span>
      </div>
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-5 rounded-full ${brand.isCircleK ? 'bg-brand-orange' : 'bg-gray-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-24 text-right text-sm font-semibold text-off-black shrink-0">{fmtGallons(brand.gallons)}</span>
      <span className="w-16 text-right text-xs text-gray-400 shrink-0">{fmtPct(pct)}</span>
    </div>
  )
}

// ─── Opportunity Panel ────────────────────────────────────────────────────────

function OpportunityPanel({
  analysis,
  totalGallons,
  isCustomer,
}: {
  analysis: TransactionSummary['ckCaptureAnalysis']
  totalGallons: number
  isCustomer: boolean
}) {
  const { captured, capturable, gap, captureRate, potentialRate, methodology } = analysis
  const isProximity = methodology === 'proximity'
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4">
        <h2 className="text-zinc-900 font-bold text-lg">
          {isCustomer ? 'Your Fueling Optimization Opportunity' : 'Circle K Fueling Opportunity'}
        </h2>
        <p className="text-zinc-500 text-sm mt-0.5">
          {isCustomer
            ? "Where your fleet's gallons go — and potential savings with the Circle K network"
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
              <span>Current Circle K fueling</span>
              <span className="font-semibold text-zinc-600">{fmtPct(captureRate)}</span>
            </div>
            <div className="h-1.5 bg-zinc-100 rounded-full">
              <div className="h-1.5 bg-accent rounded-full transition-all" style={{ width: `${captureRate}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Potential with Circle K network</span>
              <span className="font-semibold text-zinc-600">{fmtPct(potentialRate)}</span>
            </div>
            <div className="h-1.5 bg-zinc-100 rounded-full">
              <div className="h-1.5 bg-green-500 rounded-full transition-all" style={{ width: `${potentialRate}%` }} />
            </div>
          </div>
        </div>

        {/* Data grid */}
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
                  {isCustomer ? 'Savings Opportunity' : 'Opportunity — CK Nearby'}
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
            {isCustomer
              ? `are going to other stations where a Circle K already exists ${isProximity ? 'within 10 miles' : 'nearby'} — a direct savings opportunity.`
              : `are going to competitors where a Circle K already exists ${isProximity ? 'within 10 miles' : 'in the same area'}.`}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Savings Calculator ────────────────────────────────────────────────────────

function SavingsCalculatorPanel({
  captured,
  capturable,
  proximityBreakdown,
  months,
  isCustomer,
  initialRebateRate,
}: {
  captured: { gallons: number; spend: number }
  capturable: { gallons: number; spend: number }
  proximityBreakdown: NonNullable<TransactionSummary['proximityBreakdown']> | null
  months: number
  isCustomer: boolean
  initialRebateRate: number
}) {
  const [rebateRate, setRebateRate] = useState(initialRebateRate)

  // Use captured + capturable (zip-based). If both are 0, fall back to proximity data.
  const eligibleGallons = (() => {
    const zipBased = captured.gallons + capturable.gallons
    if (zipBased > 0) return zipBased
    if (proximityBreakdown) {
      return proximityBreakdown.ckGallons +
        proximityBreakdown.within1mi.gallons +
        proximityBreakdown.within2mi.gallons +
        proximityBreakdown.within5mi.gallons +
        proximityBreakdown.within10mi.gallons
    }
    return 0
  })()

  const monthlyGal     = eligibleGallons / months
  const annualGal      = monthlyGal * 12
  const monthlySavings = monthlyGal * (rebateRate / 100)
  const annualSavings  = annualGal  * (rebateRate / 100)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-zinc-900 font-bold text-lg">Potential Savings Calculator</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Estimated annual rebate value at Circle K</p>
        </div>
        <DollarSign className="text-zinc-400" size={26} />
      </div>
      <div className="p-6">
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Circle K Rebate Rate
            {isCustomer && <span className="ml-2 text-xs font-normal text-gray-400">(set by your rep)</span>}
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={rebateRate}
              onChange={e => !isCustomer && setRebateRate(Number(e.target.value))}
              disabled={isCustomer}
              className={`flex-1 h-2 accent-[#0EA5E9] ${isCustomer ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
            />
            <div className="shrink-0 flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={rebateRate}
                onChange={e => !isCustomer && setRebateRate(Number(e.target.value))}
                readOnly={isCustomer}
                className={`w-16 border border-zinc-200 rounded-lg px-2 py-1.5 text-sm text-center font-bold focus:outline-none ${isCustomer ? 'bg-zinc-50 text-zinc-600 cursor-default' : 'focus:ring-2 focus:ring-accent/30 focus:border-accent'}`}
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
          Based on {fmtGallons(eligibleGallons)} eligible gallons across {months.toFixed(1)} months of data, extrapolated to 12 months.
        </p>
      </div>
    </div>
  )
}

// ─── Annualized Panel ──────────────────────────────────────────────────────────

function AnnualizedPanel({ summary, months }: { summary: TransactionSummary; months: number }) {
  const monthly = (n: number) => (months > 0 ? n / months : 0)
  const annual  = (n: number) => monthly(n) * 12
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={16} className="text-accent" />
        <h3 className="font-bold text-off-black text-sm">Annualized Projections</h3>
        <span className="text-xs text-gray-400">{months.toFixed(1)} mo of data → extrapolated to 12 mo</span>
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

// ─── Proximity Panel ──────────────────────────────────────────────────────────

function ProximityPanel({
  prox,
  totalGallons,
  isCustomer,
}: {
  prox: NonNullable<TransactionSummary['proximityBreakdown']>
  totalGallons: number
  isCustomer: boolean
}) {
  const within2mi       = prox.within1mi.gallons + prox.within2mi.gallons
  const opportunityGallons =
    within2mi + prox.within5mi.gallons + prox.within10mi.gallons
  const opportunityPct = totalGallons > 0 ? (opportunityGallons / totalGallons) * 100 : 0

  const rows = [
    {
      label: 'Fueled at Circle K',
      customerLabel: 'Fueled at Circle K',
      gallons: prox.ckGallons,
      color: '#16a34a',
      badge: null,
    },
    {
      label: 'Competitor — CK within 10 mi',
      customerLabel: 'Near a Circle K location',
      gallons: opportunityGallons,
      color: '#3b82f6',
      badge: 'Opportunity',
    },
    {
      label: 'Competitor — no CK within 10 mi',
      customerLabel: 'No CK within 10 miles',
      gallons: prox.beyond10mi.gallons,
      color: '#dc2626',
      badge: null,
    },
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-bold text-off-black text-lg">
            {isCustomer ? 'How Close Is Circle K to Your Drivers?' : 'Distance-Based Proximity to Circle K'}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Based on geocoded fueling locations &nbsp;·&nbsp; {fmtPct(prox.geocodedPct)} of total gallons geocoded
          </p>
        </div>
        {opportunityGallons > 0 && (
          <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 text-right shrink-0 ml-4">
            <span className="font-bold">{fmtGallons(opportunityGallons)} gal</span><br />
            <span className="opacity-80">within 10 mi of CK ({fmtPct(opportunityPct)})</span>
          </div>
        )}
      </div>
      {within2mi > 0 && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0 mt-1" />
          <p className="text-sm text-green-800">
            <span className="font-bold">{fmtGallons(within2mi)}</span> gallons were fueled within <span className="font-bold">2 miles</span> of a Circle K — drivers drove right past without stopping.
          </p>
        </div>
      )}
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
        {rows.map(row => {
          const pct = totalGallons > 0 ? (row.gallons / totalGallons) * 100 : 0
          return (
            <div key={row.label} className="flex items-center gap-3 px-4 py-3 bg-white">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
              <span className="flex-1 text-sm text-gray-700">
                {isCustomer ? row.customerLabel : row.label}
              </span>
              {row.badge && row.gallons > 0 && (
                <span className="text-xs bg-green-50 text-green-700 rounded px-1.5 py-0.5 font-semibold">{row.badge}</span>
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

// ─── OTR Corridor Analysis Panel ─────────────────────────────────────────────

/** Truncate a brand/station name to a clean display label (max 18 chars). */
function shortBrand(name: string): string {
  if (!name || name === '—') return '—'
  // Strip trailing location codes like "#432", "# 12", store numbers
  const clean = name.replace(/\s*#\s*\d+.*$/i, '').trim()
  return clean.length > 18 ? clean.slice(0, 16) + '…' : clean
}

/** Top-N state abbreviations for a corridor sorted by gallons. */
function topStates(breakdown: Record<string, number>, n = 3): string {
  const entries = Object.entries(breakdown ?? {})
  if (!entries.length) return ''
  return entries.slice(0, n).map(([s]) => s).join(' · ')
}

function OTRCorridorPanel({ otr, months, mapPoints, truckStores }: { otr: OTRAnalysis; months: number; mapPoints: MapPoint[]; truckStores: OTRMapStore[] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? otr.corridorResults : otr.corridorResults.slice(0, 6)

  const totalOpp      = otr.corridorResults.reduce((s, r) => s + r.captureGallons, 0)
  const totalNearMiss = otr.corridorResults.reduce((s, r) => s + (r.nearMissGallons ?? 0), 0)
  const annualOpp     = months > 0 ? (totalOpp / months) * 12 : totalOpp
  const annualNearMiss = months > 0 ? (totalNearMiss / months) * 12 : totalNearMiss

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-zinc-900 font-bold text-lg">OTR Corridor Analysis</h2>
            <span className="bg-zinc-200 text-zinc-600 text-xs font-bold px-2 py-0.5 rounded-full">OTR</span>
          </div>
          <p className="text-zinc-500 text-sm mt-0.5">
            Fueling opportunity along interstates and major US/state highways
          </p>
        </div>
        <Truck className="text-zinc-400 shrink-0" size={26} />
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-200 border-b border-gray-200">
        <div className="px-4 py-3 text-center">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Active Corridors</p>
          <p className="text-xl font-bold text-off-black">{otr.corridorResults.length}</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">On-Corridor Gallons</p>
          <p className="text-xl font-bold text-off-black">{fmtGallons(otr.totalCorridorGallons)}</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-0.5">Near-Miss (Annual)</p>
          <p className="text-xl font-bold text-amber-600">{fmtGallons(annualNearMiss)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">drove past a CK</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-0.5">Annual Opportunity</p>
          <p className="text-xl font-bold text-green-600">{fmtGallons(annualOpp)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">within 30 mi of a CK</p>
        </div>
      </div>

      {/* Legend strip */}
      <div className="px-5 pt-4 pb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 border-b border-gray-100">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
          <strong>Near-Miss</strong> — fill ≤5 mi from a CK truck stop (driver drove past)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-600" />
          <strong>Opportunity</strong> — fill within 30 mi of a CK (on-corridor)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400" />
          <strong>True Gap</strong> — no CK within 30 mi (site selection opportunity)
        </span>
      </div>

      <div className="p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-left pr-4">Corridor</th>
                <th className="py-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Gallons</th>
                <th className="py-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">CK%</th>
                <th className="py-2 px-3 text-xs font-semibold uppercase tracking-wider text-amber-600 text-right">Near-Miss</th>
                <th className="py-2 px-3 text-xs font-semibold uppercase tracking-wider text-green-700 text-right">Opportunity</th>
                <th className="py-2 px-3 text-xs font-semibold uppercase tracking-wider text-red-400 text-right">True Gap</th>
                <th className="py-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">CK Stops</th>
                <th className="py-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Potential</th>
                <th className="py-2 pl-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-left">Competitors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map(r => {
                const topStatesLabel = topStates(r.stateBreakdown ?? {})
                const competitors = (r.competitorBreakdown ?? []).slice(0, 3)
                return (
                  <tr key={r.corridorId} className="hover:bg-gray-50 align-top">
                    {/* Corridor name + states */}
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-off-black">{r.corridorName}</span>
                        {r.isHighway
                          ? <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">Hwy</span>
                          : <span className="text-xs text-zinc-400">{r.direction === 'EW' ? 'E↔W' : 'N↕S'}</span>
                        }
                      </div>
                      {topStatesLabel && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{topStatesLabel}</p>
                      )}
                    </td>

                    {/* Total gallons */}
                    <td className="py-2.5 px-3 text-right font-medium text-off-black">{fmtGallons(r.totalGallons)}</td>

                    {/* CK capture rate */}
                    <td className="py-2.5 px-3 text-right">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${
                        r.captureRate >= 20 ? 'bg-green-100 text-green-700'
                        : r.captureRate > 0 ? 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-500'
                      }`}>
                        {fmtPct(r.captureRate)}
                      </span>
                    </td>

                    {/* Near-miss gallons */}
                    <td className="py-2.5 px-3 text-right">
                      {(r.nearMissGallons ?? 0) > 0
                        ? <span className="text-amber-600 font-semibold">{fmtGallons(r.nearMissGallons)}</span>
                        : <span className="text-zinc-200">—</span>}
                    </td>

                    {/* Opportunity gallons (0-30 mi) */}
                    <td className="py-2.5 px-3 text-right">
                      {r.captureGallons > 0
                        ? <span className="text-green-700 font-semibold">{fmtGallons(r.captureGallons)}</span>
                        : <span className="text-zinc-200">—</span>}
                    </td>

                    {/* True gap gallons */}
                    <td className="py-2.5 px-3 text-right text-red-400 text-xs">
                      {r.gapGallons > 0 ? fmtGallons(r.gapGallons) : <span className="text-zinc-200">—</span>}
                    </td>

                    {/* CK truck store count */}
                    <td className="py-2.5 px-3 text-right">
                      <span className={`text-xs font-semibold ${
                        r.truckCKStoreCount >= 5 ? 'text-green-600'
                        : r.truckCKStoreCount > 0 ? 'text-orange-600'
                        : 'text-red-500'
                      }`}>
                        {r.truckCKStoreCount}
                      </span>
                    </td>

                    {/* Potential rate bar */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-14 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-1.5 bg-green-500 rounded-full" style={{ width: `${Math.min(r.potentialRate, 100)}%` }} />
                        </div>
                        <span className="text-xs text-zinc-500 w-8 text-right">{fmtPct(r.potentialRate)}</span>
                      </div>
                    </td>

                    {/* Competitor breakdown — top 3 brands */}
                    <td className="py-2.5 pl-3 max-w-[150px]">
                      {competitors.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {competitors.map((c, i) => (
                            <span key={i} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 font-medium leading-tight">
                              {shortBrand(c.brand)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-zinc-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {otr.corridorResults.length > 6 && (
          <button onClick={() => setExpanded(v => !v)} className="mt-3 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 transition-colors">
            {expanded ? <><ChevronUp size={15} />Show fewer</> : <><ChevronDown size={15} />Show all {otr.corridorResults.length} corridors</>}
          </button>
        )}

        {otr.offCorridorGallons > 0 && (
          <p className="mt-4 text-xs text-gray-400 flex items-start gap-1.5">
            <Info size={12} className="shrink-0 mt-0.5" />
            {fmtGallons(otr.offCorridorGallons)} gallons were fueled off covered corridors (local routes not mapped to a major corridor).
          </p>
        )}

        {/* Corridor map */}
        {mapPoints.length > 0 && (
          <div className="mt-5 rounded-xl overflow-hidden border border-gray-200">
            <OTRMap
              transactionPoints={mapPoints}
              ckStores={truckStores}
              corridorResults={otr.corridorResults}
              height={420}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Fraud Flags (internal only) ──────────────────────────────────────────────

const FRAUD_TYPE_LABELS: Record<FraudFlag['type'], string> = {
  'high-gallons': 'High Gallons',
  'multi-fill':   'Multi-Fill Day',
  'ppg-outlier':  'PPG Outlier',
  'state-hop':    'State Hop',
}

function FraudFlagsSection({ flags }: { flags: FraudFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 p-8 text-center">
        <CheckCircle size={32} className="mx-auto text-green-500 mb-3" />
        <p className="font-semibold text-gray-700 mb-1">No anomalies detected</p>
        <p className="text-sm text-gray-500">No high-gallon fills, multi-fill days, PPG outliers, or state hops found.</p>
      </div>
    )
  }
  return (
    <div className="space-y-6">
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
  )
}

// ─── Time Patterns (internal only) ────────────────────────────────────────────

function TimePatternsSection({ summary }: { summary: TransactionSummary }) {
  if (!summary.hasTimeData) {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
        <Clock size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="font-semibold text-gray-600 mb-1">No timestamp data found</p>
        <p className="text-sm text-gray-400">Time pattern analysis requires a transaction export that includes time alongside the date.</p>
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

// ─── Rep Contact Card (customer only) ─────────────────────────────────────────

function RepContactCard({ rep }: { rep: RepData }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-brand-orange px-6 py-4">
        <h2 className="text-white font-bold text-lg">Your Circle K Rep</h2>
        <p className="text-orange-100 text-sm mt-0.5">Get in touch to learn more or get started</p>
      </div>
      <div className="p-6 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
        <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
          <User size={26} className="text-zinc-500" />
        </div>
        <div className="space-y-2">
          {rep.full_name && (
            <p className="text-xl font-bold text-off-black">{rep.full_name}</p>
          )}
          <a
            href={`mailto:${rep.email}`}
            className="inline-flex items-center gap-2 text-accent hover:underline font-medium"
          >
            <Mail size={16} />
            {rep.email}
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = 'brands' | 'geographic' | 'locations' | 'vehicles' | 'insights' | 'timing' | 'fraud' | 'map'

// ─── Main Component ───────────────────────────────────────────────────────────

export function ShareAnalysisView({ share, analysis, rep }: Props) {
  const summary = analysis.data
  const isCustomer = share.type === 'customer'
  const months = computeMonthSpan(summary.dateRange)

  const internalTabs: { id: Tab; label: string }[] = [
    { id: 'brands',    label: 'Brand Breakdown' },
    { id: 'geographic',label: 'Geographic' },
    { id: 'locations', label: 'Competitor Locations' },
    { id: 'map',       label: 'Map' },
    { id: 'vehicles',  label: 'Vehicles' },
    { id: 'insights',  label: 'Behavioral Insights' },
    { id: 'timing',    label: 'Time Patterns' },
    { id: 'fraud',     label: 'Fraud Flags' },
  ]
  const customerTabs: { id: Tab; label: string }[] = [
    { id: 'brands',    label: 'Brand Breakdown' },
    { id: 'geographic',label: 'Geographic' },
    { id: 'locations', label: 'Top Stations' },
    { id: 'map',       label: 'Map' },
  ]

  const tabs = isCustomer ? customerTabs : internalTabs
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0].id)
  const [showAllBrands, setShowAllBrands] = useState(false)
  const [showAllVehicles, setShowAllVehicles] = useState(false)
  const [ckStorePins, setCKStorePins] = useState<CKStorePin[]>([])

  useEffect(() => {
    fetch('/api/stores-data')
      .then(r => r.json())
      .then((data) => {
        const pins: CKStorePin[] = (data.stores ?? [])
          .filter((s: { coordinates?: { lat: number; lng: number }; truckAccessible?: boolean; name?: string; city?: string; state?: string; zip?: string }) =>
            s.coordinates?.lat && s.coordinates?.lng)
          .map((s: { coordinates: { lat: number; lng: number }; name?: string; city?: string; state?: string; zip?: string; truckAccessible?: boolean }) => ({
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
  }, [])

  return (
    <div className="min-h-screen bg-off-white">
      {/* Header bar */}
      <div className="bg-white border-b border-zinc-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-accent rounded-md flex items-center justify-center">
              <Zap size={12} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-zinc-800 text-sm">Fleet Insights</span>
          </div>
          <div className="w-px h-4 bg-zinc-200" />
          <span className="text-zinc-400 text-sm">Fleet Analysis Report</span>
        </div>
        {!isCustomer && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="bg-zinc-100 text-zinc-600 px-2 py-1 rounded-full text-xs font-semibold">Internal</span>
            <span>{share.view_count} view{share.view_count !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Report header */}
        <div>
          {analysis.account_name ? (
            <>
              <p className="text-sm text-gray-500 mb-0.5">{isCustomer ? 'Prepared for' : 'Analysis for'}</p>
              <h1 className="text-3xl font-bold text-off-black">{analysis.account_name}</h1>
            </>
          ) : (
            <h1 className="text-3xl font-bold text-off-black">Fleet Analysis</h1>
          )}
          <p className="text-sm text-gray-400 mt-0.5">
            {analysis.date_range_start}
            {analysis.date_range_end && analysis.date_range_end !== analysis.date_range_start
              ? ` – ${analysis.date_range_end}`
              : ''}
            {!isCustomer && analysis.file_name && <> &bull; {analysis.file_name}</>}
          </p>
          {!isCustomer && analysis.detected_format && (
            <span className="inline-block mt-1 text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5 font-medium">
              {analysis.detected_format}
            </span>
          )}
        </div>

        {/* Summary stats */}
        <div className="rounded-xl border border-zinc-200 overflow-hidden bg-zinc-100 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px">
            <StatCard label="Transactions" value={summary.totalTransactions.toLocaleString()} />
            <StatCard label="Total Gallons" value={fmtGallons(summary.totalGallons)} />
            <StatCard label="Total Spend" value={fmtDollars(summary.totalSpend)} />
            <StatCard label="Vehicles" value={summary.uniqueVehicles.toLocaleString()} />
            <StatCard label="Stations" value={summary.uniqueStations.toLocaleString()} />
            <StatCard
              label="States"
              value={summary.uniqueStates.length.toString()}
              sub={summary.uniqueStates.slice(0, 6).join(', ') + (summary.uniqueStates.length > 6 ? '…' : '')}
            />
          </div>
        </div>

        {/* Annualized */}
        <AnnualizedPanel summary={summary} months={months} />

        {/* Opportunity */}
        <OpportunityPanel
          analysis={summary.ckCaptureAnalysis}
          totalGallons={summary.totalGallons}
          isCustomer={isCustomer}
        />

        {/* Proximity (only when geocoded data is available) */}
        {summary.proximityBreakdown && (
          <ProximityPanel
            prox={summary.proximityBreakdown}
            totalGallons={summary.totalGallons}
            isCustomer={isCustomer}
          />
        )}

        {/* OTR Corridor Analysis (when rep ran it) */}
        {summary.otrAnalysis && summary.otrAnalysis.corridorResults.length > 0 && (
          <OTRCorridorPanel
            otr={summary.otrAnalysis}
            months={months}
            mapPoints={summary.mapPoints ?? []}
            truckStores={ckStorePins
              .filter(p => p.truckAccessible)
              .map(p => ({ lat: p.lat, lng: p.lng, name: p.name ?? '', city: p.city ?? '', state: p.state ?? '' }))}
          />
        )}

        {/* Savings Calculator */}
        <SavingsCalculatorPanel
          captured={summary.ckCaptureAnalysis.captured}
          capturable={summary.ckCaptureAnalysis.capturable}
          proximityBreakdown={summary.proximityBreakdown ?? null}
          months={months}
          isCustomer={isCustomer}
          initialRebateRate={summary.rebateRate ?? 3}
        />

        {/* Tabbed detail sections */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-accent text-accent bg-accent-muted/20'
                    : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* Brand Breakdown */}
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
                  <button onClick={() => setShowAllBrands(v => !v)} className="mt-4 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 transition-colors">
                    {showAllBrands ? <><ChevronUp size={16} />Show fewer</> : <><ChevronDown size={16} />Show all {summary.brandBreakdown.length} brands</>}
                  </button>
                )}
              </div>
            )}

            {/* Geographic */}
            {activeTab === 'geographic' && (
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

            {/* Competitor Locations */}
            {activeTab === 'locations' && (
              <div>
                <div className="mb-4">
                  <h3 className="font-bold text-off-black">
                    {isCustomer ? 'Top Non-Circle K Fueling Locations' : 'Top Competitor Fueling Locations'}
                  </h3>
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

            {/* Vehicles (internal only) */}
            {activeTab === 'vehicles' && !isCustomer && (
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
                  <button onClick={() => setShowAllVehicles(v => !v)} className="mt-4 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 transition-colors">
                    {showAllVehicles ? <><ChevronUp size={16} />Show fewer</> : <><ChevronDown size={16} />Show all {summary.vehicleBreakdown.length} vehicles</>}
                  </button>
                )}
              </div>
            )}

            {/* Map */}
            {activeTab === 'map' && (
              <div>
                <div className="mb-4">
                  <h3 className="font-bold text-off-black">Fueling Activity Map</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Transaction locations overlaid with Circle K network coverage.
                    {summary.truckMode && ' Larger orange dots are truck-accessible locations.'}
                  </p>
                </div>
                {summary.mapPoints.length > 0 ? (
                  <FuelingMap
                    transactionPoints={summary.mapPoints}
                    ckStores={ckStorePins}
                    height={520}
                    truckMode={summary.truckMode ?? false}
                  />
                ) : (
                  <div className="flex items-center justify-center h-48 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-400">
                    Map data is only available when the analysis was run with geocoding enabled.
                  </div>
                )}
              </div>
            )}

            {/* Behavioral Insights (internal only) */}
            {activeTab === 'insights' && !isCustomer && (
              <div className="space-y-8">
                <div>
                  <h3 className="font-bold text-off-black mb-1">Fleet CK Loyalty Segments</h3>
                  <p className="text-xs text-gray-400 mb-4">How the fleet's {summary.vehicleBreakdown.length} vehicles break down by Circle K capture rate</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {summary.vehicleSegments.map(seg => {
                      const pct = summary.vehicleBreakdown.length > 0 ? (seg.count / summary.vehicleBreakdown.length) * 100 : 0
                      return (
                        <div key={seg.segment} className="bg-white rounded-xl border border-gray-200 p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                            <span className="font-bold text-off-black text-sm">{seg.label}</span>
                          </div>
                          <p className="text-2xl font-bold text-off-black">{seg.count}</p>
                          <p className="text-xs text-gray-400 mt-0.5">vehicles ({fmtPct(pct)})</p>
                          <p className="text-xs text-gray-500 mt-2">{fmtGallons(seg.gallons)} gal</p>
                          <p className="text-xs text-gray-400 mt-0.5">{seg.description}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Time Patterns (internal only) */}
            {activeTab === 'timing' && !isCustomer && (
              <TimePatternsSection summary={summary} />
            )}

            {/* Fraud Flags (internal only) */}
            {activeTab === 'fraud' && !isCustomer && (
              <div>
                <div className="mb-4">
                  <h3 className="font-bold text-off-black mb-1">Anomaly Summary</h3>
                  <p className="text-xs text-gray-400">These patterns may warrant review. They do not confirm fraud — mismatched data, multi-axle tanks, and multi-stop routes can trigger some flags.</p>
                </div>
                <FraudFlagsSection flags={summary.fraudFlags} />
              </div>
            )}
          </div>
        </div>

        {/* Rep contact (customer only) */}
        {isCustomer && <RepContactCard rep={rep} />}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          Circle K Fleet Analysis &nbsp;·&nbsp; This report was generated for {analysis.account_name || 'your fleet'} and is confidential.
        </p>
      </div>
    </div>
  )
}
