'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { fmtGallons, fmtDollars, fmtPct, type TransactionSummary, type DriverSummary } from '@/lib/transaction-analysis'
import { ViewToggle } from './BehavioralInsightsTab'

type VehicleRow = TransactionSummary['vehicleBreakdown'][0]
type VehicleSortKey = 'gallons' | 'transactions' | 'spend' | 'ckGallons' | 'ckSharePct'
type DriverSortKey  = 'gallons' | 'transactions' | 'spend' | 'ckGallons' | 'ckSharePct'

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
  const [sortKey, setSortKey] = useState<VehicleSortKey | DriverSortKey>('gallons')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  const byDriver = mode === 'driver' && summary.hasDriverData

  const toggleSort = (key: typeof sortKey) => {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: typeof sortKey }) => {
    if (k !== sortKey) return <span className="ml-0.5 text-gray-300">↕</span>
    return <span className="ml-0.5 text-accent">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  const allRows = (byDriver ? summary.driverBreakdown : summary.vehicleBreakdown) as (DriverSummary | VehicleRow)[]

  const getSortVal = (row: DriverSummary | VehicleRow): number => {
    const r = row as unknown as { [k: string]: unknown }
    return typeof r[sortKey] === 'number' ? (r[sortKey] as number) : 0
  }

  const sorted = [...allRows].sort((a, b) => {
    const diff = getSortVal(a) - getSortVal(b)
    return sortDir === 'desc' ? -diff : diff
  })

  const rows = query.trim()
    ? sorted.filter(row => {
        const q = query.toLowerCase()
        if ('driverName' in row) {
          const d = row as DriverSummary
          return d.driverName.toLowerCase().includes(q) || d.driverCity.toLowerCase().includes(q)
        }
        const v = row as VehicleRow
        return v.unitNumber.toLowerCase().includes(q) || v.driverCity.toLowerCase().includes(q)
      })
    : sorted

  const shown = (query.trim() || showAll) ? rows : rows.slice(0, 30)
  const entityLabel = byDriver ? 'drivers' : 'vehicles'

  const thClass = (k: typeof sortKey, align: 'left' | 'right' = 'right') =>
    `py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-zinc-700 select-none whitespace-nowrap ${align === 'left' ? 'text-left pr-4' : 'text-right px-4'}`

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="font-bold text-off-black">
            {byDriver ? 'Driver' : 'Vehicle'} Fueling Summary
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Click any column header to sort
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
            mode={mode} setMode={(m) => { setMode(m) }}
            hasDriver={summary.hasDriverData}
            hasVehicle={summary.vehicleBreakdown.length > 0}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {byDriver ? (
                <>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-left pr-4">Driver</th>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-left pr-4">Home City</th>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right px-4">Units</th>
                  <th className={thClass('transactions')} onClick={() => toggleSort('transactions')}>Fills <SortIcon k="transactions" /></th>
                  <th className={thClass('gallons')} onClick={() => toggleSort('gallons')}>Gallons <SortIcon k="gallons" /></th>
                  <th className={thClass('spend')} onClick={() => toggleSort('spend')}>Spend <SortIcon k="spend" /></th>
                  <th className={thClass('ckGallons')} onClick={() => toggleSort('ckGallons')}>CK Gallons <SortIcon k="ckGallons" /></th>
                  <th className={thClass('ckSharePct')} onClick={() => toggleSort('ckSharePct')}>CK Share <SortIcon k="ckSharePct" /></th>
                </>
              ) : (
                <>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-left pr-4">Unit #</th>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-left pr-4">Driver City</th>
                  <th className={thClass('transactions')} onClick={() => toggleSort('transactions')}>Fills <SortIcon k="transactions" /></th>
                  <th className={thClass('gallons')} onClick={() => toggleSort('gallons')}>Gallons <SortIcon k="gallons" /></th>
                  <th className={thClass('spend')} onClick={() => toggleSort('spend')}>Spend <SortIcon k="spend" /></th>
                  <th className={thClass('ckGallons')} onClick={() => toggleSort('ckGallons')}>CK Gallons <SortIcon k="ckGallons" /></th>
                  <th className={thClass('ckSharePct')} onClick={() => toggleSort('ckSharePct')}>CK Share <SortIcon k="ckSharePct" /></th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map(row => {
              const isDriver = 'driverName' in row
              const d = row as DriverSummary
              const v = row as VehicleRow
              return (
                <tr key={isDriver ? d.driverName : v.unitNumber} className="hover:bg-gray-50">
                  {isDriver ? (
                    <>
                      <td className="py-2 pr-4 font-semibold text-off-black text-sm">{d.driverName}</td>
                      <td className="py-2 px-4 text-gray-600 text-xs">{d.driverCity || '—'}</td>
                      <td className="py-2 px-4 text-right text-gray-500 text-xs">{d.unitNumbers.length || '—'}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 pr-4 font-mono font-semibold text-off-black text-xs">{v.unitNumber}</td>
                      <td className="py-2 px-4 text-gray-600 text-xs">{v.driverCity || '—'}</td>
                    </>
                  )}
                  <td className="py-2 px-4 text-right text-gray-600">{row.transactions}</td>
                  <td className="py-2 px-4 text-right font-medium">{fmtGallons(row.gallons)}</td>
                  <td className="py-2 px-4 text-right text-gray-600">{row.spend > 0 ? fmtDollars(row.spend) : <span className="text-gray-300">—</span>}</td>
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
