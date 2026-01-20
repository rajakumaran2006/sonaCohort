'use client'

import { useState, useEffect, useCallback } from 'react'
import { AssignmentService, AssignmentStats, Assignment } from '@/lib/services/assignmentService'
import { StudentService, Student } from '@/lib/services/studentService'
import { peertutorservice, peertutors } from '@/lib/services/peerTutorService'
import { Upload, Download } from 'lucide-react'
import AssignmentImportModal from '@/components/forms/import-export/AssignmentImportModal'
import PeerTutorsMappingExport from '@/components/forms/import-export/PeerTutorMappingExport'
import { logger } from '@/lib/logger'

interface AssignTabProps {
  dept: string
  year: string
  section: string
}

// Helper function to get initials from name
const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Helper function to get avatar color based on name
const getAvatarColor = (name: string): string => {
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 
    'bg-indigo-500', 'bg-yellow-500', 'bg-red-500', 'bg-teal-500'
  ]
  const index = name.length % colors.length
  return colors[index]
}

export default function AssignTab({ dept, year, section }: AssignTabProps) {
  const [stats, setStats] = useState<AssignmentStats>({
    totalStudents: 0,
    totalpeerTutor: 0,
    assignedStudents: 0,
    unassignedStudents: 0,
    averageStudentsPerTutor: 0
  })
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [unassignedStudents, setUnassignedStudents] = useState<Student[]>([])
  const [peerTutors, setPeerTutors] = useState<peertutors[]>([])
  const [loading, setLoading] = useState(true)
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsData, assignmentsData, studentsData, tutorsData] = await Promise.all([
        AssignmentService.getAssignmentStats(dept, year, section),
        AssignmentService.getAssignments(dept, year, section),
        StudentService.getStudentsBySection(dept, year, section),
        peertutorservice.getpeerTutorBySection(dept, year, section)
      ])

      setStats(statsData)
      setAssignments(assignmentsData)
      setUnassignedStudents(studentsData.filter((s: Student) => !s.assigned_peer_tutor_id && !s.peer_tutor))
      setPeerTutors(tutorsData)
    } catch (error) {
      logger.error('Error loading assignment data:', error)
    } finally {
      setLoading(false)
    }
  }, [dept, year, section])

  useEffect(() => {
    loadData()
  }, [dept, year, section, loadData])

  const handleAutoAssign = async () => {
    setAutoAssigning(true)
    try {
      const success = await AssignmentService.autoAssignStudents(dept, year, section)
      if (success) {
        await loadData() // Reload data
      }
    } catch (error) {
      logger.error('Error auto-assigning students:', error)
    } finally {
      setAutoAssigning(false)
    }
  }

  const handleManualAssign = async (studentId: string, peertutorsId: string) => {
    try {
      const success = await AssignmentService.assignStudent(studentId, peertutorsId)
      if (success) {
        await loadData() // Reload data
      }
    } catch (error) {
      logger.error('Error manually assigning student:', error)
    }
  }

  const handleUnassign = async (studentId: string) => {
    try {
      const success = await AssignmentService.unassignStudent(studentId)
      if (success) {
        await loadData() // Reload data
      }
    } catch (error) {
      logger.error('Error unassigning student:', error)
    }
  }

  // Group students by their assigned peer tutor
  const getStudentsByTutor = (tutorId: string) => {
    return assignments.filter(a => a.peer_tutor_id === tutorId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
         <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200">
          <div className="flex items-center">
            <div className="p-3 bg-blue-500 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-blue-600">Total Students</p>
              <p className="text-3xl font-bold text-blue-900">{stats.totalStudents}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-200">
          <div className="flex items-center">
            <div className="p-3 bg-green-500 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-green-600">Peer Tutors</p>
              <p className="text-3xl font-bold text-green-900">{stats.totalpeerTutor}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-6 rounded-xl border border-yellow-200">
          <div className="flex items-center">
            <div className="p-3 bg-yellow-500 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-yellow-600">Assigned</p>
              <p className="text-3xl font-bold text-yellow-900">{stats.assignedStudents}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100 p-6 rounded-xl border border-red-200">
          <div className="flex items-center">
            <div className="p-3 bg-red-500 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-red-600">Unassigned</p>
              <p className="text-3xl font-bold text-red-900">{stats.unassignedStudents}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Auto Assign Section */}
      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Automatic Assignment</h3>
            <p className="text-gray-600">
              Distribute <span className="font-semibold text-blue-600">{stats.unassignedStudents}</span> unassigned students among <span className="font-semibold text-green-600">{stats.totalpeerTutor}</span> peer tutors
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Import Button - Always Shown */}
            <button
              onClick={() => setShowImportModal(true)}
              className="bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 flex items-center shadow-sm"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import
            </button>
            
            {/* Export Button - Conditional */}
            {assignments.length > 0 && (
              <button
                onClick={() => setShowExportModal(true)}
                className="bg-white border border-green-200 text-green-700 hover:bg-green-50 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 flex items-center shadow-sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </button>
            )}

            <button
              onClick={handleAutoAssign}
              disabled={autoAssigning || stats.unassignedStudents === 0 || stats.totalpeerTutor === 0}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 text-white px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none"
            >
              {autoAssigning ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Assigning...
                </div>
              ) : (
                'Auto Assign'
              )}
            </button>
          </div>
        </div>
      </div>

      {showImportModal && (
        <AssignmentImportModal
          dept={dept}
          year={year}
          section={section}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false)
            loadData()
          }}
        />
      )}

      {showExportModal && (
        <PeerTutorsMappingExport
          dept={dept}
          year={year}
          section={section}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Peer Tutor Cards */}
      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-gray-900">Peer Tutor Assignments</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {peerTutors.map((tutor) => {
            const assignedStudents = getStudentsByTutor(tutor.id)
            return (
              <div key={tutor.id} className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow duration-200">
                {/* Tutor Header */}
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`w-12 h-12 ${getAvatarColor(tutor.name)} rounded-full flex items-center justify-center text-white font-bold text-lg mr-4`}>
                        {getInitials(tutor.name)}
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold">{tutor.name}</h4>
                        <p className="text-indigo-100 text-sm">{tutor.email}</p>
                      </div>
                    </div>
                    <div className="bg-white bg-opacity-20 rounded-full px-3 py-1">
                      <span className="text-sm font-medium">{assignedStudents.length} students</span>
                    </div>
                  </div>
                </div>

                {/* Assigned Students */}
                <div className="p-6">
                  {assignedStudents.length > 0 ? (
                    <div className="space-y-3">
                      <h5 className="text-sm font-medium text-gray-700 mb-3">Assigned Students</h5>
                      {assignedStudents.map((assignment) => (
                        <div key={assignment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center">
                            <div className={`w-8 h-8 ${getAvatarColor(assignment.student_name)} rounded-full flex items-center justify-center text-white font-medium text-sm mr-3`}>
                              {getInitials(assignment.student_name)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{assignment.student_name}</p>
                              <p className="text-xs text-gray-500">{assignment.student_email}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleUnassign(assignment.student_id)}
                            className="text-red-500 hover:text-red-700 transition-colors duration-200"
                            title="Unassign student"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-sm">No students assigned</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Unassigned Students */}
      {unassignedStudents.length > 0 && (
        <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Unassigned Students</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unassignedStudents.map((student) => (
              <div key={student.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors duration-200">
                <div className="flex items-center">
                  <div className={`w-10 h-10 ${getAvatarColor(student.name)} rounded-full flex items-center justify-center text-white font-medium text-sm mr-3`}>
                    {getInitials(student.name)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{student.name}</p>
                    <p className="text-sm text-gray-500">{student.email}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleManualAssign(student.id, e.target.value)
                      }
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    defaultValue=""
                  >
                    <option value="">Assign to...</option>
                    {peerTutors.map((tutor) => (
                      <option key={tutor.id} value={tutor.id}>
                        {tutor.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
