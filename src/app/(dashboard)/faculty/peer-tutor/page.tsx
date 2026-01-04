'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useState, useEffect, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import { PeerTutorService, PeerTutor } from '@/lib/services/peerTutorService'
import { StudentService, StudentWithPeerTutor } from '@/lib/services/studentService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { RenumerationService, RenumerationTemplate, PeerTutorRenumeration } from '@/lib/services/renumerationService'
import { FeedbackService, FeedbackForm } from '@/lib/services/feedbackService'
import { FeedbackAnalyticsService } from '@/lib/services/feedbackAnalyticsService'
import { ReportService, PeerTutorReportData, ClassAttendanceReport } from '@/lib/services/reportService'
import { ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import RenumerationModal from '@/components/forms/RenumerationModal'
import RenumerationDetailsModal from '@/components/forms/RenumerationDetailsModal'
import FeedbackFormModal from '@/components/forms/FeedbackFormModal'
import FeedbackResponsesModal from '@/components/forms/FeedbackResponsesModal'
import FeedbackAnalyticsPage from '@/components/forms/FeedbackAnalyticsPage'
import ExcelExportModal from '@/components/forms/ExcelExportModal'
import PeerTutorImportModal from '@/components/forms/PeerTutorImportModal'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Edit, Eye } from 'lucide-react'
import ExportButton from '@/components/ui/ExportButton'

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
  additionalClassesCount: number
}

interface SubmissionWithClasses extends PeerTutorRenumeration {
  classesCompleted?: number
}

