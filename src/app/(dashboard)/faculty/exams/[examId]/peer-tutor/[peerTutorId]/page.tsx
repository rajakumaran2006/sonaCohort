'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import { ExamService, Exam } from '@/lib/services/examService'
import { PeerTutorService, PeerTutor } from '@/lib/services/peerTutorService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { ExamSubjectService, ExamSubject } from '@/lib/services/examSubjectService'
import { ExamMarksService } from '@/lib/services/examMarksService'
import { calculateAscendScore } from '@/lib/utils/ascendScore'
import {
  preprocessMarks,
  calculateStudentPerformance,
  calculateSubjectPerformance,
  generateAttentionItems,
  generateInsights,
  type StudentPerformance,
  type SubjectPerformance,
  type AttentionItem,
} from '@/lib/utils/examAnalytics'
import { Chart, Heatmap, Card, CardHeader, CardTitle, CardContent, LoadingOverlay, StudentPerformanceChart } from '@/components/ui'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Button } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyTable } from '@/components/ui'
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui'
import { Input } from '@/components/ui'
import { ArrowLeft, Edit, Save, X, Plus, Download, Filter, RotateCw } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Student } from '@/lib/services/studentService'

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
      const exportData: any[][] = []
      
      // Add header rows with exam information
      exportData.push(['Subjects Export Report'])
      exportData.push(['Department:', (department as any)?.dept || department?.name || ''])
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
  const calculateStudentAverage = (studentId: string): number => {
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
  }

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
  }, [students, sortBy, marksData, examSubjects])

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

            {/* Peer Tutor Info Card */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-xl">{peerTutor.name} - Exam Marks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Email</p>
                    <p className="text-base text-gray-900 mt-1">{peerTutor.email}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Year & Section</p>
                    <p className="text-base text-gray-900 mt-1">
                      {peerTutor.year} - {peerTutor.section}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Students</p>
                    <p className="text-base text-gray-900 mt-1">
                      {students?.length || 0} student(s) assigned
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Marks Table Card */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl">Student Marks</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                      Manage marks for all assigned students
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                    {/* Filter and Edit Actions - Top Row on Mobile */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      {/* Filter Dropdown */}
                      <div className="relative" ref={filterRef}>
                        <button
                          onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                          className={`inline-flex items-center justify-center p-2 transition-colors hover:bg-gray-100 rounded ${
                            sortBy !== 'name' ? 'text-blue-600' : 'text-gray-600'
                          }`}
                          title="Sort students"
                        >
                          <Filter className="h-5 w-5" />
                        </button>

                        {/* Filter Dropdown */}
                        {showFilterDropdown && (
                          <div className="absolute left-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                            <div className="p-4">
                              <h4 className="text-sm font-medium text-gray-900 mb-3">Sort Students By</h4>
                              
                              <div className="space-y-2">
                                <button
                                  onClick={() => {
                                    setSortBy('name')
                                    setShowFilterDropdown(false)
                                  }}
                                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                    sortBy === 'name'
                                      ? 'bg-blue-100 text-blue-700 font-medium'
                                      : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                                >
                                  Name (A-Z)
                                </button>
                                
                                <button
                                  onClick={() => {
                                    setSortBy('avg')
                                    setShowFilterDropdown(false)
                                  }}
                                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                    sortBy === 'avg'
                                      ? 'bg-blue-100 text-blue-700 font-medium'
                                      : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                                >
                                  Average (High to Low)
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {!isEditing ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setIsEditing(true)}
                          className="flex-1 sm:flex-initial"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Marks
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleCancel}
                            disabled={isSaving}
                            className="flex-1 sm:flex-initial"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSave}
                            loading={isSaving}
                            disabled={isSaving}
                            className="flex-1 sm:flex-initial"
                          >
                            <Save className="h-4 w-4 mr-2" />
                            Save
                          </Button>
                        </>
                      )}
                    </div>
                    
                    {/* Add Subject and Export - Bottom Row on Mobile */}
                    <div className="flex items-center gap-2 sm:gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddSubjectModal(true)}
                        className="flex-1 sm:flex-initial"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Subject
                    </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportToExcel}
                        className="flex-1 sm:flex-initial inline-flex items-center bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700"
                        disabled={!students || !examSubjects || students.length === 0 || examSubjects.length === 0}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {students && examSubjects && students.length > 0 && examSubjects.length > 0 ? (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <div className="inline-block min-w-full align-middle">
                    <Table>
                      <TableHeader>
                        <TableRow>
                            <TableHead className="sticky left-0 bg-gray-50 z-10 min-w-[150px] sm:min-w-[200px] px-2 sm:px-4">
                            Student Name
                          </TableHead>
                          {examSubjects.map((subject) => (
                              <TableHead key={subject.id} className="min-w-[120px] sm:min-w-[150px] px-2 sm:px-4">
                                <span className="text-xs sm:text-sm">{subject.subject_name}</span>
                            </TableHead>
                          ))}
                            <TableHead className="min-w-[80px] sm:min-w-[100px] bg-gray-50 font-semibold px-2 sm:px-4">
                              <span className="text-xs sm:text-sm">AVG</span>
                            </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                          {sortedStudents.map((student) => {
                            const avg = calculateStudentAverage(student.id)
                            return (
                          <TableRow key={student.id}>
                                <TableCell className="sticky left-0 bg-white z-10 font-medium text-gray-900 min-w-[150px] sm:min-w-[200px] px-2 sm:px-4">
                                  <span className="text-xs sm:text-sm">{student.name}</span>
                            </TableCell>
                            {examSubjects.map((subject) => (
                                  <TableCell key={subject.id} className="min-w-[120px] sm:min-w-[150px] px-2 sm:px-4">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={marksData[student.id]?.[subject.id]?.[markField] || ''}
                                    onChange={(e) => {
                                      let value = e.target.value
                                      // Allow "40/100" format or just "40"
                                      handleMarkChange(student.id, subject.id, markField, value)
                                    }}
                                        className="w-full px-1.5 sm:px-2 py-1 text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder={`e.g., 40`}
                                  />
                                ) : (
                                      <div className="text-xs sm:text-sm">
                                    {marksData[student.id]?.[subject.id]?.[markField] ? (
                                      <span className="font-medium">
                                        {marksData[student.id][subject.id][markField]}/{exam?.max_marks || 100}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">0/{exam?.max_marks || 100}</span>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                            ))}
                                <TableCell className="min-w-[80px] sm:min-w-[100px] bg-gray-50 font-semibold text-gray-900 px-2 sm:px-4">
                                  <span className="text-xs sm:text-sm">{avg > 0 ? avg.toFixed(2) : '-'}</span>
                                </TableCell>
                          </TableRow>
                            )
                          })}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">
                      {!students || students.length === 0
                        ? 'NO STUDENTS ASSIGNED'
                        : 'NO SUBJECTS FOUND. ADD A SUBJECT.'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance Analytics Section */}
            {students && examSubjects && students.length > 0 && examSubjects.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-xl">Performance Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Line Chart */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-4">Student Performance Chart</h3>
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
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

                    {/* Ranked Table */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-4">Student Priority Ranking (ML Analysis)</h3>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[60px]">Rank</TableHead>
                              <TableHead>Student Name</TableHead>
                              <TableHead className="min-w-[100px]">Priority</TableHead>
                              <TableHead className="min-w-[100px]">Average</TableHead>
                              <TableHead>Key Subjects</TableHead>
                              <TableHead>Reasons</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {attentionItems.length > 0 ? (
                              attentionItems.map((item, index) => {
                                const priorityColors = {
                                  high: 'bg-red-100 text-red-800',
                                  medium: 'bg-yellow-100 text-yellow-800',
                                  low: 'bg-green-100 text-green-800'
                                }
                                
                                const criticalSubjects = item.subjects.filter(s => s.status === 'critical').map(s => s.subjectName)
                                const warningSubjects = item.subjects.filter(s => s.status === 'warning').map(s => s.subjectName)
                                
                                return (
                                  <TableRow key={item.studentId}>
                                    <TableCell className="font-semibold text-gray-900">
                                      #{index + 1}
                                    </TableCell>
                                    <TableCell className="font-medium text-gray-900">
                                      {item.studentName}
                                    </TableCell>
                                    <TableCell>
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[item.priority]}`}>
                                        {item.priority.toUpperCase()}
                                      </span>
                                    </TableCell>
                                    <TableCell className="font-semibold">
                                      {item.averagePercentage.toFixed(2)}%
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-wrap gap-1">
                                        {criticalSubjects.length > 0 && (
                                          <span className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded border border-red-200">
                                            {criticalSubjects.join(', ')}
                                          </span>
                                        )}
                                        {warningSubjects.length > 0 && (
                                          <span className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded border border-yellow-200">
                                            {warningSubjects.join(', ')}
                                          </span>
                                        )}
                                        {criticalSubjects.length === 0 && warningSubjects.length === 0 && (
                                          <span className="text-xs text-gray-500">All subjects performing well</span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-600 max-w-md">
                                      <div className="space-y-1">
                                        {item.reasons.slice(0, 2).map((reason, idx) => (
                                          <div key={idx} className="text-xs">• {reason}</div>
                                        ))}
                                        {item.reasons.length > 2 && (
                                          <div className="text-xs text-gray-400">+{item.reasons.length - 2} more</div>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )
                              })
                            ) : (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                                  No performance data available
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
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

