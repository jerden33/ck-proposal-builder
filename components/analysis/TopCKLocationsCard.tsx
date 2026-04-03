'use client'

import { useState } from 'react'
import { Truck, Fuel, Info } from 'lucide-react'
import { fmtGallons, fmtDollars, type CKOpportunityLocation } from '@/lib/transaction-analysis'

type SortKey = 'competitorGallons' | 'nearbyStationCount' | 'competitorSpend'

export function TopCKLocationsCard({ locations }: { locations: CKOpportunityLocation[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('competitorGallons')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [stateFilter, setStateFilter] = useState<string>('all')

  const allStates = Array.from(new Set(locations.map(l => l.state))).sort()
  const hasSpend   = locations.some(l => l.competitorSpend > 0)

  const sorted = [...locations]
    .filter(l => stateFilter === 'all' || l.state === stateFilter)
    .sort((a, b) => {
      const diff = a[sortKey] - b[sortKey]
      return sortDir === 'desc' ? -diff : diff
    })

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (k !== sortKey) return <span className="ml-0.5 text-gray-300">↕</span>
    return <span className="ml-0.5 text-accent">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden fade-in">
      <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-zinc-900 font-bold text-lg">Top Circle K Opportunity Locations</h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            CK stores closest to the highest competitor activity — your best immediate conversion targets
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs text-zinc-500 font-medium">State</label>
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            className="text-xs border border-zinc-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          >
            <option value="all">All states</option>
            {allStates.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-zinc-50/50">
              <th scope="col" className="py-2.5 pl-5 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Location</th>
              <th scope="col" className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Site Type</th>
              <th scope="col" className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <span className="inline-flex items-center gap-1">
                  Fuel Opp.
                  <span className="group relative cursor-default">
                    <Info size={11} className="text-gray-300 hover:text-gray-500 transition-colors" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 text-xs font-normal normal-case tracking-normal bg-gray-800 text-white rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 pointer-events-none z-30 shadow-lg leading-relaxed">
                      <strong>Diesel</strong> / <strong>Gas</strong> — competitor gallons at this CK are ≥25% that type.<br />
                      <strong>Both</strong> — ≥25% diesel AND ≥25% gas from competitors.<br />
                      C-stores only show <strong>Gas</strong> (not truck-accessible).
                    </span>
                  </span>
                </span>
              </th>
              <th
                scope="col"
                aria-sort={sortKey === 'competitorGallons' ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-zinc-700 select-none whitespace-nowrap"
                onClick={() => toggleSort('competitorGallons')}
              >
                Competitor Gal <SortIcon k="competitorGallons" />
              </th>
              <th
                scope="col"
                aria-sort={sortKey === 'nearbyStationCount' ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-zinc-700 select-none"
                onClick={() => toggleSort('nearbyStationCount')}
              >
                Stations <SortIcon k="nearbyStationCount" />
              </th>
              {hasSpend && (
                <th
                  scope="col"
                  aria-sort={sortKey === 'competitorSpend' ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                  className="py-2.5 pl-3 pr-5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-zinc-700 select-none whitespace-nowrap"
                  onClick={() => toggleSort('competitorSpend')}
                >
                  Comp. Spend <SortIcon k="competitorSpend" />
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((loc, i) => {
              let fuelLabel: string | null = null
              if (!loc.truckAccessible) {
                fuelLabel = loc.gasGallons > 0 ? 'Gas' : null
              } else {
                const total = loc.competitorGallons || 1
                const dieselShare = loc.dieselGallons / total
                const gasShare    = loc.gasGallons    / total
                if (dieselShare >= 0.25 && gasShare >= 0.25) fuelLabel = 'Both'
                else if (loc.dieselGallons > loc.gasGallons) fuelLabel = loc.dieselGallons > 0 ? 'Diesel' : null
                else fuelLabel = loc.gasGallons > 0 ? 'Gas' : null
              }
              const fuelColor = fuelLabel === 'Both'
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : fuelLabel === 'Diesel'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-green-50 text-green-700 border-green-200'
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="py-3 pl-5 pr-3">
                    <p className="font-semibold text-zinc-900 text-sm">{loc.city}, {loc.state}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {loc.ckName}{loc.siteNumber && <span className="ml-1">#{loc.siteNumber}</span>}
                    </p>
                  </td>
                  <td className="py-3 px-3">
                    {loc.truckAccessible
                      ? <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-600 rounded-md px-2 py-0.5 font-semibold"><Truck size={10} />Truck</span>
                      : <span className="inline-flex items-center gap-1 text-xs bg-zinc-50 text-zinc-400 rounded-md px-2 py-0.5">C-Store</span>}
                  </td>
                  <td className="py-3 px-3">
                    {fuelLabel
                      ? <span className={`inline-flex items-center gap-1 text-xs border rounded-md px-2 py-0.5 font-semibold ${fuelColor}`}><Fuel size={10} />{fuelLabel}</span>
                      : <span className="text-zinc-300 text-xs">—</span>}
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-zinc-800">{fmtGallons(loc.competitorGallons)}</td>
                  <td className="py-3 px-3 text-right text-zinc-600">{loc.nearbyStationCount}</td>
                  {hasSpend && (
                    <td className="py-3 pl-3 pr-5 text-right text-zinc-600">{fmtDollars(loc.competitorSpend)}</td>
                  )}
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={hasSpend ? 6 : 5} className="py-8 text-center text-sm text-zinc-400">
                  No locations match the selected state filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
