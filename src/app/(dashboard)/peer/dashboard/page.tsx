'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

import Image from 'next/image'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'

import PeerRenumerationModal from '@/components/forms/modals/PeerRenumerationModal'
import PeerLeaderboard from '@/components/dashboard/PeerLeaderboard'
import ClassDetailsModal from '@/components/features/classes/ClassDetailsModal'
import { Class } from '@/lib/services/classService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { Card } from '@/components/ui'
import { 
  ChevronRight,
  MoreHorizontal,
  CheckCircle,
} from 'lucide-react'
import { peertutors } from '@/lib/services/peerTutorService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import AdditionalClassModal from '@/components/forms/modals/AdditionalClassModal'
import ExportButton from '@/components/ui/ExportButton'
import * as XLSX from 'xlsx'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import { 
  usePeerTutorInfo, 
  useAssignedStudents, 
  useRenumerations, 
  useClassStats, 
  useActiveFeedbackForms,
  usePendingClassAlert,
  usePeerLeaderboard,
  useAssignedStudentsPerformance,
  usePeerTutorSubjects
} from '@/lib/hooks/usePeerDashboardData'
import { peertutorsRenumeration } from '@/lib/services/renumerationService'
import EmailAssignmentModal from '@/components/forms/modals/EmailAssignmentModal'
import { Student } from '@/lib/services/studentService'



export default function PeerDashboardPage() {
  return (
    <PeerProtectedRoute>
      <PeerDashboardContent />
    </PeerProtectedRoute>
  )
}

