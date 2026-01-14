'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { FacultyService } from '@/lib/services/facultyService'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { StudentService } from '@/lib/services/studentService'
import { useState, useEffect, useCallback } from 'react'
import { Building2, ArrowLeft, Mail } from 'lucide-react'
import { AnimatedRefreshButton } from '@/components/ui/AnimatedRefreshButton'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import EmailExportModal from '@/components/forms/import-export/EmailExportModal'

import { logger } from '@/lib/logger'

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
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [stats, setStats] = useState<{
    department: string
    totalpeerTutor: number
    totalStudents: number
  }>({
    department: '',
    totalpeerTutor: 0,
    totalStudents: 0
  })

  // Check if sidebar is collapsed
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed')
      if (saved !== null) {
        return JSON.parse(saved)
      }
    }
    return false
  })

  useEffect(() => {
    const checkSidebarState = () => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved !== null) {
          setIsSidebarCollapsed(JSON.parse(saved))
        }
      }
    }
    window.addEventListener('sidebar-toggle', checkSidebarState)
    window.addEventListener('storage', checkSidebarState)
    return () => {
      window.removeEventListener('sidebar-toggle', checkSidebarState)
      window.removeEventListener('storage', checkSidebarState)
    }
  }, [])

  const loadData = useCallback(async () => {
    try {
      if (!user?.email) return

      // Get faculty department
      const facultyDept = await FacultyService.verifyFacultyAccess(user.email)
      const deptName = facultyDept?.name || 'Not Assigned'

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

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await loadData()
    } finally {
      setTimeout(() => setIsRefreshing(false), 800)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <div className={`${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex items-center justify-center w-full lg:w-auto`}>
          <div className="text-center">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-blue-50/50"></div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
            </div>
            <p className="text-gray-500 font-medium uppercase tracking-widest text-xs">Loading Profile</p>
          </div>
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
                  <div className="h-32 w-32 rounded-full overflow-hidden ring-4 ring-blue-100 shadow-lg">
                    <Image
                      src="/images/default-faculty-avatar.png"
                      alt="Faculty Profile"
                      width={128}
                      height={128}
                      className="object-cover"
                    />
                  </div>
                  <div className="absolute bottom-2 right-2 h-6 w-6 rounded-full bg-[#bef264] border-4 border-white shadow-sm"></div>
                </div>
              </div>

              {/* Profile Info */}
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-3xl font-black text-gray-900 mb-2">
                  {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Faculty Member'}
                </h2>
                <p className="text-sm text-gray-500 mb-4">{user?.email}</p>
                
                <div className="flex flex-col sm:flex-row items-center md:items-start gap-4 mt-6">
                  <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 rounded-xl">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Department</p>
                      <p className="text-sm font-bold text-blue-900">{stats.department}</p>
                    </div>
                  </div>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Total Peer Tutors */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Total Peer Tutors</p>
                  <p className="text-3xl font-bold text-gray-900 tracking-tight">{stats.totalpeerTutor}</p>
                </div>
                <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
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
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  To Peer Tutors
                </p>
              </div>
            </div>
          </div>

          {/* Email Export Section */}
          <div className="mt-8">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6 px-2">
              Data Management
            </h3>
            
            <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm hover:shadow-md transition-all">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-blue-50 rounded-xl">
                    <Mail className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-gray-900 mb-1">Send Data to Admin</h4>
                    <p className="text-sm text-gray-600 leading-relaxed max-w-xl">
                      Export and send selected data reports to the super admin via email. 
                      Choose from attendance records, exam data, peer tutor information, and more.
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => setShowEmailModal(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-sm hover:shadow-md whitespace-nowrap"
                >
                  <Mail className="w-4 h-4" />
                  Send Data
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* Email Export Modal */}
        <EmailExportModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          facultyEmail={user?.email || ''}
        />
      </div>
    </div>
  )
}
