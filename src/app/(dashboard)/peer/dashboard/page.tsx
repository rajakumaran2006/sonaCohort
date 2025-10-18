'use client'

import { useState, useEffect } from 'react'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { AssignmentService } from '@/lib/services/assignmentService'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
import { RenumerationService, PeerTutorRenumeration } from '@/lib/services/renumerationService'
import PeerRenumerationModal from '@/components/forms/PeerRenumerationModal'
import { Card, CardHeader, CardTitle, CardContent, StatCard, Button, LoadingOverlay, EmptyState, StatusBadge } from '@/components/ui'

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

export default function PeerDashboardPage() {
  return (
    <PeerProtectedRoute>
      <PeerDashboardContent />
    </PeerProtectedRoute>
  )
}

function PeerDashboardContent() {
  const { user } = useAuth()
  const [peerTutorInfo, setPeerTutorInfo] = useState<any>(null)
  const [assignedStudents, setAssignedStudents] = useState<any[]>([])
  const [renumerations, setRenumerations] = useState<PeerTutorRenumeration[]>([])
  const [loading, setLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showRenumerationModal, setShowRenumerationModal] = useState(false)
  const [selectedRenumeration, setSelectedRenumeration] = useState<PeerTutorRenumeration | null>(null)

  useEffect(() => {
    loadPeerTutorData()
  }, [])

  const loadPeerTutorData = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // Get peer tutor information
      const tutorInfo = await PeerTutorAuthService.getPeerTutorByEmail(user.email)
      if (tutorInfo) {
        setPeerTutorInfo(tutorInfo)
        
        // Get assigned students
        const students = await AssignmentService.getStudentsByPeerTutor(tutorInfo.id)
        setAssignedStudents(students)
        
        // Get renumeration data
        const renumerationData = await RenumerationService.getPeerTutorRenumeration(tutorInfo.id)
        setRenumerations(renumerationData)
      }
    } catch (error) {
      console.error('Error loading peer tutor data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingOverlay size="lg">
          Loading your dashboard...
        </LoadingOverlay>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64 overflow-y-auto">
        {/* Header */}
        <header className="bg-white shadow flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="py-6">
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
                  <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                  <p className="text-sm text-gray-600 mt-1">
                    Welcome back, {peerTutorInfo?.name}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Dashboard Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          {/* Welcome Section */}
          <Card className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-100 border-blue-200">
            <CardContent>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Hey {peerTutorInfo?.name}! 
              </h2>
              <p className="text-gray-600">
                You are assigned to <span className="font-semibold text-blue-600">{peerTutorInfo?.dept}</span> - 
                <span className="font-semibold text-blue-600"> Year {peerTutorInfo?.year} </span> - 
                <span className="font-semibold text-blue-600"> Section {peerTutorInfo?.section}</span>
              </p>
            </CardContent>
          </Card>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <StatCard
              title="Assigned Students"
              value={assignedStudents.length}
              icon={
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              }
            />

            <StatCard
              title="Active Classes"
              value="0"
              icon={
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              }
            />

            <StatCard
              title="Upcoming Exams"
              value="0"
              icon={
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            />
          </div>

          {/* Renumeration Section */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Renumeration Forms</CardTitle>
                  <p className="text-sm text-gray-500">Submit and manage your renumeration details</p>
                </div>
                <div className="flex items-center space-x-2">
                  <StatusBadge status="pending">
                    {renumerations.filter(r => r.status === 'pending').length} Pending
                  </StatusBadge>
                  <StatusBadge status="submitted">
                    {renumerations.filter(r => r.status === 'submitted').length} Submitted
                  </StatusBadge>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              {renumerations.length > 0 ? (
                <div className="space-y-4">
                  {renumerations.map((renumeration) => (
                    <div key={renumeration.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">
                            {renumeration.template?.name || 'Renumeration Form'}
                          </h4>
                          <p className="text-sm text-gray-500 mt-1">
                            {renumeration.template?.description || 'No description available'}
                          </p>
                          <div className="flex items-center mt-2 space-x-4">
                            <StatusBadge status={renumeration.status as any}>
                              {renumeration.status.charAt(0).toUpperCase() + renumeration.status.slice(1)}
                            </StatusBadge>
                            <span className="text-xs text-gray-500">
                              Created: {new Date(renumeration.created_at).toLocaleDateString()}
                            </span>
                            {renumeration.submitted_at && (
                              <span className="text-xs text-gray-500">
                                Submitted: {new Date(renumeration.submitted_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {renumeration.status === 'pending' && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedRenumeration(renumeration)
                                setShowRenumerationModal(true)
                              }}
                            >
                              Fill Form
                            </Button>
                          )}
                          {renumeration.status === 'submitted' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setSelectedRenumeration(renumeration)
                                setShowRenumerationModal(true)
                              }}
                            >
                              View/Edit
                            </Button>
                          )}
                          {renumeration.status === 'approved' && (
                            <span className="text-sm text-green-600 font-medium">✓ Approved</span>
                          )}
                          {renumeration.status === 'rejected' && (
                            <span className="text-sm text-red-600 font-medium">✗ Rejected</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No renumeration forms"
                  description="You don't have any renumeration forms assigned yet. Check back later or contact your faculty member."
                />
              )}
            </CardContent>
          </Card>

          {/* Assigned Students Section */}
          <Card>
            <CardHeader>
              <CardTitle>Your Assigned Students</CardTitle>
              <p className="text-sm text-gray-500">Students you are currently tutoring</p>
            </CardHeader>
            
            <CardContent>
              {assignedStudents.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {assignedStudents.map((student) => (
                    <div key={student.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-blue-300 transition-colors duration-200">
                      <div className="flex items-center">
                        <div className={`w-10 h-10 ${getAvatarColor(student.name)} rounded-full flex items-center justify-center text-white font-medium text-sm mr-3`}>
                          {getInitials(student.name)}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{student.name}</p>
                          <p className="text-sm text-gray-500">{student.email}</p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{student.dept}</span>
                          <span>{student.year} - {student.section}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No students assigned"
                  description="You don't have any students assigned to you yet. Contact your faculty member for assignments."
                />
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Renumeration Form Modal */}
      {showRenumerationModal && selectedRenumeration && (
        <PeerRenumerationModal
          renumeration={selectedRenumeration}
          isOpen={showRenumerationModal}
          onClose={() => {
            setShowRenumerationModal(false)
            setSelectedRenumeration(null)
          }}
          onSuccess={() => {
            loadPeerTutorData() // Reload data after successful submission
          }}
        />
      )}
    </div>
  )
}
