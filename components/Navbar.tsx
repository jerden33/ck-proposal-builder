'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserProfile } from '@/lib/supabase/queries'
import type { UserProfile } from '@/lib/types'
import { BarChart2, LayoutDashboard, Settings, LogOut, Zap, Target } from 'lucide-react'

const NAV_LINKS = [
  { label: 'Analysis',  href: '/analysis',   icon: BarChart2 },
  { label: 'Dashboard', href: '/dashboard',   icon: LayoutDashboard },
  { label: 'Prospects', href: '/prospects',   icon: Target },
]

export function Navbar() {
  const router   = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    getUserProfile().then(setProfile)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (!profile) return (
    <nav className="bg-white border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          <div className="w-28 h-5 bg-zinc-100 rounded-md animate-pulse" />
          <div className="flex items-center gap-1">
            <div className="w-20 h-8 bg-zinc-100 rounded-lg animate-pulse" />
            <div className="w-14 h-8 bg-zinc-100 rounded-lg animate-pulse" />
            <div className="w-24 h-8 bg-zinc-100 rounded-lg animate-pulse" />
          </div>
          <div className="w-24 h-8 bg-zinc-100 rounded-lg animate-pulse" />
        </div>
      </div>
    </nav>
  )

  const roleLabel = profile.is_super_admin
    ? 'Super Administrator'
    : profile.is_admin
    ? 'Administrator'
    : 'User'

  return (
    <nav className="bg-white border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">

          {/* Brand */}
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 group"
          >
            <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center shrink-0">
              <Zap size={14} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-zinc-800 text-sm tracking-tight group-hover:text-zinc-900 transition-colors">
              Fleet Insights
            </span>
          </button>

          {/* Nav links */}
          <div className="flex items-center gap-0.5">
            {NAV_LINKS.map(({ label, href, icon: Icon }) => {
              const active = pathname?.startsWith(href)
              return (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${active
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
                    }`}
                >
                  <Icon size={14} strokeWidth={2} />
                  {label}
                </button>
              )
            })}

            {(profile.is_admin || profile.is_super_admin) && (
              <button
                onClick={() => router.push('/admin')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${pathname?.startsWith('/admin')
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
                  }`}
              >
                <Settings size={14} strokeWidth={2} />
                Admin
              </button>
            )}
          </div>

          {/* User */}
          <div className="flex items-center gap-2.5">
            <div className="text-right">
              <p className="text-sm font-medium text-zinc-700 leading-tight">
                {profile.full_name || profile.email}
              </p>
              <p className="text-xs text-zinc-400 leading-tight">{roleLabel}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              <LogOut size={15} strokeWidth={2} />
            </button>
          </div>

        </div>
      </div>
    </nav>
  )
}
