'use client'

import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import { logger } from '@/lib/logger'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { StudentService } from '@/lib/services/studentService'
import StudentSidebar from '@/components/layout/StudentSidebar'


interface StudentProtectedRouteProps {
  children: React.ReactNode
}

export default function StudentProtectedRoute({ children }: StudentProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Use React Query to cache student verification
  const { data: isStudent, isLoading: isVerifying, error } = useQuery({
    queryKey: ['student-verification', user?.email],
    queryFn: async () => {
      if (!user?.email) {
        throw new Error('No user email')
      }
      logger.info('StudentProtectedRoute: Verifying student access for:', user.email)
      return await StudentService.isStudent(user.email)
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

    if (error || !isStudent) {
      logger.info('StudentProtectedRoute: No student access found for user:', user.email)
      router.push(`/login?error=student_access_denied&redirectTo=${encodeURIComponent(pathname)}`)
      return null
    }
  }

  if (loading || isVerifying) {
    logger.info('StudentProtectedRoute: Showing loading state', { loading, isVerifying })
    return (
      <div className="flex h-screen bg-gray-100">
        <StudentSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
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
              <h1 className="text-xl font-semibold text-gray-800">Student Dashboard</h1>
              <div className="w-6"></div>
          </div>
        </header>
      </div>
    </div>
  )
}

  return <>{children}</>
}