function PeerDashboardContent() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showRenumerationModal, setShowRenumerationModal] = useState(false)
  const [selectedRenumeration, setSelectedRenumeration] = useState<peertutorsRenumeration | null>(null)
  const [selectedStudentForEmail, setSelectedStudentForEmail] = useState<Student | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  interface TodayClass extends Class {
    type: 'scheduled' | 'additional'
    isEditable?: boolean
  }

  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([])
  const [selectedTodayClass, setSelectedTodayClass] = useState<TodayClass | null>(null)
  const [isTodayClassModalOpen, setIsTodayClassModalOpen] = useState(false)
  const [isAddAdditionalClassModalOpen, setIsAddAdditionalClassModalOpen] = useState(false)

  // Use custom hook for sidebar collapsed state
  const [isSidebarCollapsed] = useSidebarCollapsed()

  // --- DATA FETCHING WITH HOOKS ---
  const { data: peertutorsInfo, isLoading: isTutorLoading } = usePeerTutorInfo(user?.email)
  
  const { data: assignedStudents = [], isLoading: isStudentsLoading } = useAssignedStudents(peertutorsInfo?.id)
  
  const { data: renumerations = [], isLoading: isRenumerationsLoading } = useRenumerations(peertutorsInfo?.id)
  
  // Only fetch class stats if we have students (to match original logic, though strictly not necessary)
  const { data: classStats, isLoading: isClassStatsLoading } = useClassStats(peertutorsInfo?.id)
  const classesTaken = classStats?.completedClasses ?? 0
  const totalClassesAllocated = classStats?.totalClasses ?? 0
  
  const { data: studentsWithAttendance = [] } = useAssignedStudentsPerformance(assignedStudents, peertutorsInfo as { id: string, dept: string } | null)

  const { data: alertData } = usePendingClassAlert(peertutorsInfo)
  const showPendingAlert = alertData?.showPendingAlert ?? false
  const consecutivePendingCount = alertData?.consecutivePendingCount ?? 0

  const { data: _activeFeedbackForms = [] } = useActiveFeedbackForms(peertutorsInfo?.id)
  // Always use undefined to default to user's own year - peer tutors can only see their year's leaderboard
  const { data: leaderboardData, isLoading: isLeaderboardLoading } = usePeerLeaderboard(peertutorsInfo, undefined)

  const { data: availableSubjects = [] } = usePeerTutorSubjects(peertutorsInfo)

  // Fetch all departments to find the right incharge info
  const { data: allDepts = [] } = useQuery({
    queryKey: ['all-departments'],
    queryFn: async () => await FacultyService.getAllDepartments(),
    staleTime: 10 * 60 * 1000,
  })

  // Match the department info locally for better reliability
  const deptInfo = useMemo(() => {
    if (!peertutorsInfo || !allDepts?.length) return null
    
    if (peertutorsInfo.faculty_id) {
      const match = allDepts.find(d => d.id === peertutorsInfo.faculty_id)
      if (match) return match
    }
    
    if (peertutorsInfo.dept) {
      const normalizedTutorDept = peertutorsInfo.dept.trim().toLowerCase()
      const match = allDepts.find(d => 
        d.name.trim().toLowerCase() === normalizedTutorDept ||
        normalizedTutorDept.includes(d.name.trim().toLowerCase()) ||
        d.name.trim().toLowerCase().includes(normalizedTutorDept)
      )
      if (match) return match
    }
    
  }, [peertutorsInfo, allDepts])

  const checkTodayClass = useCallback(async () => {
    if (!peertutorsInfo?.id || !peertutorsInfo?.dept || !peertutorsInfo?.year || !peertutorsInfo?.section) return
    
    const todayStr = new Date().toISOString().split('T')[0]
    
    // Fetch scheduled classes
    const schedules = await ScheduledClassService.getScheduledClassesByDate(
      peertutorsInfo.dept,
      peertutorsInfo.year,
      peertutorsInfo.section,
      peertutorsInfo.id
    )
    const matchingSchedules = schedules.filter(s => s.scheduled_date === todayStr && s.completion_status !== 'completed')
    const mappedSchedules = matchingSchedules.map(today => ({
      ...today.class,
      id: today.class_id,
      scheduled_class_id: today.id,
      faculty_id: today.faculty_id,
      class_date: today.scheduled_date,
      isEditable: true,
      type: 'scheduled' as const
    }))

    // Fetch additional classes
    const additionalClasses = await AdditionalClassService.getAdditionalClassesBypeertutors(peertutorsInfo.id)
    const matchingAdditional = additionalClasses.filter(c => c.class_date === todayStr)
    const mappedAdditional = matchingAdditional.map(c => ({
      ...c,
      dept: peertutorsInfo.dept,
      year: peertutorsInfo.year,
      section: peertutorsInfo.section,
      faculty_id: peertutorsInfo?.faculty_id || '',
      subject_name: c.subject_name,
      class_date: c.class_date,
      type: 'additional' as const
    } as TodayClass))

    setTodayClasses([...mappedSchedules, ...mappedAdditional])
  }, [peertutorsInfo])

  // Fetch today's class on mount and when tutor info changes
  useEffect(() => {
    checkTodayClass()
  }, [checkTodayClass])

  // getInitials was unused and removed

  // Combined Loading State
  // We can be a bit selective about what blocks the UI or show skeletons. 
  // For now, let's keep the main loading spinner logic similar to before.
  const loading = isTutorLoading || isStudentsLoading || isRenumerationsLoading || isClassStatsLoading

  // Attendance loading is handled by isAttendanceLoading if needed

  const handleExportToExcel = () => {
    if (studentsWithAttendance.length === 0) {
      toast.error('No data to export')
      return
    }

    const metadata = [
      ['PEER TUTOR ASSIGNED STUDENTS PERFORMANCE REPORT'],
      ['Export Date:', new Date().toLocaleDateString(), 'Export Time:', new Date().toLocaleTimeString()],
      ['Dept:', peertutorsInfo?.dept || 'N/A', 'Year:', peertutorsInfo?.year || 'N/A', 'Section:', peertutorsInfo?.section || 'N/A'],
      ['Filter Applied:', 'NO', 'Filters:', 'None'],
      ['Incharge:', deptInfo?.faculty_name || 'N/A', 'Tutor:', peertutorsInfo?.name || 'N/A', 'Assigned Students:', assignedStudents.length],
      [''],
      ['Rank', 'Student Name', 'Email', 'Department', 'Year', 'Section', 'Present', 'Absent', 'Percentage', 'Score']
    ]

    const exportData = studentsWithAttendance.map((student) => [
      student.rank,
      student.name,
      student.email || '',
      student.dept,
      student.year,
      student.section,
      student.classesPresent,
      student.classesAbsent,
      `${student.attendancePercentage}%`,
      student.score
    ])

    const worksheet = XLSX.utils.aoa_to_sheet([...metadata, ...exportData])
    
    // Fix column widths
    worksheet['!cols'] = [
      { wch: 8 }, { wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 10 }
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Assigned Students')
    const filename = `assigned-students-${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['peertutors'] }),
            queryClient.invalidateQueries({ queryKey: ['assignedStudents'] }),
            queryClient.invalidateQueries({ queryKey: ['renumerations'] }),
            queryClient.invalidateQueries({ queryKey: ['classStats'] }),
            queryClient.invalidateQueries({ queryKey: ['assignedStudentsPerformance'] }),
            queryClient.invalidateQueries({ queryKey: [ 'activeFeedbackForms' ] }),
            queryClient.invalidateQueries({ queryKey: [ 'pendingClassAlert' ] }),
            checkTodayClass()
        ])
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  const completionPercentage = totalClassesAllocated > 0 
    ? Math.round((classesTaken / totalClassesAllocated) * 100) 
    : 0



  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
        <PageHeader
          title="DASHBOARD"
          tagline="Role & Performance Overview"
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="flex-1 p-6 overflow-y-auto bg-gray-50/50">
          <div className="max-w-[1600px] mx-auto w-full">
            {showPendingAlert && (
              <div className="mb-6 animate-in slide-in-from-top-4 duration-500">
                <div className="bg-gradient-to-r from-gray-50 to-white border border-gray-100 rounded-[2rem] p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm relative overflow-hidden group">
                  <div className="relative z-10 flex items-center gap-6">
                    <div>
                      <h3 className="text-lg font-black text-black-900 mb-1 uppercase tracking-tight">Action Required</h3>
                      <p className="text-yellow-700 text-xs font-bold uppercase tracking-wide">
                        {consecutivePendingCount} consecutive pending classes detected. Please Complete Logs.
                      </p>
                    </div>
                  </div>
                  <div className="relative z-10 hidden md:block">
                     <span className="px-4 py-2 bg-white rounded-xl border border-red-100 shadow-sm text-[10px] font-black text-red-600 uppercase tracking-widest hover:text-red-700 transition-colors cursor-default">
                        Urgent
                     </span>
                  </div>
                  <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 w-full">
                
                {/* --- LEFT COLUMN --- */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                  
                  {/* Hero Card - Assignment Profile */}
                  <div className="bg-gradient-to-br from-[#1C2434] to-[#2D3748] text-white rounded-[2rem] p-5 md:p-8 relative overflow-hidden shadow-2xl border border-white/10 group">
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-6">
                        <span className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">Assignment Profile</span>
                      </div>
                      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                          <p className="text-sm text-gray-400 font-bold mb-1 uppercase tracking-wider">
                            {peertutorsInfo?.dept || 'Department'}
                          </p>
                          <h3 className="text-3xl font-black tracking-tight mb-4 leading-none text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                            {peertutorsInfo?.name || 'Peer Tutor'}
                          </h3>
                          <div className="flex flex-wrap gap-2 mt-2">
                             {peertutorsInfo?.year && (
                               <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-lg text-[10px] font-bold border border-white/5 text-gray-300 uppercase tracking-wider">
                                 Year {peertutorsInfo.year}
                               </span>
                             )}
                             {peertutorsInfo?.section && (
                               <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-lg text-[10px] font-bold border border-white/5 text-gray-300 uppercase tracking-wider">
                                 Section {peertutorsInfo.section}
                               </span>
                             )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:flex sm:items-center gap-3">
                            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/5 min-w-[100px]">
                                <p className="text-[9px] text-gray-400 uppercase font-black mb-1 tracking-wider">Classes</p>
                                <div className="flex items-baseline gap-1">
                                  <p className="text-xl font-bold">{classesTaken}</p>
                                  <span className="text-[10px] text-gray-500 font-bold">/ {totalClassesAllocated}</span>
                                </div>
                            </div>
                            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/5 min-w-[100px]">
                                <p className="text-[9px] text-gray-400 uppercase font-black mb-1 tracking-wider">Addl. Classes</p>
                                <p className="text-xl font-bold text-white">{classStats?.additionalClassesCount || 0}</p>
                            </div>
                            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/5 min-w-[100px] col-span-2 sm:col-span-1">
                                <p className="text-[9px] text-gray-400 uppercase font-black mb-1 tracking-wider">Progress</p>
                                <p className="text-xl font-bold text-emerald-400">{completionPercentage}%</p>
                            </div>
                        </div>
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-emerald-500/20 transition-all duration-700"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl -ml-20 -mb-20 transition-all duration-700"></div>
                  </div>

                  {/* Today's Classes Quick Access */}
                  <div className="flex flex-col gap-3 mb-2">
                     
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-h-[80px]">
                        {todayClasses.length === 0 ? (
                          <div className="col-span-1 sm:col-span-2 bg-white border-2 border-dashed border-gray-200 rounded-[2rem] p-8 flex flex-col items-center justify-center text-center opacity-70 gap-3 shadow-sm">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">No Class Scheduled For Today</p>
                          </div>
                        ) : (
                          todayClasses.map((cl, idx) => (
                            <div 
                              key={cl.id || idx}
                              onClick={() => {
                                if (cl.type === 'scheduled') {
                                  setSelectedTodayClass(cl)
                                  setIsTodayClassModalOpen(true)
                                } else {
                                  toast.info(`Additional Class: ${cl.subject_name}`)
                                }
                              }}
                              className={`col-span-1 sm:col-span-2 bg-white border-2 border-dashed rounded-[2rem] p-5 flex items-center justify-between cursor-pointer hover:border-gray-900 transition-all group shadow-sm bg-gradient-to-r from-white to-gray-50/30 ${
                                cl.type === 'additional' ? 'border-purple-200' : 'border-gray-100'
                              }`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform ${
                                  cl.type === 'additional' ? 'bg-purple-600' : 'bg-gray-900'
                                }`}>
                                  <CheckCircle className="text-white w-5 h-5" />
                                </div>
                                <div className="min-w-0 pr-2">
                                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                                    {cl.type === 'scheduled' ? 'Live Now' : 'Additional'}
                                  </p>
                                  <h4 className="text-[13px] font-bold text-gray-900 uppercase tracking-tight truncate max-w-[200px] sm:max-w-[350px]">{cl.subject_name}</h4>
                                </div>
                              </div>
                              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-colors ${
                                cl.type === 'additional' 
                                  ? 'bg-purple-50 text-purple-700 group-hover:bg-purple-600 group-hover:text-white' 
                                  : 'bg-gray-50 text-gray-900 group-hover:bg-gray-900 group-hover:text-white'
                              }`}>
                                {cl.type === 'scheduled' ? 'Launch' : 'View'} <ChevronRight size={12} />
                              </div>
                            </div>
                          ))
                        )}
                     </div>
                  </div>

                  {/* Students Leaderboard */}
                  <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 overflow-hidden flex flex-col flex-1">
                    <div className="flex flex-row items-center justify-between mb-8 border-b border-gray-50 pb-4">
                      <div>
                        <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest leading-none">Assigned Students</h4>
                        <p className="text-[9px] font-bold text-gray-400 uppercase mt-1 tracking-wider italic">View student progress & performance</p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                         <span className="bg-gray-100 text-gray-500 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
                            {assignedStudents.length} Students
                         </span>
                         {studentsWithAttendance.length > 0 && (
                           <ExportButton 
                             onClick={handleExportToExcel}
                             text="Export"
                           />
                         )}
                      </div>
                    </div>
                    
                    {studentsWithAttendance.length === 0 ? (
                       <div className="py-20 flex flex-col items-center justify-center text-center">
                          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4">
                             <Image src="/icons/student.png" alt="student" width={64} height={64} />
                          </div>
                          <p className="text-xs font-black text-gray-900 uppercase tracking-widest mb-1">No Students Assigned</p>
                          <p className="text-[10px] text-gray-400 max-w-[200px] font-medium leading-relaxed">Students allocated to you will appear here.</p>
                       </div>
                    ) : (
                       <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2.5 max-h-[500px]">
                           {studentsWithAttendance.map((student, index: number) => (
                             <div 
                               key={student.id} 
                               onClick={() => router.push(`/peer/attendance/${student.id}`)}
                               className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-3xl border border-transparent bg-white hover:bg-gray-50/80 hover:border-gray-100 transition-all duration-300 group cursor-pointer gap-3 sm:gap-0"
                             >
                                <div className="flex items-center gap-4 w-full sm:w-auto">
                                   <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-[10px] font-black text-white shadow-sm shrink-0">
                                      {index + 1}
                                   </div>

                                   
                                   <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <h5 className={`text-[13px] font-black leading-tight truncate ${
                                          student.rank <= 3 ? 'text-gray-900' : 'text-gray-700'
                                        }`}>
                                          {student.name}
                                        </h5>
                                        {student.is_manual_entry && (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-white/50 text-gray-500 border border-gray-100 uppercase tracking-tighter">
                                            Manual
                                          </span>
                                        )}
                                      </div>
                                      
                                      <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-tight">
                                         {student.is_manual_entry ? (
                                             <button
                                                 onClick={(e) => {
                                                     e.stopPropagation()
                                                     setSelectedStudentForEmail(student as unknown as Student)
                                                 }}
                                                 className="text-blue-600 hover:text-blue-800 font-bold hover:underline"
                                             >
                                                 + ASSIGN EMAIL
                                             </button>
                                         ) : (
                                             <span className="truncate max-w-[150px]">{student.email || 'No email assigned'}</span>
                                         )}
                                         <span className="w-1 h-1 rounded-full bg-gray-200"></span>
                                         <span>Section {student.section}</span>
                                      </div>
                                   </div>
                                </div>

                                <div className="flex items-center gap-6 sm:gap-8 ml-[54px] sm:ml-0">
                                   <div className="flex flex-col items-center sm:items-end">
                                      <span className="text-base sm:text-lg font-black tracking-tighter text-gray-900">
                                        {(student.score || 0).toFixed(1)}
                                      </span>
                                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-[-2px]">Score</span>
                                   </div>

                                   <div className="flex flex-col items-center sm:items-end">
                                      <span className="text-xs sm:text-sm font-black text-gray-600 tracking-tight">
                                        {student.attendancePercentage}%
                                      </span>
                                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-[-2px]">Attendance</span>
                                   </div>
                                   
                                   <div className="hidden sm:block">
                                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 transition-colors" />
                                   </div>
                                </div>
                             </div>
                          ))}
                       </div>
                    )}
                  </Card>
                </div>

                {/* --- RIGHT COLUMN --- */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  
                  {/* Class Progress Card */}
                  <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 relative overflow-hidden group hover:shadow-md transition-shadow duration-300">
                     <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3 sm:gap-0">
                       <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest leading-none">Class Progress</h4>
                       <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                          completionPercentage >= 75 ? 'bg-gray-100 text-black-600' :
                          completionPercentage >= 40 ? 'bg-gray-100 text-black' : 'bg-gray-100 text-black'
                       }`}>
                          {completionPercentage >= 75 ? 'Excellent' :
                           completionPercentage >= 40 ? 'In Progress' : 'Behind'}
                       </div>
                     </div>
                     
                     <div className="relative pt-2">
                        <div className="flex items-end justify-between mb-3">
                           <div>
                              <div className="flex items-baseline gap-1">
                                 <span className="text-4xl font-black text-gray-900 tracking-tighter">{classesTaken}</span>
                                 <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">/ {totalClassesAllocated}</span>
                              </div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Classes Completed</p>
                           </div>
                           <div className="text-right">
                              <span className="text-2xl font-black text-emerald-500 tracking-tight">{completionPercentage}%</span>
                           </div>
                        </div>

                        {/* Interactive Progress Bar */}
                        <div className="relative h-3 w-full bg-gray-100 rounded-full overflow-hidden cursor-pointer group/bar">
                           <div className="absolute inset-0 opacity-30 bg-[linear-gradient(45deg,rgba(0,0,0,0.02)_25%,transparent_25%,transparent_50%,rgba(0,0,0,0.02)_50%,rgba(0,0,0,0.02)_75%,transparent_75%,transparent)] bg-[length:10px_10px]"></div>
                           <div 
                              className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full relative transition-all duration-1000 ease-out group-hover/bar:brightness-110"
                              style={{ width: `${completionPercentage}%` }}
                           >
                              <div className="absolute inset-0 bg-white/30 skew-x-12 -translate-x-full animate-[shimmer_1.5s_infinite]"></div>
                           </div>
                           <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover/bar:opacity-100 transition-all duration-200 transform translate-y-2 group-hover/bar:translate-y-0 pointer-events-none whitespace-nowrap shadow-xl z-10">
                              {totalClassesAllocated - classesTaken} classes remaining
                              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[4px] border-4 border-transparent border-t-gray-900"></div>
                           </div>
                        </div>

                        <div className="mt-5 flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                           <p className="text-[10px] text-gray-500 font-medium leading-relaxed">
                               You&apos;re doing great! Complete <strong className="text-gray-900">{totalClassesAllocated - classesTaken} more</strong> classes to reach your target for this semester.
                           </p>
                        </div>
                     </div>
                  </Card>

                   {/* Leaderboard Section */}
                   <div>
                      <PeerLeaderboard 
                        data={leaderboardData} 
                        loading={isLeaderboardLoading} 
                        currentUserId={peertutorsInfo?.id} 
                      />
                   </div>


                  {/* Renumeration Section - Only show if there are forms */}
                  {renumerations.length > 0 && (
                    <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 flex-1 overflow-hidden">
                       <div className="flex flex-row items-center justify-between mb-8 border-b border-gray-50 pb-4">
                          <div className="flex items-center gap-2">
                             <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest leading-none">Renumeration Reports</h4>
                             {renumerations.filter(r => r.status === 'pending').length > 0 && (
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                             )}
                          </div>
                          <MoreHorizontal className="w-5 h-5 text-gray-300" />
                       </div>
                       
                       <div className="space-y-3">
                          {renumerations.map((renumeration) => (
                             <div key={renumeration.id} className="p-4 rounded-2xl bg-gray-50 border border-transparent hover:border-purple-100 hover:bg-white transition-all duration-300 group">
                                <div className="flex justify-between items-start mb-2">
                                   <h5 className="text-[11px] font-black text-gray-900 uppercase tracking-tight line-clamp-1 group-hover:text-purple-600 transition-colors">
                                      {renumeration.template?.name}
                                   </h5>
                                   <StatusBadge status={renumeration.status} />
                                </div>
                                <p className="text-[10px] text-gray-400 font-medium mb-3 line-clamp-2 leading-relaxed">
                                   {renumeration.template?.description || 'No description available'}
                                </p>
                                
                                <div className="flex items-center justify-between pt-2 border-t border-gray-100/50">
                                   <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                      {renumeration.submitted_at 
                                         ? new Date(renumeration.submitted_at).toLocaleDateString()
                                         : 'Pending Submission'
                                      }
                                   </span>
                                   
                                   {!renumeration.template?.is_active ? (
                                      <span className="text-[9px] font-black text-gray-400 italic uppercase">Closed</span>
                                   ) : renumeration.status === 'pending' ? (
                                      <button
                                         onClick={() => {
                                            setSelectedRenumeration(renumeration)
                                            setShowRenumerationModal(true)
                                         }}
                                         className="text-[9px] font-black text-white bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-lg uppercase tracking-widest transition-all shadow-sm hover:shadow-purple-500/20"
                                      >
                                         Fill Form
                                      </button>
                                   ) : (
                                      <button
                                         onClick={() => {
                                            setSelectedRenumeration(renumeration)
                                            setShowRenumerationModal(true)
                                         }}
                                         className="text-[9px] font-black text-purple-600 hover:text-purple-700 uppercase tracking-widest flex items-center gap-1 group/btn"
                                      >
                                         View <ChevronRight size={10} className="group-hover/btn:translate-x-0.5 transition-transform" />
                                      </button>
                                   )}
                                </div>
                             </div>
                          ))}
                       </div>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      
      {showRenumerationModal && selectedRenumeration && (
        <PeerRenumerationModal
          renumeration={selectedRenumeration!}
          isOpen={showRenumerationModal}
          onClose={() => {
            setShowRenumerationModal(false)
            setSelectedRenumeration(null)
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['renumerations'] })
          }}
        />
      )}

      {selectedStudentForEmail && (
        <EmailAssignmentModal
          student={selectedStudentForEmail}
          onClose={() => setSelectedStudentForEmail(null)}
          onSuccess={() => {
            handleRefresh()
            setSelectedStudentForEmail(null)
          }}
        />
      )}

      {selectedTodayClass && (
        <ClassDetailsModal
          isOpen={isTodayClassModalOpen}
          onClose={() => {
            setIsTodayClassModalOpen(false)
            setSelectedTodayClass(null)
          }}
          classItem={selectedTodayClass}
          userEmail={user?.email || ''}
          onSuccess={handleRefresh}
          availableSubjects={availableSubjects}
        />
      )}

      {peertutorsInfo && (
        <AdditionalClassModal
          isOpen={isAddAdditionalClassModalOpen}
          onClose={() => setIsAddAdditionalClassModalOpen(false)}
          onSuccess={() => {
            handleRefresh()
            checkTodayClass()
          }}
          peertutorsInfo={peertutorsInfo as peertutors}
          assignedStudents={assignedStudents}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
   const styles = {
      pending: "bg-amber-600 text-white border-amber-100",
      submitted: "bg-blue-600 text-white border-blue-100",
      approved: "bg-emerald-600 text-white border-emerald-100",
      rejected: "bg-red-600 text-white border-red-100",
   }
   
   const label = status === 'submitted' ? 'Reviewing' : status

   return (
      <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest border ${styles[status as keyof typeof styles] || 'bg-gray-50 text-gray-500 border-gray-100'}`}>
         {label}
      </span>
   )
}
