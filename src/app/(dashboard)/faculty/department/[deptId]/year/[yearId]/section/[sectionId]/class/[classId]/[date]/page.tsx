'use client'

import React, { useState, useEffect } from 'react'

import { useParams } from 'next/navigation'
import PageHeader from '@/components/layout/PageHeader'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { ChevronDown } from 'lucide-react'
import { AttendanceRecord } from '@/lib/services/attendanceService'
import { BackButton } from '@/components/ui/BackButton'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'

interface ClassDetails {
  id: string
  subject_name: string
  scheduled_date: string
}

interface PeerTutorClassStatus {
  id: string // scheduled_class id
  peer_tutor: {
    id: string
    name: string
    email: string
  }
  status: 'completed' | 'pending' | 'upcoming'
  topics?: string
  link?: string
  student_attendance_count: number
  total_students: number
  student_records: AttendanceRecord[] // We load this on demand
  attendance_completed: boolean
  topics_completed: boolean
}

// Interface for the raw data from Supabase to avoid 'any'


export default function ClassDetailsPage() {
  const params = useParams()
  const [loading, setLoading] = useState(true)
  const [classDetails, setClassDetails] = useState<ClassDetails | null>(null)
  const [peerTutors, setPeerTutors] = useState<PeerTutorClassStatus[]>([])
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const deptId = decodeURIComponent(params.deptId as string)
  const yearId = decodeURIComponent(params.yearId as string)
  const sectionId = decodeURIComponent(params.sectionId as string)
  const classId = params.classId as string
  const dateStr = decodeURIComponent(params.date as string)

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed] = useSidebarCollapsed()

  // ... (keeping useEffect as is, but ensuring it depends on the new deptId if needed, though likely not for the query itself unless the query uses it)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)

        const { scheduledClasses, subjectName } = await ScheduledClassService.getScheduledClassesForSession(classId, dateStr)

        setClassDetails({
          id: classId,
          subject_name: subjectName || 'Loading...',
          scheduled_date: dateStr
        })

        setPeerTutors(scheduledClasses)
      } catch (error) {
        console.error('Error loading class details:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [classId, dateStr])

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col`}>
        <PageHeader
          title="CLASS DETAILS"
          tagline={`${classDetails?.subject_name || 'Loading...'} - ${new Date(dateStr).toLocaleDateString('en-GB')}`}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        >
          <BackButton href={`/faculty/department/${deptId}/year/${yearId}/section/${sectionId}?tab=classes`} />
        </PageHeader>

        <main className="flex-1 p-6 md:p-8">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <TableSkeleton />
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Peer Tutor
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Status
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Students Present
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Topic Taken
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Link
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {peerTutors.map((tutor) => (
                      <React.Fragment key={tutor.id}>
                        <tr className={`hover:bg-gray-50/50 transition-colors ${expandedRows.has(tutor.id) ? 'bg-gray-50' : ''}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold">
                                {tutor.peer_tutor?.name?.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-gray-900">{tutor.peer_tutor?.name}</p>
                                <p className="text-xs text-gray-500">{tutor.peer_tutor?.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${tutor.status === 'completed' ? 'bg-green-600 text-white' :
                              tutor.status === 'pending' ? 'bg-red-600 text-white' :
                                (tutor.status === 'upcoming' || tutor.status === 'not_started') ? 'bg-blue-600 text-white' :
                                  'bg-blue-50 text-blue-600 border border-blue-100'

                              }`}>
                              {tutor.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {tutor.status === 'completed' ? (
                              <span className="text-sm font-bold text-gray-900">
                                {tutor.student_attendance_count} <span className="text-gray-400 text-xs font-normal">/ {tutor.total_students}</span>
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center max-w-xs truncate">
                            <span className="text-sm text-gray-700" title={tutor.topics || ''}>
                              {tutor.topics || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {tutor.link ? (
                              <a
                                href={tutor.link}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            {tutor.status === 'completed' && (
                              <button
                                onClick={() => toggleRow(tutor.id)}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wide transition-all ${expandedRows.has(tutor.id)
                                  ? 'bg-gray-200 border-gray-300 text-gray-800'
                                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                  }`}
                              >
                                View
                                <ChevronDown className={`w-3 h-3 transition-transform ${expandedRows.has(tutor.id) ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expandable Section - Student Attendance */}
                        {expandedRows.has(tutor.id) && (
                          <tr>
                            <td colSpan={6} className="px-0 py-0 border-b border-gray-100">
                              <div className="bg-gray-50 p-6 border-t border-gray-100 inner-shadow">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Student Attendance Record</h4>

                                {tutor.student_records && tutor.student_records.length > 0 ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {tutor.student_records.map((record) => (
                                      <div key={record.student_id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                                        <span className="text-sm font-semibold text-gray-700">{record.student_name}</span>
                                        <span className={`text-[10px] font-black uppercase tracking-wider ${record.status === 'present' ? 'text-green-600' : 'text-red-500'
                                          }`}>
                                          {record.status}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-500 italic text-center py-4">No student records found.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}

                    {peerTutors.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500 text-sm">
                          No peer tutors found for this class.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
