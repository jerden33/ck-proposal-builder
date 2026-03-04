'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserProfile, getUserProposals, archiveProposal, duplicateProposal, deleteProposal, getUserAnalyses, deleteAnalysis } from '@/lib/supabase/queries'
import type { UserProfile, ProposalRecord, AnalysisRecord } from '@/lib/types'
import { Plus, Search, FileText, Eye, Copy, Archive, Settings, LogOut, Calendar, ExternalLink, Trash2, User, BarChart2 } from 'lucide-react'
import Image from 'next/image'

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [proposals, setProposals] = useState<ProposalRecord[]>([])
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'shared' | 'archived'>('all')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [userProfile, userProposals, userAnalyses] = await Promise.all([
      getUserProfile(),
      getUserProposals(),
      getUserAnalyses(),
    ])
    setProfile(userProfile)
    setProposals(userProposals)
    setAnalyses(userAnalyses)
    setLoading(false)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleArchive = async (id: string) => {
    if (confirm('Are you sure you want to archive this proposal?')) {
      const success = await archiveProposal(id)
      if (success) {
        await loadData()
      }
    }
  }

  const handleDuplicate = async (id: string) => {
    const result = await duplicateProposal(id)
    if (result) {
      await loadData()
      router.push(`/?edit=${result.id}`)
    }
  }

  const handleDelete = async (id: string, customerName: string) => {
    // Only admins and super admins can delete
    if (!profile?.is_admin && !profile?.is_super_admin) {
      alert('Only administrators can permanently delete proposals.')
      return
    }

    const confirmMessage = `⚠️ WARNING: This will PERMANENTLY DELETE this proposal!\n\nCustomer: ${customerName}\n\nThis action CANNOT be undone. Are you absolutely sure?`
    if (confirm(confirmMessage)) {
      const success = await deleteProposal(id)
      if (success) {
        await loadData()
      } else {
        alert('Failed to delete proposal. Please check console for errors.')
      }
    }
  }

  const handleDeleteAnalysis = async (id: string, name: string) => {
    if (!confirm(`Delete analysis for "${name}"? This cannot be undone.`)) return
    const success = await deleteAnalysis(id)
    if (success) await loadData()
  }

  const filteredProposals = proposals.filter(p => {
    const matchesSearch = p.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-off-white to-white">
        <div className="text-center">
          <div className="loading-spinner w-16 h-16 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-off-white to-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Image
                src="/circle-k-pro-logo.png"
                alt="Circle K Pro"
                width={120}
                height={36}
                className="w-32 h-auto"
              />
              <div className="h-8 w-px bg-gray-300"></div>
              <h1 className="text-xl font-bold text-off-black">Proposal Builder</h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right mr-4">
                <p className="text-sm font-semibold text-off-black">{profile?.full_name || profile?.email}</p>
                <p className="text-xs text-gray-500">
                  {profile?.is_super_admin ? 'Super Administrator' : profile?.is_admin ? 'Administrator' : 'User'}
                </p>
              </div>

              {(profile?.is_admin || profile?.is_super_admin) && (
                <button
                  onClick={() => router.push('/admin')}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Settings size={18} />
                  Admin
                </button>
              )}

              <button
                onClick={handleLogout}
                className="btn-secondary flex items-center gap-2"
              >
                <LogOut size={18} />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Actions Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-off-black mb-2">My Proposals</h2>
            <p className="text-gray-600">
              {filteredProposals.length} {filteredProposals.length === 1 ? 'proposal' : 'proposals'}
            </p>
          </div>

          <button
            onClick={() => router.push('/')}
            className="btn-primary flex items-center justify-center gap-2 text-base"
          >
            <Plus size={20} />
            New Proposal
          </button>
        </div>

        {/* Search and Filter */}
        <div className="card mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by customer name..."
                className="input-field pl-10"
              />
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="input-field"
              >
                <option value="all">All Proposals</option>
                <option value="draft">Drafts</option>
                <option value="shared">Shared</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>

        {/* Proposals Grid */}
        {filteredProposals.length === 0 ? (
          <div className="card text-center py-16">
            <FileText size={64} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-bold text-gray-700 mb-2">No proposals found</h3>
            <p className="text-gray-600 mb-6">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Get started by creating your first proposal'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <button
                onClick={() => router.push('/')}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Plus size={20} />
                Create First Proposal
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProposals.map((proposal) => (
              <div
                key={proposal.id}
                className="card-interactive p-6 group"
              >
                {/* Status Badge */}
                <div className="flex items-center justify-between mb-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      proposal.status === 'shared'
                        ? 'bg-green-100 text-green-800'
                        : proposal.status === 'archived'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
                  </span>

                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Eye size={14} />
                    {proposal.view_count}
                  </div>
                </div>

                {/* Customer Name */}
                <h3 className="text-xl font-bold text-off-black mb-2 line-clamp-2">
                  {proposal.customer_name}
                </h3>

                {/* Show proposal owner for super admins only */}
                {profile?.is_super_admin && proposal.profiles && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-3 bg-gray-50 px-2 py-1 rounded">
                    <User size={12} />
                    <span className="font-medium">Created by:</span>
                    <span>{proposal.profiles.full_name || proposal.profiles.email}</span>
                  </div>
                )}

                {/* Dates */}
                <div className="space-y-1 mb-6">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar size={14} />
                    Created {new Date(proposal.created_at).toLocaleDateString()}
                  </div>
                  {proposal.last_viewed_at && (
                    <div className="text-xs text-gray-500">
                      Last viewed {new Date(proposal.last_viewed_at).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => window.open(`/proposal?id=${proposal.id}`, '_blank')}
                    className="btn-secondary text-sm flex items-center justify-center gap-2"
                  >
                    <ExternalLink size={14} />
                    View
                  </button>

                  <button
                    onClick={() => handleDuplicate(proposal.id)}
                    className="btn-secondary text-sm flex items-center justify-center gap-2"
                  >
                    <Copy size={14} />
                    Duplicate
                  </button>
                </div>

                {proposal.status !== 'archived' && (
                  <button
                    onClick={() => handleArchive(proposal.id)}
                    className="w-full mt-2 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Archive size={14} />
                    Archive
                  </button>
                )}

                {(profile?.is_admin || profile?.is_super_admin) && (
                  <button
                    onClick={() => handleDelete(proposal.id, proposal.customer_name)}
                    className="w-full mt-2 py-2 text-sm text-red-600 hover:text-white hover:bg-red-600 rounded-lg transition-colors flex items-center justify-center gap-2 border border-red-200"
                  >
                    <Trash2 size={14} />
                    Delete Permanently
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {/* ── Saved Analyses ──────────────────────────────────────────── */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-off-black flex items-center gap-2">
                <BarChart2 size={22} />
                Saved Analyses
              </h2>
              <p className="text-gray-600 text-sm mt-1">
                {analyses.length} {analyses.length === 1 ? 'analysis' : 'analyses'}
              </p>
            </div>
            <button
              onClick={() => router.push('/analysis')}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Plus size={16} />
              New Analysis
            </button>
          </div>

          {analyses.length === 0 ? (
            <div className="card text-center py-12">
              <BarChart2 size={48} className="mx-auto text-gray-300 mb-3" />
              <h3 className="text-lg font-bold text-gray-700 mb-1">No saved analyses yet</h3>
              <p className="text-gray-500 text-sm mb-5">
                Upload a fleet transaction report in the Analysis tool and click Save to store it here.
              </p>
              <button
                onClick={() => router.push('/analysis')}
                className="btn-primary inline-flex items-center gap-2"
              >
                <BarChart2 size={16} />
                Open Analysis Tool
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {analyses.map(a => (
                <div key={a.id} className="card-interactive p-6 group">
                  <div className="flex items-start justify-between mb-3">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                      {a.detected_format || 'Fleet Analysis'}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar size={13} />
                      {new Date(a.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-off-black mb-1 line-clamp-1">
                    {a.account_name}
                  </h3>
                  {profile?.is_super_admin && a.profiles && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-2 bg-gray-50 px-2 py-1 rounded">
                      <User size={12} />
                      <span className="font-medium">Created by:</span>
                      <span>{a.profiles.full_name || a.profiles.email}</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mb-3 truncate">{a.file_name}</p>

                  <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                    <div className="bg-gray-50 rounded-lg px-2 py-2">
                      <p className="text-xs text-gray-500">Trans.</p>
                      <p className="font-bold text-off-black text-sm">{a.total_transactions.toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-2 py-2">
                      <p className="text-xs text-gray-500">Gallons</p>
                      <p className="font-bold text-off-black text-sm">
                        {a.total_gallons >= 1000
                          ? `${(a.total_gallons / 1000).toFixed(1)}k`
                          : a.total_gallons.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-2 py-2">
                      <p className="text-xs text-gray-500">Spend</p>
                      <p className="font-bold text-off-black text-sm">
                        {a.total_spend >= 1000000
                          ? `$${(a.total_spend / 1000000).toFixed(1)}M`
                          : a.total_spend >= 1000
                          ? `$${(a.total_spend / 1000).toFixed(0)}k`
                          : `$${a.total_spend.toFixed(0)}`}
                      </p>
                    </div>
                  </div>

                  {(a.date_range_start || a.date_range_end) && (
                    <p className="text-xs text-gray-400 mb-4">
                      {a.date_range_start}
                      {a.date_range_end && a.date_range_end !== a.date_range_start ? ` – ${a.date_range_end}` : ''}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/analysis?load=${a.id}`)}
                      className="flex-1 btn-secondary text-sm flex items-center justify-center gap-2"
                    >
                      <ExternalLink size={13} />
                      Open
                    </button>
                    <button
                      onClick={() => handleDeleteAnalysis(a.id, a.account_name)}
                      className="px-3 py-2 text-sm text-red-500 hover:text-white hover:bg-red-500 rounded-lg border border-red-200 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
