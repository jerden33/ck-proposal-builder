'use client'

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode, type RefObject, type ChangeEvent, type DragEvent as ReactDragEvent,
} from 'react'
import dynamic from 'next/dynamic'
import {
  Upload, Download, Star, ExternalLink, X, ChevronUp, ChevronDown,
  Phone, Truck, MapPin, Map, Zap, RefreshCw, Search,
  AlertTriangle, CheckCircle2, Filter, TableProperties,
} from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { getUserProfile } from '@/lib/supabase/queries'
import type { UserProfile } from '@/lib/types'
import { loadStoreData, getAllStores } from '@/lib/stores'

import {
  parseFMCSAFile, isStaleMCS150Date, computeOpportunityScore, haversineDistanceMiles,
  type FMCSACarrier,
} from '@/lib/fmcsa-parser'
import { geocodeAddresses, addrGeoKey } from '@/lib/geocoding'
import type { CKTruckSitePin } from '@/components/ProspectsMap'

// ── Dynamic map import (Mapbox requires browser env) ─────────────────────────

const ProspectsMapDynamic = dynamic(
  () => import('@/components/ProspectsMap').then(m => ({ default: m.ProspectsMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center bg-zinc-100 rounded-xl" style={{ height: 500 }}>
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-zinc-500">Loading map…</p>
        </div>
      </div>
    ),
  }
)

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
  'Household Goods', 'Dry Bulk', 'Other',
]

const RADIUS_OPTIONS = [1, 5, 10, 25, 50, 75, 100] as const

const FMCSA_DOWNLOAD_URL = 'https://ai.fmcsa.dot.gov/SMS/Tools/Downloads.aspx'

// ── Filter state ──────────────────────────────────────────────────────────────

interface ProspectFilters {
  states: string[]
  minPowerUnits: number
  maxPowerUnits: number
  carrierOperations: string[]
  cargoTypes: string[]
  proximityActive: boolean
  radiusMiles: number
  statusFilter: 'active' | 'inactive' | 'all'
  includeStaleMCS150: boolean
  starredOnly: boolean
}

const DEFAULT_FILTERS: ProspectFilters = {
  states: ['MN'],
  minPowerUnits: 0,
  maxPowerUnits: 500,
  carrierOperations: [],
  cargoTypes: [],
  proximityActive: false,
  radiusMiles: 50,
  statusFilter: 'active',
  includeStaleMCS150: false,
  starredOnly: false,
}

// ── Table sort ────────────────────────────────────────────────────────────────

type SortKey =
  | 'legalName' | 'city' | 'powerUnits' | 'drivers'
  | 'carrierOperation' | 'nearestCKDist' | 'opportunityScore'

interface SortConfig { key: SortKey; dir: 'asc' | 'desc' }

// ── View mode ─────────────────────────────────────────────────────────────────

type ViewMode = 'map' | 'table' | 'quickdial'

// ─── Core filter logic ────────────────────────────────────────────────────────

