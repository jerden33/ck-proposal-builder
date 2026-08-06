'use client'

import { useState } from 'react'
import { Flag, Truck, MapPin } from 'lucide-react'
import { fmtMiles, type CustomerLocation } from '@/lib/transaction-analysis'

type SortKey = 'nearestCK' | 'nearestTruckCK'

export function CustomerLocationProximityPanel({ locations }: { locations: CustomerLocation[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('nearestCK')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const geocoded = locations.filter(l => l.nearestCK || l.nearestTruckCK)
  const ungeocoded = locations.length - geocoded.length

  const sorted = [...geocoded].sort((a, b) => {
    const av = a[sortKey]?.distanceMi ?? Infinity
    const bv = b[sortKey]?.distanceMi ?? Infinity
    const diff = av - bv
    return sortDir === 'asc' ? diff : -diff
  })

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (k !== sortKey) return <span className="ml-0.5 text-gray-300">↕</span>
    return <span className="ml-0.5 text-accent">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (geocoded.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden fade-in">
      <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-zinc-900 font-bold text-lg flex items-center gap-2">
            <Flag size={16} className="text-purple-600" />
            Circle K Proximity to Customer Locations
          </h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            Nearest Circle K store to each facility — full network and truck-accessible only
          </p>
        </div>
        {ungeocoded > 0 && (
          <span className="text-xs text-zinc-400">{ungeocoded} location{ungeocoded !== 1 ? 's' : ''} not geocoded</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-zinc-50/50">
              <th scope="col" className="py-2.5 pl-5 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Customer Location</th>
              <th
                scope="col"
                aria-sort={sortKey === 'nearestCK' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-zinc-700 select-none"
                onClick={() => toggleSort('nearestCK')}
              >
                Nearest CK (Full Network) <SortIcon k="nearestCK" />
              </th>
              <th
                scope="col"
                aria-sort={sortKey === 'nearestTruckCK' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-2.5 pl-3 pr-5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-zinc-700 select-none"
                onClick={() => toggleSort('nearestTruckCK')}
              >
                Nearest Truck CK <SortIcon k="nearestTruckCK" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((loc, i) => (
              <tr key={`${loc.name}-${i}`} className="hover:bg-gray-50">
                <td className="py-3 pl-5 pr-3">
                  <p className="font-semibold text-zinc-900 text-sm flex items-center gap-1.5">
                    <Flag size={12} className="text-purple-500 shrink-0" />
                    {loc.name}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">{loc.city}, {loc.state}</p>
                </td>
                <td className="py-3 px-3">
                  {loc.nearestCK ? (
                    <div>
                      <p className="text-sm text-zinc-800">
                        {loc.nearestCK.name}
                        {loc.nearestCK.siteNumber && <span className="text-zinc-400"> #{loc.nearestCK.siteNumber}</span>}
                        {loc.nearestCK.truckAccessible && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-600 rounded px-1.5 py-0.5 font-semibold"><Truck size={9} />Truck</span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1"><MapPin size={10} />{fmtMiles(loc.nearestCK.distanceMi)} away</p>
                    </div>
                  ) : (
                    <span className="text-zinc-300 text-xs">—</span>
                  )}
                </td>
                <td className="py-3 pl-3 pr-5">
                  {loc.nearestTruckCK ? (
                    <div>
                      <p className="text-sm text-zinc-800">
                        {loc.nearestTruckCK.name}
                        {loc.nearestTruckCK.siteNumber && <span className="text-zinc-400"> #{loc.nearestTruckCK.siteNumber}</span>}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1"><MapPin size={10} />{fmtMiles(loc.nearestTruckCK.distanceMi)} away</p>
                    </div>
                  ) : (
                    <span className="text-zinc-300 text-xs">No truck CK found</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
