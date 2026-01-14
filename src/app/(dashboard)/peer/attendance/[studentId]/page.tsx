'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { AttendanceService } from '@/lib/services/attendanceService'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { 
  ArrowLeft, 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  Percent, 
  Calendar,
  Clock,
  User
} from 'lucide-react'
import { logger } from '@/lib/logger'

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

  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isSidebarCollapsed] = useSidebarCollapsed()
  
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

  // Keep existing fetch logic
  const getStudentInfo = useCallback(async (studentId: string) => {
    try {
      const supabase = (await import('@/lib/supabase/client')).createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('id, name, email, dept, year, section')
        .eq('id', studentId)
        .single()

      if (error) {
        logger.error('Error getting student info:', error)
        return null
      }

      return data
    } catch (error) {
      logger.error('Error in getStudentInfo:', error)
      return null
    }
  }, [])

  const loadData = useCallback(async () => {
    if (!user?.email || !studentId) return

    setLoading(true)
    try {
      const tutorInfo = await peertutorsAuthService.getpeertutorsByEmail(user.email)
      if (tutorInfo) {
        const studentData = await getStudentInfo(studentId)
        if (studentData) {
          setStudentInfo(studentData)

          const records = await AttendanceService.getStudentAttendanceHistory(studentId, tutorInfo.id)
          setAttendanceRecords(records)

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
      logger.error('Error loading student attendance data:', error)
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

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-sm font-medium text-gray-500 uppercase tracking-widest">Loading Records...</p>
        </div>
      )
    }

    if (!studentInfo) {
      return (
        <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-lg font-black text-gray-900 mb-2 uppercase tracking-wide">Student Not Found</h3>
          <p className="text-gray-500 mb-6 text-sm">The requested student could not be found or you don&apos;t have permission to view their records.</p>
          <button
            onClick={handleBack}
            className="w-full px-4 py-3 bg-gray-900 text-white rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-gray-800 transition-colors"
          >
            Back to Attendance
          </button>
        </div>
      )
    }

    return (
      <div className="max-w-[1600px] mx-auto space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Classes Completed */}
          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Classes
                </div>
                <BookOpen className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex items-baseline gap-1">
                <div className="text-3xl font-bold text-gray-900">{summary.completedClasses}</div>
                <span className="text-sm font-bold text-gray-400">/ {summary.totalClasses}</span>
              </div>
              <div className="mt-2 flex items-center text-xs text-blue-600">
                <span className="font-semibold uppercase">Classes Completed</span>
              </div>
            </div>
          </div>

          {/* Present Count */}
          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Present
                </div>
                <CheckCircle className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {summary.presentCount}
              </div>
              <div className="mt-2 flex items-center text-xs text-green-600">
                <span className="font-semibold uppercase">Classes Attended</span>
              </div>
            </div>
          </div>

          {/* Absent Count */}
          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Absent
                </div>
                <XCircle className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {summary.absentCount}
              </div>
              <div className="mt-2 flex items-center text-xs text-red-600">
                <span className="font-semibold uppercase">Classes Missed</span>
              </div>
            </div>
          </div>

          {/* Attendance Rate */}
          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Rate
                </div>
                <Percent className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {summary.attendanceRate}%
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full mt-4 overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    summary.attendanceRate >= 75 ? 'bg-green-500' : 
                    summary.attendanceRate >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  }`} 
                  style={{ width: `${summary.attendanceRate}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Attendance Records */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
           <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">Attendance Records</h3>
                <p className="text-[10px] font-medium text-gray-400 mt-1 uppercase tracking-wider">
                  {attendanceRecords.length} Total Record(s) Found
                </p>
              </div>
           </div>
           
           {/* Mobile View (Cards) */}
           <div className="md:hidden">
              {attendanceRecords.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {attendanceRecords.map((record) => (
                    <div key={record.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-gray-900">{record.classes?.subject_name || 'N/A'}</p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-bold">{record.classes?.dept || 'N/A'}</span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Year {record.classes?.year}</span>
                            <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">Sec {record.classes?.section}</span>
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          record.status === 'present' 
                            ? 'bg-green-600 text-white' 
                            : 'bg-red-600 text-white'
                        }`}>
                          {record.status}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <div className="text-[10px] font-bold text-gray-700 uppercase">
                            {record.scheduled_classes?.scheduled_date 
                              ? new Date(record.scheduled_classes.scheduled_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
                              : 'N/A'
                            }
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span className="uppercase">{new Date(record.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center px-4">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <User className="w-5 h-5 text-gray-300" />
                  </div>
                  <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">No Records Found</p>
                  <p className="text-[10px] text-gray-400 mt-1 uppercase">This student has no attendance records yet.</p>
                </div>
              )}
           </div>

           {/* Desktop View (Table) */}
           <div className="hidden md:block overflow-x-auto">
             <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                    <TableHead className="py-4 pl-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Subject Information</TableHead>
                    <TableHead className="py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date & Time</TableHead>
                    <TableHead className="py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</TableHead>
                    <TableHead className="py-4 pr-6 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceRecords.length > 0 ? (
                    attendanceRecords.map((record) => (
                      <TableRow key={record.id} className="group hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0">
                        <TableCell className="py-4 pl-6">
                           <div>
                             <p className="text-xs font-bold text-gray-900 mb-0.5">{record.classes?.subject_name || 'N/A'}</p>
                             <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{record.classes?.dept || 'N/A'}</span>
                                <span>•</span>
                                <span>Year {record.classes?.year}</span>
                                <span>•</span>
                                <span>Sec {record.classes?.section}</span>
                             </div>
                           </div>
                        </TableCell>
                        <TableCell className="py-4 text-center">
                           <div className="flex flex-col items-center">
                              <div className="text-xs font-bold text-gray-700 uppercase">
                                {record.scheduled_classes?.scheduled_date 
                                  ? new Date(record.scheduled_classes.scheduled_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
                                  : record.classes?.created_at 
                                    ? new Date(record.classes.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
                                    : 'N/A'
                                }
                              </div>
                              <div className="text-[10px] font-medium text-gray-400 mt-1 uppercase">
                                 {record.scheduled_classes?.scheduled_date 
                                    ? new Date(record.scheduled_classes.scheduled_date).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
                                    : 'UNKNOWN DAY'
                                 }
                              </div>
                           </div>
                        </TableCell>
                        <TableCell className="py-4 text-center">
                           <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                              record.status === 'present' 
                                ? 'bg-green-600 text-white border border-green-100' 
                                : 'bg-red-600 text-white border border-red-100'
                            }`}>
                              {record.status}
                           </span>
                        </TableCell>
                        <TableCell className="py-4 pr-6 text-right">
                           <div className="flex items-center justify-end gap-1.5 text-[10px] font-medium text-gray-400">
                             <Clock className="w-3 h-3" />
                             {new Date(record.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                           </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                       <TableCell colSpan={4} className="py-12 text-center">
                          <div className="flex flex-col items-center justify-center">
                             <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                                <User className="w-5 h-5 text-gray-300" />
                             </div>
                             <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">No Records Found</p>
                             <p className="text-[10px] text-gray-400 mt-1">This student has no attendance records yet.</p>
                          </div>
                       </TableCell>
                    </TableRow>
                  )}
                </TableBody>
             </Table>
           </div>
        </div>

      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
        <PageHeader
          title={studentInfo?.name || (loading ? 'Loading...' : 'Not Found')}
          context="Attendance History"
          tagline={studentInfo ? `${studentInfo.dept} • Year ${studentInfo.year} • Section ${studentInfo.section}` : ''}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        >
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 hover:text-gray-900 transition-all shadow-sm text-xs font-bold uppercase tracking-wider"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
        </PageHeader>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
