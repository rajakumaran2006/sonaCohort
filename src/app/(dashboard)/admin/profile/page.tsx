'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/AuthContext'
import { Loader2, School } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import PageHeader from '@/components/layout/PageHeader'
import ProfileHeader from '@/components/profile/ProfileHeader'
import ChangePassword from '@/components/profile/ChangePassword'
import { logger } from '@/lib/logger'
import { toast } from 'sonner'

interface AdminProfile {
  id: string
  name: string
  email: string
  role?: string
  college_name?: string
}

export default function AdminProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSidebarCollapsed] = useSidebarCollapsed()

  // College name state
  const [collegeName, setCollegeName] = useState('')
  const [savingCollege, setSavingCollege] = useState(false)

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.email) return
      try {
        const supabase = createClient()
        const { data: admin } = await supabase
          .from('superadmin')
          .select('*')
          .ilike('email', user.email)
          .single()
        setProfile(admin as AdminProfile)
        setCollegeName((admin as AdminProfile)?.college_name || '')
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

  const handleSaveCollegeName = async () => {
    if (!profile?.id) {
      toast.error('Profile not found')
      return
    }
    setSavingCollege(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('superadmin')
        .update({ college_name: collegeName.trim() || null })
        .eq('id', profile.id)

      if (error) {
        logger.error('Error saving college name:', error)
        toast.error('Failed to save college name')
      } else {
        toast.success('College name saved successfully!')
        setProfile(prev => prev ? { ...prev, college_name: collegeName.trim() } : prev)
      }
    } catch (err) {
      logger.error('Error in handleSaveCollegeName:', err)
      toast.error('Error saving college name')
    } finally {
      setSavingCollege(false)
    }
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

            {/* College Name Setting */}
            <div className="mt-6 bg-white rounded-[24px] p-6 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-gray-100 rounded-xl">
                  <School className="w-5 h-5 text-gray-700" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">College Name</h3>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    This name appears on all peer tutor, student and incharge profile badges and report headers.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    College / Institution Name
                  </label>
                  <input
                    type="text"
                    value={collegeName}
                    onChange={(e) => setCollegeName(e.target.value)}
                    placeholder="e.g. Sona College of Technology"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400 transition-all font-medium"
                  />
                </div>
                <button
                  onClick={handleSaveCollegeName}
                  disabled={savingCollege}
                  className="px-6 py-3 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {savingCollege ? 'Saving...' : 'Save'}
                </button>
              </div>

              {collegeName && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Preview:</div>
                  <div className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-bold">
                    {collegeName}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6">
              <ChangePassword />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
