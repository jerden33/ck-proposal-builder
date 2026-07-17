'use client'

import { AlertCircle, CheckCircle } from 'lucide-react'
import { fmtGallons, fmtPct, type TransactionSummary } from '@/lib/transaction-analysis'

// Which fixed bands (upper-bound miles) are within the capture radius
function capturableBands(radiusMi: number): Set<'w2' | 'w5' | 'w10'> {
  const s = new Set<'w2' | 'w5' | 'w10'>()
  if (radiusMi > 2)  s.add('w2')
  if (radiusMi > 5)  s.add('w5')
  if (radiusMi > 10) s.add('w10')
  // within1mi+within2mi are always capturable when radius >= 2
  // we treat the "within 2mi" band as capturable for any radius > 0
  if (radiusMi > 0) s.add('w2')
  return s
}

// ─── Proximity Panel (shown in Map tab) ───────────────────────────────────────

export function ProximityPanel({ prox, totalGallons, isMobileFueling, heading, subheading, captureRadiusMi = 10 }: {
  prox: NonNullable<TransactionSummary['proximityBreakdown']>
  totalGallons: number
  isMobileFueling: boolean
  heading?: string
  subheading?: string
  captureRadiusMi?: number
}) {
  const cap = capturableBands(captureRadiusMi)
  const opportunityGallons =
    prox.within1mi.gallons + prox.within2mi.gallons +
    (cap.has('w5')  ? prox.within5mi.gallons  : 0) +
    (cap.has('w10') ? prox.within10mi.gallons : 0)
  const outOfRangeGallons =
    (!cap.has('w5')  ? prox.within5mi.gallons  : 0) +
    (!cap.has('w10') ? prox.within10mi.gallons : 0) +
    prox.beyond10mi.gallons
  const opportunityPct = totalGallons > 0 ? (opportunityGallons / totalGallons) * 100 : 0
  const radiusLabel = `${captureRadiusMi} mi`

  const rows = [
    { label: 'Fueled at Circle K',                        gallons: prox.ckGallons,       color: '#16a34a', opportunity: false },
    { label: `Competitor — CK within ${radiusLabel}`,     gallons: opportunityGallons,    color: '#3b82f6', opportunity: true  },
    { label: `Competitor — no CK within ${radiusLabel}`,  gallons: outOfRangeGallons,     color: '#dc2626', opportunity: false },
  ]

  return (
    <div className="space-y-3">
      {isMobileFueling && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={15} className="shrink-0 text-amber-600" />
            <strong className="text-sm text-amber-900">Mobile Fueling Detected — Proximity Data Not Meaningful</strong>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed pl-[23px]">
            This report contains fuel deliveries (e.g. Diesel Direct, Booster, Yoshi) made directly to the customer&apos;s location — not purchases at a fixed pump.
            Proximity figures below are based on the delivery city only and <strong>should not be used for conversion analysis.</strong>
          </p>
        </div>
      )}
      <div className={isMobileFueling ? 'opacity-40 pointer-events-none select-none' : ''}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-bold text-off-black">{heading ?? 'Distance-Based Proximity to Circle K'}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {subheading ?? `Based on geocoded fueling locations · ${fmtPct(prox.geocodedPct)} of total gallons geocoded`}
            </p>
          </div>
          {opportunityGallons > 0 && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 text-right shrink-0 ml-4">
              <span className="font-bold">{fmtGallons(opportunityGallons)} gal</span><br />
              <span className="opacity-80">within {radiusLabel} of CK ({fmtPct(opportunityPct)})</span>
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
    </div>
  )
}

// ─── Detailed Proximity Panel (5-band breakdown used as hero card) ─────────────

