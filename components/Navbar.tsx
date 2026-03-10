'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserProfile } from '@/lib/supabase/queries'
import type { UserProfile } from '@/lib/types'
import { BarChart2, Truck, LayoutDashboard, Settings, LogOut, Zap } from 'lucide-react'

const NAV_LINKS = [
  { label: 'Analysis',  href: '/analysis',   icon: BarChart2 },
  { label: 'OTR',       href: '/otr',         icon: Truck },
  { label: 'Dashboard', href: '/dashboard',   icon: LayoutDashboard },
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

  if (!profile) return null

  return (
    <nav className="bg-zinc-900 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">

          {/* Brand */}
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center shrink-0">
              <Zap size={14} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-white font-bold text-base tracking-tight">Fleet Insights</span>
          </button>

          {/* Nav links */}
          <div className="flex items-center gap-0.5">
            {NAV_LINKS.map(({ label, href, icon: Icon }) => {
              const active = pathname?.startsWith(href)
              return (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                    ${active
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                    }`}
                >
                  <Icon size={14} strokeWidth={2} />
                  {label}
                </button>
              )
            })}

            {profile.is_admin && (
              <button
                onClick={() => router.push('/admin')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${pathname?.startsWith('/admin')
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                  }`}
              >
                <Settings size={14} strokeWidth={2} />
                Admin
              </button>
            )}
          </div>

          {/* User */}
          <div className="flex items-center gap-3 pl-4 border-l border-zinc-700/60">
            <div className="text-right">
              <p className="text-sm font-medium text-zinc-100 leading-tight">
                {profile.full_name || profile.email}
              </p>
              <p className="text-xs text-zinc-500 leading-tight">
                {profile.is_admin ? 'Administrator' : 'User'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <LogOut size={15} strokeWidth={2} />
            </button>
          </div>

        </div>
      </div>
    </nav>
  )
}
