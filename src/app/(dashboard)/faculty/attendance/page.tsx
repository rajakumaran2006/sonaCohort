'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { PeerTutorService } from '@/lib/services/peerTutorService'
import { DepartmentService } from '@/lib/services/departmentService'
import { AttendanceService, AttendanceRecord } from '@/lib/services/attendanceService'
import { FacultyService } from '@/lib/services/facultyService'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'

interface ClassWithAttendance extends ScheduledClassWithDetails {
  peerTutorAttendance: 'present' | 'absent'
  studentAttendance: AttendanceRecord[]
  attendanceSummary: {
    total: number
    present: number
    absent: number
  }
}

interface ClassStatus {
  completed: ClassWithAttendance[]
  pending: ClassWithAttendance[]
}

interface FilterOptions {
  year: string
  section: string
  date: string // 'today' or specific date
}

export default function FacultyAttendancePage() {
  return (
    <FacultyProtectedRoute>
      <FacultyAttendanceContent />
    </FacultyProtectedRoute>
  )
}

function FacultyAttendanceContent() {
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [classStatus, setClassStatus] = useState<ClassStatus>({ completed: [], pending: [] })
  const [facultyDepartment, setFacultyDepartment] = useState<string>('')
  const [years, setYears] = useState<any[]>([])
  const [sections, setSections] = useState<any[]>([])
  const [filters, setFilters] = useState<FilterOptions>({
    year: '',
    section: '',
    date: ''
  })
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())
  const [expandedPeerTutors, setExpandedPeerTutors] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'completed' | 'pending'>('completed')

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (facultyDepartment) {
      loadClassStatus()
    }
  }, [facultyDepartment, filters, lastRefresh])

  // Auto-refresh every 30 seconds to catch real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(new Date())
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [])

  const loadInitialData = async () => {
    try {
      setLoading(true)
      
      // Get faculty's department
      if (user?.email) {
        const facultyDept = await FacultyService.verifyFacultyAccess(user.email)
        if (facultyDept) {
          setFacultyDepartment(facultyDept.name)
        }
      }
      
      // Load years
      const yearData = await DepartmentService.getYears()
      setYears(yearData)
      
      // Load sections
      const sectionData = await DepartmentService.getSections()
      setSections(sectionData)
      
    } catch (error) {
      console.error('Error loading initial data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadClassStatus = async () => {
    try {
      setLoading(true)
      
      if (!facultyDepartment) {
        return
      }

      let status
      
      // Debug logging for filter combination
      console.log('Filter combination:', {
        year: filters.year,
        section: filters.section,
        date: filters.date,
        department: facultyDepartment
      })
      
      // Determine which service method to call based on filter combination
      // Handle date filter properly - convert 'today' to actual date string
      let dateFilter = filters.date
      if (filters.date === 'today') {
        dateFilter = new Date().toISOString().split('T')[0]
      }
      
      if (filters.year && filters.section && dateFilter && dateFilter !== '') {
        // Year + Section + Date
        console.log('Using: Year + Section + Date filter', { year: filters.year, section: filters.section, date: dateFilter })
        status = await ScheduledClassService.getPeerTutorClassStatusWithDate(
          facultyDepartment,
          filters.year,
          filters.section,
          dateFilter
        )
      } else if (filters.year && filters.section) {
        // Year + Section (all dates)
        console.log('Using: Year + Section filter (all dates)')
        status = await ScheduledClassService.getPeerTutorClassStatus(
          facultyDepartment,
          filters.year,
          filters.section
        )
      } else if (filters.year && dateFilter && dateFilter !== '') {
        // Year + Date (all sections)
        console.log('Using: Year + Date filter (all sections)', { year: filters.year, date: dateFilter })
        status = await ScheduledClassService.getPeerTutorClassStatusByYearAndDate(
          facultyDepartment,
          filters.year,
          dateFilter
        )
      } else if (filters.year) {
        // Year only (all sections, all dates)
        console.log('Using: Year only filter (all sections, all dates)')
        status = await ScheduledClassService.getPeerTutorClassStatusByYear(
          facultyDepartment,
          filters.year
        )
      } else {
        // No filters - get all classes for the department
        console.log('Using: No filters - all department classes')
        status = await ScheduledClassService.getAllClassesForDepartment(facultyDepartment)
      }
      
      console.log('Service result:', {
        completedCount: status.completed.length,
        pendingCount: status.pending.length
      })
      // Helper function to determine peer tutor attendance based on your logic
      const getPeerTutorAttendance = (cls: ScheduledClassWithDetails): 'present' | 'absent' => {
        const referenceDate = new Date()
        const scheduledDate = new Date(cls.scheduled_date)
        
        // If a specific date filter is applied, use that as reference date
        if (filters.date && filters.date !== '') {
          if (filters.date === 'today') {
            referenceDate.setHours(0, 0, 0, 0)
          } else {
            referenceDate.setTime(new Date(filters.date).getTime())
            referenceDate.setHours(0, 0, 0, 0)
          }
        } else {
          // No date filter - use current date
          referenceDate.setHours(0, 0, 0, 0)
        }
        
        scheduledDate.setHours(0, 0, 0, 0)
        
        const isReferenceDate = referenceDate.getTime() === scheduledDate.getTime()
        const isPastDate = scheduledDate.getTime() < referenceDate.getTime()
        const isCompleted = cls.completion_status === 'completed' || (cls.attendance_completed && cls.topics_completed)
        
        // Debug logging
        console.log('Attendance calculation:', {
          peerTutor: cls.peer_tutor?.name,
          scheduledDate: scheduledDate.toISOString().split('T')[0],
          referenceDate: referenceDate.toISOString().split('T')[0],
          isReferenceDate,
          isPastDate,
          isCompleted,
          completionStatus: cls.completion_status,
          attendanceCompleted: cls.attendance_completed,
          topicsCompleted: cls.topics_completed
        })
        
        // Logic: Present if (reference date is scheduled date AND completed) OR (past date AND completed)
        // Absent if (past date AND not completed)
        if (isReferenceDate && isCompleted) {
          return 'present'
        } else if (isPastDate && isCompleted) {
          return 'present'
        } else if (isPastDate && !isCompleted) {
          return 'absent'
        } else {
          // Future date - not yet determined
          return 'absent'
        }
      }

      // Enhance classes with attendance data
      const enhancedCompleted = await Promise.all(
        status.completed.map(async (cls) => {
          const attendanceData = await AttendanceService.getAttendanceByScheduledClass(cls.id)
          const peerTutorAttendance = getPeerTutorAttendance(cls)
          
          console.log('Attendance data for class:', {
            classId: cls.id,
            className: cls.class?.subject_name,
            scheduledDate: cls.scheduled_date,
            attendanceData: attendanceData,
            attendanceDataLength: attendanceData.length
          })
          const attendanceSummary = {
            total: attendanceData.length,
            present: attendanceData.filter(record => record.status === 'present').length,
            absent: attendanceData.filter(record => record.status === 'absent').length
          }
          return {
            ...cls,
            peerTutorAttendance,
            studentAttendance: attendanceData,
            attendanceSummary
          } as ClassWithAttendance
        })
      )

      const enhancedPending = await Promise.all(
        status.pending.map(async (cls) => {
          const peerTutorAttendance = getPeerTutorAttendance(cls)
          
          console.log('Pending class (no attendance data):', {
            classId: cls.id,
            className: cls.class?.subject_name,
            scheduledDate: cls.scheduled_date,
            completionStatus: cls.completion_status
          })
          
          // For pending classes, don't show attendance data
          const attendanceSummary = {
            total: 0,
            present: 0,
            absent: 0
          }

          return {
            ...cls,
            peerTutorAttendance,
            studentAttendance: [], // Empty array for pending classes
            attendanceSummary
          } as ClassWithAttendance
        })
      )

      setClassStatus({
        completed: enhancedCompleted,
        pending: enhancedPending
      })

    } catch (error) {
      console.error('Error loading class status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (key: keyof FilterOptions, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const resetFilters = () => {
    setFilters({
      year: '',
      section: '',
      date: ''
    })
    setClassStatus({ completed: [], pending: [] })
  }

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    try {
      setLastRefresh(new Date())
      // Small delay to show the refresh animation
      await new Promise(resolve => setTimeout(resolve, 500))
    } finally {
      setIsRefreshing(false)
    }
  }

  const toggleClassExpansion = (classId: string) => {
    setExpandedClasses(prev => {
      const newSet = new Set(prev)
      if (newSet.has(classId)) {
        newSet.delete(classId)
      } else {
        newSet.add(classId)
      }
      return newSet
    })
  }

  const togglePeerTutorExpansion = (peerTutorId: string) => {
    setExpandedPeerTutors(prev => {
      const newSet = new Set(prev)
      if (newSet.has(peerTutorId)) {
        newSet.delete(peerTutorId)
      } else {
        newSet.add(peerTutorId)
      }
      return newSet
    })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getDateStatus = (dateString: string) => {
    const today = new Date()
    const scheduledDate = new Date(dateString)
    
    today.setHours(0, 0, 0, 0)
    scheduledDate.setHours(0, 0, 0, 0)
    
    const isToday = today.getTime() === scheduledDate.getTime()
    const isPastDate = scheduledDate.getTime() < today.getTime()
    
    if (isToday) {
      return { status: 'today', label: 'Today', color: 'text-blue-600' }
    } else if (isPastDate) {
      return { status: 'past', label: 'Past', color: 'text-gray-600' }
    } else {
      return { status: 'future', label: 'Future', color: 'text-green-600' }
    }
  }

  // Group classes by peer tutor for simplified view
  const groupClassesByPeerTutor = (classes: ClassWithAttendance[]) => {
    const grouped = classes.reduce((acc, cls) => {
      const peerTutorId = cls.peer_tutor?.id || 'unknown'
      const peerTutorName = cls.peer_tutor?.name || 'Unknown Peer Tutor'
      
      if (!acc[peerTutorId]) {
        acc[peerTutorId] = {
          id: peerTutorId,
          name: peerTutorName,
          email: cls.peer_tutor?.email || '',
          classes: [],
          totalClasses: 0,
          completedClasses: 0,
          pendingClasses: 0,
          overallStatus: 'present' as 'present' | 'absent'
        }
      }
      
      acc[peerTutorId].classes.push(cls)
      acc[peerTutorId].totalClasses++
      
      if (cls.completion_status === 'completed' || (cls.attendance_completed && cls.topics_completed)) {
        acc[peerTutorId].completedClasses++
      } else {
        acc[peerTutorId].pendingClasses++
      }
      
      return acc
    }, {} as Record<string, {
      id: string
      name: string
      email: string
      classes: ClassWithAttendance[]
      totalClasses: number
      completedClasses: number
      pendingClasses: number
      overallStatus: 'present' | 'absent'
    }>)
    
    // Calculate overall status for each peer tutor
    Object.values(grouped).forEach(peerTutor => {
      const presentCount = peerTutor.classes.filter(cls => cls.peerTutorAttendance === 'present').length
      peerTutor.overallStatus = presentCount > peerTutor.totalClasses / 2 ? 'present' : 'absent'
    })
    
    return Object.values(grouped)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading && !classStatus.completed.length && !classStatus.pending.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col lg:ml-64">
        {/* Mobile header */}
        <div className="lg:hidden bg-white shadow-sm border-b border-gray-200 px-4 py-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="text-gray-500 hover:text-gray-700 focus:outline-none focus:text-gray-700"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Peer Tutor Attendance</h1>
              <p className="mt-2 text-gray-600">
                Monitor completed and pending peer tutor classes
                {facultyDepartment && (
                  <span className="ml-2 text-blue-600 font-medium">• {facultyDepartment}</span>
                )}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </div>
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg 
                  className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Year Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Year
              </label>
              <select
                value={filters.year}
                onChange={(e) => handleFilterChange('year', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select Year</option>
                {years.map((year) => (
                  <option key={year.id} value={year.name}>
                    {year.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Section Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Section
              </label>
              <select
                value={filters.section}
                onChange={(e) => handleFilterChange('section', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!filters.year}
              >
                <option value="">Select Section</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.name}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Enhanced Date Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date Filter
              </label>
              <div className="space-y-2">
                <select
                  value={filters.date === 'today' ? 'today' : filters.date === '' ? 'all' : 'custom'}
                  onChange={(e) => {
                    if (e.target.value === 'today') {
                      handleFilterChange('date', 'today')
                    } else if (e.target.value === 'all') {
                      handleFilterChange('date', '')
                    } else if (e.target.value === 'custom') {
                      // Set to today's date when switching to custom
                      const todayDate = new Date().toISOString().split('T')[0]
                      handleFilterChange('date', todayDate)
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Dates</option>
                  <option value="today">Today Only</option>
                  <option value="custom">Custom Date</option>
                </select>
                {filters.date !== 'today' && filters.date !== '' && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="date"
                      value={filters.date}
                      onChange={(e) => handleFilterChange('date', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={() => handleFilterChange('date', '')}
                      className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                      title="Clear date filter"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {filters.date && (
                  <div className="text-xs text-gray-500">
                    {filters.date === 'today' 
                      ? `Showing classes for today (${new Date().toLocaleDateString()})`
                      : `Showing classes for ${new Date(filters.date).toLocaleDateString()}`
                    }
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Reset Button */}
          <div className="mt-4">
            <button
              onClick={resetFilters}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Stats Cards - Enhanced Box Layout */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Class Status Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Completed Classes Card */}
            <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl border-2 border-green-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Completed Classes</h3>
                    <p className="text-sm text-gray-600">Successfully finished</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold text-green-600">{classStatus.completed.length}</p>
                  <p className="text-sm text-green-600 font-medium">classes</p>
                </div>
              </div>
            </div>

            {/* Pending Classes Card */}
            <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-xl border-2 border-yellow-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Pending Classes</h3>
                    <p className="text-sm text-gray-600">Awaiting completion</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold text-yellow-600">{classStatus.pending.length}</p>
                  <p className="text-sm text-yellow-600 font-medium">classes</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Peer Tutors List - Always show the peer tutor card view */}
        {facultyDepartment ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Enhanced Tab Navigation */}
            <div className="border-b border-gray-200 bg-gray-50">
              <nav className="-mb-px flex space-x-0 px-6" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('completed')}
                  className={`flex-1 py-6 px-4 border-b-4 font-semibold text-base transition-all duration-200 ${
                    activeTab === 'completed'
                      ? 'border-green-500 text-green-700 bg-white shadow-sm'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-center">
                    <svg className="w-6 h-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="text-center">
                      <div className="text-lg font-bold">Completed Classes</div>
                      <div className="text-sm font-medium">{classStatus.completed.length} classes</div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('pending')}
                  className={`flex-1 py-4 px-4 border-b-4 font-medium text-sm transition-all duration-200 ${
                    activeTab === 'pending'
                      ? 'border-yellow-500 text-yellow-700 bg-white shadow-sm'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-center">
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-center">
                      <div className="font-semibold">Pending Classes</div>
                      <div className="text-xs">{classStatus.pending.length} classes</div>
                    </div>
                  </div>
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {activeTab === 'completed' ? 'Completed Peer Tutors' : 'Pending Peer Tutors'}
              </h2>
              <p className="text-sm text-gray-600 mb-6">Click on a peer tutor to view their class details</p>
              
              {(() => {
                const allClasses = activeTab === 'completed' ? classStatus.completed : classStatus.pending
                const peerTutors = groupClassesByPeerTutor(allClasses)
                
                if (peerTutors.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900">
                        No {activeTab} peer tutors
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {activeTab === 'completed' 
                          ? 'No peer tutors have completed their classes yet.' 
                          : 'All peer tutors have completed their classes.'}
                      </p>
                    </div>
                  )
                }
                
                return (
                  <div className="space-y-4">
                    {peerTutors.map((peerTutor) => (
                      <div key={peerTutor.id} className="border border-gray-200 rounded-lg">
                        {/* Peer Tutor Header */}
                        <button
                          onClick={() => togglePeerTutorExpansion(peerTutor.id)}
                          className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <div className="flex-shrink-0">
                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                  <span className="text-sm font-medium text-blue-600">
                                    {peerTutor.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                  </span>
                                </div>
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-gray-900">{peerTutor.name}</h3>
                                <p className="text-sm text-gray-600">{peerTutor.email}</p>
                                <div className="flex items-center space-x-4 mt-1">
                                  <span className="text-sm text-gray-500">
                                    {peerTutor.completedClasses}/{peerTutor.totalClasses} classes completed
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-3">
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                peerTutor.overallStatus === 'present' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {peerTutor.overallStatus === 'present' ? 'Present' : 'Absent'}
                              </span>
                              <svg 
                                className={`w-5 h-5 text-gray-400 transition-transform ${
                                  expandedPeerTutors.has(peerTutor.id) ? 'rotate-180' : ''
                                }`} 
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </button>
                        
                        {/* Expanded Details */}
                        {expandedPeerTutors.has(peerTutor.id) && (
                          <div className="border-t border-gray-200 p-4 bg-gray-50">
                            <div className="space-y-4">
                              {peerTutor.classes.map((cls) => (
                                <div key={cls.id} className="bg-white rounded-lg p-4 border border-gray-200">
                                  <div className="flex items-start justify-between mb-3">
                                    <div>
                                      <h4 className="font-semibold text-gray-900">{cls.class.subject_name}</h4>
                                      <div className="text-sm text-gray-600 mt-1">
                                        <div className="flex items-center space-x-2">
                                          <span>Date: {formatDate(cls.scheduled_date)}</span>
                                          <span className={`text-xs px-2 py-1 rounded-full ${getDateStatus(cls.scheduled_date).color} bg-gray-100`}>
                                            {getDateStatus(cls.scheduled_date).label}
                                          </span>
                                        </div>
                                        <p>{cls.dept} - {cls.year} - {cls.section}</p>
                                      </div>
                                      {cls.topics && (
                                        <p className="text-sm text-gray-600 mt-2">
                                          <span className="font-medium">Topics:</span> {cls.topics}
                                        </p>
                                      )}
                                    </div>
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                      cls.peerTutorAttendance === 'present' 
                                        ? 'bg-green-100 text-green-800' 
                                        : 'bg-red-100 text-red-800'
                                    }`}>
                                      {cls.peerTutorAttendance === 'present' ? 'Present' : 'Absent'}
                                    </span>
                                  </div>
                                  
                                  {/* Enhanced Student Attendance Summary */}
                                  <div className="border-t border-gray-200 pt-4">
                                    <div className="flex items-center justify-between mb-3">
                                      <h5 className="text-sm font-medium text-gray-900">Student Attendance Summary</h5>
                                      {cls.attendanceSummary.total > 0 && (
                                        <span className="text-xs text-gray-500">
                                          {Math.round((cls.attendanceSummary.present / cls.attendanceSummary.total) * 100)}% attendance rate
                                        </span>
                                      )}
                                    </div>
                                    
                                    {cls.studentAttendance.length > 0 ? (
                                      <div className="space-y-3">
                                        {/* Attendance Stats Cards */}
                                        <div className="grid grid-cols-3 gap-3">
                                          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                                            <div className="text-2xl font-bold text-green-600">{cls.attendanceSummary.present}</div>
                                            <div className="text-xs text-green-700 font-medium">Present</div>
                                          </div>
                                          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                                            <div className="text-2xl font-bold text-red-600">{cls.attendanceSummary.absent}</div>
                                            <div className="text-xs text-red-700 font-medium">Absent</div>
                                          </div>
                                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                                            <div className="text-2xl font-bold text-gray-600">{cls.attendanceSummary.total}</div>
                                            <div className="text-xs text-gray-700 font-medium">Total</div>
                                          </div>
                                        </div>
                                        
                                        {/* Individual Student Details */}
                                        <div className="mt-4">
                                          <h6 className="text-xs font-medium text-gray-700 mb-2">Individual Records:</h6>
                                          <div className="space-y-1 max-h-32 overflow-y-auto">
                                            {cls.studentAttendance.map((student) => (
                                              <div key={student.student_id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                                                <span className="text-gray-900 font-medium">{student.student_name}</span>
                                                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                                  student.status === 'present' 
                                                    ? 'bg-green-100 text-green-800' 
                                                    : 'bg-red-100 text-red-800'
                                                }`}>
                                                  {student.status === 'present' ? 'Present' : 'Absent'}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-center py-4">
                                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                                          </svg>
                                        </div>
                                        <div className="text-sm text-gray-500 italic">
                                          No students assigned to this class
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No department found</h3>
            <p className="mt-1 text-sm text-gray-500">Please ensure you are assigned to a department to view attendance data.</p>
          </div>
        )}
        </div>
        </div>
      </div>
    </div>
  )
}
