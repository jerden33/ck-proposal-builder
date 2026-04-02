'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { fmtGallons, fmtDollars, fmtPct, type TransactionSummary, type DriverSummary } from '@/lib/transaction-analysis'
import { ViewToggle } from './BehavioralInsightsTab'

export function VehiclesTab({
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
        <p className="mt-4 text-sm text-gray-400 text-center py-4">No results for &quot;{query}&quot;</p>
      )}
    </div>
  )
}