function FacultyPeerTutorContent() {
  const router = useRouter()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  
  // Use custom hook for sidebar collapsed state (reads from localStorage synchronously)
  const [isSidebarCollapsed] = useSidebarCollapsed()
  const [peerTutors, setPeerTutors] = useState<PeerTutor[]>([])
  const [filteredPeerTutors, setFilteredPeerTutors] = useState<PeerTutor[]>([])
  const [peerTutorsWithStats, setPeerTutorsWithStats] = useState<PeerTutorWithStats[]>([])
  const [students, setStudents] = useState<StudentWithPeerTutor[]>([])
  const [filteredStudents, setFilteredStudents] = useState<StudentWithPeerTutor[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [assignedCount, setAssignedCount] = useState(0)
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
  const [renumerationSubmissions, setRenumerationSubmissions] = useState<PeerTutorRenumeration[]>([])
  const [renumerationLoading, setRenumerationLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'tutors' | 'students' | 'feedback' | 'renumeration' | 'reports' | 'leaderboard'>('tutors')
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<PeerTutorRenumeration | null>(null)
  
  // Template management states
  const [renumerationTemplates, setRenumerationTemplates] = useState<RenumerationTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<RenumerationTemplate | null>(null)
  const [renumerationView, setRenumerationView] = useState<'templates' | 'submissions'>('templates')
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [submissionsWithClasses, setSubmissionsWithClasses] = useState<SubmissionWithClasses[]>([])


  // Submissions filters/sorting
  const [filterYear, setFilterYear] = useState<string>('')
  const [filterSection, setFilterSection] = useState<string>('')
  const [sortDescByName, setSortDescByName] = useState<boolean>(false)
  const [filterStatus, setFilterStatus] = useState<string>('') // '' | 'pending' | 'completed'
  const [showSubmissionFilter, setShowSubmissionFilter] = useState<boolean>(false)
  const submissionFilterRef = useRef<HTMLDivElement>(null)
  
  // Delete modes for Students and Peer Tutors
  const [isStudentDeleteMode, setIsStudentDeleteMode] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [isPeerTutorDeleteMode, setIsPeerTutorDeleteMode] = useState(false)
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [selectedPeerTutorIds, setSelectedPeerTutorIds] = useState<Set<string>>(new Set())

  // Feedback states
  const [feedbackForms, setFeedbackForms] = useState<FeedbackForm[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [selectedFeedbackForm, setSelectedFeedbackForm] = useState<FeedbackForm | null>(null)

  const [showFeedbackResponsesModal, setShowFeedbackResponsesModal] = useState(false)
  const [selectedFeedbackFormForAnalytics, setSelectedFeedbackFormForAnalytics] = useState<FeedbackForm | null>(null)
  const [isFeedbackDeleteMode, setIsFeedbackDeleteMode] = useState(false)
  const [selectedFeedbackFormIds, setSelectedFeedbackFormIds] = useState<Set<string>>(new Set())


  // Delete confirmation modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [peerTutorToDelete, setPeerTutorToDelete] = useState<{id: string, name: string} | null>(null)

  // Reports states
  const [peerTutorReports, setPeerTutorReports] = useState<PeerTutorReportData[]>([])
  const [filteredPeerTutorReports, setFilteredPeerTutorReports] = useState<PeerTutorReportData[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [reportFilterYear, setReportFilterYear] = useState<string>('all')
  const [reportFilterSection, setReportFilterSection] = useState<string>('all')
  const [reportFilterSubject, setReportFilterSubject] = useState<string>('all')

  
  // Inline report view states
  const [selectedReport, setSelectedReport] = useState<{tutorId: string, subjectId: string, tutorName: string, subjectName: string} | null>(null)
  const [reportScheduledClasses, setReportScheduledClasses] = useState<ScheduledClassWithDetails[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [selectedClass, setSelectedClass] = useState<ClassAttendanceReport | null>(null)
  const [showClassModal, setShowClassModal] = useState(false)

  const loadData = useCallback(async () => {
    try {
      // Load peer tutors
      const tutors = await PeerTutorService.getAllPeerTutors()
      setPeerTutors(tutors)
      setFilteredPeerTutors(tutors)
      
      // Calculate assigned/unassigned counts for peer tutors
      const assignedTutors = tutors.filter(() => {
        // Check if this peer tutor has any assigned students
        // This would need to be implemented in the service
        return true // For now, assuming all are assigned
      })
      setAssignedCount(assignedTutors.length)

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
  }, [])

  // Load peer tutors and students data with caching
  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle refresh
  const handleRefresh = async () => {
    setLoading(true)
    try {
      // Reload all data
      const tutors = await PeerTutorService.getAllPeerTutors()
      setPeerTutors(tutors)
      setFilteredPeerTutors(tutors)
      
      const allStudents = await StudentService.getAllStudentsWithPeerTutors()
      setStudents(allStudents)
      setFilteredStudents(allStudents)
      
      // Recalculate counts
      const assignedTutors = tutors.filter(() => true)
      setAssignedCount(assignedTutors.length)
      
      const assignedStudents = allStudents.filter(student => student.assigned_peer_tutor)
      setAssignedStudentCount(assignedStudents.length)
      setUnassignedStudentCount(allStudents.length - assignedStudents.length)
      
      const studentCounts: {[key: string]: number} = {}
      tutors.forEach(tutor => {
        const count = allStudents.filter(student => student.assigned_peer_tutor_id === tutor.id).length
        studentCounts[tutor.id] = count
      })
      setPeerTutorStudentCounts(studentCounts)
      
      // Reload reports if on reports tab
      if (activeTab === 'reports') {
        await loadPeerTutorReports()
      }
      
      setLastRefresh(new Date())
    } catch (error) {
      console.error('Error refreshing data:', error)
    } finally {
      setLoading(false)
    }
  }

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
            const additionalClasses = await AdditionalClassService.getAdditionalClassesByPeerTutor(tutor.id)
            
            // Debug logging
            console.log(`Peer Tutor ${tutor.name} (${tutor.id}):`, {
              additionalClassesCount: additionalClasses.length,
              additionalClasses: additionalClasses.map(ac => ({
                id: ac.id,
                subject_name: ac.subject_name,
                class_date: ac.class_date
              }))
            })
            
            return {
              ...tutor,
              classStats,
              additionalClassesCount: additionalClasses.length
            }
          })
        )
        setPeerTutorsWithStats(tutorsWithStats)
      } catch (error) {
        console.error('Error loading peer tutor stats:', error)
        // Fallback to original data without stats
        setPeerTutorsWithStats(filteredPeerTutors.map(tutor => ({
          ...tutor,
          classStats: { totalClasses: 0, completedClasses: 0, pendingClasses: 0 },
          additionalClassesCount: 0
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
      'Additional Classes Taken': tutor.additionalClassesCount || 0,
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
  // const handleDeletePeerTutor = (tutorId: string, tutorName: string) => {
  //   setPeerTutorToDelete({ id: tutorId, name: tutorName })
  //   setShowDeleteModal(true)
  // }

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
        const assignedTutors = tutors.filter(() => {
          // Check if this peer tutor has any assigned students
          return true // For now, assuming all are assigned
        })
        setAssignedCount(assignedTutors.length)
        
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
              const assignedTutors = tutors.filter(() => true)
              setAssignedCount(assignedTutors.length)
              
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

  // Handle student delete mode toggle
  const handleStudentDeleteModeToggle = () => {
    setIsStudentDeleteMode(!isStudentDeleteMode)
    if (!isStudentDeleteMode) {
      setSelectedStudentIds(new Set())
    }
  }

  // Handle peer tutor delete mode toggle
  const handlePeerTutorDeleteModeToggle = () => {
    setIsPeerTutorDeleteMode(!isPeerTutorDeleteMode)
    if (!isPeerTutorDeleteMode) {
      setSelectedPeerTutorIds(new Set())
    }
  }

  // Handle student selection
  const handleStudentSelect = (studentId: string) => {
    const newSelected = new Set(selectedStudentIds)
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId)
    } else {
      newSelected.add(studentId)
    }
    setSelectedStudentIds(newSelected)
  }

  // Handle select all students
  const handleSelectAllStudents = () => {
    if (selectedStudentIds.size === filteredStudents.length) {
      setSelectedStudentIds(new Set())
    } else {
      setSelectedStudentIds(new Set(filteredStudents.map(s => s.id)))
    }
  }

  // Handle peer tutor selection
  const handlePeerTutorSelect = (tutorId: string) => {
    const newSelected = new Set(selectedPeerTutorIds)
    if (newSelected.has(tutorId)) {
      newSelected.delete(tutorId)
    } else {
      newSelected.add(tutorId)
    }
    setSelectedPeerTutorIds(newSelected)
  }

  // Handle select all peer tutors
  const handleSelectAllPeerTutors = () => {
    if (selectedPeerTutorIds.size === peerTutorsWithStats.length) {
      setSelectedPeerTutorIds(new Set())
    } else {
      setSelectedPeerTutorIds(new Set(peerTutorsWithStats.map(t => t.id)))
    }
  }

  // Bulk delete students
  const handleBulkDeleteStudents = async () => {
    if (selectedStudentIds.size === 0) {
      alert('Please select at least one student to delete.')
      return
    }

    const confirmMessage = `Are you sure you want to delete ${selectedStudentIds.size} student(s)? This action cannot be undone.`
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      let successCount = 0
      let failCount = 0

      for (const studentId of selectedStudentIds) {
        try {
          const result = await StudentService.removeStudent(studentId)
          if (result) {
            successCount++
          } else {
            failCount++
          }
        } catch (error) {
          console.error(`Error deleting student ${studentId}:`, error)
          failCount++
        }
      }

      // Refresh data
      const allStudents = await StudentService.getAllStudentsWithPeerTutors()
      setStudents(allStudents)
      setFilteredStudents(allStudents)
      
      const assignedStudents = allStudents.filter(student => student.assigned_peer_tutor)
      setAssignedStudentCount(assignedStudents.length)
      setUnassignedStudentCount(allStudents.length - assignedStudents.length)

      // Reset delete mode
      setIsStudentDeleteMode(false)
      setSelectedStudentIds(new Set())

      if (failCount === 0) {
        alert(`Successfully deleted ${successCount} student(s).`)
      } else {
        alert(`Deleted ${successCount} student(s). Failed to delete ${failCount} student(s).`)
      }
    } catch (error) {
      console.error('Error deleting students:', error)
      alert('An error occurred while deleting students. Please try again.')
    }
  }

  // Bulk delete peer tutors
  const handleBulkDeletePeerTutors = async () => {
    if (selectedPeerTutorIds.size === 0) {
      alert('Please select at least one peer tutor to delete.')
      return
    }

    const confirmMessage = `Are you sure you want to delete ${selectedPeerTutorIds.size} peer tutor(s)? This action cannot be undone.`
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      let successCount = 0
      let failCount = 0

      for (const tutorId of selectedPeerTutorIds) {
        try {
          const tutor = peerTutorsWithStats.find(t => t.id === tutorId)
          if (!tutor) continue

          const result = await PeerTutorService.removePeerTutor(tutorId)
          if (result.success) {
            successCount++
          } else {
            // Check if we should force delete
            if (result.message.includes('students are still assigned')) {
              if (confirm(`${result.message}\n\nDo you want to force delete and unassign all students?`)) {
                const forceResult = await PeerTutorService.removePeerTutor(tutorId, true)
                if (forceResult.success) {
                  successCount++
                } else {
                  failCount++
                }
              } else {
                failCount++
              }
            } else {
              failCount++
            }
          }
        } catch (error) {
          console.error(`Error deleting peer tutor ${tutorId}:`, error)
          failCount++
        }
      }

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['peer-tutor-stats'] })
      queryClient.invalidateQueries({ queryKey: ['all-students'] })
      queryClient.invalidateQueries({ queryKey: ['faculty-department'] })
      
      const tutors = await PeerTutorService.getAllPeerTutors()
      setPeerTutors(tutors)
      setFilteredPeerTutors(tutors)

      const assignedTutors = tutors.filter(() => true)
      setAssignedCount(assignedTutors.length)
      setUnassignedStudentCount(tutors.length - assignedTutors.length)

      // Recalculate student counts
      const allStudents = await StudentService.getAllStudentsWithPeerTutors()
      const studentCounts: {[key: string]: number} = {}
      tutors.forEach(tutor => {
        const count = allStudents.filter(student => student.assigned_peer_tutor_id === tutor.id).length
        studentCounts[tutor.id] = count
      })
      setPeerTutorStudentCounts(studentCounts)

      // Reset delete mode
      setIsPeerTutorDeleteMode(false)
      setSelectedPeerTutorIds(new Set())

      if (failCount === 0) {
        alert(`Successfully deleted ${successCount} peer tutor(s).`)
      } else {
        alert(`Deleted ${successCount} peer tutor(s). Failed to delete ${failCount} peer tutor(s).`)
      }
    } catch (error) {
      console.error('Error deleting peer tutors:', error)
      alert('An error occurred while deleting peer tutors. Please try again.')
    }
  }

  // Load renumeration templates
  const loadRenumerationTemplates = useCallback(async () => {
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
  }, [user?.id])

  // Load renumeration submissions
  const loadRenumerationSubmissions = useCallback(async () => {
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
  }, [user?.id])

  // Load template-specific submissions
  const loadTemplateSubmissions = async (templateId: string) => {
    setRenumerationLoading(true)
    try {
      const submissions = await RenumerationService.getRenumerationSubmissionsByTemplate(templateId)
      // setTemplateSubmissions(submissions) - Removed unused state assignment

      // Load classes completed data for each submission
      const submissionsWithClassesData = await Promise.all(
        submissions.map(async (submission) => {
          let classesCompleted = 0
          try {
            const classStats = await ScheduledClassService.getPeerTutorClassStats(submission.peer_tutor_id)
            classesCompleted = classStats.completedClasses
          } catch (error) {
            console.warn('Could not fetch class stats for peer tutor:', submission.peer_tutor_id, error)
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

  // Update template open/closed status
  const handleTemplateStatusChange = async (templateId: string, isActive: boolean) => {
    const ok = await RenumerationService.updateTemplateStatus(templateId, isActive)
    if (ok) {
      await loadRenumerationSubmissions()
      await loadRenumerationTemplates()
    } else {
      alert('Failed to update status. Please try again.')
    }
  }

  // Derived submissions based on filters/sort
  const filteredAndSortedSubmissions = (submissionsWithClasses || [])
    .filter((s) => (filterYear ? s.peer_tutor?.year === filterYear : true))
    .filter((s) => (filterSection ? s.peer_tutor?.section === filterSection : true))
    .filter((s) => {
      if (!filterStatus) return true
      if (filterStatus === 'pending') return !s.submitted_at
      if (filterStatus === 'completed') return !!s.submitted_at
      return true
    })
    .sort((a, b) => {
      if (!sortDescByName) return 0
      const an = (a.peer_tutor?.name || '').toLowerCase()
      const bn = (b.peer_tutor?.name || '').toLowerCase()
      return bn.localeCompare(an)
    })

  // Close popup on outside click
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!showSubmissionFilter) return
      const el = submissionFilterRef.current
      if (el && !el.contains(event.target as Node)) {
        setShowSubmissionFilter(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showSubmissionFilter])

  // Handle back to templates view
  const handleBackToTemplates = () => {
    setRenumerationView('templates')
    setSelectedTemplate(null)
    setSubmissionsWithClasses([]) // Changed from setTemplateSubmissions([])
    setFilterYear('')
    setFilterSection('')
    setSortDescByName(false)
    setFilterStatus('')
    setShowSubmissionFilter(false)
  }



  // Export submissions to Excel/CSV
  const exportToExcel = async () => {
    if (!selectedTemplate) return
    const exportRows = filteredAndSortedSubmissions
    if (exportRows.length === 0) return

    try {
      // Prepare CSV data
      const headers = [
        'Peer Tutor Name',
        'Email',
        'Status',
        'Submitted Date',
        ...selectedTemplate.fields.map(field => field.field_name)
      ]

      const csvData = exportRows.map(submission => {
        const statusLabel = (submission.status === 'submitted' || submission.status === 'approved') ? 'Completed' : 'Pending'
        const row = [
          submission.peer_tutor?.name || 'Unknown',
          submission.peer_tutor?.email || 'No email',
          statusLabel,
          submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString() : 'Not submitted'
        ]

        // Add renumeration field responses
        selectedTemplate.fields.forEach(field => {
          const value = submission.field_responses?.[field.id] || ''
          row.push(String(value))
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
      const suffix = [
        filterYear && `Year-${filterYear}`,
        filterSection && `Section-${filterSection}`,
        filterStatus && `Status-${filterStatus === 'pending' ? 'Pending' : 'Completed'}`
      ].filter(Boolean).join('_')
      link.setAttribute('download', `${selectedTemplate.name}_submissions${suffix ? '_' + suffix : ''}_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
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
  const loadFeedbackForms = useCallback(async () => {
    
    if (!user?.id) {
      return
    }
    
    setFeedbackLoading(true)
    try {
      const forms = await FeedbackService.getFeedbackFormsByFaculty(user.id)
      
      // Load response counts and delta scores for each form
      const formsWithCounts = await Promise.all(
        forms.map(async (form) => {
          try {
            const stats = await FeedbackService.getFeedbackStats(form.id)
            let deltaScore = 0
            try {
              const analytics = await FeedbackAnalyticsService.getFormAnalytics(form.id)
              deltaScore = analytics?.satisfactionDelta || 0
            } catch (analyticsError) {
              console.error(`Error loading analytics for form ${form.id}:`, analyticsError)
            }
            return { 
              ...form, 
              responseCount: stats.totalResponses,
              totalEligibleStudents: stats.totalStudents,
              deltaScore
            }
          } catch (error) {
            console.error(`Error loading stats for form ${form.id}:`, error)
            return { 
              ...form, 
              responseCount: 0,
              totalEligibleStudents: 0,
              deltaScore: 0
            }
          }
        })
      )
      
      setFeedbackForms(formsWithCounts)
    } catch (error) {
      console.error('Error loading feedback forms:', error)
      console.error('Error type:', typeof error)
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setFeedbackLoading(false)
    }
  }, [user])
  
  // Handle feedback form checkbox selection
  const handleFeedbackFormCheckboxChange = (formId: string, checked: boolean) => {
    setSelectedFeedbackFormIds(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(formId)
      } else {
        newSet.delete(formId)
      }
      return newSet
    })
  }
  
  // Select all feedback forms
  const handleSelectAllFeedbackForms = (checked: boolean) => {
    if (checked) {
      setSelectedFeedbackFormIds(new Set(feedbackForms.map(f => f.id)))
    } else {
      setSelectedFeedbackFormIds(new Set())
    }
  }
  
  // Toggle feedback delete mode
  const handleToggleFeedbackDeleteMode = () => {
    setIsFeedbackDeleteMode(prev => {
      if (!prev) {
        setSelectedFeedbackFormIds(new Set())
      }
      return !prev
    })
  }
  
  // Cancel feedback delete mode
  const handleCancelFeedbackDeleteMode = () => {
    setIsFeedbackDeleteMode(false)
    setSelectedFeedbackFormIds(new Set())
  }
  
  // Delete selected feedback forms
  const handleDeleteSelectedFeedbackForms = async () => {
    if (selectedFeedbackFormIds.size === 0) return
    
    if (!confirm(`Are you sure you want to delete ${selectedFeedbackFormIds.size} feedback form(s)? This action cannot be undone.`)) {
      return
    }
    
    try {
      const deletePromises = Array.from(selectedFeedbackFormIds).map(id =>
        FeedbackService.deleteFeedbackForm(id)
      )
      
      const results = await Promise.all(deletePromises)
      const successCount = results.filter(Boolean).length
      
      if (successCount === selectedFeedbackFormIds.size) {
        setSelectedFeedbackFormIds(new Set())
        setIsFeedbackDeleteMode(false)
        loadFeedbackForms()
      } else {
        alert(`Failed to delete ${selectedFeedbackFormIds.size - successCount} form(s). Please try again.`)
      }
    } catch (error) {
      console.error('Error deleting feedback forms:', error)
      alert('An error occurred while deleting feedback forms. Please try again.')
    }
  }



  // Toggle feedback form status (open/close)
  const handleToggleFormStatus = async (formId: string, currentStatus: boolean) => {
    try {
      console.log('Toggling form status:', { formId, currentStatus, newStatus: !currentStatus })
      
      const result = await FeedbackService.updateFeedbackForm(formId, {
        is_active: !currentStatus
      })
      
      console.log('Update result:', result)
      
      if (result.success) {
        // Refresh the feedback forms list
        loadFeedbackForms()
      } else {
        console.error('Update failed with result:', result)
        console.error('Strategy:', result.strategy)
        alert('Failed to update form status. Please try again.')
      }
    } catch (error) {
      console.error('Error toggling form status:', error)
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      })
      alert('An error occurred while updating the form status. Please check the console for details.')
    }
  }


  // Handle feedback form creation success
  const handleFeedbackFormSuccess = () => {
    loadFeedbackForms()
    setShowFeedbackModal(false)
  }



  // Handle view analytics - show analytics view
  const handleViewAnalytics = (form: FeedbackForm) => {
    setSelectedFeedbackFormForAnalytics(form)
  }

  useEffect(() => {
    if (activeTab === 'renumeration') {
      loadRenumerationTemplates()
      loadRenumerationSubmissions()
    }
  }, [activeTab, user?.id, loadRenumerationTemplates, loadRenumerationSubmissions])

  useEffect(() => {
    if (activeTab === 'feedback') {
      loadFeedbackForms()
      // Reset analytics view when switching to feedback tab
      setSelectedFeedbackFormForAnalytics(null)
    }
  }, [activeTab, loadFeedbackForms])

  // Load peer tutor reports
  const loadPeerTutorReports = useCallback(async () => {
    setReportsLoading(true)
    try {
      const reports = await ReportService.getAllPeerTutorReports()
      setPeerTutorReports(reports)
      setFilteredPeerTutorReports(reports)
    } catch (error) {
      console.error('Error loading peer tutor reports:', error)
    } finally {
      setReportsLoading(false)
    }
  }, [])

  // Load reports data when switching to reports tab
  useEffect(() => {
    if (activeTab === 'reports') {
      loadPeerTutorReports()
    }
  }, [activeTab, loadPeerTutorReports])

  // Apply report filters
  useEffect(() => {
    let filtered = peerTutorReports

    if (reportFilterYear !== 'all') {
      filtered = filtered.filter(report => report.year === reportFilterYear)
    }

    if (reportFilterSection !== 'all') {
      filtered = filtered.filter(report => report.section === reportFilterSection)
    }

    if (reportFilterSubject !== 'all') {
      filtered = filtered.map(report => ({
        ...report,
        subjects: report.subjects.filter(s => s.subject_name === reportFilterSubject)
      })).filter(report => report.subjects.length > 0)
    }

    setFilteredPeerTutorReports(filtered)
  }, [peerTutorReports, reportFilterYear, reportFilterSection, reportFilterSubject])

  // Clear report filters
  const clearReportFilters = () => {
    setReportFilterYear('all')
    setReportFilterSection('all')
    setReportFilterSubject('all')
  }

  // Check if report filters are active
  const hasActiveReportFilters = reportFilterYear !== 'all' || reportFilterSection !== 'all' || reportFilterSubject !== 'all'

  // Get available years, sections and subjects for reports
  const availableReportYears = [...new Set(peerTutorReports.map(r => r.year))].sort()
  const availableReportSections = [...new Set(peerTutorReports.map(r => r.section))].sort()
  const availableReportSubjects = [...new Set(peerTutorReports.flatMap(r => r.subjects.map(s => s.subject_name)))].sort()

  // Handle export of filtered reports
  const handleExportFilteredReports = async () => {
    if (filteredPeerTutorReports.length === 0) {
      alert('No reports to export')
      return
    }

    try {
      const workbook = XLSX.utils.book_new()
      
      // Get unique years and sections from filtered reports
      const uniqueYears = [...new Set(filteredPeerTutorReports.map(r => r.year))].sort()
      const uniqueSections = [...new Set(filteredPeerTutorReports.map(r => r.section))].sort()
      const dept = filteredPeerTutorReports[0]?.dept || 'N/A'
      
      // Group reports by year
      const reportsByYear: Record<string, PeerTutorReportData[]> = {}
      filteredPeerTutorReports.forEach((report) => {
        if (!reportsByYear[report.year]) {
          reportsByYear[report.year] = []
        }
        reportsByYear[report.year].push(report)
      })

      // Create a sheet for each year
      for (const year of uniqueYears) {
        const yearReports = reportsByYear[year]
        const exportData: unknown[][] = []

        // Add header rows
        exportData.push(['Peer Tutor Reports Export'])
        exportData.push([`Department: ${dept}`])
        exportData.push([`Year: ${year}`])
        
        // Get unique sections for this year
        const yearSections = [...new Set(yearReports.map(r => r.section))].sort()
        exportData.push([`Section: ${yearSections.length > 1 ? 'ALL' : yearSections[0] || 'N/A'}`])
        exportData.push([`Generated on: ${new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}`])
        exportData.push([]) // Empty row

        // Add table headers
        exportData.push([
          'Peer Tutor Name',
          'Email',
          'Department',
          'Year',
          'Section',
          'Subject',
          'Total Classes',
          'Completed Classes',
          'Pending Classes',
          'Additional Classes'
        ])

        // Group reports by section within this year
        const reportsBySection: Record<string, PeerTutorReportData[]> = {}
        yearReports.forEach((report) => {
          if (!reportsBySection[report.section]) {
            reportsBySection[report.section] = []
          }
          reportsBySection[report.section].push(report)
        })

        // Add data rows grouped by section
        for (const section of yearSections) {
          const sectionReports = reportsBySection[section]
          
          // Add section header row
          exportData.push([
            `Section - ${section}`,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            ''
          ])

          // Add data rows for this section
          sectionReports.forEach((report) => {
            if (report.subjects.length === 0) {
              // If no subjects, add one row with peer tutor info
              exportData.push([
                report.peer_tutor_name,
                report.peer_tutor_email,
                report.dept,
                report.year,
                report.section,
                'No subjects assigned',
                '-',
                '-',
                '-',
                '-'
              ])
            } else {
              // Add one row per subject
              report.subjects.forEach((subject) => {
                exportData.push([
                  report.peer_tutor_name,
                  report.peer_tutor_email,
                  report.dept,
                  report.year,
                  report.section,
                  subject.subject_name,
                  subject.total_classes,
                  subject.completed_classes,
                  subject.pending_classes,
                  subject.additional_classes || 0
                ])
              })
            }
          })

          // Add empty row after each section (except the last one)
          if (section !== yearSections[yearSections.length - 1]) {
            exportData.push([])
          }
        }

        // Create worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(exportData)

        // Set column widths
        worksheet['!cols'] = [
          { wch: 25 }, // Peer Tutor Name
          { wch: 30 }, // Email
          { wch: 15 }, // Department
          { wch: 10 }, // Year
          { wch: 10 }, // Section
          { wch: 25 }, // Subject
          { wch: 15 }, // Total Classes
          { wch: 18 }, // Completed Classes
          { wch: 15 }  // Pending Classes
        ]

        // Format header rows (first 5 rows)
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
            if (worksheet[cellAddress]) {
              worksheet[cellAddress].s = {
                font: { name: 'Times New Roman', sz: 12, bold: true },
                alignment: { horizontal: 'left', vertical: 'center' }
              }
            }
          }
        }

        // Format table header row (row 6, index 5 after empty row)
        const headerRowIndex = 6
        for (let col = 0; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: col })
          if (worksheet[cellAddress]) {
            worksheet[cellAddress].s = {
              font: { name: 'Times New Roman', sz: 11, bold: true },
              alignment: { horizontal: 'center', vertical: 'center' },
              fill: { fgColor: { rgb: 'E6E6FA' } } // Light lavender background
            }
          }
        }

        // Format data rows and section headers
        for (let row = headerRowIndex + 1; row <= range.e.r; row++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: 0 })
          const cellValue = worksheet[cellAddress]?.v
          const isSectionHeader = typeof cellValue === 'string' && cellValue.startsWith('Section -')
          
          for (let col = 0; col <= range.e.c; col++) {
            const currentCellAddress = XLSX.utils.encode_cell({ r: row, c: col })
            if (worksheet[currentCellAddress]) {
              if (isSectionHeader) {
                // Format section header row
                worksheet[currentCellAddress].s = {
                  font: { name: 'Times New Roman', sz: 11, bold: true },
                  alignment: { horizontal: 'left', vertical: 'center' },
                  fill: { fgColor: { rgb: 'D3D3D3' } } // Light gray background for section headers
                }
              } else {
                // Format regular data rows
                worksheet[currentCellAddress].s = {
                  font: { name: 'Times New Roman', sz: 11 },
                  alignment: { 
                    horizontal: col >= 6 ? 'center' : 'left', // Center align numeric columns
                    vertical: 'center' 
                  }
                }
              }
            }
          }
        }

        // Add worksheet to workbook with sheet name "Year - {year}"
        const sheetName = `Year - ${year}`
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
      }

      // Generate filename
      const yearText = uniqueYears.length > 1 ? 'ALL' : uniqueYears[0] || 'ALL'
      const sectionText = uniqueSections.length > 1 ? 'ALL' : uniqueSections[0] || 'ALL'
      const fileName = `Peer_Tutor_Reports_${dept}_${yearText}_${sectionText}_${new Date().toISOString().split('T')[0]}.xlsx`

      // Save file
      XLSX.writeFile(workbook, fileName)
    } catch (error) {
      console.error('Error exporting reports:', error)
      alert('Error exporting Excel file. Please try again.')
    }
  }

  // Handle viewing a report inline
  const handleViewReport = async (tutorId: string, subjectId: string, tutorName: string, subjectName: string) => {
    setSelectedReport({ tutorId, subjectId, tutorName, subjectName })
    setReportLoading(true)
    try {
      const classes = await ReportService.getSubjectScheduledClasses(tutorId, subjectName)
      setReportScheduledClasses(classes)
    } catch (error) {
      console.error('Error loading report data:', error)
    } finally {
      setReportLoading(false)
    }
  }

  // Handle class click in inline report
  const handleClassClick = async (scheduledClass: ScheduledClassWithDetails) => {
    try {
      const classReport = await ReportService.getClassAttendanceReport(scheduledClass.id)
      if (classReport) {
        setSelectedClass(classReport)
        setShowClassModal(true)
      }
    } catch (error) {
      console.error('Error loading class attendance report:', error)
    }
  }



  // Handle back from report view
  const handleBackFromReport = () => {
    setSelectedReport(null)
    setReportScheduledClasses([])
    setSelectedClass(null)
    setShowClassModal(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} overflow-y-auto`}>
        {/* Top Header */}
        <PageHeader
          title="STUDENT MANAGEMENT"
          tagline="Peer Tutors, Students & Feedback Oversight"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={loading}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Tab Navigation */}
        <div className="bg-white border-b border-gray-100 flex items-center h-16 w-full sticky top-0 z-10 px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-2 overflow-x-auto no-scrollbar" aria-label="Tabs">
            {[
              { id: 'tutors', label: 'PEER TUTORS' },
              { id: 'students', label: 'STUDENTS' },
              { id: 'feedback', label: 'FEEDBACK' },
              { id: 'renumeration', label: 'RENUMERATION MANAGEMENT' },
              { id: 'reports', label: 'REPORTS' },
              { id: 'leaderboard', label: 'LEADERBOARD' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'tutors' | 'students' | 'feedback' | 'renumeration' | 'reports' | 'leaderboard')}
                className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-black text-white shadow-lg shadow-gray-200 scale-105' 
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className={`max-w-full mx-auto py-8 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : activeTab === 'tutors' ? (
              <>
                {/* Stats Overview - Clean White Design with 4 Cards */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                  {/* Tutors / Students Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Tutors / Students
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12M8 12h12m-12 5h12" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {assignedCount} / {peerTutors.length}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-green-600">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-semibold uppercase">Allocated</span>
                      </div>
                    </div>
                  </div>

                  {/* Total Classes Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Total Classes
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {peerTutorsWithStats.reduce((sum, t) => sum + t.classStats.totalClasses, 0)}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-blue-600">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        <span className="font-semibold uppercase">Scheduled</span>
                      </div>
                    </div>
                  </div>

                  {/* Pending Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Pending
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {peerTutorsWithStats.reduce((sum, t) => sum + t.classStats.pendingClasses, 0)}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-orange-600">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        <span className="font-semibold uppercase">Remaining</span>
                      </div>
                    </div>
                  </div>

                  {/* Additional Classes Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Additional Classes
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {peerTutorsWithStats.reduce((sum, t) => sum + (t.additionalClassesCount || 0), 0)}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-blue-600">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        <span className="font-semibold uppercase">Total Classes</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Peer Tutors Table */}
                <div className="bg-white shadow-sm rounded-lg border border-gray-200">
                  {/* Header with Title and Actions */}
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <h3 className="text-base font-bold text-gray-700 uppercase tracking-wide">
                        Peer Tutors ({filteredPeerTutors.length})
                        {hasActiveFilters && (
                          <span className="ml-2 text-sm text-blue-600 normal-case">
                            (Filtered)
                          </span>
                        )}
                      </h3>
                      
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Search Icon */}
                        <button
                          className="p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors duration-200"
                          title="Search"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </button>

                        {/* Filter Button */}
                        {!isPeerTutorDeleteMode && filteredPeerTutors.length > 0 && (
                          <div className="relative" ref={filterRef}>
                            <button
                              onClick={() => setShowFilterPopup(!showFilterPopup)}
                              className={`p-2.5 rounded-lg transition-colors duration-200 ${
                                hasActiveFilters
                                  ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
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
                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors duration-200"
                                      >
                                        Clear
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
                                        disabled={selectedYear === 'all'}
                                        className={`block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                                          selectedYear === 'all' ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''
                                        }`}
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
                        )}

                        {/* Action Buttons */}
                        {!isPeerTutorDeleteMode ? (
                          <>
                            {peerTutors.length > 0 && (
                              <button
                                onClick={handlePeerTutorDeleteModeToggle}
                                className="p-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors duration-200"
                                title="Delete"
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </button>
                            )}

                            <button 
                              onClick={() => setShowImportModal(true)}
                              className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              IMPORT
                            </button>

                            <ExportButton onClick={exportPeerTutors} />
                          </>
                        ) : (
                          <>
                            <button
                              onClick={handleBulkDeletePeerTutors}
                              disabled={selectedPeerTutorIds.size === 0}
                              className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors duration-200"
                            >
                              Delete Selected ({selectedPeerTutorIds.size})
                            </button>
                            <button
                              onClick={handlePeerTutorDeleteModeToggle}
                              className="px-4 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium transition-colors duration-200"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-white">
                        <tr>
                          {isPeerTutorDeleteMode && (
                            <th className="px-6 py-3 text-left">
                              <input
                                type="checkbox"
                                checked={selectedPeerTutorIds.size === peerTutorsWithStats.length && peerTutorsWithStats.length > 0}
                                onChange={handleSelectAllPeerTutors}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                              />
                            </th>
                          )}
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Peer Tutor
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Year & Section
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Classes Allocated
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Completed
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Pending
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Additional
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Students
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {statsLoading ? (
                          <tr>
                            <td colSpan={isPeerTutorDeleteMode ? 9 : 8} className="px-6 py-8 text-center text-gray-500">
                              <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                                Loading peer tutor statistics...
                              </div>
                            </td>
                          </tr>
                        ) : peerTutorsWithStats.length === 0 ? (
                          <tr>
                            <td colSpan={isPeerTutorDeleteMode ? 9 : 8} className="px-6 py-8 text-center text-gray-500">
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
                            <tr key={tutor.id} className="hover:bg-gray-50 transition-colors duration-150">
                              {isPeerTutorDeleteMode && (
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={selectedPeerTutorIds.has(tutor.id)}
                                    onChange={() => handlePeerTutorSelect(tutor.id)}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                  />
                                </td>
                              )}
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    <div className="h-10 w-10 rounded-full bg-black border border-gray-800 flex items-center justify-center ring-1 ring-gray-900 shadow-inner">
                                      <span className="text-gray-400 font-bold text-sm tracking-tighter">
                                        {tutor.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="ml-4">
                                    {!isPeerTutorDeleteMode ? (
                                      <button
                                        onClick={() => handleViewPeerTutor(tutor.id)}
                                        className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors text-left"
                                      >
                                        {tutor.name}
                                      </button>
                                    ) : (
                                      <div className="text-sm font-medium text-gray-900">
                                        {tutor.name}
                                      </div>
                                    )}
                                    <div className="text-sm text-gray-500">{tutor.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-medium text-gray-900">{tutor.year.replace('Year', '').trim()} - {tutor.section.replace('Section', '').trim()}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-bold text-gray-900">
                                  {tutor.classStats.totalClasses}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-bold text-gray-900">
                                  {tutor.classStats.completedClasses}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-bold text-gray-900">
                                  {tutor.classStats.pendingClasses}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-bold text-gray-900">
                                  {tutor.additionalClassesCount || 0}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-bold text-gray-900">
                                  {peerTutorStudentCounts[tutor.id] || 0}
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
                {/* Student Stats Overview - Clean White Design */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                  {/* Students Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Students
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13.5 9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {students.length}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-blue-600">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        <span className="font-semibold uppercase">Total</span>
                      </div>
                    </div>
                  </div>

                  {/* Assigned Students Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Assigned
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {assignedStudentCount}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-green-600">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-semibold uppercase">With Tutors</span>
                      </div>
                    </div>
                  </div>

                  {/* Unassigned Students Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Unassigned
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {unassignedStudentCount}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-orange-600">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-semibold uppercase">Pending</span>
                      </div>
                    </div>
                  </div>

                  {/* Years Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Years
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {availableStudentYears.length}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-blue-600">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        <span className="font-semibold uppercase">Active</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Students Table */}
                <div className="bg-white shadow-sm rounded-lg border border-gray-200">
                  {/* Header with Title and Actions */}
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <h3 className="text-base font-bold text-gray-700 uppercase tracking-wide">
                        Students ({filteredStudents.length})
                        {hasActiveStudentFilters && (
                          <span className="ml-2 text-sm text-blue-600 normal-case">
                            (Filtered)
                          </span>
                        )}
                      </h3>
                      
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Search Icon */}
                        <button
                          className="p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors duration-200"
                          title="Search"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </button>

                        {/* Filter Button */}
                        {!isStudentDeleteMode && (
                          <div className="relative" ref={studentFilterRef}>
                            <button
                              onClick={() => setShowStudentFilterPopup(!showStudentFilterPopup)}
                              className={`p-2.5 rounded-lg transition-colors duration-200 ${
                                hasActiveStudentFilters
                                  ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
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
                                      className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors duration-200"
                                    >
                                      Clear
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
                                      disabled={selectedStudentYear === 'all'}
                                      className={`block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                                        selectedStudentYear === 'all' ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''
                                      }`}
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
                        )}

                        {/* Action Buttons */}
                        {!isStudentDeleteMode ? (
                          <>
                            <button className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium transition-colors duration-200 flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              ADD
                            </button>
                            
                            <button className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors duration-200 flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              ASSIGN
                            </button>

                            {students.length > 0 && (
                              <button
                                onClick={handleStudentDeleteModeToggle}
                                className="p-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors duration-200"
                                title="Delete"
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}

                            <button className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors duration-200 flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              IMPORT
                            </button>

                            {filteredStudents.length > 0 && (
                              <button
                                onClick={exportStudents}
                                className="px-4 py-2.5 rounded-lg bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                </svg>
                                EXPORT
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              onClick={handleBulkDeleteStudents}
                              disabled={selectedStudentIds.size === 0}
                              className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors duration-200"
                            >
                              Delete Selected ({selectedStudentIds.size})
                            </button>
                            <button
                              onClick={handleStudentDeleteModeToggle}
                              className="px-4 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium transition-colors duration-200"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-white">
                        <tr>
                          {isStudentDeleteMode && (
                            <th className="px-6 py-3 text-left">
                              <input
                                type="checkbox"
                                checked={selectedStudentIds.size === filteredStudents.length && filteredStudents.length > 0}
                                onChange={handleSelectAllStudents}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                              />
                            </th>
                          )}
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Student
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Year & Section
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Assigned Peer Tutor
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredStudents.length === 0 ? (
                          <tr>
                            <td colSpan={isStudentDeleteMode ? 5 : 4} className="px-6 py-8 text-center text-gray-500">
                              <div className="flex flex-col items-center">
                                <svg className="h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13.5 9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
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
                            <tr key={student.id} className="hover:bg-gray-50 transition-colors duration-150">
                              {isStudentDeleteMode && (
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={selectedStudentIds.has(student.id)}
                                    onChange={() => handleStudentSelect(student.id)}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                  />
                                </td>
                              )}
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 shadow-sm">
                                      <span className="text-slate-700 font-bold text-sm tracking-tighter">
                                        {student.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
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
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-medium text-gray-900">{student.year.replace('Year', '').trim()} - {student.section.replace('Section', '').trim()}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                {student.assigned_peer_tutor ? (
                                  <div className="text-sm font-medium text-gray-900">
                                    {student.assigned_peer_tutor.name}
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-500 italic">
                                    Not assigned
                                  </div>
                                )}
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
                {/* Show Analytics View if a form is selected, otherwise show Forms List */}
                {selectedFeedbackFormForAnalytics ? (
                  <>
                    {/* Breadcrumb Navigation */}
                    <div className="mb-6">
                      <nav className="flex items-center space-x-2 text-sm text-gray-500">
                        <button
                          onClick={() => setSelectedFeedbackFormForAnalytics(null)}
                          className="hover:text-gray-700 transition-colors"
                        >
                          Feedback
                        </button>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-900 font-medium">{selectedFeedbackFormForAnalytics.name}</span>
                      </nav>
                    </div>
                    <FeedbackAnalyticsPage form={selectedFeedbackFormForAnalytics} />
                  </>
                ) : (
                  <>
                    {/* Feedback Stats Overview - Clean White Design */}
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-3 mb-6">
                      {/* Total Forms Card */}
                      <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Total Forms
                            </div>
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="text-3xl font-bold text-gray-900">
                            {feedbackForms.length}
                          </div>
                          <div className="mt-2 flex items-center text-xs text-blue-600">
                            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="font-semibold uppercase">Created</span>
                          </div>
                        </div>
                      </div>

                      {/* Active Forms Card */}
                      <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Active Forms
                            </div>
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="text-3xl font-bold text-gray-900">
                            {feedbackForms.filter(form => form.is_active).length}
                          </div>
                          <div className="mt-2 flex items-center text-xs text-yellow-600">
                            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-semibold uppercase">Pending</span>
                          </div>
                        </div>
                      </div>

                      {/* Total Responses Card */}
                      <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Total Responses
                            </div>
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                          </div>
                          <div className="text-3xl font-bold text-gray-900">
                            {feedbackForms.reduce((total, form) => total + (form as FeedbackForm & { responseCount: number }).responseCount || 0, 0)}
                          </div>
                          <div className="mt-2 flex items-center text-xs text-green-600">
                            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="font-semibold uppercase">Received</span>
                          </div>
                        </div>
                      </div>
                    </div>

                {/* Feedback Forms Table */}
                <div className="bg-white shadow-sm rounded-lg border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <h3 className="text-base font-bold text-gray-700 uppercase tracking-wide">
                        Feedback Forms ({feedbackForms.length})
                      </h3>
                      <div className="flex items-center gap-3 flex-wrap">
                      <button
                              onClick={() => {
                                setSelectedFeedbackForm(null)
                                setShowFeedbackModal(true)
                              }}
                              className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              CREATE
                            </button>
                        {isFeedbackDeleteMode && (
                          <>
                            <button
                              onClick={handleCancelFeedbackDeleteMode}
                              className="px-4 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium transition-colors duration-200"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleDeleteSelectedFeedbackForms}
                              disabled={selectedFeedbackFormIds.size === 0}
                              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-2 ${
                                selectedFeedbackFormIds.size > 0
                                  ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                                  : 'bg-gray-400 text-white cursor-not-allowed'
                              }`}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete Selected {selectedFeedbackFormIds.size > 0 && `(${selectedFeedbackFormIds.size})`}
                            </button>
                          </>
                        )}
                        {!isFeedbackDeleteMode && (
                          <>
                            {feedbackForms.length > 0 && (
                              <button
                                onClick={handleToggleFeedbackDeleteMode}
                                className="p-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors duration-200"
                                title="Delete"
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-white">
                        <tr>
                          {isFeedbackDeleteMode && (
                            <th className="px-6 py-3 text-left">
                              <input
                                type="checkbox"
                                checked={selectedFeedbackFormIds.size === feedbackForms.length && feedbackForms.length > 0}
                                onChange={(e) => handleSelectAllFeedbackForms(e.target.checked)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                              />
                            </th>
                          )}
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Form Name
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                            No of Fields
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total Response
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Delta Score
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          {!isFeedbackDeleteMode && (
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {feedbackLoading ? (
                          <tr>
                            <td colSpan={isFeedbackDeleteMode ? 8 : 7} className="px-6 py-8 text-center text-gray-500">
                              <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                                Loading feedback forms...
                              </div>
                            </td>
                          </tr>
                        ) : feedbackForms.length === 0 ? (
                          <tr>
                            <td colSpan={isFeedbackDeleteMode ? 8 : 7} className="px-6 py-8 text-center text-gray-500">
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
                          feedbackForms.map((form) => {
                            const responseCount = (form as FeedbackForm & { responseCount: number }).responseCount || 0
                            const totalEligibleStudents = (form as FeedbackForm & { totalEligibleStudents: number }).totalEligibleStudents || 0
                            const deltaScore = (form as FeedbackForm & { deltaScore: number }).deltaScore || 0
                            const hasResponses = responseCount > 0
                            const isSelected = selectedFeedbackFormIds.has(form.id)

                            return (
                              <tr 
                                key={form.id} 
                                className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                              >
                                {isFeedbackDeleteMode && (
                                  <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        e.stopPropagation()
                                        handleFeedbackFormCheckboxChange(form.id, e.target.checked)
                                      }}
                                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                                    />
                                  </td>
                                )}
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-medium text-gray-900">{form.name}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {form.questions.length}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {responseCount}/{totalEligibleStudents}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                                  {new Date(form.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold">
                                  {responseCount > 0 ? (
                                    <span className={deltaScore >= 0 ? 'text-green-600' : 'text-red-600'}>
                                      {deltaScore > 0 ? '+' : ''}{deltaScore.toFixed(1)}%
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">N/A</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                    form.is_active
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {form.is_active ? 'OPEN' : 'CLOSED'}
                                  </span>
                                </td>
                                {!isFeedbackDeleteMode && (
                                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                    <div className="flex items-center justify-center space-x-2">
                                      <button
                                        onClick={() => handleViewAnalytics(form)}
                                        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                                      >
                                        VIEW
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (hasResponses) {
                                            alert('This form cannot be edited as responses are already being received.')
                                            return
                                          }
                                          setSelectedFeedbackForm(form)
                                          setShowFeedbackModal(true)
                                        }}
                                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                                      >
                                        <Edit className="h-4 w-4 mr-1.5 text-gray-600" />
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => handleToggleFormStatus(form.id, form.is_active)}
                                        className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                                          form.is_active
                                            ? 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                                            : 'text-white bg-green-600 hover:bg-green-700 border border-green-600'
                                        }`}
                                        title={form.is_active ? 'Close form' : 'Open form'}
                                      >
                                        {form.is_active ? (
                                          <>
                                            <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                            </svg>
                                            Close
                                          </>
                                        ) : (
                                          <>
                                            <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Open
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                </>
                )}
              </>
            ) : activeTab === 'reports' ? (
              <div className="space-y-6">
                {selectedReport ? (
                  // Inline Report View
                  <div className="space-y-6">
                    {/* Breadcrumb Header */}
                    <div className="bg-white shadow rounded-lg p-4">
                      <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                        <button
                          onClick={handleBackFromReport}
                          className="hover:text-gray-700 transition-colors"
                        >
                          Peer Tutor Reports
                        </button>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-700">{selectedReport.tutorName}</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-900 font-medium">{selectedReport.subjectName}</span>
                      </nav>
                      <h2 className="text-2xl font-bold text-gray-900">
                        {selectedReport.subjectName} - {selectedReport.tutorName}
                      </h2>
                    </div>

                    {/* Stats Overview - Clean White Design */}
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-3 mb-6">
                      {/* Total Classes Card */}
                      <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Total Classes
                            </div>
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div className="text-3xl font-bold text-gray-900">
                            {reportScheduledClasses.length}
                          </div>
                          <div className="mt-2 flex items-center text-xs text-blue-600">
                            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-semibold uppercase">Scheduled</span>
                          </div>
                        </div>
                      </div>

                      {/* Completed Classes Card */}
                      <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Completed Classes
                            </div>
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="text-3xl font-bold text-gray-900">
                            {reportScheduledClasses.filter(cls => 
                              cls.completion_status === 'completed' || 
                              (cls.attendance_completed && cls.topics_completed)
                            ).length}
                          </div>
                          <div className="mt-2 flex items-center text-xs text-green-600">
                            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="font-semibold uppercase">Finished</span>
                          </div>
                        </div>
                      </div>

                      {/* Pending Classes Card */}
                      <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Pending Classes
                            </div>
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="text-3xl font-bold text-gray-900">
                            {reportScheduledClasses.filter(cls => 
                              cls.completion_status !== 'completed' && 
                              !(cls.attendance_completed && cls.topics_completed)
                            ).length}
                          </div>
                          <div className="mt-2 flex items-center text-xs text-yellow-600">
                            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-semibold uppercase">Pending</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Scheduled Classes Table */}
                    <div className="bg-white shadow-sm rounded-lg border border-gray-200">
                      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                        <h3 className="text-base font-bold text-gray-700 uppercase tracking-wide">
                          Scheduled Classes ({reportScheduledClasses.length})
                        </h3>
                      </div>

                      <div className="overflow-hidden">
                        {reportLoading ? (
                          <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                          </div>
                        ) : reportScheduledClasses.length === 0 ? (
                          <div className="text-center py-12">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">No scheduled classes found</h3>
                            <p className="text-gray-500">No classes have been scheduled for this subject yet.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-white">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Subject
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Assigned Date
                                  </th>
                                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Attendance
                                  </th>
                                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {reportScheduledClasses.map((scheduledClass) => {
                                  const isPresent = scheduledClass.completion_status === 'completed' || 
                                                   (scheduledClass.attendance_completed && scheduledClass.topics_completed)
                                  return (
                                    <tr key={scheduledClass.id} className="hover:bg-gray-50">
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">
                                          {scheduledClass.class?.subject_name || 'Unknown Subject'}
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">
                                          {new Date(scheduledClass.scheduled_date).toLocaleDateString()}
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-center">
                                        {isPresent ? (
                                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                            Present
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                            Absent
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                        <button
                                          onClick={() => {
                                            if (isPresent) {
                                              handleClassClick(scheduledClass)
                                            }
                                          }}
                                          disabled={!isPresent}
                                          className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                            isPresent
                                              ? 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer'
                                              : 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed opacity-50'
                                          }`}
                                        >
                                          <Eye className={`h-4 w-4 ${isPresent ? 'text-gray-600' : 'text-gray-400'}`} />
                                        </button>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Reports List View
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">PEER TUTOR REPORTS</h2>
                        <p className="text-gray-600 mt-1">View attendance reports and export data for peer tutors</p>
                      </div>
                    </div>

                {/* Peer Tutor Reports */}
                <div className="bg-white shadow-sm rounded-lg border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <h3 className="text-base font-bold text-gray-700 uppercase tracking-wide">
                        Peer Tutor Reports ({filteredPeerTutorReports.length})
                      </h3>
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Filter Bar Redesign */}
                        <div className="flex items-center gap-2">
                          {/* Year Dropdown */}
                          <div className="relative">
                            <select
                              value={reportFilterYear}
                              onChange={(e) => setReportFilterYear(e.target.value)}
                              className={`h-11 px-4 pr-10 rounded-xl border appearance-none transition-all duration-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                reportFilterYear !== 'all' 
                                  ? 'border-blue-500 bg-blue-50/30 text-blue-700 shadow-sm' 
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              <option value="all">All Years</option>
                              {availableReportYears.map(year => (
                                <option key={year} value={year}>{year}</option>
                              ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>

                          {/* Section Dropdown */}
                          <div className="relative">
                            <select
                              value={reportFilterSection}
                              onChange={(e) => setReportFilterSection(e.target.value)}
                              disabled={reportFilterYear === 'all'}
                              className={`h-11 px-4 pr-10 rounded-xl border appearance-none transition-all duration-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                reportFilterYear === 'all'
                                  ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                                  : reportFilterSection !== 'all'
                                    ? 'border-blue-500 bg-blue-50/30 text-blue-700 shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              <option value="all">All Sections</option>
                              {availableReportSections.map(section => (
                                <option key={section} value={section}>{section}</option>
                              ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>

                          {/* Subject Dropdown */}
                          <div className="relative">
                            <select
                              value={reportFilterSubject}
                              onChange={(e) => setReportFilterSubject(e.target.value)}
                              className={`h-11 px-4 pr-10 rounded-xl border appearance-none transition-all duration-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                reportFilterSubject !== 'all'
                                  ? 'border-blue-500 bg-blue-50/30 text-blue-700 shadow-sm'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              <option value="all">All Subjects</option>
                              {availableReportSubjects.map(subject => (
                                <option key={subject} value={subject}>{subject}</option>
                              ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>

                        {/* Reset Filters - shown as a clear text button if filters are active */}
                        {hasActiveReportFilters && (
                          <button
                            onClick={clearReportFilters}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors px-2"
                          >
                            CLEAR FILTERS
                          </button>
                        )}
                      </div>
                      {/* Export Button - Only show if there are records */}
                      {filteredPeerTutorReports.length > 0 && (
                        <ExportButton onClick={handleExportFilteredReports} />
                      )}
                    </div>
                  </div>

                  <div className="overflow-hidden">
                    {reportsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : filteredPeerTutorReports.length === 0 ? (
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
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-white">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                                Peer Tutor Name
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                                Email
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                                Year/Section
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Subject
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Total Classes
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Completed Classes
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Pending Classes
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Additional Classes
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {filteredPeerTutorReports.map((report) => {
                              // If no subjects, show one row with peer tutor info
                              if (report.subjects.length === 0) {
                                return (
                                  <tr key={`${report.peer_tutor_id}-no-subjects`} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                                      <div className="text-sm font-medium text-gray-900">{report.peer_tutor_name}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                                      <div className="text-sm text-gray-500">{report.peer_tutor_email}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        {report.year} - {report.section}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                      No subjects assigned
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">-</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">-</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">-</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">-</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                      <span className="text-gray-400">-</span>
                                    </td>
                                  </tr>
                                )
                              }
                              
                              // Otherwise, show one row per subject
                              return report.subjects.map((subject, subjectIndex) => (
                                <tr key={`${report.peer_tutor_id}-${subject.class_id}`} className="hover:bg-gray-50">
                                  {subjectIndex === 0 && (
                                    <>
                                      <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200" rowSpan={report.subjects.length}>
                                        <div className="text-sm font-medium text-gray-900">{report.peer_tutor_name}</div>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200" rowSpan={report.subjects.length}>
                                        <div className="text-sm text-gray-500">{report.peer_tutor_email}</div>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200" rowSpan={report.subjects.length}>
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                          {report.year} - {report.section}
                                        </span>
                                      </td>
                                    </>
                                  )}
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{subject.subject_name}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="text-sm font-semibold text-gray-900">{subject.total_classes}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="text-sm font-semibold text-gray-900">{subject.completed_classes}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="text-sm font-semibold text-gray-900">{subject.pending_classes}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="text-sm font-semibold text-gray-900">{subject.additional_classes || 0}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                    <button
                                      onClick={() => handleViewReport(report.peer_tutor_id, subject.class_id, report.peer_tutor_name, subject.subject_name)}
                                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                                    >
                                      <Eye className="h-4 w-4 text-gray-600" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
                  </>
                )}
              </div>
            ) : activeTab === 'leaderboard' ? (
              <div className="space-y-6">
                {/* Leaderboard Header */}
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">LEADERBOARD</h2>
                      <p className="text-sm text-gray-500 mt-1">Peer Tutor Rankings</p>
                    </div>
                    <button
                      onClick={handleRefresh}
                      disabled={loading}
                      className="flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Refresh leaderboard"
                    >
                      <svg className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                  </div>
                </div>

                {/* Prepare ranked peer tutors with apex scores */}
                {(() => {
                  // Create array with apex scores (currently all 0, will be updated later)
                  const rankedPeerTutors = peerTutors.map(tutor => ({
                    ...tutor,
                    apexScore: 0 // Will be calculated later
                  }))
                  
                  // Sort by apex score (descending), then by name for ties
                  rankedPeerTutors.sort((a, b) => {
                    if (b.apexScore !== a.apexScore) {
                      return b.apexScore - a.apexScore
                    }
                    return a.name.localeCompare(b.name)
                  })

                  return (
                    <>
                      {/* Top 3 Podium */}
                      {rankedPeerTutors.length >= 3 ? (
                        <div className="bg-white shadow rounded-lg p-8">
                          <h3 className="text-xl font-semibold text-gray-900 mb-6 text-center">Top Performers</h3>
                          <div className="flex items-end justify-center gap-4 max-w-4xl mx-auto">
                            {/* Rank 2 - Left */}
                            <div className="flex-1 flex flex-col items-center">
                              <div className="w-full bg-gradient-to-b from-gray-300 to-gray-400 rounded-t-lg p-6 shadow-lg mb-4 min-h-[200px] flex flex-col items-center justify-end">
                                <div className="text-6xl font-bold text-white mb-2">2</div>
                                <div className="text-lg font-semibold text-white text-center break-words">
                                  {rankedPeerTutors[1]?.name || 'N/A'}
                                </div>
                              </div>
                            </div>

                            {/* Rank 1 - Center */}
                            <div className="flex-1 flex flex-col items-center">
                              <div className="w-full bg-gradient-to-b from-yellow-400 to-yellow-600 rounded-t-lg p-8 shadow-xl mb-4 min-h-[250px] flex flex-col items-center justify-end relative">
                                <div className="absolute top-2 right-2">
                                  <svg className="w-8 h-8 text-yellow-200" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                </div>
                                <div className="text-7xl font-bold text-white mb-2">1</div>
                                <div className="text-xl font-bold text-white text-center break-words">
                                  {rankedPeerTutors[0]?.name || 'N/A'}
                                </div>
                              </div>
                            </div>

                            {/* Rank 3 - Right */}
                            <div className="flex-1 flex flex-col items-center">
                              <div className="w-full bg-gradient-to-b from-orange-300 to-orange-500 rounded-t-lg p-6 shadow-lg mb-4 min-h-[180px] flex flex-col items-center justify-end">
                                <div className="text-5xl font-bold text-white mb-2">3</div>
                                <div className="text-lg font-semibold text-white text-center break-words">
                                  {rankedPeerTutors[2]?.name || 'N/A'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white shadow rounded-lg p-8">
                          <div className="text-center py-12">
                            <p className="text-gray-500">Not enough peer tutors to display leaderboard. Need at least 3 peer tutors.</p>
                          </div>
                        </div>
                      )}

                      {/* Table for Ranks 4+ */}
                      {rankedPeerTutors.length > 3 && (
                        <div className="bg-white shadow rounded-lg">
                          <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-medium text-gray-900">
                              All Rankings ({rankedPeerTutors.length - 3} peer tutors)
                            </h3>
                          </div>
                          <div className="overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Rank
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Peer Tutor Name
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Email
                                  </th>
                                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Apex
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {rankedPeerTutors.slice(3).map((tutor, index) => (
                                  <tr key={tutor.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm font-medium text-gray-900">{index + 4}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="flex items-center">
                                        <div className="flex-shrink-0 h-10 w-10">
                                          <div className="h-10 w-10 rounded-full bg-black border border-gray-800 flex items-center justify-center ring-1 ring-gray-900 shadow-inner">
                                            <span className="text-gray-400 font-bold text-sm tracking-tighter">
                                              {tutor.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="ml-4">
                                          <div className="text-sm font-medium text-gray-900">
                                            {tutor.name}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm text-gray-500">{tutor.email}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <div className="text-sm font-semibold text-gray-900">{tutor.apexScore}</div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            ) : (
              /* Renumeration Management Tab */
              <div className="space-y-6">
                {/* Header with breadcrumb navigation */}
                <div className="flex items-center justify-between -mt-3">
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
                      </div>
                    )}
                  </div>
                </div>

                {/* Renumeration Stats - Clean White Design */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-3 mb-6">
                  {/* Total Templates/Submissions Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {renumerationView === 'submissions' ? 'Submissions' : 'Total Templates'}
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {renumerationView === 'submissions' ? filteredAndSortedSubmissions.length : renumerationTemplates.length}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-blue-600">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-semibold uppercase">Information</span>
                      </div>
                    </div>
                  </div>

                  {/* Pending Review Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Pending Review
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {renumerationView === 'submissions' 
                          ? filteredAndSortedSubmissions.filter(s => !!s.submitted_at).length
                          : renumerationSubmissions.filter(s => !!s.submitted_at).length
                        }
                      </div>
                      <div className="mt-2 flex items-center text-xs text-yellow-600">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-semibold uppercase">Pending</span>
                      </div>
                    </div>
                  </div>

                  {/* Total Response Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Total Response
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {renumerationView === 'submissions' 
                          ? filteredAndSortedSubmissions.length
                          : renumerationTemplates.reduce((total, template) => {
                              const submissionCount = renumerationSubmissions.filter(
                                (submission: { template_id: string }) => submission.template_id === template.id
                              ).length
                              return total + submissionCount
                            }, 0)
                        }
                      </div>
                      <div className="mt-2 flex items-center text-xs text-green-600">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-semibold uppercase">Collected</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Templates View */}
                {renumerationView === 'templates' && (
                  <div className="bg-white shadow-sm rounded-lg border border-gray-200">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <h3 className="text-base font-bold text-gray-700 uppercase tracking-wide">
                          Renumeration Templates ({renumerationTemplates.length})
                        </h3>
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            onClick={() => setShowRenumerationModal(true)}
                            className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            CREATE
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-0">
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
                          <p className="text-sm text-gray-500">Create your first renumeration template to get started.</p>
                        </div>
                      ) : (
                        <div className="overflow-hidden">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-white">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                  Template Name
                                </th>
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                  No of Fields
                                </th>
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                  Total Responses
                                </th>
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                  Status
                                </th>
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                  Created Date
                                </th>
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {renumerationTemplates.map((template) => {
                                const submissionCount = renumerationSubmissions.filter(
                                  (submission: { template_id: string }) => submission.template_id === template.id
                                ).length
                                const totalEligiblePeerTutors = peerTutors.length

                                return (
                                  <tr key={template.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm font-medium text-gray-900">{template.name}</div>
                                      {template.description && (
                                        <div className="text-sm text-gray-500 max-w-xs truncate mt-1">
                                          {template.description}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <div className="text-sm font-semibold text-gray-900">
                                        {template.fields.length}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <div className="text-sm font-semibold text-gray-900">
                                        {submissionCount}/{totalEligiblePeerTutors}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                                      <select
                                        className="border border-gray-300 rounded-md px-2 py-1 text-sm mx-auto"
                                        value={template.is_active ? 'open' : 'closed'}
                                        onChange={(e) => handleTemplateStatusChange(template.id, e.target.value === 'open')}
                                      >
                                        <option value="open">Open</option>
                                        <option value="closed">Closed</option>
                                      </select>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                                      {new Date(template.created_at).toLocaleDateString('en-GB', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric'
                                      })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                      <button
                                        onClick={() => handleTemplateClick(template)}
                                        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                                      >
                                        VIEW
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Template Submissions View */}
                {renumerationView === 'submissions' && (
                  <div className="bg-white shadow-sm rounded-lg border border-gray-200">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <h3 className="text-base font-bold text-gray-700 uppercase tracking-wide">
                          {selectedTemplate?.name} Submissions ({filteredAndSortedSubmissions.length})
                        </h3>
                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Filter button */}
                          <button
                            onClick={() => setShowSubmissionFilter(s => !s)}
                            className={`p-2.5 rounded-lg border transition-colors duration-200 ${
                              showSubmissionFilter ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}
                            title="Filter submissions"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 01.8 1.6l-5.2 7.28a2 2 0 00-.4 1.2V19l-4 2v-6.92a2 2 0 00-.4-1.2L3.2 4.6A1 1 0 013 4z" />
                            </svg>
                          </button>

                          {filteredAndSortedSubmissions.length > 0 && (
                            <button
                              onClick={exportToExcel}
                              className="px-4 py-2.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              EXPORT
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                          {/* Popup */}
                          {showSubmissionFilter && (
                            <div ref={submissionFilterRef} className="absolute right-6 mt-40 z-20 w-80 rounded-lg border bg-white shadow-lg">
                              <div className="p-4">
                                <h4 className="text-base font-semibold text-gray-900 mb-3">Filter Submissions</h4>
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-sm text-gray-700 mb-1">Year</label>
                                    <select className="w-full border rounded-md px-2 py-2 text-sm" value={filterYear} onChange={(e)=>setFilterYear(e.target.value)}>
                                      <option value="">All Years</option>
                                      <option value="I">I</option>
                                      <option value="II">II</option>
                                      <option value="III">III</option>
                                      <option value="IV">IV</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-sm text-gray-700 mb-1">Section</label>
                                    <select className="w-full border rounded-md px-2 py-2 text-sm" value={filterSection} onChange={(e)=>setFilterSection(e.target.value)}>
                                      <option value="">All Sections</option>
                                      <option value="A">A</option>
                                      <option value="B">B</option>
                                      <option value="C">C</option>
                                      <option value="D">D</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-sm text-gray-700 mb-1">Status</label>
                                    <select className="w-full border rounded-md px-2 py-2 text-sm" value={filterStatus} onChange={(e)=>setFilterStatus(e.target.value)}>
                                      <option value="">All</option>
                                      <option value="pending">Pending</option>
                                      <option value="completed">Completed</option>
                                    </select>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <button
                                      onClick={()=>setSortDescByName(s=>!s)}
                                      className="px-3 py-2 border rounded-md text-sm hover:bg-gray-50"
                                      title="Toggle name sort (desc)"
                                    >
                                      {sortDescByName ? 'Name ↓' : 'Name (no sort)'}
                                    </button>
                                    <div className="space-x-2">
                                      <button onClick={() => { setFilterYear(''); setFilterSection(''); setFilterStatus(''); setSortDescByName(false); }} className="px-3 py-2 text-sm text-gray-700 hover:underline">Clear</button>
                                      <button onClick={() => setShowSubmissionFilter(false)} className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">Apply</button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                    <div className="overflow-x-auto">
                      {renumerationLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                      ) : filteredAndSortedSubmissions.length > 0 ? (
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-white">
                            <tr>
                              <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Peer Tutor
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Status
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Submitted
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {filteredAndSortedSubmissions.map((submission) => (
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
                                  {submission.submitted_at ? (
                                    <span className="text-sm text-gray-900">Completed</span>
                                  ) : (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                      Pending
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                                  {submission.submitted_at 
                                    ? new Date(submission.submitted_at).toLocaleDateString()
                                    : 'Not submitted'
                                  }
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                  <div className="flex items-center justify-center space-x-2">
                                    <button
                                      onClick={() => {
                                        setSelectedSubmission(submission)
                                        setShowDetailsModal(true)
                                      }}
                                      className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                                    >
                                      VIEW
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
          responses={[]}
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

      {/* Class Details Modal */}
      {showClassModal && selectedClass && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Class Details - {selectedClass.subject_name}
                </h3>
                <button
                  onClick={() => {
                    setShowClassModal(false)
                    setSelectedClass(null)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-medium">{new Date(selectedClass.scheduled_date).toLocaleDateString()}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-500">Present</p>
                    <p className="font-medium text-green-600">{selectedClass.present_count}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-500">Absent</p>
                    <p className="font-medium text-red-600">{selectedClass.absent_count}</p>
                  </div>
                </div>

                {selectedClass.topics && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-500 mb-1">Topics Taught</p>
                    <p className="font-medium">{selectedClass.topics}</p>
                  </div>
                )}

                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-3">Attendance Records</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Student Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Email
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedClass.attendance_records.map((record) => (
                          <tr key={record.student_id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {record.student_name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {record.student_email}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                record.status === 'present' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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


      {/* Peer Tutor Import Modal */}
      {showImportModal && (
        <PeerTutorImportModal
          dept={user?.user_metadata?.dept || 'AIDS'}
          year={selectedYear !== 'all' ? selectedYear : ''}
          section={selectedSection !== 'all' ? selectedSection : ''}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            handleRefresh()
            setShowImportModal(false)
          }}
        />
      )}
    </div>
  )
}
