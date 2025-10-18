'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { StudentService, StudentWithPeerTutor } from '@/lib/services/studentService'
import { FeedbackService, FeedbackForm } from '@/lib/services/feedbackService'
import FeedbackSubmissionModal from '@/components/forms/FeedbackSubmissionModal'
import { Card, CardHeader, CardTitle, CardContent, Button, LoadingOverlay, EmptyState } from '@/components/ui'

export default function StudentDashboard() {
  const { user, signOut } = useAuth()
  const [student, setStudent] = useState<StudentWithPeerTutor | null>(null)
  const [feedbackForms, setFeedbackForms] = useState<FeedbackForm[]>([])
  const [loading, setLoading] = useState(true)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [selectedFeedbackForm, setSelectedFeedbackForm] = useState<FeedbackForm | null>(null)

  useEffect(() => {
    const loadStudentData = async () => {
      if (!user?.email) return

      try {
        // Get all students and find the one matching the current user
        const allStudents = await StudentService.getAllStudentsWithPeerTutors()
        const currentStudent = allStudents.find(s => s.email === user.email)
        
        if (currentStudent) {
          setStudent(currentStudent)
          
          // Load active feedback forms
          const forms = await FeedbackService.getActiveFeedbackForms()
          setFeedbackForms(forms)
        }
      } catch (error) {
        console.error('Error loading student data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadStudentData()
  }, [user?.email])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingOverlay size="xl" />
      </div>
    )
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6">You are not registered as a student in the system.</p>
          <Button onClick={() => signOut()}>
            Sign Out
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Student Dashboard</h1>
              <p className="text-sm text-gray-600">Welcome, {student.name}</p>
            </div>
            <Button variant="danger" size="sm" onClick={() => signOut()}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            </div>
            </CardContent>
          </Card>

          {/* Assigned Peer Tutor Card */}
          <Card>
            <CardHeader>
              <CardTitle>Your Assigned Peer Tutor</CardTitle>
            </CardHeader>
            <CardContent>
            {student.assigned_peer_tutor ? (
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0 h-12 w-12">
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-blue-600 font-medium">
                      {student.assigned_peer_tutor.name.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{student.assigned_peer_tutor.name}</h3>
                  <p className="text-sm text-gray-600">{student.assigned_peer_tutor.email}</p>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No Peer Tutor Assigned"
                description="You don't have an assigned peer tutor yet. Please contact your faculty."
              />
            )}
            </CardContent>
          </Card>

          {/* Feedback Forms Section */}
          <Card>
            <CardHeader>
              <CardTitle>Feedback Forms</CardTitle>
            </CardHeader>
            <CardContent>
            {feedbackForms.length === 0 ? (
              <EmptyState
                title="No Feedback Forms Available"
                description="There are no active feedback forms at the moment."
              />
            ) : (
              <div className="space-y-4">
                {feedbackForms.map((form) => (
                  <div key={form.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">{form.name}</h3>
                        {form.description && (
                          <p className="text-sm text-gray-600 mt-1">{form.description}</p>
                        )}
                        <p className="text-sm text-gray-500 mt-2">
                          {form.questions.length} question{form.questions.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedFeedbackForm(form)
                          setShowFeedbackModal(true)
                        }}
                      >
                        Submit Feedback
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Feedback Submission Modal */}
      {selectedFeedbackForm && student && (
        <FeedbackSubmissionModal
          isOpen={showFeedbackModal}
          onClose={() => {
            setShowFeedbackModal(false)
            setSelectedFeedbackForm(null)
          }}
          onSuccess={() => {
            // Reload feedback forms to update submission status
            const loadFeedbackForms = async () => {
              const forms = await FeedbackService.getActiveFeedbackForms()
              setFeedbackForms(forms)
            }
            loadFeedbackForms()
          }}
          feedbackForm={selectedFeedbackForm}
          studentId={student.id}
        />
      )}
    </div>
  )
}