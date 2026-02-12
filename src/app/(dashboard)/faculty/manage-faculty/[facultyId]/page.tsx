'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { User, Mail, BookOpen, Users } from 'lucide-react'
import { FacultyService } from '@/lib/services/facultyService'
import { peertutorservice, peertutors } from '@/lib/services/peerTutorService'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { useAuth } from '@/lib/auth/AuthContext'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/layout/PageHeader'

interface PeerTutorStats {
  id: string
  name: string
  email: string
  totalClasses: number
  completedClasses: number
  pendingClasses: number
  upcomingClasses: number
}

interface SubjectAssignment {
  subject: string
  dept: string
  year: string
  section: string
  peerTutors: PeerTutorStats[]
}

interface Superadmin {
  id: string;
  name: string;
  email: string;
}

export default function FacultyDetailsPage() {
  const params = useParams()
  const router = useRouter()
  // facultyId is the email, heavily encoded
  const facultyEmail = decodeURIComponent(params.facultyId as string)
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [facultyName, setFacultyName] = useState('')
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectAssignment[]>([])
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [superadmins, setSuperadmins] = useState<Superadmin[]>([])
  const [currentDept, setCurrentDept] = useState<string>('')

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed] = useSidebarCollapsed()

  useEffect(() => {
    if (facultyEmail && user?.email) {
      loadFacultyDetails()
      fetchSuperadmins()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultyEmail, user])

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

  const loadFacultyDetails = async () => {
    try {
      setLoading(true)

      // 1. Get current user's dept to scope the view
      if (!user?.email) return
      const currentUserDept = await FacultyService.verifyFacultyAccess(user.email)
      if (currentUserDept) setCurrentDept(currentUserDept.name)

      // Fetch individual assignments for this faculty email
      const assignments = await FacultyService.getIndividualAssignments(facultyEmail)

      // Filter assignments to only show those for the current user's department
      // If currentUserDept is null (shouldn't happen for incharge), fall back to showing all or handle error
      const relevantAssignments = currentUserDept
        ? assignments.filter(a => a.dept === currentUserDept.name)
        : assignments

      if (assignments.length > 0) {
        setFacultyName(assignments[0].faculty_name)
      }

      const assignmentData: SubjectAssignment[] = []

      // Group assignments by subject, year, section
      const grouped = relevantAssignments.reduce((acc, assignment) => {
        const key = `${assignment.subject_name}-${assignment.year}-${assignment.section}`
        if (!acc[key]) {
          acc[key] = {
            subject: assignment.subject_name,
            dept: assignment.dept,
            year: assignment.year,
            section: assignment.section,
            peerTutors: []
          }
        }
        return acc
      }, {} as Record<string, SubjectAssignment>)

      // For each assignment, fetch peer tutors and their stats
      for (const assignment of Object.values(grouped)) {
        // Fetch peer tutors for this section
        const peerTutor = await peertutorservice.getpeerTutorBySection(
          assignment.dept,
          assignment.year,
          assignment.section
        )

        // Calculate stats for each peer tutor
        const peerTutorStatsPromises = peerTutor.map(async (pt) => {
          const stats = await calculatePeerTutorStats(
            pt,
            assignment.subject,
            assignment.dept,
            assignment.year,
            assignment.section
          )
          return stats
        })

        const peerTutorStats = await Promise.all(peerTutorStatsPromises)
        assignment.peerTutors = peerTutorStats
        assignmentData.push(assignment)
      }

      setSubjectAssignments(assignmentData)
    } catch (error) {
      logger.error('Error loading faculty details:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculatePeerTutorStats = async (
    peerTutor: peertutors,
    subjectName: string,
    dept: string,
    year: string,
    section: string
  ): Promise<PeerTutorStats> => {
    try {
      const supabase = createClient()
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]

      // Fetch all scheduled classes for this peer tutor, subject, and assignment details
      const { data: classes, error } = await supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            subject_name
          )
        `)
        .eq('peer_tutor_id', peerTutor.id)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (error) {
        return {
          id: peerTutor.id,
          name: peerTutor.name,
          email: peerTutor.email,
          totalClasses: 0,
          completedClasses: 0,
          pendingClasses: 0,
          upcomingClasses: 0
        }
      }

      // Filter classes for this specific subject (redundant if using filtered query but safe)
      const subjectClasses = (classes || []).filter((cls) => {
        const classData = Array.isArray(cls.class) ? cls.class[0] : cls.class
        return classData?.subject_name === subjectName
      })

      let completedClasses = 0
      let pendingClasses = 0
      let upcomingClasses = 0

      subjectClasses.forEach((cls) => {
        const scheduledDate = cls.scheduled_date || ''

        if (cls.completion_status === 'completed' ||
          (cls.attendance_completed && cls.topics_completed)) {
          completedClasses++
        } else if (scheduledDate <= todayStr) {
          pendingClasses++
        } else {
          upcomingClasses++
        }
      })

      return {
        id: peerTutor.id,
        name: peerTutor.name,
        email: peerTutor.email,
        totalClasses: subjectClasses.length,
        completedClasses,
        pendingClasses,
        upcomingClasses
      }
    } catch (error) {
      logger.error('Error calculating peer tutor stats:', error)
      return {
        id: peerTutor.id,
        name: peerTutor.name,
        email: peerTutor.email,
        totalClasses: 0,
        completedClasses: 0,
        pendingClasses: 0,
        upcomingClasses: 0
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out",
          isSidebarCollapsed ? "lg:ml-20" : "lg:ml-64"
        )}
      >
        {/* Header */}
        <PageHeader
          title="FACULTY DETAILS"
          tagline="Comprehensive Statistics & Assignments"
          onBack={() => router.back()}
          lastRefresh={lastRefresh}
          onRefresh={async () => {
            setIsRefreshing(true)
            await loadFacultyDetails()
            setLastRefresh(new Date())
            setIsRefreshing(false)
          }}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
          {/* Profile Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-8 mb-8 shadow-sm">
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold shrink-0">
                {facultyName?.[0] || <User className="w-8 h-8" />}
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Faculty Member</p>
                <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">
                  {facultyName || 'Loading...'}
                </h2>
                <div className="flex flex-wrap items-center gap-6 text-gray-500">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-col sm:flex-row items-center md:items-start gap-4 mt-6">
                  {currentDept && (
                    <div className="flex items-center gap-3 px-4 py-2 bg-black rounded-xl shadow-sm border border-gray-800">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Department</p>
                        <p className="text-sm font-bold text-white uppercase">{currentDept}</p>
                      </div>
                    </div>
                  )}
                  {superadmins.length > 0 && (
                    <div className="flex items-center gap-3 px-4 py-2 bg-black rounded-xl shadow-sm border border-gray-800">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Superadmin</p>
                        <p className="text-sm font-bold text-white uppercase">{superadmins[0]?.name || 'N/A'}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Assignments Section */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase text-gray-600 flex items-center gap-2 tracking-wider ml-1">
              <BookOpen className="w-4 h-4 text-gray-400" />
              Subject Assignments & Peer Tutor Stats
            </h3>

            {loading ? (
              <div className="flex flex-col gap-4">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white rounded-xl h-48 animate-pulse border border-gray-100" />
                ))}
              </div>
            ) : subjectAssignments.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
                <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900">No Assignments Found</h3>
                <p className="text-gray-500 mt-2 text-sm">This faculty member has not been assigned any subjects yet.</p>
              </div>
            ) : (
              <div className="grid gap-8">
                {subjectAssignments.map((assignment, idx) => (
                  <div key={idx} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    {/* Assignment Header */}
                    <div className="px-6 py-5 bg-white border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-blue-600 rounded-lg text-white shadow-sm shadow-blue-200/50">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Subject</p>
                          <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                            {assignment.subject}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 font-medium">
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">{assignment.dept}</span>
                            <span>•</span>
                            <span>Year {assignment.year}</span>
                            <span>•</span>
                            <span>Section {assignment.section}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Peer Tutors Table */}
                    <div className="p-6">
                      {assignment.peerTutors.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50/50 rounded-xl border border-gray-100 border-dashed mx-6 mb-6">
                          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 text-sm font-medium">No peer tutors assigned to this section</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-gray-50 bg-white">
                                <th className="pl-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Peer Tutor</th>
                                <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Total Classes</th>
                                <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Completed</th>
                                <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Pending</th>
                                <th className="pr-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Upcoming</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {assignment.peerTutors.map((pt) => (
                                <tr key={pt.id} className="group hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                                  <td className="py-4 pl-6">
                                    <Link href={`/faculty/peer-tutor/${pt.id}`} className="flex items-center gap-3 group/link">
                                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold border border-gray-200 group-hover/link:border-blue-200 group-hover/link:bg-blue-50 transition-colors">
                                        {pt.name[0]}
                                      </div>
                                      <div>
                                        <div className="font-bold text-gray-900 text-sm group-hover/link:text-blue-600 transition-colors">{pt.name}</div>
                                        <div className="text-[10px] text-gray-500 font-medium tracking-wide">{pt.email}</div>
                                      </div>
                                    </Link>
                                  </td>
                                  <td className="py-4 px-4 text-center">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-gray-600 text-white uppercase tracking-wide border border-gray-600">
                                      {pt.totalClasses}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 text-center">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-600 text-white uppercase tracking-wide border border-emerald-600">
                                      {pt.completedClasses}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 text-center">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500 text-white uppercase tracking-wide border border-amber-500">
                                      {pt.pendingClasses}
                                    </span>
                                  </td>
                                  <td className="py-4 pr-6 text-center">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-blue-600 text-white uppercase tracking-wide border border-blue-600">
                                      {pt.upcomingClasses}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
