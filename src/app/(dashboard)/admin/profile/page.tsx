'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/AuthContext'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import PageHeader from '@/components/layout/PageHeader'
import ProfileHeader from '@/components/profile/ProfileHeader'
import ChangePassword from '@/components/profile/ChangePassword'
import { logger } from '@/lib/logger'

interface AdminProfile {
  id: string
  name: string
  email: string
  role?: string
}

export default function AdminProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSidebarCollapsed] = useSidebarCollapsed()

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.email) return
      try {
        const supabase = createClient()
        const { data: admin } = await supabase
          .from('admin_users')
          .select('*')
          .ilike('email', user.email)
          .single()
        setProfile(admin as AdminProfile)
      } catch (error) {
        logger.error('Error fetching profile:', error)
      } finally {
        setLoading(false)
      }
    }
    if (!authLoading) fetchProfile()
  }, [user, authLoading])

  const displayProfile = profile || {
    name: user?.user_metadata?.name || user?.email?.split('@')[0] || 'Admin User',
    email: user?.email,
    role: 'Super Admin'
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA]">
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex items-center justify-center`}>
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
        <PageHeader
          title="PROFILE"
          tagline="Admin Account Information"
          onBack={() => router.back()}
          showRefresh={false}
        />

        <main className="flex-1 p-6 overflow-y-auto bg-gray-50/50">
          <div className="max-w-[1600px] mx-auto w-full">
            <ProfileHeader
              name={displayProfile.name || 'Admin'}
              email={displayProfile.email || ''}
              role={displayProfile.role || 'Super Admin'}
            />

            <div className="mt-6">
              <ChangePassword />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
