'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import { PeerTutorService } from '@/lib/services/peerTutorService'
import { StudentService } from '@/lib/services/studentService'
import { Card, CardHeader, CardTitle, CardContent, StatCard, LoadingOverlay } from '@/components/ui'

export default function FacultyDashboardPage() {
  return (
    <FacultyProtectedRoute>
      <FacultyDashboardContent />
    </FacultyProtectedRoute>
  )
}

function FacultyDashboardContent() {
  const { user } = useAuth()
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Check if sidebar is collapsed
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const sidebar = document.querySelector('[data-sidebar-collapsed]')
      return sidebar?.getAttribute('data-sidebar-collapsed') === 'true'
    }
    return false
  })

  // Listen for sidebar collapse state changes
  useEffect(() => {
    const checkSidebarState = () => {
      if (typeof window !== 'undefined') {
        const sidebar = document.querySelector('[data-sidebar-collapsed]')
        const collapsed = sidebar?.getAttribute('data-sidebar-collapsed') === 'true'
        setIsSidebarCollapsed(collapsed)
      }
    }

    // Check initially
    checkSidebarState()

    // Listen for custom events
    const handleSidebarToggle = () => checkSidebarState()
    window.addEventListener('sidebar-toggle', handleSidebarToggle)

    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle)
    }
  }, [])

  // Fetch department data with caching
  const { data: department, isLoading: isDepartmentLoading } = useQuery({
    queryKey: ['faculty-department', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await FacultyService.verifyFacultyAccess(user.email)
    },
    enabled: !!user?.email,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })

  // Fetch peer tutor stats with caching
  const { data: peerTutorStats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['peer-tutor-stats'],
    queryFn: async () => await PeerTutorService.getPeerTutorStats(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch total students with caching
  const { data: students, isLoading: isStudentsLoading } = useQuery({
    queryKey: ['all-students'],
    queryFn: async () => await StudentService.getAllStudents(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const totalStudents = students?.length || 0
  const loading = isDepartmentLoading || isStatsLoading || isStudentsLoading

  const years = [
    { id: '2', name: '2nd Year' },
    { id: '3', name: '3rd Year' },
    { id: '4', name: '4th Year' }
  ]

  const handleYearClick = (yearId: string) => {
    router.push(`/faculty/department/${department?.id}/year/${yearId}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
          <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div className="ml-2 lg:ml-0">
                  <h1 className="text-2xl roboto-condensed-title text-gray-900">Faculty Dashboard</h1>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {loading ? (
            <LoadingOverlay className="h-96" size="xl">
              Loading dashboard...
            </LoadingOverlay>
          ) : (
          <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            {/* Department Info */}
            <Card className="mb-6">
              <CardContent>
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                      <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg leading-6 font-semibold text-gray-900">
                      Current Department Assignment
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                      {department?.name || 'No department assigned'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Peer Tutor Statistics Cards */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-8">
              <StatCard
                title="Total Peer Tutors"
                value={peerTutorStats?.total || 0}
                description="Across all departments and years"
                icon={
                  <svg className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                }
              />

              <StatCard
                title="Total Students"
                value={totalStudents}
                description="Across all departments and years"
                icon={
                  <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                }
              />
            </div>

            {/* Years Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Academic Years</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Click on a year to view sections and manage students/peer tutors
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {years.map((year) => (
                    <button
                      key={year.id}
                      onClick={() => handleYearClick(year.id)}
                      disabled={!department?.id}
                      className="relative group bg-white p-10 border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="text-center">
                        <div className="mb-3">
                          <span className="text-7xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors duration-200">
                            {year.id}
                          </span>
                        </div>
                        <div className="text-base font-medium text-gray-600 group-hover:text-gray-900 transition-colors duration-200">
                          Year
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          Click to view sections
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          )}
        </main>
      </div>
    </div>
  )
}
