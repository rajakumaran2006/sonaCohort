'use client'

import { useState, useEffect } from 'react'
import AdminProtectedRoute from '@/components/auth/AdminProtectedRoute'
import Sidebar from '@/components/layout/Sidebar'
import CreateDepartmentModal from '@/components/forms/CreateDepartmentModal'
import DeleteConfirmationModal from '@/components/forms/DeleteConfirmationModal'
import { useAuth } from '@/lib/auth/AuthContext'
import { DepartmentService } from '@/lib/services/departmentService'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { StudentService } from '@/lib/services/studentService'
import { Department } from '@/lib/types'
import { Card, Button, EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui'
import { AdminDashboardSkeleton } from '@/components/skeletons/AdminDashboardSkeleton'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Users, Building2, Plus, Trash2 } from 'lucide-react'

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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [departmentToDelete, setDepartmentToDelete] = useState<DepartmentWithCounts | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isCollapsed, setIsCollapsed] = useSidebarCollapsed()

  // Listen for sidebar toggle events (from sidebar button)
  useEffect(() => {
    const handleSidebarToggle = (e: CustomEvent<{ isCollapsed: boolean }>) => {
       setIsCollapsed(e.detail.isCollapsed)
    }
    window.addEventListener('sidebar-toggle', handleSidebarToggle as EventListener)
    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle as EventListener)
    }
  }, [setIsCollapsed])

  useEffect(() => {
    loadDepartments()
  }, [])

  const loadDepartments = async () => {
    setIsLoading(true)
    try {
      // Simulate at least some loading time to show off the skeleton if data is too fast
      // (Optional, but good for UX transitions)
      const depts = await DepartmentService.getDepartments()
      
      // Load all peer tutors and students to get counts
      const allpeerTutor = await peertutorservice.getAllpeerTutor()
      const allStudents = await StudentService.getAllStudents()
      
      // Enrich departments with counts
      const enrichedDepartments: DepartmentWithCounts[] = depts.map(dept => {
        const peertutorsCount = allpeerTutor.filter(pt => pt.dept === dept.name).length
        const peerStudentCount = allStudents.filter(s => s.dept === dept.name).length
        
        return {
          ...dept,
          peer_tutor_count: peertutorsCount,
          peer_student_count: peerStudentCount
        }
      })
      
      setDepartments(enrichedDepartments)
    } catch (error) {
      console.error('Error loading departments:', error)
      setDepartments([]) 
    } finally {
      setIsLoading(false)
    }
  }

  const handleDepartmentCreated = () => {
    loadDepartments()
  }

  const handleDeleteClick = (department: DepartmentWithCounts) => {
    setDepartmentToDelete(department)
    setDeleteModalOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!departmentToDelete) return

    setIsDeleting(true)
    try {
      const success = await DepartmentService.deleteDepartment(departmentToDelete.id)
      if (success) {
        setDeleteModalOpen(false)
        setDepartmentToDelete(null)
        loadDepartments()
      }
    } catch (error) {
      console.error('Error deleting department:', error)
    } finally {
      setIsDeleting(false)
    }
  }
  
  // Calculate totals
  const totalDepartments = departments.length
  const totalFaculty = departments.length // Assuming 1 faculty per department based on previous code logic

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Sidebar */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
        onToggleCollapse={() => {}} // State handled via event listener in this component or usage of hook
      />
  
      {/* Main Content */}
      <div 
        suppressHydrationWarning
        className={`transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col`}
      >
        {/* Top Header */}
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-gray-200/50">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
                <p className="text-sm text-gray-500 font-medium hidden sm:block">Manage your departments and faculty members</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
               <button 
                  onClick={() => setIsModalOpen(true)}
                  className="hidden sm:flex items-center gap-2 bg-[#0f291e] hover:bg-[#1a4432] text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm hover:shadow"
               >
                  <Plus className="w-4 h-4" />
                  <span>New Department</span>
               </button>
            </div>
          </div>
        </header>

        {/* Main Dashboard Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          {isLoading ? (
             <AdminDashboardSkeleton />
          ) : (
            <div className="max-w-7xl mx-auto space-y-6">
              
              {/* Welcome Banner */}
              <div className="bg-gradient-to-br from-[#0f291e] to-[#1a4432] rounded p-8 text-white relative overflow-hidden shadow-lg">
                <div className="relative z-10 max-w-2xl">
                  <h2 className="text-3xl font-bold mb-2">
                    Hey {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Admin'}!
                  </h2>
                  <p className="text-green-100/90 text-lg leading-relaxed">
                    Welcome to your command center. You have full control over departmental structures and faculty assignments here.
                  </p>
                </div>
                {/* Decorative circles */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full blur-2xl -ml-12 -mb-12 pointer-events-none"></div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded p-7 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 group">
                   <div className="flex justify-between items-start mb-4">
                      <div>
                         <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Total Departments</p>
                         <h3 className="text-4xl font-black text-gray-900 mt-2">{totalDepartments}</h3>
                      </div>
                   </div>
                   <div className="flex items-center uppercase gap-2 text-sm font-medium text-gray-500 bg-gray-50 w-fit px-3 py-1 rounded-lg">
                      <span>Active Departments</span>
                   </div>
                </div>

                <div className="bg-white rounded p-7 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 group">
                   <div className="flex justify-between items-start mb-4">
                      <div>
                         <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Total Faculty</p>
                         <h3 className="text-4xl font-black text-gray-900 mt-2">{totalFaculty}</h3>
                      </div>
                   </div>
                   <div className="flex items-center uppercase gap-2 text-sm font-medium text-gray-500 bg-gray-50 w-fit px-3 py-1 rounded-lg">
                      <span>Allocated Faculty Members</span>
                   </div>
                </div>
              </div>

              {/* Departments Table Section */}
              <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                   <h3 className="text-lg font-bold uppercase text-gray-900">Current Departments</h3>
                   <Button 
                      onClick={() => setIsModalOpen(true)}
                      className="sm:hidden"
                      size="sm"
                   >
                     <Plus className="w-4 h-4" />
                   </Button>
                </div>
                
                <div className="p-0">
                  {departments.length === 0 ? (
                    <div className="p-8 align-center">
                      <EmptyState
                        title="No departments"
                        description="Get started by creating your first department."
                        action={
                          <Button onClick={() => setIsModalOpen(true)}>
                            Create Department
                          </Button>
                        }
                      />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-gray-50/50">
                          <TableRow className="border-gray-100 hover:bg-transparent">
                            <TableHead className="text-xs font-bold text-gray-400 uppercase tracking-wider py-4 pl-6">Department Name</TableHead>
                            <TableHead className="text-xs font-bold text-gray-400 uppercase tracking-wider py-4">Faculty Member</TableHead>
                            <TableHead className="text-xs font-bold text-gray-400 uppercase tracking-wider py-4">Email</TableHead>
                            <TableHead className="text-xs font-bold text-gray-400 uppercase tracking-wider py-4 text-center">Tutors</TableHead>
                            <TableHead className="text-xs font-bold text-gray-400 uppercase tracking-wider py-4 text-center">Students</TableHead>
                            <TableHead className="text-xs font-bold text-gray-400 uppercase tracking-wider py-4">Created</TableHead>
                            <TableHead className="text-right text-xs font-bold text-gray-400 uppercase tracking-wider py-4 pr-6">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {departments.map((department) => (
                            <TableRow key={department.id} className="border-gray-50 hover:bg-gray-50/50 transition-colors">
                              <TableCell className="pl-6 py-4">
                                <div className="text-sm font-bold text-gray-900">{department.name}</div>
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="text-sm font-medium text-gray-900">{department.faculty_name}</div>
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="text-sm text-gray-500">{department.faculty_email}</div>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-black">
                                  {department.peer_tutor_count}
                                </span>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-black">
                                  {department.peer_student_count}
                                </span>
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="text-sm text-gray-500 font-medium">
                                  {new Date(department.created_at).toLocaleDateString()}
                                </div>
                              </TableCell>
                              <TableCell className="text-right py-4 pr-6">
                                <button
                                  onClick={() => handleDeleteClick(department)}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                                  title="Delete Department"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create Department Modal */}
      <CreateDepartmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleDepartmentCreated}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false)
          setDepartmentToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Department"
        type="item"
        itemsToDelete={departmentToDelete ? [{
          name: departmentToDelete.name,
          additionalInfo: `Faculty: ${departmentToDelete.faculty_name} • ${departmentToDelete.peer_tutor_count} tutors • ${departmentToDelete.peer_student_count} students`
        }] : []}
        isLoading={isDeleting}
      />
    </div>
  )
}
