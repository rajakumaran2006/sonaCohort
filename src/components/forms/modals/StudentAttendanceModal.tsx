'use client'


import { logger } from '@/lib/logger'
import { useState, useEffect, useCallback } from 'react'
import { AttendanceService, AttendanceHistoryRecord } from '@/lib/services/attendanceService'

interface StudentAttendanceModalProps {
  isOpen: boolean
  onClose: () => void
  student: {
    id: string
    name: string
    email: string
  } | null
  peertutorsId: string
}

export default function StudentAttendanceModal({
  isOpen,
  onClose,
  student,
  peertutorsId
}: StudentAttendanceModalProps) {
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceHistoryRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState({
    totalClasses: 0,
    presentCount: 0,
    absentCount: 0,
    attendanceRate: 0
  })

  const loadStudentAttendance = useCallback(async () => {
    if (!student) return
    
    setLoading(true)
    try {
      // Get all attendance records for this specific student
      const records = await AttendanceService.getStudentAttendanceHistory(student.id, peertutorsId)
      setAttendanceRecords(records)

      // Calculate summary
      const totalClasses = records.length
      const presentCount = records.filter(record => record.status === 'present').length
      const absentCount = records.filter(record => record.status === 'absent').length
      const attendanceRate = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0

      setSummary({
        totalClasses,
        presentCount,
        absentCount,
        attendanceRate
      })
    } catch (error) {
      logger.error('Error loading student attendance:', error)
    } finally {
      setLoading(false)
    }
  }, [student, peertutorsId])

  useEffect(() => {
    if (isOpen && student) {
      loadStudentAttendance()
    }
  }, [isOpen, student, peertutorsId, loadStudentAttendance])

  if (!isOpen || !student) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Attendance History - {student.name}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {student.email}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              </div>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center">
                    <div className="p-2 bg-blue-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-blue-600">Total Classes</p>
                      <p className="text-2xl font-bold text-blue-900">{summary.totalClasses}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center">
                    <div className="p-2 bg-green-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-green-600">Present</p>
                      <p className="text-2xl font-bold text-green-900">{summary.presentCount}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <div className="flex items-center">
                    <div className="p-2 bg-red-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-red-600">Absent</p>
                      <p className="text-2xl font-bold text-red-900">{summary.absentCount}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                  <div className="flex items-center">
                    <div className="p-2 bg-yellow-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-yellow-600">Attendance Rate</p>
                      <p className="text-2xl font-bold text-yellow-900">{summary.attendanceRate}%</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attendance Records Table */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h4 className="text-md font-medium text-gray-900">Detailed Attendance Records</h4>
                  <p className="text-sm text-gray-600">
                    {attendanceRecords.length} record(s) found
                  </p>
                </div>
                
                {attendanceRecords.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Subject
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Updated
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {attendanceRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {record.classes?.subject_name || 'Unknown Subject'}
                              </div>
                              <div className="text-sm text-gray-500">
                                {record.classes?.dept || '-'} - {record.classes?.year || '-'} - {record.classes?.section || '-'}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {record.scheduled_classes?.scheduled_date 
                                  ? new Date(record.scheduled_classes.scheduled_date).toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })
                                  : record.classes?.created_at ? new Date(record.classes.created_at).toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })
                                  : '-'
                                }
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
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
                            <td className="px-4 py-3 whitespace-nowrap">
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
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <h3 className="text-md font-medium text-gray-900 mb-2">No attendance records found</h3>
                    <p className="text-gray-500">This student has no attendance records yet.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
