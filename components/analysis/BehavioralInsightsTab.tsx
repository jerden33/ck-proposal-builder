'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { fmtGallons, fmtPct, type TransactionSummary, type VehicleSegment, type DriverSummary } from '@/lib/transaction-analysis'

const SEGMENT_ORDER: VehicleSegment['segment'][] = ['ck-loyal', 'mixed', 'mostly-competitor', 'never-ck']

/** Toggle pill used to switch between "By Driver" and "By Vehicle" views */
export function ViewToggle({
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

export function BehavioralInsightsTab({ summary }: { summary: TransactionSummary }) {
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
              <h3 className="font-bold text-off-black">Top Opportunity {byDriver ? 'Drivers' : 'Vehicles'}</h3>
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
