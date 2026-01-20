'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { logger } from '@/lib/logger'
import { StudentService, StudentWithpeertutors } from '@/lib/services/studentService'
import { FeedbackService, FeedbackForm } from '@/lib/services/feedbackService'
import FeedbackSubmissionModal from '@/components/forms/feedback/FeedbackSubmissionModal'
import StudentSidebar from '@/components/layout/StudentSidebar'
import { Card, CardHeader, CardTitle, CardContent, Button, EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, StatusBadge } from '@/components/ui'

interface FeedbackFormWithStatus extends FeedbackForm {
  isSubmitted: boolean
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const router = useRouter()
  const [student, setStudent] = useState<StudentWithpeertutors | null>(null)
  const [feedbackForms, setFeedbackForms] = useState<FeedbackFormWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [selectedFeedbackForm, setSelectedFeedbackForm] = useState<FeedbackForm | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const sidebar = document.querySelector('[data-sidebar-collapsed]')
      return sidebar?.getAttribute('data-sidebar-collapsed') === 'true'
    }
    return false
  })

  // Listen for sidebar collapse state changes
  useEffect(() => {
    const checkSidebarState = () => {
      if (typeof window !== 'undefined') {
        const sidebar = document.querySelector('[data-sidebar-collapsed]')
        const collapsed = sidebar?.getAttribute('data-sidebar-collapsed') === 'true'
        setIsSidebarCollapsed(collapsed)
      }
    }

    checkSidebarState()
    const handleSidebarToggle = () => checkSidebarState()
    window.addEventListener('sidebar-toggle', handleSidebarToggle)

    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle)
    }
  }, [])

  useEffect(() => {
    const loadStudentData = async () => {
      if (!user?.email) return

      try {
        // Get all students and find the one matching the current user
        const allStudents = await StudentService.getAllStudentsWithpeerTutor()
        const currentStudent = allStudents.find(s => s.email === user.email)
        
        if (currentStudent) {
          setStudent(currentStudent)
          
          // Load active feedback forms
          const forms = await FeedbackService.getActiveFeedbackForms()
          
          // Check submission status for each form
          const formsWithStatus = await Promise.all(
            forms.map(async (form) => {
              const isSubmitted = await FeedbackService.hasStudentSubmittedFeedback(
                form.id,
                currentStudent.id
              )
              return {
                ...form,
                isSubmitted
              }
            })
          )
          
          setFeedbackForms(formsWithStatus)
        }
      } catch (error) {
        logger.error('Error loading student data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadStudentData()
  }, [user?.email])


  const handleSubmitFeedback = (form: FeedbackFormWithStatus) => {
    if (!form.isSubmitted) {
      setSelectedFeedbackForm(form)
      setShowFeedbackModal(true)
    }
  }

  const handleFeedbackSubmitted = async () => {
    if (!student) return
    
    // Reload feedback forms to update submission status
    const forms = await FeedbackService.getActiveFeedbackForms()
    const formsWithStatus = await Promise.all(
      forms.map(async (form) => {
        const isSubmitted = await FeedbackService.hasStudentSubmittedFeedback(
          form.id,
          student.id
        )
        return {
          ...form,
          isSubmitted
        }
      })
    )
    setFeedbackForms(formsWithStatus)
    setShowFeedbackModal(false)
    setSelectedFeedbackForm(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <StudentSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden flex-1 w-full lg:w-auto`}>
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
          <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div className="ml-2 lg:ml-0">
                  <h1 className="text-2xl font-semibold text-gray-900">Student Dashboard</h1>
                  <p className="text-sm text-gray-600">{loading ? 'Loading...' : student ? `Welcome, ${student.name}` : 'Student'}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="h-full w-full flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading dashboard...</p>
              </div>
            </div>
          ) : !student ? (
            <div className="h-full w-full flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
                <p className="text-gray-600 mb-6">You are not registered as a student in the system.</p>
                <Button onClick={() => router.push('/login')}>
                  Sign Out
                </Button>
              </div>
            </div>
          ) : (
          <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="space-y-8">
              {/* Student Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Your Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Name</label>
                      <p className="mt-1 text-sm text-gray-900">{student.name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email</label>
                      <p className="mt-1 text-sm text-gray-900">{student.email}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Department</label>
                      <p className="mt-1 text-sm text-gray-900">{student.dept}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Year & Section</label>
                      <p className="mt-1 text-sm text-gray-900">{student.year} - {student.section}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Assigned Peer Tutor</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {student.assigned_peer_tutor ? student.assigned_peer_tutor.name : 'None assigned'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Feedback Forms Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Feedback Forms</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    Submit feedback for available forms. Once submitted, you cannot resubmit.
                  </p>
                </CardHeader>
                <CardContent>
                  {feedbackForms.length === 0 ? (
                    <EmptyState
                      title="No Feedback Forms Available"
                      description="There are no pending responses at the moment."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Form Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Questions</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {feedbackForms.map((form) => (
                            <TableRow key={form.id}>
                              <TableCell>
                                <div className="text-sm font-medium text-gray-900">{form.name}</div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-gray-500">
                                  {form.description || 'No description'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-gray-900">
                                  {form.questions.length} {form.questions.length === 1 ? 'question' : 'questions'}
                                </div>
                              </TableCell>
                              <TableCell>
                                {form.isSubmitted ? (
                                  <StatusBadge status="submitted">Submitted</StatusBadge>
                                ) : (
                                  <StatusBadge status="pending">Pending</StatusBadge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {form.isSubmitted ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled
                                  >
                                    Already Submitted
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => handleSubmitFeedback(form)}
                                  >
                                    Submit Feedback
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
          )}
        </main>
      </div>

      {/* Feedback Submission Modal */}
      {selectedFeedbackForm && student && (
        <FeedbackSubmissionModal
          isOpen={showFeedbackModal}
          onClose={() => {
            setShowFeedbackModal(false)
            setSelectedFeedbackForm(null)
          }}
          onSuccess={handleFeedbackSubmitted}
          feedbackForm={selectedFeedbackForm}
          studentId={student.id}
        />
      )}
    </div>
  )
}