'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
import ClassDetailsModal from '@/components/features/classes/ClassDetailsModal'
import AdditionalClassesTab from '@/components/features/classes/AdditionalClassesTab'
import { useAuth } from '@/lib/auth/AuthContext'
import { Class } from '@/lib/services/classService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { peertutors } from '@/lib/services/peerTutorService'
import { ReportService, ClassAttendanceReport } from '@/lib/services/reportService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import { FacultyService } from '@/lib/services/facultyService'
import { useCachedData } from '@/lib/hooks/useCachedData'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import FilterDropdown from '@/components/ui/FilterDropdown'
import ExportButton from '@/components/ui/ExportButton'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { 
  Clock, 
  Calendar, 
  Search, 
  Lock,
  ChevronDown,
  User,

} from 'lucide-react'
import * as XLSX from 'xlsx'
import { logger } from '@/lib/logger'
import { formatTimeTo12Hour } from '@/lib/utils/formatters'



export default function PeerClassesPage() {
  return (
    <PeerProtectedRoute>
      <PeerClassesContent />
    </PeerProtectedRoute>
  )
}

interface ClassWithStatus extends Class {
  completionStatus?: 'completed' | 'pending' | 'not_started' | 'upcoming' | 'today'
  isEditable: boolean
  scheduled_date?: string
  scheduled_class_id?: string
  class_id?: string
}

