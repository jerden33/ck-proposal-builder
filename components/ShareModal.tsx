'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Copy, Check, Link, Trash2, Users, Lock, Eye } from 'lucide-react'
import type { AnalysisShare } from '@/lib/types'
import {
  getAnalysisShares,
  createAnalysisShare,
  revokeAnalysisShare,
} from '@/lib/supabase/queries'

interface Props {
  analysisId: string
  onClose: () => void
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 4500)
  }

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs font-medium text-brand-orange hover:text-orange-600 transition-colors"
    >
      {copied ? <><Check size={13} />Copied!</> : <><Copy size={13} />Copy link</>}
    </button>
  )
}

interface ShareRowProps {
  type: 'internal' | 'customer'
  share: AnalysisShare | null
  onCreate: () => Promise<void>
  onRevoke: (token: string) => Promise<void>
  creating: boolean
  revoking: boolean
}

function ShareRow({ type, share, onCreate, onRevoke, creating, revoking }: ShareRowProps) {
  const [confirmingRevoke, setConfirmingRevoke] = useState(false)
  const isCustomer = type === 'customer'
  const shareUrl = share
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${share.token}`
    : null

  const handleRevokeClick = () => setConfirmingRevoke(true)
  const handleRevokeCancel = () => setConfirmingRevoke(false)
  const handleRevokeConfirm = async () => {
    setConfirmingRevoke(false)
    await onRevoke(share!.token)
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${isCustomer ? 'bg-orange-50 border-b border-orange-100' : 'bg-gray-50 border-b border-gray-100'}`}>
        <div className="flex items-center gap-2">
          {isCustomer ? (
            <Users size={16} className="text-brand-orange" />
          ) : (
            <Lock size={16} className="text-gray-600" />
          )}
          <span className="font-semibold text-sm text-off-black">
            {isCustomer ? 'Customer Link' : 'Internal Link'}
          </span>
          <span className="text-xs text-gray-400">
            {isCustomer
              ? '— CK branded, savings focus, rep contact'
              : '— Same as creator view, all data'}
          </span>
        </div>
        {share && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Eye size={12} />
            {share.view_count} view{share.view_count !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 bg-white">
        {share ? (
          <div className="space-y-2">
            {/* URL display */}
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <Link size={13} className="text-gray-400 shrink-0" />
              <span className="flex-1 text-xs font-mono text-gray-600 truncate">{shareUrl}</span>
              <CopyButton url={shareUrl!} />
            </div>
            {/* Revoke */}
            <div className="flex items-center justify-between min-h-[24px]">
              <span className="text-xs text-gray-400">
                Created {new Date(share.created_at).toLocaleDateString()} &nbsp;·&nbsp; Never expires
              </span>
              {confirmingRevoke ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-medium">Revoke this link?</span>
                  <button
                    onClick={handleRevokeCancel}
                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRevokeConfirm}
                    disabled={revoking}
                    className="flex items-center gap-1 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors rounded px-2 py-0.5"
                  >
                    <Trash2 size={11} />
                    {revoking ? 'Revoking…' : 'Yes, revoke'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleRevokeClick}
                  disabled={revoking}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={12} />
                  {revoking ? 'Revoking…' : 'Revoke'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">No link created yet</span>
            <button
              onClick={onCreate}
              disabled={creating}
              className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Link size={13} />
              {creating ? 'Creating…' : 'Create Link'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function ShareModal({ analysisId, onClose }: Props) {
  const [shares, setShares] = useState<AnalysisShare[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<'internal' | 'customer' | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const data = await getAnalysisShares(analysisId)
    setShares(data)
    setLoading(false)
  }, [analysisId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleCreate = async (type: 'internal' | 'customer') => {
    setCreating(type)
    setError(null)
    const share = await createAnalysisShare(analysisId, type)
    if (share) {
      setShares(prev => [...prev, share])
    } else {
      setError('Failed to create share link. Make sure the analysis_shares migration has been run in Supabase.')
    }
    setCreating(null)
  }

  const handleRevoke = async (token: string) => {
    setRevoking(token)
    const ok = await revokeAnalysisShare(token)
    if (ok) setShares(prev => prev.filter(s => s.token !== token))
    setRevoking(null)
  }

  const internalShare = shares.find(s => s.type === 'internal') ?? null
  const customerShare = shares.find(s => s.type === 'customer') ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-off-black">Share Analysis</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-brand-orange border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <ShareRow
                type="internal"
                share={internalShare}
                onCreate={() => handleCreate('internal')}
                onRevoke={handleRevoke}
                creating={creating === 'internal'}
                revoking={revoking !== null && internalShare?.token === revoking}
              />
              <ShareRow
                type="customer"
                share={customerShare}
                onCreate={() => handleCreate('customer')}
                onRevoke={handleRevoke}
                creating={creating === 'customer'}
                revoking={revoking !== null && customerShare?.token === revoking}
              />
              <p className="text-xs text-gray-400 text-center">
                Links do not expire and can only be revoked manually.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
