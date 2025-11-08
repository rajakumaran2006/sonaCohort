'use client'

import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import FacultySidebar from '@/components/layout/FacultySidebar'

interface FacultyProtectedRouteProps {
  children: React.ReactNode
}

export default function FacultyProtectedRoute({ children }: FacultyProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Use React Query to cache faculty verification
  const { data: department, isLoading: isVerifying, error } = useQuery({
    queryKey: ['faculty-verification', user?.email],
    queryFn: async () => {
      if (!user?.email) {
        throw new Error('No user email')
      }
      console.log('Verifying faculty access for:', user.email)
      return await FacultyService.verifyFacultyAccess(user.email)
    },
    enabled: !!user && !loading,
    staleTime: 15 * 60 * 1000, // Cache for 15 minutes
    retry: false,
  })

  // Handle redirects based on query state
  if (!loading && !isVerifying) {
    if (!user) {
      router.push('/login')
      return null
    }

    if (error || !department) {
      console.log('No faculty access found for user:', user.email)
      router.push('/login?error=faculty_access_denied')
      return null
    }
  }

  if (loading || isVerifying) {
    return (
      <div className="flex h-screen bg-gray-100">
        <FacultySidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
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
              <h1 className="text-xl font-semibold text-gray-800">Faculty Dashboard</h1>
              <div className="w-6"></div>
            </div>
          </header>

          {/* Main Content - Loading State */}
          <main className="flex-1 overflow-auto">
            <div className="h-full w-full flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Verifying faculty access...</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
