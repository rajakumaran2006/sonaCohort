'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import { ExamService, Exam } from '@/lib/services/examService'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { ExamMarksService } from '@/lib/services/examMarksService'
import { ExamSubjectService } from '@/lib/services/examSubjectService'
import { AssignmentService } from '@/lib/services/assignmentService'
import ExamPageSkeleton from '@/components/skeletons/ExamPageSkeleton'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Button } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui'
import CreateExamModal from '@/components/forms/modals/CreateExamModal'
import DeleteConfirmationModal from '@/components/forms/modals/DeleteConfirmationModal'
import { FileText, Plus } from 'lucide-react'
import ExportButton from '@/components/ui/ExportButton'
import * as XLSX from 'xlsx'
import { calculatepeertutorsAscendScore } from '@/lib/utils/ascendScore'
import { logger } from '@/lib/logger'

export default function FacultyExamsPage() {
  return (
    <FacultyProtectedRoute>
      <FacultyExamsContent />
    </FacultyProtectedRoute>
  )
}

function FacultyExamsContent() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [examStats, setExamStats] = useState<Record<string, {
    total: number
    completed: number
    pending: number
    ongoing: number
  }>>({})
  const [, setIsLoadingStats] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedExamIds, setSelectedExamIds] = useState<Set<string>>(new Set())
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [examsToDelete, setExamsToDelete] = useState<{name: string, id: string}[]>([])
  const [isDeleting, setIsDeleting] = useState(false)

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

  // Fetch exams
  const { data: exams, isLoading: isExamsLoading, refetch: refetchExams } = useQuery({
    queryKey: ['faculty-exams'],
    queryFn: async () => await ExamService.getAllExams(),
    staleTime: 5 * 60 * 1000,
  })

  // Fetch all peer tutors (across all years)
  // Fetch all peer tutors (filtered by department)
  const { data: allpeerTutor, isLoading: ispeerTutorLoading } = useQuery({
    queryKey: ['all-peer-tutors', department?.name],
    queryFn: async () => {
      if (!department?.name) return []
      return await peertutorservice.getpeerTutorByDepartment(department.name)
    },
    enabled: !!department?.name,
    staleTime: 5 * 60 * 1000,
  })

  const loading = isDepartmentLoading || isExamsLoading || ispeerTutorLoading

  // Calculate exam statistics
  useEffect(() => {
    if (!exams || exams.length === 0) return

    const calculateStats = async () => {
      setIsLoadingStats(true)
      const stats: Record<string, {
        total: number
        completed: number
        pending: number
        ongoing: number
      }> = {}

      for (const exam of exams) {
        try {
          // Get peer tutors for this exam's years
          const peerTutor = await peertutorservice.getpeerTutorByYears(exam.years)
          const examSubjects = await ExamSubjectService.getExamSubjects(exam.id)
          const totalSubjects = examSubjects.length

          let completed = 0
          let pending = 0
          let ongoing = 0

          for (const tutor of peerTutor) {
            try {
              const marks = await ExamMarksService.getExamMarksBypeertutorsAndExam(tutor.id, exam.id)
              const students = await AssignmentService.getStudentsBypeertutors(tutor.id)

              // Organize marks by student and subject
              const allStudentsMarks: Record<string, Record<string, Record<string, number | string>>> = {}

              students.forEach(student => {
                allStudentsMarks[student.id] = {}
                marks.forEach(mark => {
                  if (mark.student_id === student.id && mark.exam_subject_id) {
                    if (!allStudentsMarks[student.id][mark.exam_subject_id]) {
                      allStudentsMarks[student.id][mark.exam_subject_id] = {}
                    }
                    if (mark.marks) {
                      Object.assign(allStudentsMarks[student.id][mark.exam_subject_id], mark.marks)
                    }
                  }
                })
              })

              // Calculate completion percentage
              let enteredMarks = 0
              const totalPossible = students.length * totalSubjects

              if (totalPossible > 0) {
                students.forEach(student => {
                  examSubjects.forEach(subject => {
                    const markData = allStudentsMarks[student.id]?.[subject.id]
                    if (markData && markData.marks !== undefined && markData.marks !== null && markData.marks !== '') {
                      enteredMarks++
                    }
                  })
                })

                const completion = Math.round((enteredMarks / totalPossible) * 100)

                if (completion === 0) {
                  pending++
                } else if (completion === 100) {
                  completed++
                } else {
                  ongoing++
                }
              } else {
                pending++
              }
            } catch (error) {
              logger.error(`Error calculating stats for tutor ${tutor.id}:`, error)
              pending++
            }
          }

          stats[exam.id] = {
            total: peerTutor.length,
            completed,
            pending,
            ongoing,
          }
        } catch (error) {
          logger.error(`Error calculating stats for exam ${exam.id}:`, error)
          stats[exam.id] = {
            total: 0,
            completed: 0,
            pending: 0,
            ongoing: 0,
          }
        }
      }

      setExamStats(stats)
      setIsLoadingStats(false)
    }

    calculateStats()
  }, [exams])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['faculty-department', user?.email] }),
        queryClient.invalidateQueries({ queryKey: ['faculty-exams'] }),
      ])
      setLastRefresh(new Date())
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['faculty-exams'] })
    refetchExams()
  }

  const handleDeleteModeToggle = () => {
    setIsDeleteMode(!isDeleteMode)
    setSelectedExamIds(new Set())
  }

  const handleSelectExam = (examId: string) => {
    const newSelected = new Set(selectedExamIds)
    if (newSelected.has(examId)) {
      newSelected.delete(examId)
    } else {
      newSelected.add(examId)
    }
    setSelectedExamIds(newSelected)
  }

  const handleSelectAllExams = () => {
    if (!exams) return
    if (selectedExamIds.size === exams.length) {
      setSelectedExamIds(new Set())
    } else {
      setSelectedExamIds(new Set(exams.map(e => e.id)))
    }
  }

  const handleBulkDeleteExams = () => {
    if (!exams || selectedExamIds.size === 0) return
    
    const examsToDelete = exams
      .filter(e => selectedExamIds.has(e.id))
      .map(e => ({ name: e.name, id: e.id }))
    
    setExamsToDelete(examsToDelete)
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    setIsDeleting(true)
    try {
      const deletePromises = Array.from(selectedExamIds).map(id => 
        ExamService.deleteExam(id)
      )
      
      await Promise.all(deletePromises)
      
      queryClient.invalidateQueries({ queryKey: ['faculty-exams'] })
      refetchExams()
      setSelectedExamIds(new Set())
      setIsDeleteMode(false)
      setDeleteModalOpen(false)
    } catch (error) {
      logger.error('Error deleting exams:', error)
      alert('An error occurred while deleting exams')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleExamClick = (exam: Exam) => {
    router.push(`/faculty/exams/${exam.id}`)
  }

  const formatYears = (years: string[]): string => {
    const yearMap: { [key: string]: string } = {
      '2': '2nd Year',
      '3': '3rd Year',
      '4': '4th Year',
    }
    return years.map(y => yearMap[y] || y).join(', ')
  }

  const formatYear = (year: string): string => {
    const yearMap: { [key: string]: string } = {
      '2': '2nd Year',
      '3': '3rd Year',
      '4': '4th Year',
    }
    return yearMap[year] || year
  }

  // Export all exams to Excel
  const handleExportAllExams = async () => {
    if (!exams || exams.length === 0) {
      alert('No exams to export')
      return
    }

    if (!department) {
      alert('Department information not available')
      return
    }

    setIsExporting(true)
    try {
      const workbook = XLSX.utils.book_new()

      // Process each exam
      for (const exam of exams) {
        try {
          // Get exam subjects
          const examSubjects = await ExamSubjectService.getExamSubjects(exam.id)
          
          // Get peer tutors for this exam's years
          const peerTutor = await peertutorservice.getpeerTutorByYears(exam.years)
          
          // Get all unique years and sections from peer tutors
          const uniqueYears = Array.from(new Set(peerTutor.map(pt => pt.year)))
          const uniqueSections = Array.from(new Set(peerTutor.map(pt => pt.section)))
          
          // Format years and sections
          const yearsText = uniqueYears.map(y => formatYear(y)).join(', ')
          const sectionsText = uniqueSections.length > 1 ? 'ALL' : uniqueSections[0] || 'ALL'
          
          // Prepare export data
          const exportData: (string | number)[][] = []
          
          // Add header rows following xlsx-rule.mdc format
          exportData.push(['Subjects Export Report'])
          exportData.push([`Department: ${(department as { dept?: string; name?: string })?.dept || department.name || ''}`])
          exportData.push([`Year: ${yearsText}`])
          exportData.push([`Section: ${sectionsText}`])
          exportData.push([
            `Generated on: ${new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}`
          ])
          exportData.push([]) // Empty row
          
          // Calculate completion percentages and ascend scores for each peer tutor
          const completionPercentages: Record<string, number> = {}
          const ascendScores: Record<string, number> = {}
          
          for (const peertutors of peerTutor) {
            try {
              const marks = await ExamMarksService.getExamMarksBypeertutorsAndExam(peertutors.id, exam.id)
              const students = await AssignmentService.getStudentsBypeertutors(peertutors.id)
              
              // Organize marks by student and subject
              const allStudentsMarks: Record<string, Record<string, Record<string, number | string>>> = {}
              
              students.forEach(student => {
                allStudentsMarks[student.id] = {}
                marks.forEach(mark => {
                  if (mark.student_id === student.id && mark.exam_subject_id) {
                    if (!allStudentsMarks[student.id][mark.exam_subject_id]) {
                      allStudentsMarks[student.id][mark.exam_subject_id] = {}
                    }
                    if (mark.marks) {
                      Object.assign(allStudentsMarks[student.id][mark.exam_subject_id], mark.marks)
                    }
                  }
                })
              })
              
              ascendScores[peertutors.id] = calculatepeertutorsAscendScore(allStudentsMarks, exam.max_marks || 100)
              
              // Calculate completion percentage
              let enteredMarks = 0
              const totalPossible = students.length * examSubjects.length
              
              if (totalPossible > 0) {
                students.forEach(student => {
                  examSubjects.forEach(subject => {
                    const markData = allStudentsMarks[student.id]?.[subject.id]
                    if (markData && markData.marks !== undefined && markData.marks !== null && markData.marks !== '') {
                      enteredMarks++
                    }
                  })
                })
                
                completionPercentages[peertutors.id] = Math.round((enteredMarks / totalPossible) * 100)
              } else {
                completionPercentages[peertutors.id] = 0
              }
            } catch (error) {
              logger.error(`Error calculating scores for tutor ${peertutors.id}:`, error)
              ascendScores[peertutors.id] = 0
              completionPercentages[peertutors.id] = 0
            }
          }
          
          // Sort peer tutors by year, then section, then name
          const sortedpeerTutor = [...peerTutor].sort((a, b) => {
            if (a.year !== b.year) return a.year.localeCompare(b.year)
            if (a.section !== b.section) return a.section.localeCompare(b.section)
            return a.name.localeCompare(b.name)
          })
          
          // For each peer tutor
          for (const peertutors of sortedpeerTutor) {
            const completion = completionPercentages[peertutors.id] || 0
            
            // If 0% completion, only show peer tutor name, ascend score, and completion percentage
            if (completion === 0) {
              exportData.push(['Peer Tutor Name:', peertutors.name])
              exportData.push(['Ascend Score:', `${ascendScores[peertutors.id]?.toFixed(1) || '0.0'}/10`])
              exportData.push(['Completion Status:', `${completion}%`])
              exportData.push([]) // Empty row
              continue
            }
            
            // Otherwise, show full details
            exportData.push(['Peer Tutor Name:', peertutors.name])
            exportData.push(['Ascend Score:', `${ascendScores[peertutors.id]?.toFixed(1) || '0.0'}/10`])
            exportData.push(['Completion Status:', `${completion}%`])
            exportData.push([]) // Empty row
            
            // Get students and marks for this peer tutor
            const students = await AssignmentService.getStudentsBypeertutors(peertutors.id)
            const marks = await ExamMarksService.getExamMarksBypeertutorsAndExam(peertutors.id, exam.id)
            
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
            
            // For each student assigned to this peer tutor
            for (const student of students) {
              exportData.push(['Peer Tutor Allocated:', peertutors.name])
              
              // For each subject - show subject name and marks
              for (const subject of examSubjects) {
                const markValue = marksByStudentSubject[student.id]?.[subject.id] || ''
                exportData.push(['', `Subject: ${subject.subject_name}`, markValue ? `Marks: ${markValue}` : ''])
              }
              
              exportData.push([]) // Empty row after each student
            }
          }
          
          // Create worksheet
          const worksheet = XLSX.utils.aoa_to_sheet(exportData)
          
          // Create sheet name (Excel has a 31 character limit for sheet names)
          const sheetName = exam.name.substring(0, 31).replace(/[\/\\\?\*\[\]:]/g, '_')
          
          // Add worksheet to workbook
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
        } catch (error) {
          logger.error(`Error exporting exam ${exam.id}:`, error)
          // Continue with next exam even if one fails
        }
      }
      
      // Generate filename
      const filename = `All_Exams_Export_${new Date().toISOString().split('T')[0]}.xlsx`
      
      // Write file
      XLSX.writeFile(workbook, filename)
    } catch (error) {
      logger.error('Error exporting to Excel:', error)
      alert('Error exporting to Excel. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      {/* Main Content */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden w-full lg:w-auto`}>
        {/* Top Header */}
        <PageHeader
          title="EXAM MANAGEMENT"
          tagline="Marks Entry & Performance Tracking"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className={`max-w-full mx-auto py-8 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
          {loading ? (
            <ExamPageSkeleton />
          ) : (
            <>
              
              {/* Stats Cards - Clean White Design */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Total Exams Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Total Exams</p>
                      <p className="text-3xl font-bold text-gray-900 tracking-tight">{exams?.length || 0}</p>
                    </div>
                    <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                      <FileText className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                      Current Academic Year
                    </p>
                  </div>
                </div>

                {/* Total Peer Tutors Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Peer Tutors</p>
                      <p className="text-3xl font-bold text-gray-900 tracking-tight">
                        {allpeerTutor?.length || 0}
                      </p>
                    </div>
                    <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                      Across All Years
                    </p>
                  </div>
                </div>

                {/* Completed Entries Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Completed</p>
                      <p className="text-3xl font-bold text-gray-900 tracking-tight">
                        {Object.values(examStats).reduce((acc, curr) => acc + curr.completed, 0)}
                      </p>
                    </div>
                    <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                      <svg className="w-4 h-4 text-black-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                    <p className="text-[9px] font-bold text-green-600 uppercase tracking-widest flex items-center gap-1.5">
                      Marks Entered
                    </p>
                  </div>
                </div>

                {/* Pending Entries Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Pending</p>
                      <p className="text-3xl font-bold text-gray-900 tracking-tight">
                        {Object.values(examStats).reduce((acc, curr) => acc + curr.pending + curr.ongoing, 0)}
                      </p>
                    </div>
                    <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                      <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                    <p className="text-[9px] font-bold text-orange-600 uppercase tracking-widest flex items-center gap-1.5">
                      Action Required
                    </p>
                  </div>
                </div>
              </div>

              {/* Exams list View - Clean White Design */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                        Exam Schedules ({exams?.length || 0})
                      </h3>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest mt-1">
                        Manage and track exam performance
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {!isDeleteMode ? (
                        <>
                          <Button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="bg-black hover:bg-gray-900 text-white border-2 border-transparent px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Create Exam
                          </Button>

                          {exams && exams.length > 0 && (
                            <button
                              onClick={handleDeleteModeToggle}
                              className="p-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors duration-200"
                              title="Delete"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </button>
                          )}
                          
                          {exams && exams.length > 0 && (
                            <ExportButton 
                              onClick={handleExportAllExams}
                              disabled={isExporting}
                              isLoading={isExporting}
                              text="EXPORT"
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            onClick={handleBulkDeleteExams}
                            disabled={selectedExamIds.size === 0}
                            className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors duration-200"
                          >
                            Delete Selected ({selectedExamIds.size})
                          </button>
                          <button
                            onClick={handleDeleteModeToggle}
                            className="px-4 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium transition-colors duration-200"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {exams && exams.length > 0 ? (
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow className="border-b border-gray-200">
                        {isDeleteMode && (
                          <TableHead className="w-[50px] pl-6 py-3">
                            <input
                              type="checkbox"
                              checked={exams && selectedExamIds.size === exams.length && exams.length > 0}
                              onChange={handleSelectAllExams}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                            />
                          </TableHead>
                        )}
                        <TableHead className="pl-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-[25%]">
                          Exam Details
                        </TableHead>
                        <TableHead className="text-center py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Year
                        </TableHead>
                        <TableHead className="text-center py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Tutors
                        </TableHead>
                        <TableHead className="text-center py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Status
                        </TableHead>
                        <TableHead className="text-center py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Completion
                        </TableHead>
                        {!isDeleteMode && (
                          <TableHead className="text-right pr-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                            Actions
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exams.map((exam) => {
                        const stats = examStats[exam.id] || { total: 0, completed: 0, pending: 0, ongoing: 0 }
                        const total = stats.total
                        const progress = total > 0 ? Math.round((stats.completed / total) * 100) : 0
                        const status = total === 0 ? 'Pending' : (progress === 100 ? 'Completed' : (progress > 0 ? 'Ongoing' : 'Pending'))
                        const statusColor = status === 'Completed' ? 'bg-green-100 text-green-700' : (status === 'Ongoing' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700')
                        
                        return (
                          <TableRow 
                            key={exam.id} 
                            onClick={() => !isDeleteMode && handleExamClick(exam)}
                            className={`transition-colors group border-b border-gray-100 last:border-0 ${!isDeleteMode ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                          >
                            {isDeleteMode && (
                              <TableCell className="pl-6 py-4">
                                <input
                                  type="checkbox"
                                  checked={selectedExamIds.has(exam.id)}
                                  onChange={() => handleSelectExam(exam.id)}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                />
                              </TableCell>
                            )}
                            <TableCell className="pl-6 py-4">
                              <p className="text-sm font-semibold text-gray-900">{exam.name}</p>
                            </TableCell>
                            <TableCell className="text-center py-4">
                              <span className="inline-flex items-center px-2 py-0.5 uppercase rounded text-xs font-medium bg-gray-100 text-black">
                                {formatYears(exam.years)}
                              </span>
                            </TableCell>
                            <TableCell className="text-center py-4">
                              <span className="text-sm font-semibold text-gray-900">
                                {stats.total}
                              </span>
                            </TableCell>
                            <TableCell className="text-center py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded bg-gray-100 uppercase text-xs font-medium ${statusColor}`}>
                                {status}
                              </span>
                            </TableCell>
                            <TableCell className="text-center py-4">
                              <div className="w-full max-w-[100px] mx-auto">
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="font-medium text-gray-700">{progress}%</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-1.5">
                                  <div 
                                    className={`h-1.5 rounded-full ${
                                      progress === 100 ? 'bg-green-500' : 
                                      progress > 50 ? 'bg-blue-500' : 
                                      progress > 0 ? 'bg-orange-500' : 'bg-gray-300'
                                    }`}
                                    style={{ width: `${progress}%` }}
                                  ></div>
                                </div>
                              </div>
                            </TableCell>
                            {!isDeleteMode && (
                              <TableCell className="text-right pr-6 py-4">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleExamClick(exam);
                                  }}
                                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                                      >
                                  view
                                </button>
                              </TableCell>
                            )}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                  ) : (
                    <div className="flex items-center justify-center min-h-[400px] py-12">
                      <div className="text-center">
                        <div className="mx-auto mb-4">
                          <FileText className="h-12 w-12 text-black mx-auto" />
                        </div>
                        <h3 className="text-lg font-medium uppercase text-gray-900 mb-2">
                          No exams created yet
                        </h3>
                        <p className="text-sm text-gray-500">
                          Click the button below to create your first exam
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* Create Exam Modal */}
      <CreateExamModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
        facultyId={department?.id || null}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Confirm Delete"
        itemsToDelete={examsToDelete.map(e => ({ name: e.name, email: e.id }))}
        isLoading={isDeleting}
        type="exams"
      />
    </div>
  )
}

