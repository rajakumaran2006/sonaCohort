'use client'

import { useState, useEffect, useMemo } from 'react'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { useCachedData } from '@/lib/hooks/useCachedData'
import { AttendanceService } from '@/lib/services/attendanceService'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
import { useRouter } from 'next/navigation'

export default function PeerAttendancePage() {
  return (
    <PeerProtectedRoute>
      <PeerAttendanceContent />
    </PeerProtectedRoute>
  )
}

interface AttendanceHistoryRecord {
  id: string
  class_id: string
  scheduled_class_id?: string
  student_id: string
  status: 'present' | 'absent'
  created_at: string
  updated_at: string
  classes: {
    id: string
    subject_name: string
    created_at: string
    dept: string
    year: string
    section: string
  }
  scheduled_classes?: {
    id: string
    scheduled_date: string
    class_id: string
  }
  peer_students: {
    id: string
    name: string
    email: string
  }
}

function PeerAttendanceContent() {
  const { user } = useAuth()
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Use custom hook for sidebar collapsed state
  const [isSidebarCollapsed] = useSidebarCollapsed()

  // Filters
  const [selectedScheduledClass, setSelectedScheduledClass] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState<string>('')

  // Fetch peer tutor info with caching
  const { data: tutorInfoData, isLoading: tutorLoading, refresh: refreshTutor } = useCachedData({
    queryKey: ['peer-tutor-info', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await PeerTutorAuthService.getPeerTutorByEmail(user.email)
    },
    enabled: !!user?.email,
    initialData: null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch scheduled classes with caching
  const { data: scheduledClassesData, isLoading: scheduledLoading, refresh: refreshScheduled, isRefreshing: isScheduledRefreshing } = useCachedData({
    queryKey: ['scheduled-classes-by-peer', tutorInfoData?.dept, tutorInfoData?.year, tutorInfoData?.section],
    queryFn: async () => {
      if (!tutorInfoData?.dept || !tutorInfoData?.year || !tutorInfoData?.section) return []
      return await ScheduledClassService.getScheduledClassesByDate(
        tutorInfoData.dept,
        tutorInfoData.year,
        tutorInfoData.section
      )
    },
    enabled: !!tutorInfoData?.dept && !!tutorInfoData?.year && !!tutorInfoData?.section,
    initialData: [],
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch attendance summary with caching
  const { data: summaryData, isLoading: summaryLoading, refresh: refreshSummary } = useCachedData({
    queryKey: ['attendance-summary', tutorInfoData?.id],
    queryFn: async () => {
      if (!tutorInfoData?.id) return {
        totalClasses: 0,
        totalStudents: 0,
        presentCount: 0,
        absentCount: 0,
        attendanceRate: 0
      }
      return await AttendanceService.getAttendanceSummary(tutorInfoData.id)
    },
    enabled: !!tutorInfoData?.id,
    initialData: {
      totalClasses: 0,
      totalStudents: 0,
      presentCount: 0,
      absentCount: 0,
      attendanceRate: 0
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch attendance history with caching
  const { data: attendanceHistoryData, isLoading: historyLoading, refresh: refreshHistory } = useCachedData({
    queryKey: ['attendance-history', tutorInfoData?.id, startDate, endDate, selectedScheduledClass],
    queryFn: async () => {
      if (!tutorInfoData?.id) return []
      return await AttendanceService.getAttendanceHistory(
        tutorInfoData.id,
        startDate || undefined,
        endDate || undefined,
        selectedScheduledClass || undefined
      )
    },
    enabled: !!tutorInfoData?.id,
    initialData: [],
    staleTime: 2 * 60 * 1000, // 2 minutes (more frequent updates for history)
  })

  const loading = tutorLoading || scheduledLoading || summaryLoading || historyLoading
  const summary = summaryData || {
    totalClasses: 0,
    totalStudents: 0,
    presentCount: 0,
    absentCount: 0,
    attendanceRate: 0
  }
  const attendanceHistory = attendanceHistoryData || []
  const scheduledClasses = scheduledClassesData || []

  // Filter attendance history based on status and search
  const filteredHistory = useMemo(() => {
    let filtered = attendanceHistory

    // Apply status filter
    if (statusFilter) {
      filtered = filtered.filter(record => record.status === statusFilter)
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(record =>
        record.peer_students.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.peer_students.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.classes?.subject_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.classes?.dept.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.classes?.year.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.classes?.section.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    return filtered
  }, [attendanceHistory, statusFilter, searchTerm])

  const clearFilters = () => {
    setSelectedScheduledClass('')
    setStartDate('')
    setEndDate('')
    setStatusFilter('')
    setSearchTerm('')
  }

  const handleRefresh = async () => {
    await Promise.all([refreshTutor(), refreshScheduled(), refreshSummary(), refreshHistory()])
    setLastRefresh(new Date())
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="transition-all duration-300 lg:ml-64 min-h-screen flex flex-col overflow-hidden">
        {/* Top Header */}
        <PageHeader
          title="ATTENDANCE MANAGEMENT"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isScheduledRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading attendance data...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Total Classes</p>
                      <p className="text-2xl font-semibold text-gray-900">{summary.totalClasses}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Present</p>
                      <p className="text-2xl font-semibold text-gray-900">{summary.presentCount}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Attendance Rate</p>
                      <p className="text-2xl font-semibold text-gray-900">{summary.attendanceRate}%</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attendance History Table */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Attendance History</h3>
                    <p className="text-sm text-gray-500">
                      {loading ? 'Loading...' : `Showing ${filteredHistory.length} of ${attendanceHistory.length} records`}
                    </p>
                  </div>
                  
                  {/* Filter Controls */}
                  <div className="flex items-center gap-4">
                    {/* Search Bar */}
                    <div className="flex-1 max-w-xl">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Search by student name, email, subject..."
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Scheduled Class Filter */}
                    <div className="w-48">
                      <select
                        value={selectedScheduledClass}
                        onChange={(e) => setSelectedScheduledClass(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">All Classes</option>
                        {scheduledClasses.map((scheduledClass) => (
                          <option key={scheduledClass.id} value={scheduledClass.id}>
                            {scheduledClass.class.subject_name} - {new Date(scheduledClass.scheduled_date).toLocaleDateString('en-GB')}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Start Date Filter */}
                    <div className="w-40">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* End Date Filter */}
                    <div className="w-40">
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Status Filter */}
                    <div className="w-32">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">All Status</option>
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                      </select>
                    </div>

                    {/* Spacer to push buttons to the right */}
                    <div className="flex-1"></div>

                    {/* Clear Filters Button */}
                    <button
                      onClick={clearFilters}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                    >
                      Clear Filters
                    </button>
                  </div>
                </div>
                
                <div className="p-6">
                  {filteredHistory.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Student
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Class
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredHistory.map((record) => (
                            <tr key={record.id} className="hover:bg-blue-50 transition-colors duration-200">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <button
                                  onClick={() => {
                                    router.push(`/peer/attendance/${record.peer_students.id}`)
                                  }}
                                  className="flex items-center text-left hover:text-blue-600 transition-colors"
                                >
                                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                                    <span className="text-sm font-medium text-blue-600">
                                      {record.peer_students.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {record.peer_students.name}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {record.peer_students.email}
                                    </div>
                                  </div>
                                </button>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {record.classes ? (
                                  <>
                                    <div className="text-sm font-medium text-gray-900">
                                      {record.classes.subject_name}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {record.classes.dept} - {record.classes.year} - {record.classes.section}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-sm text-gray-500">Class details not available</div>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">
                                  {record.scheduled_classes?.scheduled_date
                                    ? new Date(record.scheduled_classes.scheduled_date).toLocaleDateString('en-GB', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric'
                                      })
                                    : record.classes?.created_at
                                      ? new Date(record.classes.created_at).toLocaleDateString('en-GB', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          year: 'numeric'
                                        })
                                      : 'Date not available'
                                  }
                                </div>
                                {record.scheduled_classes?.scheduled_date && (
                                  <div className="text-xs text-gray-500">
                                    {new Date(record.scheduled_classes.scheduled_date).toLocaleDateString('en-US', {
                                      weekday: 'short'
                                    })}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    record.status === 'present'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}>
                                  {record.status === 'present' ? (
                                    <>
                                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                      Present
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                      </svg>
                                      Absent
                                    </>
                                  )}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        {attendanceHistory.length === 0 ? 'No attendance records found' : 'No records match your filters'}
                      </h3>
                      <p className="text-gray-500 mb-6">
                        {attendanceHistory.length === 0 
                          ? "You haven't recorded any attendance yet. Start by managing classes in the Classes tab."
                          : "Try adjusting your search criteria or filters to see more results."
                        }
                      </p>
                      {attendanceHistory.length > 0 && (
                        <button
                          onClick={clearFilters}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>
        </main>
      </div>
    </div>
  )
}
