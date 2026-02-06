'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { FacultyService } from '@/lib/services/facultyService'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { StudentService } from '@/lib/services/studentService'
import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Mail, Send, Users, GraduationCap, Shield, X, Check, Loader2, Settings, Link as LinkIcon } from 'lucide-react'
import { AnimatedRefreshButton } from '@/components/ui/AnimatedRefreshButton'
import { useRouter } from 'next/navigation'
import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/client'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import SettingsSkeleton from '@/components/skeletons/SettingsSkeleton'

// Types for recipients
interface Recipient {
  id: string
  name: string
  email: string
  type: 'peer_tutor' | 'student' | 'superadmin'
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

  // Send Mail state
  const [recipientType, setRecipientType] = useState<'peer_tutor' | 'student' | 'superadmin'>('peer_tutor')
  const [availableRecipients, setAvailableRecipients] = useState<Recipient[]>([])
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([])
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [superadmins, setSuperadmins] = useState<Superadmin[]>([])

  // Class Settings
  const [isClassLinkMandatory, setIsClassLinkMandatory] = useState(true)
  const [updatingSettings, setUpdatingSettings] = useState(false)

  // Check if sidebar is collapsed
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
        setIsClassLinkMandatory(facultyDept.is_class_link_mandatory !== false) // Default to true if null/undefined
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
            type: 'peer_tutor' as const
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
                  email: s.email,
                  type: 'student' as const
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
    setSelectedRecipients(availableRecipients)
  }

  const clearAllRecipients = () => {
    setSelectedRecipients([])
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
      const response = await fetch('/api/microsoft/send-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedRecipients.map(r => r.email),
          subject: subject.trim(),
          content: content.trim()
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
    } catch (error) {
      logger.error('Error sending email:', error)
      setSendStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to send email'
      })
    } finally {
      setIsSending(false)
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
                  <div className="h-32 w-32 rounded-full bg-[#1e293b] flex items-center justify-center ring-4 ring-[#bef264] ring-offset-4 ring-offset-white shadow-lg">
                    <span className="text-4xl font-bold text-white tracking-widest">
                      {userInitials}
                    </span>
                  </div>
                  <div className="absolute bottom-2 right-2 h-6 w-6 rounded-full bg-[#bef264] border-4 border-white shadow-sm"></div>
                </div>
              </div>

              {/* Profile Info */}
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-3xl font-black text-gray-900 mb-2">
                  {userName}
                </h2>
                <p className="text-sm text-gray-500 mb-4">{user?.email}</p>

                <div className="flex flex-col sm:flex-row items-center md:items-start gap-4 mt-6">
                  <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 rounded-xl">
                    <div>
                      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Department</p>
                      <p className="text-sm font-bold text-blue-900">{stats.department}</p>
                    </div>
                  </div>
                  {superadmins.length > 0 && (
                    <div className="flex items-center gap-3 px-4 py-2 bg-purple-50 rounded-xl">
                      <div>
                        <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Superadmin</p>
                        <p className="text-sm font-bold text-purple-900">{superadmins[0]?.name || 'N/A'}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Statistics Section */}
          <div className="mb-6">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6 px-2">
              Statistics Overview
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Total Peer Tutors */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Total Peer Tutors</p>
                  <p className="text-3xl font-bold text-gray-900 tracking-tight">{stats.totalpeerTutor}</p>
                </div>
                <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                  <Users className="w-4 h-4 text-gray-400" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                  Across All Sections
                </p>
              </div>
            </div>

            {/* Total Students Allocated */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Students Allocated</p>
                  <p className="text-3xl font-bold text-gray-900 tracking-tight">{stats.totalStudents}</p>
                </div>
                <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                  <GraduationCap className="w-4 h-4 text-gray-400" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">
                  To Peer Tutors
                </p>
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
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                  <LinkIcon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Mandatory Class Link</h4>
                  <p className="text-xs text-gray-500 mt-1 max-w-md">
                    When enabled, students must provide a valid meeting link when adding an additional class.
                    Disable this if you want to allow offline classes or classes without links.
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

          {/* Send Mail Section */}
          <div className="mb-6">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6 px-2 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Send Mail
            </h3>
          </div>

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
                  onClick={() => { setRecipientType('peer_tutor'); setSelectedRecipients([]) }}
                  className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${recipientType === 'peer_tutor'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  <Users className="w-4 h-4" />
                  Peer Tutors
                </button>
                <button
                  onClick={() => { setRecipientType('student'); setSelectedRecipients([]) }}
                  className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${recipientType === 'student'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  <GraduationCap className="w-4 h-4" />
                  Students
                </button>
                <button
                  onClick={() => { setRecipientType('superadmin'); setSelectedRecipients([]) }}
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
                    Select All
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
                ) : availableRecipients.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No recipients found
                  </div>
                ) : (
                  availableRecipients.map(recipient => (
                    <button
                      key={recipient.id}
                      onClick={() => toggleRecipient(recipient)}
                      className={`w-full flex items-center justify-between p-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${selectedRecipients.find(r => r.id === recipient.id) ? 'bg-blue-50' : ''
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${selectedRecipients.find(r => r.id === recipient.id)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-600'
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
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Email
                </>
              )}
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
