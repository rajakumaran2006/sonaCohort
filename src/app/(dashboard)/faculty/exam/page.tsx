'use client'

import { useState, useEffect } from 'react'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { ExamMarksService, ExamTypeData } from '@/lib/services/examMarksService'
import { FacultyService } from '@/lib/services/facultyService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { createClient } from '@/utils/supabase/client'

interface Student {
    id: string
    name: string
    email: string
  }

interface PeerTutor {
    id: string
    name: string
    email: string
    dept: string
    year: string
    section: string
  }

interface PeerTutorExamStatus {
  peerTutor: PeerTutor
  assignedStudents: Student[]
  examTypes: ExamTypeData[]
  isCompleted: boolean
  pendingCount: number
  totalCount: number
}

interface FilterOptions {
    year: string
    section: string
}

export default function FacultyExamPage() {
  return (
    <FacultyProtectedRoute>
      <FacultyExamContent />
    </FacultyProtectedRoute>
  )
}

function FacultyExamContent() {
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [facultyDepartment, setFacultyDepartment] = useState<string>('')
  const [peerTutorStatuses, setPeerTutorStatuses] = useState<PeerTutorExamStatus[]>([])
  const [filteredPeerTutorStatuses, setFilteredPeerTutorStatuses] = useState<PeerTutorExamStatus[]>([])
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])
  const [filters, setFilters] = useState<FilterOptions>({
    year: '',
    section: ''
  })

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    filterPeerTutorStatuses()
  }, [peerTutorStatuses, filters])

  const loadInitialData = async () => {
    try {
      setLoading(true)
      
      // Get faculty's department
      if (user?.email) {
        const facultyDept = await FacultyService.verifyFacultyAccess(user.email)
        if (facultyDept) {
          setFacultyDepartment(facultyDept.name)
          await loadPeerTutorData(facultyDept.name)
        }
      }
      
    } catch (error) {
      console.error('Error loading initial data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadPeerTutorData = async (department: string) => {
    try {
      const supabase = createClient()
      
      // Get all peer tutors in the department
      const { data: peerTutors, error: peerTutorsError } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('dept', department)

      if (peerTutorsError) {
        console.error('Error loading peer tutors:', peerTutorsError)
        return
      }

      // Get all subjects for the department
      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('subject_name')
        .eq('dept', department)

      if (classesError) {
        console.error('Error loading classes:', classesError)
      } else {
        const uniqueSubjects = [...new Set(classes?.map(c => c.subject_name) || [])]
        setAvailableSubjects(uniqueSubjects)
      }

      // Process each peer tutor
      const statuses: PeerTutorExamStatus[] = await Promise.all(
        (peerTutors || []).map(async (peerTutor) => {
          // Get assigned students
          const assignedStudents = await AssignmentService.getStudentsByPeerTutor(peerTutor.id)
          
          // Get exam types for this peer tutor
          const examTypes = await ExamMarksService.getExamTypes(peerTutor.id)
          
          // Check completion status for all exam types
          let isCompleted = true
          let pendingCount = 0
          let totalCount = 0

          try {
            // Check all exam types
            if (examTypes.length === 0) {
              // No exam types at all - consider as pending
              isCompleted = false
              totalCount = assignedStudents.length * availableSubjects.length
              pendingCount = totalCount
            } else {
              for (const examType of examTypes) {
                const marks = await ExamMarksService.getMarks(examType.exam_type, peerTutor.id)
                const studentMarksMap = new Map()
                marks.forEach(mark => {
                  studentMarksMap.set(`${mark.student_id}_${mark.subject_name}`, mark.marks)
                })

                const examTypeTotal = assignedStudents.length * availableSubjects.length
                totalCount += examTypeTotal

                for (const student of assignedStudents) {
                  for (const subject of availableSubjects) {
                    const key = `${student.id}_${subject}`
                    if (!studentMarksMap.has(key) || studentMarksMap.get(key) === '' || studentMarksMap.get(key) === '0') {
                      pendingCount++
                      isCompleted = false
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error(`Error checking completion status for peer tutor ${peerTutor.id}:`, error)
            // If there's an error, consider as pending
            isCompleted = false
            totalCount = assignedStudents.length * availableSubjects.length
            pendingCount = totalCount
          }

          return {
            peerTutor,
            assignedStudents,
            examTypes,
            isCompleted,
            pendingCount,
            totalCount
          }
        })
      )

      setPeerTutorStatuses(statuses)
    } catch (error) {
      console.error('Error loading peer tutor data:', error)
    }
  }

  const filterPeerTutorStatuses = () => {
    let filtered = peerTutorStatuses

    // Apply year filter
    if (filters.year) {
      filtered = filtered.filter(status => status.peerTutor.year === filters.year)
    }

    // Apply section filter
    if (filters.section) {
      filtered = filtered.filter(status => status.peerTutor.section === filters.section)
    }

    // Type filter is already applied in loadPeerTutorData
    setFilteredPeerTutorStatuses(filtered)
  }

  const handleFilterChange = (key: keyof FilterOptions, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const resetFilters = () => {
    setFilters({
      year: '',
      section: ''
    })
  }

  const handlePeerTutorClick = (status: PeerTutorExamStatus) => {
    // Only allow clicking on completed peer tutors
    if (status.isCompleted) {
      // Navigate to exam marks table view
      window.open(`/faculty/peer-tutor/${status.peerTutor.id}/exam-marks`, '_self')
    }
  }

  const getUniqueValues = (key: keyof PeerTutor) => {
    const values = peerTutorStatuses.map(status => status.peerTutor[key]).filter(Boolean) as string[]
    return [...new Set(values)].sort()
  }

  const completedStatuses = filteredPeerTutorStatuses.filter(status => status.isCompleted)
  const pendingStatuses = filteredPeerTutorStatuses.filter(status => !status.isCompleted)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <div className="flex-1 flex items-center justify-center lg:ml-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      {/* Main content */}
      <div className="flex-1 lg:ml-64 overflow-y-auto">
        {/* Mobile header */}
        <div className="lg:hidden bg-white shadow-sm border-b border-gray-200 px-4 py-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="text-gray-500 hover:text-gray-700 focus:outline-none focus:text-gray-700"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Page content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Exam Marks</h1>
                <p className="mt-2 text-gray-600">
                  View and manage exam marks
                  {facultyDepartment && (
                    <span className="ml-2 text-blue-600 font-medium">• {facultyDepartment}</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">Total Peer Tutors</h3>
                  <p className="text-3xl font-bold text-blue-600">{peerTutorStatuses.length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">Completed</h3>
                  <p className="text-3xl font-bold text-green-600">{completedStatuses.length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">Pending</h3>
                  <p className="text-3xl font-bold text-orange-600">{pendingStatuses.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Year Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Year
                </label>
                <select
                  value={filters.year}
                  onChange={(e) => handleFilterChange('year', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Years</option>
                  {getUniqueValues('year').map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              {/* Section Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Section
                </label>
                <select
                  value={filters.section}
                  onChange={(e) => handleFilterChange('section', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Sections</option>
                  {getUniqueValues('section').map(section => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reset Button */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={resetFilters}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Reset Filters
              </button>
            </div>
          </div>

          {/* Peer Tutors List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Peer Tutors</h2>
              <p className="text-sm text-gray-600">Click on a peer tutor to view their exam marks</p>
            </div>
            
            <div className="p-6">
              {/* Tabs */}
              <div className="flex space-x-1 mb-6">
                <button
                  className="px-4 py-2 text-sm font-medium rounded-md bg-blue-100 text-blue-700"
                >
                  All Peer Tutors ({filteredPeerTutorStatuses.length})
                </button>
                <button
                  className="px-4 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700"
                >
                  Completed ({completedStatuses.length})
                </button>
                <button
                  className="px-4 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700"
                >
                  Pending ({pendingStatuses.length})
                </button>
              </div>
              
              {/* Peer Tutor Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPeerTutorStatuses.map((status) => (
                  <div 
                    key={status.peerTutor.id}
                    className={`rounded-lg p-6 border-2 transition-all duration-200 ${
                      status.isCompleted
                        ? 'bg-green-50 border-green-200 hover:border-green-300 hover:shadow-md cursor-pointer'
                        : 'bg-orange-50 border-orange-200 cursor-not-allowed opacity-75'
                    }`}
                    onClick={() => handlePeerTutorClick(status)}
                    >
                      <div className="flex items-center mb-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 ${
                        status.isCompleted ? 'bg-green-100' : 'bg-orange-100'
                      }`}>
                        <span className={`text-lg font-bold ${
                          status.isCompleted ? 'text-green-600' : 'text-orange-600'
                        }`}>
                          {status.peerTutor.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">{status.peerTutor.name}</h3>
                        <p className="text-sm text-gray-500">{status.peerTutor.email}</p>
                        <p className="text-sm text-gray-500">{status.peerTutor.year} - {status.peerTutor.section}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{status.assignedStudents.length}</div>
                          <div className="text-gray-500">Students</div>
                        </div>
                        <div className="text-center">
                        <div className={`text-2xl font-bold ${
                          status.isCompleted ? 'text-green-600' : 'text-orange-600'
                        }`}>
                          {status.isCompleted ? 'Complete' : status.pendingCount}
                        </div>
                        <div className="text-gray-500">
                          {status.isCompleted ? 'Status' : 'Pending'}
                        </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 text-center">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        status.isCompleted
                          ? 'bg-green-100 text-green-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {status.isCompleted ? (
                          <>
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                            Completed
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                            Pending
                          </>
                        )}
                          </span>
                      </div>
                    </div>
                  ))}
            </div>
            
              {filteredPeerTutorStatuses.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No peer tutors found</h3>
                  <p className="text-gray-500">
                    {peerTutorStatuses.length === 0 
                      ? "No peer tutors have been assigned yet."
                      : "No peer tutors match your current filters. Try adjusting your search criteria."
                    }
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
