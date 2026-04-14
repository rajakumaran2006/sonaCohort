'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import DeleteConfirmationModal from '@/components/forms/modals/DeleteConfirmationModal'
import * as XLSX from 'xlsx'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import { peertutorservice, peertutors } from '@/lib/services/peerTutorService'
import { StudentService, StudentWithpeertutors } from '@/lib/services/studentService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { RenumerationService, RenumerationTemplate, peertutorsRenumeration } from '@/lib/services/renumerationService'
import { FeedbackService, FeedbackForm } from '@/lib/services/feedbackService'
import { FeedbackAnalyticsService } from '@/lib/services/feedbackAnalyticsService'
import { ReportService, peertutorsReportData, ClassAttendanceReport } from '@/lib/services/reportService'
import { ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import { AttendanceService } from '@/lib/services/attendanceService'
import { ExamSummaryService, ExamPeerTutorSummary } from '@/lib/services/examSummaryService'
import RenumerationModal from '@/components/forms/modals/RenumerationModal'
import RenumerationDetailsModal from '@/components/forms/modals/RenumerationDetailsModal'
import FeedbackFormModal from '@/components/forms/feedback/FeedbackFormModal'
import FeedbackResponsesModal from '@/components/forms/feedback/FeedbackResponsesModal'
import FeedbackAnalyticsPage from '@/components/forms/feedback/FeedbackAnalyticsPage'
import ExcelExportModal from '@/components/forms/import-export/ExcelExportModal'
import PeerTutorImportModal from '@/components/forms/import-export/PeerTutorImportModal'
import PeerTutorsPageSkeleton from '@/components/skeletons/PeerTutorPageSkeleton'
import FeedbackFormsSkeleton from '@/components/skeletons/FeedbackFormsSkeleton'
import RenumerationTemplatesSkeleton from '@/components/skeletons/RenumerationTemplatesSkeleton'
import PeerTutorReportsSkeleton from '@/components/skeletons/PeerTutorReportsSkeleton'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Eye, X, Trash2 } from 'lucide-react'
import { SearchIcon } from '@/components/icons/SearchIcon'
import ExportButton from '@/components/ui/ExportButton'
import UserSelectionModal from '@/components/forms/modals/UserSelectionModal'
import EmailAssignmentModal from '@/components/forms/modals/EmailAssignmentModal'
import { isManualStudent } from '@/lib/utils/manualStudentUtils'
import { logger } from '@/lib/logger'
import { motion } from 'framer-motion'
import { Trophy, Crown, Medal, Settings } from 'lucide-react'
import LeaderboardScoringModal from '@/components/forms/modals/LeaderboardScoringModal'
import { LeaderboardConfigService, LeaderboardScoringConfig } from '@/lib/services/leaderboardConfigService'



export default function FacultypeertutorsPage() {
  return (
    <FacultyProtectedRoute>
      <FacultypeertutorsContent />
    </FacultyProtectedRoute>
  )
}

interface peertutorsWithStats extends peertutors {
  classStats: {
    totalClasses: number
    completedClasses: number
    pendingClasses: number
    upcomingClasses: number
    overdueClasses: number
  }
  additionalClassesCount: number
}

interface StudentWithStats extends StudentWithpeertutors {
  classStats: {
    totalClasses: number
    completedClasses: number
    pendingClasses?: number
    upcomingClasses?: number
    overdueClasses?: number
  }
  additionalClassesCount: number
}

interface SubmissionWithClasses extends peertutorsRenumeration {
  classesCompleted?: number
}

interface RankedItem {
  id: string;
  name: string;
  email: string;
  year: string;
  section: string;
  classStats: {
    totalClasses: number;
    completedClasses: number;
    pendingClasses?: number;
    upcomingClasses?: number;
    overdueClasses?: number;
  };
  additionalClassesCount: number;
  score: {
    finalScore: number;
    breakdown: {
      scheduledWeighted: number;
      additionalWeighted: number;
      examWeighted: number;
    };
  };
}


function FacultypeertutorsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Fetch department data
  const { data: department } = useQuery({
    queryKey: ['faculty-department', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await FacultyService.verifyFacultyAccess(user.email)
    },
    enabled: !!user?.email,
    staleTime: 10 * 60 * 1000,
  })
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Use custom hook for sidebar collapsed state (reads from localStorage synchronously)
  const [isSidebarCollapsed] = useSidebarCollapsed()
  const [peerTutor, setpeerTutor] = useState<peertutors[]>([])
  const [filteredpeerTutor, setFilteredpeerTutor] = useState<peertutors[]>([])
  const [peerTutorWithStats, setpeerTutorWithStats] = useState<peertutorsWithStats[]>([])
  const [students, setStudents] = useState<StudentWithpeertutors[]>([])
  const [filteredStudents, setFilteredStudents] = useState<StudentWithpeertutors[]>([])
  const [studentWithStats, setStudentWithStats] = useState<StudentWithStats[]>([])
  const [leaderboardTabType, setLeaderboardTabType] = useState<'peer' | 'student'>('peer')
  const [loading, setLoading] = useState(true)
  const [isManualRefresh, setIsManualRefresh] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [assignedCount, setAssignedCount] = useState(0)
  const [assignedStudentCount, setAssignedStudentCount] = useState(0)
  const [unassignedStudentCount, setUnassignedStudentCount] = useState(0)
  const [peerTutortudentCounts, setpeerTutortudentCounts] = useState<{ [key: string]: number }>({})

  // Filter states
  const [selectedYear, setSelectedYear] = useState<string>('all')
  const [selectedSection, setSelectedSection] = useState<string>('all')
  const [selectedStudentYear, setSelectedStudentYear] = useState<string>('all')
  const [selectedStudentSection, setSelectedStudentSection] = useState<string>('all')
  const [selectedpeertutors, setSelectedpeertutors] = useState<string>('all')
  const [showFilterPopup, setShowFilterPopup] = useState(false)
  const [showStudentFilterPopup, setShowStudentFilterPopup] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const studentFilterRef = useRef<HTMLDivElement>(null)

  // Search states
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [ispeerTutorearchExpanded, setIspeerTutorearchExpanded] = useState(false)
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('')
  const [isStudentSearchExpanded, setIsStudentSearchExpanded] = useState(false)
  const peerTutorearchRef = useRef<HTMLInputElement>(null)
  const studentSearchRef = useRef<HTMLInputElement>(null)

  // Renumeration states
  const [showRenumerationModal, setShowRenumerationModal] = useState(false)
  const [renumerationSubmissions, setRenumerationSubmissions] = useState<peertutorsRenumeration[]>([])
  const [renumerationLoading, setRenumerationLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'tutors' | 'students' | 'feedback' | 'renumeration' | 'reports' | 'leaderboard'>('tutors')

  // Handle tab from URL
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['tutors', 'students', 'feedback', 'renumeration', 'reports', 'leaderboard'].includes(tab)) {
      setActiveTab(tab as 'tutors' | 'students' | 'feedback' | 'renumeration' | 'reports' | 'leaderboard')
    }
  }, [searchParams])

  // Reset notification counts when visiting tabs
  useEffect(() => {
    if (activeTab === 'feedback') {
      localStorage.setItem('last_visited_feedback', Date.now().toString())
      // Trigger a storage event to update other components if needed
      window.dispatchEvent(new Event('storage'))
    } else if (activeTab === 'renumeration') {
      localStorage.setItem('last_visited_renumeration', Date.now().toString())
      window.dispatchEvent(new Event('storage'))
    }
  }, [activeTab])
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<peertutorsRenumeration | null>(null)

  // Template management states
  const [renumerationTemplates, setRenumerationTemplates] = useState<RenumerationTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<RenumerationTemplate | null>(null)
  const [renumerationView, setRenumerationView] = useState<'templates' | 'submissions'>('templates')
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [submissionsWithClasses, setSubmissionsWithClasses] = useState<SubmissionWithClasses[]>([])

  // Confirmation modal state



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
  const [ispeertutorsDeleteMode, setIspeertutorsDeleteMode] = useState(false)
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [selectedpeertutorsIds, setSelectedpeertutorsIds] = useState<Set<string>>(new Set())
  const [showAddStudentModal, setShowAddStudentModal] = useState(false)
  const [showAddPeerTutorModal, setShowAddPeerTutorModal] = useState(false)

  // Feedback states
  const [feedbackForms, setFeedbackForms] = useState<FeedbackForm[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [selectedFeedbackForm, setSelectedFeedbackForm] = useState<FeedbackForm | null>(null)

  const [showFeedbackResponsesModal, setShowFeedbackResponsesModal] = useState(false)
  const [selectedFeedbackFormForAnalytics, setSelectedFeedbackFormForAnalytics] = useState<FeedbackForm | null>(null)
  const [isFeedbackDeleteMode, setIsFeedbackDeleteMode] = useState(false)
  const [selectedFeedbackFormIds, setSelectedFeedbackFormIds] = useState<Set<string>>(new Set())

  // Renumeration Delete State
  const [isRenumerationDeleteMode, setIsRenumerationDeleteMode] = useState(false)
  const [selectedRenumerationTemplateIds, setSelectedRenumerationTemplateIds] = useState<Set<string>>(new Set())


  // Delete confirmation modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [itemsToDelete, setItemsToDelete] = useState<{ name: string, email?: string, additionalInfo?: string, originalId?: string }[]>([])
  const [deleteType, setDeleteType] = useState<'peer-tutors' | 'students' | 'renumeration-templates' | 'feedback-forms'>('peer-tutors')
  const [isDeleting, setIsDeleting] = useState(false)







  // Reports states
  const [peertutorsReports, setpeertutorsReports] = useState<peertutorsReportData[]>([])
  const [filteredpeertutorsReports, setFilteredpeertutorsReports] = useState<peertutorsReportData[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [reportFilterYear, setReportFilterYear] = useState<string>('all')
  const [reportFilterSection, setReportFilterSection] = useState<string>('all')
  const [reportFilterSubject, setReportFilterSubject] = useState<string>('all')


  // Inline report view states
  const [selectedReport, setSelectedReport] = useState<{ tutorId: string, subjectId: string, tutorName: string, subjectName: string } | null>(null)
  const [reportScheduledClasses, setReportScheduledClasses] = useState<ScheduledClassWithDetails[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [selectedClass, setSelectedClass] = useState<ClassAttendanceReport | null>(null)
  const [showClassModal, setShowClassModal] = useState(false)

  const [leaderboardFilterYear, setLeaderboardFilterYear] = useState('all')
  const [showScoringModal, setShowScoringModal] = useState(false)
  const [scoringConfig, setScoringConfig] = useState<LeaderboardScoringConfig>({
    department: '',
    scheduled_classes_weight: 100,
    additional_classes_weight: 0,
    exam_weight: 0,
    exam_config: [],
  })
  const [examSummariesMap, setExamSummariesMap] = useState<Record<string, ExamPeerTutorSummary[]>>({})

  // Load leaderboard scoring config and exam summaries when department is available
  useEffect(() => {
    const loadScoringConfig = async () => {
      if (!department?.name) return
      const config = await LeaderboardConfigService.getConfig(department.name)
      setScoringConfig(config)

      // If exam weight > 0, fetch exam summaries for included exams
      if (config.exam_weight > 0 && config.exam_config.length > 0) {
        const includedExams = config.exam_config.filter(e => e.included)
        const summariesMap: Record<string, ExamPeerTutorSummary[]> = {}
        await Promise.all(
          includedExams.map(async (examCfg) => {
            const summaries = await ExamSummaryService.getSummariesForExam(examCfg.exam_id)
            summariesMap[examCfg.exam_id] = summaries
          })
        )
        setExamSummariesMap(summariesMap)
      }
    }
    loadScoringConfig()
  }, [department?.name])

  // Email Assignment State
  const [selectedStudentForEmail, setSelectedStudentForEmail] = useState<StudentWithpeertutors | null>(null)

  const loadData = useCallback(async () => {
    if (!user?.id || !department?.name) return

    try {
      // Load peer tutors
      const tutors = await peertutorservice.getpeerTutorByDepartment(department.name)
      setpeerTutor(tutors)
      setFilteredpeerTutor(tutors)

      // Calculate assigned/unassigned counts for peer tutors
      const assignedTutors = tutors.filter(() => {
        // Check if this peer tutor has any assigned students
        // This would need to be implemented in the service
        return true // For now, assuming all are assigned
      })
      setAssignedCount(assignedTutors.length)

      // Load students with peer tutor information
      // Load students with peer tutor information
      const allStudents = await StudentService.getStudentsWithpeerTutorByDepartment(department.name)
      setStudents(allStudents)
      setFilteredStudents(allStudents)

      // Calculate assigned/unassigned counts for students
      const assignedStudents = allStudents.filter(student => student.assigned_peer_tutor)
      setAssignedStudentCount(assignedStudents.length)
      setUnassignedStudentCount(allStudents.length - assignedStudents.length)

      // Calculate student counts for each peer tutor
      const studentCounts: { [key: string]: number } = {}
      tutors.forEach(tutor => {
        const count = allStudents.filter(student => student.assigned_peer_tutor_id === tutor.id).length
        studentCounts[tutor.id] = count
      })
      setpeerTutortudentCounts(studentCounts)
    } catch (error) {
      logger.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id, department?.name]) // Added department dependency

  // Load peer tutors and students data with caching
  useEffect(() => {
    if (department?.name) {
      loadData()
    }
  }, [loadData, department?.name])

  // Handle refresh
  const handleRefresh = async () => {
    if (!user?.id || !department?.name) return
    setIsManualRefresh(true)
    setLoading(true)
    try {
      // Reload all data
      const tutors = await peertutorservice.getpeerTutorByDepartment(department.name)
      setpeerTutor(tutors)
      setFilteredpeerTutor(tutors)

      const allStudents = await StudentService.getStudentsWithpeerTutorByDepartment(department.name)
      setStudents(allStudents)
      setFilteredStudents(allStudents)

      // Recalculate counts
      const assignedTutors = tutors.filter(() => true)
      setAssignedCount(assignedTutors.length)

      const assignedStudents = allStudents.filter(student => student.assigned_peer_tutor)
      setAssignedStudentCount(assignedStudents.length)
      setUnassignedStudentCount(allStudents.length - assignedStudents.length)

      const studentCounts: { [key: string]: number } = {}
      tutors.forEach(tutor => {
        const count = allStudents.filter(student => student.assigned_peer_tutor_id === tutor.id).length
        studentCounts[tutor.id] = count
      })
      setpeerTutortudentCounts(studentCounts)

      // Reload reports if on reports tab
      if (activeTab === 'reports') {
        await loadpeertutorsReports()
      }

      setLastRefresh(new Date())
    } catch (error) {
      logger.error('Error refreshing data:', error)
    } finally {
      setLoading(false)
      setIsManualRefresh(false)
    }
  }

  // Apply peer tutor filters
  useEffect(() => {
    let filtered = peerTutor

    if (selectedYear !== 'all') {
      filtered = filtered.filter(tutor => tutor.year === selectedYear)
    }

    if (selectedSection !== 'all') {
      filtered = filtered.filter(tutor => tutor.section === selectedSection)
    }

    // Apply search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(tutor =>
        tutor.name.toLowerCase().includes(query) ||
        tutor.email.toLowerCase().includes(query) ||
        tutor.year.toLowerCase().includes(query) ||
        tutor.section.toLowerCase().includes(query)
      )
    }

    // Sort by year (2, 3, 4) then by section (A, B, C)
    filtered.sort((a, b) => {
      const yearOrder = { '1st Year': 0, '2nd Year': 1, '3rd Year': 2, '4th Year': 3 }
      const sectionOrder = { 'Section A': 1, 'Section B': 2, 'Section C': 3 }

      const yearDiff = (yearOrder[a.year as keyof typeof yearOrder] || 0) - (yearOrder[b.year as keyof typeof yearOrder] || 0)
      if (yearDiff !== 0) return yearDiff

      return (sectionOrder[a.section as keyof typeof sectionOrder] || 0) - (sectionOrder[b.section as keyof typeof sectionOrder] || 0)
    })

    setFilteredpeerTutor(filtered)
  }, [peerTutor, selectedYear, selectedSection, searchQuery])

  // Apply student filters
  useEffect(() => {
    let filtered = students

    if (selectedStudentYear !== 'all') {
      filtered = filtered.filter(student => student.year === selectedStudentYear)
    }

    if (selectedStudentSection !== 'all') {
      filtered = filtered.filter(student => student.section === selectedStudentSection)
    }

    if (selectedpeertutors !== 'all') {
      filtered = filtered.filter(student => student.assigned_peer_tutor_id === selectedpeertutors)
    }

    // Apply search query filter
    if (studentSearchQuery.trim()) {
      const q = studentSearchQuery.toLowerCase()
      filtered = filtered.filter(student => {
        const assignedpeertutors = peerTutor.find(tutor => tutor.id === student.assigned_peer_tutor_id)
        return (
          student.name.toLowerCase().includes(q) ||
          (student.email && student.email.toLowerCase().includes(q)) ||
          student.year.toLowerCase().includes(q) ||
          student.section.toLowerCase().includes(q) ||
          assignedpeertutors?.name.toLowerCase().includes(q)
        )
      })
    }

    // Sort by year (2, 3, 4) then by section (A, B, C)
    filtered.sort((a, b) => {
      const yearOrder = { '1st Year': 0, '2nd Year': 1, '3rd Year': 2, '4th Year': 3 }
      const sectionOrder = { 'Section A': 1, 'Section B': 2, 'Section C': 3 }

      const yearDiff = (yearOrder[a.year as keyof typeof yearOrder] || 0) - (yearOrder[b.year as keyof typeof yearOrder] || 0)
      if (yearDiff !== 0) return yearDiff

      return (sectionOrder[a.section as keyof typeof sectionOrder] || 0) - (sectionOrder[b.section as keyof typeof sectionOrder] || 0)
    })

    setFilteredStudents(filtered)
  }, [students, selectedStudentYear, selectedStudentSection, selectedpeertutors, studentSearchQuery, peerTutor])

  // Load peer tutor statistics when filtered peer tutors change
  useEffect(() => {
    const loadpeerTutortats = async () => {
      if (filteredpeerTutor.length === 0) {
        setpeerTutorWithStats([])
        return
      }

      setStatsLoading(true)
      try {
        const tutorsWithStats = await Promise.all(
          filteredpeerTutor.map(async (tutor) => {
            const classStats = await ScheduledClassService.getpeertutorsClassStats(tutor.id)
            const additionalClasses = await AdditionalClassService.getAdditionalClassesBypeertutors(tutor.id)

            // Debug logging
            logger.info(`Peer Tutor ${tutor.name} (${tutor.id}):`, {
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
        setpeerTutorWithStats(tutorsWithStats)
      } catch (error) {
        logger.error('Error loading peer tutor stats:', error)
        // Fallback to original data without stats
        setpeerTutorWithStats(filteredpeerTutor.map(tutor => ({
          ...tutor,
          classStats: { totalClasses: 0, completedClasses: 0, pendingClasses: 0, upcomingClasses: 0, overdueClasses: 0 },
          additionalClassesCount: 0
        })))
      } finally {
        setStatsLoading(false)
      }
    }

    loadpeerTutortats()
  }, [filteredpeerTutor])

  // Load student statistics when filtered students change
  useEffect(() => {
    const loadStudentStats = async () => {
      if (filteredStudents.length === 0) {
        setStudentWithStats([])
        return
      }

      setStatsLoading(true)
      try {
        const studentsWithStats = await Promise.all(
          filteredStudents.map(async (student) => {
            const classStats = await AttendanceService.getStudentClassStats(student.id)
            const additionalClassesCount = await AdditionalClassService.getStudentAdditionalClassesCount(student.id)

            return {
              ...student,
              classStats,
              additionalClassesCount
            }
          })
        )
        setStudentWithStats(studentsWithStats)
      } catch (error) {
        logger.error('Error loading student stats:', error)
        setStudentWithStats(filteredStudents.map(student => ({
          ...student,
          classStats: { totalClasses: 0, completedClasses: 0 },
          additionalClassesCount: 0
        })))
      } finally {
        setStatsLoading(false)
      }
    }

    loadStudentStats()
  }, [filteredStudents])

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
  const availableYears = [...new Set(peerTutor.map(tutor => tutor.year))].sort()
  const availableSections = [...new Set(peerTutor.map(tutor => tutor.section))].sort()
  const availableStudentYears = [...new Set(students.map(student => student.year))].sort()
  const availableStudentSections = [...new Set(students.map(student => student.section))].sort()

  // Check if any filters are active
  const hasActiveFilters = selectedYear !== 'all' || selectedSection !== 'all'
  const hasActiveStudentFilters = selectedStudentYear !== 'all' || selectedStudentSection !== 'all' || selectedpeertutors !== 'all'

  // Clear all filters
  const clearFilters = () => {
    setSelectedYear('all')
    setSelectedSection('all')
  }

  const clearStudentFilters = () => {
    setSelectedStudentYear('all')
    setSelectedStudentSection('all')
    setSelectedpeertutors('all')
  }

  // Handle peer tutor view click
  const handleViewpeertutors = (tutorId: string) => {
    router.push(`/faculty/peer-tutor/${tutorId}`)
  }

  // Export functions
  const exportpeerTutor = () => {
    const exportData = peerTutorWithStats.map(tutor => ({
      'Name': tutor.name,
      'Email': tutor.email,
      'Year & Section': `${tutor.year} - ${tutor.section}`,
      'Total Classes Allocated': tutor.classStats.totalClasses,
      'Completed Classes': tutor.classStats.completedClasses,
      'Pending Classes': tutor.classStats.pendingClasses,
      'Additional Classes Taken': tutor.additionalClassesCount || 0,
      'Students Assigned': peerTutortudentCounts[tutor.id] || 0
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Peer Tutors')

    const fileName = `peer_tutors_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  const exportStudents = () => {
    const exportData = filteredStudents.map(student => ({
      name: student.name,
      email: student.email,
      'Year & Section': `${student.year} - ${student.section}`,
      'Assigned Peer Tutor': student.assigned_peer_tutor?.name || 'Not assigned'
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Students')

    const fileName = `students_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
  }



  // Unified Delete Confirmation Handler
  const handleDeleteConfirm = async () => {
    setIsDeleting(true)
    try {
      if (deleteType === 'peer-tutors') {
        let successCount = 0
        let failCount = 0

        // Use selectedpeertutorsIds which represents what we want to delete (single or bulk)
        for (const tutorId of selectedpeertutorsIds) {
          try {
            // FORCE DELETE is implied by the secure modal
            const result = await peertutorservice.removepeertutors(tutorId, true)
            if (result.success) {
              successCount++
            } else {
              failCount++
            }
          } catch (error) {
            logger.error(`Error deleting peer tutor ${tutorId}:`, error)
            failCount++
          }
        }

        // Refresh data
        queryClient.invalidateQueries({ queryKey: ['peer-tutor-stats'] })
        queryClient.invalidateQueries({ queryKey: ['all-students'] })
        queryClient.invalidateQueries({ queryKey: ['faculty-department'] })

        const tutors = await peertutorservice.getpeerTutorByDepartment(department?.name || '')
        setpeerTutor(tutors)
        setFilteredpeerTutor(tutors)

        // Recalculate counts
        // ... (can use a separate refresh function if cleaner, but inline is fine)
        const assignedTutors = tutors.filter(() => true)
        setAssignedCount(assignedTutors.length)
        setUnassignedStudentCount(tutors.length - assignedTutors.length)

        // Update student counts map
        const allStudents = await StudentService.getStudentsWithpeerTutorByDepartment(department?.name || '')
        const studentCounts: { [key: string]: number } = {}
        tutors.forEach(tutor => {
          const count = allStudents.filter(student => student.assigned_peer_tutor_id === tutor.id).length
          studentCounts[tutor.id] = count
        })
        setpeerTutortudentCounts(studentCounts)

        if (successCount > 0) {
          toast.success(
            selectedpeertutorsIds.size > 1
              ? `${successCount} PEER TUTORS DELETED SUCCESSFULLY`
              : 'PEER TUTOR DELETED SUCCESSFULLY',
            {
              style: {
                background: '#FEF08A',
                color: '#854D0E',
                border: '1px solid #FDE047',
                textTransform: 'uppercase',
                fontWeight: 'bold',
                fontFamily: 'inherit'
              },
              className: 'uppercase font-bold'
            }
          )
        }
        if (failCount > 0) {
          toast.error(`FAILED TO DELETE ${failCount} PEER TUTOR(S)`, {
            style: { textTransform: 'uppercase', fontWeight: 'bold' }
          })
        }

        setSelectedpeertutorsIds(new Set())
        setIspeertutorsDeleteMode(false)

      } else if (deleteType === 'students') {
        let successCount = 0
        let failCount = 0

        for (const studentId of selectedStudentIds) {
          try {
            const result = await StudentService.removeStudent(studentId)
            if (result) successCount++
            else failCount++
          } catch (e) {
            logger.error(`Error deleting student ${studentId}`, e)
            failCount++
          }
        }

        // Refresh data
        const allStudents = await StudentService.getStudentsWithpeerTutorByDepartment(department?.name || '')
        setStudents(allStudents)
        setFilteredStudents(allStudents)

        const assignedStudents = allStudents.filter(student => student.assigned_peer_tutor)
        setAssignedStudentCount(assignedStudents.length)
        setUnassignedStudentCount(allStudents.length - assignedStudents.length)

        if (successCount > 0) {
          toast.success(
            selectedStudentIds.size > 1
              ? `${successCount} STUDENTS DELETED SUCCESSFULLY`
              : 'STUDENT DELETED SUCCESSFULLY',
            {
              style: {
                background: '#FEF08A',
                color: '#854D0E',
                border: '1px solid #FDE047',
                textTransform: 'uppercase',
                fontWeight: 'bold',
                fontFamily: 'inherit'
              },
              className: 'uppercase font-bold'
            }
          )
        }
        if (failCount > 0) {
          toast.error(`FAILED TO DELETE ${failCount} STUDENT(S)`, {
            style: { textTransform: 'uppercase', fontWeight: 'bold' }
          })
        }

        setSelectedStudentIds(new Set())
        setIsStudentDeleteMode(false)
      } else if (deleteType === 'renumeration-templates') {
        let successCount = 0
        let failCount = 0

        for (const templateId of itemsToDelete.map(item => item.originalId as string)) {
          if (!templateId) continue
          try {
            const success = await RenumerationService.deleteRenumerationTemplate(templateId)
            if (success) successCount++
            else failCount++
          } catch (error) {
            logger.error(`Error deleting template ${templateId}:`, error)
            failCount++
          }
        }

        // Refresh data
        await handleRenumerationSuccess()

        if (successCount > 0) {
          toast.success(
            itemsToDelete.length > 1
              ? `${successCount} TEMPLATES DELETED SUCCESSFULLY`
              : 'TEMPLATE DELETED SUCCESSFULLY',
            {
              style: {
                background: '#FEF08A',
                color: '#854D0E',
                border: '1px solid #FDE047',
                textTransform: 'uppercase',
                fontWeight: 'bold',
                fontFamily: 'inherit'
              },
              className: 'uppercase font-bold'
            }
          )
        }
        if (failCount > 0) {
          toast.error(`FAILED TO DELETE ${failCount} TEMPLATE(S)`, {
            style: { textTransform: 'uppercase', fontWeight: 'bold' }
          })
        }

        setSelectedRenumerationTemplateIds(new Set())
        setIsRenumerationDeleteMode(false)

      } else if (deleteType === 'feedback-forms') {
        let successCount = 0
        let failCount = 0

        const deletePromises = Array.from(selectedFeedbackFormIds).map(async (id) => {
          try {
            const success = await FeedbackService.deleteFeedbackForm(id)
            if (success) return true
            return false
          } catch (error) {
            logger.error(`Error deleting feedback form ${id}:`, error)
            return false
          }
        })

        const results = await Promise.all(deletePromises)
        successCount = results.filter(Boolean).length
        failCount = results.length - successCount

        // Refresh data
        loadFeedbackForms()

        if (successCount > 0) {
          toast.success(
            selectedFeedbackFormIds.size > 1
              ? `${successCount} FORMS DELETED SUCCESSFULLY`
              : 'FORM DELETED SUCCESSFULLY',
            {
              style: {
                background: '#FEF08A',
                color: '#854D0E',
                border: '1px solid #FDE047',
                textTransform: 'uppercase',
                fontWeight: 'bold',
                fontFamily: 'inherit'
              },
              className: 'uppercase font-bold'
            }
          )
        }
        if (failCount > 0) {
          toast.error(`FAILED TO DELETE ${failCount} FORM(S)`, {
            style: { textTransform: 'uppercase', fontWeight: 'bold' }
          })
        }

        setSelectedFeedbackFormIds(new Set())
        setIsFeedbackDeleteMode(false)
      }
    } catch (error) {
      logger.error("Deletion failed", error)
      toast.error("AN ERROR OCCURRED DURING DELETION")
    } finally {
      setIsDeleting(false)
      setDeleteModalOpen(false)
      setItemsToDelete([])
    }
  }

  // Renumeration Template Delete Handlers
  const handleRenumerationDeleteModeToggle = () => {
    setIsRenumerationDeleteMode(!isRenumerationDeleteMode)
    setSelectedRenumerationTemplateIds(new Set())
  }

  const handleSelectAllRenumerationTemplates = () => {
    if (selectedRenumerationTemplateIds.size === renumerationTemplates.length) {
      setSelectedRenumerationTemplateIds(new Set())
    } else {
      setSelectedRenumerationTemplateIds(new Set(renumerationTemplates.map(t => t.id)))
    }
  }

  const handleRenumerationTemplateSelect = (templateId: string) => {
    const newSelected = new Set(selectedRenumerationTemplateIds)
    if (newSelected.has(templateId)) {
      newSelected.delete(templateId)
    } else {
      newSelected.add(templateId)
    }
    setSelectedRenumerationTemplateIds(newSelected)
  }




  const handleBulkDeleteRenumerationTemplates = () => {
    setDeleteType('renumeration-templates')
    const items = renumerationTemplates
      .filter(t => selectedRenumerationTemplateIds.has(t.id))
      .map(t => ({
        name: t.name,
        email: t.description || 'No description',
        additionalInfo: `${t.fields.length} field(s)`,
        originalId: t.id
      }))
    setItemsToDelete(items)
    setDeleteModalOpen(true)
  }

  // NOTE: old confirmDeletepeertutors removed/replaced by handleDeletepeertutors and handleDeleteConfirm

  // Handle student delete mode toggle
  const handleStudentDeleteModeToggle = () => {
    setIsStudentDeleteMode(!isStudentDeleteMode)
    if (!isStudentDeleteMode) {
      setSelectedStudentIds(new Set())
    }
  }

  // Handle peer tutor delete mode toggle
  const handlepeertutorsDeleteModeToggle = () => {
    setIspeertutorsDeleteMode(!ispeertutorsDeleteMode)
    if (!ispeertutorsDeleteMode) {
      setSelectedpeertutorsIds(new Set())
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
  const handlepeerTutorelect = (tutorId: string) => {
    const newSelected = new Set(selectedpeertutorsIds)
    if (newSelected.has(tutorId)) {
      newSelected.delete(tutorId)
    } else {
      newSelected.add(tutorId)
    }
    setSelectedpeertutorsIds(newSelected)
  }

  // Handle select all peer tutors
  const handleSelectAllpeerTutor = () => {
    if (selectedpeertutorsIds.size === peerTutorWithStats.length) {
      setSelectedpeertutorsIds(new Set())
    } else {
      setSelectedpeertutorsIds(new Set(peerTutorWithStats.map(t => t.id)))
    }
  }

  // Bulk delete students
  const handleBulkDeleteStudents = async () => {
    if (selectedStudentIds.size === 0) {
      toast.warning('Please select at least one student to delete.')
      return
    }

    const selectedStudentsList = filteredStudents.filter(s => selectedStudentIds.has(s.id))
    const items = selectedStudentsList.map(s => ({
      name: s.name,
      email: s.email || undefined,
      additionalInfo: s.assigned_peer_tutor ? `Assigned to ${s.assigned_peer_tutor.name}` : 'Unassigned'
    }))

    setItemsToDelete(items)
    setDeleteType('students')
    setDeleteModalOpen(true)
  }

  // Bulk delete peer tutors
  const handleBulkDeletepeerTutor = async () => {
    if (selectedpeertutorsIds.size === 0) {
      toast.warning('Please select at least one peer tutor to delete.')
      return
    }

    const selectedTutors = peerTutorWithStats.filter(t => selectedpeertutorsIds.has(t.id))
    const items = selectedTutors.map(t => ({
      name: t.name,
      email: t.email,
      additionalInfo: `${peerTutortudentCounts[t.id] || 0} student(s) assigned`
    }))

    setItemsToDelete(items)
    setDeleteType('peer-tutors')
    setDeleteModalOpen(true)
  }

  // Load renumeration templates
  const loadRenumerationTemplates = useCallback(async () => {
    if (!user?.id) return

    setTemplatesLoading(true)
    try {
      const templates = await RenumerationService.getRenumerationTemplates(user.id)
      setRenumerationTemplates(templates)
    } catch (error) {

      logger.error('Error loading renumeration templates:', error)
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
      logger.error('Error loading renumeration submissions:', error)
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
            const classStats = await ScheduledClassService.getpeertutorsClassStats(submission.peer_tutor_id)
            classesCompleted = classStats.completedClasses
          } catch (error) {
            logger.warn('Could not fetch class stats for peer tutor:', submission.peer_tutor_id, error)
          }

          return {
            ...submission,
            classesCompleted
          }
        })
      )
      setSubmissionsWithClasses(submissionsWithClassesData)
    } catch (error) {
      logger.error('Error loading template submissions:', error)
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
      toast.error('Failed to update status. Please try again.')
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
      // Completed first: if a is completed and b is not, a comes first
      const aCompleted = !!a.submitted_at;
      const bCompleted = !!b.submitted_at;
      if (aCompleted !== bCompleted) return aCompleted ? -1 : 1;

      // Fallback to name sort
      const an = (a.peer_tutor?.name || '').toLowerCase()
      const bn = (b.peer_tutor?.name || '').toLowerCase()
      
      if (sortDescByName) {
        return bn.localeCompare(an)
      }
      return an.localeCompare(bn)
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
    
    // Only show completed student responses as requested
    const completedRows = (submissionsWithClasses || []).filter(s => !!s.submitted_at)
    
    if (completedRows.length === 0) {
      toast.info('No completed submissions to export')
      return
    }

    try {
      const exportData = completedRows.map(submission => {
        // Only keep Name, Year, Section and dynamic fields as requested
        const data: any = {
          'Name': submission.peer_tutor?.name || 'Unknown',
          'Year': submission.peer_tutor?.year || '',
          'Section': submission.peer_tutor?.section || '',
        }

        // Add dynamic renumeration field responses
        selectedTemplate.fields.forEach(field => {
          // Check both ID and Field Name just in case, but primary is Field Name based on the modal
          data[field.field_name] = submission.field_responses?.[field.field_name] || submission.field_responses?.[field.id] || ''
        })

        return data
      })

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(exportData)
      
      // Auto-size columns (rough approximation)
      const maxWidth = 50
      const colWidths = Object.keys(exportData[0] || {}).map(key => ({
        wch: Math.min(maxWidth, Math.max(key.length, 15))
      }))
      ws['!cols'] = colWidths

      // Create workbook
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Completed Submissions')

      const fileName = `${selectedTemplate.name}_Completed_Submissions_${new Date().toISOString().split('T')[0]}.xlsx`
      
      // Write and download
      XLSX.writeFile(wb, fileName)
      toast.success('COMPLETED SUBMISSIONS EXPORTED')
    } catch (error) {
      logger.error('Error exporting to Excel:', error)
      toast.error('FAILED TO EXPORT DATA. PLEASE TRY AGAIN.')
    }
  }

  // Handle renumeration success
  const handleRenumerationSuccess = () => {
    // Reload renumeration templates and submissions when a new template is created
    loadRenumerationTemplates()
    loadRenumerationSubmissions()
    logger.info('Renumeration sent successfully')
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
      logger.error('Error updating renumeration status:', error)
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
              logger.error(`Error loading analytics for form ${form.id}:`, analyticsError)
            }
            return {
              ...form,
              responseCount: stats.totalResponses,
              totalEligibleStudents: stats.totalStudents,
              deltaScore
            }
          } catch (error) {
            logger.error(`Error loading stats for form ${form.id}:`, error)
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
      logger.error('Error loading feedback forms:', error)
      logger.error('Error type:', typeof error)
      logger.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
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

    // Prepare items for the delete confirmation modal
    const formsToDelete = feedbackForms
      .filter(f => selectedFeedbackFormIds.has(f.id))
      .map(f => ({
        name: f.name,
        email: `Created: ${new Date(f.created_at).toLocaleDateString()}`,
        additionalInfo: `${f.questions.length} questions`
      }))

    setItemsToDelete(formsToDelete)
    setDeleteType('feedback-forms')
    setDeleteModalOpen(true)
  }



  // Update feedback form status (open/close)
  const handleToggleFormStatus = async (formId: string, newStatus: boolean) => {
    try {
      logger.info('Updating form status:', { formId, newStatus })

      const result = await FeedbackService.updateFeedbackForm(formId, {
        is_active: newStatus
      })

      logger.info('Update result:', result)

      if (result.success) {
        // Refresh the feedback forms list
        loadFeedbackForms()
      } else {
        logger.error('Update failed with result:', result)
        logger.error('Strategy:', result.strategy)
        alert('Failed to update form status. Please try again.')
      }
    } catch (error) {
      logger.error('Error toggling form status:', error)
      logger.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error
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
  const loadpeertutorsReports = useCallback(async () => {
    if (!user?.id) return

    setReportsLoading(true)
    try {
      const reports = await ReportService.getAllpeertutorsReports(user.id)
      setpeertutorsReports(reports)
      setFilteredpeertutorsReports(reports)
    } catch (error) {
      logger.error('Error loading peer tutor reports:', error)
    } finally {
      setReportsLoading(false)
    }
  }, [user?.id])

  // Load reports data when switching to reports tab
  useEffect(() => {
    if (activeTab === 'reports') {
      loadpeertutorsReports()
    }
  }, [activeTab, loadpeertutorsReports])

  // Apply report filters
  useEffect(() => {
    let filtered = peertutorsReports

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

    setFilteredpeertutorsReports(filtered)
  }, [peertutorsReports, reportFilterYear, reportFilterSection, reportFilterSubject])

  // Clear report filters
  const clearReportFilters = () => {
    setReportFilterYear('all')
    setReportFilterSection('all')
    setReportFilterSubject('all')
  }

  // Check if report filters are active
  const hasActiveReportFilters = reportFilterYear !== 'all' || reportFilterSection !== 'all' || reportFilterSubject !== 'all'

  // Get available years, sections and subjects for reports
  const availableReportYears = [...new Set(peertutorsReports.map(r => r.year))].sort()
  const availableReportSections = [...new Set(peertutorsReports.map(r => r.section))].sort()
  const availableReportSubjects = [...new Set(peertutorsReports.flatMap(r => r.subjects.map(s => s.subject_name)))].sort()

  // Handle export of filtered reports
  const handleExportFilteredReports = async () => {
    if (filteredpeertutorsReports.length === 0) {
      alert('No reports to export')
      return
    }

    try {
      const workbook = XLSX.utils.book_new()

      // Get unique years and sections from filtered reports
      const uniqueYears = [...new Set(filteredpeertutorsReports.map(r => r.year))].sort()
      const uniqueSections = [...new Set(filteredpeertutorsReports.map(r => r.section))].sort()
      const dept = filteredpeertutorsReports[0]?.dept || 'N/A'

      // Group reports by year
      const reportsByYear: Record<string, peertutorsReportData[]> = {}
      filteredpeertutorsReports.forEach((report) => {
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
        const reportsBySection: Record<string, peertutorsReportData[]> = {}
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
      logger.error('Error exporting reports:', error)
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
      logger.error('Error loading report data:', error)
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
      logger.error('Error loading class attendance report:', error)
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
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Sidebar - Always Rendered */}
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Content Container */}
      <div
        suppressHydrationWarning
        className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
        {/* Top Header */}
        <PageHeader
          title="STUDENT MANAGEMENT"
          tagline="Peer Tutors, Students & Feedback Oversight"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isManualRefresh}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Tab Navigation */}
        <div className="bg-[#F8F9FA] border-b border-gray-200/50 flex items-center h-16 w-full sticky top-0 z-10 px-4 sm:px-6 lg:px-8 backdrop-blur-sm bg-opacity-90">
          <nav className="flex space-x-2 overflow-x-auto no-scrollbar py-2" aria-label="Tabs">
            {[
              { id: 'tutors', label: 'PEER TUTORS' },
              { id: 'students', label: 'STUDENTS' },
              { id: 'feedback', label: 'FEEDBACK' },
              { id: 'renumeration', label: 'RENUMERATION' },
              { id: 'reports', label: 'REPORTS' },
              { id: 'leaderboard', label: 'LEADERBOARD' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'tutors' | 'students' | 'feedback' | 'renumeration' | 'reports' | 'leaderboard')}
                className={`px-6 py-2.5 rounded-2xl text-[10px] font-black tracking-widest transition-all duration-200 whitespace-nowrap uppercase ${activeTab === tab.id
                  ? 'bg-[#1C2434] text-white shadow-lg shadow-gray-200 scale-105'
                  : 'text-gray-400 hover:text-gray-900 hover:bg-white hover:shadow-sm'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto bg-gray-50/50">
          <div className={`max-w-[1600px] mx-auto w-full`}>
            {loading ? (
              <PeerTutorsPageSkeleton />
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
                        {assignedCount} / {peerTutor.length}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-green-600">

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
                        {peerTutorWithStats.reduce((sum, t) => sum + t.classStats.totalClasses, 0)}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-blue-600">

                        <span className="font-semibold uppercase">Scheduled</span>
                      </div>
                    </div>
                  </div>

                  {/* Classes (Pending) Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Classes
                        </div>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">
                          {peerTutorWithStats.reduce((sum, t) => sum + (t.classStats.upcomingClasses || 0), 0)}
                        </span>
                        <span className="text-2xl text-gray-300 font-light px-1">/</span>
                        <span className="text-3xl font-bold text-gray-900">
                          {peerTutorWithStats.reduce((sum, t) => sum + (t.classStats.overdueClasses || 0), 0)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center text-[10px] font-bold tracking-widest gap-1">
                        <span className="text-yellow-500 uppercase">UPCOMING</span>
                        <span className="text-gray-300">/</span>
                        <span className="text-rose-500 uppercase">PENDING</span>
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
                        {peerTutorWithStats.reduce((sum, t) => sum + (t.additionalClassesCount || 0), 0)}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-blue-600">

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
                        Peer Tutors ({filteredpeerTutor.length})
                        {hasActiveFilters && (
                          <span className="ml-2 text-sm text-blue-600 normal-case">
                            (Filtered)
                          </span>
                        )}
                      </h3>

                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Search Bar */}
                        {peerTutor.length > 0 && (
                          <div className={`relative flex items-center transition-all duration-300 ease-in-out ${ispeerTutorearchExpanded ? 'w-64' : 'w-10'}`}>
                            {ispeerTutorearchExpanded ? (
                              <div className="absolute inset-0 flex items-center w-full">
                                <input
                                  ref={peerTutorearchRef}
                                  type="text"
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  placeholder="Search peer tutor..."
                                  className="w-full pl-10 pr-8 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
                                  autoFocus
                                />
                                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <button
                                  onClick={() => {
                                    setIspeerTutorearchExpanded(false)
                                    setSearchQuery('')
                                  }}
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setIspeerTutorearchExpanded(true)}
                                className="p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors duration-200 w-full flex justify-center"
                                title="Search"
                              >
                                <SearchIcon className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Filter Button */}
                        {!ispeertutorsDeleteMode && filteredpeerTutor.length > 0 && (
                          <div className="relative" ref={filterRef}>
                            <button
                              onClick={() => setShowFilterPopup(!showFilterPopup)}
                              className={`p-2.5 rounded-lg transition-colors duration-200 ${hasActiveFilters
                                ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                                }`}
                              title="Filter peer tutors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20" height="20" viewBox="0 0 72 72" className="w-5 h-5 fill-current">
                                <path d="M 18 12 C 15.791 12 14 13.791 14 16 L 14 22 C 14 22.821 14.251656 23.622922 14.722656 24.294922 L 28 43.261719 L 28 55 C 28 56.636 28.996625 58.106844 30.515625 58.714844 L 40.515625 62.714844 C 40.994625 62.906844 41.498 63 42 63 C 42.788 63 43.571188 62.7675 44.242188 62.3125 C 45.342187 61.5685 46 60.327 46 59 L 46 43.261719 L 59.277344 24.294922 C 59.748344 23.622922 60 22.821 60 22 L 60 16 C 60 13.791 58.209 12 56 12 L 18 12 z M 22 20 L 52 20 L 52 20.738281 L 48.316406 26 L 25.683594 26 L 22 20.738281 L 22 20 z"></path>
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
                                        className={`block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${selectedYear === 'all' ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''
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
                        {!ispeertutorsDeleteMode ? (
                          <>
                            <button
                              onClick={() => setShowAddPeerTutorModal(true)}
                              className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              ADD
                            </button>

                            {peerTutor.length > 0 && (
                              <button
                                onClick={handlepeertutorsDeleteModeToggle}
                                className="p-3 rounded-xl bg-white border border-gray-200 text-red-600 hover:bg-red-50 transition-all shadow-sm hover:shadow-md active:scale-95 flex items-center justify-center group"
                                title="Delete Mode"
                              >
                                <Trash2 className="w-5 h-5 transition-transform group-hover:scale-110" />
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

                            <ExportButton onClick={exportpeerTutor} />
                          </>
                        ) : (
                          <>
                            <button
                              onClick={handleBulkDeletepeerTutor}
                              disabled={selectedpeertutorsIds.size === 0}
                              className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors duration-200"
                            >
                              Delete Selected ({selectedpeertutorsIds.size})
                            </button>
                            <button
                              onClick={handlepeertutorsDeleteModeToggle}
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
                          {ispeertutorsDeleteMode && (
                            <th className="px-6 py-3 text-left">
                              <input
                                type="checkbox"
                                checked={selectedpeertutorsIds.size === peerTutorWithStats.length && peerTutorWithStats.length > 0}
                                onChange={handleSelectAllpeerTutor}
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
                          [...Array(5)].map((_, index) => (
                            <tr key={index} className="animate-pulse border-b border-gray-100">
                              {ispeertutorsDeleteMode && (
                                <td className="px-6 py-4">
                                  <div className="h-4 w-4 bg-gray-200 rounded"></div>
                                </td>
                              )}
                              <td className="px-6 py-4">
                                <div className="flex items-center">
                                  <div className="h-10 w-10 rounded-full bg-gray-200 mr-4"></div>
                                  <div className="space-y-2">
                                    <div className="h-4 w-32 bg-gray-200 rounded"></div>
                                    <div className="h-3 w-24 bg-gray-200 rounded"></div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="h-4 w-24 bg-gray-200 rounded mx-auto"></div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="h-4 w-12 bg-gray-200 rounded mx-auto"></div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="h-4 w-12 bg-gray-200 rounded mx-auto"></div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="h-4 w-12 bg-gray-200 rounded mx-auto"></div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="h-4 w-12 bg-gray-200 rounded mx-auto"></div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="h-4 w-12 bg-gray-200 rounded mx-auto"></div>
                              </td>
                            </tr>
                          ))
                        ) : peerTutorWithStats.length === 0 ? (
                          <tr>
                            <td colSpan={ispeertutorsDeleteMode ? 9 : 8} className="px-6 py-8 text-center text-gray-500">
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
                          peerTutorWithStats.map((tutor) => (
                            <tr key={tutor.id} className="hover:bg-gray-50 transition-colors duration-150">
                              {ispeertutorsDeleteMode && (
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={selectedpeertutorsIds.has(tutor.id)}
                                    onChange={() => handlepeerTutorelect(tutor.id)}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                  />
                                </td>
                              )}
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    <div className="h-10 w-10 rounded-full bg-black border border-gray-800 flex items-center justify-center ring-1 ring-gray-900 shadow-inner">
                                      <span className="text-white font-bold text-sm tracking-tighter">
                                        {tutor.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="ml-4">
                                    {!ispeertutorsDeleteMode ? (
                                      <button
                                        onClick={() => handleViewpeertutors(tutor.id)}
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
                                <div className="text-sm font-bold text-purple-900">
                                  {tutor.additionalClassesCount || 0}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm font-bold text-gray-900">
                                  {peerTutortudentCounts[tutor.id] || 0}
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
                        {/* Search Bar */}
                        {students.length > 0 && (
                          <div className={`relative flex items-center transition-all duration-300 ease-in-out ${isStudentSearchExpanded ? 'w-64' : 'w-10'}`}>
                            {isStudentSearchExpanded ? (
                              <div className="absolute inset-0 flex items-center w-full">
                                <input
                                  ref={studentSearchRef}
                                  type="text"
                                  value={studentSearchQuery}
                                  onChange={(e) => setStudentSearchQuery(e.target.value)}
                                  placeholder="Search student..."
                                  className="w-full pl-10 pr-8 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
                                  autoFocus
                                />
                                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <button
                                  onClick={() => {
                                    setIsStudentSearchExpanded(false)
                                    setStudentSearchQuery('')
                                  }}
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setIsStudentSearchExpanded(true)}
                                className="p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors duration-200 w-full flex justify-center"
                                title="Search"
                              >
                                <SearchIcon className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Filter Button */}
                        {!isStudentDeleteMode && (
                          <div className="relative" ref={studentFilterRef}>
                            <button
                              onClick={() => setShowStudentFilterPopup(!showStudentFilterPopup)}
                              className={`p-2.5 rounded-lg transition-colors duration-200 ${hasActiveStudentFilters
                                ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                                }`}
                              title="Filter students"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20" height="20" viewBox="0 0 72 72" className="w-5 h-5 fill-current">
                                <path d="M 18 12 C 15.791 12 14 13.791 14 16 L 14 22 C 14 22.821 14.251656 23.622922 14.722656 24.294922 L 28 43.261719 L 28 55 C 28 56.636 28.996625 58.106844 30.515625 58.714844 L 40.515625 62.714844 C 40.994625 62.906844 41.498 63 42 63 C 42.788 63 43.571188 62.7675 44.242188 62.3125 C 45.342187 61.5685 46 60.327 46 59 L 46 43.261719 L 59.277344 24.294922 C 59.748344 23.622922 60 22.821 60 22 L 60 16 C 60 13.791 58.209 12 56 12 L 18 12 z M 22 20 L 52 20 L 52 20.738281 L 48.316406 26 L 25.683594 26 L 22 20.738281 L 22 20 z"></path>
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
                                        className={`block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${selectedStudentYear === 'all' ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''
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
                                        value={selectedpeertutors}
                                        onChange={(e) => setSelectedpeertutors(e.target.value)}
                                        className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                      >
                                        <option value="all">All Peer Tutors</option>
                                        {peerTutor.map(tutor => (
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
                            <button
                              onClick={() => setShowAddStudentModal(true)}
                              className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              ADD
                            </button>

                            {students.length > 0 && (
                              <button
                                onClick={handleStudentDeleteModeToggle}
                                className="p-3 rounded-xl bg-white border border-gray-200 text-red-600 hover:bg-red-50 transition-all shadow-sm hover:shadow-md active:scale-95 flex items-center justify-center group"
                                title="Delete Mode"
                              >
                                <Trash2 className="w-5 h-5 transition-transform group-hover:scale-110" />
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
                                    <div className="h-10 w-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shadow-sm">
                                      <span className="text-gray-900 font-bold text-sm tracking-tighter">
                                        {student.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="ml-4">
                                    <div className="text-sm font-medium text-gray-900">
                                      {student.name}
                                      {isManualStudent(student) && (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                                          Manual
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {isManualStudent(student) ? (
                                        <button
                                          onClick={() => setSelectedStudentForEmail(student)}
                                          className="text-blue-600 hover:text-blue-800 text-xs font-semibold hover:underline flex items-center gap-1 mt-0.5"
                                        >
                                          + Assign Email
                                        </button>
                                      ) : (
                                        student.email
                                      )}
                                    </div>
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
                                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-2 ${selectedFeedbackFormIds.size > 0
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
                                    className="p-3 rounded-xl bg-white border border-gray-200 text-red-600 hover:bg-red-50 transition-all shadow-sm hover:shadow-md active:scale-95 flex items-center justify-center group"
                                    title="Delete Mode"
                                  >
                                    <Trash2 className="w-5 h-5 transition-transform group-hover:scale-110" />
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
                              <FeedbackFormsSkeleton />
                            ) : feedbackForms.length === 0 ? (
                              <tr>
                                <td colSpan={isFeedbackDeleteMode ? 8 : 7} className="px-6 py-8 text-center text-gray-500">
                                  <div className="flex flex-col items-center">
                                    <svg className="h-12 w-12 text-black mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p className="text-lg font-medium text-black mb-2">NO FORM FOUND</p>
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
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                                      <select
                                        className="border border-gray-300 rounded-md px-2 py-1 text-sm mx-auto"
                                        value={form.is_active ? 'open' : 'closed'}
                                        onChange={(e) => handleToggleFormStatus(form.id, e.target.value === 'open' ? true : false)}
                                      >
                                        <option value="open">Open</option>
                                        <option value="closed">Closed</option>
                                      </select>
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
                                            }} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                                          >
                                            Edit
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

                            <span className="font-semibold uppercase">Finished</span>
                          </div>
                        </div>
                      </div>

                      {/* Classes (Old Pending) Card */}
                      <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Classes
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
                          <div className="mt-2 flex items-center text-xs font-semibold">
                            {(() => {
                              const today = new Date()
                              today.setHours(0, 0, 0, 0)
                              const pendingClasses = reportScheduledClasses.filter(cls =>
                                cls.completion_status !== 'completed' &&
                                !(cls.attendance_completed && cls.topics_completed)
                              )
                              let upcoming = 0
                              let overdue = 0
                              pendingClasses.forEach(cls => {
                                if (!cls.scheduled_date) { overdue++; return }
                                const d = new Date(cls.scheduled_date)
                                d.setHours(0, 0, 0, 0)
                                if (d.getTime() > today.getTime()) upcoming++
                                else overdue++
                              })
                              return (
                                <>
                                  <span className="text-blue-600 mr-2">{upcoming} Upcoming</span>
                                  <span className="text-gray-300 mr-2">/</span>
                                  <span className="text-orange-600">{overdue} Pending</span>
                                </>
                              )
                            })()}
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
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-white">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Subject</th>
                                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Assigned Date</th>
                                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Attendance</th>
                                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {[...Array(3)].map((_, i) => (
                                  <tr key={i} className="animate-pulse border-b border-gray-100">
                                    <td className="px-6 py-4"><div className="h-4 w-32 bg-gray-200 rounded"></div></td>
                                    <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded"></div></td>
                                    <td className="px-6 py-4 text-center"><div className="h-6 w-16 bg-gray-200 rounded-full mx-auto"></div></td>
                                    <td className="px-6 py-4 text-center"><div className="h-8 w-16 bg-gray-200 rounded mx-auto"></div></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
                                          className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${isPresent
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
                            Peer Tutor Reports ({filteredpeertutorsReports.length})
                          </h3>
                          <div className="flex items-center gap-3 flex-wrap">
                            {/* Filter Bar Redesign */}
                            <div className="flex items-center gap-2">
                              {/* Year Dropdown */}
                              <div className="relative">
                                <select
                                  value={reportFilterYear}
                                  onChange={(e) => setReportFilterYear(e.target.value)}
                                  className={`h-11 px-4 pr-10 rounded-xl border appearance-none transition-all duration-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${reportFilterYear !== 'all'
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
                                  className={`h-11 px-4 pr-10 rounded-xl border appearance-none transition-all duration-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${reportFilterYear === 'all'
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
                                  className={`h-11 px-4 pr-10 rounded-xl border appearance-none transition-all duration-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${reportFilterSubject !== 'all'
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
                          {filteredpeertutorsReports.length > 0 && (
                            <ExportButton onClick={handleExportFilteredReports} />
                          )}
                        </div>
                      </div>

                      <div className="overflow-hidden">
                        {reportsLoading ? (
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
                                    Classes
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
                                <PeerTutorReportsSkeleton />
                              </tbody>
                            </table>
                          </div>
                        ) : filteredpeertutorsReports.length === 0 ? (
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
                                    Classes
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
                                {filteredpeertutorsReports.map((report) => {
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
                                    <tr key={`${report.peer_tutor_id}-${subject.subject_name}`} className="hover:bg-gray-50">
                                      {subjectIndex === 0 && (
                                        <>
                                          <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200" rowSpan={report.subjects.length}>
                                            <div className="text-sm font-medium text-gray-900">{report.peer_tutor_name}</div>
                                          </td>
                                          <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200" rowSpan={report.subjects.length}>
                                            <div className="text-sm text-gray-500">{report.peer_tutor_email}</div>
                                          </td>
                                          <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200" rowSpan={report.subjects.length}>
                                            <span className="inline-flex items-center px-2.5 py-0.5  text-xs font-medium bg-gray-100 text-black">
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

                {/* Leaderboard Logic */}
                {(() => {
                  // 1. Filter by Year (if selected)
                  // Decide which list to use based on leaderboardTabType
                  const baseList = leaderboardTabType === 'peer' ? peerTutorWithStats : studentWithStats;
                  let displayList = [...baseList];
                  if (leaderboardFilterYear !== 'all') {
                    displayList = displayList.filter(item => item.year === leaderboardFilterYear)
                  }

                  // 2. Score Calculation (uses configurable weights, out of 100)
                  const rankedList = displayList.map(item => {
                    // Gather exam summaries for this item (tutor or student)
                    const examSummaries = Object.entries(examSummariesMap).flatMap(
                      ([examId, summaries]) => summaries
                        // Note: For students, we might not have exam summaries structured the same way, but keeping the format
                        .filter(s => s.peer_tutor_id === item.id)
                        .map(s => ({ exam_id: examId, peer_tutor_id: s.peer_tutor_id, ascend_score: s.ascend_score }))
                    )
                    return {
                      ...item,
                      // Ensure type cast so calculateScore understands it.
                      score: LeaderboardConfigService.calculateScore({
                        classStats: item.classStats,
                        additionalClassesCount: item.additionalClassesCount
                      }, scoringConfig, examSummaries)
                    } as RankedItem;
                  });

                  // 3. Sort by Score DESC
                  rankedList.sort((a, b) => {
                    if (b.score.finalScore !== a.score.finalScore) return b.score.finalScore - a.score.finalScore;
                    return a.name.localeCompare(b.name);
                  })

                  const top1 = rankedList[0];
                  const top2 = rankedList[1];
                  const top3 = rankedList[2];
                  const rest = rankedList.slice(3);

                  // Helper to format year and section
                  const formatLeaderboardDetails = (year: string, section: string) => {
                    const yearNum = year.replace(/\D/g, '') // Extract number if present
                    let formattedYear = year

                    if (yearNum) {
                      if (yearNum === '1') formattedYear = '1st Year'
                      else if (yearNum === '2') formattedYear = '2nd Year'
                      else if (yearNum === '3') formattedYear = '3rd Year'
                      else if (yearNum === '4') formattedYear = '4th Year'
                      else formattedYear = `${yearNum}th Year`
                    } else if (year === 'I') formattedYear = '1st Year'
                    else if (year === 'II') formattedYear = '2nd Year'
                    else if (year === 'III') formattedYear = '3rd Year'
                    else if (year === 'IV') formattedYear = '4th Year'

                    // Handle section formatting if needed (assuming section is just 'A', 'B' etc or 'Section A')
                    const formattedSection = section.toLowerCase().startsWith('section')
                      ? section
                      : `Section ${section}`

                    return `${formattedYear} - ${formattedSection}`
                  }

                  return (
                    <>
                      {/* Podium Section */}
                      {/* Leaderboard Type Toggle */}
                      <div className="flex border-b border-gray-200 mb-6">
                        <button
                          onClick={() => setLeaderboardTabType('peer')}
                          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-colors ${leaderboardTabType === 'peer' 
                            ? 'border-blue-600 text-blue-600' 
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        >
                          PEER TUTORS
                        </button>
                        <button
                          onClick={() => setLeaderboardTabType('student')}
                          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-colors ${leaderboardTabType === 'student' 
                            ? 'border-blue-600 text-blue-600' 
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        >
                          STUDENTS
                        </button>
                      </div>

                      {rankedList.length > 0 && (
                        <div className="relative bg-white shadow-xl shadow-blue-900/5 rounded-3xl p-6 md:p-10 border border-gray-100 mb-8 overflow-hidden">
                          {/* Background Decor */}
                          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                            <div className="absolute top-[-10%] right-[-5%] w-64 h-64 bg-blue-100/50 rounded-full blur-3xl opacity-60"></div>
                            <div className="absolute bottom-[-10%] left-[-5%] w-64 h-64 bg-yellow-100/40 rounded-full blur-3xl opacity-60"></div>
                          </div>

                          {/* Year Filter */}
                          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between mb-8 md:mb-12 gap-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl shadow-lg shadow-orange-200">
                                <Trophy className="w-6 h-6 text-white" />
                              </div>
                              <div>
                                <h3 className="text-xl font-black text-gray-800 uppercase tracking-wide">Top {leaderboardTabType === 'peer' ? 'Performers' : 'Students'}</h3>
                                <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">Recognizing Excellence</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                value={leaderboardFilterYear}
                                onChange={(e) => setLeaderboardFilterYear(e.target.value)}
                                className="w-full sm:w-auto bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 py-2.5 px-4 outline-none transition-all shadow-sm hover:border-gray-300"
                              >
                                <option value="all">All Years</option>
                                {availableYears.map(year => (
                                  <option key={year} value={year}>{year}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => setShowScoringModal(true)}
                                className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm group"
                                title="Configure Scoring Rules"
                              >
                                <Settings className="w-4 h-4 text-gray-500 group-hover:text-gray-700 transition-colors" />
                              </button>
                            </div>
                          </div>

                          <div className="relative z-10 flex flex-col md:flex-row justify-end md:justify-center items-center md:items-end gap-6 md:gap-4 h-auto md:h-[400px] pt-4 md:pt-0">

                            {/* Rank 1 - Mobile First (Top) */}
                            <div className="flex flex-col items-center w-full max-w-[260px] md:order-2 z-20 -mb-2 md:-mb-0">
                              {top1 && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                                  className="w-full flex flex-col items-center relative"
                                >
                                  {/* Glow Effect */}
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-yellow-400/20 blur-3xl rounded-full pointer-events-none"></div>

                                  <div className="relative mb-[-35px] z-10">
                                    <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 animate-bounce-slow">
                                      <Crown className="w-10 h-10 text-yellow-500 drop-shadow-[0_4px_8px_rgba(234,179,8,0.4)] fill-yellow-200" />
                                    </div>
                                    <div className="w-24 h-24 md:w-28 md:h-28 rounded-full border-[4px] border-yellow-400 ring-4 ring-yellow-100/80 overflow-hidden shadow-2xl shadow-yellow-500/20 bg-white relative group">
                                      <div className="absolute inset-0 bg-yellow-400 opacity-0 group-hover:opacity-10 transition-opacity"></div>
                                      <div className="w-full h-full bg-gradient-to-br from-yellow-50 to-orange-50 flex items-center justify-center text-3xl font-black text-yellow-600/90 tracking-tighter">
                                        {top1.name.substring(0, 2).toUpperCase()}
                                      </div>
                                    </div>
                                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-yellow-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm border border-yellow-400">
                                      #1
                                    </div>
                                  </div>
                                  <div className="w-full bg-white bg-opacity-80 backdrop-blur-sm border-t-4 border-yellow-400 rounded-2xl pt-16 pb-6 px-4 flex flex-col items-center shadow-2xl shadow-yellow-900/5 h-auto md:h-[280px] justify-between relative overflow-hidden ring-1 ring-gray-100">
                                    <div className="absolute inset-0 bg-gradient-to-b from-yellow-50/50 via-transparent to-transparent"></div>

                                    <div className="text-center relative z-10 w-full mb-4">
                                      <div className="text-lg md:text-xl font-black text-gray-800 line-clamp-2 leading-tight drop-shadow-sm mb-2">{top1.name}</div>
                                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 text-[10px] font-bold uppercase tracking-widest border border-yellow-100/50 shadow-sm">
                                        {formatLeaderboardDetails(top1.year, top1.section)}
                                      </div>
                                    </div>

                                    <div className="w-full relative z-10 text-center group/tooltip cursor-help">
                                      <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Total Score</div>
                                      <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl px-4 py-3 shadow-lg shadow-orange-500/20 flex items-center justify-center gap-3 transform transition-transform duration-300 hover:scale-[1.02]">
                                        <div className="text-2xl font-black">{top1.score.finalScore}</div>
                                        <Trophy className="w-5 h-5 text-yellow-100 opacity-80" />
                                      </div>
                                      {/* Tooltip */}
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none shadow-xl border border-gray-700">
                                        <div className="font-bold border-b border-gray-700 pb-1 mb-2 text-left">Score Breakdown</div>
                                        <div className="flex justify-between mb-1"><span>Scheduled:</span> <span>{top1.score.breakdown.scheduledWeighted} pts</span></div>
                                        <div className="flex justify-between mb-1"><span>Additional:</span> <span>{top1.score.breakdown.additionalWeighted} pts</span></div>
                                        <div className="flex justify-between"><span>Exams:</span> <span>{top1.score.breakdown.examWeighted} pts</span></div>
                                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 border-r border-b border-gray-700"></div>
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </div>

                            <div className="flex w-full md:w-auto gap-4 md:gap-4 md:contents">
                              {/* Rank 2 - Silver */}
                              <div className="flex flex-col items-center w-1/2 md:w-1/3 max-w-[200px] md:order-1">
                                {top2 && (
                                  <motion.div
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="w-full flex flex-col items-center"
                                  >
                                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-[3px] border-slate-300 ring-2 ring-slate-100 overflow-hidden shadow-lg mb-[-20px] z-10 bg-white relative group">
                                      <div className="absolute inset-0 bg-slate-400 opacity-0 group-hover:opacity-10 transition-opacity"></div>
                                      <div className="w-full h-full bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center text-xl font-black text-slate-500">
                                        {top2.name.substring(0, 2).toUpperCase()}
                                      </div>
                                    </div>
                                    <div className="w-full bg-white bg-opacity-60 backdrop-blur-md rounded-2xl pt-12 pb-5 px-3 flex flex-col items-center shadow-lg shadow-slate-200/50 h-auto md:h-[220px] justify-between border border-white relative overflow-hidden ring-1 ring-slate-200/50">
                                      <div className="absolute top-0 inset-x-0 h-1 bg-slate-300/50"></div>

                                      <div className="text-center relative z-10 w-full mb-2">
                                        <div className="text-4xl font-black text-slate-200/40 mb-1 absolute -top-8 left-1/2 -translate-x-1/2 select-none">2</div>
                                        <div className="mt-2 h-10 md:h-auto flex items-end justify-center">
                                          <div className="text-sm font-bold text-gray-700 line-clamp-2 leading-tight px-1">{top2.name}</div>
                                        </div>
                                        <div className="text-[10px] uppercase font-bold text-slate-400 mt-2 tracking-wider">{formatLeaderboardDetails(top2.year, top2.section)}</div>
                                      </div>

                                      <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 flex flex-col items-center mt-2 w-full relative group/tooltip cursor-help">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Score</span>
                                        <span className="text-lg font-black text-slate-600 leading-none">{top2.score.finalScore}</span>
                                        {/* Tooltip */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none shadow-xl border border-gray-700">
                                          <div className="font-bold border-b border-gray-700 pb-1 mb-2 text-left">Score Breakdown</div>
                                          <div className="flex justify-between mb-1"><span>Scheduled:</span> <span>{top2.score.breakdown.scheduledWeighted} pts</span></div>
                                          <div className="flex justify-between mb-1"><span>Additional:</span> <span>{top2.score.breakdown.additionalWeighted} pts</span></div>
                                          <div className="flex justify-between"><span>Exams:</span> <span>{top2.score.breakdown.examWeighted} pts</span></div>
                                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 border-r border-b border-gray-700"></div>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </div>

                              {/* Rank 3 - Bronze */}
                              <div className="flex flex-col items-center w-1/2 md:w-1/3 max-w-[200px] md:order-3">
                                {top3 && (
                                  <motion.div
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="w-full flex flex-col items-center"
                                  >
                                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-[3px] border-orange-300 ring-2 ring-orange-100 overflow-hidden shadow-lg mb-[-20px] z-10 bg-white relative group">
                                      <div className="absolute inset-0 bg-orange-400 opacity-0 group-hover:opacity-10 transition-opacity"></div>
                                      <div className="w-full h-full bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center text-xl font-black text-orange-600">
                                        {top3.name.substring(0, 2).toUpperCase()}
                                      </div>
                                    </div>
                                    <div className="w-full bg-white bg-opacity-60 backdrop-blur-md rounded-2xl pt-12 pb-5 px-3 flex flex-col items-center shadow-lg shadow-orange-200/40 h-auto md:h-[200px] justify-between border border-white relative overflow-hidden ring-1 ring-orange-200/50">
                                      <div className="absolute top-0 inset-x-0 h-1 bg-orange-300/50"></div>

                                      <div className="text-center relative z-10 w-full mb-2">
                                        <div className="text-4xl font-black text-orange-200/40 mb-1 absolute -top-8 left-1/2 -translate-x-1/2 select-none">3</div>
                                        <div className="mt-2 h-10 md:h-auto flex items-end justify-center">
                                          <div className="text-sm font-bold text-gray-700 line-clamp-2 leading-tight px-1">{top3.name}</div>
                                        </div>
                                        <div className="text-[10px] uppercase font-bold text-orange-400 mt-2 tracking-wider">{formatLeaderboardDetails(top3.year, top3.section)}</div>
                                      </div>

                                      <div className="bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 flex flex-col items-center mt-2 w-full relative group/tooltip cursor-help">
                                        <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider mb-0.5">Score</span>
                                        <span className="text-lg font-black text-orange-600 leading-none">{top3.score.finalScore}</span>
                                        {/* Tooltip */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none shadow-xl border border-gray-700">
                                          <div className="font-bold border-b border-gray-700 pb-1 mb-2 text-left">Score Breakdown</div>
                                          <div className="flex justify-between mb-1"><span>Scheduled:</span> <span>{top3.score.breakdown.scheduledWeighted} pts</span></div>
                                          <div className="flex justify-between mb-1"><span>Additional:</span> <span>{top3.score.breakdown.additionalWeighted} pts</span></div>
                                          <div className="flex justify-between"><span>Exams:</span> <span>{top3.score.breakdown.examWeighted} pts</span></div>
                                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 border-r border-b border-gray-700"></div>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}


                      {
                        rankedList.length === 0 && !loading && (
                          <div className="text-center py-20 bg-white rounded-lg border border-gray-200 shadow-sm">
                            <Trophy className="mx-auto h-16 w-16 text-gray-300 mb-4" />
                            <h3 className="text-lg font-medium text-gray-900">No Data Available</h3>
                            <p className="text-gray-500">No {leaderboardTabType === 'peer' ? 'peer tutors' : 'students'} found for the selected criteria.</p>
                          </div>
                        )
                      }

                      {/* Rest of the List */}
                      {
                        rest.length > 0 && (
                          <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                              <h3 className="font-bold text-gray-700 uppercase tracking-wide text-sm flex items-center gap-2">
                                <Medal className="w-4 h-4 text-gray-400" />
                                Honorable Mentions
                              </h3>
                              <span className="text-xs font-medium text-gray-500 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">{rest.length} Instructors</span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-white">
                                  <tr>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-20">Rank</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">{leaderboardTabType === 'peer' ? 'Peer Tutor' : 'Student'}</th>
                                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">Score</th>
                                    <th className="px-6 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Year & Section</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                  {rest.map((tutor, idx) => (
                                    <tr key={tutor.id} className="hover:bg-blue-50/30 transition-colors group">
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-500 font-bold text-xs group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                          {idx + 4}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 text-white flex items-center justify-center text-xs font-bold mr-3 shadow-md ring-2 ring-white group-hover:ring-blue-100 transition-all">
                                            {tutor.name.substring(0, 2).toUpperCase()}
                                          </div>
                                          <div>
                                            <div className="text-sm font-bold text-gray-800 group-hover:text-blue-700 transition-colors">{tutor.name}</div>
                                            <div className="text-xs text-gray-500">{tutor.email || 'N/A'}</div>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <div className="inline-flex flex-col items-center justify-center relative group/tooltip cursor-help">
                                          <span className="text-sm font-black text-gray-700">{tutor.score.finalScore}</span>
                                          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">pts</span>
                                          {/* Tooltip */}
                                          <div className="absolute bottom-full right-full translate-x-12 mb-2 w-48 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 shadow-xl border border-gray-700 pointer-events-none">
                                            <div className="font-bold border-b border-gray-700 pb-1 mb-2 text-left">Score Breakdown</div>
                                            <div className="flex justify-between mb-1"><span>Scheduled:</span> <span>{tutor.score.breakdown.scheduledWeighted} pts</span></div>
                                            <div className="flex justify-between mb-1"><span>Additional:</span> <span>{tutor.score.breakdown.additionalWeighted} pts</span></div>
                                            <div className="flex justify-between"><span>Exams:</span> <span>{tutor.score.breakdown.examWeighted} pts</span></div>
                                            <div className="absolute -bottom-1 left-[70%] -translate-x-[70%] w-2 h-2 bg-gray-900 rotate-45 border-r border-b border-gray-700"></div>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-100">
                                          {formatLeaderboardDetails(tutor.year, tutor.section)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )
                      }
                    </>
                  )
                })()}
              </div >
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
                  {/* Total Assigned Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {renumerationView === 'submissions' ? 'Total Assigned' : 'Total Templates'}
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {renumerationView === 'submissions' ? filteredAndSortedSubmissions.length : renumerationTemplates.length}
                      </div>
                      <div className="mt-2 flex items-center text-xs text-blue-600">
                        <span className="font-semibold uppercase">{renumerationView === 'submissions' ? 'Allocated' : 'Information'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pending Submission Card */}
                  <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Pending Submission
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {renumerationView === 'submissions'
                          ? filteredAndSortedSubmissions.filter(s => !s.submitted_at).length
                          : renumerationSubmissions.filter(s => !s.submitted_at).length
                        }
                      </div>
                      <div className="mt-2 flex items-center text-xs text-yellow-600">
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
                          ? filteredAndSortedSubmissions.filter(s => !!s.submitted_at).length
                          : renumerationTemplates.reduce((total, template) => {
                            const submissionCount = renumerationSubmissions.filter(
                              (submission: peertutorsRenumeration) =>
                                submission.template_id === template.id &&
                                peerTutor.some(pt => pt.id === submission.peer_tutor_id) &&
                                submission.status !== 'pending'
                            ).length
                            return total + submissionCount
                          }, 0)
                        }
                      </div>
                      <div className="mt-2 flex items-center text-xs text-green-600">
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
                          {isRenumerationDeleteMode && (
                            <>
                              <button
                                onClick={handleRenumerationDeleteModeToggle}
                                className="px-4 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium transition-colors duration-200"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleBulkDeleteRenumerationTemplates}
                                disabled={selectedRenumerationTemplateIds.size === 0}
                                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-2 ${selectedRenumerationTemplateIds.size > 0
                                  ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                                  : 'bg-gray-400 text-white cursor-not-allowed'
                                  }`}
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete Selected {selectedRenumerationTemplateIds.size > 0 && `(${selectedRenumerationTemplateIds.size})`}
                              </button>
                            </>
                          )}
                          {!isRenumerationDeleteMode && renumerationTemplates.length > 0 && (
                            <button
                              onClick={handleRenumerationDeleteModeToggle}
                              className="p-3 rounded-xl bg-white border border-gray-200 text-red-600 hover:bg-red-50 transition-all shadow-sm hover:shadow-md active:scale-95 flex items-center justify-center group"
                              title="Delete Mode"
                            >
                              <Trash2 className="w-5 h-5 transition-transform group-hover:scale-110" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-0">
                      {templatesLoading ? (
                        <div className="overflow-hidden">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-white">
                              <tr>
                                {isRenumerationDeleteMode && (
                                  <th className="px-6 py-3 text-left">
                                    <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
                                  </th>
                                )}
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
                              <RenumerationTemplatesSkeleton />
                            </tbody>
                          </table>
                        </div>
                      ) : renumerationTemplates.length === 0 ? (
                        <div className="text-center py-12">
                          <svg className="h-12 w-12 text-black mb-4 flex items-center justify-center mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <h3 className="text-lg font-medium uppercase text-black mb-2">No templates found</h3>
                          <p className="text-sm text-gray-500">Create your first renumeration template to get started.</p>
                        </div>
                      ) : (
                        <div className="overflow-hidden">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-white">
                              <tr>
                                {isRenumerationDeleteMode && (
                                  <th className="px-6 py-3 text-left">
                                    <input
                                      type="checkbox"
                                      checked={selectedRenumerationTemplateIds.size === renumerationTemplates.length && renumerationTemplates.length > 0}
                                      onChange={handleSelectAllRenumerationTemplates}
                                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                    />
                                  </th>
                                )}
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
                                  (submission: peertutorsRenumeration) =>
                                    submission.template_id === template.id &&
                                    peerTutor.some(pt => pt.id === submission.peer_tutor_id) &&
                                    submission.status !== 'pending'
                                ).length
                                const totalEligiblepeerTutor = peerTutor.length

                                return (
                                  <tr key={template.id} className="hover:bg-gray-50">
                                    {isRenumerationDeleteMode && (
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <input
                                          type="checkbox"
                                          checked={selectedRenumerationTemplateIds.has(template.id)}
                                          onChange={() => handleRenumerationTemplateSelect(template.id)}
                                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                        />
                                      </td>
                                    )}
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
                                        {submissionCount}/{totalEligiblepeerTutor}
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
                          {/* Filter button - Relative Container for correct alignment */}
                          <div className="relative">
                            <button
                              onClick={() => setShowSubmissionFilter(s => !s)}
                              className={`p-2.5 rounded-lg border transition-colors duration-200 ${showSubmissionFilter ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                }`}
                              title="Filter submissions"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20" height="20" viewBox="0 0 72 72" className="w-5 h-5 fill-current">
                                <path d="M 18 12 C 15.791 12 14 13.791 14 16 L 14 22 C 14 22.821 14.251656 23.622922 14.722656 24.294922 L 28 43.261719 L 28 55 C 28 56.636 28.996625 58.106844 30.515625 58.714844 L 40.515625 62.714844 C 40.994625 62.906844 41.498 63 42 63 C 42.788 63 43.571188 62.7675 44.242188 62.3125 C 45.342187 61.5685 46 60.327 46 59 L 46 43.261719 L 59.277344 24.294922 C 59.748344 23.622922 60 22.821 60 22 L 60 16 C 60 13.791 58.209 12 56 12 L 18 12 z M 22 20 L 52 20 L 52 20.738281 L 48.316406 26 L 25.683594 26 L 22 20.738281 L 22 20 z"></path>
                              </svg>
                            </button>

                            {/* Popup inside relative container */}
                            {showSubmissionFilter && (
                              <div ref={submissionFilterRef} className="absolute right-0 top-full mt-2 z-20 w-80 rounded-lg border bg-white shadow-lg">
                                <div className="p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-base font-semibold text-gray-900">Filter Submissions</h4>
                                  </div>
                                  <div className="space-y-3">
                                    <div>
                                      <label className="block text-sm text-gray-700 mb-1">Year</label>
                                      <select className="w-full border rounded-md px-2 py-2 text-sm" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                                        <option value="">All Years</option>
                                        <option value="I">I</option>
                                        <option value="II">II</option>
                                        <option value="III">III</option>
                                        <option value="IV">IV</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-sm text-gray-700 mb-1">Section</label>
                                      <select className="w-full border rounded-md px-2 py-2 text-sm" value={filterSection} onChange={(e) => setFilterSection(e.target.value)}>
                                        <option value="">All Sections</option>
                                        <option value="A">A</option>
                                        <option value="B">B</option>
                                        <option value="C">C</option>
                                        <option value="D">D</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-sm text-gray-700 mb-1">Status</label>
                                      <select className="w-full border rounded-md px-2 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                                        <option value="">All</option>
                                        <option value="pending">Pending</option>
                                        <option value="completed">Completed</option>
                                      </select>
                                    </div>
                                    <div className="flex items-center justify-between pt-2">
                                      <button
                                        onClick={() => setSortDescByName(s => !s)}
                                        className="px-3 py-2 border rounded-md text-sm hover:bg-gray-50 bg-white"
                                        title="Toggle name sort (desc)"
                                      >
                                        {sortDescByName ? 'Name ↓' : 'Name'}
                                      </button>
                                      <div className="space-x-2">
                                        <button onClick={() => { setFilterYear(''); setFilterSection(''); setFilterStatus(''); setSortDescByName(false); }} className="px-3 py-2 text-sm text-gray-700 hover:text-gray-900 hover:underline">Clear</button>
                                        <button onClick={() => setShowSubmissionFilter(false)} className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 shadow-sm">Apply</button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Export Pending Button */}
                          {filteredAndSortedSubmissions.length > 0 && (
                            <button
                              onClick={() => {
                                // Logic to export pending only
                                if (!selectedTemplate) return
                                const pendingRows = filteredAndSortedSubmissions.filter(s => !s.submitted_at)
                                if (pendingRows.length === 0) {
                                  toast.info('No pending submissions to export')
                                  return
                                }

                                const exportData = pendingRows.map(s => ({
                                  'Name': s.peer_tutor?.name || 'Unknown',
                                  'Email': s.peer_tutor?.email || 'No email',
                                  'Year & Section': `${s.peer_tutor?.year || ''} - ${s.peer_tutor?.section || ''}`
                                }))

                                const ws = XLSX.utils.json_to_sheet(exportData)
                                const wb = XLSX.utils.book_new()
                                XLSX.utils.book_append_sheet(wb, ws, 'Pending Tutors')
                                const fileName = `Pending_Submissions_${selectedTemplate.name}_${new Date().toISOString().split('T')[0]}.xlsx`
                                XLSX.writeFile(wb, fileName)
                              }}
                              className="px-4 py-2.5 rounded-lg bg-yellow-400 border border-black hover:bg-yellow-500 text-black text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                            >
                              EXPORT PENDING
                            </button>
                          )}

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

                    <div className="overflow-x-auto">
                      {renumerationLoading ? (
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-white">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Peer Tutor</th>
                              <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
                              <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Submitted</th>
                              <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {[...Array(5)].map((_, i) => (
                              <tr key={i} className="animate-pulse border-b border-gray-100">
                                <td className="px-6 py-4">
                                  <div className="flex items-center justify-center">
                                    <div className="h-10 w-10 bg-gray-200 rounded-full mr-4"></div>
                                    <div className="space-y-2 text-left">
                                      <div className="h-4 w-32 bg-gray-200 rounded"></div>
                                      <div className="h-3 w-24 bg-gray-200 rounded"></div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center"><div className="h-6 w-20 bg-gray-200 rounded mx-auto"></div></td>
                                <td className="px-6 py-4 text-center"><div className="h-4 w-24 bg-gray-200 rounded mx-auto"></div></td>
                                <td className="px-6 py-4 text-center"><div className="h-8 w-16 bg-gray-200 rounded mx-auto"></div></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : filteredAndSortedSubmissions.length > 0 ? (
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-white">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
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
                                      <div className="h-10 w-10 rounded-full bg-black border border-gray-800 flex items-center justify-center ring-1 ring-gray-900 shadow-inner">
                                        <span className="text-white font-bold text-sm tracking-tighter">
                                          {submission.peer_tutor?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'PT'}
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
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded uppercase text-xs font-medium bg-red-600 text-white">
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
          </div >
        </main >
      </div >

      {/* Renumeration Modal */}
      {
        user && (
          <RenumerationModal
            isOpen={showRenumerationModal}
            onClose={() => setShowRenumerationModal(false)}
            onSuccess={handleRenumerationSuccess}
            facultyId={user.id}
          />
        )
      }

      {/* Renumeration Details Modal */}
      {
        selectedSubmission && (
          <RenumerationDetailsModal
            submission={selectedSubmission}
            isOpen={showDetailsModal}
            onClose={() => {
              setShowDetailsModal(false)
              setSelectedSubmission(null)
            }}
            onStatusUpdate={handleRenumerationStatusUpdate}
          />
        )
      }

      {/* Feedback Form Modal */}
      {
        user && (
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
        )
      }

      {/* Feedback Responses Modal */}
      {
        selectedFeedbackForm && (
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
        )
      }

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false)
          setItemsToDelete([])
        }}
        onConfirm={handleDeleteConfirm}
        title={
          deleteType === 'peer-tutors'
            ? (itemsToDelete.length > 1 ? 'Confirm Bulk Peer Tutor Deletion' : 'Confirm Peer Tutor Deletion')
            : deleteType === 'students'
              ? (itemsToDelete.length > 1 ? 'Confirm Bulk Student Deletion' : 'Confirm Student Deletion')
              : deleteType === 'renumeration-templates'
                ? (itemsToDelete.length > 1 ? 'Confirm Bulk Template Deletion' : 'Confirm Template Deletion')
                : (itemsToDelete.length > 1 ? 'Confirm Bulk Form Deletion' : 'Confirm Form Deletion')
        }
        itemsToDelete={itemsToDelete}
        type={deleteType}
        isLoading={isDeleting}
      />

      {/* Class Details Modal */}
      {
        showClassModal && selectedClass && (
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
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${record.status === 'present'
                                  ? 'bg-green-400 text-black'
                                  : 'bg-red-400 text-black'
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
        )
      }

      {/* Excel Export Modal */}
      <ExcelExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        peertutorsInfo={null}
        reportData={null}
      />


      {/* Peer Tutor Import Modal */}
      {
        showImportModal && (
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
        )
      }

      {/* Add Student Modal */}
      {
        showAddStudentModal && (
          <UserSelectionModal
            isOpen={showAddStudentModal}
            onClose={() => setShowAddStudentModal(false)}
            onSuccess={() => {
              handleRefresh()
              setShowAddStudentModal(false)
            }}
            mode="student"
            dept={user?.user_metadata?.dept || 'AIDS'}
            year={selectedStudentYear !== 'all' ? selectedStudentYear : ''}
            section={selectedStudentSection !== 'all' ? selectedStudentSection : ''}
            availableYears={availableStudentYears}
            availableSections={availableStudentSections}
          />
        )
      }

      {/* Add Peer Tutor Modal */}
      {
        showAddPeerTutorModal && (
          <UserSelectionModal
            isOpen={showAddPeerTutorModal}
            onClose={() => setShowAddPeerTutorModal(false)}
            onSuccess={() => {
              handleRefresh()
              setShowAddPeerTutorModal(false)
            }}
            mode="peer-tutor"
            dept={user?.user_metadata?.dept || 'AIDS'}
            year={selectedYear !== 'all' ? selectedYear : ''}
            section={selectedSection !== 'all' ? selectedSection : ''}
            availableYears={availableYears}
            availableSections={availableSections}
          />
        )
      }

      {selectedStudentForEmail && (
        <EmailAssignmentModal
          student={selectedStudentForEmail}
          onClose={() => setSelectedStudentForEmail(null)}
          onSuccess={() => {
            handleRefresh()
            setSelectedStudentForEmail(null)
          }}
        />
      )}

      {/* Leaderboard Scoring Modal */}
      {department?.name && department?.id && (
        <LeaderboardScoringModal
          isOpen={showScoringModal}
          onClose={() => setShowScoringModal(false)}
          department={department.name}
          departmentId={department.id}
          currentConfig={scoringConfig}
          onSave={async (config) => {
            setScoringConfig(config)
            // Reload exam summaries if exam weight changed
            if (config.exam_weight > 0 && config.exam_config.length > 0) {
              const includedExams = config.exam_config.filter(e => e.included)
              const summariesMap: Record<string, ExamPeerTutorSummary[]> = {}
              await Promise.all(
                includedExams.map(async (examCfg) => {
                  const summaries = await ExamSummaryService.getSummariesForExam(examCfg.exam_id)
                  summariesMap[examCfg.exam_id] = summaries
                })
              )
              setExamSummariesMap(summariesMap)
            } else {
              setExamSummariesMap({})
            }
            toast.success('Scoring rules updated successfully')
          }}
        />
      )}
    </div>
  )
}
