'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { logger } from '@/lib/logger'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth/AuthContext'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import PeerSidebar from '@/components/layout/PeerSidebar'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'


interface PeerProtectedRouteProps {
  children: React.ReactNode
}


export default function PeerProtectedRoute({ children }: PeerProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isCollapsed] = useSidebarCollapsed()

  // Use React Query to cache peer tutor verification
  const { data: ispeertutors, isLoading: isVerifying, error } = useQuery({
    queryKey: ['peer-verification', user?.email],
    queryFn: async () => {
      if (!user?.email) {
        throw new Error('No user email')
      }
      logger.info('PeerProtectedRoute: Verifying peer tutor access for:', user.email)
      return await peertutorsAuthService.ispeertutors(user.email)
    },
    enabled: !!user && !loading,
    staleTime: 15 * 60 * 1000, // Cache for 15 minutes
    retry: false,
  })

  // Handle redirects based on query state
  useEffect(() => {
    if (!loading && !isVerifying) {
      if (!user) {
        router.push(`/login?redirectTo=${encodeURIComponent(pathname)}`)
      } else if (error || !ispeertutors) {
        router.push(`/login?error=peer_access_denied&redirectTo=${encodeURIComponent(pathname)}`)
      }
    }
  }, [loading, isVerifying, user, error, ispeertutors, router, pathname])

  if (!loading && !isVerifying) {
    if (!user || error || !ispeertutors) {
      return null
    }
  }

  if (loading || isVerifying) {
    logger.info('PeerProtectedRoute: Showing loading state', { loading, isVerifying })
    return (
      <div className="min-h-screen bg-gray-50">
        <PeerSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
        <div className={`transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'} flex-1 flex flex-col overflow-hidden min-h-screen`}>
          {/* Top Navigation Bar */}
          <header className="bg-white shadow-sm z-10 lg:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="w-6"></div>
            </div>
          </header>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
