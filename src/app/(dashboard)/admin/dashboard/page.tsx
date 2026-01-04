'use client'

import { useState, useEffect } from 'react'
import AdminProtectedRoute from '@/components/auth/AdminProtectedRoute'
import Sidebar from '@/components/layout/Sidebar'
import CreateDepartmentModal from '@/components/forms/CreateDepartmentModal'
import { useAuth } from '@/lib/auth/AuthContext'
import { DepartmentService } from '@/lib/services/departmentService'
import { PeerTutorService } from '@/lib/services/peerTutorService'
import { StudentService } from '@/lib/services/studentService'
import { Department } from '@/lib/types'
import { Card, CardHeader, CardTitle, CardContent, StatCard, Button, LoadingOverlay, EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui'

export default function AdminDashboardPage() {
  return (
    <AdminProtectedRoute>
      <AdminDashboardContent />
    </AdminProtectedRoute>
  )
}

interface DepartmentWithCounts extends Department {
  peer_tutor_count: number
  peer_student_count: number
}

function AdminDashboardContent() {
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [departments, setDepartments] = useState<DepartmentWithCounts[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    loadDepartments()
  }, [])

  const loadDepartments = async () => {
    setIsLoading(true)
    try {
      console.log('Loading departments...')
      const depts = await DepartmentService.getDepartments()
      console.log('Departments loaded:', depts)
      
      // Load all peer tutors and students to get counts
      const allPeerTutors = await PeerTutorService.getAllPeerTutors()
      const allStudents = await StudentService.getAllStudents()
      
      // Enrich departments with counts
      const enrichedDepartments: DepartmentWithCounts[] = depts.map(dept => {
        // Count peer tutors for this department
        const peerTutorCount = allPeerTutors.filter(pt => pt.dept === dept.name).length
        
        // Count students for this department
        const peerStudentCount = allStudents.filter(s => s.dept === dept.name).length
        
        return {
          ...dept,
          peer_tutor_count: peerTutorCount,
          peer_student_count: peerStudentCount
        }
      })
      
      setDepartments(enrichedDepartments)
    } catch (error) {
      console.error('Error loading departments:', error)
      setDepartments([]) // Set empty array on error
    } finally {
      setIsLoading(false)
    }
  }

  const handleDepartmentCreated = () => {
    loadDepartments()
  }

  const handleDeleteDepartment = async (id: string) => {
    if (confirm('Are you sure you want to delete this department?')) {
      try {
        const success = await DepartmentService.deleteDepartment(id)
        if (success) {
          loadDepartments()
        }
      } catch (error) {
        console.error('Error deleting department:', error)
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 overflow-y-auto">
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
              <h1 className="text-2xl font-semibold text-gray-900 ml-2 lg:ml-0">Dashboard</h1>
            </div>
          </div>
        </header>

        {/* Main Dashboard Content */}
        <main className="py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Welcome Section */}
            <Card className="mb-6">
              <CardContent>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Hey {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Admin'}! 👋
                </h2>
                <p className="text-gray-600">
                  Welcome to your admin dashboard. Manage departments and monitor your organization.
                </p>
              </CardContent>
            </Card>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <StatCard
                title="Total Departments"
                value={departments.length}
                icon={
                  <svg className="w-8 h-8 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                  </svg>
                }
              />

              <StatCard
                title="Total Faculty"
                value={departments.length}
                icon={
                  <svg className="w-8 h-8 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                  </svg>
                }
              />
            </div>

            {/* Departments Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Current Departments</CardTitle>
                  <Button onClick={() => setIsModalOpen(true)}>
                    Create Department
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                {isLoading ? (
                  <LoadingOverlay className="py-8" />
                ) : departments.length === 0 ? (
                  <EmptyState
                    title="No departments"
                    description="Get started by creating your first department."
                    action={
                      <Button onClick={() => setIsModalOpen(true)}>
                        Create Department
                      </Button>
                    }
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Department Name</TableHead>
                        <TableHead>Faculty Member</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Peer Tutors</TableHead>
                        <TableHead>Peer Students</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {departments.map((department) => (
                        <TableRow key={department.id}>
                          <TableCell>
                            <div className="text-sm font-medium text-gray-900">{department.name}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-900">{department.faculty_name}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-500">{department.faculty_email}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium text-gray-900">{department.peer_tutor_count}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium text-gray-900">{department.peer_student_count}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-500">
                              {new Date(department.created_at).toLocaleDateString()}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            <button
                              onClick={() => handleDeleteDepartment(department.id)}
                              className="text-red-600 hover:text-red-900 transition-colors duration-200"
                            >
                              Delete
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Create Department Modal */}
      <CreateDepartmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleDepartmentCreated}
      />
    </div>
  )
}
