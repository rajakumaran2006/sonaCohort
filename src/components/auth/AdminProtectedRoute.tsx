'use client'

import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter } from 'next/navigation'
import { logger } from '@/lib/logger'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AdminService } from '@/lib/services/adminService'
import { MicrosoftGraphService } from '@/lib/auth/microsoftGraph'
import Sidebar from '@/components/layout/Sidebar'

interface AdminProtectedRouteProps {
  children: React.ReactNode
}

export default function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Use React Query to cache admin verification
  const { data: isAdmin, isLoading: isVerifying, error } = useQuery({
    queryKey: ['admin-verification', user?.email],
    queryFn: async () => {
      if (!user?.email) {
        throw new Error('No user email')
      }
      logger.info('AdminProtectedRoute: Verifying admin access for:', user.email)
      
      try {
        return await AdminService.isAdmin(user.email)
      } catch (error) {
        // Fallback to known admin emails
        const knownAdminEmails = [
          'rajakumaran.23ads@sonatech.ac.in',
          'admin@sonatech.ac.in',
        ]
        
        if (knownAdminEmails.includes(user.email.toLowerCase())) {
          logger.info('AdminProtectedRoute: Error occurred but user is in known admin list, allowing access')
          return true
        }
        throw error
      }
    },
    enabled: !!user && !loading,
    staleTime: 15 * 60 * 1000, // Cache for 15 minutes
    retry: false,
  })



  // Keep session alive for admins
  useEffect(() => {
    if (isAdmin) {
      // Check immediately
      const validateSession = async () => {
        try {
          const isValid = await MicrosoftGraphService.ensureSessionValid()
          if (isValid) {
            logger.info('AdminProtectedRoute: Session validated successfully')
          } else {
            logger.warn('AdminProtectedRoute: Session validation failed')
          }
        } catch (error) {
          logger.error('AdminProtectedRoute: Session validation error:', error)
        }
      }

      validateSession()

      // Check periodically (every 14 minutes - token usually expires in 1 hour, so this is safe)
      // Microsoft tokens often have short lifetimes (e.g. 1 hour), so refreshing before that is good.
      const intervalId = setInterval(() => {
        logger.info('AdminProtectedRoute: Running periodic session validation')
        validateSession()
      }, 14 * 60 * 1000)

      return () => clearInterval(intervalId)
    }
  }, [isAdmin])

  // Handle redirects based on query state
  if (!loading && !isVerifying) {
    if (!user) {
      router.push('/login')
      return null
    }

    if (error || !isAdmin) {
      logger.info('AdminProtectedRoute: No admin access found for user:', user.email)
      router.push('/login?error=admin_access_denied')
      return null
    }
  }

  if (loading || isVerifying) {
    logger.info('AdminProtectedRoute: Showing loading state', { loading, isVerifying })
    return (
      <div className="flex h-screen bg-gray-100">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
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
              <h1 className="text-xl font-semibold text-gray-800">Admin Dashboard</h1>
              <div className="w-6"></div>
            </div>
          </header>

          {/* Main Content - Loading State */}
          <main className="flex-1 overflow-auto">
            <div className="h-full w-full flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Verifying admin access...</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
