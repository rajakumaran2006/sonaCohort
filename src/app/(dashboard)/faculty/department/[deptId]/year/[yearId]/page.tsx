'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { AssignmentService } from '@/lib/services/assignmentService'
import { FacultyService } from '@/lib/services/facultyService'
import { ClassService } from '@/lib/services/classService'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import {
  ArrowUpRight,
  LayoutGrid
} from 'lucide-react'
import { logger } from '@/lib/logger'
import { AnimatedRefreshButton } from '@/components/ui/AnimatedRefreshButton'
import { BackButton } from '@/components/ui/BackButton'
import { YearSectionGraph } from '@/components/ui/YearSectionGraph'
import { YearPageSkeleton } from '@/components/skeletons/YearPageSkeleton'

export default function YearPage() {
  return (
    <FacultyProtectedRoute>
      <YearContent />
    </FacultyProtectedRoute>
  )
}

function YearContent() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const { deptId, yearId } = params

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [department, setDepartment] = useState<{
    id: string
    name: string
    faculty_name: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [yearStats, setYearStats] = useState<{
    totalStudents: number
    totalpeerTutor: number
    assignedStudents: number
    unassignedStudents: number
    averageStudentsPerTutor: number
  } | null>(null)
  const [sectionStats, setSectionStats] = useState<Array<{
    section: string
    tutors: number
    completed: number
    pending: number
    description: string
  }>>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Check if sidebar is collapsed
  const [isSidebarCollapsed] = useSidebarCollapsed()

  const loadData = useCallback(async () => {
    try {
      let facultyDeptName = 'Computer Science'
      if (user?.email) {
        const facultyDept = await FacultyService.verifyFacultyAccess(user.email)
        if (facultyDept) {
          facultyDeptName = facultyDept.name
        }
      }


      logger.info('Year Page - Loading data for:', { deptId, yearId, facultyDeptName })

      setDepartment({
        id: deptId as string,
        name: facultyDeptName,
        faculty_name: user?.user_metadata?.full_name || user?.user_metadata?.name || 'Faculty Member'
      })

      // Load overall year stats
      const stats = await AssignmentService.getAssignmentStatsByYear(facultyDeptName, yearId as string)
      logger.info('Year Page - Year stats loaded:', stats)
      setYearStats(stats)

      // Load sections and their stats
      const sections = await ClassService.getSectionsForYear(facultyDeptName, yearId as string)
      const allAdditionalClasses = await AdditionalClassService.getAllAdditionalClassesForDepartment(facultyDeptName)
      logger.info('Year Page - Data found:', { sections, additionalCount: allAdditionalClasses.length })

      // Ensure all standard sections (A, B, C) are included
      const allSections = ['A', 'B', 'C']
      const uniqueSections = Array.from(new Set([...allSections, ...sections]))

      const sectionData = await Promise.all(
        uniqueSections.map(async (section) => {
          const tutors = await peertutorservice.getpeerTutorBySection(facultyDeptName, yearId as string, section)
          const { completed, pending } = await ScheduledClassService.getpeertutorsClassStatus(facultyDeptName, yearId as string, section)

          // Filter pending to only show overdue classes (scheduled date exceeded)
          const now = new Date()
          const currentYear = now.getFullYear()
          const currentMonth = String(now.getMonth() + 1).padStart(2, '0')
          const currentDay = String(now.getDate()).padStart(2, '0')
          const todayStr = `${currentYear}-${currentMonth}-${currentDay}`

          const overduePending = pending.filter(cls => cls.scheduled_date < todayStr)

          const sectionAdditional = allAdditionalClasses.filter(c => {
            const tutor = (c as { peer_tutors?: { year?: string; section?: string } | { year?: string; section?: string }[] }).peer_tutors
            const tutorData = Array.isArray(tutor) ? tutor[0] : tutor
            const y = c.year || tutorData?.year || ''
            return y.toString() === yearId && tutorData?.section === section
          })

          const totalCompleted = completed.length + sectionAdditional.length

          logger.info(`Year Page - Section ${section} data:`, {
            tutorsCount: tutors.length,
            completedCount: totalCompleted,
            pendingCount: overduePending.length,
            additionalCount: sectionAdditional.length
          })

          return {
            section,
            tutors: tutors.length,
            completed: totalCompleted,
            pending: overduePending.length,
            description: `${tutors.length} tutors · ${totalCompleted} completed · ${overduePending.length} overdue`
          }
        })
      )

      // Sort sections alphabetically
      sectionData.sort((a, b) => a.section.localeCompare(b.section))

      logger.info('Year Page - Final section data:', sectionData)
      setSectionStats(sectionData)
    } catch (error) {
      logger.error('Error loading year data:', error)
    } finally {
      setLoading(false)
    }
  }, [user, deptId, yearId])

  useEffect(() => {
    if (user) {
      loadData()
    }
  }, [deptId, yearId, user, loadData])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await loadData()
    } finally {
      setTimeout(() => setIsRefreshing(false), 800)
    }
  }

  const yearNames: { [key: string]: string } = {
    '1': '1st Year', '2': '2nd Year', '3': '3rd Year', '4': '4th Year'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        <div className={`${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col transition-all duration-300`}>
          {/* Header Skeleton */}
          <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 h-20 flex items-center px-8">
            <div className="flex justify-between items-center w-full">
              <div>
                <div className="flex items-center gap-3">
                  <div className="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="h-3 w-64 bg-gray-200 rounded animate-pulse mt-2"></div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-gray-200 rounded-lg animate-pulse"></div>
                <div className="h-10 w-20 bg-gray-200 rounded-lg animate-pulse"></div>
              </div>
            </div>
          </header>

          {/* Skeleton Loading State */}
          <YearPageSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className={`${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col transition-all duration-300`}>
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 h-20 flex items-center px-8">
          <div className="flex justify-between items-center w-full">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                  {yearNames[yearId as string]} <span className="text-gray-300 mx-2">/</span> {department?.name}
                </h1>
              </div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">
                Section Management & Academic Overview
              </p>
            </div>
            <div className="flex items-center gap-4">
              <AnimatedRefreshButton onRefresh={handleRefresh} isRefreshing={isRefreshing} />
              <BackButton href="/faculty/dashboard" />
            </div>
          </div>
        </header>

        <main className="flex-1 p-8 max-w-[1600px] mx-auto w-full">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 mb-8 text-[11px] font-bold uppercase tracking-widest">
            <button onClick={() => router.push('/faculty/dashboard')} className="text-gray-400 hover:text-blue-600 transition-colors">DASHBOARD</button>
            <span className="text-gray-300">/</span>
            <span className="text-blue-600">YEAR OVERVIEW</span>
          </nav>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Left Column: Stats & Graph */}
            <div className="xl:col-span-2 flex flex-col gap-8">
              {/* Main Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Total Peer Tutors Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Total Peer Tutors</p>
                      <p className="text-3xl font-bold text-gray-900 tracking-tight">{yearStats?.totalpeerTutor}</p>
                    </div>
                    <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                      Across All Sections
                    </p>
                  </div>
                </div>

                {/* Total Students Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Total Students</p>
                      <p className="text-3xl font-bold text-gray-900 tracking-tight">{yearStats?.totalStudents}</p>
                    </div>
                    <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                      Academic Population
                    </p>
                  </div>
                </div>
              </div>

              {/* Graph */}
              <div className="flex-1 min-h-[400px]">
                <YearSectionGraph data={sectionStats.map(s => ({
                  section: s.section,
                  tutors: s.tutors,
                  completed: s.completed,
                  pending: s.pending
                }))} />
              </div>
            </div>

            {/* Right Column: Sections List */}
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Available Sections</h3>
                <span className="px-3 py-1 bg-gray-100 rounded-full text-[10px] font-black text-gray-500 uppercase">{sectionStats.length} TOTAL</span>
              </div>

              <div className="space-y-4">
                {sectionStats.length === 0 ? (
                  <div className="bg-white p-8 rounded-[28px] border border-gray-100 shadow-sm text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
                      <LayoutGrid className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No sections found</p>
                    <p className="text-xs text-gray-400 mt-2">Sections will appear here once configured</p>
                  </div>
                ) : (
                  sectionStats.map((section) => (
                    <button
                      key={section.section}
                      onClick={() => router.push(`/faculty/department/${deptId}/year/${yearId}/section/${section.section}`)}
                      className="w-full bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden text-left"
                    >
                      <div className="flex items-center gap-6 relative z-10">
                        <div className="w-20 h-20 rounded-2xl bg-gray-50 flex items-center justify-center group-hover:bg-gray-900 group-hover:text-white transition-all duration-500 text-4xl font-black text-gray-900 italic">
                          {section.section}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">SECTION {section.section}</h4>
                            <ArrowUpRight className="w-5 h-5 text-gray-300 group-hover:text-gray-900 transition-all" />
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-gray-50/50 rounded-xl p-2 group-hover:bg-blue-50/30 transition-colors">
                              <p className="text-[8px] font-black text-gray-400 uppercase mb-0.5">Tutors</p>
                              <p className="text-xs font-black text-gray-900">{section.tutors}</p>
                            </div>
                            <div className="bg-gray-50/50 rounded-xl p-2 group-hover:bg-emerald-50/30 transition-colors">
                              <p className="text-[8px] font-black text-gray-400 uppercase mb-0.5">Done</p>
                              <p className="text-xs font-black text-emerald-600">{section.completed}</p>
                            </div>
                            <div className="bg-gray-50/50 rounded-xl p-2 group-hover:bg-orange-50/30 transition-colors">
                              <p className="text-[8px] font-black text-gray-400 uppercase mb-0.5">Left</p>
                              <p className="text-xs font-black text-orange-600">{section.pending}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
