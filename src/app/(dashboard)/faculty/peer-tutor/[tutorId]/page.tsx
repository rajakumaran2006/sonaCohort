'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { PeerTutorService, PeerTutor } from '@/lib/services/peerTutorService'
import { StudentService, Student } from '@/lib/services/studentService'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { RenumerationService, PeerTutorRenumeration } from '@/lib/services/renumerationService'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Eye } from 'lucide-react'

export default function PeerTutorProfilePage() {
  return (
    <FacultyProtectedRoute>
      <PeerTutorProfileContent />
    </FacultyProtectedRoute>
  )
}

interface PeerTutorStats {
  totalClasses: number
  completedClasses: number
  pendingClasses: number
  assignedStudents: number
}



function PeerTutorProfileContent() {
  const { user } = useAuth()
  const params = useParams()
  const router = useRouter()
  const tutorId = params.tutorId as string

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  
  // Use custom hook for sidebar collapsed state (reads from localStorage synchronously)
  const [isSidebarCollapsed] = useSidebarCollapsed()
  const [peerTutor, setPeerTutor] = useState<PeerTutor | null>(null)
  const [assignedStudents, setAssignedStudents] = useState<Student[]>([])
  const [scheduledClasses, setScheduledClasses] = useState<ScheduledClassWithDetails[]>([])
  const [renumerations, setRenumerations] = useState<PeerTutorRenumeration[]>([])
  const [stats, setStats] = useState<PeerTutorStats>({
    totalClasses: 0,
    completedClasses: 0,
    pendingClasses: 0,
    assignedStudents: 0
  })
  const [loading, setLoading] = useState(true)

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

        // Get scheduled classes for this peer tutor
        const classes = await ScheduledClassService.getScheduledClassesByYearSection(
          tutorData.dept,
          tutorData.year,
          tutorData.section
        )
        setScheduledClasses(classes)


        // Get renumeration data for this peer tutor
        const renumerationData = await RenumerationService.getPeerTutorRenumeration(tutorId)
        setRenumerations(renumerationData)

        // Calculate statistics
        const totalClasses = classes.length
        const completedClasses = classes.filter(c => c.completion_status === 'completed').length
        const pendingClasses = totalClasses - completedClasses

        setStats({
          totalClasses,
          completedClasses,
          pendingClasses,
          assignedStudents: students.length
        })
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

  // Render loading state with sidebar
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        
        {/* Main Content */}
        <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} overflow-y-auto`}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading peer tutor data...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render error state with sidebar
  if (!peerTutor) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        
        {/* Main Content */}
        <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} overflow-y-auto`}>
          <div className="flex-1 flex items-center justify-center">
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
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} overflow-y-auto`}>
        {/* Header */}
        <header className="bg-white shadow flex-shrink-0 w-full">
          <div className={`w-full ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-0' : 'px-4 sm:px-6 lg:px-8'}`}>
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
                        onClick={() => router.push('/faculty/peer-tutor')}
                        className="hover:text-gray-700 transition-colors"
                      >
                        Peer Tutor Reports
                      </button>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="text-gray-900 font-medium">{peerTutor.name}</span>
                    </nav>
                    
                    <h1 className="text-2xl font-bold text-gray-900">
                      {peerTutor.name} - Peer Tutor Profile
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                      {peerTutor.email} • {peerTutor.dept} - {peerTutor.year} - {peerTutor.section}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-3">
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
        <main className={`flex-1 py-6 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-0' : 'px-4 sm:px-6 lg:px-8'}`}>
          {/* Peer Tutor Information Card */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Peer Tutor Information</h3>
            </div>
            <div className="p-6">
              <div className="flex items-center space-x-6">
                <div className="w-16 h-16 rounded-full bg-black border border-gray-800 flex items-center justify-center ring-2 ring-gray-900 shadow-xl">
                  <span className="text-2xl font-bold text-gray-400 tracking-tighter">
                    {peerTutor.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </span>
                </div>
                <div className="flex-1">
                  <h4 className="text-xl font-semibold text-gray-900">{peerTutor.name}</h4>
                  <p className="text-gray-600">{peerTutor.email}</p>
                  <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                    <span>Department: {peerTutor.dept}</span>
                    <span>•</span>
                    <span>Year: {peerTutor.year}</span>
                    <span>•</span>
                    <span>Section: {peerTutor.section}</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    Assigned by: {peerTutor.assigned_by}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Total Classes */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-blue-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Classes</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalClasses}</p>
                </div>
              </div>
            </div>

            {/* Completed Classes */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-green-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Completed Classes</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.completedClasses}</p>
                </div>
              </div>
            </div>

            {/* Pending Classes */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-yellow-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Pending Classes</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.pendingClasses}</p>
                </div>
              </div>
            </div>

            {/* Assigned Students */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-purple-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Assigned Students</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.assignedStudents}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Renumeration Section */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Renumeration Status</h3>
              <p className="text-sm text-gray-600">
                {renumerations.length} renumeration form(s) assigned
              </p>
            </div>
            <div className="p-6">
              {renumerations.length > 0 ? (
                <div className="space-y-4">
                  {renumerations.map((renumeration) => (
                    <div key={renumeration.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">
                            {renumeration.template?.name || 'Renumeration Form'}
                          </h4>
                          <p className="text-sm text-gray-500 mt-1">
                            {renumeration.template?.description || 'No description available'}
                          </p>
                          <div className="flex items-center mt-2 space-x-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              renumeration.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              renumeration.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                              renumeration.status === 'approved' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {renumeration.status ? (renumeration.status.charAt(0).toUpperCase() + renumeration.status.slice(1)) : 'Unknown'}
                            </span>
                            <span className="text-xs text-gray-500">
                              Created: {new Date(renumeration.created_at).toLocaleDateString()}
                            </span>
                            {renumeration.submitted_at && (
                              <span className="text-xs text-gray-500">
                                Submitted: {new Date(renumeration.submitted_at).toLocaleDateString()}
                              </span>
                            )}
                            {renumeration.approved_at && (
                              <span className="text-xs text-gray-500">
                                {renumeration.status === 'approved' ? 'Approved' : 'Rejected'}: {new Date(renumeration.approved_at).toLocaleDateString()}
                                {renumeration.approved_by && ` by ${renumeration.approved_by}`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {renumeration.status === 'submitted' && (
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => {
                                  // Handle approve
                                  console.log('Approve renumeration:', renumeration.id)
                                }}
                                className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => {
                                  // Handle reject
                                  console.log('Reject renumeration:', renumeration.id)
                                }}
                                className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              // View details
                              console.log('View renumeration details:', renumeration)
                            }}
                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                          >
                            VIEW
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-md font-medium text-gray-900 mb-2">No renumeration forms</h3>
                  <p className="text-gray-500">This peer tutor has no renumeration forms assigned yet.</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Assigned Students */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Assigned Students</h3>
                <p className="text-sm text-gray-600">
                  {assignedStudents.length} student(s) assigned
                </p>
              </div>
              <div className="p-6">
                {assignedStudents.length > 0 ? (
                  <div className="space-y-3">
                    {assignedStudents.map((student) => (
                      <div key={student.id} className="flex items-center space-x-4 p-3.5 bg-gray-50/50 border border-gray-100 rounded-xl hover:bg-white hover:shadow-sm transition-all duration-200">
                        <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 shadow-sm">
                          <span className="text-slate-700 font-bold text-sm tracking-tighter">
                            {student.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{student.name}</div>
                          <div className="text-sm text-gray-500">{student.email}</div>
                        </div>
                        <div className="text-sm text-gray-500">
                          {student.year} - {student.section}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                    </div>
                    <h3 className="text-md font-medium text-gray-900 mb-2">No students assigned</h3>
                    <p className="text-gray-500">This peer tutor has no students assigned yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
