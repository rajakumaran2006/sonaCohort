'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import Image from 'next/image'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import ClassDetailsModal from '@/components/features/classes/ClassDetailsModal'
import AdditionalClassesTab from '@/components/features/classes/AdditionalClassesTab'
import { useAuth } from '@/lib/auth/AuthContext'
import { Class } from '@/lib/services/classService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { peertutors } from '@/lib/services/peerTutorService'
import { ReportService } from '@/lib/services/reportService'
import { useCachedData } from '@/lib/hooks/useCachedData'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import FilterDropdown from '@/components/ui/FilterDropdown'
import ExportButton from '@/components/ui/ExportButton'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { 
  CheckCircle, 
  Clock, 
  Calendar, 
  Search, 
  Lock,
  ChevronDown
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { logger } from '@/lib/logger'

export default function PeerClassesPage() {
  return (
    <PeerProtectedRoute>
      <PeerClassesContent />
    </PeerProtectedRoute>
  )
}

interface ClassWithStatus extends Class {
  completionStatus?: 'completed' | 'pending' | 'not_started' | 'upcoming'
  isEditable: boolean
  scheduled_date?: string
  scheduled_class_id?: string
}

function PeerClassesContent() {
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const [peertutorsInfo, setpeertutorsInfo] = useState<peertutors | null>(null)
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'scheduled' | 'additional'>('scheduled')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [loadingClassDetails, setLoadingClassDetails] = useState<Set<string>>(new Set())
  const [classDetails, setClassDetails] = useState<Map<string, { topics: string, attendance: Array<Record<string, unknown>> }>>(new Map())
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  
  // Filter states
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

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

  const loading = tutorLoading || scheduledLoading || studentsLoading

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
      
      let completionStatus: 'completed' | 'pending' | 'not_started' | 'upcoming' = 'not_started'
      
      if (completion === 'completed') {
        completionStatus = 'completed'
      } else if (isFuture) {
        completionStatus = 'upcoming'
      } else if (isPast) {
        completionStatus = 'pending'
      } else if (isEditable) {
        completionStatus = 'pending'
      }
      
      return {
        id: scheduledClass.id,
        subject_name: scheduledClass.class.subject_name,
        dept: scheduledClass.dept,
        year: scheduledClass.year,
        section: scheduledClass.section,
        faculty_id: scheduledClass.faculty_id,
        created_at: scheduledClass.class.created_at,
        scheduled_class_id: scheduledClass.id,
        scheduled_date: scheduledClass.scheduled_date,
        completionStatus,
        isEditable
      } as ClassWithStatus & { scheduled_date: string, scheduled_class_id: string }
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

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(classItem =>
        classItem.subject_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classItem.dept.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classItem.year.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classItem.section.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Apply filters
    if (filterStatus) filtered = filtered.filter(classItem => classItem.completionStatus === filterStatus)
    if (filterSubject) filtered = filtered.filter(classItem => classItem.subject_name === filterSubject)

    return filtered
  }, [classes, searchTerm, filterStatus, filterSubject])

  // Get unique values for filter dropdowns
  const getStatusOptions = () => [
    { label: 'Pending', value: 'pending' },
    { label: 'Completed', value: 'completed' },
    { label: 'Upcoming', value: 'upcoming' }
  ]
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

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedClass(null)
    refreshScheduled()
  }

  const handleRefresh = async () => {
    await Promise.all([refreshTutor(), refreshScheduled(), refreshStudents()])
    setLastRefresh(new Date())
  }
  
  const handleExportData = () => {
     if (filteredClasses.length === 0) {
        toast.warning('No responses to export. Please adjust your filters.')
        return
     }
     
     const exportData = filteredClasses.map(c => ({
        'Subject': c.subject_name,
        'Date': c.scheduled_date,
        'Department': c.dept, 
        'Year': c.year,
        'Section': c.section,
        'Status': c.completionStatus || 'N/A'
     }))
     
     try {
       const ws = XLSX.utils.json_to_sheet(exportData)
       const wb = XLSX.utils.book_new()
       XLSX.utils.book_append_sheet(wb, ws, "Classes")
       XLSX.writeFile(wb, `Classes_Export_${new Date().toISOString().split('T')[0]}.xlsx`)
     } catch {
       toast.error('Error exporting to Excel. Please try again.')
     }
  }

  const loadClassDetails = async (classItem: ClassWithStatus) => {
    if (!classItem.scheduled_class_id || classItem.completionStatus !== 'completed') return

    setLoadingClassDetails(prev => new Set(prev).add(classItem.id))
    
    try {
      const report = await ReportService.getClassAttendanceReport(classItem.scheduled_class_id)
      
      if (report) {
        setClassDetails(prev => new Map(prev).set(classItem.id, {
          topics: report.topics || '',
          attendance: report.attendance_records || []
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
        newSet.delete(classItem.id)
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
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden w-full lg:w-auto`}>
        <PageHeader
          title={activeTab === 'scheduled' ? "My Classes" : "Additional Classes"}
          subtitle="Manage your scheduled sessions and attendance"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isScheduledRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
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
            {loading ? (
              <div className="flex flex-col items-center justify-center h-96">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-500 font-medium">Loading classes...</p>
              </div>
            ) : activeTab === 'scheduled' ? (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Total Classes */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Total Classes
                        </div>
                        <Calendar className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {stats.total}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-blue-600">
                        <span className="font-semibold uppercase">All Scheduled</span>
                      </div>
                    </div>
                  </div>

                  {/* Completed Classes */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Completed
                        </div>
                        <CheckCircle className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {stats.completed}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-green-600">
                        <span className="font-semibold uppercase">Marked Verified</span>
                      </div>
                    </div>
                  </div>

                  {/* Pending Classes */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Pending
                        </div>
                        <Clock className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {stats.pending}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-amber-600">
                        <span className="font-semibold uppercase">Action Required</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Filters & Table Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-5 border-b border-gray-100 bg-gray-50/30">
                        <div className="flex flex-col lg:flex-row xl:flex-row gap-4 justify-between items-start lg:items-center">
                        <div className="relative w-full lg:max-w-sm">
                           <input
                             type="text"
                             value={searchTerm}
                             onChange={(e) => setSearchTerm(e.target.value)}
                             placeholder="Search classes, subjects..."
                             className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 focus:border-blue-400 rounded-xl text-sm transition-all outline-none shadow-sm"
                           />
                           <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                        </div>
                        
                        <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                           <div className="w-full sm:w-auto sm:min-w-[140px]">
                             <FilterDropdown
                                value={filterStatus}
                                onChange={setFilterStatus}
                                options={getStatusOptions()}
                                placeholder="Status"
                             />
                           </div>
                           <div className="w-full sm:w-auto sm:min-w-[160px]">
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
                             
                             {(filterStatus || filterSubject || searchTerm) && (
                                <button 
                                  onClick={() => {
                                     setFilterStatus('')
                                     setFilterSubject('')
                                     setSearchTerm('')
                                  }}
                                  className="px-4 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 rounded-xl transition-colors uppercase tracking-wider h-[42px]"
                                >
                                   Clear
                                </button>
                             )}
                           </div>
                        </div>
                    </div>
                  </div>

                  {/* Mobile Card View */}
                  <div className="block md:hidden space-y-3 px-4">
                    {filteredClasses.length > 0 ? (
                      filteredClasses.map((classItem) => (
                        <div key={classItem.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                          {/* Card Header */}
                          <div className="p-4 border-b border-gray-100">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-bold text-gray-900 uppercase mb-1 leading-tight">
                                  {classItem.subject_name}
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
                              <span className="font-bold text-gray-900">
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
                                onClick={() => toggleRowExpansion(classItem.id, classItem)}
                                className={`px-3 py-2.5 rounded-lg border transition-colors ${
                                  expandedRows.has(classItem.id) 
                                    ? 'bg-blue-50 border-blue-200 text-blue-600' 
                                    : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                                }`}
                              >  
                                {loadingClassDetails.has(classItem.id) ? (
                                  <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                ) : (
                                  <ChevronDown size={18} className={`transition-transform duration-200 ${expandedRows.has(classItem.id) ? 'rotate-180' : ''}`} />
                                )}
                              </button>
                            )}
                          </div>

                          {/* Expanded Details */}
                          {expandedRows.has(classItem.id) && (
                            <div className="p-4 border-t border-gray-100 bg-white">
                              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-4">Class Details</h4>
                              
                              {classDetails.get(classItem.id)?.topics && (
                                <div className="mb-4">
                                  <p className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Topics Covered</p>
                                  <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    {classDetails.get(classItem.id)?.topics}
                                  </p>
                                </div>
                              )}
                              
                              {classDetails.get(classItem.id)?.attendance && classDetails.get(classItem.id)!.attendance.length > 0 ? (
                                <div>
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">Attendance</p>
                                    <div className="flex gap-3">
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                        <span className="text-[10px] font-bold text-gray-500">
                                          {classDetails.get(classItem.id)!.attendance.filter(r => r.status === 'present').length}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                        <span className="text-[10px] font-bold text-gray-500">
                                          {classDetails.get(classItem.id)!.attendance.filter(r => r.status === 'absent').length}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    {classDetails.get(classItem.id)!.attendance.map((record, idx) => (
                                      <div 
                                        key={idx} 
                                        className="flex items-center justify-between p-3 rounded-lg border bg-gray-50/50 border-gray-100"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="text-xs font-bold text-gray-900 truncate">{String(record.student_name || record.student_id || '')}</p>
                                          {record.student_email ? <p className="text-[10px] text-gray-500 truncate">{String(record.student_email)}</p> : null}
                                        </div>
                                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-wider ml-2 whitespace-nowrap ${
                                          record.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
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
                                 <React.Fragment key={classItem.id}>
                                 <TableRow className="group hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0">
                                    <TableCell className="py-3 sm:py-4 pl-4 sm:pl-6">
                                       <p className="text-xs font-bold text-gray-900 uppercase leading-tight">{classItem.subject_name}</p>
                                    </TableCell>
                                    <TableCell className="py-3 sm:py-4 text-center">
                                       <p className="text-xs font-bold text-gray-900">
                                          {new Date(classItem.scheduled_date || '').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                       </p>
                                       <p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">
                                          {new Date(classItem.scheduled_date || '').toLocaleDateString('en-US', { weekday: 'short' })}
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
                                                onClick={() => handleClassClick(classItem)}
                                                className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shadow-sm transition-all"
                                             >
                                                Manage
                                             </button>
                                          ) : (
                                             <button
                                                disabled
                                                className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-gray-50 text-gray-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider cursor-not-allowed flex items-center gap-1 ml-auto border border-gray-100"
                                             >
                                                <Lock size={10} /> <span className="hidden xs:inline">Locked</span>
                                             </button>
                                          )}
                                          
                                          {classItem.completionStatus === 'completed' && (
                                             <button
                                                onClick={() => toggleRowExpansion(classItem.id, classItem)}
                                                className={`p-1.5 rounded-lg border transition-colors ${
                                                   expandedRows.has(classItem.id) 
                                                      ? 'bg-blue-50 border-blue-200 text-blue-600' 
                                                      : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                                                }`}
                                             >  
                                                {loadingClassDetails.has(classItem.id) ? (
                                                  <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                                ) : (
                                                  <ChevronDown size={16} className={`transition-transform duration-200 ${expandedRows.has(classItem.id) ? 'rotate-180' : ''}`} />
                                                )}
                                             </button>
                                          )}
                                       </div>
                                    </TableCell>
                                 </TableRow>
                                 {expandedRows.has(classItem.id) && (
                                    <TableRow className="bg-gray-50/30 hover:bg-gray-50/30">
                                       <TableCell colSpan={6} className="p-3 sm:p-4 md:p-6">
                                          <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                                             <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-4">Class Details</h4>
                                             
                                             {classDetails.get(classItem.id)?.topics && (
                                                <div className="mb-6">
                                                   <p className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Topics Covered</p>
                                                   <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-100">
                                                      {classDetails.get(classItem.id)?.topics}
                                                   </p>
                                                </div>
                                             )}
                                             
                                             {classDetails.get(classItem.id)?.attendance && classDetails.get(classItem.id)!.attendance.length > 0 ? (
                                                <div>
                                                   <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                                                      <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">Attendance List</p>
                                                      <div className="flex gap-3 sm:gap-4">
                                                         <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Present ({classDetails.get(classItem.id)!.attendance.filter(r => r.status === 'present').length})</span>
                                                         </div>
                                                         <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Absent ({classDetails.get(classItem.id)!.attendance.filter(r => r.status === 'absent').length})</span>
                                                         </div>
                                                      </div>
                                                   </div>
                                                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                                                      {classDetails.get(classItem.id)!.attendance.map((record, idx) => (
                                                         <div 
                                                            key={idx} 
                                                            className={`flex items-center justify-between p-2.5 sm:p-3 rounded-lg border ${
                                                               record.status === 'present' 
                                                                  ? 'bg-gray-50/50 border-black-100' 
                                                                  : 'bg-gray-50/50 border-black-100'
                                                            }`}
                                                         >
                                                            <div className="min-w-0 flex-1">
                                                               <p className="text-xs font-bold text-gray-900 truncate">{String(record.student_name || record.student_id || '')}</p>
                                                               {record.student_email ? <p className="text-[10px] text-gray-500 truncate">{String(record.student_email)}</p> : null}
                                                            </div>
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ml-2 whitespace-nowrap ${
                                                               record.status === 'present' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                                                            }`}>
                                                               {String(record.status)}
                                                            </span>
                                                         </div>
                                                      ))}
                                                   </div>
                                                </div>
                                             ) : (
                                                <div className="text-center py-6 sm:py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
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
              </>
            ) : peertutorsInfo ? (
              <AdditionalClassesTab 
                peertutorsInfo={peertutorsInfo} 
                assignedStudents={assignedStudents || []}
                scheduledClasses={classes}
              />
            ) : null}
          </div>
        </main>
      </div>

      <ClassDetailsModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        classItem={selectedClass}
        userEmail={user?.email || ''}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
   const styles = {
      completed: "bg-green-100 text-green-700",
      pending: "bg-amber-100 text-amber-700",
      upcoming: "bg-blue-100 text-blue-700", 
      not_started: "bg-gray-100 text-gray-600"
   }
   
   const labels = {
      completed: "Completed",
      pending: "Pending",
      upcoming: "Upcoming",
      not_started: "Not Started"
   }

   return (
      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${styles[status as keyof typeof styles]}`}>
         {labels[status as keyof typeof labels]}
      </span>
   )
}
