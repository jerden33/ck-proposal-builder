'use client'

import { CheckCircle } from 'lucide-react'
import { fmtGallons, type FraudFlag } from '@/lib/transaction-analysis'

const FRAUD_TYPE_LABELS: Record<FraudFlag['type'], string> = {
  'high-gallons': 'High Gallons',
  'multi-fill':   'Multi-Fill Day',
  'ppg-outlier':  'PPG Outlier',
  'state-hop':    'State Hop',
}

export function FraudFlagsTab({ flags }: { flags: FraudFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 p-8 text-center">
        <CheckCircle size={32} className="mx-auto text-green-500 mb-3" />
        <p className="font-semibold text-gray-700 mb-1">No anomalies detected</p>
        <p className="text-sm text-gray-500">No high-gallon fills, multi-fill days, PPG outliers, or state hops found in this data.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div>
        <h3 className="font-bold text-off-black mb-1">Anomaly Summary</h3>
        <p className="text-xs text-gray-400 mb-4">
          These patterns may warrant review. They do not confirm fraud — mismatched data, multi-axle tanks, and multi-stop routes can trigger some flags.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            { label: 'High Gallons',   count: flags.filter(f => f.type === 'high-gallons').length, color: 'text-red-600',    bg: 'bg-red-50 border-red-200',       desc: 'Single fill > 200 gal' },
            { label: 'Multi-Fill Day', count: flags.filter(f => f.type === 'multi-fill').length,   color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', desc: '3+ fills same vehicle/day' },
            { label: 'PPG Outlier',    count: flags.filter(f => f.type === 'ppg-outlier').length,  color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', desc: 'Price > 2.5× fleet median' },
            { label: 'State Hop',      count: flags.filter(f => f.type === 'state-hop').length,    color: 'text-red-600',    bg: 'bg-red-50 border-red-200',       desc: '2+ states same vehicle/day' },
          ] as const).map(item => (
            <div key={item.label} className={`rounded-xl border p-4 ${item.bg}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{item.label}</p>
              <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Flag table */}
      <div>
        <h3 className="font-bold text-off-black mb-3">Flagged Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {['Severity', 'Type', 'Unit #', 'Date', 'Description', 'Gallons', 'Location'].map(h => (
                  <th key={h} className={`py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 ${['Severity','Type','Unit #','Date','Description'].includes(h) ? 'text-left pr-4' : 'text-right px-4'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {flags.map((f, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="py-2.5 pr-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${f.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {f.severity.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-gray-600">{FRAUD_TYPE_LABELS[f.type]}</td>
                  <td className="py-2.5 pr-4 font-mono font-semibold text-off-black text-xs">{f.unitNumber}</td>
                  <td className="py-2.5 pr-4 text-gray-500 text-xs whitespace-nowrap">{f.transDate}</td>
                  <td className="py-2.5 pr-4 text-gray-700 text-xs max-w-[220px]">{f.description}</td>
                  <td className="py-2.5 px-4 text-right font-medium">{fmtGallons(f.gallons)}</td>
                  <td className="py-2.5 pl-4 text-right text-gray-500 text-xs whitespace-nowrap">
                    {f.stationCity}{f.stationState ? `, ${f.stationState}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
