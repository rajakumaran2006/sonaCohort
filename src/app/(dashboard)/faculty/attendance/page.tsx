'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { DepartmentService } from '@/lib/services/departmentService'
import { AttendanceService, AttendanceRecord } from '@/lib/services/attendanceService'
import { FacultyService } from '@/lib/services/facultyService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import FilterDropdown from '@/components/ui/FilterDropdown'
import ExportButton from '@/components/ui/ExportButton'

interface ClassWithAttendance extends ScheduledClassWithDetails {
  peertutorsAttendance: 'present' | 'absent'
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
  subject: string
}

interface peerTutorummary {
  id: string
  name: string
  email: string
  classes: ClassWithAttendance[]
  totalClasses: number
  completedClasses: number
  pendingClasses: number
  additionalClasses: number
  overallStatus: 'present' | 'absent'
  years: Set<string>
  sections: Set<string>
  actualSection: string
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
  
  // Use custom hook for sidebar collapsed state (reads from localStorage synchronously)
  const [isSidebarCollapsed] = useSidebarCollapsed()
  const [tableLoading, setTableLoading] = useState(false)
  const [classStatus, setClassStatus] = useState<ClassStatus>({ completed: [], pending: [] })
  const [facultyDepartment, setFacultyDepartment] = useState<string>('')
  const [years, setYears] = useState<Array<{ id: string; name: string }>>([])
  const [sections, setSections] = useState<Array<{ id: string; name: string }>>([])
  const [filters, setFilters] = useState<FilterOptions>({
    year: '',
    section: '',
    date: '',
    subject: ''
  })
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [expandedpeerTutor, setExpandedpeerTutor] = useState<Set<string>>(new Set())
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([])
  const [peerTutor, setpeerTutor] = useState<Array<{
    id: string
    name: string
    email: string
    classes: ClassWithAttendance[]
    totalClasses: number
    completedClasses: number
    pendingClasses: number
    additionalClasses: number
    overallStatus: 'present' | 'absent'
    years: Set<string>
    sections: Set<string>
    actualSection: string
  }>>([])
  const [loadingpeerTutor, setLoadingpeerTutor] = useState(false)

