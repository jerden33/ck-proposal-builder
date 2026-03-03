'use client'

import { useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import {
  Upload,
  BarChart2,
  MapPin,
  Fuel,
  Car,
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { parseHeartlandCSV } from '@/lib/transaction-parser'
import {
  analyzeTransactions,
  buildCKZipSet,
  fmtGallons,
  fmtDollars,
  fmtPct,
  type TransactionSummary,
  type BrandSummary,
} from '@/lib/transaction-analysis'

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-off-black">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Brand Bar ────────────────────────────────────────────────────────────────

function BrandBar({ brand, maxGallons }: { brand: BrandSummary; maxGallons: number }) {
  const pct = maxGallons > 0 ? (brand.gallons / maxGallons) * 100 : 0
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-36 text-sm text-gray-700 truncate font-medium shrink-0">{brand.displayName}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
        <div
          className={`h-5 rounded-full transition-all ${brand.isCircleK ? 'bg-brand-orange' : 'bg-gray-400'}`}
          style={{ width: `${Math.max(pct, 0.5)}%` }}
        />
      </div>
      <div className="w-28 text-right text-sm text-gray-600 shrink-0">
        <span className="font-semibold text-off-black">{fmtGallons(brand.gallons)}</span>
        <span className="text-gray-400"> gal</span>
      </div>
      <div className="w-24 text-right text-xs text-gray-400 shrink-0">{brand.transactions.toLocaleString()} trans</div>
    </div>
  )
}

// ─── Opportunity Panel ────────────────────────────────────────────────────────

function OpportunityPanel({ analysis, totalGallons }: { analysis: TransactionSummary['ckCaptureAnalysis']; totalGallons: number }) {
  const { captured, capturable, gap, captureRate, potentialRate } = analysis

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-off-black px-6 py-4">
        <h2 className="text-white font-bold text-lg">Circle K Fueling Opportunity</h2>
        <p className="text-gray-400 text-sm mt-0.5">
          Where your fleet's gallons go — and what Circle K can capture
        </p>
      </div>

      <div className="p-6">
        {/* Progress bars */}
        <div className="mb-6 space-y-3">
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Current Circle K capture</span>
              <span className="font-semibold text-brand-orange">{fmtPct(captureRate)}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full">
              <div className="h-3 bg-brand-orange rounded-full" style={{ width: `${captureRate}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Potential with Circle K network</span>
              <span className="font-semibold text-green-600">{fmtPct(potentialRate)}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full">
              <div className="h-3 bg-green-500 rounded-full" style={{ width: `${potentialRate}%` }} />
            </div>
          </div>
        </div>

        {/* Three buckets */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Captured */}
          <div className="rounded-xl border-2 border-brand-orange bg-orange-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={18} className="text-brand-orange shrink-0" />
              <span className="font-bold text-off-black text-sm">Already at Circle K</span>
            </div>
            <p className="text-3xl font-bold text-off-black">{fmtGallons(captured.gallons)}</p>
            <p className="text-xs text-gray-500 mt-0.5">gallons</p>
            <p className="text-sm font-semibold text-brand-orange mt-2">{fmtDollars(captured.spend)}</p>
            <p className="text-xs text-gray-400 mt-1">{captured.transactions.toLocaleString()} transactions</p>
          </div>

          {/* Capturable */}
          <div className="rounded-xl border-2 border-green-500 bg-green-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={18} className="text-green-600 shrink-0" />
              <span className="font-bold text-off-black text-sm">Opportunity — CK Available</span>
            </div>
            <p className="text-3xl font-bold text-off-black">{fmtGallons(capturable.gallons)}</p>
            <p className="text-xs text-gray-500 mt-0.5">gallons at non-CK stations</p>
            <p className="text-sm font-semibold text-green-600 mt-2">{fmtDollars(capturable.spend)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {capturable.transactions.toLocaleString()} transactions where CK exists in same area
            </p>
          </div>

          {/* Gap */}
          <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <XCircle size={18} className="text-gray-400 shrink-0" />
              <span className="font-bold text-off-black text-sm">Outside CK Footprint</span>
            </div>
            <p className="text-3xl font-bold text-off-black">{fmtGallons(gap.gallons)}</p>
            <p className="text-xs text-gray-500 mt-0.5">gallons in areas with no CK</p>
            <p className="text-sm font-semibold text-gray-500 mt-2">{fmtDollars(gap.spend)}</p>
            <p className="text-xs text-gray-400 mt-1">{gap.transactions.toLocaleString()} transactions</p>
          </div>
        </div>

        {/* Callout */}
        {capturable.gallons > 0 && (
          <div className="mt-5 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            <span className="font-bold">
              {fmtGallons(capturable.gallons)} gallons ({fmtPct((capturable.gallons / totalGallons) * 100)})
            </span>{' '}
            are currently going to competitors where a Circle K location already exists in the same area.
            Enrolling these vehicles on a Circle K fuel card or network could capture this volume immediately.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'brands' | 'geographic' | 'locations' | 'vehicles'

export default function AnalysisPage() {
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [fileName, setFileName] = useState('')
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('brands')
  const [showAllBrands, setShowAllBrands] = useState(false)
  const [showAllVehicles, setShowAllVehicles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.CSV')) {
      setError('Please upload a CSV file.')
      return
    }

    setLoading(true)
    setError(null)
    setFileName(file.name)

    try {
      // 1. Read file
      setLoadingStep('Reading file…')
      const content = await file.text()

      // 2. Parse CSV
      setLoadingStep('Parsing transactions…')
      const { transactions, errors } = parseHeartlandCSV(content)
      if (transactions.length === 0) {
        setError('No transactions found. Please check the file format.')
        setLoading(false)
        return
      }

      // 3. Load Circle K stores
      setLoadingStep('Loading Circle K store locations…')
      const resp = await fetch('/stores-data.json')
      const data = await resp.json()
      const stores: Array<{ zip: string }> = data.stores ?? []

      // 4. Build ZIP set
      setLoadingStep('Matching to Circle K footprint…')
      const ckZipSet = buildCKZipSet(stores)

      // 5. Analyze
      setLoadingStep('Running analysis…')
      const result = analyzeTransactions(transactions, ckZipSet)

      setSummary(result)
      if (errors.length > 0) {
        console.warn(`Parsed with ${errors.length} row errors:`, errors.slice(0, 5))
      }
    } catch (err) {
      setError(`Error processing file: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
      setLoadingStep('')
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const reset = () => {
    setSummary(null)
    setFileName('')
    setCustomerName('')
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'brands', label: 'Brand Breakdown', icon: <BarChart2 size={16} /> },
    { id: 'geographic', label: 'Geographic', icon: <MapPin size={16} /> },
    { id: 'locations', label: 'Top Competitor Locations', icon: <Fuel size={16} /> },
    { id: 'vehicles', label: 'Vehicles', icon: <Car size={16} /> },
  ]

  return (
    <div className="min-h-screen bg-off-white">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-off-black">Transaction Analysis</h1>
          <p className="text-gray-500 mt-1">
            Upload a fleet fueling transaction report to compare against the Circle K store footprint.
          </p>
        </div>

        {/* ── Upload State ───────────────────────────────────────────── */}
        {!summary && (
          <div className="max-w-2xl mx-auto">
            {/* Customer name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer / Account Name</label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="e.g. Heartland Logistics"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
              />
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-brand-orange bg-orange-50'
                  : 'border-gray-300 bg-white hover:border-brand-orange hover:bg-orange-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              {loading ? (
                <div>
                  <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-600 font-medium">{loadingStep}</p>
                </div>
              ) : (
                <>
                  <Upload size={40} className="mx-auto text-gray-400 mb-4" />
                  <p className="font-semibold text-off-black mb-1">Drop your CSV file here</p>
                  <p className="text-sm text-gray-500">
                    Supports Heartland fleet fueling transaction exports (.csv)
                  </p>
                  <p className="text-xs text-gray-400 mt-3">Click to browse, or drag and drop</p>
                </>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Format hint */}
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Expected columns</p>
              <div className="flex flex-wrap gap-1.5">
                {['Unit #', 'Driver City', 'Trans Date', 'Amount', 'Gallons', 'Product Name',
                  'EPA Fuel Type', 'Station brand name', 'Station name', 'Station address',
                  'Station state', 'Station city', 'ZipCode'].map(col => (
                  <span key={col} className="bg-gray-100 text-gray-600 text-xs rounded px-2 py-0.5 font-mono">
                    {col}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Results State ──────────────────────────────────────────── */}
        {summary && (
          <div className="space-y-6">
            {/* Results header */}
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                {customerName && (
                  <p className="text-sm text-gray-500 mb-0.5">Analysis for</p>
                )}
                <h2 className="text-2xl font-bold text-off-black">
                  {customerName || 'Fleet Transaction Analysis'}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {fileName} &bull; {summary.dateRange.start}
                  {summary.dateRange.end && summary.dateRange.end !== summary.dateRange.start
                    ? ` – ${summary.dateRange.end}`
                    : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="btn-secondary text-sm flex items-center gap-2"
                >
                  <Upload size={15} />
                  New File
                </button>
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="Transactions" value={summary.totalTransactions.toLocaleString()} />
              <StatCard label="Total Gallons" value={fmtGallons(summary.totalGallons)} />
              <StatCard label="Total Spend" value={fmtDollars(summary.totalSpend)} />
              <StatCard label="Vehicles" value={summary.uniqueVehicles.toLocaleString()} />
              <StatCard label="Unique Stations" value={summary.uniqueStations.toLocaleString()} />
              <StatCard
                label="States"
                value={summary.uniqueStates.length.toString()}
                sub={summary.uniqueStates.slice(0, 6).join(', ') + (summary.uniqueStates.length > 6 ? '…' : '')}
              />
            </div>

            {/* CK Opportunity Panel */}
            <OpportunityPanel
              analysis={summary.ckCaptureAnalysis}
              totalGallons={summary.totalGallons}
            />

            {/* Tabbed detail sections */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-gray-200 overflow-x-auto">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                      activeTab === tab.id
                        ? 'border-b-2 border-brand-orange text-brand-orange bg-orange-50'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {/* ── Brands Tab ─────────────────────────────────────── */}
                {activeTab === 'brands' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-off-black">Gallons by Network / Brand</h3>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-brand-orange inline-block" />
                          Circle K
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />
                          Competitor
                        </span>
                      </div>
                    </div>

                    <div className="divide-y divide-gray-100">
                      {(showAllBrands ? summary.brandBreakdown : summary.brandBreakdown.slice(0, 15)).map(brand => (
                        <BrandBar
                          key={brand.brand}
                          brand={brand}
                          maxGallons={summary.brandBreakdown[0]?.gallons ?? 1}
                        />
                      ))}
                    </div>

                    {summary.brandBreakdown.length > 15 && (
                      <button
                        onClick={() => setShowAllBrands(v => !v)}
                        className="mt-4 flex items-center gap-1 text-sm text-brand-orange hover:underline"
                      >
                        {showAllBrands ? (
                          <><ChevronUp size={16} /> Show fewer</>
                        ) : (
                          <><ChevronDown size={16} /> Show all {summary.brandBreakdown.length} brands</>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* ── Geographic Tab ─────────────────────────────────── */}
                {activeTab === 'geographic' && (
                  <div>
                    <h3 className="font-bold text-off-black mb-4">Fueling Activity by State</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500">State</th>
                            <th className="text-right py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Transactions</th>
                            <th className="text-right py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Gallons</th>
                            <th className="text-right py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Spend</th>
                            <th className="text-right py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">CK Gallons</th>
                            <th className="text-right py-2 pl-4 text-xs font-semibold uppercase tracking-wider text-gray-500">CK Share</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {summary.stateBreakdown.map(row => (
                            <tr key={row.state} className="hover:bg-gray-50">
                              <td className="py-2.5 pr-4 font-semibold text-off-black">{row.state}</td>
                              <td className="py-2.5 px-4 text-right text-gray-600">{row.transactions.toLocaleString()}</td>
                              <td className="py-2.5 px-4 text-right font-medium">{fmtGallons(row.gallons)}</td>
                              <td className="py-2.5 px-4 text-right text-gray-600">{fmtDollars(row.spend)}</td>
                              <td className="py-2.5 px-4 text-right text-brand-orange font-medium">{fmtGallons(row.ckGallons)}</td>
                              <td className="py-2.5 pl-4 text-right">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                    row.ckSharePct >= 20
                                      ? 'bg-green-100 text-green-700'
                                      : row.ckSharePct > 0
                                      ? 'bg-orange-100 text-orange-700'
                                      : 'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  {fmtPct(row.ckSharePct)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Top Competitor Locations Tab ────────────────────── */}
                {activeTab === 'locations' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-off-black">Top Competitor Fueling Locations</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Non-Circle K stations ranked by gallons purchased</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Station</th>
                            <th className="text-left py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Brand</th>
                            <th className="text-left py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Location</th>
                            <th className="text-right py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Trans</th>
                            <th className="text-right py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Gallons</th>
                            <th className="text-right py-2 pl-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Spend</th>
                            <th className="text-right py-2 pl-4 text-xs font-semibold uppercase tracking-wider text-gray-500">CK Nearby?</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {summary.topCompetitorLocations.map((loc, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="py-2.5 pr-4 font-medium text-off-black max-w-[200px] truncate">
                                {loc.stationName}
                              </td>
                              <td className="py-2.5 px-4 text-gray-600 text-xs">{loc.displayBrand}</td>
                              <td className="py-2.5 px-4 text-gray-500 text-xs whitespace-nowrap">
                                {loc.city}, {loc.state} {loc.zipCode}
                              </td>
                              <td className="py-2.5 px-4 text-right text-gray-600">{loc.transactions}</td>
                              <td className="py-2.5 px-4 text-right font-medium">{fmtGallons(loc.gallons)}</td>
                              <td className="py-2.5 pl-4 text-right text-gray-600">{fmtDollars(loc.spend)}</td>
                              <td className="py-2.5 pl-4 text-right">
                                {loc.hasCKNearby ? (
                                  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 rounded px-2 py-0.5 font-semibold">
                                    <CheckCircle size={11} /> Yes
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5">
                                    <XCircle size={11} /> No
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Vehicles Tab ────────────────────────────────────── */}
                {activeTab === 'vehicles' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-off-black">Vehicle Fueling Summary</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Per-unit breakdown sorted by total gallons</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Unit #</th>
                            <th className="text-left py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Driver City</th>
                            <th className="text-right py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Trans</th>
                            <th className="text-right py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Gallons</th>
                            <th className="text-right py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Spend</th>
                            <th className="text-right py-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">CK Gallons</th>
                            <th className="text-right py-2 pl-4 text-xs font-semibold uppercase tracking-wider text-gray-500">CK Share</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(showAllVehicles
                            ? summary.vehicleBreakdown
                            : summary.vehicleBreakdown.slice(0, 30)
                          ).map(v => (
                            <tr key={v.unitNumber} className="hover:bg-gray-50">
                              <td className="py-2 pr-4 font-mono font-semibold text-off-black text-xs">{v.unitNumber}</td>
                              <td className="py-2 px-4 text-gray-600 text-xs">{v.driverCity}</td>
                              <td className="py-2 px-4 text-right text-gray-600">{v.transactions}</td>
                              <td className="py-2 px-4 text-right font-medium">{fmtGallons(v.gallons)}</td>
                              <td className="py-2 px-4 text-right text-gray-600">{fmtDollars(v.spend)}</td>
                              <td className="py-2 px-4 text-right text-brand-orange font-medium">{fmtGallons(v.ckGallons)}</td>
                              <td className="py-2 pl-4 text-right">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                    v.ckSharePct >= 20
                                      ? 'bg-green-100 text-green-700'
                                      : v.ckSharePct > 0
                                      ? 'bg-orange-100 text-orange-700'
                                      : 'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  {fmtPct(v.ckSharePct)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {summary.vehicleBreakdown.length > 30 && (
                      <button
                        onClick={() => setShowAllVehicles(v => !v)}
                        className="mt-4 flex items-center gap-1 text-sm text-brand-orange hover:underline"
                      >
                        {showAllVehicles ? (
                          <><ChevronUp size={16} /> Show fewer</>
                        ) : (
                          <><ChevronDown size={16} /> Show all {summary.vehicleBreakdown.length} vehicles</>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Fuel type summary (always visible, compact) */}
            {summary.fuelTypeBreakdown.length > 1 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-bold text-off-black mb-3 text-sm">Fuel Type Breakdown</h3>
                <div className="flex flex-wrap gap-3">
                  {summary.fuelTypeBreakdown.map(ft => (
                    <div key={ft.type} className="bg-gray-50 rounded-lg px-4 py-3 text-center min-w-[120px]">
                      <p className="text-xs font-semibold text-gray-500 mb-1">{ft.type}</p>
                      <p className="text-lg font-bold text-off-black">{fmtGallons(ft.gallons)}</p>
                      <p className="text-xs text-gray-400">gallons</p>
                      <p className="text-xs text-gray-500 mt-1">{ft.transactions.toLocaleString()} trans</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
