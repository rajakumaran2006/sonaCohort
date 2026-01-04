'use client'

import { useState, useMemo } from 'react'

import Image from 'next/image'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { NotificationCenter, Notification } from '@/components/common/NotificationCenter'
import PeerRenumerationModal from '@/components/forms/PeerRenumerationModal'
import { Card, LoadingSpinner } from '@/components/ui'
import { 
  ArrowUpRight, 
  ChevronRight,
  MoreHorizontal
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useQueryClient } from '@tanstack/react-query'
import { 
  usePeerTutorInfo, 
  useAssignedStudents, 
  useRenumerations, 
  useClassStats, 
  useStudentAttendanceStats,
  useActiveFeedbackForms,
  usePendingClassAlert
} from '@/lib/hooks/usePeerDashboardData'
import { PeerTutorRenumeration } from '@/lib/services/renumerationService'

export default function PeerDashboardPage() {
  return (
    <PeerProtectedRoute>
      <PeerDashboardContent />
    </PeerProtectedRoute>
  )
}

function PeerDashboardContent() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showRenumerationModal, setShowRenumerationModal] = useState(false)
  const [selectedRenumeration, setSelectedRenumeration] = useState<PeerTutorRenumeration | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Use custom hook for sidebar collapsed state
  const [isSidebarCollapsed] = useSidebarCollapsed()

  // --- DATA FETCHING WITH HOOKS ---
  const { data: peerTutorInfo, isLoading: isTutorLoading } = usePeerTutorInfo(user?.email)
  
  const { data: assignedStudents = [], isLoading: isStudentsLoading } = useAssignedStudents(peerTutorInfo?.id)
  
  const { data: renumerations = [], isLoading: isRenumerationsLoading } = useRenumerations(peerTutorInfo?.id)
  
  // Only fetch class stats if we have students (to match original logic, though strictly not necessary)
  const { data: classStats, isLoading: isClassStatsLoading } = useClassStats(peerTutorInfo?.id)
  const classesTaken = classStats?.completedClasses ?? 0
  const totalClassesAllocated = classStats?.totalClasses ?? 0
  
  const { data: studentsWithAttendance = [], isLoading: isAttendanceLoading } = useStudentAttendanceStats(assignedStudents, peerTutorInfo?.id)

  const { data: alertData } = usePendingClassAlert(peerTutorInfo)
  const showPendingAlert = alertData?.showPendingAlert ?? false
  const consecutivePendingCount = alertData?.consecutivePendingCount ?? 0

  const { data: activeFeedbackForms = [] } = useActiveFeedbackForms(peerTutorInfo?.id)

  // Combined Loading State
  // We can be a bit selective about what blocks the UI or show skeletons. 
  // For now, let's keep the main loading spinner logic similar to before.
  const loading = isTutorLoading || isStudentsLoading || isRenumerationsLoading || isClassStatsLoading

  // Attendance loading is separate for the table
  const loadingAttendance = isAttendanceLoading

  const handleExportToExcel = () => {
    if (studentsWithAttendance.length === 0) {
      alert('No data to export')
      return
    }

    const exportData = studentsWithAttendance.map((student: { name: string; email: string; dept: string; year: string; section: string; classesPresent: number; classesAbsent: number; attendancePercentage: number }) => ({
      'Student Name': student.name,
      'Email': student.email,
      'Department': student.dept,
      'Year': student.year,
      'Section': student.section,
      'Classes Present': student.classesPresent,
      'Classes Absent': student.classesAbsent,
      'Attendance Percentage': `${student.attendancePercentage}%`
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Assigned Students')
    const filename = `assigned-students-${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['peerTutor'] }),
            queryClient.invalidateQueries({ queryKey: ['assignedStudents'] }),
            queryClient.invalidateQueries({ queryKey: ['renumerations'] }),
            queryClient.invalidateQueries({ queryKey: ['classStats'] }),
            queryClient.invalidateQueries({ queryKey: ['studentAttendance'] }),
            queryClient.invalidateQueries({ queryKey: ['activeFeedbackForms'] }),
            queryClient.invalidateQueries({ queryKey: ['pendingClassAlert'] })
        ])
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  const completionPercentage = totalClassesAllocated > 0 
    ? Math.round((classesTaken / totalClassesAllocated) * 100) 
    : 0

  const notifications: Notification[] = useMemo(() => {
    const items: Notification[] = []

    // 1. Pending Renumerations
    renumerations.forEach(r => {
      if (r.status === 'pending') {
        items.push({
          id: `renum-${r.id}`,
          title: 'Renumeration Pending',
          message: `${r.template?.name || 'Form'} is waiting for your submission.`,
          type: 'action_required',
          timestamp: new Date(r.created_at),
          read: false,
          actionLabel: 'Fill Form',
          onClick: () => {
            setSelectedRenumeration(r)
            setShowRenumerationModal(true)
          }
        })
      }
    })

    // 2. Active Feedback Forms
    activeFeedbackForms.forEach(f => {
      items.push({
        id: `feedback-${f.id}`,
        title: 'Feedback Requested',
        message: `Please submit feedback for ${f.name}.`,
        type: 'action_required',
        timestamp: new Date(f.created_at),
        read: false, 
        actionLabel: 'View Details',
        onClick: () => {

        }
      })
    })

    // 3. Pending Classes Alert
    if (showPendingAlert) {
      items.push({
        id: 'pending-alert',
        title: 'Class Completion Pending',
        message: `You have ${consecutivePendingCount} classes pending. Action required.`,
        type: 'warning',
        timestamp: new Date(),
        read: false,
      })
    }



    return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }, [renumerations, activeFeedbackForms, showPendingAlert, consecutivePendingCount])

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col`}>
        <PageHeader
          title="DASHBOARD"
          tagline="Role & Performance Overview"
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        >
          <NotificationCenter notifications={notifications} />
        </PageHeader>

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
              <div className="flex items-center justify-center py-32">
                <LoadingSpinner size="lg" className="mr-3" />
                <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 w-full">
                
                {/* --- LEFT COLUMN --- */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                  
                  {/* Hero Card - Assignment Profile */}
                  <div className="bg-gradient-to-br from-[#1C2434] to-[#2D3748] text-white rounded-[2rem] p-8 relative overflow-hidden shadow-2xl border border-white/10 group">
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-6">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10B981]"></span>
                        <span className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">Assignment Profile</span>
                      </div>
                      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                          <p className="text-sm text-gray-400 font-bold mb-1 uppercase tracking-wider">
                            {peerTutorInfo?.dept || 'Department'}
                          </p>
                          <h3 className="text-3xl font-black tracking-tight mb-4 leading-none text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                            {peerTutorInfo?.name || 'Peer Tutor'}
                          </h3>
                          <div className="flex flex-wrap gap-2 mt-2">
                             {peerTutorInfo?.year && (
                               <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-lg text-[10px] font-bold border border-white/5 text-gray-300 uppercase tracking-wider">
                                 Year {peerTutorInfo.year}
                               </span>
                             )}
                             {peerTutorInfo?.section && (
                               <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-lg text-[10px] font-bold border border-white/5 text-gray-300 uppercase tracking-wider">
                                 Section {peerTutorInfo.section}
                               </span>
                             )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/5 min-w-[100px]">
                                <p className="text-[9px] text-gray-400 uppercase font-black mb-1 tracking-wider">Classes</p>
                                <div className="flex items-baseline gap-1">
                                  <p className="text-xl font-bold">{classesTaken}</p>
                                  <span className="text-[10px] text-gray-500 font-bold">/ {totalClassesAllocated}</span>
                                </div>
                            </div>
                            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/5 min-w-[100px]">
                                <p className="text-[9px] text-gray-400 uppercase font-black mb-1 tracking-wider">Progress</p>
                                <p className="text-xl font-bold text-emerald-400">{completionPercentage}%</p>
                            </div>
                        </div>
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-emerald-500/20 transition-all duration-700"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl -ml-20 -mb-20 transition-all duration-700"></div>
                  </div>

                  {/* Assigned Students List */}
                  <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 overflow-hidden flex flex-col flex-1">
                    <div className="flex flex-row items-center justify-between mb-8 border-b border-gray-50 pb-4">
                      <div className="flex items-center gap-3">
                         <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest leading-none">Assigned Students</h4>
                         <span className="bg-gray-100 text-gray-500 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
                            Total: {assignedStudents.length}
                         </span>
                      </div>
                      
                      {studentsWithAttendance.length > 0 && (
                        <button 
                          onClick={handleExportToExcel}
                          className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-[10px] font-black text-gray-600 uppercase tracking-widest transition-all border border-transparent hover:border-gray-200"
                        >
                          <ArrowUpRight size={12} />
                          Export List
                        </button>
                      )}
                    </div>
                    
                    {loadingAttendance ? (
                       <div className="flex items-center justify-center py-12">
                          <LoadingSpinner size="sm" className="mr-2" />
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Loading stats...</span>
                       </div>
                    ) : studentsWithAttendance.length > 0 ? (
                       <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 max-h-[500px]">
                          {studentsWithAttendance.map((student: { id: string; name: string; email: string; dept: string; year: string; section: string; classesPresent: number; classesAbsent: number; attendancePercentage: number }) => (
                             <div key={student.id} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-2xl border border-transparent hover:border-blue-100 hover:bg-white transition-all duration-300 group cursor-default">
                                <div className="flex items-center gap-4">
                                   <div className="w-12 h-12 rounded-xl bg-[#1C2434] text-white flex items-center justify-center text-xs font-bold shadow-md shadow-gray-200 group-hover:scale-105 transition-transform duration-300">
                                      {student.name.substring(0, 2).toUpperCase()}
                                   </div>
                                   <div>
                                      <h5 className="text-[13px] font-bold text-gray-900 leading-tight mb-1 group-hover:text-blue-600 transition-colors">{student.name}</h5>
                                      <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                                         <span>{student.dept}</span>
                                         <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                         <span>Year {student.year}</span>
                                         <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                         <span>{student.email}</span>
                                      </div>
                                   </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                   <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                                      student.attendancePercentage >= 75 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                      student.attendancePercentage >= 60 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-red-50 text-red-600 border-red-100'
                                   }`}>
                                      {student.attendancePercentage}% Attendance
                                   </div>
                                   <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                       {student.classesPresent} / {student.classesPresent + student.classesAbsent} Classes
                                   </span>
                                </div>
                             </div>
                          ))}
                       </div>
                    ) : (
                       <div className="py-20 flex flex-col items-center justify-center text-center">
           <div className="w-16 h-16  rounded-full flex items-center justify-center mb-4">
                  <Image src="/icons/student.png" alt="student" width={64} height={64} />
               </div>
                          <p className="text-xs font-black text-gray-900 uppercase tracking-widest mb-1">No Students Assigned</p>
                          <p className="text-[10px] text-gray-400 max-w-[200px] font-medium leading-relaxed">Students allocated to you will appear here.</p>
                       </div>
                    )}
                  </Card>
                </div>


                {/* --- RIGHT COLUMN --- */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  
                  {/* Performance Chart */}
                  {/* Class Progress Card */}

                  <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 relative overflow-hidden group hover:shadow-md transition-shadow duration-300">
                     <div className="flex flex-row items-center justify-between mb-6">
                       <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest leading-none">Class Progress</h4>
                       <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                          completionPercentage >= 75 ? 'bg-emerald-50 text-emerald-600' :
                          completionPercentage >= 40 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
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
                           {/* Background track stripes */}
                           <div className="absolute inset-0 opacity-30 bg-[linear-gradient(45deg,rgba(0,0,0,0.02)_25%,transparent_25%,transparent_50%,rgba(0,0,0,0.02)_50%,rgba(0,0,0,0.02)_75%,transparent_75%,transparent)] bg-[length:10px_10px]"></div>
                           
                           {/* Active Bar */}
                           <div 
                              className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full relative transition-all duration-1000 ease-out group-hover/bar:brightness-110"
                              style={{ width: `${completionPercentage}%` }}
                           >
                              {/* Shimmer effect */}
                              <div className="absolute inset-0 bg-white/30 skew-x-12 -translate-x-full animate-[shimmer_1.5s_infinite]"></div>
                           </div>

                           {/* Tooltip on Hover */}
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


                  {/* Renumeration Section */}
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
                        {renumerations.length > 0 ? (
                           renumerations.map((renumeration) => (
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
                           ))
                        ) : (
                           <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16  rounded-full flex items-center justify-center mb-4">
                   <Image src="/icons/search.png" alt="search" width={64} height={64} />
               </div>
                              <p className="text-xs font-black text-gray-900 uppercase tracking-widest mb-1">No Active Forms</p>
                              <p className="text-[10px] text-gray-400 max-w-[200px] font-medium leading-relaxed">Renumeration forms will appear here.</p>
                           </div>
                        )}
                     </div>
                  </Card>
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
            // Refetch renumerations when a form is submitted
            queryClient.invalidateQueries({ queryKey: ['renumerations'] })
          }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
   const styles = {
      pending: "bg-amber-50 text-amber-600 border-amber-100",
      submitted: "bg-blue-50 text-blue-600 border-blue-100",
      approved: "bg-emerald-50 text-emerald-600 border-emerald-100",
      rejected: "bg-red-50 text-red-600 border-red-100",
   }
   
   const label = status === 'submitted' ? 'Reviewing' : status

   return (
      <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest border ${styles[status as keyof typeof styles] || 'bg-gray-50 text-gray-500 border-gray-100'}`}>
         {label}
      </span>
   )
}
