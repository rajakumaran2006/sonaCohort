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
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import FilterDropdown from '@/components/ui/FilterDropdown'

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
          title="ATTENDANCE STATUS"
          tagline="Class Completion & Peer Tutor Tracking"
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
                {/* Total Classes Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Total Classes</p>
                      <p className="text-3xl font-bold text-gray-900 tracking-tight">{summary.totalClasses}</p>
                    </div>
                    <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                     <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                     <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Scheduled Sessions</span>
                  </div>
                </div>

                {/* Present Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Present</p>
                      <p className="text-3xl font-bold text-gray-900 tracking-tight">{summary.presentCount}</p>
                    </div>
                    <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                     <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                     <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Confirmed Attendance</span>
                  </div>
                </div>

                {/* Attendance Rate Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Attendance Rate</p>
                      <p className="text-3xl font-bold text-gray-900 tracking-tight">{summary.attendanceRate}%</p>
                    </div>
                    <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                     <div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div>
                     <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest">Overall Performance</span>
                  </div>
                </div>
              </div>

              {/* Attendance History Table */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-700 uppercase tracking-wider">Attendance History</h3>
                    <p className="text-sm text-gray-500">
                      {loading ? 'Loading...' : `Showing ${filteredHistory.length} of ${attendanceHistory.length} records`}
                    </p>
                  </div>
                  
                  {/* Filter Controls */}
                  <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center p-5 border-b border-gray-100 bg-gray-50/30">
                    {/* Search Bar */}
                    <div className="relative w-full xl:max-w-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search student, subject..."
                        className="block w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 shadow-sm transition-all duration-200"
                      />
                    </div>

                    <div className="flex flex-wrap xl:flex-nowrap gap-3 w-full xl:w-auto items-center">
                      {/* Scheduled Class Filter */}
                      <div className="w-full sm:w-[240px] xl:w-64">
                        <FilterDropdown
                          value={selectedScheduledClass}
                          onChange={(value) => setSelectedScheduledClass(value)}
                          options={scheduledClasses.map(sc => ({
                            label: `${sc.class.subject_name} (${new Date(sc.scheduled_date).toLocaleDateString('en-GB')})`,
                            value: sc.id
                          }))}
                          placeholder="All Classes"
                        />
                      </div>

                      <div className="flex gap-3 w-full sm:w-auto flex-1 sm:flex-none">
                        {/* Start Date Filter */}
                        <div className="relative min-w-[130px] flex-1 sm:flex-none">
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="block w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 shadow-sm transition-all duration-200"
                          />
                        </div>

                        {/* End Date Filter */}
                        <div className="relative min-w-[130px] flex-1 sm:flex-none">
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="block w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 shadow-sm transition-all duration-200"
                          />
                        </div>
                      </div>

                      {/* Status Filter */}
                      <div className="w-full sm:w-40">
                        <FilterDropdown
                          value={statusFilter}
                          onChange={(value) => setStatusFilter(value)}
                          options={[
                            { label: 'Present', value: 'present' },
                            { label: 'Absent', value: 'absent' }
                          ]}
                          placeholder="Status"
                        />
                      </div>

                      {/* Clear Filters Button */}
                      {(selectedScheduledClass || startDate || endDate || statusFilter || searchTerm) && (
                        <button
                          onClick={clearFilters}
                          className="px-4 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-xl transition-colors uppercase tracking-wider w-full sm:w-auto"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="p-6">
                  {filteredHistory.length > 0 ? (

                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                            <TableHead className="py-4 pl-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                              Student
                            </TableHead>
                            <TableHead className="py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                              Class
                            </TableHead>
                            <TableHead className="py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                              Date
                            </TableHead>
                            <TableHead className="py-4 pr-6 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                              Status
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredHistory.map((record) => (
                            <TableRow key={record.id} className="group hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0">
                              <TableCell className="py-4 pl-6">
                                <button
                                  onClick={() => {
                                    router.push(`/peer/attendance/${record.peer_students.id}`)
                                  }}
                                  className="flex items-center text-left group/btn"
                                >
                                  <div className="mr-3 transition-transform group-hover/btn:scale-105">
                                    <img 
                                      src="/icons/student.png" 
                                      alt="Student" 
                                      className="w-8 h-8 rounded-lg object-cover shadow-sm"
                                    />
                                  </div>
                                  <div>
                                    <div className="text-xs font-bold text-gray-900 group-hover/btn:text-blue-600 transition-colors">
                                      {record.peer_students.name}
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-medium">
                                      {record.peer_students.email}
                                    </div>
                                  </div>
                                </button>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                {record.classes ? (
                                  <>
                                    <div className="text-xs font-bold text-gray-900">
                                      {record.classes.subject_name}
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-medium mt-0.5">
                                      {record.classes.dept} - {record.classes.year} - {record.classes.section}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-[10px] text-gray-400 italic">No Details</div>
                                )}
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <div className="text-xs font-bold text-gray-900">
                                  {record.scheduled_classes?.scheduled_date
                                    ? new Date(record.scheduled_classes.scheduled_date).toLocaleDateString('en-GB', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric'
                                      })
                                    : record.classes?.created_at
                                      ? new Date(record.classes.created_at).toLocaleDateString('en-GB', {
                                          day: '2-digit',
                                          month: 'short',
                                          year: 'numeric'
                                        })
                                      : 'N/A'
                                  }
                                </div>
                                {record.scheduled_classes?.scheduled_date && (
                                  <div className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">
                                    {new Date(record.scheduled_classes.scheduled_date).toLocaleDateString('en-US', {
                                      weekday: 'short'
                                    })}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="py-4 pr-6 text-right">
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                    record.status === 'present'
                                      ? 'bg-green-50 text-green-600 border-green-100'
                                      : 'bg-red-50 text-red-600 border-red-100'
                                  }`}>
                                  {record.status === 'present' ? (
                                    <>
                                      <svg className="w-3 h-3 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Present
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-3 h-3 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                      Absent
                                    </>
                                  )}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
             <div className="w-16 h-16  rounded-full flex items-center justify-center mb-4">
                  <img src="/icons/search.png" alt="search" />
               </div>
                      <h3 className="text-lg font-black text-gray-900 uppercase tracking-widest mb-2">
                        {attendanceHistory.length === 0 ? 'No records found' : 'No records match your filters'}
                      </h3>
                      <p className="text-sm text-gray-500 max-w-md font-medium mb-6">
                        {attendanceHistory.length === 0 
                          ? "No attendance records found."
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