function PeerClassesContent() {
  const { user } = useAuth()
  const router = useRouter()

  const [peertutorsInfo, setpeertutorsInfo] = useState<peertutors | null>(null)
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'scheduled' | 'additional'>('scheduled')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [loadingClassDetails, setLoadingClassDetails] = useState<Set<string>>(new Set())
  const [classDetails, setClassDetails] = useState<Map<string, { 
    topics: string, 
    attendance: ClassAttendanceReport['attendance_records'],
    link?: string,
    start_time?: string,
    end_time?: string
  }>>(new Map())
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('')
  const [subTab, setSubTab] = useState<'upcoming' | 'pending' | 'completed'>('upcoming')
  const [filterSubject, setFilterSubject] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Use custom hook for sidebar collapsed state
  const [isSidebarCollapsed] = useSidebarCollapsed()

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

  // Fetch assigned students
  const { data: assignedStudents, isLoading: studentsLoading, refresh: refreshStudents } = useCachedData({
    queryKey: ['assigned-students', tutorInfoData?.id],
    queryFn: async () => {
       if (!tutorInfoData?.id) return []
       return await AssignmentService.getStudentsBypeertutors(tutorInfoData.id)
    },
    enabled: !!tutorInfoData?.id,
    initialData: [],
    staleTime: 5 * 60 * 1000,
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

  // Fetch additional classes with caching
  const { data: additionalClassesData, isLoading: additionalLoading, refresh: refreshAdditional } = useCachedData({
    queryKey: ['additional-classes-stats', tutorInfoData?.id],
    queryFn: async () => {
      if (!tutorInfoData?.id) return []
      return await AdditionalClassService.getAdditionalClassesBypeertutors(tutorInfoData.id)
    },
    enabled: !!tutorInfoData?.id,
    initialData: [],
    staleTime: 5 * 60 * 1000,
  })

  // Fetch all departments to find the right incharge info
  const { data: allDepts } = useCachedData({
    queryKey: ['all-departments'],
    queryFn: async () => await FacultyService.getAllDepartments(),
    initialData: [],
    staleTime: 10 * 60 * 1000,
  })

  // Match the department info locally for better reliability
  const deptInfo = useMemo(() => {
    if (!tutorInfoData || !allDepts?.length) return null
    
    // 1. Try to match by faculty_id (if it points to a department id)
    if (tutorInfoData.faculty_id) {
      const match = allDepts.find(d => d.id === tutorInfoData.faculty_id)
      if (match) return match
    }
    
    // 2. Fallback: match by department name (normalized)
    if (tutorInfoData.dept) {
      const normalizedTutorDept = tutorInfoData.dept.trim().toLowerCase()
      const match = allDepts.find(d => 
        d.name.trim().toLowerCase() === normalizedTutorDept ||
        normalizedTutorDept.includes(d.name.trim().toLowerCase()) ||
        d.name.trim().toLowerCase().includes(normalizedTutorDept)
      )
      if (match) return match
    }
    
    return null
  }, [tutorInfoData, allDepts])

  const loading = tutorLoading || scheduledLoading || studentsLoading || additionalLoading

  // Process scheduled classes data using useMemo to prevent infinite loops
  const classes = useMemo(() => {
    const classesToProcess = scheduledClassesData ? [...scheduledClassesData] : []

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const classesWithStatus = classesToProcess.map((scheduledClass) => {
      const completion = scheduledClass.completion_status || 'not_started'
      const scheduledDate = new Date(scheduledClass.scheduled_date)
      scheduledDate.setHours(0, 0, 0, 0)
      
      const isEditable = scheduledDate.getTime() === today.getTime()
      const isFuture = scheduledDate.getTime() > today.getTime()
      const isPast = scheduledDate.getTime() < today.getTime()
      
      let completionStatus: 'completed' | 'pending' | 'not_started' | 'upcoming' | 'today' = 'not_started'
      
      if (completion === 'completed') {
        completionStatus = 'completed'
      } else if (isFuture) {
        completionStatus = 'upcoming'
      } else if (isPast) {
        completionStatus = 'pending'
      } else if (isEditable) {
        completionStatus = 'today'
      }
      
      return {
        id: scheduledClass.class_id, // Use the base class_id as the main id
        class_id: scheduledClass.class_id, // Also include for clarity
        subject_name: scheduledClass.class.subject_name,
        dept: scheduledClass.dept,
        year: scheduledClass.year,
        section: scheduledClass.section,
        faculty_id: scheduledClass.faculty_id,
        created_at: scheduledClass.class.created_at,
        scheduled_class_id: scheduledClass.id, // The scheduled class id
        class_date: scheduledClass.scheduled_date, // Add this for modal compatibility
        scheduled_date: scheduledClass.scheduled_date,
        completionStatus,
        isEditable
      } as ClassWithStatus & { scheduled_date: string, scheduled_class_id: string, class_date: string }
    })
    
    classesWithStatus.sort((a, b) => 
      new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
    )
    
    return classesWithStatus
  }, [scheduledClassesData])



  // Set peer tutor info when data is available
  useEffect(() => {
    if (tutorInfoData) {
      setpeertutorsInfo(tutorInfoData)
    }
  }, [tutorInfoData])

  // Filter classes
  const filteredClasses = useMemo(() => {
    let filtered = classes

    // Apply sub-tab filter
    filtered = filtered.filter(item => {
      if (subTab === 'upcoming') {
        // Show today's uncompleted classes AND actual future classes in UPCOMING tab
        return item.completionStatus === 'upcoming' || item.completionStatus === 'today' || (item.isEditable && item.completionStatus !== 'completed');
      }
      return item.completionStatus === subTab;
    });

    // Apply date range filters
    if (fromDate) {
      filtered = filtered.filter(item => new Date(item.scheduled_date) >= new Date(fromDate))
    }
    if (toDate) {
      const end = new Date(toDate)
      end.setHours(23, 59, 59, 999) // include the end date
      filtered = filtered.filter(item => new Date(item.scheduled_date) <= end)
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(classItem =>
        classItem.subject_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classItem.dept.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classItem.year.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classItem.section.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Apply subject filter
    if (filterSubject) filtered = filtered.filter(classItem => classItem.subject_name === filterSubject)

    return filtered
  }, [classes, searchTerm, subTab, filterSubject, fromDate, toDate])

  // Get unique values for filter dropdowns
  const getUniqueSubjects = () => [...new Set(classes.map(c => c.subject_name))].sort().map(s => ({ label: s, value: s }))

  const handleClassClick = (classItem: ClassWithStatus) => {
    if (!classItem.isEditable) {
      const scheduledDate = new Date(classItem.scheduled_date || '').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      })
      toast.warning(`You can only manage this class on ${scheduledDate}. Today is not the scheduled day.`)
      return
    }
    
    setSelectedClass(classItem)
    setIsModalOpen(true)
  }

  const handleSubjectClick = (classItem: ClassWithStatus) => {
    if (!peertutorsInfo?.id) {
      toast.error('Unable to load subject details')
      return
    }

    // Navigate to reports subject page with required params
    const params = new URLSearchParams({
      tutorId: peertutorsInfo.id,
      subjectId: classItem.class_id || '',
      subjectName: classItem.subject_name
    })
    
    router.push(`/peer/reports/subject?${params.toString()}`)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedClass(null)
    refreshScheduled()
  }

  const handleRefresh = async () => {
    await Promise.all([refreshTutor(), refreshScheduled(), refreshStudents(), refreshAdditional()])
    setLastRefresh(new Date())
  }
  
  const handleExportData = () => {
     if (filteredClasses.length === 0) {
        toast.warning('No data to export. Please adjust your filters.')
        return
     }
     
     const filtersApplied = !!(searchTerm || filterSubject || fromDate || toDate)
     
     const metadata = [
       ['PEER TUTOR CLASS REPORT'],
       ['Export Date:', new Date().toLocaleDateString(), 'Export Time:', new Date().toLocaleTimeString()],
       ['Dept:', tutorInfoData?.dept || 'N/A', 'Year:', tutorInfoData?.year || 'N/A', 'Section:', tutorInfoData?.section || 'N/A'],
       ['Filter Applied:', filtersApplied ? 'YES' : 'NO', 'Filters:', [
         searchTerm ? `Search: ${searchTerm}` : '',
         filterSubject ? `Subject: ${filterSubject}` : '',
         fromDate ? `From: ${fromDate}` : '',
         toDate ? `To: ${toDate}` : ''
       ].filter(Boolean).join(', ') || 'None'],
       ['Incharge:', deptInfo?.faculty_name || 'N/A', 'Tutor:', tutorInfoData?.name || 'N/A', 'Assigned Students:', (assignedStudents || []).length],
       [''],
       ['SUBJECT', 'DATE', 'DEPARTMENT', 'YEAR', 'SECTION', 'STATUS']
     ]
     
     const exportData = filteredClasses.map(c => [
        c.subject_name,
        c.scheduled_date,
        c.dept, 
        c.year,
        c.section,
        c.completionStatus || 'N/A'
     ])
     
     try {
       const ws = XLSX.utils.aoa_to_sheet([...metadata, ...exportData])
       
       // Fix column widths
       ws['!cols'] = [
         { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 15 }
       ]

       const wb = XLSX.utils.book_new()
       XLSX.utils.book_append_sheet(wb, ws, subTab.toUpperCase())
       XLSX.writeFile(wb, `${subTab.toUpperCase()}_Classes_Export_${new Date().toISOString().split('T')[0]}.xlsx`)
       toast.success(`Successfully exported ${subTab} classes`)
     } catch {
       toast.error('Error exporting to Excel. Please try again.')
     }
  }

  const handleExportAllData = () => {
    if (classes.length === 0) {
       toast.warning('No data available to export.')
       return
    }
    
    try {
      const wb = XLSX.utils.book_new()
      
      const upcoming = classes.filter(c => c.completionStatus === 'upcoming' || (c.isEditable && c.completionStatus !== 'completed'))
      const pending = classes.filter(c => c.completionStatus === 'pending')
      const completed = classes.filter(c => c.completionStatus === 'completed')

      const createSheetData = (data: ClassWithStatus[], title: string) => {
        const metadata = [
          [`PEER TUTOR ${title.toUpperCase()} REPORT`],
          ['Export Date:', new Date().toLocaleDateString(), 'Export Time:', new Date().toLocaleTimeString()],
          ['Dept:', tutorInfoData?.dept || 'N/A', 'Year:', tutorInfoData?.year || 'N/A', 'Section:', tutorInfoData?.section || 'N/A'],
          ['Filter Applied:', 'NO', 'Filters:', 'None'],
          ['Incharge:', deptInfo?.faculty_name || 'N/A', 'Tutor:', tutorInfoData?.name || 'N/A', 'Assigned Students:', (assignedStudents || []).length],
          [''],
          ['SUBJECT', 'DATE', 'DEPARTMENT', 'YEAR', 'SECTION', 'STATUS']
        ]
        
        const rows = data.map(c => [
           c.subject_name,
           c.scheduled_date,
           c.dept, 
           c.year,
           c.section,
           c.completionStatus || 'N/A'
        ])
        
        const ws = XLSX.utils.aoa_to_sheet([...metadata, ...rows])
        ws['!cols'] = [
          { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 15 }
        ]
        return ws
      }

      if (upcoming.length > 0) XLSX.utils.book_append_sheet(wb, createSheetData(upcoming, "Upcoming"), "Upcoming")
      if (pending.length > 0) XLSX.utils.book_append_sheet(wb, createSheetData(pending, "Pending"), "Pending")
      if (completed.length > 0) XLSX.utils.book_append_sheet(wb, createSheetData(completed, "Completed"), "Completed")

      XLSX.writeFile(wb, `All_Classes_Export_${new Date().toISOString().split('T')[0]}.xlsx`)
      toast.success('Successfully exported all classes')
    } catch {
      toast.error('Error exporting all data to Excel.')
    }
  }

  const handleExportSingleAttendance = async (classItem: ClassWithStatus) => {
    try {
      if (!tutorInfoData || !classItem.scheduled_class_id) return
      
      const report = await ReportService.getClassAttendanceReport(classItem.scheduled_class_id)
      if (!report) {
         toast.error("Failed to fetch class attendance report.")
         return
      }
      
      const file = await ReportService.generateSingleAttendanceSheet(report, classItem, tutorInfoData.dept || 'UNKNOWN')
      const url = URL.createObjectURL(file)
      
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast.success('Attendance Sheet exported successfully!')
    } catch (error) {
      logger.error('Error exporting attendance sheet:', error)
      toast.error('Failed to export Attendance Sheet.')
    }
  }

  const handleExportSingleTopic = async (classItem: ClassWithStatus) => {
    try {
      if (!tutorInfoData || !classItem.scheduled_class_id) return
      
      const report = await ReportService.getClassAttendanceReport(classItem.scheduled_class_id)
      if (!report) {
         toast.error("Failed to fetch class topic report.")
         return
      }
      
      const file = await ReportService.generateSingleTopicSheet(report, classItem, tutorInfoData.dept || 'UNKNOWN')
      const url = URL.createObjectURL(file)
      
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast.success('Topic Sheet exported successfully!')
    } catch (error) {
      logger.error('Error exporting topic sheet:', error)
      toast.error('Failed to export Topic Sheet.')
    }
  }

  const loadClassDetails = async (classItem: ClassWithStatus) => {
    if (!classItem.scheduled_class_id || classItem.completionStatus !== 'completed') return

    setLoadingClassDetails(prev => new Set(prev).add(classItem.scheduled_class_id!))
    
    try {
      const report = await ReportService.getClassAttendanceReport(classItem.scheduled_class_id)
      
      if (report) {
        setClassDetails(prev => new Map(prev).set(classItem.scheduled_class_id!, {
          topics: report.topics || '',
          attendance: report.attendance_records || [],
          link: report.link,
          start_time: report.start_time,
          end_time: report.end_time
        }))
      } else {
        toast.error('No data to export')
      }
    } catch (error) {
      logger.error('Error loading class details:', error)
      toast.error('An error occurred while saving marks')
    } finally {
      setLoadingClassDetails(prev => {
        const newSet = new Set(prev)
        newSet.delete(classItem.scheduled_class_id!)
        return newSet
      })
    }
  }

  const toggleRowExpansion = (classId: string, classItem: ClassWithStatus) => {
    if (classItem.completionStatus !== 'completed') return
    
    const newExpandedRows = new Set(expandedRows)
    
    if (expandedRows.has(classId)) {
      newExpandedRows.delete(classId)
    } else {
      newExpandedRows.add(classId)
      if (!classDetails.has(classId)) {
        loadClassDetails(classItem)
      }
    }
    
    setExpandedRows(newExpandedRows)
  }

  const stats = useMemo(() => {
    const completed = classes.filter(c => c.completionStatus === 'completed').length
    const pending = classes.filter(c => c.completionStatus === 'pending').length
    const total = classes.length
    return { completed, pending, total }
  }, [classes])

  // Logic to determining visibility
  const hasHistory = useMemo(() => {
     return classes.some(c => c.completionStatus === 'completed')
  }, [classes])

  const shouldShowClasses = (assignedStudents && assignedStudents.length > 0) || hasHistory

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden w-full lg:w-auto`}>
        <PageHeader
          title={activeTab === 'scheduled' ? "My Classes" : "Additional Classes"}
          subtitle="Manage your scheduled sessions and attendance"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isScheduledRefreshing}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <div className="px-4 sm:px-6 lg:px-8 mt-4 sm:mt-6">
          <div className="bg-white rounded-lg sm:rounded-xl border border-gray-100 shadow-sm">
            <nav className="flex space-x-2 p-2 overflow-x-auto no-scrollbar" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('scheduled')}
                className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                  activeTab === 'scheduled'
                    ? 'bg-black text-white shadow-lg shadow-gray-200 scale-105'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                SCHEDULED
              </button>
              <button
                onClick={() => setActiveTab('additional')}
                className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                  activeTab === 'additional'
                    ? 'bg-black text-white shadow-lg shadow-gray-200 scale-105'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                ADDITIONAL
              </button>
            </nav>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-[1600px] mx-auto space-y-8">
            {loading && (
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading</span>
                </div>
              </div>
            )}

            {!loading && activeTab === 'scheduled' && (
              <div>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {/* Total Subjects */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Total Subjects
                        </div>
                        <div className="p-2 border border-gray-100 rounded-lg">
                          <svg className="w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 30 30" fill="currentColor">
                            <path d="M 5 4 C 3.895 4 3 4.895 3 6 L 3 9 L 3 25 A 1.0001 1.0001 0 0 0 4 26 L 26 26 A 1.0001 1.0001 0 0 0 27 25 L 27 8 L 27 6 C 27 4.895 26.105 4 25 4 L 5 4 z M 5 9 L 25 9 L 25 24 L 5 24 L 5 9 z M 9 11 A 1.0001 1.0001 0 1 0 9 13 L 9 15 A 1.0001 1.0001 0 1 0 11 15 L 11 12 A 1.0001 1.0001 0 0 0 10 11 L 9 11 z M 15 11 C 13.895 11 13 11.895 13 13 L 13 14 C 13 15.105 13.895 16 15 16 C 16.105 16 17 15.105 17 14 L 17 13 C 17 11.895 16.105 11 15 11 z M 20 11 A 1.0001 1.0001 0 1 0 20 13 L 20 15 A 1.0001 1.0001 0 1 0 22 15 L 22 12 A 1.0001 1.0001 0 0 0 21 11 L 20 11 z M 10 17 C 8.895 17 8 17.895 8 19 L 8 20 C 8 21.105 8.895 22 10 22 C 11.105 22 12 21.105 12 20 L 12 19 C 12 17.895 11.105 17 10 17 z M 15 17 A 1.0001 1.0001 0 1 0 15 19 L 15 21 A 1.0001 1.0001 0 1 0 17 21 L 17 18 A 1.0001 1.0001 0 0 0 16 17 L 15 17 z M 20 17 A 1.0001 1.0001 0 1 0 20 19 L 20 21 A 1.0001 1.0001 0 1 0 22 21 L 22 18 A 1.0001 1.0001 0 0 0 21 17 L 20 17 z"></path>
                          </svg>
                        </div>
                      </div>
                      <div className="text-3xl font-bold text-gray-900 mb-2">
                        {stats.total}
                      </div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">ASSIGNED</span>
                    </div>
                  </div>

                  {/* Completed Classes */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Completed Classes
                        </div>
                        <div className="p-2 border border-gray-100 rounded-lg">
                          <svg className="w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 30 30" fill="currentColor">
                            <path d="M 5 4 C 3.895 4 3 4.895 3 6 L 3 9 L 3 25 A 1.0001 1.0001 0 0 0 4 26 L 26 26 A 1.0001 1.0001 0 0 0 27 25 L 27 8 L 27 6 C 27 4.895 26.105 4 25 4 L 5 4 z M 5 9 L 25 9 L 25 24 L 5 24 L 5 9 z M 9 11 A 1.0001 1.0001 0 1 0 9 13 L 9 15 A 1.0001 1.0001 0 1 0 11 15 L 11 12 A 1.0001 1.0001 0 0 0 10 11 L 9 11 z M 15 11 C 13.895 11 13 11.895 13 13 L 13 14 C 13 15.105 13.895 16 15 16 C 16.105 16 17 15.105 17 14 L 17 13 C 17 11.895 16.105 11 15 11 z M 20 11 A 1.0001 1.0001 0 1 0 20 13 L 20 15 A 1.0001 1.0001 0 1 0 22 15 L 22 12 A 1.0001 1.0001 0 0 0 21 11 L 20 11 z M 10 17 C 8.895 17 8 17.895 8 19 L 8 20 C 8 21.105 8.895 22 10 22 C 11.105 22 12 21.105 12 20 L 12 19 C 12 17.895 11.105 17 10 17 z M 15 17 A 1.0001 1.0001 0 1 0 15 19 L 15 21 A 1.0001 1.0001 0 1 0 17 21 L 17 18 A 1.0001 1.0001 0 0 0 16 17 L 15 17 z M 20 17 A 1.0001 1.0001 0 1 0 20 19 L 20 21 A 1.0001 1.0001 0 1 0 22 21 L 22 18 A 1.0001 1.0001 0 0 0 21 17 L 20 17 z"></path>
                          </svg>
                        </div>
                      </div>
                      <div className="text-3xl font-bold text-gray-900 mb-2">
                        {stats.completed}
                      </div>
                      <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">FINISHED</span>
                    </div>
                  </div>

                  {/* Additional Classes */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Additional Classes
                        </div>
                        <div className="p-2 border border-gray-100 rounded-lg">
                          <svg className="w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 30 30" fill="currentColor">
                            <path d="M 5 4 C 3.895 4 3 4.895 3 6 L 3 9 L 3 25 A 1.0001 1.0001 0 0 0 4 26 L 26 26 A 1.0001 1.0001 0 0 0 27 25 L 27 8 L 27 6 C 27 4.895 26.105 4 25 4 L 5 4 z M 5 9 L 25 9 L 25 24 L 5 24 L 5 9 z M 9 11 A 1.0001 1.0001 0 1 0 9 13 L 9 15 A 1.0001 1.0001 0 1 0 11 15 L 11 12 A 1.0001 1.0001 0 0 0 10 11 L 9 11 z M 15 11 C 13.895 11 13 11.895 13 13 L 13 14 C 13 15.105 13.895 16 15 16 C 16.105 16 17 15.105 17 14 L 17 13 C 17 11.895 16.105 11 15 11 z M 20 11 A 1.0001 1.0001 0 1 0 20 13 L 20 15 A 1.0001 1.0001 0 1 0 22 15 L 22 12 A 1.0001 1.0001 0 0 0 21 11 L 20 11 z M 10 17 C 8.895 17 8 17.895 8 19 L 8 20 C 8 21.105 8.895 22 10 22 C 11.105 22 12 21.105 12 20 L 12 19 C 12 17.895 11.105 17 10 17 z M 15 17 A 1.0001 1.0001 0 1 0 15 19 L 15 21 A 1.0001 1.0001 0 1 0 17 21 L 17 18 A 1.0001 1.0001 0 0 0 16 17 L 15 17 z M 20 17 A 1.0001 1.0001 0 1 0 20 19 L 20 21 A 1.0001 1.0001 0 1 0 22 21 L 22 18 A 1.0001 1.0001 0 0 0 21 17 L 20 17 z"></path>
                          </svg>
                        </div>
                      </div>
                      <div className="text-3xl font-bold text-gray-900 mb-2">
                        {additionalClassesData?.length || 0}
                      </div>
                      <span className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">EXTRA</span>
                    </div>
                  </div>

                  {/* Pending Classes */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Pending Classes
                        </div>
                        <div className="p-2 border border-gray-100 rounded-lg">
                          <svg className="w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 30 30" fill="currentColor">
                            <path d="M15,3C8.373,3,3,8.373,3,15c0,6.627,5.373,12,12,12s12-5.373,12-12C27,8.373,21.627,3,15,3z M16,16H7.995 C7.445,16,7,15.555,7,15.005v-0.011C7,14.445,7.445,14,7.995,14H14V5.995C14,5.445,14.445,5,14.995,5h0.011 C15.555,5,16,5.445,16,5.995V16z"></path>
                          </svg>
                        </div>
                      </div>
                      <div className="text-3xl font-bold text-gray-900 mb-2">
                        {stats.pending}
                      </div>
                      <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">REMAINING</span>
                    </div>
                  </div>
                </div>

                {/* Filters & Table Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex flex-col space-y-4">
                      {/* Sub-navbar & Export All */}
                      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-gray-100 pb-4">
                        <nav className="flex space-x-1 p-1 bg-gray-100/50 rounded-xl" aria-label="Status Tabs">
                           {[
                             { 
                               id: 'upcoming', 
                               label: 'UPCOMING', 
                               count: classes.filter(c => c.completionStatus === 'upcoming' || c.completionStatus === 'today' || (c.isEditable && c.completionStatus !== 'completed')).length 
                             },
                             { 
                               id: 'pending', 
                               label: 'PENDING', 
                               count: classes.filter(c => c.completionStatus === 'pending').length 
                             },
                             { 
                               id: 'completed', 
                               label: 'COMPLETED', 
                               count: classes.filter(c => c.completionStatus === 'completed').length 
                             }
                           ].map((tab) => (
                             <button
                               key={tab.id}
                               onClick={() => setSubTab(tab.id as 'upcoming' | 'pending' | 'completed')}
                               className={`px-3 py-2 rounded-lg text-[10px] font-bold transition-all duration-200 uppercase tracking-widest flex items-center gap-2 ${
                                 subTab === tab.id
                                   ? 'bg-black text-white shadow-md'
                                   : 'text-gray-500 hover:text-gray-900 hover:bg-white'
                               }`}
                             >
                               {tab.label}
                               <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black ${
                                 subTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
                               }`}>
                                 {tab.count}
                               </span>
                             </button>
                           ))}
                        </nav>
                        
                        <div className="flex items-center gap-3">
                          <ExportButton 
                            text="Export All" 
                            onClick={handleExportAllData} 
                            disabled={classes.length === 0}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center pt-2">
                        <div className="relative w-full lg:max-w-xs">
                           <input
                             type="text"
                             value={searchTerm}
                             onChange={(e) => setSearchTerm(e.target.value)}
                             placeholder="Search..."
                             className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 focus:border-blue-400 rounded-xl text-xs transition-all outline-none shadow-sm"
                           />
                           <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                        </div>
                        
                        <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                           {/* Date range filters */}
                           <div className="flex flex-row items-center gap-2 w-full sm:w-auto bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
                             <Calendar className="w-3.5 h-3.5 text-gray-400" />
                             <input
                               type="date"
                               value={fromDate}
                               onChange={(e) => setFromDate(e.target.value)}
                               className="text-[10px] font-bold text-gray-600 focus:outline-none bg-transparent uppercase tracking-tighter"
                               placeholder="From"
                             />
                             <span className="text-gray-300 mx-1">|</span>
                             <input
                               type="date"
                               value={toDate}
                               onChange={(e) => setToDate(e.target.value)}
                               className="text-[10px] font-bold text-gray-600 focus:outline-none bg-transparent uppercase tracking-tighter"
                               placeholder="To"
                             />
                           </div>

                           <div className="w-full sm:w-auto sm:min-w-[140px]">
                             <FilterDropdown
                                value={filterSubject}
                                onChange={setFilterSubject}
                                options={getUniqueSubjects()}
                                placeholder="Subject"
                             />
                           </div>
                           
                           <div className="w-full sm:w-auto flex flex-row gap-2">
                             <div className="flex-1 sm:flex-none">
                               <ExportButton onClick={handleExportData} disabled={filteredClasses.length === 0} />
                             </div>
                             
                             {(filterSubject || searchTerm || fromDate || toDate) && (
                                <button 
                                  onClick={() => {
                                     setFilterSubject('')
                                     setSearchTerm('')
                                     setFromDate('')
                                     setToDate('')
                                  }}
                                  className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 rounded-xl transition-colors uppercase tracking-wider"
                                >
                                   Clear
                                </button>
                             )}
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Card View */}
                  <div className="block md:hidden space-y-3 px-4">
                    {filteredClasses.length > 0 ? (
                      filteredClasses.map((classItem) => (
                        <div key={classItem.scheduled_class_id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                          {/* Card Header */}
                          <div className="p-4 border-b border-gray-100">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-bold text-gray-900 uppercase mb-1 leading-tight flex items-center gap-2">
                                  {classItem.subject_name}
                                  {classItem.isEditable && (
                                    <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[8px] font-black tracking-widest animate-pulse">TODAY</span>
                                  )}
                                </h3>
                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                  <span className="font-semibold">{classItem.dept}</span>
                                  <span>•</span>
                                  <span>{classItem.year}-{classItem.section}</span>
                                </div>
                              </div>
                              <StatusBadge status={classItem.completionStatus || 'not_started'} />
                            </div>
                            
                            {/* Date */}
                            <div className="flex items-center gap-2 text-xs">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              <span className="font-bold uppercase text-gray-900">
                                {new Date(classItem.scheduled_date || '').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                              <span className="text-[10px] text-gray-400 font-medium uppercase">
                                ({new Date(classItem.scheduled_date || '').toLocaleDateString('en-US', { weekday: 'short' })})
                              </span>
                            </div>
                          </div>

                          {/* Card Actions */}
                          <div className="p-3 bg-gray-50/50 flex items-center gap-2">
                            {classItem.isEditable ? (
                              <button
                                onClick={() => handleClassClick(classItem)}
                                className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider shadow-sm transition-all"
                              >
                                Manage Class
                              </button>
                            ) : (
                              <button
                                disabled
                                className="flex-1 px-4 py-2.5 rounded-lg bg-gray-100 text-gray-400 text-xs font-bold uppercase tracking-wider cursor-not-allowed flex items-center justify-center gap-2"
                              >
                                <Lock size={14} />
                                Locked
                              </button>
                            )}
                            
                            {classItem.completionStatus === 'completed' && (
                              <button
                                onClick={() => toggleRowExpansion(classItem.scheduled_class_id, classItem)}
                                className={`px-3 py-2.5 rounded-lg border transition-colors ${
                                  expandedRows.has(classItem.scheduled_class_id) 
                                    ? 'bg-blue-50 border-blue-200 text-blue-600' 
                                    : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                                }`}
                              >  
                                {loadingClassDetails.has(classItem.scheduled_class_id) ? (
                                  <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                ) : (
                                  <ChevronDown size={18} className={`transition-transform duration-200 ${expandedRows.has(classItem.scheduled_class_id) ? 'rotate-180' : ''}`} />
                                )}
                              </button>
                            )}
                          </div>

                           {/* Expanded Details */}
                          {expandedRows.has(classItem.scheduled_class_id) && (
                            <div className="mt-4 bg-gray-50 rounded-xl border border-gray-200 p-4">
                               {/* Mobile Class Details Actions */}
                               <div className="flex flex-col gap-2 mb-4">
                                 <button onClick={(e) => { e.stopPropagation(); handleExportSingleTopic(classItem); }} className="w-full py-2 bg-white hover:bg-gray-100 text-gray-700 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors border border-gray-200 shadow-sm flex items-center justify-center gap-2">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Topic Sheet
                                 </button>
                                 <button onClick={(e) => { e.stopPropagation(); handleExportSingleAttendance(classItem); }} className="w-full py-2 bg-white hover:bg-gray-100 text-gray-700 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors border border-gray-200 shadow-sm flex items-center justify-center gap-2">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Attendance Sheet
                                 </button>
                               </div>

                               {/* Mobile Class Details */}
                               <div className="mb-6 space-y-4">
                                  <div>
                                     <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-widest mb-2">Topic</h4>
                                     <p className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-100">{classDetails.get(classItem.scheduled_class_id)?.topics}</p>
                                  </div>
                                  <div className="grid grid-cols-1 gap-4">
                                     {(classDetails.get(classItem.scheduled_class_id)?.start_time || classDetails.get(classItem.scheduled_class_id)?.end_time) && (
                                        <div>
                                           <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-widest mb-2">Time</h4>
                                           <p className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-100 inline-block">
                                              {formatTimeTo12Hour(classDetails.get(classItem.scheduled_class_id)?.start_time)} - {formatTimeTo12Hour(classDetails.get(classItem.scheduled_class_id)?.end_time)}
                                           </p>
                                        </div>
                                     )}
                                     <div>
                                        <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-widest mb-2">Link</h4>
                                        {classDetails.get(classItem.scheduled_class_id)?.link ? (
                                           <a href={classDetails.get(classItem.scheduled_class_id)?.link} target="_blank" rel="noopener noreferrer" className="text-xs text-black border-gray-100 bg-white hover:underline p-2 rounded  break-all block">
                                              {classDetails.get(classItem.scheduled_class_id)?.link}
                                           </a>
                                        ) : (
                                           <p className="text-xs text-gray-400 italic bg-white p-2 rounded border border-gray-100 inline-block">
                                              No link provided
                                           </p>
                                        )}
                                     </div>
                                  </div>
                               </div>

                               <div className="flex items-center gap-2 mb-3 pt-4 border-t border-gray-200">
                                  <User size={14} className="text-gray-400" />
                                  <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-widest">Student Attendance</h4>
                               </div>
                               
                               {classDetails.get(classItem.scheduled_class_id)?.attendance && classDetails.get(classItem.scheduled_class_id)!.attendance.length > 0 ? (
                                  <div className="space-y-2">
                                     {classDetails.get(classItem.scheduled_class_id)!.attendance.map((record, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 bg-white">
                                           <div className="overflow-hidden flex-1 min-w-0 mr-2">
                                              <p className="text-xs font-bold text-gray-900 truncate">{String(record.student_name || record.student_id || '')}</p>
                                              {record.student_email && <p className="text-[10px] text-gray-400 truncate">{String(record.student_email)}</p>}
                                           </div>
                                           <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded flex-shrink-0 ${
                                              record.status === 'present' 
                                                 ? 'bg-green-600 text-white'
                                                 : 'bg-red-600 text-white'
                                           }`}>
                                              {String(record.status)}
                                           </span>
                                        </div>
                                     ))}
                                  </div>
                               ) : (
                                  <p className="text-xs text-gray-400 italic">No attendance records found.</p>
                               )}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                        {!shouldShowClasses ? (
                          <div className="flex flex-col items-center justify-center">
                            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                              <Image src="/icons/search.png" alt="No Students" width={40} height={40} className="opacity-40" />
                            </div>
                            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-2">
                              No Students Assigned
                            </h3>
                            <p className="text-xs text-gray-500 max-w-md font-medium">
                              You currently don&apos;t have any students assigned to you. Once students are allocated, your class schedule will appear here.
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center">
                            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                              <Search className="w-5 h-5 text-gray-300" />
                            </div>
                            <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">No classes found</p>
                            <p className="text-[10px] text-gray-400 mt-1">Try adjusting your filters or search terms</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto sm:rounded-xl sm:border sm:border-gray-100">
                    <div className="min-w-full inline-block align-middle">
                      <div className="overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                              <TableHead className="py-3 sm:py-4 pl-4 sm:pl-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Subject</TableHead>
                              <TableHead className="py-3 sm:py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</TableHead>
                              <TableHead className="py-3 sm:py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Department</TableHead>
                              <TableHead className="hidden lg:table-cell py-3 sm:py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Class</TableHead>
                              <TableHead className="py-3 sm:py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</TableHead>
                              <TableHead className="py-3 sm:py-4 pr-4 sm:pr-6 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredClasses.length > 0 ? (
                              filteredClasses.map((classItem) => (
                                 <React.Fragment key={classItem.scheduled_class_id}>
                                 <TableRow 
                                   onClick={() => handleSubjectClick(classItem)}
                                   className="group hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0 cursor-pointer"
                                 >
                                    <TableCell className="py-3 sm:py-4 pl-4 sm:pl-6">
                                       <div className="flex items-center gap-2">
                                          <p className="text-xs font-bold text-gray-900 uppercase leading-tight hover:underline">{classItem.subject_name}</p>
                                       </div>
                                    </TableCell>
                                    <TableCell className="py-3 sm:py-4 text-center">
                                       <p className="text-xs font-bold uppercase text-gray-900">
                                          {new Date(classItem.scheduled_date || '').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} /                                           {new Date(classItem.scheduled_date || '').toLocaleDateString('en-US', { weekday: 'short' })}
                                       </p>
                                    </TableCell>
                                    <TableCell className="py-3 sm:py-4 text-center">
                                       <span className="px-2 py-1 rounded-md bg-gray-50 text-[10px] font-bold text-gray-600 uppercase tracking-wider border border-gray-100">
                                          {classItem.dept}
                                       </span>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell py-3 sm:py-4 text-center">
                                       <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                          {classItem.year} - {classItem.section}
                                       </span>
                                    </TableCell>
                                    <TableCell className="py-3 sm:py-4 text-center">
                                       <StatusBadge status={classItem.completionStatus || 'not_started'} />
                                    </TableCell>
                                    <TableCell className="py-3 sm:py-4 pr-4 sm:pr-6 text-right">
                                       <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                                          {classItem.isEditable ? (
                                             <button
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleClassClick(classItem)
                                                }}
                                                className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shadow-sm transition-all"
                                             >
                                                Manage
                                             </button>
                                          ) : (
                                             <button
                                                disabled
                                                onClick={(e) => e.stopPropagation()}
                                                className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-gray-50 text-gray-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider cursor-not-allowed flex items-center gap-1 ml-auto border border-gray-100"
                                             >
                                                <Lock size={10} /> <span className="hidden xs:inline">Locked</span>
                                             </button>
                                          )}
                                          
                                          {classItem.completionStatus === 'completed' && (
                                             <button
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  toggleRowExpansion(classItem.scheduled_class_id, classItem)
                                                }}
                                                className={`p-1.5 rounded-lg border transition-colors ${
                                                   expandedRows.has(classItem.scheduled_class_id) 
                                                      ? 'bg-blue-50 border-blue-200 text-blue-600' 
                                                      : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                                                }`}
                                             >  
                                                {loadingClassDetails.has(classItem.scheduled_class_id) ? (
                                                  <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                                ) : (
                                                  <ChevronDown size={16} className={`transition-transform duration-200 ${expandedRows.has(classItem.scheduled_class_id) ? 'rotate-180' : ''}`} />
                                                )}
                                             </button>
                                          )}
                                       </div>
                                    </TableCell>
                                 </TableRow>
                                 {expandedRows.has(classItem.scheduled_class_id) && (
                                    <TableRow className="bg-gray-50/30">
                                       <TableCell colSpan={6} className="px-6 py-6">
                                          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                                             {/* Class Details Header */}
                                             <div className="flex justify-between items-center mb-4">
                                                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Class Details</p>
                                                <div className="flex items-center gap-3">
                                                   <button onClick={(e) => { e.stopPropagation(); handleExportSingleTopic(classItem); }} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg uppercase tracking-wider transition-colors shadow-sm">
                                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                      Topic Sheet
                                                   </button>
                                                   <button onClick={(e) => { e.stopPropagation(); handleExportSingleAttendance(classItem); }} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg uppercase tracking-wider transition-colors shadow-sm">
                                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                      Attendance Sheet
                                                   </button>
                                                </div>
                                             </div>
                                             
                                             {/* Topics Covered Section */}
                                             <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="md:col-span-1 flex flex-col">
                                                   <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Topics Covered</h4>
                                                   <div className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100 flex-grow">
                                                      {classDetails.get(classItem.scheduled_class_id)?.topics}
                                                   </div>
                                                </div>
                                                <div className="md:col-span-1 flex flex-col gap-4">
                                                   {(classDetails.get(classItem.scheduled_class_id)?.start_time || classDetails.get(classItem.scheduled_class_id)?.end_time) && (
                                                      <div>
                                                         <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Time</h4>
                                                         <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100 w-full">
                                                            <div className="flex items-center gap-2">
                                                               <Clock className="w-4 h-4 text-gray-400" />
                                                               {formatTimeTo12Hour(classDetails.get(classItem.scheduled_class_id)?.start_time)} - {formatTimeTo12Hour(classDetails.get(classItem.scheduled_class_id)?.end_time)}
                                                            </div>
                                                         </div>
                                                      </div>
                                                   )}
                                                   <div className="flex-1 flex flex-col">
                                                      <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Link</h4>
                                                      <div className="flex-grow">
                                                         {classDetails.get(classItem.scheduled_class_id)?.link ? (
                                                            <a href={classDetails.get(classItem.scheduled_class_id)?.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 hover:underline bg-gray-50 p-3 rounded-lg border border-gray-100 w-full break-all h-full">
                                                               <span className="truncate">{classDetails.get(classItem.scheduled_class_id)?.link}</span>
                                                            </a>
                                                         ) : (
                                                            <div className="text-sm text-gray-400 italic bg-gray-50 p-3 rounded-lg border border-gray-100 w-full h-full flex items-center">
                                                               No link provided
                                                            </div>
                                                         )}
                                                      </div>
                                                   </div>
                                                </div>
                                             </div>
                                             
                                             {/* Attendance List Section */}
                                             {classDetails.get(classItem.scheduled_class_id)?.attendance && classDetails.get(classItem.scheduled_class_id)!.attendance.length > 0 ? (
                                                <div>
                                                   <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                                                      <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Attendance List</h4>
                                                      <div className="flex gap-4">
                                                         <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Present ({classDetails.get(classItem.scheduled_class_id)!.attendance.filter(r => r.status === 'present').length})</span>
                                                         </div>
                                                         <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Absent ({classDetails.get(classItem.scheduled_class_id)!.attendance.filter(r => r.status === 'absent').length})</span>
                                                         </div>
                                                      </div>
                                                   </div>
                                                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                      {classDetails.get(classItem.scheduled_class_id)!.attendance.map((record, idx) => (
                                                         <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50">
                                                            <div className="overflow-hidden min-w-0 flex-1 mr-2">
                                                               <p className="text-xs font-bold text-gray-900 truncate">{String(record.student_name || record.student_id || '')}</p>
                                                               {record.student_email && <p className="text-[10px] text-gray-400 truncate">{String(record.student_email)}</p>}
                                                            </div>
                                                            <span className={`text-[9px] font-bold uppercase px-2.5 py-1 rounded flex-shrink-0 ${
                                                               record.status === 'present' 
                                                                  ? 'bg-green-600 text-white'
                                                                  : 'bg-red-600 text-white'
                                                            }`}>
                                                               {String(record.status)}
                                                            </span>
                                                         </div>
                                                      ))}
                                                   </div>
                                                </div>
                                             ) : (
                                                <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                                   <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">No attendance records found</p>
                                                </div>
                                             )}
                                          </div>
                                       </TableCell>
                                    </TableRow>
                                  )}
                               </React.Fragment>
                               ))
                            ) : (
                              <TableRow>
                                 <TableCell colSpan={6} className="px-4 sm:px-6 py-12 text-center">
                                    {!shouldShowClasses ? (
                                       <div className="flex flex-col items-center justify-center">
                                          <div className="w-20 sm:w-24 h-20 sm:h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4 sm:mb-6">
                                             <Image src="/icons/search.png" alt="No Students" width={48} height={48} className="opacity-40" />
                                          </div>
                                          <h3 className="text-base sm:text-lg font-black text-gray-900 uppercase tracking-widest mb-2">
                                             No Students Assigned
                                          </h3>
                                          <p className="text-xs sm:text-sm text-gray-500 max-w-md font-medium px-4">
                                             You currently don&apos;t have any students assigned to you. Once students are allocated, your class schedule will appear here.
                                          </p>
                                       </div>
                                    ) : (
                                       <div className="flex flex-col items-center justify-center">
                                          <div className="w-12 h-12 bg-gray-50 rounded-[2rem] flex items-center justify-center mb-3">
                                             <Search className="w-5 h-5 text-gray-300" />
                                          </div>
                                          <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">No classes found</p>
                                          <p className="text-[10px] text-gray-400 mt-1">Try adjusting your filters or search terms</p>
                                       </div>
                                    )}
                                 </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                </div>
            </div>
            )}

            {!loading && activeTab !== 'scheduled' && peertutorsInfo && (
              <AdditionalClassesTab 
                peertutorsInfo={peertutorsInfo} 
                assignedStudents={assignedStudents || []}
                scheduledClasses={classes}
                deptInfo={deptInfo}
              />
            )}  </div>
        </main>
      </div>

      <ClassDetailsModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        classItem={selectedClass}
        userEmail={user?.email || ''}
        onSuccess={handleRefresh}
        availableSubjects={classes
          .reduce((acc, curr) => {
            if (!acc.some(item => item.subject_name === curr.subject_name)) {
              acc.push({ id: curr.class_id || '', subject_name: curr.subject_name })
            }
            return acc
          }, [] as { id: string, subject_name: string }[])
        }
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
   const styles = {
      completed: "bg-green-500 text-white",
      pending: "bg-amber-500 text-white",
      upcoming: "bg-blue-500 text-white", 
      today: "bg-blue-600 text-white",
      not_started: "bg-gray-500 text-white"
   }
   
   const labels = {
      completed: "Completed",
      pending: "Pending",
      upcoming: "Upcoming",
      today: "Today",
      not_started: "Not Started"
   }

   return (
      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${styles[status as keyof typeof styles]}`}>
         {labels[status as keyof typeof labels]}
      </span>
   )
}
