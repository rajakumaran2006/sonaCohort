'use client'

import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { ExamService } from '@/lib/services/examService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { ExamMarksService } from '@/lib/services/examMarksService'
import { ExamSubjectService } from '@/lib/services/examSubjectService'
import {
  preprocessMarks,
  calculateStudentPerformance,
  calculateSubjectPerformance,
  generateAttentionItems,
  generateInsights
} from '@/lib/utils/examAnalytics'
import { Card, CardContent, StudentPerformanceChart } from '@/components/ui'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Button } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui'
import { ArrowLeft, Edit, Save, X, Plus, Filter, Calendar, Users, Activity, ChevronLeft, Search } from 'lucide-react'
import ExportButton from '@/components/ui/ExportButton'
import * as XLSX from 'xlsx'
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui'
import { Input } from '@/components/ui'
import ImportMarksModal from '@/components/forms/import-export/ImportMarksModal'

export default function PeerExamDetailsPage() {
  return (
    <PeerProtectedRoute>
      <PeerExamDetailsContent />
    </PeerProtectedRoute>
  )
}

function PeerExamDetailsContent() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const queryClient = useQueryClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [marksData, setMarksData] = useState<Record<string, Record<string, Record<string, number | string>>>>({})
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'avg'>('name')
  const filterRef = useRef<HTMLDivElement>(null)

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

  // Fetch exam details
  const { data: exam, isLoading: isExamLoading } = useQuery({
    queryKey: ['exam-details', examId],
    queryFn: async () => await ExamService.getExamById(examId),
    enabled: !!examId,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch students assigned to peer tutor
  const { data: students, isLoading: isStudentsLoading } = useQuery({
    queryKey: ['peer-tutor-students', peertutorsInfo?.id],
    queryFn: async () => {
      if (!peertutorsInfo?.id) return []
      return await AssignmentService.getStudentsBypeertutors(peertutorsInfo.id)
    },
    enabled: !!peertutorsInfo?.id,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch exam subjects for this exam (filtered for this peer tutor)
  const { data: examSubjects, isLoading: isSubjectsLoading, refetch: refetchSubjects } = useQuery({
    queryKey: ['exam-subjects', examId, peertutorsInfo?.id],
    queryFn: async () => {
      if (!peertutorsInfo?.id) return []
      return await ExamSubjectService.getExamSubjectsForPeerTutor(examId, peertutorsInfo.id)
    },
    enabled: !!examId && !!peertutorsInfo?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  // Initialize subjects from classes for this peer tutor
  // Always run initialization - the service will handle duplicates
  useEffect(() => {
    if (exam && peertutorsInfo) {
      ExamSubjectService.initializeSubjectsFromClasses(
        examId,
        peertutorsInfo.id,
        peertutorsInfo.dept,
        peertutorsInfo.year,
        peertutorsInfo.section
      ).then(() => {
        refetchSubjects()
      })
    }
  }, [exam, peertutorsInfo, examId, refetchSubjects])

  // Fetch existing exam marks
  const { data: existingMarks, isLoading: isMarksLoading } = useQuery({
    queryKey: ['exam-marks', examId, peertutorsInfo?.id],
    queryFn: async () => {
      if (!examId || !peertutorsInfo?.id) return []
      return await ExamMarksService.getExamMarksBypeertutorsAndExam(peertutorsInfo.id, examId)
    },
    enabled: !!examId && !!peertutorsInfo?.id,
    staleTime: 1 * 60 * 1000, // Reduced stale time for better real-time updates
    refetchOnWindowFocus: true, // Refetch when window gains focus
  })

  const loading = isTutorLoading || isExamLoading || isStudentsLoading || isSubjectsLoading || isMarksLoading

  // Initialize marks data from existing marks
  // Helper function to initialize marks from DB
  const initializeMarksFromDB = useCallback(() => {
    if (existingMarks && students && examSubjects) {
      const initialMarks: Record<string, Record<string, Record<string, number | string>>> = {}
      
      students.forEach(student => {
        initialMarks[student.id] = {}
        examSubjects.forEach(subject => {
          initialMarks[student.id][subject.id] = {}
          
          // Find existing mark for this student-subject combination
          const existingMark = existingMarks.find(
            mark => mark.student_id === student.id && mark.exam_subject_id === subject.id
          )
          
          if (existingMark && existingMark.marks) {
            // Copy existing marks
            Object.keys(existingMark.marks).forEach(field => {
              initialMarks[student.id][subject.id][field] = existingMark.marks[field]
            })
          } else {
            // Initialize with empty marks
            initialMarks[student.id][subject.id] = {
              'marks': ''
            }
          }
        })
      })
      
      setMarksData(initialMarks)
    }
  }, [existingMarks, students, examSubjects])

  // Initialize marks data from existing marks
  useEffect(() => {
    if (!isEditing) {
      initializeMarksFromDB()
    }
  }, [initializeMarksFromDB, isEditing])

  // Update marks data when new students or subjects are added
  useEffect(() => {
    if (students && examSubjects && !isEditing) {
      setMarksData(prev => {
        const updated = { ...prev }
        
        // Add new students
        students.forEach(student => {
          if (!updated[student.id]) {
            updated[student.id] = {}
            examSubjects.forEach(subject => {
              updated[student.id][subject.id] = {
                'marks': ''
              }
            })
          }
        })
        
        // Add new subjects
        examSubjects.forEach(subject => {
          students.forEach(student => {
            if (!updated[student.id]?.[subject.id]) {
              if (!updated[student.id]) {
                updated[student.id] = {}
              }
              updated[student.id][subject.id] = {
                'marks': ''
              }
            }
          })
        })
        
        return updated
      })
    }
  }, [students, examSubjects, isEditing])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['peer-tutor-info', user?.email] }),
        queryClient.invalidateQueries({ queryKey: ['exam-details', examId] }),
        queryClient.invalidateQueries({ queryKey: ['peer-tutor-students', peertutorsInfo?.id] }),
        queryClient.invalidateQueries({ queryKey: ['exam-subjects', examId, peertutorsInfo?.id] }),
        queryClient.invalidateQueries({ queryKey: ['exam-marks', examId, peertutorsInfo?.id] }),
      ])
      refetchSubjects()
      setLastRefresh(new Date())
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  const handleMarkChange = (studentId: string, subjectId: string, field: string, value: string) => {
    setMarksData(prev => {
      const updated = { ...prev }
      if (!updated[studentId]) {
        updated[studentId] = {}
      }
      if (!updated[studentId][subjectId]) {
        updated[studentId][subjectId] = {}
      }
      updated[studentId][subjectId][field] = value
      return updated
    })
  }

  const handleSave = async () => {
    if (!examId || !peertutorsInfo?.id || !students || !examSubjects) return

    setIsSaving(true)
    try {
      const marksToSave = []
      
      for (const student of students) {
        for (const subject of examSubjects) {
          const studentMarks = marksData[student.id]?.[subject.id]
          if (studentMarks) {
            marksToSave.push({
              exam_id: examId,
              peer_tutor_id: peertutorsInfo.id,
              student_id: student.id,
              exam_subject_id: subject.id,
              marks: studentMarks,
            })
          }
        }
      }

      const success = await ExamMarksService.saveExamMarksBatch(marksToSave)
      
      if (success) {
        setIsEditing(false)
        // Invalidate queries for both peer tutor and faculty views
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['exam-marks', examId, peertutorsInfo.id] }),
          queryClient.invalidateQueries({ queryKey: ['exam-marks', examId] }), // For faculty view
        ])
      } else {
        toast.error('Failed to save marks. Please try again.')
      }
    } catch (error) {
      logger.error('Error saving marks:', error)
      toast.error('An error occurred while saving marks')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    // Reset marks to original DB state
    initializeMarksFromDB()
    setIsEditing(false)
  }

  // Ensure all subjects are in marksData when entering edit mode
  useEffect(() => {
    if (isEditing && students && examSubjects) {
      setMarksData(prev => {
        const updated = { ...prev }
        
        students.forEach(student => {
          if (!updated[student.id]) {
            updated[student.id] = {}
          }
          examSubjects.forEach(subject => {
            if (!updated[student.id][subject.id]) {
              updated[student.id][subject.id] = {
                'marks': ''
              }
            }
          })
        })
        
        return updated
      })
    }
  }, [isEditing, students, examSubjects])

  const handleAddSubject = async () => {
    if (!newSubjectName.trim() || !examId || !peertutorsInfo?.id) return

    const subject = await ExamSubjectService.addExamSubject({
      exam_id: examId,
      subject_name: newSubjectName.trim(),
      is_custom: true,
      created_by: peertutorsInfo.id,
    })

    if (subject) {
      setNewSubjectName('')
      setShowAddSubjectModal(false)
      queryClient.invalidateQueries({ queryKey: ['exam-subjects', examId] })
      refetchSubjects()
    } else {
      toast.error('Failed to add subject')
    }
  }

  // Excel export function
  const handleExportToExcel = async () => {
    if (!exam || !peertutorsInfo || !students || !examSubjects || students.length === 0 || examSubjects.length === 0) return

    try {
      // Get exam subjects
      const subjects = examSubjects
      
      // Prepare data for export
      const exportData: Array<Array<string | number>> = []
      
      // Add header rows with exam information
      exportData.push(['Subjects Export Report'])
      exportData.push(['Department:', peertutorsInfo.dept])
      exportData.push(['Year:', peertutorsInfo.year])
      exportData.push(['Section:', peertutorsInfo.section])
      exportData.push(['Peer Tutor:', peertutorsInfo.name])
      exportData.push(['Generated on:', new Date().toLocaleDateString()])
      exportData.push([]) // Empty row
      
      // Create header row: Student Name, then all subjects
      const headerRow = ['Student Name', ...subjects.map(s => s.subject_name)]
      exportData.push(headerRow)
      
      // Get marks for all students
      const marks = await ExamMarksService.getExamMarksBypeertutorsAndExam(peertutorsInfo.id, examId)
      
      // Organize marks by student and subject
      const marksByStudentSubject: Record<string, Record<string, string>> = {}
      marks.forEach(mark => {
        if (!marksByStudentSubject[mark.student_id]) {
          marksByStudentSubject[mark.student_id] = {}
        }
        if (mark.exam_subject_id && mark.marks?.marks) {
          marksByStudentSubject[mark.student_id][mark.exam_subject_id] = String(mark.marks.marks)
        }
      })
      
      // Add data rows: one row per student
      students.forEach(student => {
        const row = [student.name]
        subjects.forEach(subject => {
          const markValue = marksByStudentSubject[student.id]?.[subject.id] || ''
          row.push(markValue)
        })
        exportData.push(row)
      })
      
      // Create workbook and worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(exportData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Exam Marks')
      
      // Generate filename
      const filename = `Exam_${exam.name.replace(/[^a-zA-Z0-9]/g, '_')}_${peertutorsInfo.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
      
      // Write file
      XLSX.writeFile(workbook, filename)
    } catch (error) {
      logger.error('Error exporting to Excel:', error)
      toast.error('Error exporting to Excel. Please try again.')
    }
  }

  // Default field name for marks
  const markField = 'marks'

  // Calculate average marks for each student
  const calculateStudentAverage = useCallback((studentId: string): number => {
    if (!examSubjects || examSubjects.length === 0) return 0
    
    let totalMarks = 0
    let count = 0
    
    examSubjects.forEach(subject => {
      const markValue = marksData[studentId]?.[subject.id]?.[markField]
      if (markValue) {
        // Handle "40/100" format or just "40"
        const markStr = String(markValue)
        const numericValue = parseFloat(markStr.split('/')[0])
        if (!isNaN(numericValue)) {
          totalMarks += numericValue
          count++
        }
      }
    })
    
    return count > 0 ? totalMarks / count : 0
  }, [examSubjects, marksData])

  // Calculate percentage based on max marks
  const calculateStudentPercentage = useCallback((studentId: string): number => {
    const avg = calculateStudentAverage(studentId)
    const maxMarks = exam?.max_marks || 100
    if (maxMarks === 0) return 0
    return (avg / maxMarks) * 100
  }, [calculateStudentAverage, exam])

  // Get sorted students
  const sortedStudents = useMemo(() => {
    if (!students) return []
    
    const sorted = [...students]
    if (sortBy === 'avg') {
      sorted.sort((a, b) => {
        const avgA = calculateStudentAverage(a.id)
        const avgB = calculateStudentAverage(b.id)
        return avgB - avgA // Sort descending (highest first)
      })
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    }
    return sorted
  }, [students, sortBy, calculateStudentAverage])

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Process analytics data
  const processedMarks = useMemo(() => {
    if (!students || !examSubjects || !marksData || !exam) return []
    return preprocessMarks(marksData, students, examSubjects, exam.max_marks || 100)
  }, [students, examSubjects, marksData, exam])

  const studentPerformance = useMemo(() => {
    return calculateStudentPerformance(processedMarks)
  }, [processedMarks])

  const subjectPerformance = useMemo(() => {
    return calculateSubjectPerformance(processedMarks)
  }, [processedMarks])

  const attentionItems = useMemo(() => {
    return generateAttentionItems(studentPerformance)
  }, [studentPerformance])

  useMemo(() => {
    return generateInsights(studentPerformance, subjectPerformance)
  }, [studentPerformance, subjectPerformance])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
          <PageHeader
            title="EXAM DETAILS"
            tagline="Marks Entry & Performance View"
            onToggleSidebar={() => setIsSidebarOpen(true)}
            isSidebarCollapsed={isSidebarCollapsed}
          />

          <main className="flex-1 overflow-y-auto">
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading</span>
              </div>
            </div>
          </main>
        </div>
      </div>
    )
  }

  if (!exam || !peertutorsInfo) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PeerSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
          <PageHeader
            title="EXAM DETAILS"
            lastRefresh={lastRefresh}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            isSidebarCollapsed={isSidebarCollapsed}
          />
          <main className="flex-1 overflow-y-auto">
            <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <p className="text-gray-500">Exam not found</p>
                    <Button
                      variant="secondary"
                      onClick={() => router.push('/peer/exams')}
                      className="mt-4"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Exams
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <PeerSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden w-full lg:w-auto`}>
        {/* Top Header */}
        <PageHeader
          title={exam.name}
          subtitle="Manage student marks and view performance analytics"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        >
          <Button
            variant="outline"
            className="hidden sm:flex"
            onClick={() => router.push('/peer/exams')}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Exams
          </Button>
        </PageHeader>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-[1600px] mx-auto space-y-8">
            
            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6">
              {/* Total Students */}
              <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                <div className="p-3 sm:p-5">
                  <div className="flex items-center justify-between mb-1 sm:mb-2">
                    <div className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Total Students
                    </div>
                    <Users className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                  </div>
                  <div className="text-xl sm:text-3xl font-bold text-gray-900">
                    {students?.length || 0}
                  </div>
                  <div className="mt-1 sm:mt-2 flex items-center text-[10px] sm:text-xs text-blue-600">
                    <span className="font-semibold uppercase">Assigned</span>
                  </div>
                </div>
              </div>

              {/* Created Date */}
              <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                <div className="p-3 sm:p-5">
                  <div className="flex items-center justify-between mb-1 sm:mb-2">
                    <div className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Created On
                    </div>
                    <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                  </div>
                  <div className="text-sm sm:text-3xl font-bold text-gray-900">
                    {new Date(exam.created_at).toLocaleDateString()}
                  </div>
                  <div className="mt-1 sm:mt-2 flex items-center text-[10px] sm:text-xs text-gray-500">
                    <span className="font-semibold uppercase">Exam Date</span>
                  </div>
                </div>
              </div>

              {/* Max Marks */}
              <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                <div className="p-3 sm:p-5">
                  <div className="flex items-center justify-between mb-1 sm:mb-2">
                    <div className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Max Marks
                    </div>
                    <Activity className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                  </div>
                  <div className="text-xl sm:text-3xl font-bold text-gray-900">
                    {exam.max_marks || 100}
                  </div>
                  <div className="mt-1 sm:mt-2 flex items-center text-[10px] sm:text-xs text-purple-600">
                    <span className="font-semibold uppercase">Total Points</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Marks Table Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
               <div className="p-4 sm:p-5 border-b border-gray-100 bg-gray-50/30">
                  <div className="flex flex-col gap-3 sm:gap-4">
                     <div className="flex items-center justify-between">
                        <div>
                           <h3 className="text-xs sm:text-sm font-bold text-gray-700 uppercase tracking-wider">Student Marks</h3>
                           <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">Manage marks for all assigned students</p>
                        </div>
                     </div>

                     <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
                        {/* Sort Filter */}
                        <div className="relative" ref={filterRef}>
                           <button
                              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                              className={`px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white border border-gray-200 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all hover:bg-gray-50 flex items-center gap-1.5 sm:gap-2 ${
                                 sortBy !== 'name' ? 'text-blue-600 border-blue-200 bg-blue-50' : 'text-gray-600'
                              }`}
                           >
                              <Filter className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              <span>Sort</span>
                           </button>

                           {showFilterDropdown && (
                              <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-44 sm:w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden">
                                 <div className="p-2 space-y-1">
                                    <button
                                       onClick={() => {
                                          setSortBy('name')
                                          setShowFilterDropdown(false)
                                       }}
                                       className={`w-full text-left px-3 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-colors ${
                                          sortBy === 'name' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                                       }`}
                                    >
                                       Name (A-Z)
                                    </button>
                                    <button
                                       onClick={() => {
                                          setSortBy('avg')
                                          setShowFilterDropdown(false)
                                       }}
                                       className={`w-full text-left px-3 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-colors ${
                                          sortBy === 'avg' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                                       }`}
                                    >
                                       Average (High-Low)
                                    </button>
                                 </div>
                              </div>
                           )}
                        </div>

                        {!isEditing ? (
                           <button
                              onClick={() => setIsEditing(true)}
                              className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-black text-white rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:bg-gray-800 transition-all flex items-center gap-1.5 sm:gap-2"
                           >
                              <Edit className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              <span className="hidden xs:inline">Edit Marks</span>
                              <span className="xs:hidden">Edit</span>
                           </button>
                        ) : (
                           <>
                              <button
                                 onClick={handleCancel}
                                 disabled={isSaving}
                                 className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:bg-gray-50 transition-all flex items-center gap-1.5 sm:gap-2"
                              >
                                 <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                 <span className="hidden sm:inline">Cancel</span>
                              </button>
                              <button
                                 onClick={handleSave}
                                 disabled={isSaving}
                                 className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-black text-white rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:bg-gray-800 transition-all flex items-center gap-1.5 sm:gap-2"
                              >
                                 <Save className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                 <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save'}</span>
                                 <span className="sm:hidden">{isSaving ? '...' : 'Save'}</span>
                              </button>
                           </>
                        )}
                        
                        <div className="h-6 sm:h-8 w-px bg-gray-200 mx-0.5 sm:mx-1 hidden sm:block"></div>

                        <button
                           onClick={() => setShowAddSubjectModal(true)}
                           className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:bg-gray-50 transition-all flex items-center gap-1.5 sm:gap-2"
                        >
                           <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                           <span className="hidden sm:inline">Add Subject</span>
                        </button>

                        <ExportButton 
                           onClick={handleExportToExcel}
                           disabled={!students || !examSubjects || students.length === 0 || examSubjects.length === 0}
                           text="Export"
                           className="bg-green-400 text-black border-green-500 hover:bg-green-500"
                        />
                     </div>
                  </div>
               </div>

               {/* Mobile Card View */}
               <div className="md:hidden">
                 {students && examSubjects && students.length > 0 && examSubjects.length > 0 ? (
                   <div className="divide-y divide-gray-100">
                     {sortedStudents.map((student) => {
                       const pct = calculateStudentPercentage(student.id)
                       return (
                         <div key={student.id} className="p-4">
                           {/* Student Header */}
                           <div className="flex items-center justify-between mb-3">
                             <div className="flex items-center gap-2.5">
                               <div className="w-8 h-8 rounded-lg bg-[#2c3e50] flex items-center justify-center text-white text-xs font-bold">
                                 {student.name.substring(0, 2).toUpperCase()}
                               </div>
                               <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">{student.name}</span>
                             </div>
                             <span className={`text-xs font-black px-2 py-1 rounded-lg ${
                               pct >= 75 ? 'bg-green-100 text-green-700' :
                               pct >= 50 ? 'bg-blue-100 text-blue-700' :
                               pct > 0 ? 'bg-yellow-100 text-yellow-700' :
                               'bg-gray-100 text-gray-500'
                             }`}>
                               {pct > 0 ? `${pct.toFixed(1)}%` : '-'}
                             </span>
                           </div>
                           
                           {/* Subject Marks Grid */}
                           <div className="grid grid-cols-2 gap-2">
                             {examSubjects.map((subject) => (
                               <div key={subject.id} className="bg-gray-50 rounded-lg p-2.5">
                                 <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide mb-1 truncate">
                                   {subject.subject_name}
                                 </div>
                                 {isEditing ? (
                                   <input
                                     type="text"
                                     value={marksData[student.id]?.[subject.id]?.[markField] || ''}
                                     onChange={(e) => handleMarkChange(student.id, subject.id, markField, e.target.value)}
                                     className="w-full px-2 py-1.5 text-center text-xs font-bold border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all bg-white"
                                     placeholder="-"
                                   />
                                 ) : (
                                   <div className={`text-sm font-bold text-center ${
                                     marksData[student.id]?.[subject.id]?.[markField] ? 'text-gray-900' : 'text-gray-400'
                                   }`}>
                                     {marksData[student.id]?.[subject.id]?.[markField] || '-'}
                                   </div>
                                 )}
                               </div>
                             ))}
                           </div>
                         </div>
                       )
                     })}
                   </div>
                 ) : (
                   <div className="text-center py-12 px-4">
                     <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                       <Search className="w-5 h-5 text-gray-400" />
                     </div>
                     <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-1">No Data Found</h3>
                     <p className="text-[10px] text-gray-500">
                       {!students || students.length === 0
                         ? 'No students assigned to you yet'
                         : 'No subjects found. Add a subject to get started.'}
                     </p>
                   </div>
                 )}
               </div>

               {/* Desktop Table View */}
               <div className="hidden md:block overflow-x-auto">
                 {students && examSubjects && students.length > 0 && examSubjects.length > 0 ? (
                   <Table>
                     <TableHeader>
                       <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                         <TableHead className="py-4 pl-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[200px]">Student Name</TableHead>
                         {examSubjects.map((subject) => (
                           <TableHead key={subject.id} className="py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[120px]">
                             {subject.subject_name}
                           </TableHead>
                         ))}
                         <TableHead className="py-4 pr-6 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[100px]">Average</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {sortedStudents.map((student) => {
                         const pct = calculateStudentPercentage(student.id)
                         return (
                           <TableRow key={student.id} className="group hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0">
                             <TableCell className="py-4 pl-6 font-medium text-gray-900">
                               <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-[#2c3e50] flex items-center justify-center text-white text-xs font-bold">
                                     {student.name.substring(0, 2).toUpperCase()}
                                  </div>
                                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{student.name}</span>
                               </div>
                             </TableCell>
                             {examSubjects.map((subject) => (
                               <TableCell key={subject.id} className="py-4 text-center">
                                 {isEditing ? (
                                    <div className="flex justify-center">
                                       <input
                                         type="text"
                                         value={marksData[student.id]?.[subject.id]?.[markField] || ''}
                                         onChange={(e) => handleMarkChange(student.id, subject.id, markField, e.target.value)}
                                         className="w-20 px-2 py-1 text-center text-xs font-bold border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                         placeholder="-"
                                       />
                                    </div>
                                 ) : (
                                   <span className={`text-xs font-bold ${marksData[student.id]?.[subject.id]?.[markField] ? 'text-gray-900' : 'text-gray-400'}`}>
                                     {marksData[student.id]?.[subject.id]?.[markField] || '-'}
                                   </span>
                                 )}
                               </TableCell>
                             ))}
                             <TableCell className="py-4 pr-6 text-right">
                               <span className={`text-xs font-black px-2 py-1 rounded-lg ${
                                 pct >= 75 ? 'bg-gray-500 text-white' :
                                 pct >= 50 ? 'bg-blue-500 text-white' :
                                 pct > 0 ? 'bg-yellow-500 text-white' :
                                 'bg-gray-500 text-white'
                               }`}>
                                 {pct > 0 ? `${pct.toFixed(1)}%` : '-'}
                               </span>
                             </TableCell>
                           </TableRow>
                         )
                       })}
                     </TableBody>
                   </Table>
                 ) : (
                   <div className="text-center py-12">
                     <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                       <Search className="w-6 h-6 text-gray-400" />
                     </div>
                     <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-1">No Data Found</h3>
                     <p className="text-xs text-gray-500">
                       {!students || students.length === 0
                         ? 'No students assigned to you yet'
                         : 'No subjects found. Add a subject to get started.'}
                     </p>
                   </div>
                 )}
               </div>
            </div>

            {/* Performance Analytics Section */}
            {students && examSubjects && students.length > 0 && examSubjects.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                 {/* Chart Card */}
                 <div className="bg-white rounded-xl sm:rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                    <div className="p-4 sm:p-6 border-b border-gray-100 bg-gray-50/30">
                       <h3 className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-[0.15em]">Performance Trend</h3>
                    </div>
                    <div className="p-4 sm:p-6">
                       <div className="h-[220px] sm:h-[280px]">
                         <StudentPerformanceChart
                           students={sortedStudents.map(student => {
                             const avg = calculateStudentAverage(student.id)
                             const marks = examSubjects.map(subject => {
                               const markValue = marksData[student.id]?.[subject.id]?.[markField]
                               if (markValue) {
                                 const markStr = String(markValue)
                                 const numericValue = parseFloat(markStr.split('/')[0])
                                 return isNaN(numericValue) ? 0 : numericValue
                               }
                               return 0
                             })
                             return {
                               studentName: student.name,
                               marks,
                               average: avg
                             }
                           })}
                           subjectNames={examSubjects.map(s => s.subject_name)}
                           maxMarks={exam?.max_marks || 100}
                         />
                       </div>
                    </div>
                 </div>

                 {/* AI Insights Card */}
                 <div className="bg-white rounded-xl sm:rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                    <div className="p-4 sm:p-6 border-b border-gray-100 bg-gray-50/30">
                       <h3 className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-[0.15em]">Priority Insights</h3>
                    </div>
                    
                    <div className="p-4 sm:p-6">
                       <div className="space-y-2 sm:space-y-3 max-h-[220px] sm:max-h-[280px] overflow-y-auto pr-2 custom-scrollbar">
                          {attentionItems.length > 0 ? (
                             attentionItems.map((item, index) => {
                                const priorityStyles = {
                                   high: 'bg-red-500 border-red-500 text-white',
                                   medium: 'bg-yellow-500 border-yellow-500 text-white',
                                   low: 'bg-green-500 border-green-500 text-white'
                                }
                                
                                return (
                                   <div key={item.studentId} className="p-3 sm:p-4 rounded-lg sm:rounded-xl border border-gray-200 bg-white hover:shadow-sm transition-all">
                                      <div className="flex justify-between items-start mb-2 sm:mb-3 gap-2">
                                         <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                            <span className="text-[9px] sm:text-[10px] font-black bg-gray-100 text-gray-600 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full flex-shrink-0">{index + 1}</span>
                                            <h4 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wide truncate">{item.studentName}</h4>
                                         </div>
                                         <span className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider rounded-lg border flex-shrink-0 ${priorityStyles[item.priority]}`}>
                                            {item.priority}
                                         </span>
                                      </div>
                                      
                                      <div className="space-y-1.5 sm:space-y-2 pl-7 sm:pl-9">
                                         {item.reasons.map((reason, idx) => (
                                            <div key={idx} className="flex items-start gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-gray-600">
                                               <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-gray-400 mt-1 sm:mt-1.5 flex-shrink-0"></div>
                                               <span className="leading-tight">{reason}</span>
                                            </div>
                                         ))}
                                      </div>
                                   </div>
                                )
                             })
                          ) : (
                             <div className="text-center py-8 sm:py-12">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 text-green-500 mx-auto mb-2 sm:mb-3">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" className="w-full h-full" fill="currentColor">
                                    <path d="M43.171,10.925L24.085,33.446l-9.667-9.015l1.363-1.463l8.134,7.585L41.861,9.378C37.657,4.844,31.656,2,25,2 C12.317,2,2,12.317,2,25s10.317,23,23,23s23-10.317,23-23C48,19.701,46.194,14.818,43.171,10.925z"></path>
                                  </svg>
                                </div>
                                <p className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wide">All Good!</p>
                                <p className="text-[10px] sm:text-xs text-gray-500 mt-1.5 sm:mt-2">No students require immediate attention based on current performance.</p>
                             </div>
                          )}
                       </div>
                    </div>
                 </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add Subject Modal */}
      <Modal isOpen={showAddSubjectModal} onClose={() => setShowAddSubjectModal(false)} size="md">
        <ModalHeader onClose={() => setShowAddSubjectModal(false)}>
          <ModalTitle>Add New Subject</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Input
            label="Subject Name"
            type="text"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            placeholder="Enter subject name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddSubject()
              }
            }}
            autoFocus
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowAddSubjectModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleAddSubject}
            disabled={!newSubjectName.trim()}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Subject
          </Button>
        </ModalFooter>
      </Modal>

      {/* Import Marks Modal */}
      {examSubjects && examSubjects.length > 0 && (
        <ImportMarksModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          examId={examId}
          peertutorsId={peertutorsInfo?.id || ''}
          availableSubjects={examSubjects}
          onImportComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['exam-marks', examId, peertutorsInfo?.id] })
            refetchSubjects()
          }}
        />
      )}
    </div>
  )
}

