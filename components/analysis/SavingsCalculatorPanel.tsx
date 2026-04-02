'use client'

import { DollarSign, Info } from 'lucide-react'
import { fmtGallons, fmtDollars } from '@/lib/transaction-analysis'

export function SavingsCalculatorPanel({
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
  const monthlyGal     = eligibleGallons / months
  const annualGal      = monthlyGal * 12
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
          <label className="block text-sm font-semibold text-gray-700 mb-2">Circle K Rebate Rate</label>
          <div className="flex items-center gap-4">
            <input
              type="range" min={0.5} max={10} step={0.5} value={rebateRate}
              onChange={e => onRebateChange(Number(e.target.value))}
              className="flex-1 h-2 cursor-pointer accent-[#0EA5E9]"
            />
            <div className="shrink-0 flex items-center gap-1.5">
              <input
                type="number" min={0} max={20} step={0.5} value={rebateRate}
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