export function DetailedProximityPanel({
  prox,
  title,
  subtitle,
  monthSpan,
  captureRadiusMi = 10,
  capturedGallons,
}: {
  prox: NonNullable<TransactionSummary['proximityBreakdown']>
  title: string
  subtitle: string
  monthSpan: number
  captureRadiusMi?: number
  // Override for the "At Circle K" row — pass the all-fuel-types captured total
  // (summary.ckCaptureAnalysis.captured.gallons) when this is the ONLY proximity
  // panel shown (mixed/gas fleets), so it matches the header stat and share view.
  // Leave unset for the two-panel diesel-fleet case, where each panel intentionally
  // shows its own fuel-type-specific ckGallons to avoid double-counting between them.
  capturedGallons?: number
}) {
  const ck  = capturedGallons ?? prox.ckGallons
  const w1  = prox.within1mi.gallons
  const w2  = prox.within2mi.gallons
  const w5  = prox.within5mi.gallons
  const w10 = prox.within10mi.gallons
  const b10 = prox.beyond10mi.gallons
  const tot = Math.max(ck + w1 + w2 + w5 + w10 + b10, 1)

  const cap = capturableBands(captureRadiusMi)

  const rows = [
    { key: 'ck',  label: 'At Circle K',  gallons: ck,  color: 'bg-green-500',   text: 'text-green-700',   note: 'Already at CK',      capturable: true },
    { key: 'w1',  label: 'Within 1 mi',  gallons: w1,  color: 'bg-emerald-500', text: 'text-emerald-700', note: 'Drove right past',    capturable: true },
    { key: 'w2',  label: '1–2 mi',       gallons: w2,  color: 'bg-emerald-400', text: 'text-emerald-700', note: 'Drove right past',    capturable: true },
    { key: 'w5',  label: '2–5 mi',       gallons: w5,  color: 'bg-amber-400',   text: 'text-amber-700',   note: 'Strong opportunity',  capturable: cap.has('w5') },
    { key: 'w10', label: '5–10 mi',      gallons: w10, color: 'bg-orange-400',  text: 'text-orange-700',  note: 'Moderate detour',     capturable: cap.has('w10') },
    { key: 'b10', label: '10+ mi',       gallons: b10, color: 'bg-red-400',     text: 'text-red-700',     note: 'No nearby CK',        capturable: false },
  ]

  const showRadiusNote = captureRadiusMi < 10

  return (
    <div>
      <h3 className="font-bold text-off-black text-sm uppercase tracking-wide mb-0.5">{title}</h3>
      <p className="text-xs text-gray-400 mb-3">{subtitle}</p>
      {w1 + w2 > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
          <CheckCircle size={12} className="text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-800 leading-snug">
            <strong>{fmtGallons(monthSpan > 0 ? (w1 + w2) / monthSpan : (w1 + w2))} gal/mo</strong> within 2 mi — drove right past a Circle K.
          </p>
        </div>
      )}
      {showRadiusNote && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 mb-3 text-xs text-zinc-500">
          Capture radius set to <strong>{captureRadiusMi} mi</strong> — bands beyond this threshold are shown but not counted as capturable.
        </div>
      )}
      <div className="space-y-2">
        {rows.map(({ key, label, gallons, color, text, note, capturable }) => {
          const pct = (gallons / tot) * 100
          const monthly = monthSpan > 0 ? gallons / monthSpan : gallons
          const dimmed = !capturable && key !== 'ck'
          return (
            <div key={key} className={dimmed ? 'opacity-40' : ''}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-gray-700">{label}</span>
                {key === 'ck' ? (
                  <span className={`text-xs font-semibold ${text}`}>
                    {fmtGallons(gallons)}<span className="text-gray-400 font-normal text-[11px]"> total</span>
                    <span className="text-gray-400 font-normal"> · {fmtGallons(monthly)}/mo</span>
                    <span className="text-gray-400 font-normal"> ({fmtPct(pct)})</span>
                  </span>
                ) : (
                  <span className={`text-xs font-semibold ${text}`}>
                    {fmtGallons(monthly)}<span className="text-gray-400 font-normal text-[11px]">/mo</span>
                    <span className="text-gray-400 font-normal"> ({fmtPct(pct)})</span>
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-1.5 ${color} rounded-full`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-0.5 leading-none">
                {dimmed ? `Outside ${captureRadiusMi} mi capture radius` : note}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
