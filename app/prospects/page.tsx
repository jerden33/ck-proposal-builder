'use client'

import {
  useCallback, useEffect, useMemo, useState,
  type ReactNode, type RefObject,
} from 'react'
import {
  Download, Star, ExternalLink, X, ChevronUp, ChevronDown,
  Phone, Truck, Zap, Search, AlertTriangle, CheckCircle2,
  Filter, TableProperties, Database,
} from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { getUserProfile } from '@/lib/supabase/queries'
import { loadFMCSACarriers, getFMCSADatasetMeta, type FMCSADatasetMeta } from '@/lib/supabase/queries'
import type { UserProfile } from '@/lib/types'
import { isStaleMCS150Date, computeOpportunityScore, type FMCSACarrier } from '@/lib/fmcsa-parser'

// ── Constants ─────────────────────────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

const CARGO_OPTIONS = [
  'General Freight', 'Refrigerated Food', 'Tanker/Liquids',
  'Hazardous Materials', 'Flatbed', 'Auto Carrier',
  'Household Goods', 'Dry Bulk', 'Grain', 'Other',
]

// ── Filter state ──────────────────────────────────────────────────────────────

interface ProspectFilters {
  states: string[]
  citySearch: string
  minPowerUnits: number
  maxPowerUnits: number
  carrierOperations: string[]
  cargoTypes: string[]
  hazmatOnly: boolean
  passengerOnly: boolean
  statusFilter: 'active' | 'inactive' | 'all'
  includeStaleMCS150: boolean
  starredOnly: boolean
}

const DEFAULT_FILTERS: ProspectFilters = {
  states: [],
  citySearch: '',
  minPowerUnits: 0,
  maxPowerUnits: 500,
  carrierOperations: [],
  cargoTypes: [],
  hazmatOnly: false,
  passengerOnly: false,
  statusFilter: 'active',
  includeStaleMCS150: false,
  starredOnly: false,
}

// ── Table sort ────────────────────────────────────────────────────────────────

type SortKey =
  | 'legalName' | 'city' | 'powerUnits' | 'drivers'
  | 'carrierOperation' | 'opportunityScore'

interface SortConfig { key: SortKey; dir: 'asc' | 'desc' }

type ViewMode = 'table' | 'quickdial'

// ─── Filter logic ─────────────────────────────────────────────────────────────

