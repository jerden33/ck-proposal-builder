'use client'

import { CheckCircle, TrendingUp, XCircle, Truck } from 'lucide-react'
import { fmtGallons, fmtDollars, fmtPct, type TransactionSummary } from '@/lib/transaction-analysis'

export function OpportunityPanel({ analysis, totalGallons, truckMode = false }: {
  analysis: TransactionSummary['ckCaptureAnalysis']
  totalGallons: number
  truckMode?: boolean
}) {
  const { captured, capturable, gap, captureRate, potentialRate } = analysis
  const uplift = potentialRate - captureRate

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-zinc-900 font-bold text-lg">Circle K Fueling Opportunity</h2>
          {truckMode && (
            <span className="text-xs font-semibold bg-zinc-200 text-zinc-600 rounded-md px-2 py-0.5 flex items-center gap-1">
              <Truck size={11} /> OTR / Truck Mode
            </span>
          )}
        </div>
        <p className="text-zinc-500 text-sm mt-0.5">
          {truckMode
            ? 'Opportunity scoped to truck-accessible CK locations only (451 sites with truck lanes)'
            : "Where your fleet's gallons go — and what Circle K can capture"}
        </p>
      </div>
      <div className="p-6">
        {/* Hero section */}
        <div className="flex items-center gap-6 mb-6">
          <div className="shrink-0">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Current CK Share</p>
            <p className="text-3xl font-bold text-zinc-700 leading-none">{fmtPct(captureRate)}</p>
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="flex items-center gap-1">
              <div className="h-px w-8 bg-green-300" />
              <span className="text-green-500 text-lg">→</span>
            </div>
            {uplift > 0 && (
              <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                +{fmtPct(uplift)} upside
              </span>
            )}
          </div>
          <div className="shrink-0">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Potential with CK</p>
            <p className="text-5xl font-bold text-green-600 leading-none">{fmtPct(potentialRate)}</p>
          </div>
        </div>

        {/* Progress bars */}
        <div className="space-y-3 mb-6">
          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
              <span>Current Circle K capture</span>
              <span className="font-semibold text-zinc-600">{fmtPct(captureRate)}</span>
            </div>
            <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
              <div className="h-3 bg-accent rounded-full bar-grow" style={{ width: `${Math.max(captureRate, 0.5)}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
              <span>Potential with Circle K {truckMode ? 'truck-accessible ' : ''}network</span>
              <span className="font-semibold text-green-600">{fmtPct(potentialRate)}</span>
            </div>
            <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
              <div className="h-3 bg-green-500 rounded-full bar-grow" style={{ width: `${Math.max(potentialRate, 0.5)}%` }} />
            </div>
          </div>
        </div>

        {/* 3-segment grid */}
        <div className="rounded-xl border border-zinc-200 overflow-hidden bg-zinc-100">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px">
            <div className="bg-white px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={14} className="text-accent shrink-0" />
                <span className="text-xs font-semibold text-zinc-500">Already at Circle K</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900">{fmtGallons(captured.gallons)}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{captured.transactions.toLocaleString()} transactions</p>
              {captured.spend > 0 && <p className="text-sm font-semibold text-zinc-600 mt-2">{fmtDollars(captured.spend)}</p>}
            </div>
            <div className="bg-orange-50 px-5 py-4 border-l border-r border-orange-100 border-t-2 border-t-brand-orange">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-brand-orange shrink-0" />
                <span className="text-xs font-semibold text-zinc-600">
                  {truckMode ? 'Opportunity — Same ZIP as Truck CK' : 'Opportunity — Same ZIP as CK'}
                </span>
              </div>
              <p className="text-2xl font-bold text-zinc-900">{fmtGallons(capturable.gallons)}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{capturable.transactions.toLocaleString()} transactions</p>
              {capturable.spend > 0 && <p className="text-sm font-semibold text-zinc-600 mt-2">{fmtDollars(capturable.spend)}</p>}
            </div>
            <div className="bg-white px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <XCircle size={14} className="text-zinc-300 shrink-0" />
                <span className="text-xs font-semibold text-zinc-500">Outside CK Footprint</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900">{fmtGallons(gap.gallons)}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{gap.transactions.toLocaleString()} transactions</p>
              {gap.spend > 0 && <p className="text-sm font-semibold text-zinc-600 mt-2">{fmtDollars(gap.spend)}</p>}
            </div>
          </div>
        </div>

        {capturable.gallons > 0 && (
          <p className="mt-4 text-sm text-zinc-500">
            <span className="font-semibold text-zinc-800">{fmtGallons(capturable.gallons)} gallons ({fmtPct((capturable.gallons / totalGallons) * 100)})</span>{' '}
            are going to competitors in ZIP codes where a {truckMode ? 'truck-accessible Circle K' : 'Circle K'} already exists.
            {' '}<span className="text-zinc-400 text-xs">For distance-based proximity (≤1–10 mi) see the Map View tab.</span>
          </p>
        )}
      </div>
    </div>
  )
}
