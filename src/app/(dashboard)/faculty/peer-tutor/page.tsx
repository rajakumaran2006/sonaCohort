'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import { PeerTutorService, PeerTutor } from '@/lib/services/peerTutorService'
import { StudentService, Student, StudentWithPeerTutor } from '@/lib/services/studentService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { RenumerationService, RenumerationTemplate } from '@/lib/services/renumerationService'
import { FeedbackService, FeedbackForm, FeedbackResponseWithDetails } from '@/lib/services/feedbackService'
import { ReportService, PeerTutorReportData } from '@/lib/services/reportService'
import RenumerationModal from '@/components/forms/RenumerationModal'
import RenumerationDetailsModal from '@/components/forms/RenumerationDetailsModal'
import FeedbackFormModal from '@/components/forms/FeedbackFormModal'
import FeedbackResponsesModal from '@/components/forms/FeedbackResponsesModal'
import ExcelExportModal from '@/components/forms/ExcelExportModal'

export default function FacultyPeerTutorPage() {
  return (
    <FacultyProtectedRoute>
      <FacultyPeerTutorContent />
    </FacultyProtectedRoute>
  )
}

interface PeerTutorWithStats extends PeerTutor {
  classStats: {
    totalClasses: number
    completedClasses: number
    pendingClasses: number
  }
}

