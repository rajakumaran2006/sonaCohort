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
  XCircle, 
  Percent, 
  Calendar,
  Clock,
  User
} from 'lucide-react'
import ExportButton from '@/components/ui/ExportButton'
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
  student_id: string | null
  status: 'present' | 'absent'
  created_at: string
  updated_at: string
  classes?: {
    id: string
    subject_name: string
    created_at: string
    dept?: string | null
    year?: string | null
    section?: string | null
    topics?: string | null
  } | null
  scheduled_classes?: {
    id: string
    scheduled_date: string
    class_id: string
    topics?: string | null
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

  const handleExport = () => {
    import('xlsx').then(XLSX => {
      const dataToExport = attendanceRecords.map(record => ({
        'Subject Name': record.classes?.subject_name || 'N/A',
        'Department': record.classes?.dept || 'N/A',
        'Year': record.classes?.year ? `Year ${record.classes.year}` : 'N/A',
        'Section': record.classes?.section ? `Sec ${record.classes.section}` : 'N/A',
        'Date': record.scheduled_classes?.scheduled_date 
          ? new Date(record.scheduled_classes.scheduled_date).toLocaleDateString('en-GB')
          : record.classes?.created_at 
            ? new Date(record.classes.created_at).toLocaleDateString('en-GB')
            : 'N/A',
        'Status': record.status.toUpperCase(),
        'Last Updated': new Date(record.updated_at).toLocaleTimeString()
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance History");
      
      const fileName = `${studentInfo?.name || 'Student'}_Attendance_History_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      XLSX.writeFile(wb, fileName);
    });
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading</span>
          </div>
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
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" x="0px" y="0px" width="16" height="16" viewBox="0 0 30 30" fill="currentColor">
    <path d="M 5 4 C 3.895 4 3 4.895 3 6 L 3 9 L 3 25 A 1.0001 1.0001 0 0 0 4 26 L 26 26 A 1.0001 1.0001 0 0 0 27 25 L 27 8 L 27 6 C 27 4.895 26.105 4 25 4 L 5 4 z M 5 9 L 25 9 L 25 24 L 5 24 L 5 9 z M 9 11 A 1.0001 1.0001 0 1 0 9 13 L 9 15 A 1.0001 1.0001 0 1 0 11 15 L 11 12 A 1.0001 1.0001 0 0 0 10 11 L 9 11 z M 15 11 C 13.895 11 13 11.895 13 13 L 13 14 C 13 15.105 13.895 16 15 16 C 16.105 16 17 15.105 17 14 L 17 13 C 17 11.895 16.105 11 15 11 z M 20 11 A 1.0001 1.0001 0 1 0 20 13 L 20 15 A 1.0001 1.0001 0 1 0 22 15 L 22 12 A 1.0001 1.0001 0 0 0 21 11 L 20 11 z M 10 17 C 8.895 17 8 17.895 8 19 L 8 20 C 8 21.105 8.895 22 10 22 C 11.105 22 12 21.105 12 20 L 12 19 C 12 17.895 11.105 17 10 17 z M 15 17 A 1.0001 1.0001 0 1 0 15 19 L 15 21 A 1.0001 1.0001 0 1 0 17 21 L 17 18 A 1.0001 1.0001 0 0 0 16 17 L 15 17 z M 20 17 A 1.0001 1.0001 0 1 0 20 19 L 20 21 A 1.0001 1.0001 0 1 0 22 21 L 22 18 A 1.0001 1.0001 0 0 0 21 17 L 20 17 z"></path>
</svg>
              </div>
              <div className="flex items-baseline gap-1">
                <div className="text-3xl font-bold text-gray-900">{summary.completedClasses}</div>
                <span className="text-sm font-bold text-gray-400">/ {summary.totalClasses}</span>
              </div>
              <div className="mt-2 flex items-center text-xs text-gray-400">
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
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" x="0px" y="0px" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19,3h-4.184C14.403,1.837,13.304,1,12,1S9.597,1.837,9.184,3H5C3.895,3,3,3.895,3,5v14c0,1.105,0.895,2,2,2h14 c1.105,0,2-0.895,2-2V5C21,3.895,20.105,3,19,3z M8.707,11.293L11,13.586l4.293-4.293c0.39-0.39,1.024-0.39,1.414,0l0,0 c0.39,0.39,0.39,1.024,0,1.414l-5,5c-0.39,0.39-1.024,0.39-1.414,0l-3-3c-0.39-0.39-0.39-1.024,0-1.414l0,0 C7.683,10.902,8.316,10.902,8.707,11.293z M12,3c0.552,0,1,0.448,1,1c0,0.552-0.448,1-1,1s-1-0.448-1-1C11,3.448,11.448,3,12,3z"></path>
</svg>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {summary.presentCount}
              </div>
              <div className="mt-2 flex items-center text-xs text-gray-400">
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
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" x="0px" y="0px" width="16" height="16" viewBox="0 0 50 50" fill="currentColor">
    <path d="M25,2C12.297,2,2,12.297,2,25c0,12.703,10.297,23,23,23s23-10.297,23-23C48,12.297,37.703,2,25,2z M32.41,34h-2.694 L25,26.902h-0.2L19.998,34h-2.545l6.162-9.056L17.528,16h2.707l4.74,7.16h0.2L29.99,16h2.557l-6.237,9.044L32.41,34z"></path>
</svg>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {summary.absentCount}
              </div>
              <div className="mt-2 flex items-center text-xs text-gray-400">
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
              
              {attendanceRecords.length > 0 && (
                <ExportButton 
                  onClick={handleExport}
                  text="Export"
                />
              )}
           </div>
           
           {/* Mobile View (Cards) */}
           <div className="md:hidden">
              {attendanceRecords.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {attendanceRecords.map((record) => (
                    <div key={record.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-bold uppercase text-gray-900">{record.classes?.subject_name || 'N/A'}</p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-bold">{record.classes?.dept || 'N/A'}</span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Year {record.classes?.year}</span>
                            <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">Sec {record.classes?.section}</span>
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          record.status === 'present' 
                            ? 'bg-green-400 text-black' 
                            : 'bg-red-400 text-black'
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
                             <p className="text-xs font-bold text-gray-900 uppercase mb-0.5">{record.classes?.subject_name || 'N/A'}</p>
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
                                ? 'bg-green-400 text-black border border-green-100' 
                                : 'bg-red-400 text-black border border-red-100'
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
          title={studentInfo?.name || 'Student'}
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
