'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { FacultyService } from '@/lib/services/facultyService'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { StudentService } from '@/lib/services/studentService'
import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, Check, Clock, GraduationCap, Link as LinkIcon, Loader2, Mail, Settings, Shield, Users, X, Send, Paperclip, FileText } from 'lucide-react'
import { ReportService } from '@/lib/services/reportService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { AnimatedRefreshButton } from '@/components/ui/AnimatedRefreshButton'
import { useRouter, useSearchParams } from 'next/navigation'
import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/client'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import SettingsSkeleton from '@/components/skeletons/SettingsSkeleton'
import { toast } from 'sonner'

// Types for recipients
interface Recipient {
  id: string
  name: string
  email: string
  type: 'peer_tutor' | 'student' | 'superadmin'
  year?: string
  peerTutorId?: string
  peerTutorName?: string
}

interface Superadmin {
  id: string
  name: string
  email: string
}

export default function SettingsPage() {
  return (
    <FacultyProtectedRoute>
      <SettingsContent />
    </FacultyProtectedRoute>
  )
}

function SettingsContent() {
  const { user } = useAuth()
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [stats, setStats] = useState<{
    department: string
    totalpeerTutor: number
    totalStudents: number
  }>({
    department: '',
    totalpeerTutor: 0,
    totalStudents: 0
  })

  // Store faculty ID for direct updates
  const [facultyId, setFacultyId] = useState<string | null>(null)

  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')

  // Send Mail state
  const [emailTab, setEmailTab] = useState<'daily' | 'send_mail'>(
    tabParam === 'send_mail' ? 'send_mail' : 'daily'
  )

  // Sync emailTab with URL query param when navigating from search bar
  useEffect(() => {
    if (tabParam === 'send_mail') setEmailTab('send_mail')
    else if (tabParam === 'daily') setEmailTab('daily')
  }, [tabParam])

  const [recipientType, setRecipientType] = useState<'peer_tutor' | 'student' | 'superadmin'>('peer_tutor')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterYear, setFilterYear] = useState<string>('all')
  const [filterPeerTutor, setFilterPeerTutor] = useState<string>('all')
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  
  // Attachments & Reports State
  const [attachments, setAttachments] = useState<File[]>([])
  const [selectedReports, setSelectedReports] = useState<string[]>([])
  const [generatingReports, setGeneratingReports] = useState(false)
  const [availableRecipients, setAvailableRecipients] = useState<Recipient[]>([])
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([])
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  
  const [superadmins, setSuperadmins] = useState<Superadmin[]>([])

  // Class Settings
  const [isClassLinkMandatory, setIsClassLinkMandatory] = useState(true)

  // Email Automation Settings
  const [enableDailyReminders, setEnableDailyReminders] = useState(false)
  const [enablePendingReminders, setEnablePendingReminders] = useState(false)
  const [pendingThreshold, setPendingThreshold] = useState(3)
  const [excludeAdditional, setExcludeAdditional] = useState(false)
  const [morningTime, setMorningTime] = useState("08:00")
  const [morningMessage, setMorningMessage] = useState("This is a reminder for your scheduled class today. Please ensure you conduct the class on time.")
  const [pendingMessage, setPendingMessage] = useState("You have consecutive pending classes. Please complete them and update the status immediately.")
  
  const [emailLastSent, setEmailLastSent] = useState<string | null>(null)

  const [updatingSettings, setUpdatingSettings] = useState(false)

  // Check if sidebar is collapsed
  const [isSidebarCollapsed] = useSidebarCollapsed()

  // Fetch superadmins on mount
  useEffect(() => {
    const fetchSuperadmins = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('superadmin')
          .select('*')
          .order('name', { ascending: true })

        if (error) {
          logger.error('Error fetching superadmins:', error)
          return
        }

        setSuperadmins(data || [])
      } catch (error) {
        logger.error('Error in fetchSuperadmins:', error)
      }
    }
    fetchSuperadmins()
  }, [])

  const loadData = useCallback(async () => {
    try {
      if (!user?.email) return

      // Get faculty department
      const facultyDept = await FacultyService.verifyFacultyAccess(user.email)
      const deptName = facultyDept?.name || 'Not Assigned'

      // Load settings
      if (facultyDept) {
        setFacultyId(facultyDept.id)
        setIsClassLinkMandatory(facultyDept.is_class_link_mandatory !== false) // Default to true if null/undefined
        setEnableDailyReminders(facultyDept.enable_daily_reminders || false)
        setEnablePendingReminders(facultyDept.enable_pending_reminders || false)
        setPendingThreshold(facultyDept.pending_class_threshold || 3)
        setExcludeAdditional(facultyDept.exclude_additional_classes || false)
        if (facultyDept.morning_reminder_time) setMorningTime(facultyDept.morning_reminder_time)
        if (facultyDept.morning_reminder_message) setMorningMessage(facultyDept.morning_reminder_message)
        if (facultyDept.pending_warning_message) setPendingMessage(facultyDept.pending_warning_message)
        setEmailLastSent(facultyDept.last_daily_reminder_date || null)
      }

      // Get all peer tutors for this department
      const peerTutor = await peertutorservice.getpeerTutorByDepartment(deptName)

      // Get all students assigned to these peer tutors
      let totalStudents = 0
      for (const tutor of peerTutor) {
        const students = await StudentService.getStudentsBypeertutors(tutor.id)
        totalStudents += students.length
      }

      setStats({
        department: deptName,
        totalpeerTutor: peerTutor.length,
        totalStudents
      })
    } catch (error) {
      logger.error('Error loading settings data:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.email])

  useEffect(() => {
    if (user) {
      loadData()
    }
  }, [user, loadData])

  // Auto-send email reminders when the configured time arrives
  const autoSendTriggeredRef = useRef<string | null>(null) // tracks which date was already auto-sent
  useEffect(() => {
    if (!enableDailyReminders || !morningTime) return

    const checkAndSend = async () => {
      const now = new Date()
      const todayStr = now.toISOString().split('T')[0]

      // Don't re-send if already triggered today
      if (autoSendTriggeredRef.current === todayStr) return
      // Don't send if already sent (check DB state)
      if (emailLastSent === todayStr) {
        autoSendTriggeredRef.current = todayStr
        return
      }

      // Check if current time matches the configured reminder time (match hour and minute)
      const [rHour, rMin] = morningTime.split(':').map(Number)
      const currentHour = now.getHours()
      const currentMin = now.getMinutes()

      // Trigger if we are within the same hour:minute window (or up to 2 minutes after)
      if (currentHour === rHour && currentMin >= rMin && currentMin <= rMin + 2) {
        autoSendTriggeredRef.current = todayStr
        logger.info('[Auto-Send] Time matched! Triggering email automation...')
        
        try {
          const res = await fetch('/api/settings/test-email-automation', { method: 'POST' })
          const data = await res.json()
          if (data.success) {
            if (data.sentCount > 0) {
              toast.success(`Daily reminder sent to ${data.sentCount} peer tutor(s)!`)
            }
            if (data.errors?.length > 0) {
              toast.error(`${data.errors.length} email error(s) occurred`)
            }
            // Refresh to update status indicator
            loadData()
          } else {
            toast.error('Auto-send failed: ' + (data.error || 'Unknown error'))
            // Reset so it can retry
            autoSendTriggeredRef.current = null
          }
        } catch (e) {
          logger.error('[Auto-Send] Error:', e)
          toast.error('Auto-send error: ' + String(e))
          autoSendTriggeredRef.current = null
        }
      }
    }

    // Check immediately and then every 30 seconds
    checkAndSend()
    const interval = setInterval(checkAndSend, 30000)
    return () => clearInterval(interval)
  }, [enableDailyReminders, morningTime, emailLastSent, loadData])

  // Load recipients based on type
  useEffect(() => {
    const loadRecipients = async () => {
      if (!stats.department || stats.department === 'Not Assigned') return

      setLoadingRecipients(true)
      setAvailableRecipients([])

      try {
        if (recipientType === 'peer_tutor') {
          const tutors = await peertutorservice.getpeerTutorByDepartment(stats.department)
          setAvailableRecipients(tutors.map(t => ({
            id: t.id,
            name: t.name,
            email: t.email,
            type: 'peer_tutor' as const,
            year: t.year
          })))
        } else if (recipientType === 'student') {
          const tutors = await peertutorservice.getpeerTutorByDepartment(stats.department)
          const allStudents: Recipient[] = []
          for (const tutor of tutors) {
            const students = await StudentService.getStudentsBypeertutors(tutor.id)
            students.forEach(s => {
              if (!allStudents.find(existing => existing.id === s.id)) {
                allStudents.push({
                  id: s.id,
                  name: s.name,
                  email: s.email || '',
                  type: 'student' as const,
                  year: s.year,
                  peerTutorId: tutor.id,
                  peerTutorName: tutor.name
                })
              }
            })
          }
          setAvailableRecipients(allStudents)
        } else if (recipientType === 'superadmin') {
          setAvailableRecipients(superadmins.map(s => ({
            id: s.id,
            name: s.name,
            email: s.email,
            type: 'superadmin' as const
          })))
        }
      } catch (error) {
        logger.error('Error loading recipients:', error)
      } finally {
        setLoadingRecipients(false)
      }
    }

    loadRecipients()
  }, [recipientType, stats.department, superadmins])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await loadData()
    } finally {
      setTimeout(() => setIsRefreshing(false), 800)
    }
  }

  // Filter recipients based on search and filters
  const filteredRecipients = availableRecipients.filter(recipient => {
    // 1. Search Query
    const matchesSearch = 
      recipient.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      recipient.email.toLowerCase().includes(searchQuery.toLowerCase())

    // 2. Year Filter
    const matchesYear = filterYear === 'all' || recipient.year === filterYear

    // 3. Peer Tutor Filter (Only for Students)
    const matchesPeerTutor = filterPeerTutor === 'all' || recipient.peerTutorId === filterPeerTutor

    return matchesSearch && matchesYear && matchesPeerTutor
  })

  const toggleRecipient = (recipient: Recipient) => {
    setSelectedRecipients(prev => {
      const exists = prev.find(r => r.id === recipient.id)
      if (exists) {
        return prev.filter(r => r.id !== recipient.id)
      }
      return [...prev, recipient]
    })
  }

  const selectAllRecipients = () => {
    // Select all CURRENTLY FILTERED recipients
    // Verify if we should add to existing selection or replace. 
    // Standard "Select All" usually selects all visible. 
    // Let's add all visible to the current selection (avoiding duplicates).
    
    setSelectedRecipients(prev => {
       const newSelection = [...prev]
       filteredRecipients.forEach(r => {
          if (!newSelection.find(existing => existing.id === r.id)) {
             newSelection.push(r)
          }
       })
       return newSelection
    })
  }

  const clearAllRecipients = () => {
    setSelectedRecipients([])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      // Limit total files
      if (attachments.length + newFiles.length > 5) {
        toast.error('Maximum 5 files allowed')
        return
      }
      setAttachments(prev => [...prev, ...newFiles])
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleSendMail = async () => {
    if (selectedRecipients.length === 0) {
      setSendStatus({ type: 'error', message: 'Please select at least one recipient' })
      return
    }
    if (!subject.trim()) {
      setSendStatus({ type: 'error', message: 'Please enter a subject' })
      return
    }
    if (!content.trim()) {
      setSendStatus({ type: 'error', message: 'Please enter email content' })
      return
    }

    setIsSending(true)
    setSendStatus(null)

    try {
      // 1. Generate Reports if selected
      const finalAttachments: File[] = [...attachments]
      
      if (selectedReports.length > 0) {
        setGeneratingReports(true)
        const dept = stats.department || 'Unknown Dept'

        if (selectedReports.includes('students')) {
           const students = await StudentService.getStudentsByDepartment(dept)
           const file = await ReportService.generateStudentReport(students, dept)
           finalAttachments.push(file)
        }
        if (selectedReports.includes('tutors')) {
           const tutors = await peertutorservice.getpeerTutorByDepartment(dept)
           const file = await ReportService.generatePeerTutorReport(tutors, dept)
           finalAttachments.push(file)
        }
        if (selectedReports.includes('mapping')) {
           const mappingData = await ReportService.fetchMappingData(dept)
           const file = await ReportService.generateMappingReport(mappingData, dept)
           finalAttachments.push(file)
        }
        if (selectedReports.includes('classes')) {
           const classes = await ScheduledClassService.getScheduledClassesByDepartment(dept)
           const file = await ReportService.generateClassReport(classes, dept)
           finalAttachments.push(file)
        }
        setGeneratingReports(false)
      }

      // 2. Convert attachments to base64
      const processedAttachments = await Promise.all(finalAttachments.map(async (file) => {
        return new Promise<{ name: string, contentBytes: string, contentType: string }>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => {
             const result = reader.result as string
             // Remove data URL prefix (e.g., "data:application/pdf;base64,")
             const base64 = result.split(',')[1]
             resolve({
                name: file.name,
                contentBytes: base64,
                contentType: file.type || 'application/octet-stream'
             })
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      }))

      const response = await fetch('/api/microsoft/send-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedRecipients.map(r => r.email),
          subject: subject.trim(),
          content: content.trim(),
          attachments: processedAttachments
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email')
      }

      setSendStatus({ type: 'success', message: `Email sent successfully to ${selectedRecipients.length} recipient(s)!` })
      // Clear form
      setSelectedRecipients([])
      setSubject('')
      setContent('')
      setAttachments([])
      setSelectedReports([])
    } catch (error) {
      logger.error('Error sending email:', error)
      setSendStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to send email'
      })
    } finally {
      setIsSending(false)
      setGeneratingReports(false)
    }
  }

  const handleToggleDailyReminders = async () => {
    const newValue = !enableDailyReminders
    setEnableDailyReminders(newValue) // Optimistic update

    // Use stored facultyId or fetch it if missing
    let id = facultyId
    if (!id && user?.email) {
      try {
        const dept = await FacultyService.verifyFacultyAccess(user.email)
        if (dept) {
          id = dept.id
          setFacultyId(dept.id)
        }
      } catch (e) {
        logger.error('Error fetching faculty ID for toggle:', e)
      }
    }

    if (id) {
      try {
        await FacultyService.updateFacultySettings(id, { enable_daily_reminders: newValue })
      } catch (error) {
        logger.error('Error updating daily reminders toggle:', error)
        setEnableDailyReminders(!newValue) // Revert on error
        setSendStatus({ type: 'error', message: 'Failed to update setting' })
      }
    } else {
      setEnableDailyReminders(!newValue) // Revert if no ID found
    }
  }

  const handleToggleClassLinkMandatory = async () => {
    if (!stats.department || stats.department === 'Not Assigned') return

    setUpdatingSettings(true)
    try {
      // Get faculty ID (we need to get it again or store it - retrieving from service for now or assuming we can get from dept)
      // Since we don't have the ID readily available in stats, let's re-verify or better yet, verifyFacultyAccess returns the object with ID.
      // We should probably store the full department object in state, but to minimize changes, let's fetch ID via service or rely on verifyFacultyAccess being cached/fast

      const facultyDept = await FacultyService.verifyFacultyAccess(user?.email || '')
      if (facultyDept) {
        const newValue = !isClassLinkMandatory
        const success = await FacultyService.updateFacultySettings(facultyDept.id, {
          is_class_link_mandatory: newValue
        })

        if (success) {
          setIsClassLinkMandatory(newValue)
          // toast.success is not available here unless we import toast from sonner, assuming no toast for now or basic alert/no-op? 
          // The page doesn't seem to import toast. Let's just update state.
        }
      }
    } catch (error) {
      logger.error('Error updating settings:', error)
    } finally {
      setUpdatingSettings(false)
    }
  }

  // Helper to get initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || 'Faculty Member'
  const userInitials = getInitials(userName)

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <div className={`${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
          <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 h-20 flex items-center px-8">
            <div className="flex justify-between items-center w-full">
              <div>
                <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>
          </header>
          <SettingsSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className={`${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col transition-all duration-300 w-full lg:w-auto`}>
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 h-20 flex items-center px-8">
          <div className="flex justify-between items-center w-full">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                  PROFILE & SETTINGS
                </h1>
              </div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">
                Faculty Account Information
              </p>
            </div>
            <div className="flex items-center gap-4">
              <AnimatedRefreshButton onRefresh={handleRefresh} isRefreshing={isRefreshing} />
              <button
                onClick={() => router.back()}
                className="h-12 w-12 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center transition-all shadow-sm hover:shadow-md"
                title="Go Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-8 max-w-[1400px] mx-auto w-full">
          {/* Profile Section */}
          <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm hover:shadow-md transition-all mb-8">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
              {/* Profile Picture */}
              <div className="flex-shrink-0">
                <div className="relative">
                  <div className="h-32 w-32 rounded-full bg-[#1e293b] flex items-center justify-center ring-4 ring-[#bef264]  shadow-lg">
                    <span className="text-4xl font-bold text-white tracking-widest">
                      {userInitials}
                    </span>
                  </div>
                  <div className="absolute bottom-2 right-2 h-6 w-6 rounded-full bg-[#bef264]  shadow-sm"></div>
                </div>
              </div>

              {/* Profile Info */}
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-3xl font-black text-gray-900 mb-2">
                  {userName}
                </h2>
                <p className="text-sm text-gray-500 mb-4">{user?.email}</p>

                <div className="flex flex-col sm:flex-row items-center md:items-start gap-4 mt-6">
                  <div className="flex items-center gap-3 px-4 py-2 bg-black rounded-xl shadow-sm border border-gray-800">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Department</p>
                      <p className="text-sm font-bold text-white">{stats.department}</p>
                    </div>
                  </div>
                  {superadmins.length > 0 && (
                    <div className="flex items-center gap-3 px-4 py-2 bg-black rounded-xl shadow-sm border border-gray-800">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Superadmin</p>
                        <p className="text-sm font-bold text-white">{superadmins[0]?.name || 'N/A'}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Statistics (Moved from below) */}
              <div className="flex flex-col sm:flex-row gap-4 mt-6 md:mt-0 md:ml-auto items-center self-center">
                {/* Total Peer Tutors */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 min-w-[160px]">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Peer Tutors</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.totalpeerTutor}</p>
                    </div>
                    <div className="p-1.5 bg-white rounded-lg border border-gray-100">
                      <Users className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                      Active
                    </p>
                  </div>
                </div>

                {/* Total Students */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 min-w-[160px]">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Students</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.totalStudents}</p>
                    </div>
                    <div className="p-1.5 bg-white rounded-lg border border-gray-100">
                      <GraduationCap className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">
                      Allocated
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>



          {/* Class Configuration Section */}
          <div className="mb-6">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6 px-2 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Class Configuration
            </h3>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gray-200 rounded-xl text-white shadow-sm shadow-blue-200/50">
                  <LinkIcon className="w-6 h-6 text-black" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Mandatory Class Link</h4>
                  <p className="text-xs text-gray-500 mt-1 max-w-md">
                    When enabled, students must provide a valid meeting link when adding an additional class.
                  </p>
                </div>
              </div>

              <button
                onClick={handleToggleClassLinkMandatory}
                disabled={updatingSettings}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isClassLinkMandatory ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
              >
                <span
                  className={`${isClassLinkMandatory ? 'translate-x-6' : 'translate-x-1'
                    } inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm`}
                />
              </button>
            </div>
          </div>

          {/* Email Automation Settings */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Email Automation
              </h3>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">


              
              {/* Tabs Navigation */}
              <div className="flex border-b border-gray-200 bg-gray-50">
                    <button
                      onClick={() => setEmailTab('daily')}
                      className={`flex-1 px-6 py-4 text-sm font-bold uppercase tracking-wide transition-colors relative ${emailTab === 'daily'
                        ? 'text-black bg-white'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Clock className="w-4 h-4" />
                        Daily Reminder
                      </div>
                      {emailTab === 'daily' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
                      )}
                    </button>
                    <button
                      onClick={() => setEmailTab('send_mail')}
                      className={`flex-1 px-6 py-4 text-sm font-bold uppercase tracking-wide transition-colors relative ${emailTab === 'send_mail'
                        ? 'text-black bg-white'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Mail className="w-4 h-4" />
                        Send Mail
                      </div>
                      {emailTab === 'send_mail' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
                      )}
                    </button>
                  </div>

                  {/* Tab Content */}
                  <div className="p-6">
                    {emailTab === 'daily' ? (
                      <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Enable Daily Toggle */}
                        <div className="flex items-center justify-between p-4 bg-gray-100 rounded-xl border border-purple-100">
                          <div>
                             <h4 className="text-sm font-bold text-purple-900 uppercase tracking-wide">Enable Daily Reminders</h4>
                             <p className="text-[10px] text-black mt-0.5">Automatically send morning reminders to peer tutors</p>
                          </div>
                          <button
                            onClick={handleToggleDailyReminders}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${enableDailyReminders ? 'bg-purple-600' : 'bg-gray-300'}`}
                          >
                            <span className={`${enableDailyReminders ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm`} />
                          </button>
                        </div>

                        {/* Content disabled if toggle off */}
                        <div className={`space-y-6 transition-opacity duration-200 ${enableDailyReminders ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                        {/* Morning Reminder Time - Fixed */}
                        <div className="space-y-3">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            Morning Reminder Schedule
                          </label>
                          <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                            <Clock className="w-5 h-5 text-purple-600" />
                            <div>
                               <p className="text-sm font-bold text-gray-900">09:50 AM</p>
                               <p className="text-[10px] text-gray-500 font-medium">Daily Automatic Schedule (IST)</p>
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-400">
                            System will automatically send reminders at 09:50 AM IST.
                          </p>
                        </div>

                        {/* Morning Reminder Message */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Morning Reminder Message</label>
                          <p className="text-[10px] text-gray-400 mb-2 flex items-center gap-2">
                            Available placeholders:
                            <code className="bg-gray-100 px-2.5 py-1 rounded-md text-gray-900 font-medium border border-gray-200">{'{'}class_names{'}'}</code>
                            <code className="bg-gray-100 px-2.5 py-1 rounded-md text-gray-900 font-medium border border-gray-200">{'{'}tutor_name{'}'}</code>
                          </p>
                          <textarea
                            value={morningMessage}
                            onChange={(e) => setMorningMessage(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                            placeholder="Dear {tutor_name}, you have classes scheduled today: {class_names}"
                          />
                        </div>

                        {/* Preview Info */}
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                          <p className="text-xs font-bold text-gray-900 mb-2">How it works:</p>
                          <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                            <li>Checks for scheduled classes every hour</li>
                            <li>Sends email when current time matches reminder time</li>
                            <li>Groups all classes per peer tutor into one email</li>
                          </ul>
                        </div>

                        {/* Status & Test Section */}
                        <div className="pt-4 border-t border-gray-100">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Status for Today</p>
                              <div className="flex items-center gap-2">
                                {stats.department && (() => {
                                  const todayStr = new Date().toISOString().split('T')[0]
                                  const isSentToday = emailLastSent === todayStr

                                  if (isSentToday) {
                                    return (
                                      <>
                                        <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                                        <p className="text-sm font-bold text-green-700">Sent</p>
                                      </>
                                    )
                                  }

                                  // Check if the scheduled time has passed today (10:00 AM)
                                  const now = new Date()
                                  // Fixed at 10:00 AM for cutoff
                                  const rHour = 10
                                  const rMin = 0
                                  const reminderToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), rHour, rMin)
                                  const hasTimePassed = now >= reminderToday

                                  if (hasTimePassed) {
                                    // Time has passed but not sent → failed
                                    return (
                                      <>
                                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                        <p className="text-sm font-bold text-red-700">Failed to Send</p>
                                      </>
                                    )
                                  }

                                  // Time hasn't come yet → upcoming
                                  return (
                                    <>
                                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                                      <p className="text-sm font-bold text-blue-700">Upcoming</p>
                                    </>
                                  )
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Save Settings Button */}
                        <div className="pt-4 border-t border-gray-100">
                          <button
                            onClick={async () => {
                              setUpdatingSettings(true)
                              try {
                                const facultyDept = await FacultyService.verifyFacultyAccess(user?.email || '')
                                if (facultyDept) {
                                  await FacultyService.updateFacultySettings(facultyDept.id, {
                                    enable_daily_reminders: enableDailyReminders,
                                    enable_pending_reminders: enablePendingReminders,
                                    pending_class_threshold: pendingThreshold,
                                    exclude_additional_classes: excludeAdditional,
                                    morning_reminder_time: morningTime,
                                    morning_reminder_message: morningMessage,
                                    pending_warning_message: pendingMessage
                                  })
                                  toast.success('Settings saved successfully!')
                                }
                              } catch (e) {
                                logger.error('Error saving settings', e)
                                toast.error('Failed to save settings')
                              } finally {
                                setUpdatingSettings(false)
                              }
                            }}
                            disabled={updatingSettings}
                            className="w-full px-4 py-3 bg-black text-white rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {updatingSettings ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4" />
                                Save Settings
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                    ) : (
                      <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Send Mail Section Moved Here */}
                        <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm">
                          {/* Status Message */}
                          {sendStatus && (
                            <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${sendStatus.type === 'success'
                              ? 'bg-green-50 text-green-800 border border-green-200'
                              : 'bg-red-50 text-red-800 border border-red-200'
                              }`}>
                              {sendStatus.type === 'success' ? (
                                <Check className="w-5 h-5 text-green-600" />
                              ) : (
                                <X className="w-5 h-5 text-red-600" />
                              )}
                              <span className="text-sm font-medium">{sendStatus.message}</span>
                            </div>
                          )}

                          {/* Recipient Type Selector */}
                          <div className="mb-6">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 block">
                              Select Recipient Type
                            </label>
                            <div className="flex flex-wrap gap-3">
                              <button
                                onClick={() => { 
                                   setRecipientType('peer_tutor'); 
                                   setSelectedRecipients([]);
                                   setSearchQuery('');
                                   setFilterYear('all');
                                   setFilterPeerTutor('all');
                                }}
                                className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${recipientType === 'peer_tutor'
                                  ? 'bg-blue-600 text-white shadow-md'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                              >
                                <Users className="w-4 h-4" />
                                Peer Tutors
                              </button>
                              <button
                                onClick={() => { 
                                   setRecipientType('student'); 
                                   setSelectedRecipients([]);
                                   setSearchQuery('');
                                   setFilterYear('all');
                                   setFilterPeerTutor('all');
                                }}
                                className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${recipientType === 'student'
                                  ? 'bg-emerald-600 text-white shadow-md'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                              >
                                <GraduationCap className="w-4 h-4" />
                                Students
                              </button>
                              <button
                                onClick={() => { 
                                   setRecipientType('superadmin'); 
                                   setSelectedRecipients([]);
                                   setSearchQuery('');
                                   setFilterYear('all');
                                   setFilterPeerTutor('all');
                                }}
                                className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${recipientType === 'superadmin'
                                  ? 'bg-purple-600 text-white shadow-md'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                              >
                                <Shield className="w-4 h-4" />
                                Superadmin
                              </button>
                            </div>
                          </div>

                          {/* Search & Filters (Only for Peer Tutors and Students) */}
                          {(recipientType === 'peer_tutor' || recipientType === 'student') && (
                             <div className="mb-6 space-y-4">
                                {/* Search Bar */}
                                <div>
                                   <div className="relative">
                                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                         <Users className="h-4 w-4 text-gray-400" />
                                      </div>
                                      <input
                                         type="text"
                                         value={searchQuery}
                                         onChange={(e) => setSearchQuery(e.target.value)}
                                         className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:placeholder-gray-500 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                         placeholder="Search by name or email..."
                                      />
                                   </div>
                                </div>

                                <div className="flex flex-wrap gap-4">
                                   {/* Year Filter */}
                                   <div className="min-w-[120px]">
                                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">
                                         Filter by Year
                                      </label>
                                      <select
                                         value={filterYear}
                                         onChange={(e) => setFilterYear(e.target.value)}
                                         className="block w-full pl-3 pr-10 py-2.5 text-xs border border-gray-200 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-xl bg-gray-50/50"
                                      >
                                         <option value="all">All Years</option>
                                         {/* Get unique years from available recipients */}
                                         {Array.from(new Set(availableRecipients.map(r => r.year).filter(Boolean))).sort().map(year => (
                                            <option key={year} value={year}>{year}</option>
                                         ))}
                                      </select>
                                   </div>

                                   {/* Peer Tutor Filter (Only for Students) */}
                                   {recipientType === 'student' && (
                                      <div className="min-w-[200px] flex-1">
                                         <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">
                                            Filter by Peer Tutor
                                         </label>
                                         <select
                                            value={filterPeerTutor}
                                            onChange={(e) => setFilterPeerTutor(e.target.value)}
                                            className="block w-full pl-3 pr-10 py-2.5 text-xs border border-gray-200 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-xl bg-gray-50/50"
                                         >
                                            <option value="all">All Peer Tutors</option>
                                            {/* Get unique peer tutors from available recipients */}
                                            {Array.from(new Map(availableRecipients.map(r => [r.peerTutorId, r.peerTutorName] as [string, string])).entries())
                                                .filter(([id]) => id)
                                                .map(([id, name]) => (
                                               <option key={id} value={id}>{name}</option>
                                            ))}
                                         </select>
                                      </div>
                                   )}
                                </div>
                             </div>
                          )}

                          {/* Recipients List */}
                          <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                Select Recipients ({selectedRecipients.length} selected)
                              </label>
                              <div className="flex gap-2">
                                <button
                                  onClick={selectAllRecipients}
                                  className="text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wide"
                                >
                                  Select All Filtered
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                  onClick={clearAllRecipients}
                                  className="text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wide"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>

                            <div className="border border-gray-200 rounded-xl max-h-48 overflow-y-auto">
                              {loadingRecipients ? (
                                <div className="p-4 text-center text-gray-500">
                                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                                  <span className="text-xs">Loading recipients...</span>
                                </div>
                              ) : filteredRecipients.length === 0 ? (
                                <div className="p-4 text-center text-gray-500 text-sm">
                                  No recipients found matching filters
                                </div>
                              ) : (
                                filteredRecipients.map(recipient => (
                                  <button
                                    key={recipient.id}
                                    onClick={() => toggleRecipient(recipient)}
                                    className={`w-full flex items-center justify-between p-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${selectedRecipients.find(r => r.id === recipient.id) ? 'bg-blue-50' : ''
                                      }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${selectedRecipients.find(r => r.id === recipient.id)
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-black text-white'
                                        }`}>
                                        {recipient.name.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="text-left">
                                        <p className="text-sm font-medium text-gray-900">{recipient.name}</p>
                                        <p className="text-xs text-gray-500">{recipient.email}</p>
                                      </div>
                                    </div>
                                    {selectedRecipients.find(r => r.id === recipient.id) && (
                                      <Check className="w-4 h-4 text-blue-600" />
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Subject */}
                          <div className="mb-6">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                              Subject
                            </label>
                            <input
                              type="text"
                              value={subject}
                              onChange={(e) => setSubject(e.target.value)}
                              placeholder="Enter email subject..."
                              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>

                          {/* Content */}
                          <div className="mb-6">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                              Content
                            </label>
                            <textarea
                              value={content}
                              onChange={(e) => setContent(e.target.value)}
                              placeholder="Enter your message..."
                              rows={6}
                              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            />
                          </div>

                          {/* Attachments Section */}
                          <div className="mb-6">
                             <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                  Attachments
                                </label>
                                <label className="cursor-pointer text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wide flex items-center gap-1">
                                   <Paperclip className="w-3 h-3" />
                                   Add Files
                                   <input type="file" multiple onChange={handleFileChange} className="hidden" />
                                </label>
                             </div>
                             
                             {attachments.length > 0 && (
                                <div className="space-y-2 mb-4">
                                   {attachments.map((file, idx) => (
                                     <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-100">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                           <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                           <span className="text-xs text-gray-700 truncate max-w-[200px]">{file.name}</span>
                                           <span className="text-[10px] text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                                        </div>
                                        <button onClick={() => removeAttachment(idx)} className="text-gray-400 hover:text-red-500">
                                           <X className="w-4 h-4" />
                                        </button>
                                     </div>
                                   ))}
                                </div>
                             )}

                             {/* Auto-Generate Reports (Only for Superadmin) */}
                             {recipientType === 'superadmin' && (
                                <div className="p-4 bg-gray-100 rounded-xl border border-purple-100 mt-4">
                                   <h4 className="text-xs font-bold text-black uppercase tracking-wide mb-3 flex items-center gap-2">
                                      <FileText className="w-3 h-3" />
                                      Auto-Attach System Reports
                                   </h4>
                                   <div className="grid grid-cols-2 gap-3">
                                      {[
                                        { id: 'students', label: 'Students List' },
                                        { id: 'tutors', label: 'Peer Tutors List' },
                                        { id: 'mapping', label: 'Mapping List' },
                                        { id: 'classes', label: 'Scheduled Classes' }
                                      ].map((report) => (
                                        <label key={report.id} className="flex items-center gap-2 cursor-pointer">
                                           <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                              selectedReports.includes(report.id) ? 'bg-black border-black' : 'bg-white border-gray-300'
                                           }`}>
                                              {selectedReports.includes(report.id) && <Check className="w-3 h-3 text-white" />}
                                           </div>
                                           <input 
                                              type="checkbox" 
                                              className="hidden"
                                              checked={selectedReports.includes(report.id)}
                                              onChange={() => {
                                                 if (selectedReports.includes(report.id)) {
                                                    setSelectedReports(prev => prev.filter(id => id !== report.id))
                                                 } else {
                                                    setSelectedReports(prev => [...prev, report.id])
                                                 }
                                              }}
                                           />
                                           <span className="text-xs font-medium text-purple-800">{report.label}</span>
                                        </label>
                                      ))}
                                   </div>
                                </div>
                             )}
                          </div>

                          {/* Send Button */}
                          <button
                            onClick={handleSendMail}
                            disabled={isSending || selectedRecipients.length === 0 || !subject.trim() || !content.trim()}
                            className={`w-full py-4 rounded-xl text-white font-bold uppercase tracking-wider flex items-center justify-center gap-3 transition-all ${isSending || selectedRecipients.length === 0 || !subject.trim() || !content.trim()
                              ? 'bg-gray-300 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg'
                              }`}
                          >
                            {isSending ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                {generatingReports ? 'Generating Reports...' : 'Sending...'}
                              </>
                            ) : (
                              <>
                                <Send className="w-5 h-5" />
                                Send Email
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
