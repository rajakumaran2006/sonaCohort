'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, useParams } from 'next/navigation'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import { ExamService, Exam } from '@/lib/services/examService'
import { PeerTutorService, PeerTutor } from '@/lib/services/peerTutorService'
import { ExamMarksService } from '@/lib/services/examMarksService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { ExamSubjectService } from '@/lib/services/examSubjectService'
import { calculatePeerTutorAscendScore } from '@/lib/utils/ascendScore'
import { Card, CardHeader, CardTitle, CardContent, LoadingOverlay, Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Button } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyTable } from '@/components/ui'
import { Eye, ArrowLeft, RotateCw, Download } from 'lucide-react'
import { useMemo, useEffect } from 'react'
import * as XLSX from 'xlsx'

export default function ExamDetailsPage() {
  return (
    <FacultyProtectedRoute>
      <ExamDetailsContent />
    </FacultyProtectedRoute>
  )
}

function ExamDetailsContent() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const queryClient = useQueryClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedYear, setSelectedYear] = useState<string>('all')
  const [selectedSection, setSelectedSection] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [completionPercentages, setCompletionPercentages] = useState<Record<string, number>>({})
  const [showExportModal, setShowExportModal] = useState(false)

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

  // Fetch peer tutors for the exam's years
  const { data: peerTutors, isLoading: isPeerTutorsLoading } = useQuery({
    queryKey: ['exam-peer-tutors', examId, exam?.years],
    queryFn: async () => {
      if (!exam?.years || exam.years.length === 0) return []
      return await PeerTutorService.getPeerTutorsByYears(exam.years)
    },
    enabled: !!exam && !!exam.years && exam.years.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Calculate Ascend scores and completion percentages for each peer tutor
  const [ascendScores, setAscendScores] = useState<Record<string, number>>({})
  
  useEffect(() => {
    if (!peerTutors || !exam || !examId) return
    
    const fetchScoresAndCompletion = async () => {
      const scores: Record<string, number> = {}
      const completions: Record<string, number> = {}
      
      // Get exam subjects once
      const examSubjects = await ExamSubjectService.getExamSubjects(examId)
      const totalSubjects = examSubjects.length
      
      for (const tutor of peerTutors) {
        try {
          const marks = await ExamMarksService.getExamMarksByPeerTutorAndExam(tutor.id, examId)
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
          
          scores[tutor.id] = calculatePeerTutorAscendScore(allStudentsMarks, exam.max_marks || 100)
          
          // Calculate completion percentage
          // Count how many marks have been entered (marks field is not empty)
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
            
            completions[tutor.id] = Math.round((enteredMarks / totalPossible) * 100)
          } else {
            completions[tutor.id] = 0
          }
        } catch (error) {
          console.error(`Error calculating scores for tutor ${tutor.id}:`, error)
          scores[tutor.id] = 0
          completions[tutor.id] = 0
        }
      }
      
      setAscendScores(scores)
      setCompletionPercentages(completions)
    }
    
    fetchScoresAndCompletion()
  }, [peerTutors, exam, examId])

  const loading = isDepartmentLoading || isExamLoading || isPeerTutorsLoading

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['faculty-department', user?.email] }),
        queryClient.invalidateQueries({ queryKey: ['exam-details', examId] }),
        queryClient.invalidateQueries({ queryKey: ['exam-peer-tutors', examId] }),
      ])
      setLastRefresh(new Date())
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  // Get unique years and sections from peer tutors
  const uniqueYears = useMemo(() => {
    if (!peerTutors) return []
    return Array.from(new Set(peerTutors.map(pt => pt.year))).sort()
  }, [peerTutors])

  const uniqueSections = useMemo(() => {
    if (!peerTutors) return []
    let filtered = peerTutors
    if (selectedYear !== 'all') {
      filtered = filtered.filter(pt => pt.year === selectedYear)
    }
    return Array.from(new Set(filtered.map(pt => pt.section))).sort()
  }, [peerTutors, selectedYear])

  // Filter peer tutors based on selected filters
  const filteredPeerTutors = useMemo(() => {
    if (!peerTutors) return []
    
    let filtered = [...peerTutors]
    
    if (selectedYear !== 'all') {
      filtered = filtered.filter(pt => pt.year === selectedYear)
    }
    
    if (selectedSection !== 'all') {
      filtered = filtered.filter(pt => pt.section === selectedSection)
    }
    
    // Filter by status (completion percentage)
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(pt => {
        const completion = completionPercentages[pt.id] || 0
        if (selectedStatus === 'pending') return completion === 0
        if (selectedStatus === 'ongoing') return completion > 0 && completion < 100
        if (selectedStatus === 'completed') return completion === 100
        return true
      })
    }
    
    return filtered.sort((a, b) => {
      // Sort by year, then section, then name
      if (a.year !== b.year) return a.year.localeCompare(b.year)
      if (a.section !== b.section) return a.section.localeCompare(b.section)
      return a.name.localeCompare(b.name)
    })
  }, [peerTutors, selectedYear, selectedSection, selectedStatus, completionPercentages])

  // Reset section filter when year changes
  useEffect(() => {
    if (selectedYear === 'all') {
      setSelectedSection('all')
    } else {
      // If current section is not available in filtered sections, reset it
      const availableSections = Array.from(new Set(
        peerTutors?.filter(pt => pt.year === selectedYear).map(pt => pt.section) || []
      )).sort()
      if (!availableSections.includes(selectedSection)) {
        setSelectedSection('all')
      }
    }
  }, [selectedYear, peerTutors, selectedSection])

  const formatYear = (year: string): string => {
    const yearMap: { [key: string]: string } = {
      '2': '2nd Year',
      '3': '3rd Year',
      '4': '4th Year',
    }
    return yearMap[year] || year
  }

  const handleView = (peerTutor: PeerTutor) => {
    router.push(`/faculty/exams/${examId}/peer-tutor/${peerTutor.id}`)
  }

  const hasActiveFilters = selectedYear !== 'all' || selectedSection !== 'all' || selectedStatus !== 'all'

  const clearFilters = () => {
    setSelectedYear('all')
    setSelectedSection('all')
    setSelectedStatus('all')
  }

  // Excel export function - handles pending, ongoing, and completed statuses
  const handleExportToExcel = async (exportType?: 'student-details' | 'marks-details') => {
    if (!exam || !filteredPeerTutors || filteredPeerTutors.length === 0) return

    // If ongoing status and no export type selected, show modal
    if (selectedStatus === 'ongoing' && !exportType) {
      setShowExportModal(true)
      return
    }

    // Close modal if open
    setShowExportModal(false)

    try {
      // Handle PENDING status export - simple table with Peer Tutor and Status
      if (selectedStatus === 'pending') {
        const exportData: any[][] = []
        
        // Add header rows following xlsx-rule.mdc format
        exportData.push(['Subjects Export Report'])
        exportData.push(['Department:', (department as any)?.dept || department?.name || ''])
        const yearsText = Array.from(new Set(filteredPeerTutors.map(pt => formatYear(pt.year)))).join(', ')
        exportData.push(['Year:', yearsText])
        const sectionsText = Array.from(new Set(filteredPeerTutors.map(pt => pt.section))).length > 1 
          ? 'ALL' 
          : filteredPeerTutors[0]?.section || 'ALL'
        exportData.push(['Section:', sectionsText])
        exportData.push(['Generated on:', new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })])
        exportData.push([]) // Empty row
        
        // Add table header
        exportData.push(['Peer Tutor', 'Status'])
        
        // Add data rows
        filteredPeerTutors.forEach(peerTutor => {
          exportData.push([peerTutor.name, 'Pending'])
        })
        
        // Create workbook and worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(exportData)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Pending Report')
        
        // Generate filename
        const filename = `Exam_${exam.name.replace(/[^a-zA-Z0-9]/g, '_')}_Pending_${new Date().toISOString().split('T')[0]}.xlsx`
        XLSX.writeFile(workbook, filename)
        return
      }
      
      // Handle ONGOING status - Student Details export
      if (selectedStatus === 'ongoing' && exportType === 'student-details') {
        const exportData: any[][] = []
        
        // Add header rows following xlsx-rule.mdc format
        exportData.push(['Subjects Export Report'])
        exportData.push(['Department:', (department as any)?.dept || department?.name || ''])
        const yearsText = Array.from(new Set(filteredPeerTutors.map(pt => formatYear(pt.year)))).join(', ')
        exportData.push(['Year:', yearsText])
        const sectionsText = Array.from(new Set(filteredPeerTutors.map(pt => pt.section))).length > 1 
          ? 'ALL' 
          : filteredPeerTutors[0]?.section || 'ALL'
        exportData.push(['Section:', sectionsText])
        exportData.push(['Generated on:', new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })])
        exportData.push([]) // Empty row
        
        // Add table header
        exportData.push(['Peer Tutor', 'Status'])
        
        // Add data rows
        filteredPeerTutors.forEach(peerTutor => {
          const completion = completionPercentages[peerTutor.id] || 0
          exportData.push([peerTutor.name, 'Ongoing'])
        })
        
        // Create workbook and worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(exportData)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Ongoing Report')
        
        // Generate filename
        const filename = `Exam_${exam.name.replace(/[^a-zA-Z0-9]/g, '_')}_Ongoing_StudentDetails_${new Date().toISOString().split('T')[0]}.xlsx`
        XLSX.writeFile(workbook, filename)
        return
      }
      
      // Handle ONGOING status - Marks Details export (full marks table)
      // OR handle other statuses (completed, all) - full marks table
      // Get exam subjects
      const examSubjects = await ExamSubjectService.getExamSubjects(examId)
      
      // Group peer tutors by year
      const tutorsByYear: Record<string, typeof filteredPeerTutors> = {}
      filteredPeerTutors.forEach(tutor => {
        if (!tutorsByYear[tutor.year]) {
          tutorsByYear[tutor.year] = []
        }
        tutorsByYear[tutor.year].push(tutor)
      })
      
      // Sort years
      const sortedYears = Object.keys(tutorsByYear).sort()
      
      const workbook = XLSX.utils.book_new()
      let sheetNumber = 1
      
      // Create one sheet per year
      for (const year of sortedYears) {
        const yearTutors = tutorsByYear[year]
        
        // Group by section within year
        const tutorsBySection: Record<string, typeof yearTutors> = {}
        yearTutors.forEach(tutor => {
          if (!tutorsBySection[tutor.section]) {
            tutorsBySection[tutor.section] = []
          }
          tutorsBySection[tutor.section].push(tutor)
        })
        
        // Sort sections
        const sortedSections = Object.keys(tutorsBySection).sort()
        
        const exportData: any[][] = []
        
        // Add header rows following xlsx-rule.mdc format
        exportData.push(['Subjects Export Report'])
        exportData.push(['Department:', (department as any)?.dept || department?.name || ''])
        exportData.push(['Year:', formatYear(year)])
        exportData.push(['Section:', sortedSections.length > 1 ? 'ALL' : sortedSections[0] || 'ALL'])
        exportData.push(['Generated on:', new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })])
        exportData.push([]) // Empty row
        
        // Process each section in order
        for (const section of sortedSections) {
          const sectionTutors = tutorsBySection[section]
          
          // Add section header if multiple sections
          if (sortedSections.length > 1) {
            exportData.push([`Section ${section}`])
            exportData.push([]) // Empty row
          }
          
          // Process each peer tutor in this section
          for (const peerTutor of sectionTutors) {
            const completion = completionPercentages[peerTutor.id] || 0
            const ascendScore = ascendScores[peerTutor.id] || 0
            
            // Add peer tutor info before marks
            exportData.push(['Peer Tutor Name:', peerTutor.name])
            exportData.push(['Ascend Score:', `${ascendScore.toFixed(1)}/10`])
            exportData.push(['Completion Rate:', `${completion}%`])
            exportData.push([]) // Empty row
            
            // Create header row: Student Name, then all subjects
            const headerRow = ['Student Name', ...examSubjects.map(s => s.subject_name)]
            exportData.push(headerRow)
            
            // Get students and marks for this peer tutor
            const students = await AssignmentService.getStudentsByPeerTutor(peerTutor.id)
            const marks = await ExamMarksService.getExamMarksByPeerTutorAndExam(peerTutor.id, examId)
            
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
            
            // Add data rows: one row per student (skip students with no marks/pending)
            students.forEach(student => {
              // Check if student has any marks
              const hasMarks = examSubjects.some(subject => {
                return marksByStudentSubject[student.id]?.[subject.id] && marksByStudentSubject[student.id][subject.id] !== ''
              })
              
              // Only include students who have at least one mark
              if (hasMarks) {
                const row = [student.name]
                examSubjects.forEach(subject => {
                  const markValue = marksByStudentSubject[student.id]?.[subject.id] || ''
                  row.push(markValue)
                })
                exportData.push(row)
              }
            })
            
            exportData.push([]) // Empty row after each peer tutor
          }
        }
        
        // Create worksheet for this year
        const worksheet = XLSX.utils.aoa_to_sheet(exportData)
        const sheetName = sortedYears.length > 1 
          ? `Year ${formatYear(year)}` 
          : `Sheet ${sheetNumber}`
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31))
        sheetNumber++
      }
      
      // Generate filename
      const filename = `Exam_${exam.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
      
      // Write file
      XLSX.writeFile(workbook, filename)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      alert('Error exporting to Excel. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <FacultySidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
          <PageHeader
            title="EXAM DETAILS"
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

  if (!exam) {
    return (
      <div className="min-h-screen bg-gray-50">
        <FacultySidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
          <PageHeader
            title="EXAM DETAILS"
            lastRefresh={lastRefresh}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            isSidebarCollapsed={isSidebarCollapsed}
          />
          <main className="flex-1 overflow-y-auto">
            <div className={`max-w-full mx-auto py-8 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <p className="text-gray-500">Exam not found</p>
                    <Button
                      variant="secondary"
                      onClick={() => router.push('/faculty/exams')}
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
              
              <h1 className="text-xl font-semibold text-gray-900">EXAM DETAILS</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                title="Refresh"
              >
                <RotateCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <Button
                variant="secondary"
                onClick={() => router.push('/faculty/exams')}
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
              <span className="text-gray-900 font-medium">{exam.name}</span>
            </nav>

            {/* Exam Info Card */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-xl">{exam.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Years</p>
                    <p className="text-base text-gray-900 mt-1">
                      {exam.years.map(y => formatYear(y)).join(', ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Created</p>
                    <p className="text-base text-gray-900 mt-1">
                      {new Date(exam.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Peer Tutors Table Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">
                      PEER TUTORS
                      {filteredPeerTutors.length > 0 && (
                        <span className="ml-2 text-base font-normal text-gray-500">
                          ({filteredPeerTutors.length} of {peerTutors?.length || 0})
                        </span>
                      )}
                    </CardTitle>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => handleExportToExcel()}
                    className="inline-flex items-center bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700"
                    disabled={!filteredPeerTutors || filteredPeerTutors.length === 0}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="mb-6 space-y-4">
                  <div className="flex items-end space-x-4">
                    <div className="flex-1 flex items-center space-x-4">
                      {/* Year Filter */}
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Year
                        </label>
                        <select
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="all">All Years</option>
                          {uniqueYears.map(year => (
                            <option key={year} value={year}>
                              {formatYear(year)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Section Filter */}
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Section
                        </label>
                        <select
                          value={selectedSection}
                          onChange={(e) => setSelectedSection(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          disabled={selectedYear === 'all'}
                        >
                          <option value="all">All Sections</option>
                          {uniqueSections.map(section => (
                            <option key={section} value={section}>
                              {section}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Status Filter */}
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Status
                        </label>
                        <select
                          value={selectedStatus}
                          onChange={(e) => setSelectedStatus(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="all">All Status</option>
                          <option value="pending">Pending (0%)</option>
                          <option value="ongoing">Ongoing (1-99%)</option>
                          <option value="completed">Completed (100%)</option>
                        </select>
                      </div>
                    </div>

                    <div className="ml-4">
                      <Button
                        variant="outline"
                        onClick={clearFilters}
                        disabled={!hasActiveFilters}
                        className="inline-flex items-center"
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Year & Section</TableHead>
                        <TableHead>Ascend Score</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPeerTutors.length === 0 ? (
                        <EmptyTable
                          title="No peer tutors found"
                          description={
                            hasActiveFilters
                              ? "Try adjusting your filters to see more results"
                              : "No peer tutors are assigned to the selected years for this exam"
                          }
                        />
                      ) : (
                        filteredPeerTutors.map((peerTutor) => {
                          const completion = completionPercentages[peerTutor.id] || 0
                          return (
                            <TableRow key={peerTutor.id}>
                              <TableCell className="font-medium text-gray-900">
                                {peerTutor.name}
                              </TableCell>
                              <TableCell className="text-gray-600">
                                {peerTutor.year} - {peerTutor.section}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <span className={`font-medium ${
                                    ascendScores[peerTutor.id] >= 8 ? 'text-green-600' :
                                    ascendScores[peerTutor.id] >= 6 ? 'text-yellow-600' :
                                    ascendScores[peerTutor.id] > 0 ? 'text-orange-600' :
                                    'text-gray-400'
                                  }`}>
                                    {ascendScores[peerTutor.id]?.toFixed(1) || '0.0'}
                                  </span>
                                  <span className="text-xs text-gray-500">/ 10</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <span className={`font-medium ${
                                    completion === 100 ? 'text-green-600' :
                                    completion > 0 ? 'text-yellow-600' :
                                    'text-gray-400'
                                  }`}>
                                    {completion}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleView(peerTutor)}
                                  className="inline-flex items-center"
                                >
                                  <Eye className="h-4 w-4 mr-1.5" />
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Export Modal for Ongoing Status */}
      <Modal isOpen={showExportModal} onClose={() => setShowExportModal(false)} size="md">
        <ModalHeader onClose={() => setShowExportModal(false)}>
          <ModalTitle>Select Export Type</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Choose what you want to export for ongoing peer tutors:
            </p>
            <div className="space-y-3">
              <Button
                variant="primary"
                onClick={() => handleExportToExcel('student-details')}
                className="w-full justify-start"
              >
                <Download className="h-4 w-4 mr-2" />
                Student Details
                <span className="ml-2 text-xs text-gray-500">(Peer Tutor & Status)</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExportToExcel('marks-details')}
                className="w-full justify-start"
              >
                <Download className="h-4 w-4 mr-2" />
                Marks Details
                <span className="ml-2 text-xs text-gray-500">(Full marks table)</span>
              </Button>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowExportModal(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}

