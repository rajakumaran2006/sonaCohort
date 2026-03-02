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

interface StudentProfile {
  id: string
  name: string
  email: string
  dept?: string
  year?: string
  section?: string
}

export default function StudentProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSidebarCollapsed] = useSidebarCollapsed()

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.email) return
      try {
        const supabase = createClient()
        const { data: student } = await supabase
          .from('peer_students')
          .select('*')
          .ilike('email', user.email)
          .single()
        setProfile(student as StudentProfile)
      } catch (error) {
        logger.error('Error fetching profile:', error)
      } finally {
        setLoading(false)
      }
    }
    if (!authLoading) fetchProfile()
  }, [user, authLoading])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA]">
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex items-center justify-center`}>
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#F8F9FA]">
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex items-center justify-center`}>
          <p className="text-gray-500">Profile not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
        <PageHeader
          title="PROFILE"
          tagline="Manage your personal information"
          onBack={() => router.back()}
          showRefresh={false}
        />

        <main className="flex-1 p-6 overflow-y-auto bg-gray-50/50">
          <div className="max-w-[1600px] mx-auto w-full">
            <ProfileHeader
              name={profile.name}
              email={profile.email}
              role="Student"
              department={profile.dept}
              year={profile.year}
              section={profile.section}
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
