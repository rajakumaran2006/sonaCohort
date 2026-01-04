'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import ClassDetailsModal from '@/components/features/classes/ClassDetailsModal'
import AdditionalClassesTab from '@/components/features/classes/AdditionalClassesTab'
import { useAuth } from '@/lib/auth/AuthContext'
import { ClassService, Class } from '@/lib/services/classService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
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
  Filter, 
  MoreHorizontal,
  Lock,
  ChevronDown,
  ChevronRight,
  Eye,
  Users
} from 'lucide-react'
import * as XLSX from 'xlsx'

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

  const [peerTutorInfo, setPeerTutorInfo] = useState<any>(null)
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'scheduled' | 'additional'>('scheduled')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [loadingClassDetails, setLoadingClassDetails] = useState<Set<string>>(new Set())
  const [classDetails, setClassDetails] = useState<Map<string, { topics: string, attendance: any[] }>>(new Map())
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  
  // Filter states
  const [filterYear, setFilterYear] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  // Use custom hook for sidebar collapsed state
  const [isSidebarCollapsed] = useSidebarCollapsed()

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

  // Fetch assigned students
  const { data: assignedStudents, isLoading: studentsLoading, refresh: refreshStudents } = useCachedData({
    queryKey: ['assigned-students', tutorInfoData?.id],
    queryFn: async () => {
       if (!tutorInfoData?.id) return []
       return await AssignmentService.getStudentsByPeerTutor(tutorInfoData.id)
    },
    enabled: !!tutorInfoData?.id,
    initialData: [],
    staleTime: 5 * 60 * 1000,
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
      setPeerTutorInfo(tutorInfoData)
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
    if (filterYear) filtered = filtered.filter(classItem => classItem.year === filterYear)
    if (filterSection) filtered = filtered.filter(classItem => classItem.section === filterSection)
    if (filterSubject) filtered = filtered.filter(classItem => classItem.subject_name === filterSubject)

    return filtered
  }, [classes, searchTerm, filterYear, filterSection, filterSubject])

  // Get unique values for filter dropdowns
  const getUniqueYears = () => [...new Set(classes.map(c => c.year))].sort().map(y => ({ label: `Year ${y}`, value: y }))
  const getUniqueSections = () => [...new Set(classes.map(c => c.section))].sort().map(s => ({ label: `Section ${s}`, value: s }))
  const getUniqueSubjects = () => [...new Set(classes.map(c => c.subject_name))].sort().map(s => ({ label: s, value: s }))

  const handleClassClick = (classItem: ClassWithStatus) => {
    if (!classItem.isEditable) {
      const scheduledDate = new Date(classItem.scheduled_date || '').toLocaleDateString('en-US', {
        weekday: 'long', week: 'numeric', month: 'long', day: 'numeric'
      })
      alert(`You can only manage this class on ${scheduledDate}. Today is not the scheduled day.`)
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
     if (filteredClasses.length === 0) return
     
     const exportData = filteredClasses.map(c => ({
        'Subject': c.subject_name,
        'Date': c.scheduled_date,
        'Department': c.dept, 
        'Year': c.year,
        'Section': c.section,
        'Status': c.completionStatus || 'N/A'
     }))
     
     const ws = XLSX.utils.json_to_sheet(exportData)
     const wb = XLSX.utils.book_new()
     XLSX.utils.book_append_sheet(wb, ws, "Classes")
     XLSX.writeFile(wb, `Classes_Export_${new Date().toISOString().split('T')[0]}.xlsx`)
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
      }
    } catch (error) {
      console.error('Error loading class details:', error)
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

      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
        <PageHeader
          title={activeTab === 'scheduled' ? "My Classes" : "Additional Classes"}
          subtitle="Manage your scheduled sessions and attendance"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isScheduledRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        >
          {true && (
             <div className="flex bg-gray-100/80 p-1 rounded-xl">
               <button
                 onClick={() => setActiveTab('scheduled')}
                 className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 ${
                   activeTab === 'scheduled'
                     ? 'bg-white text-blue-600 shadow-sm'
                     : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                 }`}
               >
                 Scheduled Classes
               </button>
               <button
                 onClick={() => setActiveTab('additional')}
                 className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 ${
                   activeTab === 'additional'
                     ? 'bg-white text-blue-600 shadow-sm'
                     : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                 }`}
               >
                 Additional Classes
               </button>
             </div>
          )}
        </PageHeader>

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
                  {/* Completed Classes */}
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-4">
                       <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Completed</p>
                          <p className="text-3xl font-bold text-gray-900 tracking-tight">{stats.completed}</p>
                       </div>
                       <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-green-50 transition-colors">
                          <CheckCircle className="w-4 h-4 text-gray-400 group-hover:text-green-500 transition-colors" />
                       </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-50">
                       <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                          <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Marked Verified</span>
                       </div>
                    </div>
                  </div>

                  {/* Pending Classes */}
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-4">
                       <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Pending</p>
                          <p className="text-3xl font-bold text-gray-900 tracking-tight">{stats.pending}</p>
                       </div>
                       <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-amber-50 transition-colors">
                          <Clock className="w-4 h-4 text-gray-400 group-hover:text-amber-500 transition-colors" />
                       </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-50">
                       <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Action Required</span>
                       </div>
                    </div>
                  </div>

                  {/* Total Classes */}
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-4">
                       <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Total</p>
                          <p className="text-3xl font-bold text-gray-900 tracking-tight">{stats.total}</p>
                       </div>
                       <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-blue-50 transition-colors">
                          <Calendar className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                       </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-50">
                       <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">All Scheduled</span>
                       </div>
                    </div>
                  </div>
                </div>

                {/* Filters & Table Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-5 border-b border-gray-100 bg-gray-50/30">
                    <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
                        <div className="relative w-full xl:max-w-sm">
                           <input
                             type="text"
                             value={searchTerm}
                             onChange={(e) => setSearchTerm(e.target.value)}
                             placeholder="Search classes, subjects..."
                             className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 focus:border-blue-400 rounded-xl text-sm transition-all outline-none shadow-sm"
                           />
                           <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                        </div>
                        
                        <div className="flex flex-wrap gap-3 w-full xl:w-auto">
                           <div className="w-full sm:w-auto sm:min-w-[140px]">
                             <FilterDropdown
                                value={filterYear}
                                onChange={setFilterYear}
                                options={getUniqueYears()}
                                placeholder="Year"
                             />
                           </div>
                           <div className="w-full sm:w-auto sm:min-w-[140px]">
                             <FilterDropdown
                                value={filterSection}
                                onChange={setFilterSection}
                                options={getUniqueSections()}
                                placeholder="Section"
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
                             
                             {(filterYear || filterSection || filterSubject || searchTerm) && (
                                <button 
                                  onClick={() => {
                                     setFilterYear('')
                                     setFilterSection('')
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

                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                          <TableHead className="py-4 pl-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Subject</TableHead>
                          <TableHead className="py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</TableHead>
                          <TableHead className="py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Department</TableHead>
                          <TableHead className="py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Class</TableHead>
                          <TableHead className="py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</TableHead>
                          <TableHead className="py-4 pr-6 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredClasses.length > 0 ? (
                          filteredClasses.map((classItem) => (
                             <>
                             <TableRow key={classItem.id} className="group hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0">
                                <TableCell className="py-4 pl-6">
                                   <p className="text-xs font-bold text-gray-900 leading-tight">{classItem.subject_name}</p>
                                </TableCell>
                                <TableCell className="py-4 text-center">
                                   <p className="text-xs font-bold text-gray-900">
                                      {new Date(classItem.scheduled_date || '').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                   </p>
                                   <p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">
                                      {new Date(classItem.scheduled_date || '').toLocaleDateString('en-US', { weekday: 'short' })}
                                   </p>
                                </TableCell>
                                <TableCell className="py-4 text-center">
                                   <span className="px-2 py-1 rounded-md bg-gray-50 text-[10px] font-bold text-gray-600 uppercase tracking-wider border border-gray-100">
                                      {classItem.dept}
                                   </span>
                                </TableCell>
                                <TableCell className="py-4 text-center">
                                   <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                      {classItem.year} - {classItem.section}
                                   </span>
                                </TableCell>
                                <TableCell className="py-4 text-center">
                                   <StatusBadge status={classItem.completionStatus || 'not_started'} />
                                </TableCell>
                                <TableCell className="py-4 pr-6 text-right">
                                   <div className="flex items-center justify-end gap-2">
                                      {classItem.isEditable ? (
                                         <button
                                            onClick={() => handleClassClick(classItem)}
                                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-wider shadow-sm transition-all"
                                         >
                                            Manage
                                         </button>
                                      ) : (
                                         <button
                                            disabled
                                            className="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-400 text-[10px] font-bold uppercase tracking-wider cursor-not-allowed flex items-center gap-1 ml-auto border border-gray-100"
                                         >
                                            <Lock size={10} /> Locked
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
                                   <TableCell colSpan={6} className="p-4 sm:p-6">
                                      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                                         <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-4">Class Details</h4>
                                         
                                         {classDetails.get(classItem.id)?.topics && (
                                            <div className="mb-6">
                                               <p className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Topics Covered</p>
                                               <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100">
                                                  {classDetails.get(classItem.id)?.topics}
                                               </p>
                                            </div>
                                         )}
                                         
                                         {classDetails.get(classItem.id)?.attendance && classDetails.get(classItem.id)!.attendance.length > 0 ? (
                                            <div>
                                               <div className="flex items-center justify-between mb-3">
                                                  <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">Attendance List</p>
                                                  <div className="flex gap-4">
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
                                               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                  {classDetails.get(classItem.id)!.attendance.map((record, idx) => (
                                                     <div 
                                                        key={idx} 
                                                        className={`flex items-center justify-between p-3 rounded-lg border ${
                                                           record.status === 'present' 
                                                              ? 'bg-green-50/50 border-green-100' 
                                                              : 'bg-red-50/50 border-red-100'
                                                        }`}
                                                     >
                                                        <div>
                                                           <p className="text-xs font-bold text-gray-900">{record.student_name || record.student_id}</p>
                                                           {record.student_email && <p className="text-[10px] text-gray-500">{record.student_email}</p>}
                                                        </div>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                                           record.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                        }`}>
                                                           {record.status}
                                                        </span>
                                                     </div>
                                                  ))}
                                               </div>
                                            </div>
                                         ) : (
                                            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                               <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">No attendance records found</p>
                                            </div>
                                         )}
                                      </div>
                                   </TableCell>
                                </TableRow>
                             )}
                             </>
                          ))
                        ) : (
                          <TableRow>
                             <TableCell colSpan={6} className="px-6 py-12 text-center">
                                {!shouldShowClasses ? (
                                   <div className="flex flex-col items-center justify-center">
                                      <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                                         <img src="/icons/search.png" alt="No Students" className="w-12 h-12 opacity-40" />
                                      </div>
                                      <h3 className="text-lg font-black text-gray-900 uppercase tracking-widest mb-2">
                                         No Students Assigned
                                      </h3>
                                      <p className="text-sm text-gray-500 max-w-md font-medium">
                                         You currently don't have any students assigned to you. Once students are allocated, your class schedule will appear here.
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
              </>
            ) : (
              <AdditionalClassesTab peerTutorInfo={peerTutorInfo} assignedStudents={assignedStudents || []} />
            )}
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
