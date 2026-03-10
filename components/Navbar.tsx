'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserProfile } from '@/lib/supabase/queries'
import type { UserProfile } from '@/lib/types'
import { BarChart2, Truck, LayoutDashboard, Settings, LogOut } from 'lucide-react'
import Image from 'next/image'

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

  const roleLabel = profile.is_super_admin
    ? 'Super Administrator'
    : profile.is_admin
    ? 'Administrator'
    : 'User'

  return (
    <nav className="bg-white border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-[60px]">

          {/* Brand */}
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-3 group"
          >
            <Image
              src="/circle-k-pro-logo.png"
              alt="Circle K Pro"
              width={120}
              height={36}
              className="h-8 w-auto"
            />
            <div className="h-5 w-px bg-zinc-200" />
            <span className="text-sm font-semibold text-zinc-600 group-hover:text-zinc-900 transition-colors">
              Proposal Builder
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
                      ? 'bg-accent/10 text-accent'
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
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
                    ? 'bg-accent/10 text-accent'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                  }`}
              >
                <Settings size={14} strokeWidth={2} />
                Admin
              </button>
            )}
          </div>

          {/* User */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-zinc-800 leading-tight">
                {profile.full_name || profile.email}
              </p>
              <p className="text-xs text-zinc-400 leading-tight">{roleLabel}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              <LogOut size={15} strokeWidth={2} />
            </button>
          </div>

        </div>
      </div>
    </nav>
  )
}
