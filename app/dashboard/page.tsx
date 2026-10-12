'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getUserProfile, getUserAnalyses, deleteAnalysis, updateAnalysisAccountName } from '@/lib/supabase/queries'
import type { UserProfile, AnalysisRecord } from '@/lib/types'
import { BarChart2, Calendar, ExternalLink, Trash2, User, Pencil, Check, X, Truck, FolderOpen } from 'lucide-react'
import { Navbar } from '@/components/Navbar'

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [userProfile, userAnalyses] = await Promise.all([
        getUserProfile(),
        getUserAnalyses(),
      ])
      setProfile(userProfile)
      setAnalyses(userAnalyses)
    } catch (error) {
      // Without this, an unexpected rejection anywhere in the Promise.all above
      // (e.g. a transient auth/network failure) leaves `loading` stuck at
      // true forever — the page spins indefinitely instead of ever recovering.
      console.error('Failed to load dashboard data:', error)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAnalysis = async (id: string) => {
    const success = await deleteAnalysis(id)
    if (success) {
      setAnalyses(prev => prev.filter(a => a.id !== id))
    }
    setConfirmDeleteId(null)
  }

  const startRename = (a: AnalysisRecord) => {
    setRenamingId(a.id)
    setRenameValue(a.account_name)
  }

  const commitRename = async (id: string) => {
    const trimmed = renameValue.trim()
    if (trimmed) {
      await updateAnalysisAccountName(id, trimmed)
      setAnalyses(prev => prev.map(a => a.id === id ? { ...a, account_name: trimmed } : a))
    }
    setRenamingId(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-off-white">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-zinc-200 border-t-accent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-zinc-500">Loading…</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-off-white">
        <div className="text-center max-w-xs">
          <p className="text-sm font-medium text-zinc-700 mb-1">Couldn&apos;t load your analyses</p>
          <p className="text-sm text-zinc-400 mb-4">This is usually a temporary connection issue. Try again, or refresh the page.</p>
          <button
            onClick={() => loadData()}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-off-white" style={{ backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)', backgroundSize: '28px 28px', backgroundAttachment: 'fixed' }}>
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Page header */}
        <div className="flex items-center justify-between mb-8 fade-in">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Fleet Analyses</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              {analyses.length} {analyses.length === 1 ? 'analysis' : 'analyses'} saved
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/analysis?new=1')}
              className="btn-primary flex items-center gap-2 text-sm py-2"
            >
              <BarChart2 size={15} />
              New Analysis
            </button>
          </div>
        </div>

        {/* Analyses */}
        {analyses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm text-center py-20 fade-in">
            <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mx-auto mb-4">
              <FolderOpen size={20} className="text-zinc-400" />
            </div>
            <h3 className="text-base font-semibold text-zinc-700 mb-1">No analyses yet</h3>
            <p className="text-sm text-zinc-400 mb-6 max-w-xs mx-auto">
              Upload a fleet transaction file in the Analysis tool, then click Save.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => router.push('/analysis?new=1')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                <BarChart2 size={15} />
                New Analysis
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-cards">
            {analyses.map(a => {
              const isOTR = a.data?.analysisType === 'otr'
              const isConfirmingDelete = confirmDeleteId === a.id
              return (
                <div key={a.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 group hover:border-zinc-300 hover:shadow-md transition-all duration-200">

                  {/* Header row */}
                  <div className="flex items-start justify-between mb-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      isOTR
                        ? 'bg-sky-100 text-sky-700'
                        : 'bg-violet-100 text-violet-700'
                    }`}>
                      {isOTR ? <Truck size={11} /> : <BarChart2 size={11} />}
                      {isOTR ? 'OTR Corridor' : (a.detected_format || 'Fleet Analysis')}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <Calendar size={12} />
                      {new Date(a.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Account name (editable) */}
                  {renamingId === a.id ? (
                    <div className="flex items-center gap-1 mb-1">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename(a.id)
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        onBlur={() => commitRename(a.id)}
                        className="flex-1 text-base font-semibold text-zinc-900 border-b-2 border-accent bg-transparent outline-none min-w-0"
                      />
                      <button onMouseDown={() => commitRename(a.id)} className="text-green-600 hover:text-green-700 shrink-0"><Check size={15} /></button>
                      <button onMouseDown={() => setRenamingId(null)} className="text-zinc-400 hover:text-zinc-600 shrink-0"><X size={15} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mb-1 group/name">
                      <h3 className="text-base font-semibold text-zinc-900 line-clamp-1 min-w-0">{a.account_name}</h3>
                      <button
                        onClick={() => startRename(a)}
                        className="text-zinc-300 hover:text-zinc-500 opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0"
                        title="Rename"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}

                  {profile?.is_super_admin && a.profiles && (
                    <div className="flex items-center gap-1 text-xs text-zinc-400 mb-2">
                      <User size={11} />
                      <span>{a.profiles.full_name || a.profiles.email}</span>
                    </div>
                  )}

                  {(a.date_range_start || a.date_range_end) && (
                    <p className="text-xs text-zinc-400 mb-3">
                      {a.date_range_start}
                      {a.date_range_end && a.date_range_end !== a.date_range_start ? ` – ${a.date_range_end}` : ''}
                    </p>
                  )}

                  {/* Mini stats */}
                  <div className="rounded-lg border border-zinc-100 overflow-hidden bg-zinc-50 mb-4">
                    <div className="grid grid-cols-3 divide-x divide-zinc-100">
                      <div className="px-3 py-2 text-center">
                        <p className="text-xs text-zinc-400 mb-0.5">Trans.</p>
                        <p className="text-sm font-bold text-zinc-800">{a.total_transactions.toLocaleString()}</p>
                      </div>
                      <div className="px-3 py-2 text-center">
                        <p className="text-xs text-zinc-400 mb-0.5">Gallons</p>
                        <p className="text-sm font-bold text-zinc-800">
                          {a.total_gallons >= 1000
                            ? `${(a.total_gallons / 1000).toFixed(1)}k`
                            : a.total_gallons.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div className="px-3 py-2 text-center">
                        <p className="text-xs text-zinc-400 mb-0.5">Spend</p>
                        <p className="text-sm font-bold text-zinc-800">
                          {a.total_spend >= 1000000
                            ? `$${(a.total_spend / 1000000).toFixed(1)}M`
                            : a.total_spend >= 1000
                            ? `$${(a.total_spend / 1000).toFixed(0)}k`
                            : `$${a.total_spend.toFixed(0)}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {isConfirmingDelete ? (
                    <div className="flex gap-2 items-center fade-in">
                      <p className="flex-1 text-xs text-red-600 font-medium">Delete this analysis?</p>
                      <button
                        onClick={() => handleDeleteAnalysis(a.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => router.push(`/analysis?load=${a.id}`)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
                      >
                        <ExternalLink size={13} />
                        Open
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(a.id)}
                        className="px-3 py-2 text-sm text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg border border-zinc-200 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
