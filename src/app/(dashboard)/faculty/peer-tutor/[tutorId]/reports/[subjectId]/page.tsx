'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ReportService, ClassAttendanceReport } from '@/lib/services/reportService'
import { ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import SubjectReportSkeleton from '@/components/skeletons/SubjectReportSkeleton'
import { logger } from '@/lib/logger'

export default function SubjectReportsPage() {
  return (
    <FacultyProtectedRoute>
      <SubjectReportsContent />
    </FacultyProtectedRoute>
  )
}

function SubjectReportsContent() {
  const router = useRouter()
  const params = useParams()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [scheduledClasses, setScheduledClasses] = useState<ScheduledClassWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState<ClassAttendanceReport | null>(null)
  const [showClassModal, setShowClassModal] = useState(false)
  const [peertutorsInfo, setpeertutorsInfo] = useState<{ id: string; name: string } | null>(null)
  const [subjectName, setSubjectName] = useState<string>('')
  
  // Check if sidebar is collapsed - read from localStorage first (source of truth)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed')
      if (saved !== null) {
        return JSON.parse(saved)
      }
    }
    return false
  })

  // Listen for sidebar collapse state changes
  useEffect(() => {
    const checkSidebarState = () => {
      if (typeof window !== 'undefined') {
        // Read from localStorage first (sidebar's source of truth)
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved !== null) {
          const collapsed = JSON.parse(saved)
          setIsSidebarCollapsed(collapsed)
        } else {
          // Fallback to DOM check if localStorage doesn't have value
          const sidebar = document.querySelector('[data-sidebar-collapsed]')
          if (sidebar) {
            const collapsed = sidebar.getAttribute('data-sidebar-collapsed') === 'true'
            setIsSidebarCollapsed(collapsed)
          }
        }
      }
    }

    // Check initially with a small delay to ensure sidebar has rendered
    const timer = setTimeout(checkSidebarState, 0)

    // Listen for custom events
    const handleSidebarToggle = () => {
      // Use a small delay to ensure localStorage is updated
      setTimeout(checkSidebarState, 0)
    }
    window.addEventListener('sidebar-toggle', handleSidebarToggle)

    // Also listen for storage changes (in case sidebar state changes in another tab/window)
    window.addEventListener('storage', checkSidebarState)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('sidebar-toggle', handleSidebarToggle)
      window.removeEventListener('storage', checkSidebarState)
    }
  }, [])

  const tutorId = params.tutorId as string
  const subjectId = params.subjectId as string

  useEffect(() => {
    if (tutorId && subjectId) {
      loadSubjectData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorId, subjectId])

  const loadSubjectData = async () => {
    setLoading(true)
    try {
      // Get peer tutor info
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      
      const { data: peertutors, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('id', tutorId)
        .single()

      if (tutorError || !peertutors) {
        logger.error('Error getting peer tutor info:', tutorError)
        return
      }

      setpeertutorsInfo(peertutors)

      // Get subject name from class_id
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('subject_name')
        .eq('id', subjectId)
        .single()

      if (classError || !classData) {
        logger.error('Error getting class info:', classError)
        return
      }

      setSubjectName(classData.subject_name)

      // Get scheduled classes for this subject
      const classes = await ReportService.getSubjectScheduledClasses(tutorId, classData.subject_name)
      setScheduledClasses(classes)
    } catch (error) {
      logger.error('Error loading subject data:', error)
    } finally {
      setLoading(false)
    }
  }

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



  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} overflow-y-auto`}>
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 w-full">
          <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8 w-full">
            <div className="flex items-center">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="ml-2 lg:ml-0">
                <div className="flex items-center space-x-2 text-sm text-gray-500 mb-1">
                  <button
                    onClick={() => router.push('/faculty/peer-tutor')}
                    className="hover:text-gray-700 transition-colors"
                  >
                    Peer Tutor Reports
                  </button>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-gray-700">{subjectName}</span>
                </div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  {subjectName} - {peertutorsInfo?.name}
                </h1>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="py-6">
          <div className={`max-w-7xl mx-auto ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-0' : 'px-4 sm:px-6 lg:px-8'}`}>
            {loading ? (
              <SubjectReportSkeleton />
            ) : (
              <div className="space-y-6">
                {/* Stats Overview */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-3">
                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Total Classes</dt>
                            <dd className="text-lg font-medium text-gray-900">{scheduledClasses.length}</dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Completed Classes</dt>
                            <dd className="text-lg font-medium text-gray-900">
                              {scheduledClasses.filter(cls => 
                                cls.completion_status === 'completed' || 
                                (cls.attendance_completed && cls.topics_completed)
                              ).length}
                            </dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-yellow-100 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">Pending Classes</dt>
                            <dd className="text-lg font-medium text-gray-900">
                              {scheduledClasses.filter(cls => 
                                cls.completion_status !== 'completed' && 
                                !(cls.attendance_completed && cls.topics_completed)
                              ).length}
                            </dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scheduled Classes Table */}
                <div className="bg-white shadow rounded-lg">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">
                      Scheduled Classes ({scheduledClasses.length})
                    </h3>
                  </div>

                  <div className="overflow-hidden">
                    {scheduledClasses.length === 0 ? (
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
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Subject
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Assigned Date
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Time
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Attendance
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {scheduledClasses.map((scheduledClass) => {
                              const isPresent = scheduledClass.completion_status === 'completed' || 
                                               (scheduledClass.attendance_completed && scheduledClass.topics_completed)
                              return (
                                <tr key={scheduledClass.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">
                                      {scheduledClass.class?.subject_name || subjectName || 'Unknown Subject'}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">
                                      {new Date(scheduledClass.scheduled_date).toLocaleDateString()}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="text-sm font-semibold text-gray-500 bg-gray-50 px-2 py-1 rounded-md inline-block">
                                      {scheduledClass.start_time ? `${scheduledClass.start_time} - ${scheduledClass.end_time || '?'}` : '--:--'}
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
                                      className={`px-3 py-1.5 border rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm ${
                                        isPresent
                                          ? 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                          : 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                      }`}
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
              </div>
            )}
          </div>
        </main>
      </div>

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
      )}
    </div>
  )
}
