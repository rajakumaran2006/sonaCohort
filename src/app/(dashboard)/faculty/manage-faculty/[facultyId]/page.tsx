'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, User, Mail, BookOpen, Users, Phone, Calendar } from 'lucide-react'
import { FacultyService, FacultySummary, FacultyAllocation } from '@/lib/services/facultyService'
import { peertutorservice, peertutors } from '@/lib/services/peerTutorService'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

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

export default function FacultyDetailsPage() {
  const params = useParams()
  const router = useRouter()
  // facultyId is the email, heavily encoded
  const facultyEmail = decodeURIComponent(params.facultyId as string)

  const [loading, setLoading] = useState(true)
  const [facultyName, setFacultyName] = useState('')
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectAssignment[]>([])
  
  useEffect(() => {
    if (facultyEmail) {
      loadFacultyDetails()
    }
  }, [facultyEmail])

  const loadFacultyDetails = async () => {
    try {
      setLoading(true)
      
      // Fetch individual assignments for this faculty email
      const assignments = await FacultyService.getIndividualAssignments(facultyEmail)
      
      if (assignments.length > 0) {
        setFacultyName(assignments[0].faculty_name)
      }

      const assignmentData: SubjectAssignment[] = []

      // Group assignments by subject, year, section
      const grouped = assignments.reduce((acc, assignment) => {
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
          const stats = await calculatePeerTutorStats(pt, assignment.subject)
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
    subjectName: string
  ): Promise<PeerTutorStats> => {
    try {
      const supabase = createClient()
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]

      // Fetch all scheduled classes for this peer tutor and subject
      const { data: classes, error } = await supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            subject_name
          )
        `)
        .eq('peer_tutor_id', peerTutor.id)

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

      // Filter classes for this specific subject
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="p-2 -ml-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Faculty Details</h1>
              <p className="text-sm text-gray-500 mt-1">View comprehensive statistics and assignments</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-8 shadow-sm">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-3xl font-bold shrink-0">
              {facultyName?.[0] || <User className="w-10 h-10" />}
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">
                {facultyName || 'Loading...'}
              </h2>
              <div className="flex flex-wrap items-center gap-6 text-gray-500">
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <span>{facultyEmail}</span>
                </div>
                {/* Add more profile details if available in future */}
              </div>
            </div>
          </div>
        </div>

        {/* Assignments Section */}
        <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-gray-500" />
              Subject Assignments & Peer Tutor Stats
            </h3>

            {loading ? (
              <div className="flex flex-col gap-4">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white rounded-xl h-48 animate-pulse border border-gray-100" />
                ))}
              </div>
            ) : subjectAssignments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900">No Assignments Found</h3>
                <p className="text-gray-500 mt-2">This faculty member has not been assigned any subjects yet.</p>
              </div>
            ) : (
              <div className="grid gap-8">
                {subjectAssignments.map((assignment, idx) => (
                  <div key={idx} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                    {/* Assignment Header */}
                    <div className="px-8 py-6 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-100 rounded-xl">
                          <BookOpen className="w-6 h-6 text-emerald-700" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">
                            {assignment.subject}
                          </h3>
                          <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                            <span className="font-medium text-gray-700">{assignment.dept}</span>
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
                         <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100 border-dashed">
                          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 font-medium">No peer tutors assigned to this section</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-gray-100">
                                <th className="pb-4 text-xs font-bold text-gray-500 uppercase tracking-wider pl-2">Peer Tutor</th>
                                <th className="pb-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Total Classes</th>
                                <th className="pb-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Completed</th>
                                <th className="pb-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Pending</th>
                                <th className="pb-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center pr-2">Upcoming</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {assignment.peerTutors.map((pt) => (
                                <tr key={pt.id} className="group hover:bg-gray-50 transition-colors">
                                  <td className="py-4 pl-2">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold">
                                        {pt.name[0]}
                                      </div>
                                      <div>
                                        <div className="font-semibold text-gray-900 text-sm">{pt.name}</div>
                                        <div className="text-xs text-gray-500">{pt.email}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-4 text-center">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                                      {pt.totalClasses}
                                    </span>
                                  </td>
                                  <td className="py-4 text-center">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
                                      {pt.completedClasses}
                                    </span>
                                  </td>
                                  <td className="py-4 text-center">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-orange-100 text-orange-800">
                                      {pt.pendingClasses}
                                    </span>
                                  </td>
                                  <td className="py-4 text-center pr-2">
                                     <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
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
  )
}
