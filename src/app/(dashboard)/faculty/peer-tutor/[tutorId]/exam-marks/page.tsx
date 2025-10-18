'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { PeerTutorService, PeerTutor } from '@/lib/services/peerTutorService'
import { StudentService, Student } from '@/lib/services/studentService'
import { ExamMarksService } from '@/lib/services/examMarksService'

export default function PeerTutorExamMarksPage() {
  return (
    <FacultyProtectedRoute>
      <PeerTutorExamMarksContent />
    </FacultyProtectedRoute>
  )
}

interface ExamMark {
  id: string
  exam_type: string
  subject: string
  marks: number
  max_marks: number
  student_name: string
  student_email: string
  created_at: string
}

function PeerTutorExamMarksContent() {
  const { user } = useAuth()
  const params = useParams()
  const router = useRouter()
  const tutorId = params.tutorId as string

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [peerTutor, setPeerTutor] = useState<PeerTutor | null>(null)
  const [assignedStudents, setAssignedStudents] = useState<Student[]>([])
  const [examMarks, setExamMarks] = useState<ExamMark[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedExamType, setSelectedExamType] = useState<string>('all')

  useEffect(() => {
    if (user && tutorId) {
      loadPeerTutorData()
    }
  }, [user, tutorId])

  const loadPeerTutorData = async () => {
    if (!user?.email || !tutorId) return

    setLoading(true)
    try {
      // Get peer tutor information
      const tutorData = await PeerTutorService.getPeerTutorById(tutorId)
      if (tutorData) {
        setPeerTutor(tutorData)

        // Get assigned students
        const students = await StudentService.getStudentsByPeerTutor(tutorId)
        setAssignedStudents(students)

        // Get exam marks for assigned students
        const marks = await ExamMarksService.getExamMarksByPeerTutor(tutorId)
        setExamMarks(marks)
      }
    } catch (error) {
      console.error('Error loading peer tutor data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    router.back()
  }

  // Get unique exam types
  const examTypes = Array.from(new Set(examMarks.map(mark => mark.exam_type)))
  
  // Filter marks based on selected exam type
  const filteredMarks = selectedExamType === 'all' 
    ? examMarks 
    : examMarks.filter(mark => mark.exam_type === selectedExamType)

  // Group marks by student for table display
  const marksByStudent = filteredMarks.reduce((acc, mark) => {
    if (!acc[mark.student_name]) {
      acc[mark.student_name] = {
        student_name: mark.student_name,
        student_email: mark.student_email,
        marks: {}
      }
    }
    acc[mark.student_name].marks[mark.subject] = {
      marks: mark.marks,
      max_marks: mark.max_marks,
      percentage: Math.round((mark.marks / mark.max_marks) * 100)
    }
    return acc
  }, {} as Record<string, { student_name: string; student_email: string; marks: Record<string, { marks: number; max_marks: number; percentage: number }> }>)

  // Get unique subjects
  const subjects = Array.from(new Set(filteredMarks.map(mark => mark.subject)))

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading exam marks...</p>
        </div>
      </div>
    )
  }

  if (!peerTutor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Peer tutor not found</h3>
          <p className="text-gray-500 mb-4">The requested peer tutor could not be found.</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

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
                        onClick={() => router.push('/faculty/exam')}
                        className="hover:text-gray-700 transition-colors"
                      >
                        Exam Marks
                      </button>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="text-gray-900 font-medium">{peerTutor.name}</span>
                    </nav>
                    
                    <h1 className="text-2xl font-bold text-gray-900">
                      {peerTutor.name} - Exam Marks
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                      {peerTutor.email} • {peerTutor.dept} - {peerTutor.year} - {peerTutor.section}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => router.push('/faculty/exam')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Back to Exam Overview
                  </button>
                  <button
                    onClick={handleBack}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          {/* Stats and Filters */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Exam Marks Overview</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{assignedStudents.length}</div>
                  <div className="text-sm text-gray-500">Assigned Students</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{examTypes.length}</div>
                  <div className="text-sm text-gray-500">Exam Types</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{subjects.length}</div>
                  <div className="text-sm text-gray-500">Subjects</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{examMarks.length}</div>
                  <div className="text-sm text-gray-500">Total Records</div>
                </div>
              </div>

              {/* Exam Type Filter */}
              <div className="flex items-center space-x-4">
                <label className="text-sm font-medium text-gray-700">Filter by Exam Type:</label>
                <select
                  value={selectedExamType}
                  onChange={(e) => setSelectedExamType(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Exam Types</option>
                  {examTypes.map(type => (
                    <option key={type} value={type}>
                      {type.replace('-', ' ').toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Exam Marks Table */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                Student Exam Marks
                {selectedExamType !== 'all' && (
                  <span className="ml-2 text-sm text-gray-500">
                    - {selectedExamType.replace('-', ' ').toUpperCase()}
                  </span>
                )}
              </h3>
              <p className="text-sm text-gray-600">
                {Object.keys(marksByStudent).length} student(s) • {subjects.length} subject(s)
              </p>
            </div>
            <div className="overflow-x-auto">
              {Object.keys(marksByStudent).length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Student
                      </th>
                      {subjects.map(subject => (
                        <th key={subject} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {subject}
                        </th>
                      ))}
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Average
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(marksByStudent).map(([studentName, studentData]) => {
                      const studentMarks = studentData.marks
                      const totalMarks = Object.values(studentMarks).reduce((sum, mark) => sum + mark.marks, 0)
                      const totalMaxMarks = Object.values(studentMarks).reduce((sum, mark) => sum + mark.max_marks, 0)
                      const averagePercentage = totalMaxMarks > 0 ? Math.round((totalMarks / totalMaxMarks) * 100) : 0

                      return (
                        <tr key={studentName} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{studentName}</div>
                              <div className="text-sm text-gray-500">{studentData.student_email}</div>
                            </div>
                          </td>
                          {subjects.map(subject => {
                            const mark = studentMarks[subject]
                            return (
                              <td key={subject} className="px-6 py-4 whitespace-nowrap text-center">
                                {mark ? (
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {mark.marks}/{mark.max_marks}
                                    </div>
                                    <div className={`text-xs ${
                                      mark.percentage >= 80 ? 'text-green-600' :
                                      mark.percentage >= 60 ? 'text-yellow-600' :
                                      'text-red-600'
                                    }`}>
                                      {mark.percentage}%
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-400">-</div>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className={`text-sm font-medium ${
                              averagePercentage >= 80 ? 'text-green-600' :
                              averagePercentage >= 60 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {averagePercentage}%
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-md font-medium text-gray-900 mb-2">No exam marks found</h3>
                  <p className="text-gray-500">
                    {selectedExamType === 'all' 
                      ? 'No exam marks have been recorded for this peer tutor yet.'
                      : `No ${selectedExamType.replace('-', ' ').toUpperCase()} marks found.`
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
