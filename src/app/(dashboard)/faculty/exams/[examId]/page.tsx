'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, useParams } from 'next/navigation'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import { ExamService } from '@/lib/services/examService'
import { peertutorservice, peertutors } from '@/lib/services/peerTutorService'
import { ExamMarksService } from '@/lib/services/examMarksService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { ExamSubjectService } from '@/lib/services/examSubjectService'
import { calculatepeertutorsAscendScore } from '@/lib/utils/ascendScore'
import { Card, CardContent, LoadingOverlay, Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Button } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyTable } from '@/components/ui'
import { ArrowLeft, RotateCw, Download } from 'lucide-react'
import ExportButton from '@/components/ui/ExportButton'
import FilterDropdown from '@/components/ui/FilterDropdown'
import { useMemo, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { logger } from '@/lib/logger'

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
  const { data: peerTutor, isLoading: ispeerTutorLoading } = useQuery({
    queryKey: ['exam-peer-tutors', examId, exam?.years],
    queryFn: async () => {
      if (!exam?.years || exam.years.length === 0) return []
      return await peertutorservice.getpeerTutorByYears(exam.years)
    },
    enabled: !!exam && !!exam.years && exam.years.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Calculate Ascend scores and completion percentages for each peer tutor
  const [ascendScores, setAscendScores] = useState<Record<string, number>>({})
  
  useEffect(() => {
    if (!peerTutor || !exam || !examId) return
    
    const fetchScoresAndCompletion = async () => {
      const scores: Record<string, number> = {}
      const completions: Record<string, number> = {}
      
      // Get exam subjects once
      const examSubjects = await ExamSubjectService.getExamSubjects(examId)
      const totalSubjects = examSubjects.length
      
      for (const tutor of peerTutor) {
        try {
          const marks = await ExamMarksService.getExamMarksBypeertutorsAndExam(tutor.id, examId)
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
          
          scores[tutor.id] = calculatepeertutorsAscendScore(allStudentsMarks, exam.max_marks || 100)
          
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
          logger.error(`Error calculating scores for tutor ${tutor.id}:`, error)
          scores[tutor.id] = 0
          completions[tutor.id] = 0
        }
      }
      
      setAscendScores(scores)
      setCompletionPercentages(completions)
    }
    
    fetchScoresAndCompletion()
  }, [peerTutor, exam, examId])

  const loading = isDepartmentLoading || isExamLoading || ispeerTutorLoading

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
    if (!peerTutor) return []
    return Array.from(new Set(peerTutor.map(pt => pt.year))).sort()
  }, [peerTutor])

  const uniqueSections = useMemo(() => {
    if (!peerTutor) return []
    let filtered = peerTutor
    if (selectedYear !== 'all') {
      filtered = filtered.filter(pt => pt.year === selectedYear)
    }
    return Array.from(new Set(filtered.map(pt => pt.section))).sort()
  }, [peerTutor, selectedYear])

  // Filter peer tutors based on selected filters
  const filteredpeerTutor = useMemo(() => {
    if (!peerTutor) return []
    
    let filtered = [...peerTutor]
    
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
  }, [peerTutor, selectedYear, selectedSection, selectedStatus, completionPercentages])

  // Reset section filter when year changes
  useEffect(() => {
    if (selectedYear === 'all') {
      setSelectedSection('all')
    } else {
      // If current section is not available in filtered sections, reset it
      const availableSections = Array.from(new Set(
        peerTutor?.filter(pt => pt.year === selectedYear).map(pt => pt.section) || []
      )).sort()
      if (!availableSections.includes(selectedSection)) {
        setSelectedSection('all')
      }
    }
  }, [selectedYear, peerTutor, selectedSection])

  const formatYear = (year: string): string => {
    const yearMap: { [key: string]: string } = {
      '1': '1st Year',
      '2': '2nd Year',
      '3': '3rd Year',
      '4': '4th Year',
    }
    return yearMap[year] || year
  }

  const handleView = (peertutors: peertutors) => {
    router.push(`/faculty/exams/${examId}/peer-tutor/${peertutors.id}`)
  }

  const hasActiveFilters = selectedYear !== 'all' || selectedSection !== 'all' || selectedStatus !== 'all'

  // Excel export function - handles pending, ongoing, and completed statuses
  const handleExportToExcel = async (exportType?: 'student-details' | 'marks-details') => {
    if (!exam || !filteredpeerTutor || filteredpeerTutor.length === 0) return

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
        const exportData: (string | number)[][] = []
        
        // Add header rows following xlsx-rule.mdc format
        exportData.push(['Subjects Export Report'])
        exportData.push(['Department:', (department as { dept?: string; name?: string })?.dept || (department as { dept?: string; name?: string })?.name || ''])
        const yearsText = Array.from(new Set(filteredpeerTutor.map(pt => formatYear(pt.year)))).join(', ')
        exportData.push(['Year:', yearsText])
        const sectionsText = Array.from(new Set(filteredpeerTutor.map(pt => pt.section))).length > 1 
          ? 'ALL' 
          : filteredpeerTutor[0]?.section || 'ALL'
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
        filteredpeerTutor.forEach(peertutors => {
          exportData.push([peertutors.name, 'Pending'])
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
        const exportData: (string | number)[][] = []
        
        // Add header rows following xlsx-rule.mdc format
        exportData.push(['Subjects Export Report'])
        exportData.push(['Department:', (department as { dept?: string; name?: string })?.dept || (department as { dept?: string; name?: string })?.name || ''])
        const yearsText = Array.from(new Set(filteredpeerTutor.map(pt => formatYear(pt.year)))).join(', ')
        exportData.push(['Year:', yearsText])
        const sectionsText = Array.from(new Set(filteredpeerTutor.map(pt => pt.section))).length > 1 
          ? 'ALL' 
          : filteredpeerTutor[0]?.section || 'ALL'
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
        filteredpeerTutor.forEach(peertutors => {
          exportData.push([peertutors.name, 'Ongoing'])
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
      const tutorsByYear: Record<string, typeof filteredpeerTutor> = {}
      filteredpeerTutor.forEach(tutor => {
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
        
        const exportData: (string | number)[][] = []
        
        // Add header rows following xlsx-rule.mdc format
        exportData.push(['Subjects Export Report'])
        exportData.push(['Department:', (department as { dept?: string; name?: string })?.dept || (department as { dept?: string; name?: string })?.name || ''])
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
          for (const peertutors of sectionTutors) {
            const completion = completionPercentages[peertutors.id] || 0
            const ascendScore = ascendScores[peertutors.id] || 0
            
            // Add peer tutor info before marks
            exportData.push(['Peer Tutor Name:', peertutors.name])
            exportData.push(['Ascend Score:', `${ascendScore.toFixed(1)}/10`])
            exportData.push(['Completion Rate:', `${completion}%`])
            exportData.push([]) // Empty row
            
            // Create header row: Student Name, then all subjects
            const headerRow = ['Student Name', ...examSubjects.map(s => s.subject_name)]
            exportData.push(headerRow)
            
            // Get students and marks for this peer tutor
            const students = await AssignmentService.getStudentsBypeertutors(peertutors.id)
            const marks = await ExamMarksService.getExamMarksBypeertutorsAndExam(peertutors.id, examId)
            
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
      logger.error('Error exporting to Excel:', error)
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
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden w-full lg:w-auto`}>
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
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden w-full lg:w-auto`}>
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
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden w-full lg:w-auto`}>
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

            {/* Exam Info Card - Clean White Design */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8 relative group overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em]">Exam Information</p>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 tracking-tight mb-4">{exam.name}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Created On</p>
                        <p className="text-sm font-bold text-gray-700">{new Date(exam.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Academic Years</p>
                        <p className="text-sm font-bold text-gray-700">{exam.years.map(y => formatYear(y)).join(', ')}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="hidden sm:block">
                  <div className="p-4 bg-blue-50/50 rounded-2xl border border-gray-100 flex flex-col items-center justify-center min-w-[120px]">
                    <p className="text-[9px] font-bold text-black-400 uppercase tracking-widest mb-1">Max Marks</p>
                    <p className="text-2xl font-black text-black">{exam.max_marks || 100}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Peer Tutors Table Card */}
            {/* Peer Tutors Table View - Clean White Design */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                    Peer Tutors ({filteredpeerTutor.length})
                  </h3>
                  
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-40">
                      <FilterDropdown
                        value={selectedYear}
                        onChange={setSelectedYear}
                        options={[
                          { label: 'All Years', value: 'all' },
                          ...uniqueYears.map(year => ({ label: formatYear(year), value: year }))
                        ]}
                      />
                    </div>

                    <div className="w-40">
                      <FilterDropdown
                        value={selectedSection}
                        onChange={setSelectedSection}
                        options={[
                          { label: 'Sections', value: 'all' },
                          ...uniqueSections.map(section => ({ label: section, value: section }))
                        ]}
                        disabled={selectedYear === 'all'}
                      />
                    </div>

                    <div className="w-40">
                    <FilterDropdown
                      value={selectedStatus}
                      onChange={setSelectedStatus}
                      options={[
                        { label: 'All Status', value: 'all' },
                        { label: '0%', value: 'pending' },
                        { label: '1-99%', value: 'ongoing' },
                        { label: '100%', value: 'completed' },
                      ]}
                    />
                    </div>

                    <div className="h-8 w-[1px] bg-gray-200 mx-1"></div>

                    <ExportButton 
                      onClick={() => handleExportToExcel()}
                      disabled={!filteredpeerTutor || filteredpeerTutor.length === 0}
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white">
                      <TableHead className="pl-6 py-4">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Peer Tutor Name</span>
                      </TableHead>
                      <TableHead className="text-center py-4">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Year & Section</span>
                      </TableHead>
                      <TableHead className="text-center py-4">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ascend Score</span>
                      </TableHead>
                      <TableHead className="text-center py-4">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Completion</span>
                      </TableHead>
                      <TableHead className="text-right pr-6 py-4">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                    <TableBody>
                      {filteredpeerTutor.length === 0 ? (
                        <EmptyTable
                          title="No peer tutors found"
                          description={
                            hasActiveFilters
                              ? "Try adjusting your filters to see more results"
                              : "No peer tutors are assigned to the selected years for this exam"
                          }
                        />
                      ) : (
                        filteredpeerTutor.map((peertutors) => {
                          const completion = completionPercentages[peertutors.id] || 0
                          const score = ascendScores[peertutors.id] || 0
                          return (
                            <TableRow key={peertutors.id} className="hover:bg-gray-50/50 transition-colors group border-b border-gray-100">
                              <TableCell className="pl-6 py-4">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-full bg-black border border-gray-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                                    <span className="text-xs font-bold text-white uppercase">
                                      {peertutors.name.substring(0, 2)}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-gray-900 mb-0.5">{peertutors.name}</p>
                                    <p className="text-[10px] text-gray-400 font-medium">{peertutors.email}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-center py-4">
                                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                                  {formatYear(peertutors.year)} - {peertutors.section}
                                </span>
                              </TableCell>
                              <TableCell className="text-center py-4">
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-100">
                                  <span className={`text-sm font-bold ${
                                    score >= 8 ? 'text-green-600' :
                                    score >= 6 ? 'text-yellow-600' :
                                    score > 0 ? 'text-orange-600' :
                                    'text-gray-400'
                                  }`}>
                                    {score.toFixed(1)}
                                  </span>
                                  <span className="text-[10px] text-gray-400 font-bold">/ 10</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center py-4">
                                <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50/50 border border-blue-100">
                                  <span className={`text-xs font-bold ${
                                    completion === 100 ? 'text-green-600' :
                                    completion > 0 ? 'text-blue-600' :
                                    'text-gray-400'
                                  }`}>
                                    {completion}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right pr-6 py-4">
                                <button
                                  onClick={() => handleView(peertutors)}
                                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                                >
                                  VIEW
                                </button>
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
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

