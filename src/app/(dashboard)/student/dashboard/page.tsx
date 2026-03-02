'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { logger } from '@/lib/logger'
import { StudentService, StudentWithpeertutors } from '@/lib/services/studentService'
import { FeedbackService, FeedbackForm } from '@/lib/services/feedbackService'
import { useStudentAttendanceData } from '@/lib/hooks/useStudentDashboardData'
import { useStudentLeaderboard } from '@/lib/hooks/useStudentDashboardData'
import FeedbackSubmissionModal from '@/components/forms/feedback/FeedbackSubmissionModal'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import PageHeader from '@/components/layout/PageHeader'
import PeerLeaderboard from '@/components/dashboard/PeerLeaderboard'
import { Button, EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, StatusBadge } from '@/components/ui'
import { CalendarCheck, BookOpen, AlertCircle } from 'lucide-react'

interface FeedbackFormWithStatus extends FeedbackForm {
  isSubmitted: boolean
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const router = useRouter()
  
  const [student, setStudent] = useState<StudentWithpeertutors | null>(null)
  const [feedbackForms, setFeedbackForms] = useState<FeedbackFormWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [selectedFeedbackForm, setSelectedFeedbackForm] = useState<FeedbackForm | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  const [isSidebarCollapsed] = useSidebarCollapsed()

