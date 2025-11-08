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
import { PeerTutorService } from '@/lib/services/peerTutorService'
import { ExamMarksService } from '@/lib/services/examMarksService'
import { ExamSubjectService } from '@/lib/services/examSubjectService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { Card, CardHeader, CardTitle, CardContent, LoadingOverlay } from '@/components/ui'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Button } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui'
import CreateExamModal from '@/components/forms/CreateExamModal'
import { FileText, Plus, Trash2, Eye, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { calculatePeerTutorAscendScore } from '@/lib/utils/ascendScore'

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
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

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

  const loading = isDepartmentLoading || isExamsLoading

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
          const peerTutors = await PeerTutorService.getPeerTutorsByYears(exam.years)
          const examSubjects = await ExamSubjectService.getExamSubjects(exam.id)
          const totalSubjects = examSubjects.length

          let completed = 0
          let pending = 0
          let ongoing = 0

          for (const tutor of peerTutors) {
            try {
              const marks = await ExamMarksService.getExamMarksByPeerTutorAndExam(tutor.id, exam.id)
              const students = await AssignmentService.getStudentsByPeerTutor(tutor.id)

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
              console.error(`Error calculating stats for tutor ${tutor.id}:`, error)
              pending++
            }
          }

          stats[exam.id] = {
            total: peerTutors.length,
            completed,
            pending,
            ongoing,
          }
        } catch (error) {
          console.error(`Error calculating stats for exam ${exam.id}:`, error)
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

  const handleDeleteExam = async (examId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering the exam click
    if (!confirm('Are you sure you want to delete this exam?')) return

    try {
      const success = await ExamService.deleteExam(examId)
      if (success) {
        queryClient.invalidateQueries({ queryKey: ['faculty-exams'] })
        refetchExams()
      } else {
        alert('Failed to delete exam')
      }
    } catch (error) {
      console.error('Error deleting exam:', error)
      alert('An error occurred while deleting the exam')
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
          const subjectsText = examSubjects.map(s => s.subject_name).join(', ')
          
          // Get peer tutors for this exam's years
          const peerTutors = await PeerTutorService.getPeerTutorsByYears(exam.years)
          
          // Get all unique years and sections from peer tutors
          const uniqueYears = Array.from(new Set(peerTutors.map(pt => pt.year)))
          const uniqueSections = Array.from(new Set(peerTutors.map(pt => pt.section)))
          
          // Format years and sections
          const yearsText = uniqueYears.map(y => formatYear(y)).join(', ')
          const sectionsText = uniqueSections.length > 1 ? 'ALL' : uniqueSections[0] || 'ALL'
          
          // Prepare export data
          const exportData: any[][] = []
          
          // Add header rows following xlsx-rule.mdc format
          exportData.push(['Subjects Export Report'])
          exportData.push([`Department: ${(department as any)?.dept || department.name || ''}`])
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
          
          for (const peerTutor of peerTutors) {
            try {
              const marks = await ExamMarksService.getExamMarksByPeerTutorAndExam(peerTutor.id, exam.id)
              const students = await AssignmentService.getStudentsByPeerTutor(peerTutor.id)
              
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
              
              ascendScores[peerTutor.id] = calculatePeerTutorAscendScore(allStudentsMarks, exam.max_marks || 100)
              
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
                
                completionPercentages[peerTutor.id] = Math.round((enteredMarks / totalPossible) * 100)
              } else {
                completionPercentages[peerTutor.id] = 0
              }
            } catch (error) {
              console.error(`Error calculating scores for tutor ${peerTutor.id}:`, error)
              ascendScores[peerTutor.id] = 0
              completionPercentages[peerTutor.id] = 0
            }
          }
          
          // Sort peer tutors by year, then section, then name
          const sortedPeerTutors = [...peerTutors].sort((a, b) => {
            if (a.year !== b.year) return a.year.localeCompare(b.year)
            if (a.section !== b.section) return a.section.localeCompare(b.section)
            return a.name.localeCompare(b.name)
          })
          
          // For each peer tutor
          for (const peerTutor of sortedPeerTutors) {
            const completion = completionPercentages[peerTutor.id] || 0
            
            // If 0% completion, only show peer tutor name, ascend score, and completion percentage
            if (completion === 0) {
              exportData.push(['Peer Tutor Name:', peerTutor.name])
              exportData.push(['Ascend Score:', `${ascendScores[peerTutor.id]?.toFixed(1) || '0.0'}/10`])
              exportData.push(['Completion Status:', `${completion}%`])
              exportData.push([]) // Empty row
              continue
            }
            
            // Otherwise, show full details
            exportData.push(['Peer Tutor Name:', peerTutor.name])
            exportData.push(['Ascend Score:', `${ascendScores[peerTutor.id]?.toFixed(1) || '0.0'}/10`])
            exportData.push(['Completion Status:', `${completion}%`])
            exportData.push([]) // Empty row
            
            // Get students and marks for this peer tutor
            const students = await AssignmentService.getStudentsByPeerTutor(peerTutor.id)
            const marks = await ExamMarksService.getExamMarksByPeerTutorAndExam(peerTutor.id, exam.id)
            
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
              exportData.push(['Peer Tutor Allocated:', peerTutor.name])
              
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
          console.error(`Error exporting exam ${exam.id}:`, error)
          // Continue with next exam even if one fails
        }
      }
      
      // Generate filename
      const filename = `All_Exams_Export_${new Date().toISOString().split('T')[0]}.xlsx`
      
      // Write file
      XLSX.writeFile(workbook, filename)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
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
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
        {/* Top Header */}
        <PageHeader
          title="EXAM MANAGEMENT"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {loading ? (
            <LoadingOverlay className="h-96" size="xl">
              Loading exams...
            </LoadingOverlay>
          ) : (
            <div className={`max-w-full mx-auto py-8 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
              {/* Exams List */}
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">Exams</CardTitle>
                      <p className="text-sm text-gray-500 mt-1">
                        Manage and create exams for peer tutors
                      </p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Button
                        onClick={() => setIsCreateModalOpen(true)}
                        size="lg"
                      >
                        <Plus className="h-5 w-5 mr-2" />
                        Create Exam
                      </Button>
                      {exams && exams.length > 0 && (
                        <Button
                          variant="outline"
                          onClick={handleExportAllExams}
                          size="lg"
                          className="inline-flex items-center bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700"
                          disabled={isExporting}
                        >
                          <Download className="h-5 w-5 mr-2" />
                          {isExporting ? 'Exporting...' : 'Export'}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {exams && exams.length > 0 ? (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Exam Name</TableHead>
                            <TableHead className="text-center">Years</TableHead>
                            <TableHead className="text-center">Created</TableHead>
                            <TableHead className="text-center">Peer Tutors</TableHead>
                            <TableHead className="text-center">Completed</TableHead>
                            <TableHead className="text-center">Pending</TableHead>
                            <TableHead className="text-center">Ongoing</TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {exams.map((exam) => {
                            const stats = examStats[exam.id] || { total: 0, completed: 0, pending: 0, ongoing: 0 }
                            return (
                              <TableRow key={exam.id} className="hover:bg-gray-50">
                                <TableCell className="font-medium text-gray-900">
                                  <span>{exam.name}</span>
                                </TableCell>
                                <TableCell className="text-center text-gray-600">
                                  {formatYears(exam.years)}
                                </TableCell>
                                <TableCell className="text-center text-gray-600">
                                  {new Date(exam.created_at).toLocaleDateString()}
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="font-medium text-gray-900">
                                    {isLoadingStats ? '...' : stats.total}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="font-medium text-gray-900">
                                    {isLoadingStats ? '...' : stats.completed}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="font-medium text-gray-900">
                                    {isLoadingStats ? '...' : stats.pending}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="font-medium text-gray-900">
                                    {isLoadingStats ? '...' : stats.ongoing}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center space-x-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleExamClick(exam)}
                                      className="inline-flex items-center"
                                    >
                                      <Eye className="h-4 w-4 mr-1.5" />
                                      View
                                    </Button>
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={(e) => handleDeleteExam(exam.id, e)}
                                      className="inline-flex items-center"
                                    >
                                      <Trash2 className="h-4 w-4 mr-1.5" />
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>
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
                          <FileText className="h-12 w-12 text-gray-400 mx-auto" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          No exams created yet
                        </h3>
                        <p className="text-sm text-gray-500">
                          Click the button below to create your first exam
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

      {/* Create Exam Modal */}
      <CreateExamModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
        facultyId={department?.id || null}
      />
    </div>
  )
}

