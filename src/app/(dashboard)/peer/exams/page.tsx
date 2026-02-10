'use client'

import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import { logger } from '@/lib/logger'
import { useAuth } from '@/lib/auth/AuthContext'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { ExamService } from '@/lib/services/examService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { ExamMarksService } from '@/lib/services/examMarksService'
import { ExamSubjectService } from '@/lib/services/examSubjectService'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'

import { 
  FileText,
  CheckCircle,
  Clock
} from 'lucide-react'

export default function PeerExamsPage() {
  return (
    <PeerProtectedRoute>
      <PeerExamsContent />
    </PeerProtectedRoute>
  )
}

function PeerExamsContent() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  // const [peertutorsYear, setpeertutorsYear] = useState<string | null>(null) // Removed state to optimize

  
  // Stats state
  const [stats, setStats] = useState({
    totalExams: 0,
    totalStudents: 0,
    completedExams: 0,
    overallCompletion: 0,
    pendingExams: 0
  })

  const [examProgress, setExamProgress] = useState<Record<string, number>>({})

  const [isSidebarCollapsed] = useSidebarCollapsed()

  // Fetch peer tutor info
  const { data: peertutorsInfo, isLoading: isTutorLoading } = useQuery({
    queryKey: ['peer-tutor-info', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await peertutorsAuthService.getpeertutorsByEmail(user.email)
    },
    enabled: !!user?.email,
    staleTime: 5 * 60 * 1000,
  })

  // Derived year from peer tutor info to avoid useEffect waterfall
  const peertutorsYear = peertutorsInfo?.year || null

  // useEffect(() => {
  //   if (peertutorsInfo?.year) {
  //     setpeertutorsYear(peertutorsInfo.year)
  //   }
  // }, [peertutorsInfo])

  // Fetch exams for peer tutor's year
  const { data: exams, isLoading: isExamsLoading } = useQuery({
    queryKey: ['peer-exams', peertutorsYear],
    queryFn: async () => {
      if (!peertutorsYear) return []
      return await ExamService.getExamsByYear(peertutorsYear)
    },
    enabled: !!peertutorsYear,
    staleTime: 5 * 60 * 1000,
  })

  // Calculate detailed stats
  useEffect(() => {
    const calculateStats = async () => {
      if (!peertutorsInfo?.id || !exams) return

      try {
        // 1. Get assigned students count
        const students = await AssignmentService.getStudentsBypeertutors(peertutorsInfo.id)
        const totalStudents = students.length

        // 2. Calculate progress for each exam
        let totalProgressSum = 0
        let completedCount = 0
        const progressMap: Record<string, number> = {}

        for (const exam of exams) {
          const subjects = await ExamSubjectService.getExamSubjectsForPeerTutor(exam.id, peertutorsInfo.id)
          const marks = await ExamMarksService.getExamMarksBypeertutorsAndExam(peertutorsInfo.id, exam.id)
          
          const totalPossibleMarks = students.length * subjects.length
          


          // We need a more accurate count based on unique student-subject pairs
          // But for now, let's look at the fetch logic. getExamMarksBypeertutorsAndExam returns one record per student-exam-subject?
          // Looking at the service: it returns ExamMark[] which has student_id and exam_subject_id.
          // So length is the count of entries.
          
          const entryCount = marks.length
          
          const progress = totalPossibleMarks > 0 
            ? Math.round((entryCount / totalPossibleMarks) * 100)
            : 0
          
          progressMap[exam.id] = Math.min(progress, 100)
          totalProgressSum += Math.min(progress, 100)
          
          if (progress >= 100) completedCount++
        }

        const overallCompletion = exams.length > 0 
          ? Math.round(totalProgressSum / exams.length) 
          : 0

        setExamProgress(progressMap)
        setStats({
          totalExams: exams.length,
          totalStudents,
          completedExams: completedCount,
          overallCompletion,
          pendingExams: exams.length - completedCount
        })

      } catch (error) {
        logger.error("Error calculating stats:", error)
      }
    }

    calculateStats()
  }, [peertutorsInfo, exams])


  const loading = isTutorLoading || isExamsLoading

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['peer-tutor-info', user?.email] }),
        queryClient.invalidateQueries({ queryKey: ['peer-exams', peertutorsYear] }),
      ])
      setLastRefresh(new Date())
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <PeerSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
        <PageHeader
          title="EXAMS"
          tagline="Marks Entry & Performance Tracking"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
            {loading ? (
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading</span>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Total Exams</p>
                        <p className="text-3xl font-bold text-gray-900 tracking-tight">{stats.totalExams}</p>
                      </div>
                      <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                        <FileText className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                           Assigned for Year {peertutorsYear}
                        </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Completed Exams</p>
                        <p className="text-3xl font-bold text-gray-900 tracking-tight">{stats.completedExams}</p>
                      </div>
                      <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                        <CheckCircle className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                        <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                           Finished
                        </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Pending Exams</p>
                        <p className="text-3xl font-bold text-gray-900 tracking-tight">{stats.pendingExams}</p>
                      </div>
                      <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                        <Clock className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                        <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
                           Remaining
                        </p>
                    </div>
                  </div>
                </div>

                {/* Exams Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-0">
                      <div>
                        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Available Exams</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {exams?.length || 0} exam(s) assigned
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    {!exams || exams.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <FileText className="w-8 h-8 text-blue-600" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No exams found</h3>
                        <p className="text-gray-500">There are currently no exams assigned to your year.</p>
                      </div>
                    ) : (
                      <>
                        {/* Mobile Card View */}
                        <div className="block md:hidden">
                          <div className="divide-y divide-gray-100">
                            {exams.map((exam) => {
                              const progress = examProgress[exam.id] || 0
                              const isCompleted = progress === 100

                              return (
                                <div
                                  key={exam.id}
                                  className="p-4 hover:bg-gray-50 transition-colors duration-200 cursor-pointer active:bg-gray-100"
                                  onClick={() => router.push(`/peer/exams/${exam.id}`)}
                                >
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1 min-w-0">
                                      <h4 className="text-sm font-bold text-gray-900 truncate">
                                        {exam.name}
                                      </h4>
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        Year {peertutorsYear}
                                      </p>
                                    </div>
                                    <span className={`text-[9px] font-bold px-2 py-1 rounded-md uppercase tracking-widest border flex-shrink-0 ml-3 ${
                                      isCompleted 
                                        ? 'bg-emerald-500 text-white border-emerald-100'
                                        : 'bg-blue-500 text-white border-blue-100'
                                    }`}>
                                      {isCompleted ? 'Completed' : 'In Progress'}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {new Date(exam.created_at).toLocaleDateString()}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                      <div 
                                        className={`h-1.5 rounded-full transition-all duration-300 ${isCompleted ? 'bg-emerald-500' : 'bg-gray-800'}`}
                                        style={{ width: `${progress}%` }}
                                      ></div>
                                    </div>
                                    <span className={`text-xs font-bold min-w-[32px] text-right ${isCompleted ? 'text-emerald-600' : 'text-gray-700'}`}>
                                      {progress}%
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-white">
                              <tr>
                                <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  Exam Name
                                </th>
                                <th className="px-6 py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  Date
                                </th>
                                <th className="px-6 py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  Year
                                </th>
                                <th className="px-6 py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  Progress
                                </th>
                                <th className="px-6 py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  Status
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {exams.map((exam) => {
                                const progress = examProgress[exam.id] || 0
                                const isCompleted = progress === 100

                                return (
                                  <tr 
                                    key={exam.id} 
                                    className="hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
                                    onClick={() => router.push(`/peer/exams/${exam.id}`)}
                                  >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <span className="text-sm font-bold text-black-600 hover:text-black-800 hover:underline transition-colors">
                                        {exam.name}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <div className="text-sm font-bold text-gray-700">
                                        {new Date(exam.created_at).toLocaleDateString()}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <div className="text-sm font-bold text-gray-700">
                                        Year {peertutorsYear}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <div className="flex items-center justify-center">
                                        <div className="w-24 bg-gray-100 rounded-full h-1.5 mr-2">
                                          <div 
                                            className={`h-1.5 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-black-500'}`}
                                            style={{ width: `${progress}%` }}
                                          ></div>
                                        </div>
                                        <span className={`text-xs font-bold ${isCompleted ? 'text-emerald-600' : 'text-black-600'}`}>
                                          {progress}%
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-widest border ${
                                          isCompleted 
                                            ? 'bg-emerald-500 text-white border-emerald-100'
                                            : 'bg-blue-500 text-white border-blue-100'
                                      }`}>
                                          {isCompleted ? 'Completed' : 'In Progress'}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

