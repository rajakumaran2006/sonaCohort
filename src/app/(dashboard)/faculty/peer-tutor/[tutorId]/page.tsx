'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { peertutorservice, peertutors } from '@/lib/services/peerTutorService'
import { StudentService, Student } from '@/lib/services/studentService'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { AdditionalClassService, AdditionalClassWithAttendance } from '@/lib/services/additionalClassService'
import { RenumerationService, peertutorsRenumeration } from '@/lib/services/renumerationService'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Card } from '@/components/ui'
import PeerTutorClassLogs from '@/components/features/classes/PeerTutorClassLogs'
import { 
  CheckCircle, 
  ChevronLeft,
  Mail,
  GraduationCap,
  User,
  Hash,
  FileText,
  AlertCircle,
  ClipboardList
} from '@/components/icons/CustomFacultyIcons'
import PeerTutorProfileSkeleton from '@/components/skeletons/PeerTutorProfileSkeleton'
import { logger } from '@/lib/logger'

export default function PeerTutorsProfilePage() {
  return (
    <FacultyProtectedRoute>
      <PeerTutorsProfileContent />
    </FacultyProtectedRoute>
  )
}

interface peerTutortats {
  totalClasses: number
  completedClasses: number
  pendingClasses: number
  upcomingClasses: number
  overdueClasses: number
  assignedStudents: number
}

