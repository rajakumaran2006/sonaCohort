'use client'

import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import { logger } from '@/lib/logger'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface SuperadminProtectedRouteProps {
  children: React.ReactNode
}

export default function SuperadminProtectedRoute({ children }: SuperadminProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [, setSidebarOpen] = useState(false)

  // Use React Query to cache superadmin verification
  const { data: isSuperadmin, isLoading: isVerifying, error } = useQuery({
    queryKey: ['superadmin-verification', user?.email],
    queryFn: async () => {
      if (!user?.email) {
        throw new Error('No user email')
      }
      logger.info('SuperadminProtectedRoute: Verifying superadmin access for:', user.email)
      
      const supabase = createClient()
      const { data, error } = await supabase
        .from('superadmin')
        .select('*')
        .eq('email', user.email.toLowerCase())
        .single()

      if (error || !data) {
        logger.info('SuperadminProtectedRoute: No superadmin access found for:', user.email)
        return false
      }

      logger.info('SuperadminProtectedRoute: Superadmin access verified for:', user.email)
      return true
    },
    enabled: !!user && !loading,
    staleTime: 15 * 60 * 1000, // Cache for 15 minutes
    retry: false,
  })

  // Handle redirects based on query state
  if (!loading && !isVerifying) {
    if (!user) {
      router.push(`/login?redirectTo=${encodeURIComponent(pathname)}`)
      return null
    }

    if (error || !isSuperadmin) {
      logger.info('SuperadminProtectedRoute: No superadmin access found for user:', user.email)
      router.push(`/login?error=superadmin_access_denied&redirectTo=${encodeURIComponent(pathname)}`)
      return null
    }
  }

  if (loading || isVerifying) {
    logger.info('SuperadminProtectedRoute: Showing loading state', { loading, isVerifying })
    return (
      <div className="flex h-screen bg-gray-100">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Navigation Bar */}
          <header className="bg-white shadow-sm z-10">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden text-gray-500 hover:text-gray-700"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-gray-800">Superadmin Dashboard</h1>
              <div className="w-6"></div>
            </div>
          </header>

          {/* Main Content - Loading State */}
          <main className="flex-1 overflow-auto">
            <div className="h-full w-full flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Verifying superadmin access...</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
