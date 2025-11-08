'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import { PeerTutorService } from '@/lib/services/peerTutorService'
import { StudentService } from '@/lib/services/studentService'
import { Card, CardHeader, CardTitle, CardContent, StatCard, LoadingSpinner } from '@/components/ui'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Building2, Users, GraduationCap } from 'lucide-react'

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
  const queryClient = useQueryClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Use custom hook for sidebar collapsed state (reads from localStorage synchronously)
  const [isSidebarCollapsed] = useSidebarCollapsed()

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

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      // Invalidate all queries to force refetch
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['faculty-department', user?.email] }),
        queryClient.invalidateQueries({ queryKey: ['peer-tutor-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['all-students'] }),
      ])
      setLastRefresh(new Date())
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
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
        <PageHeader
          title="FACULTY DASHBOARD"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className={`max-w-full mx-auto py-6 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
            {loading && (
              <div className="flex items-center justify-center py-4 mb-4">
                <LoadingSpinner size="sm" className="mr-2" />
                <span className="text-sm text-gray-600">Loading dashboard...</span>
              </div>
            )}
            {!loading && (
          <>
            {/* Department Info */}
            <Card className="mb-4">
              <CardContent>
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                      <Building2 className="h-8 w-8 text-blue-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg leading-6 font-semibold text-gray-900">
                      DEPARTMENT ASSIGNMENT
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                      {department?.name || 'No department assigned'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Peer Tutor Statistics Cards */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-6">
              <StatCard
                title="Total Peer Tutors"
                value={peerTutorStats?.total || 0}
                description="Across all departments and years"
                icon={
                  <Users className="h-7 w-7 text-blue-600" />
                }
              />

              <StatCard 
                title="Total Students"
                value={totalStudents}
                description="Across all departments and years"
                icon={
                  <GraduationCap className="h-7 w-7 text-green-600" />
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
          </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
