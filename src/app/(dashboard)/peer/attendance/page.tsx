'use client'

import { useState, useMemo, ReactNode } from 'react'
import Image from 'next/image'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { useCachedData } from '@/lib/hooks/useCachedData'
import { AttendanceService } from '@/lib/services/attendanceService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { useRouter } from 'next/navigation'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import FilterDropdown from '@/components/ui/FilterDropdown'

import ExportButton from '@/components/ui/ExportButton'

export default function PeerAttendancePage() {
  return (
    <PeerProtectedRoute>
      <PeerAttendanceContent />
    </PeerProtectedRoute>
  )
}

function PeerAttendanceContent(): ReactNode {
  const { user } = useAuth()
  const router = useRouter()
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
      return await peertutorsAuthService.getpeertutorsByEmail(user.email)
    },
    enabled: !!user?.email,
    initialData: null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch scheduled classes with caching
  const { data: scheduledClassesData, isLoading: scheduledLoading, refresh: refreshScheduled, isRefreshing: isScheduledRefreshing } = useCachedData({
    queryKey: ['scheduled-classes-by-peer', tutorInfoData?.id, tutorInfoData?.dept, tutorInfoData?.year, tutorInfoData?.section],
    queryFn: async () => {
      if (!tutorInfoData?.dept || !tutorInfoData?.year || !tutorInfoData?.section) return []
      return await ScheduledClassService.getScheduledClassesByDate(
        tutorInfoData.dept,
        tutorInfoData.year,
        tutorInfoData.section,
        tutorInfoData.id
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
        additionalClasses: 0,
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
      additionalClasses: 0,
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
    additionalClasses: 0,
    totalStudents: 0,
    presentCount: 0,
    absentCount: 0,
    attendanceRate: 0
  }
  const attendanceHistory = useMemo(() => attendanceHistoryData || [], [attendanceHistoryData])
  const scheduledClasses = useMemo(() => scheduledClassesData || [], [scheduledClassesData])

  const completedClassesCount = useMemo(() => 
    scheduledClasses.filter(c => c.completion_status === 'completed').length,
    [scheduledClasses]
  )


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
        (record.peer_students?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (record.peer_students?.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (record.classes?.subject_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (record.classes?.dept || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (record.classes?.year || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (record.classes?.section || '').toLowerCase().includes(searchTerm.toLowerCase())
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

  const handleExport = () => {
    const headers = ['Student Name', 'Email', 'Class', 'Date', 'Status']
    const csvContent = [
        headers.join(','),
        ...filteredHistory.map(record => {
            const dateValue = record.scheduled_classes?.scheduled_date || record.classes?.created_at;
            const dateStr = dateValue ? new Date(dateValue).toLocaleDateString() : 'N/A';
            return [
                `"${record.peer_students?.name || 'N/A'}"`,
                `"${record.peer_students?.email || 'N/A'}"`,
                `"${record.classes?.subject_name || 'N/A'}"`,
                `"${dateStr}"`,
                `"${record.status}"`
            ].join(',');
        })
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', 'attendance_history.csv')
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading</span>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8">


          {/* Total Students Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2">Total Students</p>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">{summary.totalStudents}</p>
              </div>
              <div className="p-2 border border-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 24 24" fill="currentColor">
                   <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">ASSIGNED</span>
            </div>
          </div>

          {/* Completed Classes (Fixed Calculation) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2">Completed Classes</p>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">{completedClassesCount}</p>
              </div>
              <div className="p-2 border border-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19,3h-4.184C14.403,1.837,13.304,1,12,1S9.597,1.837,9.184,3H5C3.895,3,3,3.895,3,5v14c0,1.105,0.895,2,2,2h14 c1.105,0,2-0.895,2-2V5C21,3.895,20.105,3,19,3z M8.707,11.293L11,13.586l4.293-4.293c0.39-0.39,1.024-0.39,1.414,0l0,0 c0.39,0.39,0.39,1.024,0,1.414l-5,5c-0.39,0.39-1.024,0.39-1.414,0l-3-3c-0.39-0.39-0.39-1.024,0-1.414l0,0 C7.683,10.902,8.316,10.902,8.707,11.293z M12,3c0.552,0,1,0.448,1,1c0,0.552-0.448,1-1,1s-1-0.448-1-1C11,3.448,11.448,3,12,3z"></path>
              </svg>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">FINISHED</span>
            </div>
          </div>
                    {/* Additional Classes Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2">Additional Classes</p>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">{summary.additionalClasses}</p>
              </div>
              <div className="p-2 border border-gray-100 rounded-lg">
                          <svg className="w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 30 30" fill="currentColor">
                            <path d="M 5 4 C 3.895 4 3 4.895 3 6 L 3 9 L 3 25 A 1.0001 1.0001 0 0 0 4 26 L 26 26 A 1.0001 1.0001 0 0 0 27 25 L 27 8 L 27 6 C 27 4.895 26.105 4 25 4 L 5 4 z M 5 9 L 25 9 L 25 24 L 5 24 L 5 9 z M 9 11 A 1.0001 1.0001 0 1 0 9 13 L 9 15 A 1.0001 1.0001 0 1 0 11 15 L 11 12 A 1.0001 1.0001 0 0 0 10 11 L 9 11 z M 15 11 C 13.895 11 13 11.895 13 13 L 13 14 C 13 15.105 13.895 16 15 16 C 16.105 16 17 15.105 17 14 L 17 13 C 17 11.895 16.105 11 15 11 z M 20 11 A 1.0001 1.0001 0 1 0 20 13 L 20 15 A 1.0001 1.0001 0 1 0 22 15 L 22 12 A 1.0001 1.0001 0 0 0 21 11 L 20 11 z M 10 17 C 8.895 17 8 17.895 8 19 L 8 20 C 8 21.105 8.895 22 10 22 C 11.105 22 12 21.105 12 20 L 12 19 C 12 17.895 11.105 17 10 17 z M 15 17 A 1.0001 1.0001 0 1 0 15 19 L 15 21 A 1.0001 1.0001 0 1 0 17 21 L 17 18 A 1.0001 1.0001 0 0 0 16 17 L 15 17 z M 20 17 A 1.0001 1.0001 0 1 0 20 19 L 20 21 A 1.0001 1.0001 0 1 0 22 21 L 22 18 A 1.0001 1.0001 0 0 0 21 17 L 20 17 z"></path>
                          </svg>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-[10px] font-bold text-purple-500 uppercase tracking-widest">EXTRA SESSIONS</span>
            </div>
          </div>

          {/* Avg Attendance Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2">Avg Attendance</p>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">{summary.attendanceRate}%</p>
              </div>
              <div className="p-2 border border-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">PER SESSION</span>
            </div>
          </div>
        </div>

        {/* Attendance History */}
        <div className="bg-white rounded-xl shadow-sm sm:shadow-lg border border-gray-200 overflow-hidden">
          {/* Header Section */}
          <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-5 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-700 uppercase tracking-wider">Attendance History</h3>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                  Showing {filteredHistory.length} of {attendanceHistory.length} records
                </p>
              </div>
              <ExportButton 
                onClick={handleExport}
                text="Export"
                className="w-full sm:w-auto"
              />
            </div>
          </div>
            
          {/* Filter Controls */}
          <div className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50/30">
            <div className="flex flex-col gap-3">
              {/* Search Bar */}
              <div className="relative w-full">
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

              {/* Filters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {/* Scheduled Class Filter */}
                <div className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
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

                {/* Start Date Filter */}
                <div>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    placeholder="Start Date"
                    className="block w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 shadow-sm transition-all duration-200"
                  />
                </div>

                {/* End Date Filter */}
                <div>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    placeholder="End Date"
                    className="block w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 shadow-sm transition-all duration-200"
                  />
                </div>

                {/* Status Filter */}
                <div>
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
              </div>

              {/* Clear Filters Button */}
              {(selectedScheduledClass || startDate || endDate || statusFilter || searchTerm) && (
                <button
                  onClick={clearFilters}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-xl transition-colors uppercase tracking-wider"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          </div>
          
          {/* Table Section */}
          <div className="overflow-hidden">
            {filteredHistory.length > 0 ? (
              <>
                {/* Mobile Card View */}
                <div className="block md:hidden space-y-3 p-3 sm:p-4">
                  {filteredHistory.map((record) => (
                    <div 
                      key={record.id} 
                      className="bg-gray-50/50 rounded-xl border border-gray-100 p-3 sm:p-4 hover:bg-white hover:border-gray-200 transition-all duration-200 shadow-sm"
                    >
                      {/* Student Info */}
                      <button
                        onClick={() => {
                          if (record.peer_students?.id) {
                            router.push(`/peer/attendance/${record.peer_students.id}`)
                          }
                        }}
                        className="flex items-center gap-3 w-full text-left mb-3"
                        disabled={!record.peer_students?.id}
                      >
                        <div className="w-10 h-10 rounded-lg bg-[#2c3e50] flex items-center justify-center shadow-sm flex-shrink-0">
                          <span className="text-white text-xs font-bold">
                            {record.peer_students?.name ? record.peer_students.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'N/A'}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-gray-900 truncate">
                            {record.peer_students?.name || 'Unknown Student'}
                          </div>
                          <div className="text-[10px] text-gray-400 font-medium truncate">
                            {record.peer_students?.email || 'No Email'}
                          </div>
                        </div>
                        <div>
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                              record.status === 'present'
                                ? 'bg-green-400 text-black border-black'
                                : 'bg-red-400 text-black border-black'
                            }`}>
                            <svg className="w-3 h-3 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              {record.status === 'present' ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                              )}
                            </svg>
                            {record.status === 'present' ? 'P' : 'A'}
                          </span>
                        </div>
                      </button>
                      
                      {/* Class and Date Info */}
                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Class</p>
                          <p className="text-xs font-bold uppercase text-gray-900 truncate">
                            {record.classes?.subject_name || 'No Class'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Date</p>
                          <p className="text-xs font-bold text-gray-900">
                            {record.scheduled_classes?.scheduled_date
                              ? new Date(record.scheduled_classes.scheduled_date).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short'
                                })
                              : record.classes?.created_at
                                ? new Date(record.classes.created_at).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short'
                                  })
                                : 'N/A'
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                        <TableHead className="py-4 pl-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                          Student
                        </TableHead>
                        <TableHead className="py-4 px-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                          Class
                        </TableHead>
                        <TableHead className="py-4 px-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                          Date
                        </TableHead>
                        <TableHead className="py-4 pr-6 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
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
                                if (record.peer_students?.id) {
                                  router.push(`/peer/attendance/${record.peer_students.id}`)
                                }
                              }}
                              className="flex items-center text-left group/btn w-full"
                              disabled={!record.peer_students?.id}
                            >
                              <div className="mr-3 transition-transform group-hover/btn:scale-105 flex-shrink-0">
                                <div className="w-8 h-8 rounded-lg bg-[#2c3e50] flex items-center justify-center shadow-sm">
                                  <span className="text-white text-xs font-bold">
                                    {record.peer_students?.name ? record.peer_students.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'N/A'}
                                  </span>
                                </div>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-gray-900 group-hover/btn:text-blue-600 transition-colors truncate">
                                  {record.peer_students?.name || 'Unknown Student'}
                                </div>
                                <div className="text-[10px] text-gray-400 font-medium truncate">
                                  {record.peer_students?.email || 'No Email'}
                                </div>
                              </div>
                            </button>
                          </TableCell>
                          <TableCell className="py-4 px-2 text-center">
                            {record.classes ? (
                              <div className="text-xs font-bold uppercase text-gray-900">
                                {record.classes.subject_name}
                              </div>
                            ) : (
                              <div className="text-[10px] text-gray-400 italic">No Details</div>
                            )}
                          </TableCell>
                          <TableCell className="py-4 px-2 uppercase text-center">
                            <div className="text-xs font-bold text-gray-900 whitespace-nowrap">
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
                          </TableCell>
                          <TableCell className="py-4 pr-6 text-right">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border whitespace-nowrap ${
                                record.status === 'present'
                                  ? 'bg-green-400 text-black border-green-100'
                                  : 'bg-red-400 text-black border-red-100'
                              }`}>
                              {record.status === 'present' ? 'Present' : 'Absent'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-3 sm:px-4 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4">
                  <Image src="/icons/search.png" alt="search" width={64} height={64} />
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
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 overflow-hidden">
      {/* Main Content */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} h-full flex flex-col w-full lg:w-auto`}>
        {/* Top Header */}
        <PageHeader
          title="ATTENDANCE STATUS"
          tagline="Class Completion & Peer Tutor Tracking"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isScheduledRefreshing}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  )
}
