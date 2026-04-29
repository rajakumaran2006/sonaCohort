'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { logger } from '@/lib/logger'
import { StudentService, StudentWithpeertutors } from '@/lib/services/studentService'
import { FeedbackService, FeedbackForm } from '@/lib/services/feedbackService'
import {
  useStudentAttendanceData,
  useStudentUpcomingClasses
} from '@/lib/hooks/useStudentDashboardData'
import FeedbackSubmissionModal from '@/components/forms/feedback/FeedbackSubmissionModal'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import PageHeader from '@/components/layout/PageHeader'
import { Button, EmptyState } from '@/components/ui'
import { AlertCircle, CalendarDays, Clock, Video, BookOpen } from 'lucide-react'

interface FeedbackFormWithStatus extends FeedbackForm {
  isSubmitted: boolean
  isClosed: boolean
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
      // Use direct email lookup (covered by peer_students_self_read RLS policy)
      const currentStudent = await StudentService.getStudentWithPeerTutorByEmail(user.email)
      
      if (currentStudent) {
        setStudent(currentStudent)
        const forms = await FeedbackService.getAllFeedbackForms()
        const formsWithStatus = await Promise.all(
          forms.map(async (form) => {
            const isSubmitted = await FeedbackService.hasStudentSubmittedFeedback(
              form.id,
              currentStudent.id
            )
            return {
              ...form,
              isSubmitted,
              isClosed: !form.is_active
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

  // Fetch Attendance and Upcoming Classes via custom hooks
  const { data: attendanceData, refetch: refetchAttendance } = useStudentAttendanceData(student?.id)
  const { data: upcomingData, isLoading: upcomingLoading, refetch: refetchUpcoming } = useStudentUpcomingClasses(
    student?.dept,
    student?.year?.toString(),
    student?.section
  )
  // Only show genuinely upcoming classes — no past fallback
  const upcomingClasses = upcomingData?.isPast ? [] : (upcomingData?.classes ?? [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await Promise.all([loadStudentData(), refetchAttendance(), refetchUpcoming()])
    setTimeout(() => setIsRefreshing(false), 500)
  }

  const handleSubmitFeedback = (form: FeedbackFormWithStatus) => {
    if (!form.isSubmitted && !form.isClosed) {
      setSelectedFeedbackForm(form)
      setShowFeedbackModal(true)
    }
  }

  // Called when user dismisses the modal WITHOUT submitting — keep selectedFeedbackForm
  // so that clicking "Submit Feedback" again immediately re-opens with fresh state.
  const handleModalClose = () => {
    setShowFeedbackModal(false)
    // Don't null selectedFeedbackForm — modal's own useEffect resets answers on next open
  }

  // Called only after a successful DB save
  const handleFeedbackSubmitted = async () => {
    if (!student) return
    // Refresh status from DB
    const forms = await FeedbackService.getAllFeedbackForms()
    const formsWithStatus = await Promise.all(
      forms.map(async (form) => {
        const isSubmitted = await FeedbackService.hasStudentSubmittedFeedback(form.id, student.id)
        return { ...form, isSubmitted, isClosed: !form.is_active }
      })
    )
    setFeedbackForms(formsWithStatus)
    setShowFeedbackModal(false)
    setSelectedFeedbackForm(null)
  }

  if (loading) {
    return (
      <div className={`${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen bg-[#F8F9FA] p-4 sm:p-6`}>
        <div className="max-w-[1600px] mx-auto w-full space-y-6 animate-pulse">
           <div className="h-20 bg-gray-200 rounded-lg w-1/3 mb-6"></div>
           <div className="h-64 bg-gray-200 rounded-[2rem] w-full"></div>
           <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
             <div className="h-32 bg-gray-200 rounded-[2rem]"></div>
             <div className="h-32 bg-gray-200 rounded-[2rem]"></div>
             <div className="h-32 bg-gray-200 rounded-[2rem]"></div>
           </div>
           <div className="h-64 bg-gray-200 rounded-[2rem] w-full mt-6"></div>
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
      <div className={`${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
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
              {/* --- LEFT COLUMN (wider now, no leaderboard) --- */}
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
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Classes</div>
                    <div className="text-3xl font-black text-gray-900">{attendanceData?.total || 0}</div>
                  </div>

                  <div className="bg-white overflow-hidden shadow-sm rounded-[2rem] border border-gray-100 p-6 flex flex-col justify-center relative group hover:shadow-md transition-shadow">
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
                  <div className="p-6 border-b border-gray-50">
                    <h2 className="text-lg font-black text-gray-900 tracking-tight uppercase">Feedback Forms</h2>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mt-1">
                      Submit feedback for your sessions
                    </p>
                  </div>
                  <div className="p-4 sm:p-6">
                    {feedbackForms.length === 0 ? (
                      <EmptyState
                        title="No Forms Available"
                        description="There are no pending responses at the moment."
                      />
                    ) : (
                      <div className="max-h-[420px] overflow-y-auto pr-1 space-y-3 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                        {feedbackForms.map((form) => (
                          <div
                            key={form.id}
                            className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-all duration-200 ${
                              form.isClosed
                                ? 'bg-red-50/40 border-red-100'
                                : form.isSubmitted
                                ? 'bg-gray-50 border-gray-100'
                                : 'bg-white border-gray-200 hover:border-blue-200 hover:shadow-sm'
                            }`}
                          >
                            {/* Left: Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="text-sm font-bold text-gray-900 leading-snug">{form.name}</span>

                                {/* Closed badge — shown whenever is_active is false */}
                                {form.isClosed && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white uppercase tracking-wider">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                    Closed
                                  </span>
                                )}

                                {/* Submitted badge */}
                                {form.isSubmitted && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-700 text-white uppercase tracking-wider">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    Submitted
                                  </span>
                                )}

                                {/* Pending badge — only when open and not submitted */}
                                {!form.isClosed && !form.isSubmitted && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-700 text-amber-100 uppercase tracking-wider">
                                    Pending
                                  </span>
                                )}
                              </div>
                              {form.description && (
                                <p className="text-xs text-gray-400 font-medium line-clamp-2 mt-0.5">{form.description}</p>
                              )}
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">
                                {form.questions.length} Question{form.questions.length !== 1 ? 's' : ''}
                              </p>
                            </div>

                            {/* Right: Action */}
                            <div className="flex-shrink-0 w-full sm:w-auto">
                              {form.isClosed ? (
                                /* Closed — cannot submit regardless of submission status */
                                <button
                                  disabled
                                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest bg-red-100 text-red-400 cursor-not-allowed"
                                >
                                  {form.isSubmitted ? 'Submitted' : 'Form Closed'}
                                </button>
                              ) : form.isSubmitted ? (
                                <button
                                  disabled
                                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest bg-gray-100 text-gray-400 cursor-not-allowed"
                                >
                                  Completed
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleSubmitFeedback(form)}
                                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest bg-gray-900 hover:bg-black text-white transition-colors shadow-sm"
                                >
                                  Submit Feedback
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* --- RIGHT COLUMN --- */}
              <div className="lg:col-span-4 flex flex-col gap-6">

                {/* Next Three Classes */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 pt-6 pb-4 border-b border-gray-50 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-gray-400" />
                    <div>
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Upcoming</h3>
                      <span className="text-base font-black text-gray-900 uppercase tracking-tight">Next Classes</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    {upcomingLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
                        ))}
                      </div>
                    ) : upcomingClasses.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <BookOpen className="w-10 h-10 text-black mb-3" />
                        <p className="text-sm font-bold text-black uppercase">No Upcoming Classes</p>
                        <p className="text-xs text-gray-300 mt-1">Check back later for new schedules</p>
                      </div>
                    ) : (
                      upcomingClasses.map((cls, idx) => {
                        const dateObj = new Date(cls.scheduled_date + 'T00:00:00')
                        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' })
                        const dateStr = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                        const isToday = cls.scheduled_date === new Date().toISOString().split('T')[0]

                        return (
                          <div
                            key={cls.id}
                            className={`rounded-2xl p-3.5 flex gap-3 items-start border transition-all ${
                              idx === 0
                                ? 'bg-gray-900 border-gray-900'
                                : 'bg-gray-50 border-gray-100'
                            }`}
                          >
                            {/* Date badge */}
                            <div className={`flex-shrink-0 flex flex-col items-center justify-center w-10 h-10 rounded-xl text-center ${
                              idx === 0 ? 'bg-white/10' : 'bg-white border border-gray-200'
                            }`}>
                              <span className={`text-[8px] font-black uppercase ${idx === 0 ? 'text-gray-300' : 'text-gray-400'}`}>{dayName}</span>
                              <span className={`text-base font-black leading-none ${idx === 0 ? 'text-white' : 'text-gray-900'}`}>{dateObj.getDate()}</span>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-bold truncate ${idx === 0 ? 'text-white' : 'text-gray-900'}`}>
                                {cls.class?.subject_name || 'Class'}
                              </p>
                              {isToday && (
                                <span className={`inline-block text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md mb-0.5 ${
                                  idx === 0 ? 'bg-[#bef264]/20 text-[#bef264]' : 'bg-green-100 text-green-700'
                                }`}>Today</span>
                              )}
                              <div className={`flex flex-wrap items-center gap-2 mt-0.5 ${idx === 0 ? 'text-gray-300' : 'text-gray-400'}`}>
                                {cls.start_time && (
                                  <span className="flex items-center gap-1 text-[10px] font-bold">
                                    <Clock className="w-2.5 h-2.5" />
                                    {cls.start_time}{cls.end_time ? ` – ${cls.end_time}` : ''}
                                  </span>
                                )}
                                {!cls.start_time && (
                                  <span className="text-[10px] font-bold">{dateStr}</span>
                                )}
                                {cls.link && (
                                  <a
                                    href={cls.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wide ${
                                      idx === 0 ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                    } transition-colors`}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <Video className="w-2.5 h-2.5" /> Join
                                  </a>
                                )}
                              </div>
                              {cls.topics && (
                                <p className={`text-[10px] font-medium mt-0.5 truncate ${idx === 0 ? 'text-gray-400' : 'text-gray-400'}`}>
                                  {cls.topics}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

              </div>
            </div>

          </div>
        </main>
      </div>

      {selectedFeedbackForm && student && (
        <FeedbackSubmissionModal
          isOpen={showFeedbackModal}
          onClose={handleModalClose}
          onSuccess={handleFeedbackSubmitted}
          feedbackForm={selectedFeedbackForm}
          studentId={student.id}
        />
      )}
    </div>
  )
}