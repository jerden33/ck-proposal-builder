'use client'

import { TrendingUp, AlertTriangle } from 'lucide-react'
import { fmtGallons, fmtDollars, type TransactionSummary } from '@/lib/transaction-analysis'

export function AnnualizedPanel({
  summary,
  months,
}: {
  summary: TransactionSummary
  months: number
}) {
  const monthly = (n: number) => (months > 0 ? n / months : 0)
  const annual  = (n: number) => monthly(n) * 12

  const isShortDataset = months < 2
  const isLongDataset  = months > 13

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={16} className="text-accent" />
        <h3 className="font-bold text-off-black text-sm">Annualized Projections</h3>
        <span className="text-xs text-gray-400">
          {months.toFixed(1)} mo of data → extrapolated to 12 mo
        </span>
      </div>
      {(isShortDataset || isLongDataset) && (
        <div className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2.5 mb-4 text-xs text-yellow-800">
          <AlertTriangle size={13} className="text-yellow-500 shrink-0 mt-0.5" />
          {isShortDataset
            ? `Dataset is only ${months.toFixed(1)} months — annualized figures are extrapolated ${(12 / Math.max(months, 0.1)).toFixed(0)}× and may be unreliable. Upload at least 2 months of data for accurate projections.`
            : 'Dataset spans more than 13 months — projections are averaged over the full period. Recent trends may differ from the annualized view.'}
        </div>
      )}
      <div className={`grid gap-4 ${summary.totalSpend > 0 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Gallons / Yr</p>
          <p className="text-2xl font-bold text-off-black">{fmtGallons(annual(summary.totalGallons))}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtGallons(monthly(summary.totalGallons))} / mo</p>
        </div>
        {summary.totalSpend > 0 && (
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Spend / Yr</p>
            <p className="text-2xl font-bold text-off-black">{fmtDollars(annual(summary.totalSpend))}</p>
            <p className="text-xs text-gray-400 mt-0.5">{fmtDollars(monthly(summary.totalSpend))} / mo</p>
          </div>
        )}
        <div className="bg-orange-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">CK Gallons / Yr</p>
          <p className="text-2xl font-bold text-brand-orange">{fmtGallons(annual(summary.ckCaptureAnalysis.captured.gallons))}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtGallons(monthly(summary.ckCaptureAnalysis.captured.gallons))} / mo</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Capturable / Yr</p>
          <p className="text-2xl font-bold text-green-600">{fmtGallons(annual(summary.ckCaptureAnalysis.capturable.gallons))}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtGallons(monthly(summary.ckCaptureAnalysis.capturable.gallons))} / mo</p>
        </div>
      </div>
    </div>
  )
}
