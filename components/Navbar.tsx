'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getUserProfile } from '@/lib/supabase/queries'
import type { UserProfile } from '@/lib/types'
import { Settings, LogOut, LayoutDashboard } from 'lucide-react'

export function Navbar() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    const userProfile = await getUserProfile()
    setProfile(userProfile)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (!profile) return null

  return (
    <nav className="bg-white border-b border-gray-200">
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
              <p className="text-sm font-semibold text-off-black">{profile.full_name || profile.email}</p>
              <p className="text-xs text-gray-500">{profile.is_admin ? 'Administrator' : 'User'}</p>
            </div>

            <button
              onClick={() => router.push('/dashboard')}
              className="btn-secondary flex items-center gap-2"
            >
              <LayoutDashboard size={18} />
              Dashboard
            </button>

            {profile.is_admin && (
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
    </nav>
  )
}
