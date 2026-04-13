'use client'

import { Clock } from 'lucide-react'
import { fmtGallons, type TransactionSummary } from '@/lib/transaction-analysis'

export function TimePatternsTab({ summary }: { summary: TransactionSummary }) {
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