  // Load student data initially
  const loadStudentData = useCallback(async () => {
    if (!user?.email) return

    try {
      const allStudents = await StudentService.getAllStudentsWithpeerTutor()
      const currentStudent = allStudents.find(s => s.email === user?.email)
      
      if (currentStudent) {
        setStudent(currentStudent)
        const forms = await FeedbackService.getActiveFeedbackForms()
        const formsWithStatus = await Promise.all(
          forms.map(async (form) => {
            const isSubmitted = await FeedbackService.hasStudentSubmittedFeedback(
              form.id,
              currentStudent.id
            )
            return {
              ...form,
              isSubmitted
            }
          })
        )
        setFeedbackForms(formsWithStatus)
      }
    } catch (error) {
      logger.error('Error loading student data:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.email])

  useEffect(() => {
    loadStudentData()
  }, [loadStudentData])

  // Fetch Attendance and Leaderboard stats via custom hook
  const { data: attendanceData, refetch: refetchAttendance } = useStudentAttendanceData(student?.id)
  const { data: leaderboardData, isLoading: leaderboardLoading, refetch: refetchLeaderboard } = useStudentLeaderboard(student, undefined)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await Promise.all([
      loadStudentData(),
      refetchAttendance(),
      refetchLeaderboard()
    ])
    setTimeout(() => setIsRefreshing(false), 500)
  }

  const handleSubmitFeedback = (form: FeedbackFormWithStatus) => {
    if (!form.isSubmitted) {
      setSelectedFeedbackForm(form)
      setShowFeedbackModal(true)
    }
  }

  const handleFeedbackSubmitted = async () => {
    if (!student) return
    const forms = await FeedbackService.getActiveFeedbackForms()
    const formsWithStatus = await Promise.all(
      forms.map(async (form) => {
        const isSubmitted = await FeedbackService.hasStudentSubmittedFeedback(form.id, student.id)
        return { ...form, isSubmitted }
      })
    )
    setFeedbackForms(formsWithStatus)
    setShowFeedbackModal(false)
    setSelectedFeedbackForm(null)
  }

  if (loading) {
    return (
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen bg-[#F8F9FA] flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading</span>
        </div>
      </div>
    )
  }

  if (!student) {
    return (
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen bg-[#F8F9FA] flex items-center justify-center`}>
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6 font-medium">You are not registered as a student in the system.</p>
          <Button onClick={() => router.push('/login')}>Sign Out</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
        <PageHeader
          title="STUDENT DASHBOARD"
          tagline="Your Learning & Progress Overview"
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto bg-gray-50/50">
          <div className="max-w-[1600px] mx-auto w-full space-y-6">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
              {/* --- LEFT COLUMN --- */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                
                {/* Hero Card */}
                <div className="bg-gradient-to-br from-[#1C2434] to-[#2D3748] text-white rounded-[2rem] p-6 sm:p-8 relative overflow-hidden shadow-2xl border border-white/10 group">
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-6">
                      <span className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">Student Profile</span>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                      <div>
                        <p className="text-sm text-gray-400 font-bold mb-1 uppercase tracking-wider">
                          {student.dept}
                        </p>
                        <h3 className="text-3xl font-black tracking-tight mb-4 leading-none text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                          {student.name}
                        </h3>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-lg text-[10px] font-bold border border-white/5 text-gray-300 uppercase tracking-wider">
                            Year {student.year}
                          </span>
                          <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-lg text-[10px] font-bold border border-white/5 text-gray-300 uppercase tracking-wider">
                            Section {student.section}
                          </span>
                        </div>
                      </div>

                      {/* Stats Overview internal to card */}
                      <div className="flex flex-col gap-2 min-w-[200px] bg-white/5 p-4 rounded-2xl backdrop-blur-sm border border-white/5">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1">
                          Assigned Peer Tutor
                        </p>
                        {student.assigned_peer_tutor ? (
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                              <span className="text-sm font-bold text-blue-300">
                                {student.assigned_peer_tutor.name.substring(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{student.assigned_peer_tutor.name}</p>
                              <p className="text-[10px] text-gray-400">{student.assigned_peer_tutor.email}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-yellow-300/80">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase">Not Assigned</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Decorative Background */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#bef264]/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-[#bef264]/20 transition-all duration-700"></div>
                  <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl -ml-20 -mb-20"></div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-white overflow-hidden shadow-sm rounded-[2rem] border border-gray-100 p-6 flex flex-col justify-center relative group hover:shadow-md transition-shadow">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <BookOpen className="w-16 h-16" />
                    </div>
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Classes</div>
                    <div className="text-3xl font-black text-gray-900">{attendanceData?.total || 0}</div>
                  </div>

                  <div className="bg-white overflow-hidden shadow-sm rounded-[2rem] border border-gray-100 p-6 flex flex-col justify-center relative group hover:shadow-md transition-shadow">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <CalendarCheck className="w-16 h-16" />
                    </div>
                    <div className="text-[10px] font-black text-green-500 uppercase tracking-widest mb-2">Attended</div>
                    <div className="text-3xl font-black text-gray-900">{attendanceData?.present || 0}</div>
                  </div>

                  <div className="bg-white overflow-hidden shadow-sm rounded-[2rem] border border-gray-100 p-6 flex flex-col justify-center relative group hover:shadow-md transition-shadow md:col-span-1 col-span-2">
                    <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">Attendance Rate</div>
                    <div className="flex items-end gap-2">
                       <div className="text-3xl font-black text-gray-900">{attendanceData?.percentage || 0}%</div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-100 h-2 mt-4 rounded-full overflow-hidden">
                       <div 
                         className="bg-blue-500 h-full rounded-full transition-all duration-1000" 
                         style={{ width: `${attendanceData?.percentage || 0}%` }}
                       />
                    </div>
                  </div>
                </div>

                {/* Feedback Forms */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-black text-gray-900 tracking-tight uppercase">Feedback Forms</h2>
                      <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mt-1">
                        Submit feedback for your sessions
                      </p>
                    </div>
                  </div>
                  <div className="p-6">
                    {feedbackForms.length === 0 ? (
                      <EmptyState
                        title="No Forms Available"
                        description="There are no pending responses at the moment."
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                              <TableHead className="py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-tight">Form Name</TableHead>
                              <TableHead className="py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-tight">Description</TableHead>
                              <TableHead className="py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-tight">Questions</TableHead>
                              <TableHead className="py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-tight">Status</TableHead>
                              <TableHead className="py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-tight text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {feedbackForms.map((form) => (
                              <TableRow key={form.id}>
                                <TableCell>
                                  <div className="text-sm font-bold text-gray-900">{form.name}</div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs text-gray-500 font-medium break-words">
                                    {form.description || 'No description'}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs font-bold text-gray-900">
                                    {form.questions.length} Qs
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {form.isSubmitted ? (
                                    <StatusBadge status="submitted">Submitted</StatusBadge>
                                  ) : (
                                    <StatusBadge status="pending">Pending</StatusBadge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {form.isSubmitted ? (
                                    <Button size="sm" variant="secondary" disabled className="text-[10px] h-8 tracking-widest uppercase font-bold">
                                      Finished
                                    </Button>
                                  ) : (
                                    <Button size="sm" onClick={() => handleSubmitFeedback(form)} className="text-[10px] h-8 tracking-widest uppercase font-bold">
                                      Start
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* --- RIGHT COLUMN --- */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                {/* Embedded Leaderboard */}
                <PeerLeaderboard 
                  data={leaderboardData} 
                  loading={leaderboardLoading} 
                  currentUserId={student.id} 
                />
              </div>
            </div>

          </div>
        </main>
      </div>

      {selectedFeedbackForm && student && (
        <FeedbackSubmissionModal
          isOpen={showFeedbackModal}
          onClose={() => {
            setShowFeedbackModal(false)
            setSelectedFeedbackForm(null)
          }}
          onSuccess={handleFeedbackSubmitted}
          feedbackForm={selectedFeedbackForm}
          studentId={student.id}
        />
      )}
    </div>
  )
}