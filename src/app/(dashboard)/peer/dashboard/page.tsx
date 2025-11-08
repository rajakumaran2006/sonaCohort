'use client'

import { useState, useEffect } from 'react'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { AssignmentService } from '@/lib/services/assignmentService'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
import { RenumerationService, PeerTutorRenumeration } from '@/lib/services/renumerationService'
import { AttendanceService } from '@/lib/services/attendanceService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import PeerRenumerationModal from '@/components/forms/PeerRenumerationModal'
import { Card, CardHeader, CardTitle, CardContent, StatCard, Button, LoadingOverlay, LoadingSpinner, EmptyState, StatusBadge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui'
import { GraduationCap } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function PeerDashboardPage() {
  return (
    <PeerProtectedRoute>
      <PeerDashboardContent />
    </PeerProtectedRoute>
  )
}

interface StudentWithAttendance {
  id: string
  name: string
  email: string
  dept: string
  year: string
  section: string
  classesPresent: number
  classesAbsent: number
  attendancePercentage: number
}

function PeerDashboardContent() {
  const { user } = useAuth()
  const [peerTutorInfo, setPeerTutorInfo] = useState<any>(null)
  const [assignedStudents, setAssignedStudents] = useState<any[]>([])
  const [studentsWithAttendance, setStudentsWithAttendance] = useState<StudentWithAttendance[]>([])
  const [renumerations, setRenumerations] = useState<PeerTutorRenumeration[]>([])
  const [classesTaken, setClassesTaken] = useState<number>(0)
  const [totalClassesAllocated, setTotalClassesAllocated] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [loadingAttendance, setLoadingAttendance] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showRenumerationModal, setShowRenumerationModal] = useState(false)
  const [selectedRenumeration, setSelectedRenumeration] = useState<PeerTutorRenumeration | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Use custom hook for sidebar collapsed state
  const [isSidebarCollapsed] = useSidebarCollapsed()

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
        
        // Get class statistics
        const classStats = await ScheduledClassService.getPeerTutorClassStats(tutorInfo.id)
        setClassesTaken(classStats.completedClasses)
        setTotalClassesAllocated(classStats.totalClasses)
        
        // Load attendance statistics for each student
        await loadStudentAttendanceStats(students, tutorInfo.id)
      }
    } catch (error) {
      console.error('Error loading peer tutor data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStudentAttendanceStats = async (students: any[], peerTutorId: string) => {
    setLoadingAttendance(true)
    try {
      const studentsWithStats = await Promise.all(
        students.map(async (student) => {
          try {
            // Get attendance records for this student
            const attendanceRecords = await AttendanceService.getStudentAttendanceHistory(student.id, peerTutorId)
            
            // Calculate statistics
            const presentCount = attendanceRecords.filter(record => record.status === 'present').length
            const absentCount = attendanceRecords.filter(record => record.status === 'absent').length
            const totalClasses = presentCount + absentCount
            const attendancePercentage = totalClasses > 0 
              ? Math.round((presentCount / totalClasses) * 100) 
              : 0

            return {
              id: student.id,
              name: student.name,
              email: student.email,
              dept: student.dept,
              year: student.year,
              section: student.section,
              classesPresent: presentCount,
              classesAbsent: absentCount,
              attendancePercentage
            }
          } catch (error) {
            console.error(`Error loading attendance for student ${student.id}:`, error)
            return {
              id: student.id,
              name: student.name,
              email: student.email,
              dept: student.dept,
              year: student.year,
              section: student.section,
              classesPresent: 0,
              classesAbsent: 0,
              attendancePercentage: 0
            }
          }
        })
      )
      
      setStudentsWithAttendance(studentsWithStats)
    } catch (error) {
      console.error('Error loading student attendance stats:', error)
    } finally {
      setLoadingAttendance(false)
    }
  }

  const handleExportToExcel = () => {
    if (studentsWithAttendance.length === 0) {
      alert('No data to export')
      return
    }

    // Prepare data for export
    const exportData = studentsWithAttendance.map(student => ({
      'Student Name': student.name,
      'Email': student.email,
      'Department': student.dept,
      'Year': student.year,
      'Section': student.section,
      'Classes Present': student.classesPresent,
      'Classes Absent': student.classesAbsent,
      'Attendance Percentage': `${student.attendancePercentage}%`
    }))

    // Create workbook
    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Assigned Students')

    // Generate filename with current date
    const filename = `assigned-students-${new Date().toISOString().split('T')[0]}.xlsx`

    // Download file
    XLSX.writeFile(workbook, filename)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await loadPeerTutorData()
      setLastRefresh(new Date())
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="transition-all duration-300 lg:ml-64 min-h-screen flex flex-col overflow-hidden">
        {/* Top Header */}
        <PageHeader
          title="DASHBOARD"
          subtitle={peerTutorInfo?.name ? `Welcome back, ${peerTutorInfo.name}` : undefined}
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Dashboard Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
            {loading && (
              <div className="flex items-center justify-center py-4 mb-6">
                <LoadingSpinner size="sm" className="mr-2" />
                <span className="text-sm text-gray-600">Loading dashboard...</span>
              </div>
            )}
            {!loading && (
            <>
          {/* Assignment Info */}
          <Card className="mb-6">
            <CardContent>
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg leading-6 font-semibold text-gray-900">
                    ASSIGNMENT
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">
                    {peerTutorInfo ? `${peerTutorInfo.dept} - Year ${peerTutorInfo.year} - Section ${peerTutorInfo.section}` : 'No assignment'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 mb-8">
            <StatCard
              title="Assigned Students"
              value={assignedStudents.length}
              description="Students you are currently tutoring"
              icon={
                <GraduationCap className="h-7 w-7 text-blue-600" />
              }
            />

            <StatCard
              title="Total Classes Allocated"
              value={`${classesTaken}/${totalClassesAllocated}`}
              description="Classes taken vs total allocated"
              icon={
                <svg className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              }
            />
          </div>

          {/* Assigned Students Section */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Your Assigned Students</CardTitle>
                  <p className="text-sm text-gray-500">Students you are currently tutoring with attendance statistics</p>
                </div>
                {studentsWithAttendance.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleExportToExcel}
                      disabled={loadingAttendance}
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export Excel
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            
            <CardContent>
              {loadingAttendance ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingOverlay size="md">
                    Loading attendance statistics...
                  </LoadingOverlay>
                </div>
              ) : studentsWithAttendance.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Classes Present</TableHead>
                        <TableHead>Classes Absent</TableHead>
                        <TableHead>Attendance Percentage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentsWithAttendance.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium text-gray-900">{student.name}</div>
                              <div className="text-sm text-gray-500">{student.email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-gray-900 font-semibold">{student.classesPresent}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-gray-900 font-semibold">{student.classesAbsent}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <span className="font-semibold text-gray-900">
                                {student.attendancePercentage}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : assignedStudents.length > 0 ? (
                <div className="flex items-center justify-center py-8">
                  <EmptyState
                    title="No attendance data available"
                    description="Attendance statistics will appear here once students have attendance records."
                  />
                </div>
              ) : (
                <EmptyState
                  title="No students assigned"
                  description="You don't have any students assigned to you yet. Contact your faculty member for assignments."
                />
              )}
            </CardContent>
          </Card>

          {/* Renumeration Section */}
          <Card>
            <CardHeader>
              <CardTitle>Renumeration Forms</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Submit and manage your renumeration details
              </p>
            </CardHeader>
            
            <CardContent>
              {renumerations.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Form Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {renumerations.map((renumeration) => (
                        <TableRow key={renumeration.id}>
                          <TableCell className="font-medium text-gray-900">
                            {renumeration.template?.name || 'Renumeration Form'}
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {renumeration.template?.description || 'No description available'}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={(renumeration.status || 'pending') as any}>
                              {renumeration.status === 'submitted' 
                                ? 'Completed'
                                : renumeration.status 
                                  ? renumeration.status.charAt(0).toUpperCase() + renumeration.status.slice(1)
                                  : 'Pending'}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {new Date(renumeration.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {renumeration.submitted_at 
                              ? new Date(renumeration.submitted_at).toLocaleDateString()
                              : '-'
                            }
                          </TableCell>
                          <TableCell>
                            {!renumeration.template?.is_active ? (
                              <span className="text-sm text-gray-500 font-medium italic">Form is closed</span>
                            ) : renumeration.status === 'pending' ? (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedRenumeration(renumeration)
                                  setShowRenumerationModal(true)
                                }}
                              >
                                Fill Form
                              </Button>
                            ) : renumeration.status === 'submitted' ? (
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
                            ) : renumeration.status === 'approved' ? (
                              <span className="text-sm text-gray-900 font-medium">Approved</span>
                            ) : renumeration.status === 'rejected' ? (
                              <span className="text-sm text-red-600 font-medium">Rejected</span>
                            ) : (
                              <span className="text-sm text-gray-500 font-medium">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  title="No renumeration forms"
                  description="You don't have any renumeration forms assigned yet. Check back later or contact your faculty member."
                />
              )}
            </CardContent>
          </Card>
            </>
            )}
          </div>
        </main>
      </div>

      {/* Renumeration Form Modal */}
      {showRenumerationModal && selectedRenumeration && (
        <PeerRenumerationModal
          renumeration={selectedRenumeration!}
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
