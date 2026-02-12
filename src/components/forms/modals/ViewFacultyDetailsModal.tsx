'use client'

import React, { useEffect, useState } from 'react'
import { X, User, Mail, BookOpen, Users } from 'lucide-react'
import { FacultySummary } from '@/lib/services/facultyService'
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

interface ViewFacultyDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  faculty: FacultySummary | null
}

export default function ViewFacultyDetailsModal({
  isOpen,
  onClose,
  faculty
}: ViewFacultyDetailsModalProps) {
  const [loading, setLoading] = useState(true)
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectAssignment[]>([])

  useEffect(() => {
    if (isOpen && faculty) {
      const loadData = async () => {
        await loadFacultyDetails()
      }
      loadData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, faculty])

  const loadFacultyDetails = async () => {
    if (!faculty) return

    try {
      setLoading(true)
      const assignmentData: SubjectAssignment[] = []

      // Group assignments by subject, year, section
      const grouped = faculty.assignments.reduce((acc, assignment) => {
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
        logger.error('Error fetching classes for peer tutor:', error)
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
          // Scheduled for today or past but not completed
          pendingClasses++
        } else {
          // Scheduled for future
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

  if (!isOpen || !faculty) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold">
                {faculty.name?.[0] || <User className="w-8 h-8" />}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                  {faculty.name}
                </h2>
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                  <Mail className="w-4 h-4" />
                  {faculty.email}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : subjectAssignments.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No subject assignments found</p>
            </div>
          ) : (
            <div className="space-y-8">
              {subjectAssignments.map((assignment, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  {/* Subject Header */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-emerald-600 rounded-lg">
                      <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">
                        {assignment.subject}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Year {assignment.year} • Section {assignment.section}
                      </p>
                    </div>
                  </div>

                  {/* Peer Tutors Table */}
                  {assignment.peerTutors.length === 0 ? (
                    <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
                      <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No peer tutors assigned yet</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                              Peer Tutor
                            </th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">
                              Total Classes
                            </th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">
                              Completed
                            </th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">
                              Pending
                            </th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">
                              Upcoming
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {assignment.peerTutors.map((pt) => (
                            <tr key={pt.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4">
                                <div>
                                  <div className="font-semibold text-gray-900">{pt.name}</div>
                                  <div className="text-xs text-gray-500">{pt.email}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-900">
                                  {pt.totalClasses}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700">
                                  {pt.completedClasses}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-orange-100 text-orange-700">
                                  {pt.pendingClasses}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700">
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
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