  useEffect(() => {
    loadInitialData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (facultyDepartment) {
      loadClassStatus()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultyDepartment, lastRefresh])

  useEffect(() => {
    if (facultyDepartment) {
      loadTableData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultyDepartment, filters])

  // Extract unique subjects from class status data
  useEffect(() => {
    const allClasses = [...classStatus.completed, ...classStatus.pending]
    const uniqueSubjects = Array.from(new Set(
      allClasses
        .map(cls => cls.class?.subject_name)
        .filter(name => name !== undefined && name !== null)
    )).map((name, index) => ({ id: `${index}`, name }))
    setSubjects(uniqueSubjects)
  }, [classStatus])

  // Update peer tutors whenever class status changes
  useEffect(() => {
    const loadpeerTutor = async () => {
      const allClasses = [...classStatus.completed, ...classStatus.pending]
      if (allClasses.length > 0) {
        setLoadingpeerTutor(true)
        try {
          const tutors = await groupClassesBypeertutors(allClasses)
          setpeerTutor(tutors)
        } catch (error) {
          console.error('Error grouping peer tutors:', error)
          setpeerTutor([])
        } finally {
          setLoadingpeerTutor(false)
        }
      } else {
        setpeerTutor([])
      }
    }
    
    loadpeerTutor()
  }, [classStatus])

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
        console.log('Faculty department data:', facultyDept)
        if (facultyDept) {
          console.log('Setting faculty department to:', facultyDept.name)
          setFacultyDepartment(facultyDept.name)
        } else {
          console.error('No faculty department found for user:', user.email)
        }
      } else {
        console.error('No user email available')
      }
      
      // Load years
      const yearData = await DepartmentService.getYears()
      setYears(yearData)
      
      // Load sections
      const sectionData = await DepartmentService.getSections()
      setSections(sectionData)
      
      // Load subjects from the classes data
      // This will be populated after classes are loaded
      setSubjects([])
      
    } catch (error) {
      console.error('Error loading initial data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadClassStatus = async () => {
    try {
      setLoading(true)
      
      console.log('loadClassStatus called with facultyDepartment:', facultyDepartment)
      console.log('facultyDepartment type:', typeof facultyDepartment)
      console.log('facultyDepartment length:', facultyDepartment?.length)
      
      if (!facultyDepartment) {
        console.log('No faculty department, skipping loadClassStatus')
        return
      }

      // Load stats data without filters - get all classes for the department
      console.log('Loading stats data for department:', facultyDepartment)
      try {
        const status = await ScheduledClassService.getAllClassesForDepartment(facultyDepartment)
        
        // Convert to ClassWithAttendance format for stats display
        const statsCompleted = status.completed.map((cls: ScheduledClassWithDetails) => ({
          ...cls,
          peertutorsAttendance: 'present' as 'present' | 'absent',
          studentAttendance: [],
          attendanceSummary: { total: 0, present: 0, absent: 0 }
        }))
        
        const statsPending = status.pending.map((cls: ScheduledClassWithDetails) => ({
          ...cls,
          peertutorsAttendance: 'absent' as 'present' | 'absent',
          studentAttendance: [],
          attendanceSummary: { total: 0, present: 0, absent: 0 }
        }))
        
        setClassStatus({
          completed: statsCompleted,
          pending: statsPending
        })
      } catch (error) {
        console.error('Error calling getAllClassesForDepartment:', error)
        setClassStatus({ completed: [], pending: [] })
      }

    } catch (error) {
      console.error('Error loading class status:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTableData = async () => {
    try {
      setTableLoading(true)
      
      console.log('loadTableData called with filters:', filters)
      
      if (!facultyDepartment) {
        console.log('No faculty department, skipping loadTableData')
        return
      }

      let status: { completed: ScheduledClassWithDetails[]; pending: ScheduledClassWithDetails[] }
      
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
        status = await ScheduledClassService.getpeertutorsClassStatusWithDate(
          facultyDepartment,
          filters.year,
          filters.section,
          dateFilter
        )
      } else if (filters.year && filters.section) {
        // Year + Section (all dates)
        console.log('Using: Year + Section filter (all dates)')
        status = await ScheduledClassService.getpeertutorsClassStatus(
          facultyDepartment,
          filters.year,
          filters.section
        )
      } else if (filters.year && dateFilter && dateFilter !== '') {
        // Year + Date (all sections)
        console.log('Using: Year + Date filter (all sections)', { year: filters.year, date: dateFilter })
        status = await ScheduledClassService.getpeertutorsClassStatusByYearAndDate(
          facultyDepartment,
          filters.year,
          dateFilter
        )
      } else if (filters.year) {
        // Year only (all sections, all dates)
        console.log('Using: Year only filter (all sections, all dates)')
        status = await ScheduledClassService.getpeertutorsClassStatusByYear(
          facultyDepartment,
          filters.year
        )
      } else {
        // No filters - get all classes for the department
        console.log('Using: No filters - all department classes')
        console.log('Calling getAllClassesForDepartment with:', facultyDepartment)
        try {
          status = await ScheduledClassService.getAllClassesForDepartment(facultyDepartment)
        } catch (error) {
          console.error('Error calling getAllClassesForDepartment:', error)
          status = { completed: [], pending: [] }
        }
      }
      
      console.log('Service result:', {
        completedCount: status.completed.length,
        pendingCount: status.pending.length
      })
      
      // Helper function to determine peer tutor attendance based on your logic
      const getpeertutorsAttendance = (cls: ScheduledClassWithDetails): 'present' | 'absent' => {
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
          peertutors: cls.peer_tutor?.name,
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
          const peertutorsAttendance = getpeertutorsAttendance(cls)
          
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
            peertutorsAttendance,
            studentAttendance: attendanceData,
            attendanceSummary
          } as ClassWithAttendance
        })
      )

      const enhancedPending = await Promise.all(
        status.pending.map(async (cls) => {
          const peertutorsAttendance = getpeertutorsAttendance(cls)
          
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
            peertutorsAttendance,
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
      console.error('Error loading table data:', error)
    } finally {
      setTableLoading(false)
    }
  }

  const handleFilterChange = (key: keyof FilterOptions, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
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



  const togglepeertutorsExpansion = (peertutorsId: string) => {
    setExpandedpeerTutor(prev => {
      const newSet = new Set(prev)
      if (newSet.has(peertutorsId)) {
        newSet.delete(peertutorsId)
      } else {
        newSet.add(peertutorsId)
      }
      return newSet
    })
  }

  const handleExportData = () => {
    // Create CSV content
    const headers = ['Peer Tutor Name', 'Email', 'Year', 'Section', 'Classes Completed', 'Additional Classes', 'Total Classes', 'Attendance %']
    const csvContent = [
      headers.join(','),
      ...peerTutor.map(peertutors => [
        `"${peertutors.name}"`,
        `"${peertutors.email}"`,
        `"${Array.from(peertutors.years).join(', ') || 'N/A'}"`,
        `"${peertutors.actualSection || Array.from(peertutors.sections).filter(s => s !== 'ALL').join(', ') || 'N/A'}"`,
        peertutors.completedClasses - peertutors.additionalClasses,
        peertutors.additionalClasses,
        peertutors.totalClasses,
        peertutors.totalClasses > 0 ? Math.round((peertutors.completedClasses / peertutors.totalClasses) * 100) : 0
      ].join(','))
    ].join('\n')
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    
    // Generate filename based on current filters
    const filterInfo = []
    if (filters.year) filterInfo.push(`Year-${filters.year}`)
    if (filters.section) filterInfo.push(`Section-${filters.section}`)
    if (filters.date) {
      const dateStr = filters.date === 'today' ? 'Today' : new Date(filters.date).toLocaleDateString()
      filterInfo.push(`Date-${dateStr}`)
    }
    
    const filename = `peer-tutor-attendance${filterInfo.length > 0 ? `-${filterInfo.join('-')}` : ''}-${new Date().toISOString().split('T')[0]}.csv`
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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
  const groupClassesBypeertutors = async (classes: ClassWithAttendance[]): Promise<peerTutorummary[]> => {
    const grouped = classes.reduce((acc, cls) => {
      const peertutorsId = cls.peer_tutor?.id || 'unknown'
      const peertutorsName = cls.peer_tutor?.name || 'Unknown Peer Tutor'
      
      if (!acc[peertutorsId]) {
        acc[peertutorsId] = {
          id: peertutorsId,
          name: peertutorsName,
          email: cls.peer_tutor?.email || '',
          classes: [],
          totalClasses: 0,
          completedClasses: 0,
          pendingClasses: 0,
          additionalClasses: 0,
          overallStatus: 'present' as 'present' | 'absent',
          years: new Set<string>(),
          sections: new Set<string>(),
          actualSection: '' // Will be fetched from peer tutor data
        }
      }
      
      acc[peertutorsId].classes.push(cls)
      acc[peertutorsId].totalClasses++
      
      // Add year to sets (but don't add section from classes as it might be "ALL")
      if (cls.year) acc[peertutorsId].years.add(cls.year)
      
      if (cls.completion_status === 'completed' || (cls.attendance_completed && cls.topics_completed)) {
        acc[peertutorsId].completedClasses++
      } else {
        acc[peertutorsId].pendingClasses++
      }
      
      return acc
    }, {} as Record<string, peerTutorummary>)
    
    // Fetch peer tutor data to get their actual section and year
    await Promise.all(
      Object.values(grouped).map(async (peertutors) => {
        try {
          // Fetch peer tutor data from database to get actual section
          const peertutorsData = await peertutorservice.getpeertutorsById(peertutors.id)
          if (peertutorsData) {
            // Use the actual section from peer tutor record
            peertutors.actualSection = peertutorsData.section
            peertutors.sections.add(peertutorsData.section)
            // Also add year if not already present
            if (peertutorsData.year) {
              peertutors.years.add(peertutorsData.year)
            }
          }
          
          // Fetch additional classes
          const additionalClasses = await AdditionalClassService.getAdditionalClassesBypeertutors(peertutors.id)
          peertutors.additionalClasses = additionalClasses.length
          // Add additional classes to completed only (not to totalClasses)
          // Total classes should remain as allocated scheduled classes only
          peertutors.completedClasses += additionalClasses.length
        } catch (error) {
          console.error('Error fetching peer tutor data:', peertutors.id, error)
          peertutors.additionalClasses = 0
        }
      })
    )
    
    // Calculate overall status for each peer tutor
    Object.values(grouped).forEach(peertutors => {
      const presentCount = peertutors.classes.filter(cls => cls.peertutorsAttendance === 'present').length
      // Include additional classes as "present" since they're all completed
      const totalPresentCount = presentCount + peertutors.additionalClasses
      peertutors.overallStatus = totalPresentCount > peertutors.totalClasses / 2 ? 'present' : 'absent'
    })
    
    return Object.values(grouped)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden w-full lg:w-auto`}>
        {/* Top Header */}
        <PageHeader
          title="ATTENDANCE STATUS"
          tagline="Class Completion & Peer Tutor Tracking"
          lastRefresh={lastRefresh}
          onRefresh={handleManualRefresh}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className={`max-w-full mx-auto py-8 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
            {loading && !classStatus.completed.length && !classStatus.pending.length ? (
              <main className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Loading Attendance Data...</p>
                </div>
              </main>
            ) : (
              <>
        {/* Stats Cards */}
        {facultyDepartment ? (
          <>
            {/* Stats Cards - Clean White Design */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {/* Total Peer Tutors Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Total Peer Tutors</p>
                    <p className="text-3xl font-bold text-gray-900 tracking-tight">
                      {(() => {
                        const allClasses = [...classStatus.completed, ...classStatus.pending]
                        const uniquepeerTutor = new Set(
                          allClasses
                            .map(cls => cls.peer_tutor?.id)
                            .filter((id): id is string => id !== undefined && id !== null)
                        )
                        return uniquepeerTutor.size
                      })()}
                    </p>
                  </div>
                  <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                    Across Department
                  </p>
                </div>
              </div>

              {/* Completed Classes Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Completed Classes</p>
                    <p className="text-3xl font-bold text-gray-900 tracking-tight">{classStatus.completed.length}</p>
                  </div>
                  <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                  <p className="text-[9px] font-bold text-green-600 uppercase tracking-widest flex items-center gap-1.5">
                    Marked Verified
                  </p>
                </div>
              </div>

              {/* Pending Classes Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Pending Classes</p>
                    <p className="text-3xl font-bold text-gray-900 tracking-tight">{classStatus.pending.length}</p>
                  </div>
                  <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                  <p className="text-[9px] font-bold text-orange-600 uppercase tracking-widest flex items-center gap-1.5">
                    Action Required
                  </p>
                </div>
              </div>
            </div>

        {/* Peer Tutors Table View */}
          {/* Peer Tutors Table View - Clean White Design */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                  Attendance Status ({peerTutor.length})
                </h3>
                
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-40">
                    <FilterDropdown
                      value={filters.year}
                      onChange={(value) => handleFilterChange('year', value)}
                      options={years.map(year => ({ label: year.name, value: year.name }))}
                      placeholder="All Years"
                    />
                  </div>

                  <div className="w-40">
                    <FilterDropdown
                      value={filters.section}
                      onChange={(value) => handleFilterChange('section', value)}
                      options={sections.map(section => ({ label: section.name, value: section.name }))}
                      placeholder="All Sections"
                      disabled={!filters.year}
                    />
                  </div>

                  <div className="w-40">
                    <FilterDropdown
                      value={filters.subject || ''}
                      onChange={(value) => handleFilterChange('subject', value)}
                      options={subjects.map(subject => ({ label: subject.name, value: subject.name }))}
                      placeholder="All Subjects"
                    />
                  </div>

                  <ExportButton 
                    onClick={handleExportData}
                    disabled={peerTutor.length === 0}
                  />

                  </div>
                </div>
              </div>

            {/* Table Header - Static */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-white">
                    <TableHead className="pl-6 py-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Name</span>
                    </TableHead>
                    <TableHead className="text-center py-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Year & Section</span>
                    </TableHead>
                    <TableHead className="text-center py-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Allocated</span>
                    </TableHead>
                    <TableHead className="text-center py-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Completed</span>
                    </TableHead>
                    <TableHead className="text-center py-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Additional</span>
                    </TableHead>
                    <TableHead className="text-center py-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Attendance %</span>
                    </TableHead>
                    <TableHead className="text-right pr-6 py-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                
                {/* Table Body - Dynamic Content */}
                <TableBody>
                  {tableLoading || loadingpeerTutor ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <div className="flex items-center justify-center space-x-3">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                          <span className="text-sm text-gray-600">Loading peer tutor data...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (() => {
                    const filteredpeerTutorList = peerTutor

                    // Apply subject filter if selected
                    const subjectFilteredList = filters.subject 
                      ? filteredpeerTutorList.filter(peertutors => 
                          peertutors.classes.some((cls: ClassWithAttendance) => 
                            cls.class?.subject_name === filters.subject
                          )
                        )
                      : filteredpeerTutorList

                    if (subjectFilteredList.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12">
                            <div className="flex flex-col items-center">
                              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              <h3 className="mt-2 text-sm font-medium text-gray-900">
                                No peer tutors found
                              </h3>
                              <p className="mt-1 text-sm text-gray-500">
                                No peer tutors are assigned to classes in this department.
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    }

                    return subjectFilteredList.map((peertutors) => {
                      // Get the actual section (prefer actualSection, otherwise use first non-ALL section, or 'ALL' as fallback)
                      const actualSection = peertutors.actualSection || Array.from(peertutors.sections).filter(s => s !== 'ALL')[0] || 'ALL'
                      // Get the year (use first year from the set)
                      const year = Array.from(peertutors.years)[0] || ''
                      
                      return (
                      <React.Fragment key={peertutors.id}>
                        <TableRow className="hover:bg-gray-50/50 transition-colors group border-b border-gray-100">
                          <TableCell className="pl-6 py-4">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                                <span className="text-xs font-bold text-white uppercase">
                                  {peertutors.name.substring(0, 2)}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-bold text-gray-900 mb-0.5">{peertutors.name}</p>
                                <p className="text-[10px] text-gray-400 font-medium">{peertutors.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center py-4">
                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                              {year ? `${year} - ${actualSection}` : 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center py-4">
                            <span className="text-sm font-bold text-gray-900">{peertutors.totalClasses}</span>
                          </TableCell>
                          <TableCell className="text-center py-4">
                            <span className="text-sm font-bold text-gray-900">{peertutors.completedClasses - peertutors.additionalClasses}</span>
                          </TableCell>
                          <TableCell className="text-center py-4">
                            <span className="text-sm font-bold text-purple-600">{peertutors.additionalClasses}</span>
                          </TableCell>
                          <TableCell className="text-center py-4">
                            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-50 border border-gray-100">
                              <span className="text-xs font-bold text-gray-900">
                                {peertutors.totalClasses > 0 ? Math.round((peertutors.completedClasses / peertutors.totalClasses) * 100) : 0}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right pr-6 py-4">
                            <button
                              onClick={() => togglepeertutorsExpansion(peertutors.id)}
                              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                            >
                              {expandedpeerTutor.has(peertutors.id) ? 'CLOSE' : 'VIEW'}
                            </button>
                          </TableCell>
                        </TableRow>
                        
                        {/* Expanded Details Row */}
                        {expandedpeerTutor.has(peertutors.id) && (
                          <TableRow>
                            <TableCell colSpan={7} className="px-0 py-0">
                              <div className="bg-gray-50 border-t border-gray-200 p-6">
                                <h4 className="text-lg font-semibold text-gray-900 mb-4">Class Details</h4>
                                <div className="space-y-4">
                                  {peertutors.classes.map((cls: ClassWithAttendance) => (
                                <div key={cls.id} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm relative group overflow-hidden">
                                  <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-50">
                                    <div>
                                      <h5 className="text-sm font-bold text-gray-900 mb-1">{cls.class.subject_name}</h5>
                                      <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 rounded text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                          </svg>
                                          {formatDate(cls.scheduled_date)}
                                        </div>
                                        <div className={`text-[9px] font-black uppercase tracking-[0.2em] ${getDateStatus(cls.scheduled_date).color}`}>
                                          {getDateStatus(cls.scheduled_date).label}
                                        </div>
                                      </div>
                                    </div>
                                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                                      cls.peertutorsAttendance === 'present' 
                                        ? 'bg-green-50 text-green-600 border border-green-100' 
                                        : 'bg-red-50 text-red-600 border border-red-100'
                                    }`}>
                                      {cls.peertutorsAttendance === 'present' ? 'Present' : 'Absent'}
                                    </div>
                                  </div>
                                  
                                  {/* Student Attendance Summary */}
                                  {cls.peertutorsAttendance === 'present' ? (
                                    <div>
                                      <div className="grid grid-cols-3 gap-4 mb-5">
                                        <div className="p-4 bg-white border border-gray-100 rounded-xl text-center group-hover:border-green-100 transition-colors">
                                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Present</p>
                                          <p className="text-xl font-bold text-green-600">{cls.attendanceSummary.present}</p>
                                        </div>
                                        <div className="p-4 bg-white border border-gray-100 rounded-xl text-center group-hover:border-red-100 transition-colors">
                                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Absent</p>
                                          <p className="text-xl font-bold text-red-600">{cls.attendanceSummary.absent}</p>
                                        </div>
                                        <div className="p-4 bg-white border border-gray-100 rounded-xl text-center group-hover:border-blue-100 transition-colors">
                                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Total</p>
                                          <p className="text-xl font-bold text-blue-600">{cls.attendanceSummary.total}</p>
                                        </div>
                                      </div>
                                      
                                      {cls.studentAttendance.length > 0 && (
                                        <div className="space-y-2 mt-4 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Student Records</p>
                                          {cls.studentAttendance.map((student: AttendanceRecord) => (
                                            <div key={student.student_id} className="flex items-center justify-between p-3 bg-gray-50/50 rounded-lg hover:bg-gray-50 transition-colors">
                                              <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                                  <span className="text-[10px] font-bold text-black uppercase">
                                                    {student.student_name.substring(0, 2)}
                                                  </span>
                                                </div>
                                                <span className="text-xs font-bold text-gray-700">{student.student_name}</span>
                                              </div>
                                              <span className={`text-[10px] font-black uppercase ${
                                                student.status === 'present' ? 'text-green-600' : 'text-red-600'
                                              }`}>
                                                {student.status}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="bg-orange-50/30 border border-orange-100 rounded-xl p-4 flex gap-3">
                                      <svg className="w-5 h-5 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <div>
                                        <p className="text-xs font-bold text-orange-800 mb-1">No Records Available</p>
                                        <p className="text-[10px] text-orange-700 font-medium">Detailed student attendance is only recorded when the peer tutor is present for the session.</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                      )
                    })
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No department found</h3>
            <p className="mt-1 text-sm text-gray-500">Please ensure you are assigned to a department to view attendance data.</p>
          </div>
        )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