function applyFilters(
  carriers: FMCSACarrier[],
  f: ProspectFilters,
  starred: Set<string>
): FMCSACarrier[] {
  const city = f.citySearch.trim().toLowerCase()
  return carriers.filter(c => {
    if (f.states.length > 0 && !f.states.includes(c.state)) return false
    if (city && !c.city.toLowerCase().includes(city)) return false
    if (c.powerUnits < f.minPowerUnits) return false
    if (f.maxPowerUnits < 500 && c.powerUnits > f.maxPowerUnits) return false
    if (f.carrierOperations.length > 0 && !f.carrierOperations.includes(c.carrierOperation)) return false
    if (f.cargoTypes.length > 0) {
      const match = c.cargoCarried.some(cargo =>
        f.cargoTypes.some(ft => cargo.toLowerCase().includes(ft.toLowerCase()))
      )
      if (!match) return false
    }
    if (f.hazmatOnly && !c.hmFlag && !c.cargoCarried.some(x => /hazmat|hazardous/i.test(x))) return false
    if (f.passengerOnly && !c.pcFlag && !/passenger/i.test(c.carrierOperation)) return false
    if (f.statusFilter === 'active' && c.operatingStatus !== 'ACTIVE') return false
    if (f.statusFilter === 'inactive' && c.operatingStatus !== 'INACTIVE') return false
    if (!f.includeStaleMCS150 && c.isStaleMCS150) return false
    if (f.starredOnly && !starred.has(c.dotNumber)) return false
    return true
  })
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

function sortCarriers(carriers: FMCSACarrier[], s: SortConfig): FMCSACarrier[] {
  return [...carriers].sort((a, b) => {
    let av: number | string = 0, bv: number | string = 0
    switch (s.key) {
      case 'legalName':        av = a.legalName.toLowerCase(); bv = b.legalName.toLowerCase(); break
      case 'city':             av = `${a.city},${a.state}`.toLowerCase(); bv = `${b.city},${b.state}`.toLowerCase(); break
      case 'powerUnits':       av = a.powerUnits; bv = b.powerUnits; break
      case 'drivers':          av = a.drivers; bv = b.drivers; break
      case 'carrierOperation': av = a.carrierOperation.toLowerCase(); bv = b.carrierOperation.toLowerCase(); break
      case 'opportunityScore': av = a.opportunityScore ?? 0; bv = b.opportunityScore ?? 0; break
    }
    if (av < bv) return s.dir === 'asc' ? -1 : 1
    if (av > bv) return s.dir === 'asc' ? 1 : -1
    return 0
  })
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(carriers: FMCSACarrier[], filters: ProspectFilters) {
  const stateStr = filters.states.length > 0 ? filters.states.join('-') : 'ALL'
  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const filename = `CK_OTR_Prospects_${stateStr}_${dateStr}.csv`

  const headers = [
    'DOT Number', 'Legal Name', 'DBA', 'Address', 'City', 'State', 'ZIP',
    'Phone', 'Power Units', 'Drivers', 'Cargo Types', 'Carrier Operation',
    'Hazmat Auth', 'Passenger Carrier', 'Operating Status',
    'MCS-150 Date', 'SAFER Link', 'Date Exported',
  ]

  const dateExported = new Date().toLocaleDateString()
  const rows = carriers.map(c => [
    c.dotNumber, c.legalName, c.dbaName, c.address, c.city, c.state, c.zip,
    c.phone, c.powerUnits, c.drivers, c.cargoCarried.join('; '), c.carrierOperation,
    c.hmFlag ? 'Y' : 'N', c.pcFlag ? 'Y' : 'N',
    c.operatingStatus, c.mcs150Date ?? '',
    c.dotNumber ? `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${c.dotNumber}` : '',
    dateExported,
  ])

  const filterNote =
    `\n\n"Filters applied","States: ${filters.states.join('|') || 'All'}",` +
    `"City: ${filters.citySearch || 'All'}",` +
    `"Power Units: ${filters.minPowerUnits}–${filters.maxPowerUnits === 500 ? '500+' : filters.maxPowerUnits}",` +
    `"Status: ${filters.statusFilter}"`

  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n') + filterNote

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function saferUrl(dot: string) {
  return `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${dot}`
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page component
// ═══════════════════════════════════════════════════════════════════════════════

export default function OTRProspectsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [allCarriers, setAllCarriers] = useState<FMCSACarrier[]>([])
  const [datasetMeta, setDatasetMeta] = useState<FMCSADatasetMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<ProspectFilters>(DEFAULT_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<ProspectFilters>(DEFAULT_FILTERS)
  const [starred, setStarred] = useState<Set<string>>(new Set())
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [selectedCarrier, setSelectedCarrier] = useState<FMCSACarrier | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'opportunityScore', dir: 'desc' })

  // Load carriers and metadata on mount
  useEffect(() => {
    Promise.all([getUserProfile(), loadFMCSACarriers(), getFMCSADatasetMeta()])
      .then(([prof, carriers, meta]) => {
        setProfile(prof)
        setDatasetMeta(meta)

        // Stamp isStaleMCS150 and opportunityScore on load
        const enriched = carriers.map(c => ({
          ...c,
          isStaleMCS150: isStaleMCS150Date(c.mcs150Date),
          opportunityScore: computeOpportunityScore(c),
        }))
        setAllCarriers(enriched)

        // Auto-select states present in the dataset
        if (meta?.statesCovered?.length) {
          const autoStates = meta.statesCovered.slice(0, 8)
          setFilters(f => ({ ...f, states: autoStates }))
          setAppliedFilters(f => ({ ...f, states: autoStates }))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  // Derived filtered + sorted list
  const filteredCarriers = useMemo(
    () => sortCarriers(applyFilters(allCarriers, appliedFilters, starred), sortConfig),
    [allCarriers, appliedFilters, starred, sortConfig]
  )

  const hotZoneCount = useMemo(
    () => filteredCarriers.filter(c => c.isHotZone).length,
    [filteredCarriers]
  )

  // ── Actions ─────────────────────────────────────────────────────────────────

  const toggleStar = useCallback((dot: string) => {
    setStarred(prev => { const n = new Set(prev); n.has(dot) ? n.delete(dot) : n.add(dot); return n })
  }, [])

  const toggleRow = useCallback((dot: string) => {
    setSelectedRows(prev => { const n = new Set(prev); n.has(dot) ? n.delete(dot) : n.add(dot); return n })
  }, [])

  const toggleAllRows = () => {
    setSelectedRows(prev =>
      prev.size === filteredCarriers.length && filteredCarriers.length > 0
        ? new Set()
        : new Set(filteredCarriers.map(c => c.dotNumber))
    )
  }

  const toggleSort = (key: SortKey) => {
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'opportunityScore' || key === 'powerUnits' ? 'desc' : 'asc' }
    )
  }

  const handleExport = (onlySelected = false) => {
    const toExport = onlySelected
      ? filteredCarriers.filter(c => selectedRows.has(c.dotNumber))
      : filteredCarriers
    exportCSV(toExport, appliedFilters)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-off-white">
      <Navbar />

      {/* Page header */}
      <div className="border-b border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-off-black font-display tracking-tight">
              OTR Prospects
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {loading
                ? 'Loading carrier dataset…'
                : allCarriers.length > 0
                ? `${allCarriers.length.toLocaleString()} carriers · updated ${
                    datasetMeta?.lastUpdated
                      ? new Date(datasetMeta.lastUpdated).toLocaleDateString()
                      : '—'
                  }`
                : 'No dataset loaded — contact your admin'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {starred.size > 0 && (
              <button
                onClick={() => exportCSV(allCarriers.filter(c => starred.has(c.dotNumber)), appliedFilters)}
                className="btn-secondary flex items-center gap-1.5 text-amber-600 border-amber-200 hover:border-amber-300"
              >
                <Star size={14} className="fill-amber-400 text-amber-400" />
                Export starred ({starred.size})
              </button>
            )}
            {filteredCarriers.length > 0 && (
              <button
                onClick={() => handleExport(false)}
                className="btn-secondary flex items-center gap-1.5"
              >
                <Download size={14} />
                Export CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary bar */}
      {!loading && allCarriers.length > 0 && (
        <div className="border-b border-zinc-100 bg-white/60">
          <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-8">
            <SummaryStat label="Showing" value={filteredCarriers.length.toLocaleString()} />
            <SummaryStat label="Total power units" value={filteredCarriers.reduce((s, c) => s + c.powerUnits, 0).toLocaleString()} />
            <SummaryStat label="Hazmat-auth" value={filteredCarriers.filter(c => c.hmFlag).length.toLocaleString()} color="orange" />
            <SummaryStat label="In dataset" value={allCarriers.length.toLocaleString()} sub={datasetMeta?.statesCovered.join(', ')} />
            {selectedRows.size > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-zinc-500">{selectedRows.size} selected</span>
                <button onClick={() => handleExport(true)} className="btn-secondary py-1.5 text-xs flex items-center gap-1">
                  <Download size={12} /> Export selected
                </button>
                <button onClick={() => setSelectedRows(new Set())} className="text-zinc-400 hover:text-zinc-600 p-1">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <LoadingState />
        ) : allCarriers.length === 0 ? (
          <EmptyState isAdmin={profile?.is_admin ?? false} />
        ) : (
          <div className="flex gap-6">
            {/* Filter sidebar */}
            <aside className="w-64 shrink-0">
              <FilterPanel
                filters={filters}
                onChange={setFilters}
                onApply={() => setAppliedFilters(filters)}
                onReset={() => { setFilters(DEFAULT_FILTERS); setAppliedFilters(DEFAULT_FILTERS) }}
                availableStates={datasetMeta?.statesCovered ?? US_STATES}
              />
            </aside>

            {/* Main content area */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* View tabs */}
              <div className="flex items-center gap-0.5 bg-zinc-100 rounded-xl p-1 w-fit">
                {(
                  [
                    { id: 'table',     label: 'Table',      icon: TableProperties },
                    { id: 'quickdial', label: 'Quick Dial', icon: Phone },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setViewMode(id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      viewMode === id
                        ? 'bg-white text-zinc-900 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>

              <CarrierTable
                carriers={filteredCarriers}
                starred={starred}
                selectedRows={selectedRows}
                sortConfig={sortConfig}
                quickDial={viewMode === 'quickdial'}
                onRowClick={dot => setSelectedCarrier(allCarriers.find(c => c.dotNumber === dot) ?? null)}
                onToggleStar={toggleStar}
                onToggleRow={toggleRow}
                onToggleAll={toggleAllRows}
                onSort={toggleSort}
              />

              {filteredCarriers.length === 0 && (
                <div className="card text-center py-12">
                  <Search size={32} className="text-zinc-300 mx-auto mb-3" />
                  <p className="font-semibold text-zinc-600">No prospects match these filters</p>
                  <p className="text-sm text-zinc-400 mt-1">Try adjusting the state, city, or carrier type</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Carrier detail drawer */}
      {selectedCarrier && (
        <CarrierDrawer
          carrier={selectedCarrier}
          isStarred={starred.has(selectedCarrier.dotNumber)}
          onToggleStar={() => toggleStar(selectedCarrier.dotNumber)}
          onClose={() => setSelectedCarrier(null)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function LoadingState() {
  return (
    <div className="card text-center py-16 max-w-sm mx-auto fade-in">
      <div className="w-8 h-8 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-zinc-500 font-medium">Loading carrier dataset…</p>
    </div>
  )
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="card text-center py-16 max-w-lg mx-auto fade-in">
      <div className="w-14 h-14 bg-brand-orange/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Database size={28} className="text-brand-orange" />
      </div>
      <h2 className="text-xl font-semibold text-off-black font-display mb-2">No Dataset Loaded</h2>
      <p className="text-sm text-zinc-500 mb-6">
        {isAdmin
          ? 'Upload an FMCSA SAFER Census CSV in the Admin panel to populate OTR Prospects for all users.'
          : 'The carrier dataset has not been loaded yet. Contact your administrator to upload the FMCSA data.'}
      </p>
      {isAdmin && (
        <a href="/admin" className="btn-primary inline-flex items-center gap-2">
          Go to Admin Panel
        </a>
      )}
    </div>
  )
}

function SummaryStat({
  label, value, sub, color,
}: {
  label: string; value: string; sub?: string; color?: 'orange'
}) {
  return (
    <div>
      <span className={`text-sm font-bold ${color === 'orange' ? 'text-brand-orange' : 'text-zinc-800'}`}>
        {value}
      </span>
      <span className="text-xs text-zinc-400 ml-1.5">{label}</span>
      {sub && <span className="block text-xs text-zinc-300">{sub}</span>}
    </div>
  )
}

// ── Filter panel ──────────────────────────────────────────────────────────────

function FilterPanel({
  filters, onChange, onApply, onReset, availableStates,
}: {
  filters: ProspectFilters
  onChange: (f: ProspectFilters) => void
  onApply: () => void
  onReset: () => void
  availableStates: string[]
}) {
  const set = (patch: Partial<ProspectFilters>) => onChange({ ...filters, ...patch })

  const toggleArr = (key: 'states' | 'carrierOperations' | 'cargoTypes', val: string) => {
    const arr = filters[key] as string[]
    set({ [key]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] })
  }

  return (
    <div className="card p-4 space-y-5 sticky top-4">
      <div className="flex items-center gap-1.5 text-zinc-700">
        <Filter size={14} strokeWidth={2} />
        <span className="text-sm font-semibold">Filters</span>
      </div>

      {/* State */}
      <div>
        <label className="input-label">State</label>
        <div className="flex flex-wrap gap-1 mt-1 max-h-40 overflow-y-auto pr-1">
          {availableStates.map(s => (
            <button
              key={s}
              onClick={() => toggleArr('states', s)}
              className={`px-2 py-0.5 rounded-md text-xs font-medium border transition-all ${
                filters.states.includes(s)
                  ? 'bg-accent text-white border-accent'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:border-accent/50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {filters.states.length > 0 && (
          <button onClick={() => set({ states: [] })} className="text-xs text-accent mt-1 hover:underline">
            Clear ({filters.states.length})
          </button>
        )}
      </div>

      {/* City search */}
      <div>
        <label className="input-label">City</label>
        <input
          type="text"
          placeholder="Search city…"
          value={filters.citySearch}
          onChange={e => set({ citySearch: e.target.value })}
          className="input-field text-sm"
        />
      </div>

      {/* Carrier type flags */}
      <div>
        <label className="input-label">Carrier Type</label>
        <div className="flex flex-col gap-1.5 mt-1">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-600">
            <input type="checkbox" checked={filters.hazmatOnly}
              onChange={e => set({ hazmatOnly: e.target.checked })} />
            Hazmat authorized
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-600">
            <input type="checkbox" checked={filters.passengerOnly}
              onChange={e => set({ passengerOnly: e.target.checked })} />
            Passenger carriers
          </label>
        </div>
      </div>

      {/* Operation type */}
      <div>
        <label className="input-label">Operation</label>
        <div className="flex flex-col gap-1 mt-1">
          {['For-Hire', 'Private', 'Both'].map(op => (
            <label key={op} className="flex items-center gap-2 cursor-pointer text-sm text-zinc-600">
              <input type="checkbox"
                checked={filters.carrierOperations.includes(op)}
                onChange={() => toggleArr('carrierOperations', op)} />
              {op}
            </label>
          ))}
        </div>
      </div>

      {/* Cargo type */}
      <div>
        <label className="input-label">Cargo Type</label>
        <div className="flex flex-col gap-1 mt-1 max-h-48 overflow-y-auto">
          {CARGO_OPTIONS.map(cargo => (
            <label key={cargo} className="flex items-center gap-2 cursor-pointer text-sm text-zinc-600">
              <input type="checkbox"
                checked={filters.cargoTypes.includes(cargo)}
                onChange={() => toggleArr('cargoTypes', cargo)} />
              {cargo}
              {(cargo.includes('Refrigerat') || cargo.includes('Tanker')) && (
                <span className="text-xs text-accent font-medium ml-auto">High freq</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Power units */}
      <div>
        <label className="input-label">
          Power Units
          <span className="text-zinc-400 font-normal ml-1">
            ({filters.minPowerUnits}–{filters.maxPowerUnits === 500 ? '500+' : filters.maxPowerUnits})
          </span>
        </label>
        <div className="space-y-1 mt-1">
          <input type="range" min={0} max={500} step={5} value={filters.minPowerUnits}
            onChange={e => set({ minPowerUnits: Number(e.target.value) })}
            className="w-full accent-sky-500" />
          <input type="range" min={0} max={500} step={5} value={filters.maxPowerUnits}
            onChange={e => set({ maxPowerUnits: Number(e.target.value) })}
            className="w-full accent-sky-500" />
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Min: {filters.minPowerUnits}</span>
            <span>Max: {filters.maxPowerUnits === 500 ? '500+' : filters.maxPowerUnits}</span>
          </div>
        </div>
      </div>

      {/* Status */}
      <div>
        <label className="input-label">Status</label>
        <div className="flex flex-col gap-1 mt-1">
          {(
            [
              { value: 'active',   label: 'Active only' },
              { value: 'inactive', label: 'Inactive only' },
              { value: 'all',      label: 'All statuses' },
            ] as const
          ).map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer text-sm text-zinc-600">
              <input type="radio" name="statusFilter" checked={filters.statusFilter === value}
                onChange={() => set({ statusFilter: value })} className="accent-sky-500" />
              {label}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-600">
        <input type="checkbox" checked={filters.includeStaleMCS150}
          onChange={e => set({ includeStaleMCS150: e.target.checked })} />
        Include stale MCS-150 (&gt; 2 yrs)
      </label>

      <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-600">
        <input type="checkbox" checked={filters.starredOnly}
          onChange={e => set({ starredOnly: e.target.checked })} />
        Starred only
      </label>

      <div className="flex gap-2 pt-1">
        <button onClick={onApply} className="btn-primary flex-1 py-2 text-sm">Apply</button>
        <button onClick={onReset} className="btn-secondary flex-1 py-2 text-sm">Reset</button>
      </div>
    </div>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

type ColDef = { key: SortKey; label: string }

const TABLE_COLS: ColDef[] = [
  { key: 'legalName',        label: 'Company' },
  { key: 'city',             label: 'City, State' },
  { key: 'powerUnits',       label: 'Units' },
  { key: 'drivers',          label: 'Drivers' },
  { key: 'carrierOperation', label: 'Operation' },
  { key: 'opportunityScore', label: 'Score' },
]

function CarrierTable({
  carriers, starred, selectedRows, sortConfig, quickDial,
  onRowClick, onToggleStar, onToggleRow, onToggleAll, onSort,
}: {
  carriers: FMCSACarrier[]
  starred: Set<string>
  selectedRows: Set<string>
  sortConfig: SortConfig
  quickDial: boolean
  onRowClick: (dot: string) => void
  onToggleStar: (dot: string) => void
  onToggleRow: (dot: string) => void
  onToggleAll: () => void
  onSort: (key: SortKey) => void
}) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/80">
              <th className="pl-4 pr-2 py-3">
                <input type="checkbox"
                  checked={selectedRows.size === carriers.length && carriers.length > 0}
                  onChange={onToggleAll} />
              </th>
              <th className="px-2 py-3 w-8" />
              {TABLE_COLS.map(col => (
                <th
                  key={col.key}
                  className="px-3 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-zinc-700 select-none"
                  onClick={() => onSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortConfig.key === col.key && (
                      sortConfig.dir === 'asc'
                        ? <ChevronUp size={12} className="text-accent" />
                        : <ChevronDown size={12} className="text-accent" />
                    )}
                  </span>
                </th>
              ))}
              {quickDial && (
                <th className="px-3 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Phone</th>
              )}
              <th className="px-3 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">SAFER</th>
            </tr>
          </thead>
          <tbody>
            {carriers.slice(0, 500).map(c => {
              const isStarred = starred.has(c.dotNumber)
              const isSelected = selectedRows.has(c.dotNumber)
              return (
                <tr
                  key={c.dotNumber}
                  onClick={() => onRowClick(c.dotNumber)}
                  className={`border-b border-zinc-50 cursor-pointer transition-colors
                    ${isSelected ? 'bg-accent-muted/30' : 'hover:bg-zinc-50'}
                    ${c.isStaleMCS150 ? 'opacity-60' : ''}`}
                >
                  <td className="pl-4 pr-2 py-2.5" onClick={e => { e.stopPropagation(); onToggleRow(c.dotNumber) }}>
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleRow(c.dotNumber)} />
                  </td>
                  <td className="px-2 py-2.5" onClick={e => { e.stopPropagation(); onToggleStar(c.dotNumber) }}>
                    <Star size={14} className={`transition-colors ${isStarred ? 'fill-amber-400 text-amber-400' : 'text-zinc-200 hover:text-amber-300'}`} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div>
                      <p className={`font-medium text-zinc-800 ${quickDial ? 'text-base' : ''}`}>
                        {c.legalName}
                      </p>
                      {c.dbaName && <p className="text-xs text-zinc-400">DBA: {c.dbaName}</p>}
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {c.hmFlag && (
                          <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium">HM</span>
                        )}
                        {c.pcFlag && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">Passenger</span>
                        )}
                        {c.isStaleMCS150 && (
                          <span className="text-xs text-amber-600 flex items-center gap-0.5">
                            <AlertTriangle size={10} /> Stale
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600 whitespace-nowrap">{c.city}, {c.state}</td>
                  <td className="px-3 py-2.5 font-medium text-zinc-800">{c.powerUnits}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{c.drivers}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{c.carrierOperation}</td>
                  <td className="px-3 py-2.5">
                    <OpportunityBadge score={c.opportunityScore ?? 0} />
                  </td>
                  {quickDial && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      {c.phone ? (
                        <a href={`tel:${c.phone.replace(/\D/g, '')}`}
                          className="text-accent font-semibold text-base hover:underline">{c.phone}</a>
                      ) : <span className="text-zinc-300">—</span>}
                    </td>
                  )}
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {c.dotNumber && (
                      <a href={saferUrl(c.dotNumber)} target="_blank" rel="noopener noreferrer"
                        className="text-zinc-400 hover:text-accent transition-colors" title="SAFER">
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {carriers.length > 500 && (
        <div className="px-4 py-2.5 text-xs text-zinc-400 border-t border-zinc-100 bg-zinc-50">
          Showing first 500 of {carriers.length.toLocaleString()} — export CSV for full list
        </div>
      )}
      {carriers.length === 0 && (
        <div className="py-12 text-center text-zinc-400 text-sm">No prospects to display</div>
      )}
    </div>
  )
}

function OpportunityBadge({ score }: { score: number }) {
  const tier =
    score >= 70 ? { label: 'A+', cls: 'bg-green-50 text-green-700 border-green-200' }
    : score >= 50 ? { label: 'A',  cls: 'bg-accent-muted text-accent border-sky-200' }
    : score >= 30 ? { label: 'B',  cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' }
    : { label: 'C',  cls: 'bg-zinc-50 text-zinc-400 border-zinc-100' }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-bold border ${tier.cls}`}>
      {tier.label}
    </span>
  )
}

// ── Carrier drawer ────────────────────────────────────────────────────────────

function CarrierDrawer({
  carrier, isStarred, onToggleStar, onClose,
}: {
  carrier: FMCSACarrier
  isStarred: boolean
  onToggleStar: () => void
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 border-l border-zinc-200 overflow-y-auto animate-slide-in">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-zinc-100 px-5 py-4 flex items-start justify-between">
          <div className="pr-4">
            <h2 className="font-semibold text-off-black font-display text-base leading-tight">
              {carrier.legalName}
            </h2>
            {carrier.dbaName && <p className="text-xs text-zinc-400 mt-0.5">DBA: {carrier.dbaName}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onToggleStar} className="p-2 rounded-lg hover:bg-zinc-100 transition-colors">
              <Star size={16} className={isStarred ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
              carrier.operatingStatus === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-zinc-100 text-zinc-500'
            }`}>
              <CheckCircle2 size={11} /> {carrier.operatingStatus}
            </span>
            {carrier.hmFlag && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                ⚠ Hazmat Authority
              </span>
            )}
            {carrier.pcFlag && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                Passenger Carrier
              </span>
            )}
            {carrier.isStaleMCS150 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                <AlertTriangle size={11} /> Stale MCS-150
              </span>
            )}
          </div>

          {/* Phone */}
          {carrier.phone && (
            <a
              href={`tel:${carrier.phone.replace(/\D/g, '')}`}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-accent/5 border border-accent/20 hover:bg-accent/10 transition-colors group"
            >
              <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center shrink-0">
                <Phone size={16} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Phone</p>
                <p className="text-base font-bold text-accent group-hover:text-accent-dark">{carrier.phone}</p>
              </div>
            </a>
          )}

          {/* Address */}
          <DrawerRow label="Address">
            <p className="text-zinc-700 text-sm">{carrier.address}<br />{carrier.city}, {carrier.state} {carrier.zip}</p>
          </DrawerRow>

          {/* Fleet stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-50 rounded-xl p-3">
              <p className="text-xs text-zinc-400 mb-0.5">Power Units</p>
              <p className="text-2xl font-bold text-zinc-800">{carrier.powerUnits}</p>
            </div>
            <div className="bg-zinc-50 rounded-xl p-3">
              <p className="text-xs text-zinc-400 mb-0.5">Drivers</p>
              <p className="text-2xl font-bold text-zinc-800">{carrier.drivers}</p>
            </div>
          </div>

          <DrawerRow label="Operation Type">
            <span className="text-sm text-zinc-700">{carrier.carrierOperation}</span>
          </DrawerRow>

          {carrier.cargoCarried.length > 0 && (
            <DrawerRow label="Cargo Carried">
              <div className="flex flex-wrap gap-1">
                {carrier.cargoCarried.map(cargo => (
                  <span key={cargo} className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 text-zinc-600">{cargo}</span>
                ))}
              </div>
            </DrawerRow>
          )}

          <DrawerRow label="Opportunity Score">
            <div className="flex items-center gap-2">
              <OpportunityBadge score={carrier.opportunityScore ?? 0} />
              <span className="text-sm text-zinc-500">{carrier.opportunityScore ?? 0} / 105</span>
            </div>
          </DrawerRow>

          {carrier.mcs150Date && (
            <DrawerRow label="Last MCS-150 Filing">
              <span className={`text-sm ${carrier.isStaleMCS150 ? 'text-amber-600' : 'text-zinc-700'}`}>
                {carrier.mcs150Date}{carrier.isStaleMCS150 && ' (stale)'}
              </span>
            </DrawerRow>
          )}

          <DrawerRow label="DOT Number">
            <span className="text-sm text-zinc-700 font-mono">{carrier.dotNumber}</span>
          </DrawerRow>

          {carrier.dotNumber && (
            <a href={saferUrl(carrier.dotNumber)} target="_blank" rel="noopener noreferrer"
              className="btn-secondary w-full flex items-center justify-center gap-2 mt-2">
              <ExternalLink size={14} /> View on SAFER FMCSA
            </a>
          )}
        </div>
      </div>
    </>
  )
}

function DrawerRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  )
}
