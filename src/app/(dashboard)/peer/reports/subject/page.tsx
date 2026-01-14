'use client'

import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { ReportService, ClassAttendanceReport, FullClassReport } from '@/lib/services/reportService'
import { ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Card, LoadingSpinner } from '@/components/ui'
import { ArrowLeft, Calendar, Eye } from 'lucide-react'

export default function PeerSubjectDetailsPage() {
  return (
    <PeerProtectedRoute>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center py-32 bg-[#F8F9FA]">
          <LoadingSpinner size="lg" className="mr-3" />
          <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading...</span>
        </div>
      }>
        <PeerSubjectDetailsContent />
      </Suspense>
    </PeerProtectedRoute>
  )
}

function PeerSubjectDetailsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [scheduledClasses, setScheduledClasses] = useState<ScheduledClassWithDetails[]>([])
  const [fullReport, setFullReport] = useState<FullClassReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState<ClassAttendanceReport | null>(null)
  const [showClassModal, setShowClassModal] = useState(false)
  const [subjectName, setSubjectName] = useState<string>('')
  
  const [isSidebarCollapsed] = useSidebarCollapsed()

  const tutorId = searchParams.get('tutorId')
  const subjectId = searchParams.get('subjectId')
  const subjectNameParam = searchParams.get('subjectName')

  const loadSubjectData = useCallback(async () => {
    if (!user?.email || !tutorId || !subjectId) return

    setLoading(true)
    try {
      // Verify the current user is the same as the tutorId
      const currentTutorInfo = await peertutorsAuthService.getpeertutorsByEmail(user.email)
      
      if (!currentTutorInfo || currentTutorInfo.id !== tutorId) {
        router.push('/peer/reports')
        return
      }

      // Get scheduled classes for this subject
      const classes = await ReportService.getSubjectScheduledClasses(tutorId, subjectNameParam || '')
      setScheduledClasses(classes)
      
      // Get full report data
      const report = await ReportService.getSubjectFullClassReport(tutorId, subjectNameParam || '')
      setFullReport(report)

    } catch (error) {
      console.error('Error loading subject data:', error)
    } finally {
      setLoading(false)
    }
  }, [user, tutorId, subjectId, subjectNameParam, router])

  useEffect(() => {
    if (tutorId && subjectId && subjectNameParam && user?.email) {
      setSubjectName(subjectNameParam)
      loadSubjectData()
    }
  }, [tutorId, subjectId, subjectNameParam, user?.email, loadSubjectData])

  const handleClassClick = async (scheduledClass: ScheduledClassWithDetails) => {
    const status = getCompletionStatus(scheduledClass).status
    if (status !== 'completed') return // Guard clause for incomplete classes

    try {
      const classReport = await ReportService.getClassAttendanceReport(scheduledClass.id)
      if (classReport) {
        setSelectedClass(classReport)
        setShowClassModal(true)
      }
    } catch (error) {
      console.error('Error loading class attendance report:', error)
    }
  }

  const getCompletionStatus = (scheduledClass: ScheduledClassWithDetails) => {
    if (scheduledClass.completion_status === 'completed' || 
        (scheduledClass.attendance_completed && scheduledClass.topics_completed)) {
      return { status: 'completed', color: 'bg-emerald-50 text-emerald-600 border-emerald-100', label: 'Completed' }
    } else if (scheduledClass.completion_status === 'pending' || 
               scheduledClass.attendance_completed || scheduledClass.topics_completed) {
      return { status: 'pending', color: 'bg-amber-50 text-amber-600 border-amber-100', label: 'Pending' }
    } else {
      return { status: 'not_started', color: 'bg-gray-50 text-gray-600 border-gray-100', label: 'Not Started' }
    }
  }

  const totalClasses = scheduledClasses.length
  const completedClasses = scheduledClasses.filter(c => getCompletionStatus(c).status === 'completed').length
  const pendingClasses = scheduledClasses.filter(c => getCompletionStatus(c).status !== 'completed').length

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col`}>
        <PageHeader
            title={subjectName.toUpperCase() || "SUBJECT DETAILS"}
            tagline="Class Performance & History"
            // context="Reports" // Optional context
            onToggleSidebar={() => setIsSidebarOpen(true)}
            isSidebarCollapsed={isSidebarCollapsed}
        >
             <button
                onClick={() => router.back()}
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm"
              >
                <ArrowLeft size={14} />
                Back
             </button>
        </PageHeader>

        <main className="flex-1 p-6 overflow-y-auto bg-gray-50/50">
          <div className="max-w-[1600px] mx-auto w-full">
            {loading ? (
               <div className="flex items-center justify-center py-32">
                 <LoadingSpinner size="lg" className="mr-3" />
                 <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading Report...</span>
               </div>
            ) : (
              <div className="space-y-8">
                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Total Classes */}
                    <Card className="p-6 rounded-[2rem] border-none shadow-sm bg-white relative overflow-hidden group hover:shadow-md  duration-300">
                        <div className="relative z-10 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Classes</p>
                                <h3 className="text-3xl font-black text-gray-900 tracking-tight">{totalClasses}</h3>
                            </div>
                        </div>
                        <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors"></div>
                    </Card>

                    {/* Completed Classes */}
                    <Card className="p-6 rounded-[2rem] border-none shadow-sm bg-white relative overflow-hidden group hover:shadow-md transition-all duration-300">
                        <div className="relative z-10 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Completed</p>
                                <h3 className="text-3xl font-black text-emerald-500 tracking-tight">{completedClasses}</h3>
                            </div>
                        </div>
                        <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors"></div>
                    </Card>

                    {/* Pending Classes */}
                    <Card className="p-6 rounded-[2rem] border-none shadow-sm bg-white relative overflow-hidden group hover:shadow-md transition-all duration-300">
                        <div className="relative z-10 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pending</p>
                                <h3 className="text-3xl font-black text-amber-500 tracking-tight">{pendingClasses}</h3>
                            </div>
                        </div>
                        <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors"></div>
                    </Card>
                </div>

                {/* Full Attendance Report Table */}
                {fullReport && (
                  <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 overflow-hidden">
                     <div className="flex flex-row items-center justify-between mb-8 border-b border-gray-50 pb-4">
                        <div className="flex items-center gap-3">
                           <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest leading-none">Detailed Attendance Report</h4>
                        </div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                           Subject: <span className="text-gray-900">{fullReport.subject_name}</span>
                        </div>
                     </div>
                     
                     {/* Mobile View (Cards) */}
                     <div className="md:hidden space-y-4">
                        {fullReport.rows.map((row, index) => (
                           <div key={row.student_id} className="p-5 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col gap-4">
                              <div className="flex items-start justify-between">
                                 <div>
                                    <div className="flex items-center gap-2 mb-1">
                                       <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] font-bold text-gray-500">
                                          {index + 1}
                                       </span>
                                       <h4 className="text-sm font-bold text-gray-900">{row.student_name}</h4>
                                    </div>
                                    {/* <p className="text-[10px] text-gray-400 pl-7">{row.student_email}</p> */}
                                 </div>
                                 <div className="text-right">
                                    <div className="text-xl font-black text-gray-900">{row.stats.percentage}%</div>
                                    <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{row.stats.present} Present</div>
                                 </div>
                              </div>

                              {/* Recent History (Last 5 Classes) */}
                              <div>
                                 <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Recent History</p>
                                 <div className="flex items-center justify-between gap-1">
                                    {fullReport.columns.slice(-5).map(col => {
                                       const status = row.attendance[col.id]
                                       return (
                                          <div key={col.id} className="flex flex-col items-center gap-1 w-full">
                                             <div 
                                                className={`w-full h-1.5 rounded-full ${
                                                   status === 'present' ? 'bg-emerald-500' :
                                                   status === 'absent' ? 'bg-red-500' :
                                                   status === 'on_duty' ? 'bg-blue-500' : 'bg-gray-200'
                                                }`}
                                             />
                                             <span className="text-[9px] font-medium text-gray-400">
                                                {new Date(col.date).getDate()}
                                             </span>
                                          </div>
                                       )
                                    })}
                                    {fullReport.columns.length === 0 && (
                                       <span className="text-[10px] text-gray-400 italic">No classes yet</span>
                                    )}
                                 </div>
                              </div>
                           </div>
                        ))}
                        {fullReport.rows.length === 0 && (
                           <div className="p-8 text-center text-gray-500 text-sm">
                              No student data available.
                           </div>
                        )}
                     </div>

                     {/* Desktop View (Table) */}
                     <div className="hidden md:block overflow-x-auto">
                        <table className="w-full border-collapse min-w-[1000px]">
                           <thead>
                              <tr>
                                 <th className="p-3 border border-gray-200 bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center w-[50px]">S.No</th>
                                 <th className="p-3 border border-gray-200 bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-widest text-left min-w-[200px] sticky left-0 z-10">Student Name</th>
                                 {/* Class Columns */}
                                 {fullReport.columns.map(col => (
                                    <th key={col.id} className="p-2 border border-gray-200 bg-gray-50 text-[9px] font-bold text-gray-500 uppercase tracking-wider text-center min-w-[80px]">
                                       <div className="flex flex-col gap-1">
                                          <span>{new Date(col.date).toLocaleDateString(undefined, {month:'numeric', day:'numeric'})}</span>
                                          <span className="text-gray-400">{col.time === 'Additional' ? '' : col.time}</span>
                                          {col.is_additional && <span className="text-purple-600 font-bold">(A)</span>}
                                       </div>
                                    </th>
                                 ))}
                                 <th className="p-3 border border-gray-200 bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center w-[80px]">Present</th>
                                 <th className="p-3 border border-gray-200 bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center w-[60px]">%</th>
                              </tr>
                           </thead>
                           <tbody>
                              {fullReport.rows.map((row, index) => (
                                 <tr key={row.student_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-3 border border-gray-200 text-center text-xs text-gray-600 font-medium">{index + 1}</td>
                                    <td className="p-3 border border-gray-200 text-left text-xs text-gray-900 font-bold sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                       {row.student_name}
                                       {/* <div className="text-[10px] text-gray-400 font-normal">{row.student_email}</div> */}
                                    </td>
                                    {fullReport.columns.map(col => {
                                       const status = row.attendance[col.id];
                                       return (
                                          <td key={col.id} className="p-2 border border-gray-200 text-center">
                                             {status === 'present' ? (
                                                <span className="text-emerald-600 font-black text-xs">P</span>
                                             ) : status === 'absent' ? (
                                                <span className="text-red-500 font-medium text-xs">A</span>
                                             ) : status === 'on_duty' ? (
                                                <span className="text-blue-500 font-medium text-xs">OD</span>
                                             ) : (
                                                <span className="text-gray-300">-</span>
                                             )}
                                          </td>
                                       )
                                    })}
                                    <td className="p-3 border border-gray-200 text-center text-xs font-bold text-gray-900">{row.stats.present}</td>
                                    <td className="p-3 border border-gray-200 text-center text-xs font-bold text-gray-900">{row.stats.percentage}%</td>
                                 </tr>
                              ))}
                              {fullReport.rows.length === 0 && (
                                 <tr>
                                    <td colSpan={fullReport.columns.length + 4} className="p-8 text-center text-gray-500 text-sm">
                                       No student data available.
                                    </td>
                                 </tr>
                              )}
                           </tbody>
                        </table>
                     </div>
                  </Card>
                )}

                {/* Scheduled Classes Table */}
                <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 overflow-hidden">
                  <div className="flex flex-row items-center justify-between mb-8 border-b border-gray-50 pb-4">
                     <div className="flex items-center gap-3">
                        <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest leading-none">Class Schedule</h4>
                        <span className="bg-gray-100 text-gray-500 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
                           {scheduledClasses.length} Classes
                        </span>
                     </div>
                  </div>

{/* Desktop View (Table) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left border-b border-gray-100">
                          <th className="pb-4 pl-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-[20%]">Date</th>
                          <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-[40%]">Topics</th>
                          <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center w-[20%]">Status</th>
                          <th className="pb-4 pr-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right w-[20%]">Action</th>
                        </tr>
                      </thead>
                      <tbody className="space-y-2">
                        {scheduledClasses.map((scheduledClass) => {
                          const { status, color, label } = getCompletionStatus(scheduledClass)
                          const isCompleted = status === 'completed'

                          return (
                            <tr key={scheduledClass.id} className="group hover:bg-gray-50/80 transition-colors border-b border-gray-50 last:border-0">
                               <td className="py-4 pl-4 align-top">
                                  <div className="flex flex-col">
                                     <span className="text-sm font-bold text-gray-900">
                                        {new Date(scheduledClass.scheduled_date).toLocaleDateString(undefined, {
                                            month: 'short', day: 'numeric', year: 'numeric'
                                        })}
                                     </span>
                                     <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mt-0.5">
                                        {new Date(scheduledClass.scheduled_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                     </span>
                                  </div>
                               </td>
                               <td className="py-4 align-top">
                                  <p className="text-sm text-gray-600 font-medium line-clamp-2 leading-relaxed max-w-md">
                                     {scheduledClass.topics || <span className="text-gray-400 italic font-normal">No topics specified</span>}
                                  </p>
                               </td>
                               <td className="py-4 align-top text-center">
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${color}`}>
                                     {label}
                                  </span>
                               </td>
                               <td className="py-4 pr-4 align-top text-right">
                                  {isCompleted ? (
                                    <button
                                      onClick={() => handleClassClick(scheduledClass)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-black text-blue-600 uppercase tracking-wider hover:bg-blue-50 hover:border-blue-100 hover:text-blue-700 transition-all shadow-sm"
                                    >
                                      View <Eye size={12} />
                                    </button>
                                  ) : (
                                    <span className="inline-block px-3 py-1.5 text-[10px] font-bold text-gray-300 uppercase tracking-wider cursor-not-allowed select-none">
                                        ---
                                    </span>
                                  )}
                               </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile View (Cards) */}
                  <div className="md:hidden space-y-4">
                    {scheduledClasses.map((scheduledClass) => {
                       const { status, color, label } = getCompletionStatus(scheduledClass)
                       const isCompleted = status === 'completed'

                       return (
                         <div key={scheduledClass.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 space-y-3">
                            {/* Date & Time Header */}
                            <div className="flex items-start justify-between">
                               <div className="flex flex-col">
                                  <span className="text-sm font-black text-gray-900 uppercase">
                                     {new Date(scheduledClass.scheduled_date).toLocaleDateString(undefined, {
                                         day: '2-digit', month: 'short', year: 'numeric'
                                     })}
                                  </span>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                     {new Date(scheduledClass.scheduled_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                               </div>
                               <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${color}`}>
                                  {label}
                               </span>
                            </div>

                            {/* Topics */}
                            <div>
                               <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Topics</p>
                               <p className="text-sm text-gray-700 font-medium line-clamp-3">
                                  {scheduledClass.topics || <span className="text-gray-400 italic font-normal">No topics specified</span>}
                               </p>
                            </div>

                            {/* Action */}
                            <div className="pt-3 border-t border-gray-200 flex justify-end">
                               {isCompleted ? (
                                  <button
                                    onClick={() => handleClassClick(scheduledClass)}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-black text-blue-600 uppercase tracking-wider hover:bg-blue-50 hover:border-blue-100 hover:text-blue-700 transition-all shadow-sm w-full justify-center"
                                  >
                                    View Details <Eye size={14} />
                                  </button>
                               ) : (
                                  <div className="w-full text-center py-2 text-[10px] font-bold text-gray-300 uppercase tracking-wider bg-gray-100 rounded-lg select-none">
                                     Not Started
                                  </div>
                               )}
                            </div>
                         </div>
                       )
                    })}
                  </div>

                  {scheduledClasses.length === 0 && (
                     <div className="py-12 text-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                           <Calendar size={24} className="text-gray-300" />
                        </div>
                        <p className="text-xs font-black text-gray-900 uppercase tracking-widest mb-1">No Schedule Found</p>
                        <p className="text-[10px] text-gray-400">Classes for this subject will appear here.</p>
                     </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Class Details Modal */}
      {showClassModal && selectedClass && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative mx-auto w-full max-w-4xl shadow-2xl rounded-[2rem] bg-white border border-gray-100 overflow-hidden">
            {/* Modal Header */}
             <div className="bg-gray-50/50 border-b border-gray-100 px-8 py-6 flex items-center justify-between">
                <div>
                   <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">
                      Class Details
                   </h3>
                   <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{selectedClass.subject_name}</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                         {new Date(selectedClass.scheduled_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                   </div>
                </div>
                <button
                  onClick={() => {
                    setShowClassModal(false)
                    setSelectedClass(null)
                  }}
                  className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:border-gray-300 transition-colors"
                >
                  <span className="sr-only">Close</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
             </div>

             <div className="p-8 space-y-8">
               {/* Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Attendance Rate</p>
                      <div className="flex items-baseline gap-2">
                         <span className="text-2xl font-black text-gray-900">
                            {Math.round((selectedClass.present_count / (selectedClass.present_count + selectedClass.absent_count)) * 100)}%
                         </span>
                         <span className="text-xs font-bold text-gray-400 uppercase">Present</span>
                      </div>
                   </div>
                   <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                      <p className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-wider mb-1">Present Students</p>
                      <div className="flex items-baseline gap-2">
                         <span className="text-2xl font-black text-emerald-600">{selectedClass.present_count}</span>
                         <span className="text-xs font-bold text-emerald-600/70 uppercase">Students</span>
                      </div>
                   </div>
                   <div className="p-4 rounded-2xl bg-red-50 border border-red-100">
                      <p className="text-[10px] font-bold text-red-600/70 uppercase tracking-wider mb-1">Absent Students</p>
                      <div className="flex items-baseline gap-2">
                         <span className="text-2xl font-black text-red-600">{selectedClass.absent_count}</span>
                         <span className="text-xs font-bold text-red-600/70 uppercase">Students</span>
                      </div>
                   </div>
                </div>

                {/* Topics */}
                {selectedClass.topics && (
                   <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Topics Covered</p>
                      <p className="text-sm font-medium text-gray-700 leading-relaxed">{selectedClass.topics}</p>
                   </div>
                )}

                {/* Student List */}
                <div>
                   <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4">Detailed Attendance Log</h4>
                   <div className="border border-gray-200 rounded-2xl overflow-hidden">
                     <table className="w-full">
                       <thead className="bg-gray-50 border-b border-gray-200">
                         <tr>
                           <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Student</th>
                           <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Email</th>
                           <th className="px-6 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-100 bg-white">
                         {selectedClass.attendance_records.map((record) => (
                           <tr key={record.student_id} className="hover:bg-gray-50/50">
                             <td className="px-6 py-3.5 text-sm font-bold text-gray-900">
                               {record.student_name}
                             </td>
                             <td className="px-6 py-3.5 text-xs font-medium text-gray-500">
                               {record.student_email}
                             </td>
                             <td className="px-6 py-3.5 text-center">
                               <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                                 record.status === 'present' 
                                   ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                   : 'bg-red-50 text-red-600 border-red-100'
                               }`}>
                                 {record.status === 'present' ? 'Present' : 'Absent'}
                               </span>
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  )
}

