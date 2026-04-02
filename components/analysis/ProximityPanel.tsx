'use client'

import { AlertCircle, CheckCircle } from 'lucide-react'
import { fmtGallons, fmtPct, type TransactionSummary } from '@/lib/transaction-analysis'

// ─── Proximity Panel (shown in Map tab) ───────────────────────────────────────

export function ProximityPanel({ prox, totalGallons, isMobileFueling, heading, subheading }: {
  prox: NonNullable<TransactionSummary['proximityBreakdown']>
  totalGallons: number
  isMobileFueling: boolean
  heading?: string
  subheading?: string
}) {
  const opportunityGallons =
    prox.within1mi.gallons + prox.within2mi.gallons +
    prox.within5mi.gallons + prox.within10mi.gallons
  const opportunityPct = totalGallons > 0 ? (opportunityGallons / totalGallons) * 100 : 0

  const rows = [
    { label: 'Fueled at Circle K',              gallons: prox.ckGallons,          color: '#16a34a', opportunity: false },
    { label: 'Competitor — CK within 10 mi',    gallons: opportunityGallons,       color: '#3b82f6', opportunity: true  },
    { label: 'Competitor — no CK within 10 mi', gallons: prox.beyond10mi.gallons, color: '#dc2626', opportunity: false },
  ]

  return (
    <div className="space-y-3">
      {isMobileFueling && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <AlertCircle size={13} className="mt-0.5 shrink-0 text-amber-600" />
          <span>
            <strong>Mobile fueling detected.</strong> This report contains fuel deliveries (e.g. Diesel Direct) made directly to the customer&apos;s location — not purchases at a fixed pump. Proximity-to-CK figures are based on the delivery city only and are not meaningful for conversion analysis.
          </span>
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-off-black">{heading ?? 'Distance-Based Proximity to Circle K'}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {subheading ?? `Based on geocoded fueling locations · ${fmtPct(prox.geocodedPct)} of total gallons geocoded`}
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

export function DetailedProximityPanel({
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
