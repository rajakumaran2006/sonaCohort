/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { BackButton } from '@/components/ui/BackButton'
import { AttendanceService, AttendanceHistoryRecord } from '@/lib/services/attendanceService'
import { StudentService, Student } from '@/lib/services/studentService'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { ExternalLink, Check, X, Image as ImageIcon } from 'lucide-react'
import { logger } from '@/lib/logger'

export default function StudentClassesPage() {
  const router = useRouter()
  const params = useParams()
  
  const deptId = params.deptId as string
  const yearId = params.yearId as string
  const sectionId = params.sectionId as string
  const studentId = params.studentId as string
  
  const [student, setStudent] = useState<Student | null>(null)
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const fetchStudentData = async () => {
      setLoading(true)
      try {
        // Fetch all students in section and find the specific one
        const studentsInSection = await StudentService.getStudentsBySection(deptId, yearId, sectionId)
        const found = studentsInSection.find(s => s.id === studentId)
        if (found) {
          setStudent(found)
        }

        const records = await AttendanceService.getStudentAttendanceHistory(studentId)
        setAttendanceRecords(records)
      } catch (error) {
        logger.error('Error fetching student class data:', error)
      } finally {
        setLoading(false)
      }
    }

    if (studentId) {
      fetchStudentData()
    }
  }, [studentId, deptId, yearId, sectionId])

  const handleBack = () => {
    router.push(`/faculty/department/${deptId}/year/${yearId}/section/${sectionId}?tab=students`)
  }

  // Format the date for display
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-GB')
    } catch {
      return '-'
    }
  }

  const formatDay = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', { weekday: 'long' })
    } catch {
      return '-'
    }
  }

  return (
    <FacultyProtectedRoute>
      <div className="min-h-screen bg-[#F8FAFC]">
        {/* Sidebar */}
        <FacultySidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Main content */}
        <div className="lg:ml-64 min-h-screen flex flex-col transition-all duration-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 w-full">
            <div className="mb-8">
              <BackButton onClick={handleBack} />
              
              <div className="mt-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight">
                    {loading ? 'Loading Student...' : student ? student.name : 'Student Details'}
                  </h1>
                  {student && (
                    <p className="text-sm text-gray-500 mt-1">{student.email}</p>
                  )}
                  <p className="text-sm font-medium text-gray-400 mt-2 uppercase tracking-wider">
                    Classes Taken · {attendanceRecords.length} Records
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {loading ? (
                <div className="p-6">
                  <TableSkeleton />
                </div>
              ) : attendanceRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="h-24 w-24 bg-gray-50 rounded-full flex items-center justify-center mb-6 border border-gray-100">
                    <Check className="w-10 h-10 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">NO CLASSES FOUND</h3>
                  <p className="text-gray-500 text-center max-w-sm">
                    This student hasn&apos;t attended any classes yet.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="block lg:hidden space-y-4 p-4">
                    {attendanceRecords.map((record) => {
                      const date = record.scheduled_classes?.scheduled_date || record.created_at || ''
                      const subject = record.classes?.subject_name || 'N/A'
                      const topic = record.scheduled_classes?.topics || record.classes?.topics || 'N/A'
                      // Type errors here on link and image_link, they do not exist in ScheduledClass returned by AttendanceHistoryRecord
                      const isAdditional = !record.scheduled_classes

                      return (
                        <div key={record.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-base font-semibold text-gray-900">{subject}</h4>
                                {isAdditional && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200 mt-1">
                                    Additional
                                  </span>
                                )}
                              </div>
                              <div>
                                {record.status === 'present' ? (
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700">
                                    <Check className="w-4 h-4" />
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-700">
                                    <X className="w-4 h-4" />
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="p-4 space-y-2">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-gray-100 rounded-lg p-3">
                                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Date</p>
                                <p className="text-sm font-bold text-black">{date ? formatDate(date) : '-'}</p>
                              </div>
                              <div className="bg-gray-100 rounded-lg p-3">
                                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Day</p>
                                <p className="text-sm font-bold text-black">{date ? formatDay(date) : '-'}</p>
                              </div>
                            </div>
                            <div className="bg-gray-100 rounded-lg p-3">
                              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Topic</p>
                              <p className="text-sm font-medium text-black">{topic}</p>
                            </div>
                            <div className="flex gap-2 pt-2">
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-white border-b border-gray-100">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">DATE</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">DAY</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">SUBJECT</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">TOPIC TAKEN</th>
                          <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">ATTENDANCE</th>
                          <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">RESOURCES</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {attendanceRecords.map((record) => {
                          const date = record.scheduled_classes?.scheduled_date || record.created_at || ''
                          const subject = record.classes?.subject_name || 'N/A'
                          const topic = record.scheduled_classes?.topics || record.classes?.topics || 'N/A'
                          const isAdditional = !record.scheduled_classes

                          return (
                            <tr key={record.id} className="group hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm font-medium text-gray-900">
                                  {date ? formatDate(date) : '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm text-gray-600 uppercase font-medium">
                                  {date ? formatDay(date) : '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-gray-900">
                                    {subject}
                                  </span>
                                  {isAdditional && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                                      Additional
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-gray-700 max-w-xs truncate block">
                                  {topic}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                {record.status === 'present' ? (
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700">
                                    <Check className="w-4 h-4" />
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-700">
                                    <X className="w-4 h-4" />
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="flex items-center justify-center gap-2">
                                    <span className="p-1.5 text-gray-300">
                                      <ExternalLink className="w-4 h-4" />
                                    </span>
                                    <span className="p-1.5 text-gray-300">
                                      <ImageIcon className="w-4 h-4" />
                                    </span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </FacultyProtectedRoute>
  )
}
