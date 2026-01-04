'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { AttendanceService } from '@/lib/services/attendanceService'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'

export default function StudentAttendancePage() {
  return (
    <PeerProtectedRoute>
      <StudentAttendanceContent />
    </PeerProtectedRoute>
  )
}

interface StudentAttendanceRecord {
  id: string
  class_id?: string
  scheduled_class_id?: string
  student_id: string
  status: 'present' | 'absent'
  created_at: string
  updated_at: string
  classes?: {
    id: string
    subject_name: string
    created_at: string
    dept: string
    year: string
    section: string
  } | null
  scheduled_classes?: {
    id: string
    scheduled_date: string
    class_id: string
  } | null
}

function StudentAttendanceContent() {
  const { user } = useAuth()
  const params = useParams()
  const router = useRouter()
  const studentId = params.studentId as string

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [studentInfo, setStudentInfo] = useState<{
    id: string
    name: string
    email: string
    dept: string
    year: string
    section: string
  } | null>(null)
  const [attendanceRecords, setAttendanceRecords] = useState<StudentAttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    totalClasses: 0,
    completedClasses: 0,
    presentCount: 0,
    absentCount: 0,
    attendanceRate: 0
  })

  const getStudentInfo = useCallback(async (studentId: string) => {
    try {
      const supabase = (await import('@/utils/supabase/client')).createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('id, name, email, dept, year, section')
        .eq('id', studentId)
        .single()

      if (error) {
        console.error('Error getting student info:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error in getStudentInfo:', error)
      return null
    }
  }, [])

  const loadData = useCallback(async () => {
    if (!user?.email || !studentId) return

    setLoading(true)
    try {
      // Get peer tutor information
      const tutorInfo = await PeerTutorAuthService.getPeerTutorByEmail(user.email)
      if (tutorInfo) {

        // Get student information
        const studentData = await getStudentInfo(studentId)
        if (studentData) {
          setStudentInfo(studentData)

          // Get attendance records for this student
          const records = await AttendanceService.getStudentAttendanceHistory(studentId, tutorInfo.id)
          setAttendanceRecords(records)

          // Calculate summary
          const totalClasses = records.length
          const completedClasses = records.filter(record => 
            record.scheduled_classes?.scheduled_date && 
            new Date(record.scheduled_classes.scheduled_date) <= new Date()
          ).length
          const presentCount = records.filter(record => record.status === 'present').length
          const absentCount = records.filter(record => record.status === 'absent').length
          const attendanceRate = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0

          setSummary({
            totalClasses,
            completedClasses,
            presentCount,
            absentCount,
            attendanceRate
          })
        }
      }
    } catch (error) {
      console.error('Error loading student attendance data:', error)
    } finally {
      setLoading(false)
    }
  }, [user, studentId, getStudentInfo])

  useEffect(() => {
    if (user && studentId) {
      loadData()
    }
  }, [user, studentId, loadData])

  const handleBack = () => {
    router.push('/peer/attendance')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading student attendance data...</p>
        </div>
      </div>
    )
  }

  if (!studentInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Student not found</h3>
          <p className="text-gray-500 mb-4">The requested student could not be found.</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Back to Attendance
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64 overflow-y-auto">
        {/* Header */}
        <header className="bg-white shadow flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 lg:hidden"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  <div className="ml-4">
                    {/* Breadcrumb */}
                    <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                      <button
                        onClick={handleBack}
                        className="hover:text-gray-700 transition-colors"
                      >
                        Attendance
                      </button>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="text-gray-900 font-medium">{studentInfo.name}</span>
                    </nav>
                    
                    <h1 className="text-2xl font-bold text-gray-900">
                      {studentInfo.name} - Attendance History
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                      {studentInfo.email} • {studentInfo.dept} - {studentInfo.year} - {studentInfo.section}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleBack}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  Back to Attendance
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Classes Completed */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-blue-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Classes Completed</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {summary.completedClasses}/{summary.totalClasses}
                  </p>
                </div>
              </div>
            </div>

            {/* Present Count */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-green-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Present</p>
                  <p className="text-2xl font-bold text-gray-900">{summary.presentCount}</p>
                </div>
              </div>
            </div>

            {/* Absent Count */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-red-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Absent</p>
                  <p className="text-2xl font-bold text-gray-900">{summary.absentCount}</p>
                </div>
              </div>
            </div>

            {/* Attendance Rate */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-yellow-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Attendance Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{summary.attendanceRate}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Records Table */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Detailed Attendance Records</h3>
              <p className="text-sm text-gray-600">
                {attendanceRecords.length} record(s) found
              </p>
            </div>
            
            {attendanceRecords.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subject
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {attendanceRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {record.classes?.subject_name || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {record.classes ? `${record.classes.dept} - ${record.classes.year} - ${record.classes.section}` : 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {record.scheduled_classes?.scheduled_date 
                              ? new Date(record.scheduled_classes.scheduled_date).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })
                              : record.classes?.created_at 
                                ? new Date(record.classes.created_at).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })
                                : 'N/A'
                            }
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            record.status === 'present' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {record.status === 'present' ? (
                              <>
                                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Present
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                                Absent
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {new Date(record.updated_at).toLocaleString()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No attendance records found</h3>
                <p className="text-gray-500">This student has no attendance records yet.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
