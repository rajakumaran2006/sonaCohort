'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import StudentProtectedRoute from '@/components/auth/StudentProtectedRoute'
import StudentSidebar from '@/components/layout/StudentSidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { StudentService, Student } from '@/lib/services/studentService'
import { AssignmentService } from '@/lib/services/assignmentService'

export default function StudentStudentsPage() {
  return (
    <StudentProtectedRoute>
      <StudentStudentsContent />
    </StudentProtectedRoute>
  )
}

function StudentStudentsContent() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [studentInfo, setStudentInfo] = useState<Student | null>(null)
  const [assignedStudents, setAssignedStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  // Sidebar collapsed state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('student-sidebar-collapsed')
      return saved ? JSON.parse(saved) : false
    }
    return false
  })

  useEffect(() => {
    const handleSidebarToggle = () => {
      if (typeof window !== 'undefined') {
         const saved = localStorage.getItem('student-sidebar-collapsed')
         if (saved) setIsSidebarCollapsed(JSON.parse(saved))
      }
    }
    window.addEventListener('sidebar-toggle', handleSidebarToggle)
    return () => window.removeEventListener('sidebar-toggle', handleSidebarToggle)
  }, [])

  useEffect(() => {
    const loadData = async () => {
      if (user?.email) {
        try {
          // Get all students and find the current student
          const allStudents = await StudentService.getAllStudentsWithpeerTutor()
          const currentStudent = allStudents.find(s => s.email === user.email)
          
          if (currentStudent) {
            setStudentInfo(currentStudent)
            // For students viewing other students - this might not be the intended behavior
            // but keeping it as is for now
            const students = await AssignmentService.getStudentsBypeertutors(user.id || '')
            setAssignedStudents(students)
          }
        } catch (error) {
          console.error('Error loading data:', error)
        } finally {
          setLoading(false)
        }
      }
    }

    loadData()
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-600"></div>
      </div>
    )
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push('/login')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <StudentSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden flex-1 w-full lg:w-auto`}>
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-2xl font-semibold text-gray-900 ml-2 lg:ml-0">My Students</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user?.user_metadata?.full_name || user?.user_metadata?.name || studentInfo?.name || 'Student'}
                </p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <button
                onClick={handleSignOut}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Students List */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Assigned Students ({assignedStudents.length})
                </h3>
              </div>

              <div className="p-6">
                {assignedStudents.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {assignedStudents.map((student) => (
                      <div key={student.id} className="border border-gray-200 rounded-lg p-4 hover:border-green-300 transition-colors duration-200">
                        <div className="flex items-center mb-3">
                          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                            <span className="text-green-600 font-medium text-sm">
                              {student.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">{student.name}</h4>
                            <p className="text-sm text-gray-500">{student.email}</p>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          <p>Department: {student.dept}</p>
                          <p>Year: {student.year} - Section: {student.section}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No students assigned</h3>
                    <p className="text-gray-500">You don&apos;t have any students assigned to you yet.</p>
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