function applyFilters(
  carriers: FMCSACarrier[],
  filters: ProspectFilters,
  starred: Set<string>
): FMCSACarrier[] {
  return carriers.filter(c => {
    if (filters.states.length > 0 && !filters.states.includes(c.state)) return false
    if (c.powerUnits < filters.minPowerUnits) return false
    if (filters.maxPowerUnits < 500 && c.powerUnits > filters.maxPowerUnits) return false
    if (
      filters.carrierOperations.length > 0 &&
      !filters.carrierOperations.includes(c.carrierOperation)
    ) return false
    if (filters.cargoTypes.length > 0) {
      const match = c.cargoCarried.some(cargo =>
        filters.cargoTypes.some(ft => cargo.toLowerCase().includes(ft.toLowerCase()))
      )
      if (!match) return false
    }
    if (filters.statusFilter === 'active' && c.operatingStatus !== 'ACTIVE') return false
    if (filters.statusFilter === 'inactive' && c.operatingStatus !== 'INACTIVE') return false
    if (!filters.includeStaleMCS150 && c.isStaleMCS150) return false
    if (filters.proximityActive) {
      if (!c.nearestCKTruckSite) return false
      if (c.nearestCKTruckSite.distance > filters.radiusMiles) return false
    }
    if (filters.starredOnly && !starred.has(c.dotNumber)) return false
    return true
  })
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(carriers: FMCSACarrier[], filters: ProspectFilters) {
  const stateStr = filters.states.length > 0 ? filters.states.join('-') : 'ALL'
  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const filename = `CK_Fleet_Prospects_${stateStr}_${dateStr}.csv`

  const headers = [
    'DOT Number', 'Legal Name', 'DBA', 'Address', 'City', 'State', 'ZIP',
    'Phone', 'Power Units', 'Drivers', 'Cargo Types', 'Carrier Operation',
    'Nearest CK Truck Site', 'Distance to CK (mi)', 'Operating Status',
    'MCS-150 Date', 'SAFER Link', 'Date Exported',
  ]

  const dateExported = new Date().toLocaleDateString()
  const rows = carriers.map(c => [
    c.dotNumber,
    c.legalName,
    c.dbaName,
    c.address,
    c.city,
    c.state,
    c.zip,
    c.phone,
    c.powerUnits,
    c.drivers,
    c.cargoCarried.join('; '),
    c.carrierOperation,
    c.nearestCKTruckSite?.name ?? '',
    c.nearestCKTruckSite ? c.nearestCKTruckSite.distance.toFixed(1) : '',
    c.operatingStatus,
    c.mcs150Date ?? '',
    c.dotNumber
      ? `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${c.dotNumber}`
      : '',
    dateExported,
  ])

  const filterNote =
    `\n\n"Filters applied","States: ${filters.states.join('|') || 'All'}",` +
    `"Power Units: ${filters.minPowerUnits}–${filters.maxPowerUnits === 500 ? '500+' : filters.maxPowerUnits}",` +
    `"Proximity: ${filters.proximityActive ? filters.radiusMiles + ' mi' : 'Off'}",` +
    `"Status: ${filters.statusFilter}"`

  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [
    headers.map(escape).join(','),
    ...rows.map(r => r.map(escape).join(',')),
  ].join('\n') + filterNote

  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Enrichment ───────────────────────────────────────────────────────────────

function enrichCarriers(
  carriers: FMCSACarrier[],
  truckSites: CKTruckSitePin[]
): FMCSACarrier[] {
  return carriers.map(c => {
    if (c.lat === undefined || c.lng === undefined) {
      return { ...c, isStaleMCS150: isStaleMCS150Date(c.mcs150Date) }
    }
    let nearest: { site: CKTruckSitePin; distance: number } | null = null
    for (const site of truckSites) {
      const d = haversineDistanceMiles(c.lat, c.lng, site.coordinates.lat, site.coordinates.lng)
      if (!nearest || d < nearest.distance) nearest = { site, distance: d }
    }
    const enriched: FMCSACarrier = {
      ...c,
      nearestCKTruckSite: nearest
        ? {
            id: nearest.site.id,
            name: nearest.site.name,
            city: nearest.site.city,
            state: nearest.site.state,
            address: nearest.site.address,
            distance: nearest.distance,
          }
        : undefined,
      isHotZone: nearest ? nearest.distance <= 1 : false,
      isStaleMCS150: isStaleMCS150Date(c.mcs150Date),
    }
    enriched.opportunityScore = computeOpportunityScore(enriched)
    return enriched
  })
}

// ─── Sort helper ──────────────────────────────────────────────────────────────

function sortCarriers(carriers: FMCSACarrier[], config: SortConfig): FMCSACarrier[] {
  return [...carriers].sort((a, b) => {
    let av: number | string = 0
    let bv: number | string = 0
    switch (config.key) {
      case 'legalName':        av = a.legalName.toLowerCase(); bv = b.legalName.toLowerCase(); break
      case 'city':             av = `${a.city},${a.state}`.toLowerCase(); bv = `${b.city},${b.state}`.toLowerCase(); break
      case 'powerUnits':       av = a.powerUnits; bv = b.powerUnits; break
      case 'drivers':          av = a.drivers; bv = b.drivers; break
      case 'carrierOperation': av = a.carrierOperation.toLowerCase(); bv = b.carrierOperation.toLowerCase(); break
      case 'nearestCKDist':    av = a.nearestCKTruckSite?.distance ?? 9999; bv = b.nearestCKTruckSite?.distance ?? 9999; break
      case 'opportunityScore': av = a.opportunityScore ?? 0; bv = b.opportunityScore ?? 0; break
    }
    if (av < bv) return config.dir === 'asc' ? -1 : 1
    if (av > bv) return config.dir === 'asc' ? 1 : -1
    return 0
  })
}

// ─── SAFER link ───────────────────────────────────────────────────────────────

function saferUrl(dot: string) {
  return `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${dot}`
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page component
// ═══════════════════════════════════════════════════════════════════════════════

export default function FleetProspectsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [ckTruckSites, setCKTruckSites] = useState<CKTruckSitePin[]>([])
  const [allCarriers, setAllCarriers] = useState<FMCSACarrier[]>([])
  const [filters, setFilters] = useState<ProspectFilters>(DEFAULT_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<ProspectFilters>(DEFAULT_FILTERS)
  const [starred, setStarred] = useState<Set<string>>(new Set())
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [selectedCarrier, setSelectedCarrier] = useState<FMCSACarrier | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('map')
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'opportunityScore', dir: 'desc' })
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [geocodingProgress, setGeocodingProgress] = useState<{ done: number; total: number } | null>(null)
  const [datasetInfo, setDatasetInfo] = useState<{
    recordCount: number; lastUpdated: string; statesCovered: string[]
  } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load profile + CK truck sites on mount
  useEffect(() => {
    getUserProfile().then(setProfile)
    loadStoreData().then(() => {
      const truckStores = getAllStores().filter(s => s.truckAccessible)
      const pins: CKTruckSitePin[] = truckStores.map(s => ({
        id: s.id,
        name: s.name,
        address: s.address,
        city: s.city,
        state: s.state,
        coordinates: s.coordinates,
      }))
      setCKTruckSites(pins)
    })
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
  const totalPowerUnits = useMemo(
    () => filteredCarriers.reduce((sum, c) => sum + c.powerUnits, 0),
    [filteredCarriers]
  )

  // ── File upload & geocoding ─────────────────────────────────────────────────

  const handleFileUpload = useCallback(async (file: File) => {
    setImporting(true)
    setImportError(null)
    setGeocodingProgress(null)

    try {
      const text = await file.text()
      const { carriers, errors, statesCovered } = parseFMCSAFile(text)

      if (errors.length > 0) {
        setImportError(errors.join(' '))
        return
      }
      if (carriers.length === 0) {
        setImportError('No carrier records found in the file.')
        return
      }

      // Geocode all unique addresses
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
      const addressLocations = carriers
        .filter(c => c.address && c.city && c.state)
        .map(c => ({ address: c.address, city: c.city, state: c.state }))

      setGeocodingProgress({ done: 0, total: addressLocations.length })

      const coordMap = await geocodeAddresses(addressLocations, token, (done, total) => {
        setGeocodingProgress({ done, total })
      })

      // Attach coordinates + proximity
      const enriched = enrichCarriers(
        carriers.map(c => {
          const key = addrGeoKey(c.address, c.city, c.state)
          const coord = coordMap.get(key)
          return coord ? { ...c, lat: coord.lat, lng: coord.lng } : c
        }),
        ckTruckSites
      )

      setAllCarriers(enriched)
      setDatasetInfo({
        recordCount: enriched.length,
        lastUpdated: new Date().toLocaleString(),
        statesCovered,
      })
      setShowImport(false)
      setGeocodingProgress(null)

      // Auto-set state filter to match uploaded data
      if (statesCovered.length > 0) {
        setFilters(f => ({ ...f, states: statesCovered.slice(0, 5) }))
        setAppliedFilters(f => ({ ...f, states: statesCovered.slice(0, 5) }))
      }
    } catch (err) {
      setImportError('Failed to parse file. Please check the format and try again.')
      console.error(err)
    } finally {
      setImporting(false)
      setGeocodingProgress(null)
    }
  }, [ckTruckSites])

  const handleDropzone = useCallback((e: ReactDragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  // ── Carrier selection ───────────────────────────────────────────────────────

  const openCarrier = useCallback((dotNumber: string) => {
    const c = allCarriers.find(c => c.dotNumber === dotNumber) ?? null
    setSelectedCarrier(c)
  }, [allCarriers])

  // ── Table sort ──────────────────────────────────────────────────────────────

  const toggleSort = (key: SortKey) => {
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'opportunityScore' || key === 'powerUnits' ? 'desc' : 'asc' }
    )
  }

  // ── Starring ────────────────────────────────────────────────────────────────

  const toggleStar = (dot: string) => {
    setStarred(prev => {
      const next = new Set(prev)
      next.has(dot) ? next.delete(dot) : next.add(dot)
      return next
    })
  }

  // ── Bulk row selection ──────────────────────────────────────────────────────

  const toggleRow = (dot: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      next.has(dot) ? next.delete(dot) : next.add(dot)
      return next
    })
  }
  const toggleAllRows = () => {
    setSelectedRows(prev =>
      prev.size === filteredCarriers.length
        ? new Set()
        : new Set(filteredCarriers.map(c => c.dotNumber))
    )
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = (onlySelected = false) => {
    const toExport = onlySelected
      ? filteredCarriers.filter(c => selectedRows.has(c.dotNumber))
      : filteredCarriers
    exportCSV(toExport, appliedFilters)
  }

  const handleExportStarred = () => {
    const toExport = allCarriers.filter(c => starred.has(c.dotNumber))
    exportCSV(toExport, appliedFilters)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-off-white">
      <Navbar />

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-off-black font-display tracking-tight">
              Fleet Prospects
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {ckTruckSites.length} Circle K truck stops ·{' '}
              {allCarriers.length > 0
                ? `${allCarriers.length.toLocaleString()} carriers loaded`
                : 'Upload FMCSA data to begin prospecting'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {starred.size > 0 && (
              <button
                onClick={handleExportStarred}
                className="btn-secondary flex items-center gap-1.5 text-amber-600 border-amber-200 hover:border-amber-300"
              >
                <Star size={14} className="fill-amber-400 text-amber-400" />
                Export starred ({starred.size})
              </button>
            )}
            {allCarriers.length > 0 && (
              <button
                onClick={() => handleExport(false)}
                className="btn-secondary flex items-center gap-1.5"
              >
                <Download size={14} />
                Export CSV
              </button>
            )}
            <button
              onClick={() => setShowImport(true)}
              className="btn-primary flex items-center gap-1.5"
            >
              <Upload size={14} />
              {allCarriers.length > 0 ? 'Refresh Data' : 'Import CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary bar ─────────────────────────────────────────────────────── */}
      {allCarriers.length > 0 && (
        <div className="border-b border-zinc-100 bg-white/60">
          <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-8 stagger-stats">
            <SummaryStat label="Prospects shown" value={filteredCarriers.length.toLocaleString()} />
            <SummaryStat
              label="Hot zone carriers"
              value={hotZoneCount.toLocaleString()}
              color="orange"
              icon={<Zap size={13} className="text-brand-orange" />}
            />
            <SummaryStat
              label="Total power units"
              value={totalPowerUnits.toLocaleString()}
              icon={<Truck size={13} className="text-zinc-400" />}
            />
            <SummaryStat
              label="Dataset"
              value={`${allCarriers.length.toLocaleString()} carriers`}
              sub={datasetInfo?.lastUpdated ? `Updated ${datasetInfo.lastUpdated}` : undefined}
            />
            {selectedRows.size > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-zinc-500">{selectedRows.size} selected</span>
                <button
                  onClick={() => handleExport(true)}
                  className="btn-secondary py-1.5 text-xs flex items-center gap-1"
                >
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

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {allCarriers.length === 0 ? (
          /* Empty / welcome state */
          <EmptyState onImport={() => setShowImport(true)} ckCount={ckTruckSites.length} />
        ) : (
          <div className="flex gap-6">
            {/* ── Filter sidebar ────────────────────────────────────────────── */}
            <aside className="w-64 shrink-0">
              <FilterPanel
                filters={filters}
                onChange={setFilters}
                onApply={() => setAppliedFilters(filters)}
                onReset={() => { setFilters(DEFAULT_FILTERS); setAppliedFilters(DEFAULT_FILTERS) }}
                availableStates={datasetInfo?.statesCovered ?? US_STATES}
              />
            </aside>

            {/* ── Main view area ────────────────────────────────────────────── */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* View tabs */}
              <div className="flex items-center gap-0.5 bg-zinc-100 rounded-xl p-1 w-fit">
                {(
                  [
                    { id: 'map',       label: 'Map',        icon: Map },
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

              {/* Map view */}
              {viewMode === 'map' && (
                <div className="rounded-2xl overflow-hidden border border-zinc-200 shadow-sm">
                  <ProspectsMapDynamic
                    carriers={filteredCarriers}
                    ckTruckSites={ckTruckSites}
                    proximityActive={appliedFilters.proximityActive}
                    radiusMiles={appliedFilters.radiusMiles}
                    onCarrierClick={openCarrier}
                    height={500}
                  />
                </div>
              )}

              {/* Table / Quick Dial view */}
              {(viewMode === 'table' || viewMode === 'quickdial') && (
                <CarrierTable
                  carriers={filteredCarriers}
                  starred={starred}
                  selectedRows={selectedRows}
                  sortConfig={sortConfig}
                  quickDial={viewMode === 'quickdial'}
                  onRowClick={openCarrier}
                  onToggleStar={toggleStar}
                  onToggleRow={toggleRow}
                  onToggleAll={toggleAllRows}
                  onSort={toggleSort}
                />
              )}

              {filteredCarriers.length === 0 && allCarriers.length > 0 && (
                <div className="card text-center py-12">
                  <Search size={32} className="text-zinc-300 mx-auto mb-3" />
                  <p className="font-semibold text-zinc-600">No prospects match these filters</p>
                  <p className="text-sm text-zinc-400 mt-1">
                    Try adjusting the state, power unit range, or proximity settings
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Carrier detail drawer ─────────────────────────────────────────────── */}
      {selectedCarrier && (
        <CarrierDrawer
          carrier={selectedCarrier}
          isStarred={starred.has(selectedCarrier.dotNumber)}
          onToggleStar={() => toggleStar(selectedCarrier.dotNumber)}
          onClose={() => setSelectedCarrier(null)}
        />
      )}

      {/* ── Import modal ──────────────────────────────────────────────────────── */}
      {showImport && (
        <ImportModal
          importing={importing}
          geocodingProgress={geocodingProgress}
          datasetInfo={datasetInfo}
          importError={importError}
          fileInputRef={fileInputRef}
          onDrop={handleDropzone}
          onFileSelect={e => {
            const f = e.target.files?.[0]
            if (f) handleFileUpload(f)
          }}
          onClose={() => { if (!importing) setShowImport(false) }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

// ── Summary stat chip ─────────────────────────────────────────────────────────

function SummaryStat({
  label, value, sub, color, icon,
}: {
  label: string; value: string; sub?: string; color?: 'orange'; icon?: ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <div>
        <span className={`text-sm font-bold ${color === 'orange' ? 'text-brand-orange' : 'text-zinc-800'}`}>
          {value}
        </span>
        <span className="text-xs text-zinc-400 ml-1.5">{label}</span>
        {sub && <span className="block text-xs text-zinc-300">{sub}</span>}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onImport, ckCount }: { onImport: () => void; ckCount: number }) {
  return (
    <div className="card text-center py-16 max-w-lg mx-auto fade-in">
      <div className="w-14 h-14 bg-brand-orange/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Truck size={28} className="text-brand-orange" />
      </div>
      <h2 className="text-xl font-semibold text-off-black font-display mb-2">
        Start Prospecting
      </h2>
      <p className="text-sm text-zinc-500 mb-2">
        Import an FMCSA SAFER Census CSV to find trucking companies near{' '}
        <strong>{ckCount}</strong> Circle K truck stops.
      </p>
      <p className="text-xs text-zinc-400 mb-6">
        Download the latest carrier data from the FMCSA website, then upload it here.
        Carrier addresses will be geocoded automatically.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <button onClick={onImport} className="btn-primary flex items-center gap-2 justify-center">
          <Upload size={15} /> Import FMCSA CSV
        </button>
        <a
          href={FMCSA_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary flex items-center gap-1.5 justify-center"
        >
          <ExternalLink size={13} /> Get FMCSA Data
        </a>
      </div>
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

      {/* States */}
      <div>
        <label className="input-label">State</label>
        <div className="flex flex-wrap gap-1 mt-1 max-h-36 overflow-y-auto pr-1">
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
          <button
            onClick={() => set({ states: [] })}
            className="text-xs text-accent mt-1 hover:underline"
          >
            Clear ({filters.states.length} selected)
          </button>
        )}
      </div>

      {/* Power units */}
      <div>
        <label className="input-label">
          Power Units
          <span className="text-zinc-400 font-normal ml-1">
            ({filters.minPowerUnits}–{filters.maxPowerUnits === 500 ? '500+' : filters.maxPowerUnits})
          </span>
        </label>
        <div className="space-y-1.5 mt-1">
          <input
            type="range" min={0} max={500} step={5}
            value={filters.minPowerUnits}
            onChange={e => set({ minPowerUnits: Number(e.target.value) })}
            className="w-full accent-sky-500"
          />
          <input
            type="range" min={0} max={500} step={5}
            value={filters.maxPowerUnits}
            onChange={e => set({ maxPowerUnits: Number(e.target.value) })}
            className="w-full accent-sky-500"
          />
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Min: {filters.minPowerUnits}</span>
            <span>Max: {filters.maxPowerUnits === 500 ? '500+' : filters.maxPowerUnits}</span>
          </div>
        </div>
      </div>

      {/* Carrier operation */}
      <div>
        <label className="input-label">Operation Type</label>
        <div className="flex flex-col gap-1 mt-1">
          {['For-Hire', 'Private', 'Both'].map(op => (
            <label key={op} className="flex items-center gap-2 cursor-pointer text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={filters.carrierOperations.includes(op)}
                onChange={() => toggleArr('carrierOperations', op)}
              />
              {op}
            </label>
          ))}
        </div>
      </div>

      {/* Cargo types */}
      <div>
        <label className="input-label">Cargo Type</label>
        <div className="flex flex-col gap-1 mt-1 max-h-48 overflow-y-auto">
          {CARGO_OPTIONS.map(cargo => (
            <label key={cargo} className="flex items-center gap-2 cursor-pointer text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={filters.cargoTypes.includes(cargo)}
                onChange={() => toggleArr('cargoTypes', cargo)}
              />
              {cargo}
              {(cargo.includes('Refrigerat') || cargo.includes('Tanker')) && (
                <span className="text-xs text-accent font-medium ml-auto">High freq</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Proximity toggle */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            onClick={() => set({ proximityActive: !filters.proximityActive })}
            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
              filters.proximityActive ? 'bg-accent' : 'bg-zinc-200'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                filters.proximityActive ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </div>
          <span className="text-sm text-zinc-700 font-medium">Near CK Truck Sites only</span>
        </label>
        {filters.proximityActive && (
          <div>
            <p className="text-xs text-zinc-500 mb-1">Radius</p>
            <div className="flex flex-wrap gap-1">
              {RADIUS_OPTIONS.map(r => (
                <button
                  key={r}
                  onClick={() => set({ radiusMiles: r })}
                  className={`px-2 py-0.5 rounded-md text-xs font-medium border transition-all ${
                    filters.radiusMiles === r
                      ? 'bg-accent text-white border-accent'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:border-accent/50'
                  }`}
                >
                  {r} mi
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status filter */}
      <div>
        <label className="input-label">Operating Status</label>
        <div className="flex flex-col gap-1 mt-1">
          {(
            [
              { value: 'active',   label: 'Active only' },
              { value: 'inactive', label: 'Inactive only' },
              { value: 'all',      label: 'All statuses' },
            ] as const
          ).map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer text-sm text-zinc-600">
              <input
                type="radio"
                name="statusFilter"
                checked={filters.statusFilter === value}
                onChange={() => set({ statusFilter: value })}
                className="accent-sky-500"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Stale MCS-150 */}
      <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-600">
        <input
          type="checkbox"
          checked={filters.includeStaleMCS150}
          onChange={e => set({ includeStaleMCS150: e.target.checked })}
        />
        Include stale MCS-150 (&gt; 2 yrs)
      </label>

      {/* Starred only */}
      <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-600">
        <input
          type="checkbox"
          checked={filters.starredOnly}
          onChange={e => set({ starredOnly: e.target.checked })}
        />
        Starred only
      </label>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button onClick={onApply} className="btn-primary flex-1 py-2 text-sm">
          Apply
        </button>
        <button onClick={onReset} className="btn-secondary flex-1 py-2 text-sm">
          Reset
        </button>
      </div>
    </div>
  )
}

// ── Carrier table ─────────────────────────────────────────────────────────────

type ColDef = { key: SortKey; label: string; sortable: boolean }

const TABLE_COLS: ColDef[] = [
  { key: 'legalName',        label: 'Company',          sortable: true },
  { key: 'city',             label: 'City, State',       sortable: true },
  { key: 'powerUnits',       label: 'Units',            sortable: true },
  { key: 'drivers',          label: 'Drivers',          sortable: true },
  { key: 'carrierOperation', label: 'Operation',        sortable: true },
  { key: 'nearestCKDist',    label: 'Nearest CK',       sortable: true },
  { key: 'opportunityScore', label: 'Score',            sortable: true },
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
                <input
                  type="checkbox"
                  checked={selectedRows.size === carriers.length && carriers.length > 0}
                  onChange={onToggleAll}
                />
              </th>
              <th className="px-2 py-3 w-8" />
              {TABLE_COLS.map(col => (
                <th
                  key={col.key}
                  className={`px-3 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap
                    ${col.sortable ? 'cursor-pointer hover:text-zinc-700 select-none' : ''}`}
                  onClick={() => col.sortable && onSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortConfig.key === col.key && (
                      sortConfig.dir === 'asc'
                        ? <ChevronUp size={12} className="text-accent" />
                        : <ChevronDown size={12} className="text-accent" />
                    )}
                  </span>
                </th>
              ))}
              {quickDial && <th className="px-3 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Phone</th>}
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
                    ${c.isStaleMCS150 ? 'opacity-60' : ''}
                    ${quickDial ? 'py-1' : ''}`}
                >
                  <td className="pl-4 pr-2 py-2.5" onClick={e => { e.stopPropagation(); onToggleRow(c.dotNumber) }}>
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleRow(c.dotNumber)} />
                  </td>
                  <td className="px-2 py-2.5" onClick={e => { e.stopPropagation(); onToggleStar(c.dotNumber) }}>
                    <Star
                      size={14}
                      className={`transition-colors ${isStarred ? 'fill-amber-400 text-amber-400' : 'text-zinc-200 hover:text-amber-300'}`}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {c.isHotZone && (
                        <span title="Hot Zone" className="inline-block w-2 h-2 rounded-full bg-brand-orange shrink-0" />
                      )}
                      <div>
                        <p className={`font-medium text-zinc-800 ${quickDial ? 'text-base' : ''}`}>
                          {c.legalName}
                        </p>
                        {c.dbaName && (
                          <p className="text-xs text-zinc-400">DBA: {c.dbaName}</p>
                        )}
                        {c.isStaleMCS150 && (
                          <span className="text-xs text-amber-600 flex items-center gap-0.5">
                            <AlertTriangle size={10} /> Stale MCS-150
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600 whitespace-nowrap">
                    {c.city}, {c.state}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-zinc-800">{c.powerUnits}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{c.drivers}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{c.carrierOperation}</td>
                  <td className="px-3 py-2.5">
                    {c.nearestCKTruckSite ? (
                      <div>
                        <p className="text-zinc-700 text-xs font-medium truncate max-w-[120px]">
                          {c.nearestCKTruckSite.city}, {c.nearestCKTruckSite.state}
                        </p>
                        <p className={`text-xs ${c.isHotZone ? 'text-brand-orange font-semibold' : 'text-zinc-400'}`}>
                          {c.nearestCKTruckSite.distance.toFixed(1)} mi
                          {c.isHotZone && ' 🔥'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-zinc-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <OpportunityBadge score={c.opportunityScore ?? 0} />
                  </td>
                  {quickDial && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone.replace(/\D/g, '')}`}
                          className="text-accent font-semibold text-base hover:underline"
                        >
                          {c.phone}
                        </a>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {c.dotNumber && (
                      <a
                        href={saferUrl(c.dotNumber)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-400 hover:text-accent transition-colors"
                        title="View on SAFER"
                      >
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
          Showing first 500 of {carriers.length.toLocaleString()} results — export CSV for full list
        </div>
      )}
      {carriers.length === 0 && (
        <div className="py-12 text-center text-zinc-400 text-sm">No prospects to display</div>
      )}
    </div>
  )
}

// ── Opportunity score badge ────────────────────────────────────────────────────

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

// ── Carrier detail drawer ──────────────────────────────────────────────────────

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
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 border-l border-zinc-200 overflow-y-auto animate-slide-in">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-zinc-100 px-5 py-4 flex items-start justify-between">
          <div className="pr-4">
            <h2 className="font-semibold text-off-black font-display text-base leading-tight">
              {carrier.legalName}
            </h2>
            {carrier.dbaName && (
              <p className="text-xs text-zinc-400 mt-0.5">DBA: {carrier.dbaName}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggleStar}
              className="p-2 rounded-lg hover:bg-zinc-100 transition-colors"
              title={isStarred ? 'Unstar' : 'Star this carrier'}
            >
              <Star
                size={16}
                className={isStarred ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'}
              />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Status + Hot Zone badges */}
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
              carrier.operatingStatus === 'ACTIVE'
                ? 'bg-green-50 text-green-700'
                : 'bg-zinc-100 text-zinc-500'
            }`}>
              <CheckCircle2 size={11} /> {carrier.operatingStatus}
            </span>
            {carrier.isHotZone && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                🔥 Hot Zone — within 1 mi of CK
              </span>
            )}
            {carrier.isStaleMCS150 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                <AlertTriangle size={11} /> Stale MCS-150
              </span>
            )}
          </div>

          {/* Phone — prominent CTA */}
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
                <p className="text-base font-bold text-accent group-hover:text-accent-dark">
                  {carrier.phone}
                </p>
              </div>
            </a>
          )}

          {/* Address */}
          <DrawerRow label="Address">
            <p className="text-zinc-700 text-sm">
              {carrier.address}<br />
              {carrier.city}, {carrier.state} {carrier.zip}
            </p>
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

          {/* Carrier details */}
          <DrawerRow label="Operation Type">
            <span className="text-sm text-zinc-700">{carrier.carrierOperation}</span>
          </DrawerRow>

          {carrier.cargoCarried.length > 0 && (
            <DrawerRow label="Cargo Carried">
              <div className="flex flex-wrap gap-1">
                {carrier.cargoCarried.map(cargo => (
                  <span
                    key={cargo}
                    className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 text-zinc-600"
                  >
                    {cargo}
                  </span>
                ))}
              </div>
            </DrawerRow>
          )}

          {/* Nearest CK truck site */}
          {carrier.nearestCKTruckSite && (
            <DrawerRow label="Nearest CK Truck Stop">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-brand-orange shrink-0" />
                <div>
                  <p className="text-sm font-medium text-zinc-800">
                    {carrier.nearestCKTruckSite.city}, {carrier.nearestCKTruckSite.state}
                  </p>
                  <p className="text-xs text-zinc-500">{carrier.nearestCKTruckSite.address}</p>
                  <p className={`text-xs font-semibold mt-0.5 ${
                    carrier.isHotZone ? 'text-brand-orange' : 'text-zinc-500'
                  }`}>
                    {carrier.nearestCKTruckSite.distance.toFixed(1)} miles away
                  </p>
                </div>
              </div>
            </DrawerRow>
          )}

          {/* Opportunity score */}
          <DrawerRow label="Opportunity Score">
            <div className="flex items-center gap-2">
              <OpportunityBadge score={carrier.opportunityScore ?? 0} />
              <span className="text-sm text-zinc-500">{carrier.opportunityScore ?? 0} / 105</span>
            </div>
          </DrawerRow>

          {/* MCS-150 date */}
          {carrier.mcs150Date && (
            <DrawerRow label="Last MCS-150 Filing">
              <span className={`text-sm ${carrier.isStaleMCS150 ? 'text-amber-600' : 'text-zinc-700'}`}>
                {carrier.mcs150Date}
                {carrier.isStaleMCS150 && ' (stale)'}
              </span>
            </DrawerRow>
          )}

          {/* DOT Number */}
          <DrawerRow label="DOT Number">
            <span className="text-sm text-zinc-700 font-mono">{carrier.dotNumber}</span>
          </DrawerRow>

          {/* SAFER link */}
          {carrier.dotNumber && (
            <a
              href={saferUrl(carrier.dotNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full flex items-center justify-center gap-2 mt-2"
            >
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

// ── Import modal ──────────────────────────────────────────────────────────────

function ImportModal({
  importing, geocodingProgress, datasetInfo, importError,
  fileInputRef, onDrop, onFileSelect, onClose,
}: {
  importing: boolean
  geocodingProgress: { done: number; total: number } | null
  datasetInfo: { recordCount: number; lastUpdated: string; statesCovered: string[] } | null
  importError: string | null
  fileInputRef: RefObject<HTMLInputElement>
  onDrop: (e: ReactDragEvent) => void
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void
  onClose: () => void
}) {
  const pct = geocodingProgress
    ? Math.round((geocodingProgress.done / geocodingProgress.total) * 100)
    : 0

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-zinc-200 animate-slide-up">
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-off-black font-display">Import FMCSA Data</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Upload a FMCSA SAFER Census CSV to load carrier data
              </p>
            </div>
            {!importing && (
              <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100">
                <X size={16} />
              </button>
            )}
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Current dataset info */}
            {datasetInfo && !importing && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-2">
                <CheckCircle2 size={15} className="text-green-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-green-700">
                    {datasetInfo.recordCount.toLocaleString()} carriers loaded
                  </p>
                  <p className="text-xs text-green-600">
                    Updated {datasetInfo.lastUpdated} ·{' '}
                    States: {datasetInfo.statesCovered.join(', ')}
                  </p>
                </div>
              </div>
            )}

            {/* Geocoding progress */}
            {geocodingProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-600 font-medium">Geocoding addresses…</span>
                  <span className="text-zinc-400">{geocodingProgress.done} / {geocodingProgress.total}</span>
                </div>
                <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-400">
                  Mapping carrier addresses to lat/lng via Mapbox
                </p>
              </div>
            )}

            {/* Loading spinner */}
            {importing && !geocodingProgress && (
              <div className="flex items-center gap-3 py-2">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-sm text-zinc-600">Parsing CSV…</span>
              </div>
            )}

            {/* Error */}
            {importError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{importError}</p>
              </div>
            )}

            {/* Upload dropzone */}
            {!importing && (
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-200 rounded-xl p-8 text-center cursor-pointer hover:border-accent hover:bg-accent-muted/10 transition-all"
              >
                <Upload size={28} className="text-zinc-300 mx-auto mb-3" />
                <p className="font-medium text-zinc-600 mb-1">
                  Drop CSV here or click to browse
                </p>
                <p className="text-xs text-zinc-400">
                  FMCSA Census CSV or pipe-delimited file · Replaces current dataset
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.tsv"
                  className="hidden"
                  onChange={onFileSelect}
                />
              </div>
            )}

            {/* Format note */}
            {!importing && (
              <div className="bg-zinc-50 rounded-xl p-4 text-xs text-zinc-500 space-y-1.5">
                <p className="font-semibold text-zinc-600">Expected columns:</p>
                <p className="font-mono text-zinc-400 text-xs break-all">
                  DOT_NUMBER · LEGAL_NAME · DBA_NAME · PHY_STREET · PHY_CITY · PHY_STATE · PHY_ZIP · TELEPHONE · NBR_POWER_UNIT · DRIVER_TOTAL · CARRIER_OPERATION · CARGO_CARRIED · RECORD_STATUS · MCS150_DATE
                </p>
                <p className="pt-1">
                  Comma or pipe-delimited. Addresses are geocoded with Mapbox after upload.
                </p>
              </div>
            )}

            {/* FMCSA download link */}
            {!importing && (
              <div className="flex items-center justify-between pt-1">
                <a
                  href={FMCSA_DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline flex items-center gap-1"
                >
                  <RefreshCw size={11} /> Download latest data from FMCSA
                </a>
                <a
                  href="/sample-fmcsa.csv"
                  download
                  className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
                >
                  <Download size={11} /> Sample CSV
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
