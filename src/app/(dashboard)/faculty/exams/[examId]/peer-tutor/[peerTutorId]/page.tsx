'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import { ExamService } from '@/lib/services/examService'
import { PeerTutorService } from '@/lib/services/peerTutorService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { ExamSubjectService } from '@/lib/services/examSubjectService'
import { ExamMarksService } from '@/lib/services/examMarksService'
import {
  preprocessMarks,
  calculateStudentPerformance,
  calculateSubjectPerformance,
  generateAttentionItems,
  generateInsights,
} from '@/lib/utils/examAnalytics'
import { Heatmap, Card, CardContent, LoadingOverlay, StudentPerformanceChart } from '@/components/ui'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Button } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui'
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui'
import { Input } from '@/components/ui'
import { ArrowLeft, Edit, Save, Plus, Filter, RotateCw } from 'lucide-react'
import ExportButton from '@/components/ui/ExportButton'
import * as XLSX from 'xlsx'

export default function PeerTutorExamDetailsPage() {
  return (
    <FacultyProtectedRoute>
      <PeerTutorExamDetailsContent />
    </FacultyProtectedRoute>
  )
}

function PeerTutorExamDetailsContent() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const peerTutorId = params.peerTutorId as string
  const queryClient = useQueryClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [marksData, setMarksData] = useState<Record<string, Record<string, Record<string, number | string>>>>({})
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState('')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'avg'>('name')
  const filterRef = useRef<HTMLDivElement>(null)

  const [isSidebarCollapsed] = useSidebarCollapsed()

  // Fetch department data
  const { data: department, isLoading: isDepartmentLoading } = useQuery({
    queryKey: ['faculty-department', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await FacultyService.verifyFacultyAccess(user.email)
    },
    enabled: !!user?.email,
    staleTime: 10 * 60 * 1000,
  })

  // Fetch exam details
  const { data: exam, isLoading: isExamLoading } = useQuery({
    queryKey: ['exam-details', examId],
    queryFn: async () => await ExamService.getExamById(examId),
    enabled: !!examId,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch peer tutor details
  const { data: peerTutor, isLoading: isPeerTutorLoading } = useQuery({
    queryKey: ['peer-tutor-details', peerTutorId],
    queryFn: async () => await PeerTutorService.getPeerTutorById(peerTutorId),
    enabled: !!peerTutorId,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch students assigned to peer tutor
  const { data: students, isLoading: isStudentsLoading } = useQuery({
    queryKey: ['peer-tutor-students', peerTutorId],
    queryFn: async () => {
      if (!peerTutorId) return []
      return await AssignmentService.getStudentsByPeerTutor(peerTutorId)
    },
    enabled: !!peerTutorId,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch exam subjects for this exam
  const { data: examSubjects, isLoading: isSubjectsLoading, refetch: refetchSubjects } = useQuery({
    queryKey: ['exam-subjects', examId],
    queryFn: async () => await ExamSubjectService.getExamSubjects(examId),
    enabled: !!examId,
    staleTime: 5 * 60 * 1000,
  })

  // Initialize subjects from classes if none exist
  useEffect(() => {
    if (exam && peerTutor && examSubjects && examSubjects.length === 0) {
      ExamSubjectService.initializeSubjectsFromClasses(
        examId,
        peerTutor.id,
        peerTutor.dept,
        peerTutor.year,
        peerTutor.section
      ).then(() => {
        refetchSubjects()
      })
    }
  }, [exam, peerTutor, examSubjects, examId, refetchSubjects])

  // Fetch existing exam marks
  const { data: existingMarks, isLoading: isMarksLoading } = useQuery({
    queryKey: ['exam-marks', examId, peerTutorId],
    queryFn: async () => {
      if (!examId || !peerTutorId) return []
      return await ExamMarksService.getExamMarksByPeerTutorAndExam(peerTutorId, examId)
    },
    enabled: !!examId && !!peerTutorId,
    staleTime: 1 * 60 * 1000, // Reduced stale time for better real-time updates
    refetchOnWindowFocus: true, // Refetch when window gains focus
  })

  const loading = isDepartmentLoading || isExamLoading || isPeerTutorLoading || isStudentsLoading || isSubjectsLoading || isMarksLoading

  // Initialize marks data
  useEffect(() => {
    if (existingMarks && students && examSubjects) {
      const initialMarks: Record<string, Record<string, Record<string, number | string>>> = {}
      
      students.forEach(student => {
        initialMarks[student.id] = {}
        examSubjects.forEach(subject => {
          initialMarks[student.id][subject.id] = {}
          
          const existingMark = existingMarks.find(
            mark => mark.student_id === student.id && mark.exam_subject_id === subject.id
          )
          
          if (existingMark && existingMark.marks) {
            Object.keys(existingMark.marks).forEach(field => {
              initialMarks[student.id][subject.id][field] = existingMark.marks[field]
            })
          } else {
            initialMarks[student.id][subject.id] = {
              'marks': ''
            }
          }
        })
      })
      
      setMarksData(initialMarks)
    }
  }, [existingMarks, students, examSubjects])

  // Update marks data when new students or subjects are added
  useEffect(() => {
    if (students && examSubjects && !isEditing) {
      setMarksData(prev => {
        const updated = { ...prev }
        
        students.forEach(student => {
          if (!updated[student.id]) {
            updated[student.id] = {}
          }
          examSubjects.forEach(subject => {
            if (!updated[student.id]?.[subject.id]) {
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
        queryClient.invalidateQueries({ queryKey: ['faculty-department', user?.email] }),
        queryClient.invalidateQueries({ queryKey: ['exam-details', examId] }),
        queryClient.invalidateQueries({ queryKey: ['peer-tutor-details', peerTutorId] }),
        queryClient.invalidateQueries({ queryKey: ['peer-tutor-students', peerTutorId] }),
        queryClient.invalidateQueries({ queryKey: ['exam-subjects', examId] }),
        queryClient.invalidateQueries({ queryKey: ['exam-marks', examId, peerTutorId] }),
      ])
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
    if (!examId || !peerTutorId || !students || !examSubjects) return

    setIsSaving(true)
    try {
      const marksToSave = []
      
      for (const student of students) {
        for (const subject of examSubjects) {
          const studentMarks = marksData[student.id]?.[subject.id]
          if (studentMarks) {
            marksToSave.push({
              exam_id: examId,
              peer_tutor_id: peerTutorId,
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
        // Invalidate queries for both faculty and peer tutor views
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['exam-marks', examId, peerTutorId] }),
          queryClient.invalidateQueries({ queryKey: ['exam-marks', examId] }), // For peer tutor view
        ])
      } else {
        alert('Failed to save marks. Please try again.')
      }
    } catch (error) {
      console.error('Error saving marks:', error)
      alert('An error occurred while saving marks')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    queryClient.invalidateQueries({ queryKey: ['exam-marks', examId, peerTutorId] })
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
    if (!newSubjectName.trim() || !examId) return

    const subject = await ExamSubjectService.addExamSubject({
      exam_id: examId,
      subject_name: newSubjectName.trim(),
      is_custom: true,
      created_by: null, // Faculty created
    })

    if (subject) {
      setNewSubjectName('')
      setShowAddSubjectModal(false)
      queryClient.invalidateQueries({ queryKey: ['exam-subjects', examId] })
      refetchSubjects()
    } else {
      alert('Failed to add subject')
    }
  }

  // Excel export function - respects filter/sort order
  const handleExportToExcel = async () => {
    if (!exam || !peerTutor || !students || !examSubjects || students.length === 0 || examSubjects.length === 0) return

    try {
      // Get exam subjects
      const subjects = examSubjects
      
      // Prepare data for export
      const exportData: (string | number)[][] = []
      
      // Add header rows with exam information
      exportData.push(['Subjects Export Report'])
      exportData.push(['Department:', (department as { dept?: string; name?: string })?.dept || department?.name || ''])
      exportData.push(['Year:', peerTutor.year])
      exportData.push(['Section:', peerTutor.section])
      exportData.push(['Peer Tutor:', peerTutor.name])
      exportData.push(['Generated on:', new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })])
      exportData.push([]) // Empty row
      
      // Create header row: Student Name, then all subjects
      const headerRow = ['Student Name', ...subjects.map(s => s.subject_name)]
      exportData.push(headerRow)
      
      // Get marks for all students
      const marks = await ExamMarksService.getExamMarksByPeerTutorAndExam(peerTutorId, examId)
      
      // Organize marks by student and subject
      const marksByStudentSubject: Record<string, Record<string, string>> = {}
      marks.forEach(mark => {
        if (!marksByStudentSubject[mark.student_id]) {
          marksByStudentSubject[mark.student_id] = {}
        }
        if (mark.exam_subject_id && mark.marks?.marks) {
          // Extract numeric value from "40/100" format or just "40"
          const markStr = String(mark.marks.marks)
          const numericValue = markStr.includes('/') ? markStr.split('/')[0] : markStr
          marksByStudentSubject[mark.student_id][mark.exam_subject_id] = numericValue
        }
      })
      
      // Add data rows using sortedStudents (respects current filter/sort)
      // Skip students with no marks (pending)
      sortedStudents.forEach(student => {
        // Check if student has any marks
        const hasMarks = subjects.some(subject => {
          return marksByStudentSubject[student.id]?.[subject.id] && marksByStudentSubject[student.id][subject.id] !== ''
        })
        
        // Only include students who have at least one mark
        if (hasMarks) {
          const row = [student.name]
          subjects.forEach(subject => {
            const markValue = marksByStudentSubject[student.id]?.[subject.id] || ''
            row.push(markValue)
          })
          exportData.push(row)
        }
      })
      
      // Create workbook and worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(exportData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Exam Marks')
      
      // Generate filename
      const filename = `Exam_${exam.name.replace(/[^a-zA-Z0-9]/g, '_')}_${peerTutor.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
      
      // Write file
      XLSX.writeFile(workbook, filename)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      alert('Error exporting to Excel. Please try again.')
    }
  }

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

  const insights = useMemo(() => {
    return generateInsights(studentPerformance, subjectPerformance)
  }, [studentPerformance, subjectPerformance])

  // Prepare heatmap data
  const heatmapData = useMemo(() => {
    if (!students || !examSubjects) return []
    return processedMarks.map(mark => ({
      student: mark.studentName,
      subject: mark.subjectName,
      value: mark.percentage,
    }))
  }, [processedMarks, students, examSubjects])

  // Prepare chart data adapting StudentPerformance to StudentMark interface
  const chartData = useMemo(() => {
    if (!studentPerformance || !examSubjects) return []
    return studentPerformance.map(sp => {
      // Map marks to subjects maintaining order
      const marks = examSubjects.map(subject => {
        const score = sp.subjectScores.find(s => s.subjectName === subject.subject_name)
        return score ? score.mark : 0
      })
      
      // Calculate raw average for the chart (same scale as marks)
      const average = sp.subjectCount > 0 ? sp.totalMarks / sp.subjectCount : 0
      
      return {
        studentName: sp.studentName,
        marks,
        average
      }
    })
  }, [studentPerformance, examSubjects])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <FacultySidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
          <PageHeader
            title="PEER TUTOR EXAM DETAILS"
            lastRefresh={lastRefresh}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            isSidebarCollapsed={isSidebarCollapsed}
          />
          <main className="flex-1 overflow-y-auto">
            <LoadingOverlay className="h-96" size="xl">
              Loading exam details...
            </LoadingOverlay>
          </main>
        </div>
      </div>
    )
  }

  if (!exam || !peerTutor) {
    return (
      <div className="min-h-screen bg-gray-50">
        <FacultySidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
          <PageHeader
            title="PEER TUTOR EXAM DETAILS"
            lastRefresh={lastRefresh}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            isSidebarCollapsed={isSidebarCollapsed}
          />
          <main className="flex-1 overflow-y-auto">
            <div className={`max-w-7xl mx-auto py-8 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-0' : 'px-4 sm:px-6 lg:px-8'}`}>
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <p className="text-gray-500">Exam or peer tutor not found</p>
                    <Button
                      variant="secondary"
                      onClick={() => router.push(`/faculty/exams/${examId}`)}
                      className="mt-4"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
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
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 w-full">
          <div className={`flex items-center justify-between py-4 w-full ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
            <div className="flex items-center flex-1">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 mr-2"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <h1 className="text-xl font-semibold text-gray-900">{peerTutor.name} ALLOCATED STUDENT MARK</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh"
              >
                <RotateCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <Button
                variant="secondary"
                onClick={() => router.push(`/faculty/exams/${examId}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className={`max-w-full mx-auto py-8 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
            {/* Breadcrumbs */}
            <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-6">
              <button
                onClick={() => router.push('/faculty/exams')}
                className="hover:text-gray-700 transition-colors"
              >
                Exams
              </button>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <button
                onClick={() => router.push(`/faculty/exams/${examId}`)}
                className="hover:text-gray-700 transition-colors"
              >
                {exam.name}
              </button>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-gray-900 font-medium">{peerTutor.name}</span>
            </nav>

            {/* Peer Tutor Info Card - Clean White Design */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8 relative group overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em]">Peer Tutor Performance</p>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 tracking-tight mb-4">{peerTutor.name}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Email Address</p>
                        <p className="text-sm font-bold text-gray-700">{peerTutor.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Year & Section</p>
                        <p className="text-sm font-bold text-gray-700">{peerTutor.year} - {peerTutor.section}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Assigned Students</p>
                        <p className="text-sm font-bold text-gray-700">{students?.length || 0} Students</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Marks Table View - Clean White Design */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                      Student Marks Table
                    </h3>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="relative" ref={filterRef}>
                      <button
                        onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                        className={`p-2 rounded-lg border transition-all ${
                          sortBy !== 'name'
                            ? 'bg-blue-50 border-blue-200 text-blue-600'
                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                        title="Sort Students"
                      >
                        <Filter className="w-5 h-5" />
                      </button>

                      {showFilterDropdown && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 z-30 py-2">
                          <button
                            onClick={() => { setSortBy('name'); setShowFilterDropdown(false); }}
                            className={`w-full text-left px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                              sortBy === 'name' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            Name (A-Z)
                          </button>
                          <button
                            onClick={() => { setSortBy('avg'); setShowFilterDropdown(false); }}
                            className={`w-full text-left px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                              sortBy === 'avg' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            Average Score
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="h-8 w-[1px] bg-gray-200 mx-1"></div>

                    {!isEditing ? (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 transition-all shadow-sm shadow-blue-200"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Edit Marks
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCancel}
                          className="px-4 py-2 bg-white border border-gray-200 text-gray-500 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-gray-50 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSave}
                          disabled={isSaving}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-green-700 transition-all disabled:opacity-50"
                        >
                          {isSaving ? 'Saving...' : (
                            <>
                              <Save className="w-3.5 h-3.5" />
                              Save Changes
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => setShowAddSubjectModal(true)}
                      className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-all"
                      title="Add Subject"
                    >
                      <Plus className="w-5 h-5" />
                    </button>

                    <ExportButton onClick={handleExportToExcel} />
                  </div>
                </div>
              </div>
                {students && examSubjects && students.length > 0 && examSubjects.length > 0 ? (
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-white border-b border-gray-100">
                        <TableHead className="pl-6 py-4 sticky left-0 bg-white z-10 min-w-[200px]">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Student Name</span>
                        </TableHead>
                        {examSubjects.map((subject) => (
                          <TableHead key={subject.id} className="text-center py-4 min-w-[120px]">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{subject.subject_name}</span>
                          </TableHead>
                        ))}
                        <TableHead className="text-right pr-6 py-4 min-w-[100px]">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-blue-600">Average</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedStudents.map((student) => {
                        const avg = calculateStudentAverage(student.id)
                        return (
                          <TableRow key={student.id} className="hover:bg-gray-50/50 transition-colors group border-b border-gray-50">
                            <TableCell className="pl-6 py-4 sticky left-0 bg-white z-10 group-hover:bg-gray-50/50 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[10px] font-bold text-blue-600">{student.name.substring(0, 2).toUpperCase()}</span>
                                </div>
                                <span className="text-sm font-bold text-gray-700">{student.name}</span>
                              </div>
                            </TableCell>
                            {examSubjects.map((subject) => (
                              <TableCell key={subject.id} className="text-center py-4">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={marksData[student.id]?.[subject.id]?.[markField] || ''}
                                    onChange={(e) => handleMarkChange(student.id, subject.id, markField, e.target.value)}
                                    className="w-16 mx-auto px-2 py-1 text-center text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                    placeholder="-"
                                  />
                                ) : (
                                  <span className={`text-sm font-bold ${
                                    (marksData[student.id]?.[subject.id]?.[markField]) ? 'text-gray-700' : 'text-gray-300'
                                  }`}>
                                    {marksData[student.id]?.[subject.id]?.[markField] || '-'}
                                  </span>
                                )}
                              </TableCell>
                            ))}
                            <TableCell className="text-right pr-6 py-4">
                              <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50/50 border border-blue-100">
                                <span className={`text-xs font-black ${
                                  avg >= 80 ? 'text-green-600' : 
                                  avg >= 60 ? 'text-blue-600' : 
                                  avg > 0 ? 'text-orange-600' : 
                                  'text-gray-400'
                                }`}>
                                  {avg.toFixed(1)}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  </div>
                ) : (
                  <div className="p-12 text-center border-t border-gray-100">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                      {!students || students.length === 0
                        ? 'No Students Assigned'
                        : 'No Subjects Found. Please Add a Subject.'}
                    </p>
                  </div>
                )}
              </div>

            {/* Performance Analytics Section - Clean White Design */}
            {students && examSubjects && students.length > 0 && examSubjects.length > 0 && (
              <div className="space-y-8 mt-12">
                <div className="flex items-center gap-3">
                  <div className="h-[1px] flex-1 bg-gray-200"></div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-4">Performance Analytics</h3>
                  <div className="h-[1px] flex-1 bg-gray-200"></div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Performance Chart Card */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100">
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Student Performance Overview</h4>
                    </div>
                    <div className="p-6">
                      <StudentPerformanceChart 
                        students={chartData} 
                        subjectNames={examSubjects?.map(s => s.subject_name) || []}
                        maxMarks={exam.max_marks || 100} 
                      />
                    </div>
                  </div>

                  {/* Subject Heatmap Card */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100">
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Student-Subject Distribution</h4>
                    </div>
                    <div className="p-6">
                      <Heatmap
                        data={heatmapData}
                        students={sortedStudents.map(s => s.name)}
                        subjects={examSubjects?.map(s => s.subject_name) || []}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {/* Attention Required Card */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 bg-red-50/30">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                        <h4 className="text-xs font-bold text-red-700 uppercase tracking-wider">Critical Attention</h4>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="space-y-4">
                        {attentionItems.length > 0 ? (
                          attentionItems.map((item, idx) => (
                            <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 italic transition-transform hover:scale-[1.02]">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5"></div>
                              <p className="text-xs text-gray-600 leading-relaxed font-medium">
                                <span className="font-bold text-gray-900">{item.studentName}</span>: {item.reasons.join(', ')}
                              </p>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-6 text-gray-400 italic text-xs uppercase tracking-widest font-bold">
                            All students performing well
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* High Performers Card */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 bg-green-50/30">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <h4 className="text-xs font-bold text-green-700 uppercase tracking-wider">Top Performers</h4>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="space-y-4">
                        {insights.filter(i => i.type === 'positive').map((insight, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 transition-transform hover:scale-[1.02]">
                            <svg className="w-4 h-4 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                            <p className="text-xs text-gray-600 leading-relaxed font-medium">{insight.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* General Insights Card */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 bg-blue-50/30">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider">Performance Insights</h4>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="space-y-4">
                        {insights.filter(i => i.type !== 'positive').map((insight, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 transition-transform hover:scale-[1.02]">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5"></div>
                            <p className="text-xs text-gray-600 leading-relaxed font-medium">{insight.text}</p>
                          </div>
                        ))}
                      </div>
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
    </div>
  )
}

