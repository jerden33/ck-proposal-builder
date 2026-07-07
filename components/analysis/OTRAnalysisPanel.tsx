'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Truck, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { fmtGallons, fmtPct, type TransactionSummary, type CustomerLocation } from '@/lib/transaction-analysis'
import type { CKStorePin } from '@/components/FuelingMap'
import type { OTRMapStore } from '@/components/OTRMap'

const FuelingMap = dynamic(() => import('@/components/FuelingMap').then(m => m.FuelingMap), {
  ssr: false,
  loading: () => <div className="bg-gray-100 rounded-xl animate-pulse" style={{ height: 480 }} />,
})
const OTRMap = dynamic(() => import('@/components/OTRMap').then(m => m.OTRMap), {
  ssr: false,
  loading: () => <div className="bg-gray-100 rounded-xl animate-pulse" style={{ height: 520 }} />,
})

export function OTRAnalysisPanel({ otr, months, mapPoints, ckStorePins, isDieselFleet, customerLocations }: {
  otr: NonNullable<TransactionSummary['otrAnalysis']>
  months: number
  mapPoints: import('@/lib/transaction-analysis').MapPoint[]
  ckStorePins: CKStorePin[]
  isDieselFleet: boolean
  customerLocations?: CustomerLocation[]
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? otr.corridorResults : otr.corridorResults.slice(0, 8)
  const totalOpp = otr.corridorResults.reduce((s, r) => s + r.captureGallons, 0)
  const annualOpp = months > 0 ? (totalOpp / months) * 12 : totalOpp

  const truckStores: OTRMapStore[] = ckStorePins
    .filter(s => s.truckAccessible)
    .map(s => ({ lat: s.lat, lng: s.lng, name: s.name, city: s.city, state: s.state }))

  return (
    <>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-zinc-900 font-bold text-lg">OTR Corridor Analysis</h2>
          <span className="bg-zinc-200 text-zinc-600 text-xs font-bold px-2 py-0.5 rounded-full">OTR</span>
        </div>
        <Truck className="text-zinc-400 shrink-0" size={24} />
      </div>
      <p className="text-zinc-500 text-sm mb-4">
        Opportunity mapped to major interstate corridors — not aerial radius
      </p>

      {/* Summary strip */}
      <div className="rounded-xl border border-zinc-200 overflow-hidden bg-zinc-100 mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px">
          {[
            { label: 'Active Corridors',     value: otr.corridorResults.length.toString() },
            { label: 'On-Corridor Gallons',  value: fmtGallons(otr.totalCorridorGallons) },
            { label: 'Annual Opp. Gallons',  value: fmtGallons(annualOpp), accent: true },
            { label: 'Off-Corridor Gallons', value: fmtGallons(otr.offCorridorGallons), dim: true },
          ].map(({ label, value, accent, dim }) => (
            <div key={label} className={`px-4 py-3 text-center ${accent ? 'bg-accent' : 'bg-white'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${accent ? 'text-white/70' : 'text-gray-500'}`}>{label}</p>
              <p className={`text-xl font-bold ${accent ? 'text-white' : dim ? 'text-gray-400' : 'text-off-black'}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Route Coverage map */}
      {isDieselFleet && truckStores.length > 0 && mapPoints.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-zinc-200" />
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Map 1 — Corridor Coverage &amp; Gaps</span>
            <div className="flex-1 h-px bg-zinc-200" />
          </div>
          <div className="rounded-2xl border border-zinc-200 overflow-hidden mb-6">
            <div className="bg-zinc-50 border-b border-zinc-200 px-5 py-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-zinc-800 text-sm">Route Coverage &amp; Gaps</p>
                <p className="text-xs text-zinc-500 mt-0.5">Orange = corridor activity · gap = no truck CK within 30mi of route</p>
              </div>
              <MapPin className="text-zinc-400 shrink-0" size={18} />
            </div>
            <OTRMap
              transactionPoints={mapPoints}
              ckStores={truckStores}
              corridorResults={otr.corridorResults}
              height={520}
            />
          </div>
        </>
      )}

      {/* Fueling locations map */}
      {mapPoints.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-zinc-200" />
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Map 2 — All Fueling Locations</span>
            <div className="flex-1 h-px bg-zinc-200" />
          </div>
          <div className="rounded-2xl border border-zinc-200 overflow-hidden mb-6">
            <div className="bg-zinc-50 border-b border-zinc-200 px-5 py-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-zinc-800 text-sm">All Fueling Locations</p>
                <p className="text-xs text-zinc-500 mt-0.5">Customer stops · truck-accessible CK sites · color = proximity</p>
              </div>
              <MapPin className="text-zinc-400 shrink-0" size={18} />
            </div>
            <FuelingMap
              transactionPoints={mapPoints}
              ckStores={ckStorePins.filter(s => s.truckAccessible)}
              customerLocations={customerLocations}
              height={480}
              truckMode={true}
            />
          </div>
        </>
      )}

      {/* Corridor table */}
      <div>
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
              {shown.map(r => (
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
              ))}
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
            {fmtGallons(otr.offCorridorGallons)} gallons ({otr.offCorridorTransactions.toLocaleString()} transactions) did not snap to a major interstate corridor — likely local delivery or regional routes.
          </p>
        )}
      </div>
    </>
  )
}