function PeerTutorsProfileContent() {
  const { user } = useAuth()
  const params = useParams()
  const router = useRouter()
  const tutorId = params.tutorId as string

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Use custom hook for sidebar collapsed state
  const [isSidebarCollapsed] = useSidebarCollapsed()

  const [peertutors, setpeertutors] = useState<peertutors | null>(null)
  const [assignedStudents, setAssignedStudents] = useState<Student[]>([])
  const [scheduledClasses, setScheduledClasses] = useState<ScheduledClassWithDetails[]>([])
  const [additionalClasses, setAdditionalClasses] = useState<AdditionalClassWithAttendance[]>([])
  const [renumerations, setRenumerations] = useState<peertutorsRenumeration[]>([])
  const [stats, setStats] = useState<peerTutortats>({
    totalClasses: 0,
    completedClasses: 0,
    pendingClasses: 0,
    upcomingClasses: 0,
    overdueClasses: 0,
    assignedStudents: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user && tutorId) {
      loadpeertutorsData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tutorId])

  const loadpeertutorsData = async () => {
    if (!user?.email || !tutorId) return

    setLoading(true)
    try {
      // Get peer tutor information
      const tutorData = await peertutorservice.getpeertutorsById(tutorId)
      if (tutorData) {
        setpeertutors(tutorData)

        // Get assigned students
        const students = await StudentService.getStudentsBypeertutors(tutorId)
        setAssignedStudents(students)

        // Get scheduled classes for this peer tutor
        const classes = await ScheduledClassService.getScheduledClassesByYearSection(
          tutorData.dept,
          tutorData.year,
          tutorData.section
        )
        setScheduledClasses(classes)

        // Get additional classes for this peer tutor
        const addClasses = await AdditionalClassService.getAdditionalClassesBypeertutors(tutorData.id)
        setAdditionalClasses(addClasses)

        // Get renumeration data for this peer tutor
        const renumerationData = await RenumerationService.getpeertutorsRenumeration(tutorId)
        setRenumerations(renumerationData)

        // Calculate statistics
        const totalClasses = classes.length
        const completedClasses = classes.filter(c =>
          c.completion_status === 'completed' ||
          (c.attendance_completed && c.topics_completed)
        ).length

        const pendingClassesList = classes.filter(c =>
          c.completion_status !== 'completed' &&
          !(c.attendance_completed && c.topics_completed)
        )
        const pendingClasses = pendingClassesList.length

        // Calculate Upcoming vs Overdue
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        let upcomingClasses = 0
        let overdueClasses = 0

        pendingClassesList.forEach(c => {
          if (!c.scheduled_date) {
            overdueClasses++
            return
          }
          const classDate = new Date(c.scheduled_date)
          classDate.setHours(0, 0, 0, 0)

          if (classDate.getTime() > today.getTime()) {
            upcomingClasses++
          } else {
            overdueClasses++
          }
        })

        setStats({
          totalClasses,
          completedClasses,
          pendingClasses,
          upcomingClasses,
          overdueClasses,
          assignedStudents: students.length
        })
      }
    } catch (error) {
      logger.error('Error loading peer tutor data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    router.back()
  }

  // Render loading state with skeleton
  if (loading) {
    return <PeerTutorProfileSkeleton />
  }

  // Render error state with sidebar
  if (!peertutors) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex">
        <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} w-full lg:w-auto`}>
          <PageHeader
            title="Error"
            onToggleSidebar={() => setIsSidebarOpen(true)}
            isSidebarCollapsed={isSidebarCollapsed}
          />
          <div className="flex-1 p-6 flex items-center justify-center">
            <div className="text-center max-w-md mx-auto">
              <div className="w-20 h-20 bg-red-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <ClipboardList className="w-10 h-10 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Peer Tutor Not Found</h3>
              <p className="text-gray-500 mb-8">The requested peer tutor profile could not be retrieved. They may have been removed or accessed incorrectly.</p>
              <button
                onClick={handleBack}
                className="px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors font-semibold flex items-center justify-center mx-auto gap-2"
              >
                <ChevronLeft width={18} height={18} />
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
      {/* Sidebar */}
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} w-full lg:w-auto`}>
        {/* Header */}
        <PageHeader
          title="PEER TUTOR"
          context={peertutors.name}
          tagline={`${peertutors.email} • ${peertutors.dept} - ${peertutors.year} - ${peertutors.section}`}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        >
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-xs font-bold uppercase tracking-wider border border-gray-200 shadow-sm"
          >
            <ChevronLeft width={14} height={14} />
            Back
          </button>
        </PageHeader>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto bg-gray-50/50">
          <div className="max-w-[1600px] mx-auto w-full space-y-6">

            {/* Profile & Quick Stats Row */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Profile Card */}
              <div className="lg:col-span-8">
                <div className="bg-gradient-to-br from-[#1C2434] to-[#2D3748] text-white rounded-[2rem] p-8 relative overflow-hidden shadow-2xl border border-white/10 h-full flex flex-col justify-center">
                  <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-8">
                    <div className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-3xl font-bold tracking-tighter shadow-xl">
                      {peertutors.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10B981]"></span>
                        <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">Peer Tutor</span>
                      </div>
                      <h2 className="text-3xl font-bold tracking-tight mb-2">{peertutors.name}</h2>
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm text-gray-300 mb-6">
                        <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full border border-white/5"><Mail width={14} height={14} /> {peertutors.email}</span>
                        <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full border border-white/5"><GraduationCap width={14} height={14} /> {peertutors.dept}</span>
                        <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full border border-white/5"><Calendar width={14} height={14} /> Year {peertutors.year}</span>
                        <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full border border-white/5"><Hash width={14} height={14} /> Sec {peertutors.section}</span>
                      </div>
                      <p className="text-xs text-gray-400">
                        Assigned by <span className="text-white font-medium">{peertutors.assigned_by}</span>
                      </p>
                    </div>
                  </div>
                  {/* Decorators */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl -ml-20 -mb-20"></div>
                </div>
              </div>

              {/* Quick Stats Grid */}
              <div className="lg:col-span-4 grid grid-cols-2 gap-4">
                <Card className="rounded-[2rem] shadow-sm border-none p-5 bg-white hover:shadow-md transition-all duration-300 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                  </div>
                  <div>
                    <div className="text-3xl font-black text-gray-900 tracking-tight">{stats.totalClasses}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">Total Classes</div>
                  </div>
                </Card>
                <Card className="rounded-[2rem] shadow-sm border-none p-5 bg-white hover:shadow-md transition-all duration-300 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                  </div>
                  <div>
                    <div className="text-3xl font-black text-gray-900 tracking-tight">{stats.completedClasses}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">Completed</div>
                  </div>
                </Card>
                <Card className="rounded-[2rem] shadow-sm border-none p-5 bg-white hover:shadow-md transition-all duration-300 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                  </div>
                  <div>
                    <div className="text-3xl font-black text-gray-900 tracking-tight">{stats.pendingClasses}</div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Pending</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{stats.overdueClasses} Overdue</span>
                    </div>
                  </div>
                </Card>
                <Card className="rounded-[2rem] shadow-sm border-none p-5 bg-white hover:shadow-md transition-all duration-300 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                  </div>
                  <div>
                    <div className="text-3xl font-black text-gray-900 tracking-tight">{stats.assignedStudents}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">Students</div>
                  </div>
                </Card>
              </div>
            </div>

            {/* Class Logs Section */}
            <div className="w-full">
               <PeerTutorClassLogs 
                  scheduledClasses={scheduledClasses}
                  additionalClasses={additionalClasses}
                  loading={loading}
               />
            </div>

            {/* Content Row: Renumeration & Students */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Renumeration Section */}
              <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 h-full">
                <div className="flex flex-row items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div>
                      <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">Renumeration</h4>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{renumerations.length} Assigned Forms</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {renumerations.length > 0 ? (
                    renumerations.map((renumeration) => (
                      <div key={renumeration.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-md transition-all duration-200 group">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h5 className="font-bold text-gray-900">{renumeration.template?.name || 'Renumeration Form'}</h5>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{renumeration.template?.description || 'No description'}</p>
                          </div>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${renumeration.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            renumeration.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                              renumeration.status === 'approved' ? 'bg-green-100 text-green-700' :
                                'bg-red-100 text-red-700'
                            }`}>
                            {renumeration.status || 'Unknown'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Created: {new Date(renumeration.created_at).toLocaleDateString()}</span>
                            {renumeration.submitted_at && (
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Submitted: {new Date(renumeration.submitted_at).toLocaleDateString()}</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {renumeration.status === 'submitted' && (
                              <>
                                <button
                                  className="p-1.5 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors"
                                  title="Approve"
                                  onClick={() => logger.info('Approve', renumeration.id)}
                                >
                                  <CheckCircle width={14} height={14} />
                                </button>
                                <button
                                  className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                  title="Reject"
                                  onClick={() => logger.info('Reject', renumeration.id)}
                                >
                                  <AlertCircle width={14} height={14} />
                                </button>
                              </>
                            )}
                            <button
                              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-900 transition-all shadow-sm"
                              onClick={() => logger.info('View', renumeration)}
                            >
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-12 h-12  rounded-2xl flex items-center justify-center mx-auto mb-3 text-gray-300">
                        <FileText width={24} height={24} className="text-black" />
                      </div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">No Renumeration Forms</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Assigned Students Section */}
              <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 h-full">
                <div className="flex flex-row items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div>
                      <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">Assigned Students</h4>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{assignedStudents.length} Students</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {assignedStudents.length > 0 ? (
                    assignedStudents.map((student) => (
                      <div key={student.id} className="flex items-center space-x-4 p-3 rounded-2xl hover:bg-gray-50 transition-all duration-200 group border border-transparent hover:border-gray-100">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-xs font-black text-gray-500 tracking-tighter">
                          {student.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="text-sm font-bold text-gray-900 truncate">{student.name}</h5>
                          <p className="text-xs text-gray-500 truncate">{student.email}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-gray-900">{student.year} - {student.section}</div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Student</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-gray-300">
                        <User width={24} height={24} />
                      </div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">No Students Assigned</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>

          </div>
        </main>
      </div>
    </div>
  )
}