function FacultyPeerTutorContent() {
  const router = useRouter()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [peerTutors, setPeerTutors] = useState<PeerTutor[]>([])
  const [filteredPeerTutors, setFilteredPeerTutors] = useState<PeerTutor[]>([])
  const [peerTutorsWithStats, setPeerTutorsWithStats] = useState<PeerTutorWithStats[]>([])
  const [students, setStudents] = useState<StudentWithPeerTutor[]>([])
  const [filteredStudents, setFilteredStudents] = useState<StudentWithPeerTutor[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [assignedCount, setAssignedCount] = useState(0)
  const [unassignedCount, setUnassignedCount] = useState(0)
  const [assignedStudentCount, setAssignedStudentCount] = useState(0)
  const [unassignedStudentCount, setUnassignedStudentCount] = useState(0)
  const [peerTutorStudentCounts, setPeerTutorStudentCounts] = useState<{[key: string]: number}>({})
  
  // Filter states
  const [selectedYear, setSelectedYear] = useState<string>('all')
  const [selectedSection, setSelectedSection] = useState<string>('all')
  const [selectedStudentYear, setSelectedStudentYear] = useState<string>('all')
  const [selectedStudentSection, setSelectedStudentSection] = useState<string>('all')
  const [selectedPeerTutor, setSelectedPeerTutor] = useState<string>('all')
  const [showFilterPopup, setShowFilterPopup] = useState(false)
  const [showStudentFilterPopup, setShowStudentFilterPopup] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const studentFilterRef = useRef<HTMLDivElement>(null)

  // Renumeration states
  const [showRenumerationModal, setShowRenumerationModal] = useState(false)
  const [renumerationSubmissions, setRenumerationSubmissions] = useState<any[]>([])
  const [renumerationLoading, setRenumerationLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'tutors' | 'students' | 'feedback' | 'renumeration' | 'reports'>('tutors')
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null)
  
  // Template management states
  const [renumerationTemplates, setRenumerationTemplates] = useState<RenumerationTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<RenumerationTemplate | null>(null)
  const [templateSubmissions, setTemplateSubmissions] = useState<any[]>([])
  const [renumerationView, setRenumerationView] = useState<'templates' | 'submissions'>('templates')
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [submissionsWithClasses, setSubmissionsWithClasses] = useState<any[]>([])

  // Feedback states
  const [feedbackForms, setFeedbackForms] = useState<FeedbackForm[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [selectedFeedbackForm, setSelectedFeedbackForm] = useState<FeedbackForm | null>(null)
  const [feedbackResponses, setFeedbackResponses] = useState<FeedbackResponseWithDetails[]>([])
  const [showFeedbackResponsesModal, setShowFeedbackResponsesModal] = useState(false)

  // Delete confirmation modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [peerTutorToDelete, setPeerTutorToDelete] = useState<{id: string, name: string} | null>(null)

  // Reports states
  const [peerTutorReports, setPeerTutorReports] = useState<PeerTutorReportData[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [selectedPeerTutorForReport, setSelectedPeerTutorForReport] = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportHeaders, setExportHeaders] = useState<number>(1)

  // Load peer tutors and students data
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load peer tutors
        const tutors = await PeerTutorService.getAllPeerTutors()
        setPeerTutors(tutors)
        setFilteredPeerTutors(tutors)
        
        // Calculate assigned/unassigned counts for peer tutors
        const assignedTutors = tutors.filter(tutor => {
          // Check if this peer tutor has any assigned students
          // This would need to be implemented in the service
          return true // For now, assuming all are assigned
        })
        setAssignedCount(assignedTutors.length)
        setUnassignedCount(tutors.length - assignedTutors.length)

        // Load students with peer tutor information
        const allStudents = await StudentService.getAllStudentsWithPeerTutors()
        setStudents(allStudents)
        setFilteredStudents(allStudents)
        
        // Calculate assigned/unassigned counts for students
        const assignedStudents = allStudents.filter(student => student.assigned_peer_tutor)
        setAssignedStudentCount(assignedStudents.length)
        setUnassignedStudentCount(allStudents.length - assignedStudents.length)

        // Calculate student counts for each peer tutor
        const studentCounts: {[key: string]: number} = {}
        tutors.forEach(tutor => {
          const count = allStudents.filter(student => student.assigned_peer_tutor_id === tutor.id).length
          studentCounts[tutor.id] = count
        })
        setPeerTutorStudentCounts(studentCounts)
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // Apply peer tutor filters
  useEffect(() => {
    let filtered = peerTutors

    if (selectedYear !== 'all') {
      filtered = filtered.filter(tutor => tutor.year === selectedYear)
    }

    if (selectedSection !== 'all') {
      filtered = filtered.filter(tutor => tutor.section === selectedSection)
    }

    // Sort by year (2, 3, 4) then by section (A, B, C)
    filtered.sort((a, b) => {
      const yearOrder = { '2nd Year': 1, '3rd Year': 2, '4th Year': 3 }
      const sectionOrder = { 'Section A': 1, 'Section B': 2, 'Section C': 3 }
      
      const yearDiff = (yearOrder[a.year as keyof typeof yearOrder] || 0) - (yearOrder[b.year as keyof typeof yearOrder] || 0)
      if (yearDiff !== 0) return yearDiff
      
      return (sectionOrder[a.section as keyof typeof sectionOrder] || 0) - (sectionOrder[b.section as keyof typeof sectionOrder] || 0)
    })

    setFilteredPeerTutors(filtered)
  }, [peerTutors, selectedYear, selectedSection])

  // Apply student filters
  useEffect(() => {
    let filtered = students

    if (selectedStudentYear !== 'all') {
      filtered = filtered.filter(student => student.year === selectedStudentYear)
    }

    if (selectedStudentSection !== 'all') {
      filtered = filtered.filter(student => student.section === selectedStudentSection)
    }

    if (selectedPeerTutor !== 'all') {
      filtered = filtered.filter(student => student.assigned_peer_tutor_id === selectedPeerTutor)
    }

    // Sort by year (2, 3, 4) then by section (A, B, C)
    filtered.sort((a, b) => {
      const yearOrder = { '2nd Year': 1, '3rd Year': 2, '4th Year': 3 }
      const sectionOrder = { 'Section A': 1, 'Section B': 2, 'Section C': 3 }
      
      const yearDiff = (yearOrder[a.year as keyof typeof yearOrder] || 0) - (yearOrder[b.year as keyof typeof yearOrder] || 0)
      if (yearDiff !== 0) return yearDiff
      
      return (sectionOrder[a.section as keyof typeof sectionOrder] || 0) - (sectionOrder[b.section as keyof typeof sectionOrder] || 0)
    })

    setFilteredStudents(filtered)
  }, [students, selectedStudentYear, selectedStudentSection, selectedPeerTutor])

  // Load peer tutor statistics when filtered peer tutors change
  useEffect(() => {
    const loadPeerTutorStats = async () => {
      if (filteredPeerTutors.length === 0) {
        setPeerTutorsWithStats([])
        return
      }

      setStatsLoading(true)
      try {
        const tutorsWithStats = await Promise.all(
          filteredPeerTutors.map(async (tutor) => {
            const classStats = await ScheduledClassService.getPeerTutorClassStats(tutor.id)
            return {
              ...tutor,
              classStats
            }
          })
        )
        setPeerTutorsWithStats(tutorsWithStats)
      } catch (error) {
        console.error('Error loading peer tutor stats:', error)
        // Fallback to original data without stats
        setPeerTutorsWithStats(filteredPeerTutors.map(tutor => ({
          ...tutor,
          classStats: { totalClasses: 0, completedClasses: 0, pendingClasses: 0 }
        })))
      } finally {
        setStatsLoading(false)
      }
    }

    loadPeerTutorStats()
  }, [filteredPeerTutors])

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilterPopup(false)
      }
      if (studentFilterRef.current && !studentFilterRef.current.contains(event.target as Node)) {
        setShowStudentFilterPopup(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Get unique years and sections for filters
  const availableYears = [...new Set(peerTutors.map(tutor => tutor.year))].sort()
  const availableSections = [...new Set(peerTutors.map(tutor => tutor.section))].sort()
  const availableStudentYears = [...new Set(students.map(student => student.year))].sort()
  const availableStudentSections = [...new Set(students.map(student => student.section))].sort()

  // Check if any filters are active
  const hasActiveFilters = selectedYear !== 'all' || selectedSection !== 'all'
  const hasActiveStudentFilters = selectedStudentYear !== 'all' || selectedStudentSection !== 'all' || selectedPeerTutor !== 'all'

  // Clear all filters
  const clearFilters = () => {
    setSelectedYear('all')
    setSelectedSection('all')
  }

  const clearStudentFilters = () => {
    setSelectedStudentYear('all')
    setSelectedStudentSection('all')
    setSelectedPeerTutor('all')
  }

  // Handle peer tutor view click
  const handleViewPeerTutor = (tutorId: string) => {
    router.push(`/faculty/peer-tutor/${tutorId}`)
  }

  // Export functions
  const exportPeerTutors = () => {
    const exportData = peerTutorsWithStats.map(tutor => ({
      'Name': tutor.name,
      'Email': tutor.email,
      'Year & Section': `${tutor.year} - ${tutor.section}`,
      'Total Classes Allocated': tutor.classStats.totalClasses,
      'Completed Classes': tutor.classStats.completedClasses,
      'Pending Classes': tutor.classStats.pendingClasses,
      'Students Assigned': peerTutorStudentCounts[tutor.id] || 0
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Peer Tutors')
    
    const fileName = `peer_tutors_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  const exportStudents = () => {
    const exportData = filteredStudents.map(student => ({
      'Name': student.name,
      'Email': student.email,
      'Year & Section': `${student.year} - ${student.section}`,
      'Assigned Peer Tutor': student.assigned_peer_tutor?.name || 'Not assigned'
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Students')
    
    const fileName = `students_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  // Handle peer tutor deletion
  const handleDeletePeerTutor = (tutorId: string, tutorName: string) => {
    setPeerTutorToDelete({ id: tutorId, name: tutorName })
    setShowDeleteModal(true)
  }

  // Confirm peer tutor deletion
  const confirmDeletePeerTutor = async () => {
    if (!peerTutorToDelete) return

    try {
      const result = await PeerTutorService.removePeerTutor(peerTutorToDelete.id)
      if (result.success) {
        // Invalidate all related queries in the cache
        queryClient.invalidateQueries({ queryKey: ['peer-tutor-stats'] })
        queryClient.invalidateQueries({ queryKey: ['all-students'] })
        queryClient.invalidateQueries({ queryKey: ['faculty-department'] })
        
        // Reload peer tutors data
        const tutors = await PeerTutorService.getAllPeerTutors()
        setPeerTutors(tutors)
        setFilteredPeerTutors(tutors)
        
        // Recalculate assigned/unassigned counts
        const assignedTutors = tutors.filter(tutor => {
          // Check if this peer tutor has any assigned students
          return true // For now, assuming all are assigned
        })
        setAssignedCount(assignedTutors.length)
        setUnassignedCount(tutors.length - assignedTutors.length)
        
        // Close modal
        setShowDeleteModal(false)
        setPeerTutorToDelete(null)
        
        // Show success message
        alert(result.message)
      } else {
        // Check if the error is about assigned students
        if (result.message.includes('students are still assigned')) {
          // Show a more detailed modal with force delete option
          if (confirm(`${result.message}\n\nDo you want to force delete and unassign all students?`)) {
            const forceResult = await PeerTutorService.removePeerTutor(peerTutorToDelete.id, true)
            if (forceResult.success) {
              // Invalidate all related queries in the cache
              queryClient.invalidateQueries({ queryKey: ['peer-tutor-stats'] })
              queryClient.invalidateQueries({ queryKey: ['all-students'] })
              queryClient.invalidateQueries({ queryKey: ['faculty-department'] })
              
              // Reload data
              const tutors = await PeerTutorService.getAllPeerTutors()
              setPeerTutors(tutors)
              setFilteredPeerTutors(tutors)
              
              // Recalculate counts
              const assignedTutors = tutors.filter(tutor => true)
              setAssignedCount(assignedTutors.length)
              setUnassignedCount(tutors.length - assignedTutors.length)
              
              // Close modal
              setShowDeleteModal(false)
              setPeerTutorToDelete(null)
              
              alert(forceResult.message)
            } else {
              alert(forceResult.message)
            }
          }
        } else {
          alert(result.message)
        }
      }
    } catch (error) {
      console.error('Error deleting peer tutor:', error)
      alert('An error occurred while deleting the peer tutor. Please try again.')
    }
  }

  // Load renumeration templates
  const loadRenumerationTemplates = async () => {
    if (!user?.id) return
    
    setTemplatesLoading(true)
    try {
      const templates = await RenumerationService.getRenumerationTemplates(user.id)
      setRenumerationTemplates(templates)
    } catch (error) {
      console.error('Error loading renumeration templates:', error)
    } finally {
      setTemplatesLoading(false)
    }
  }

  // Load renumeration submissions
  const loadRenumerationSubmissions = async () => {
    if (!user?.id) return
    
    setRenumerationLoading(true)
    try {
      const submissions = await RenumerationService.getRenumerationSubmissions(user.id)
      setRenumerationSubmissions(submissions)
    } catch (error) {
      console.error('Error loading renumeration submissions:', error)
    } finally {
      setRenumerationLoading(false)
    }
  }

  // Load template-specific submissions
  const loadTemplateSubmissions = async (templateId: string) => {
    setRenumerationLoading(true)
    try {
      const submissions = await RenumerationService.getRenumerationSubmissionsByTemplate(templateId)
      setTemplateSubmissions(submissions)

      // Load classes completed data for each submission
      const submissionsWithClassesData = await Promise.all(
        submissions.map(async (submission) => {
          let classesCompleted = 0
          try {
            const classStats = await ScheduledClassService.getPeerTutorClassStats(submission.peer_tutor_id)
            classesCompleted = classStats.completedClasses
          } catch (error) {
            console.warn('Could not fetch class stats for peer tutor:', submission.peer_tutor_id)
          }

          return {
            ...submission,
            classesCompleted
          }
        })
      )
      setSubmissionsWithClasses(submissionsWithClassesData)
    } catch (error) {
      console.error('Error loading template submissions:', error)
    } finally {
      setRenumerationLoading(false)
    }
  }

  // Handle template selection
  const handleTemplateClick = async (template: RenumerationTemplate) => {
    setSelectedTemplate(template)
    setRenumerationView('submissions')
    await loadTemplateSubmissions(template.id)
  }

  // Handle back to templates view
  const handleBackToTemplates = () => {
    setRenumerationView('templates')
    setSelectedTemplate(null)
    setTemplateSubmissions([])
  }

  // Export submissions to Excel/CSV
  const exportToExcel = async () => {
    if (!selectedTemplate || submissionsWithClasses.length === 0) return

    try {
      // Prepare CSV data
      const headers = [
        'Peer Tutor Name',
        'Email',
        'Classes Completed',
        'Status',
        'Submitted Date',
        ...selectedTemplate.fields.map(field => field.field_name)
      ]

      const csvData = submissionsWithClasses.map(submission => {
        const row = [
          submission.peer_tutor?.name || 'Unknown',
          submission.peer_tutor?.email || 'No email',
          submission.classesCompleted,
          submission.status,
          submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString() : 'Not submitted'
        ]

        // Add renumeration field responses
        selectedTemplate.fields.forEach(field => {
          const value = submission.field_responses?.[field.id] || ''
          row.push(value)
        })

        return row
      })

      // Convert to CSV
      const csvContent = [
        headers.join(','),
        ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n')

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `${selectedTemplate.name}_submissions_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      alert('Error exporting data. Please try again.')
    }
  }

  // Handle renumeration success
  const handleRenumerationSuccess = () => {
    // Reload renumeration templates and submissions when a new template is created
    loadRenumerationTemplates()
    loadRenumerationSubmissions()
    console.log('Renumeration sent successfully')
  }

  // Handle approve/reject renumeration
  const handleRenumerationStatusUpdate = async (renumerationId: string, status: 'approved' | 'rejected') => {
    try {
      const success = await RenumerationService.updateRenumerationStatus(
        renumerationId,
        status,
        user?.email || 'Unknown'
      )
      
      if (success) {
        loadRenumerationSubmissions() // Reload submissions
      }
    } catch (error) {
      console.error('Error updating renumeration status:', error)
    }
  }

  // Load feedback forms
  const loadFeedbackForms = async () => {
    if (!user?.id) return
    
    setFeedbackLoading(true)
    try {
      const forms = await FeedbackService.getFeedbackFormsByFaculty(user.id)
      setFeedbackForms(forms)
    } catch (error) {
      console.error('Error loading feedback forms:', error)
    } finally {
      setFeedbackLoading(false)
    }
  }

  // Load feedback responses for a form
  const loadFeedbackResponses = async (formId: string) => {
    setFeedbackLoading(true)
    try {
      const responses = await FeedbackService.getFeedbackResponses(formId)
      setFeedbackResponses(responses)
    } catch (error) {
      console.error('Error loading feedback responses:', error)
    } finally {
      setFeedbackLoading(false)
    }
  }

  // Handle feedback form creation success
  const handleFeedbackFormSuccess = () => {
    loadFeedbackForms()
    setShowFeedbackModal(false)
  }

  // Handle view feedback responses
  const handleViewFeedbackResponses = async (form: FeedbackForm) => {
    setSelectedFeedbackForm(form)
    await loadFeedbackResponses(form.id)
    setShowFeedbackResponsesModal(true)
  }

  // Load renumeration data when switching to renumeration tab
  useEffect(() => {
    if (activeTab === 'renumeration') {
      loadRenumerationTemplates()
      loadRenumerationSubmissions()
    }
  }, [activeTab, user?.id])

  // Load feedback data when switching to feedback tab
  useEffect(() => {
    if (activeTab === 'feedback') {
      loadFeedbackForms()
    }
  }, [activeTab, user?.id])

  // Load reports data when switching to reports tab
  useEffect(() => {
    if (activeTab === 'reports') {
      loadPeerTutorReports()
    }
  }, [activeTab])

  // Load peer tutor reports
  const loadPeerTutorReports = async () => {
    setReportsLoading(true)
    try {
      const reports = await ReportService.getAllPeerTutorReports()
      setPeerTutorReports(reports)
    } catch (error) {
      console.error('Error loading peer tutor reports:', error)
    } finally {
      setReportsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 overflow-y-auto">
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-2xl font-semibold text-gray-900 ml-2 lg:ml-0">Student & Peer Tutor Management</h1>
            </div>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveTab('tutors')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'tutors'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Peer Tutors
              </button>
              <button
                onClick={() => setActiveTab('students')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'students'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Students
              </button>
              <button
                onClick={() => setActiveTab('feedback')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'feedback'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Feedback
              </button>
              <button
                onClick={() => setActiveTab('renumeration')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'renumeration'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Renumeration Management
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'reports'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Reports
              </button>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <main className="py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : activeTab === 'tutors' ? (
              <>
                {/* Stats Overview */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-2 mb-6">
                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Assigned Peer Tutors</dt>
                            <dd className="text-lg font-medium text-gray-900">{assignedCount}</dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-orange-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Unassigned Peer Tutors</dt>
                            <dd className="text-lg font-medium text-gray-900">{unassignedCount}</dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Peer Tutors Table */}
                <div className="bg-white shadow rounded-lg">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900">
                        All Peer Tutors ({filteredPeerTutors.length} of {peerTutors.length})
                        {hasActiveFilters && (
                          <span className="ml-2 text-sm text-blue-600">
                            (Filtered)
                          </span>
                        )}
                      </h3>
                      <div className="flex items-center space-x-3">
                        {/* Export Button */}
                        <button
                          onClick={exportPeerTutors}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center space-x-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>Export</span>
                        </button>

                        {/* Filter Button */}
                        <div className="relative" ref={filterRef}>
                          <button
                            onClick={() => setShowFilterPopup(!showFilterPopup)}
                            className={`p-2 rounded-md transition-colors duration-200 ${
                              hasActiveFilters
                                ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                            title="Filter peer tutors"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                          </button>

                          {/* Filter Popup */}
                          {showFilterPopup && (
                            <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                              <div className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-sm font-medium text-gray-900">Filter Peer Tutors</h4>
                                  {hasActiveFilters && (
                                    <button
                                      onClick={clearFilters}
                                      className="text-xs text-blue-600 hover:text-blue-800"
                                    >
                                      Clear all
                                    </button>
                                  )}
                                </div>
                                
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
                                    <select
                                      value={selectedYear}
                                      onChange={(e) => setSelectedYear(e.target.value)}
                                      className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                      <option value="all">All Years</option>
                                      {availableYears.map(year => (
                                        <option key={year} value={year}>{year}</option>
                                      ))}
                                    </select>
                                  </div>
                                  
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Section</label>
                                    <select
                                      value={selectedSection}
                                      onChange={(e) => setSelectedSection(e.target.value)}
                                      className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                      <option value="all">All Sections</option>
                                      {availableSections.map(section => (
                                        <option key={section} value={section}>{section}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex space-x-3">
                          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200">
                            Add New Peer Tutor
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Peer Tutor
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Year & Section
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total Classes Allocated
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Completed Classes
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Pending Classes
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Students Assigned
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {statsLoading ? (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                              <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                                Loading peer tutor statistics...
                              </div>
                            </td>
                          </tr>
                        ) : peerTutorsWithStats.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                              <div className="flex flex-col items-center">
                                <svg className="h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                                </svg>
                                <p className="text-lg font-medium text-gray-900 mb-2">No peer tutors found</p>
                                <p className="text-sm text-gray-500">
                                  {hasActiveFilters 
                                    ? "No peer tutors match your current filters." 
                                    : "No peer tutors have been added yet."
                                  }
                                </p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          peerTutorsWithStats.map((tutor) => (
                            <tr key={tutor.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                      <span className="text-blue-600 font-medium text-sm">
                                        {tutor.name.split(' ').map(n => n[0]).join('')}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="ml-4">
                                    <button
                                      onClick={() => handleViewPeerTutor(tutor.id)}
                                      className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors text-left"
                                    >
                                      {tutor.name}
                                    </button>
                                    <div className="text-sm text-gray-500">{tutor.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{tutor.year} - {tutor.section}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-semibold text-gray-900">
                                  {tutor.classStats.totalClasses}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-semibold text-green-600">
                                  {tutor.classStats.completedClasses}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-semibold text-yellow-600">
                                  {tutor.classStats.pendingClasses}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-semibold text-blue-600">
                                  {peerTutorStudentCounts[tutor.id] || 0}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => handleDeletePeerTutor(tutor.id, tutor.name)}
                                    className="text-red-600 hover:text-red-900 transition-colors"
                                    title="Delete peer tutor"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : activeTab === 'students' ? (
              <>
                {/* Student Stats Overview */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-2 mb-6">
                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Assigned Students</dt>
                            <dd className="text-lg font-medium text-gray-900">{assignedStudentCount}</dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-orange-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Unassigned Students</dt>
                            <dd className="text-lg font-medium text-gray-900">{unassignedStudentCount}</dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Students Table */}
                <div className="bg-white shadow rounded-lg">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900">
                        All Students ({filteredStudents.length} of {students.length})
                        {hasActiveStudentFilters && (
                          <span className="ml-2 text-sm text-blue-600">
                            (Filtered)
                          </span>
                        )}
                      </h3>
        <div className="flex items-center space-x-3">
          {/* Export Button */}
          <button
            onClick={exportStudents}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export</span>
          </button>

          {/* Filter Button */}
          <div className="relative" ref={studentFilterRef}>
                          <button
                            onClick={() => setShowStudentFilterPopup(!showStudentFilterPopup)}
                            className={`p-2 rounded-md transition-colors duration-200 ${
                              hasActiveStudentFilters
                                ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                            title="Filter students"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                          </button>

                          {/* Filter Popup */}
                          {showStudentFilterPopup && (
                            <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                              <div className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-sm font-medium text-gray-900">Filter Students</h4>
                                  {hasActiveStudentFilters && (
                                    <button
                                      onClick={clearStudentFilters}
                                      className="text-xs text-blue-600 hover:text-blue-800"
                                    >
                                      Clear all
                                    </button>
                                  )}
                                </div>
                                
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
                                    <select
                                      value={selectedStudentYear}
                                      onChange={(e) => setSelectedStudentYear(e.target.value)}
                                      className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                      <option value="all">All Years</option>
                                      {availableStudentYears.map(year => (
                                        <option key={year} value={year}>{year}</option>
                                      ))}
                                    </select>
                                  </div>
                                  
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Section</label>
                                    <select
                                      value={selectedStudentSection}
                                      onChange={(e) => setSelectedStudentSection(e.target.value)}
                                      className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                      <option value="all">All Sections</option>
                                      {availableStudentSections.map(section => (
                                        <option key={section} value={section}>{section}</option>
                                      ))}
                                    </select>
                                  </div>
                                  
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Peer Tutor</label>
                                    <select
                                      value={selectedPeerTutor}
                                      onChange={(e) => setSelectedPeerTutor(e.target.value)}
                                      className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                      <option value="all">All Peer Tutors</option>
                                      {peerTutors.map(tutor => (
                                        <option key={tutor.id} value={tutor.id}>{tutor.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex space-x-3">
                          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200">
                            Add New Student
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Student
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Year & Section
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Assigned Peer Tutor
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredStudents.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                              <div className="flex flex-col items-center">
                                <svg className="h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                                </svg>
                                <p className="text-lg font-medium text-gray-900 mb-2">No students found</p>
                                <p className="text-sm text-gray-500">
                                  {hasActiveStudentFilters 
                                    ? "No students match your current filters." 
                                    : "No students have been added yet."
                                  }
                                </p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredStudents.map((student) => (
                            <tr key={student.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                                      <span className="text-green-600 font-medium text-sm">
                                        {student.name.split(' ').map(n => n[0]).join('')}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="ml-4">
                                    <div className="text-sm font-medium text-gray-900">
                                      {student.name}
                                    </div>
                                    <div className="text-sm text-gray-500">{student.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{student.year} - {student.section}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {student.assigned_peer_tutor ? (
                                  <div className="text-sm text-gray-900">
                                    {student.assigned_peer_tutor.name}
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-500">
                                    Not assigned
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <button className="text-red-600 hover:text-red-900 transition-colors">
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : activeTab === 'feedback' ? (
              <>
                {/* Feedback Stats Overview */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-3 mb-6">
                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Total Forms</dt>
                            <dd className="text-lg font-medium text-gray-900">{feedbackForms.length}</dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Active Forms</dt>
                            <dd className="text-lg font-medium text-gray-900">
                              {feedbackForms.filter(form => form.is_active).length}
                            </dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-purple-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Total Responses</dt>
                            <dd className="text-lg font-medium text-gray-900">
                              {feedbackForms.reduce((total, form) => total + (form as any).responseCount || 0, 0)}
                            </dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Feedback Forms Table */}
                <div className="bg-white shadow rounded-lg">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900">
                        Feedback Forms ({feedbackForms.length})
                      </h3>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => setShowFeedbackModal(true)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                        >
                          Create New Form
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Form Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Description
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Questions
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Responses
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {feedbackLoading ? (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                              <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                                Loading feedback forms...
                              </div>
                            </td>
                          </tr>
                        ) : feedbackForms.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                              <div className="flex flex-col items-center">
                                <svg className="h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p className="text-lg font-medium text-gray-900 mb-2">No feedback forms found</p>
                                <p className="text-sm text-gray-500">Create your first feedback form to get started.</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          feedbackForms.map((form) => (
                            <tr key={form.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{form.name}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-gray-500 max-w-xs truncate">
                                  {form.description || 'No description'}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-semibold text-gray-900">
                                  {form.questions.length}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  form.is_active 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {form.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-semibold text-gray-900">
                                  {(form as any).responseCount || 0}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {new Date(form.created_at).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => handleViewFeedbackResponses(form)}
                                    className="text-blue-600 hover:text-blue-900 transition-colors"
                                  >
                                    View Responses
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedFeedbackForm(form)
                                      setShowFeedbackModal(true)
                                    }}
                                    className="text-green-600 hover:text-green-900 transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (confirm('Are you sure you want to delete this feedback form?')) {
                                        const success = await FeedbackService.deleteFeedbackForm(form.id)
                                        if (success) {
                                          loadFeedbackForms()
                                        }
                                      }
                                    }}
                                    className="text-red-600 hover:text-red-900 transition-colors"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : activeTab === 'reports' ? (
              /* Reports Tab */
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Peer Tutor Reports</h2>
                    <p className="text-gray-600 mt-1">View attendance reports and export data for peer tutors</p>
                  </div>
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Export to Excel</span>
                  </button>
                </div>

                {/* Peer Tutor Reports */}
                <div className="bg-white shadow rounded-lg">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">
                      Peer Tutor Reports ({peerTutorReports.length})
                    </h3>
                  </div>

                  <div className="overflow-hidden">
                    {reportsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : peerTutorReports.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No peer tutors found</h3>
                        <p className="text-gray-500">No peer tutors have been added yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-4 p-6">
                        {peerTutorReports.map((report) => (
                          <div key={report.peer_tutor_id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3">
                                  <h4 className="text-lg font-semibold text-gray-900">{report.peer_tutor_name}</h4>
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {report.dept} - {report.year} - {report.section}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 mt-1">{report.peer_tutor_email}</p>
                                
                                <div className="mt-3">
                                  <div className="flex flex-wrap gap-2">
                                    {report.subjects.map((subject) => (
                                      <button
                                        key={subject.class_id}
                                        onClick={() => router.push(`/faculty/peer-tutor/${report.peer_tutor_id}/reports/${subject.class_id}`)}
                                        className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors"
                                      >
                                        {subject.subject_name}
                                        <span className="ml-2 text-xs text-gray-500">
                                          ({subject.completed_classes}/{subject.total_classes})
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center space-x-2 ml-4">
                                <button
                                  onClick={() => setSelectedPeerTutorForReport(report.peer_tutor_id)}
                                  className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                                >
                                  View Details
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Renumeration Management Tab */
              <div className="space-y-6">
                {/* Header with breadcrumb navigation */}
                <div className="flex items-center justify-between">
                  <div>
                    {renumerationView === 'submissions' && selectedTemplate ? (
                      <div>
                        <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                          <button
                            onClick={handleBackToTemplates}
                            className="hover:text-gray-700 transition-colors"
                          >
                            Renumeration Templates
                          </button>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="text-gray-700">{selectedTemplate.name}</span>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">{selectedTemplate.name} Submissions</h2>
                        <p className="text-gray-600 mt-1">View and manage submissions for this template</p>
                      </div>
                    ) : (
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">Renumeration Templates</h2>
                        <p className="text-gray-600 mt-1">Manage your renumeration templates and view submissions</p>
                      </div>
                    )}
                  </div>
                  {renumerationView === 'templates' && (
                    <button
                      onClick={() => setShowRenumerationModal(true)}
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
                    >
                      Create New Template
                    </button>
                  )}
                </div>

                {/* Renumeration Stats */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">
                              {renumerationView === 'submissions' ? 'Template Submissions' : 'Total Templates'}
                            </dt>
                            <dd className="text-lg font-medium text-gray-900">
                              {renumerationView === 'submissions' ? submissionsWithClasses.length : renumerationTemplates.length}
                            </dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-yellow-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Pending Review</dt>
                            <dd className="text-lg font-medium text-gray-900">
                              {renumerationView === 'submissions' 
                                ? submissionsWithClasses.filter(s => s.status === 'submitted').length
                                : renumerationSubmissions.filter(s => s.status === 'submitted').length
                              }
                            </dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Approved</dt>
                            <dd className="text-lg font-medium text-gray-900">
                              {renumerationView === 'submissions' 
                                ? submissionsWithClasses.filter(s => s.status === 'approved').length
                                : renumerationSubmissions.filter(s => s.status === 'approved').length
                              }
                            </dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-red-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Rejected</dt>
                            <dd className="text-lg font-medium text-gray-900">
                              {renumerationView === 'submissions' 
                                ? submissionsWithClasses.filter(s => s.status === 'rejected').length
                                : renumerationSubmissions.filter(s => s.status === 'rejected').length
                              }
                            </dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Templates View */}
                {renumerationView === 'templates' && (
                  <div className="bg-white shadow rounded-lg">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900">
                        Renumeration Templates ({renumerationTemplates.length})
                      </h3>
                    </div>
                    
                    <div className="p-6">
                      {templatesLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                      ) : renumerationTemplates.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
                          <p className="text-gray-500">Create your first renumeration template to get started.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {renumerationTemplates.map((template) => (
                            <div key={template.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleTemplateClick(template)}>
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-3">
                                    <h4 className="text-lg font-semibold text-gray-900">{template.name}</h4>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      template.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {template.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                  </div>
                                  
                                  {template.description && (
                                    <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                                  )}
                                  
                                  <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                                    <span>{template.fields.length} field(s)</span>
                                    <span>Created {new Date(template.created_at).toLocaleDateString()}</span>
                                  </div>
                                  
                                  <div className="mt-3">
                                    <div className="flex flex-wrap gap-2">
                                      {template.fields.map((field) => (
                                        <span
                                          key={field.id}
                                          className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800"
                                        >
                                          {field.field_name}
                                          {field.is_mandatory && <span className="text-red-500 ml-1">*</span>}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex items-center space-x-2 ml-4">
                                  <span className="text-sm text-blue-600 font-medium">View Submissions</span>
                                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Template Submissions View */}
                {renumerationView === 'submissions' && (
                  <div className="bg-white shadow rounded-lg">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-gray-900">
                          {selectedTemplate?.name} Submissions ({submissionsWithClasses.length})
                        </h3>
                        {submissionsWithClasses.length > 0 && (
                          <button
                            onClick={exportToExcel}
                            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>Export to Excel</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      {renumerationLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                      ) : submissionsWithClasses.length > 0 ? (
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Peer Tutor
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Classes Completed
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Submitted
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {submissionsWithClasses.map((submission) => (
                              <tr key={submission.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <div className="flex-shrink-0 h-10 w-10">
                                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                        <span className="text-blue-600 font-medium text-sm">
                                          {submission.peer_tutor?.name?.split(' ').map((n: string) => n[0]).join('') || 'PT'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="ml-4">
                                      <div className="text-sm font-medium text-gray-900">
                                        {submission.peer_tutor?.name || 'Unknown'}
                                      </div>
                                      <div className="text-sm text-gray-500">
                                        {submission.peer_tutor?.email || 'No email'}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {submission.classesCompleted}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    submission.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    submission.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                                    submission.status === 'approved' ? 'bg-green-100 text-green-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {submission.submitted_at 
                                    ? new Date(submission.submitted_at).toLocaleDateString()
                                    : 'Not submitted'
                                  }
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                  <div className="flex items-center space-x-2">
                                    {submission.status === 'submitted' && (
                                      <>
                                        <button
                                          onClick={() => handleRenumerationStatusUpdate(submission.id, 'approved')}
                                          className="text-green-600 hover:text-green-900 transition-colors"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          onClick={() => handleRenumerationStatusUpdate(submission.id, 'rejected')}
                                          className="text-red-600 hover:text-red-900 transition-colors"
                                        >
                                          Reject
                                        </button>
                                      </>
                                    )}
                                    <button
                                      onClick={() => {
                                        setSelectedSubmission(submission)
                                        setShowDetailsModal(true)
                                      }}
                                      className="text-blue-600 hover:text-blue-900 transition-colors"
                                    >
                                      View
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-medium text-gray-900 mb-2">No submissions found</h3>
                          <p className="text-gray-500">No peer tutors have submitted responses for this template yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Renumeration Modal */}
      {user && (
        <RenumerationModal
          isOpen={showRenumerationModal}
          onClose={() => setShowRenumerationModal(false)}
          onSuccess={handleRenumerationSuccess}
          facultyId={user.id}
        />
      )}

      {/* Renumeration Details Modal */}
      {selectedSubmission && (
        <RenumerationDetailsModal
          submission={selectedSubmission}
          isOpen={showDetailsModal}
          onClose={() => {
            setShowDetailsModal(false)
            setSelectedSubmission(null)
          }}
          onStatusUpdate={handleRenumerationStatusUpdate}
        />
      )}

      {/* Feedback Form Modal */}
      {user && (
        <FeedbackFormModal
          isOpen={showFeedbackModal}
          onClose={() => {
            setShowFeedbackModal(false)
            setSelectedFeedbackForm(null)
          }}
          onSuccess={handleFeedbackFormSuccess}
          facultyId={user.id}
          editingForm={selectedFeedbackForm}
        />
      )}

      {/* Feedback Responses Modal */}
      {selectedFeedbackForm && (
        <FeedbackResponsesModal
          isOpen={showFeedbackResponsesModal}
          onClose={() => {
            setShowFeedbackResponsesModal(false)
            setSelectedFeedbackForm(null)
          }}
          feedbackForm={selectedFeedbackForm}
          responses={feedbackResponses}
          loading={feedbackLoading}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && peerTutorToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Peer Tutor</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Are you sure you want to delete <strong>{peerTutorToDelete.name}</strong>? 
                  This action cannot be undone and will permanently remove:
                </p>
                <ul className="text-sm text-gray-500 mb-6 list-disc list-inside space-y-1">
                  <li>Peer tutor profile and information</li>
                  <li>All renumeration records</li>
                  <li>All exam marks and grades</li>
                  <li>All class assignments and schedules</li>
                  <li>Student assignments (if force delete is chosen)</li>
                </ul>
                <div className="flex items-center justify-center space-x-3">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false)
                      setPeerTutorToDelete(null)
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDeletePeerTutor}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Excel Export Modal */}
      <ExcelExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        peerTutorInfo={null}
        reportData={null}
      />
    </div>
  )
}
