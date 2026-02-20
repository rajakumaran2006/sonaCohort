'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'

import { useAuth } from '@/lib/auth/AuthContext'
import { FacultyService, FacultySummary } from '@/lib/services/facultyService'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Plus, User, Mail, Eye, Pencil, Trash2 } from 'lucide-react'
import { SearchIcon } from '@/components/icons/SearchIcon'
import Image from 'next/image'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import PageHeader from '@/components/layout/PageHeader'
import AddFacultyModal from '@/components/forms/modals/AddFacultyModal'
import DeleteConfirmationModal from '@/components/forms/modals/DeleteConfirmationModal'

import EditFacultyAssignmentsModal from '@/components/forms/modals/EditFacultyAssignmentsModal'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'

export default function FacultyManagePage() {
  return (
    <FacultyProtectedRoute>
      <FacultyManageContent />
    </FacultyProtectedRoute>
  )
}

function FacultyManageContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed] = useSidebarCollapsed()

  // Data State
  const [faculty, setFaculty] = useState<FacultySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

  const [facultyToEdit, setFacultyToEdit] = useState<FacultySummary | null>(null)

  const [departmentName, setDepartmentName] = useState('')

  // Delete Mode State
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedFacultyEmails, setSelectedFacultyEmails] = useState<Set<string>>(new Set())

  // Refresh State
  const [, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Load Data
  useEffect(() => {
    const loadData = async () => {
      if (!user?.email) return

      try {
        setLoading(true)
        const dept = await FacultyService.verifyFacultyAccess(user.email)
        if (dept) {
          setDepartmentName(dept.name)
          const data = await FacultyService.getAllFaculty(dept.name)
          setFaculty(data)
        }
      } catch (e) {
        logger.error('Error loading faculty page data', e)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [user])

  // Filtered Data
  const filteredFaculty = faculty.filter(f => {
    const q = searchQuery.toLowerCase()
    return (
      f.name?.toLowerCase().includes(q) ||
      f.email?.toLowerCase().includes(q)
    )
  })

  // Selection Handlers

  // Delete Mode Handlers
  const handleDeleteModeToggle = () => {
    setIsDeleteMode(!isDeleteMode)
    setSelectedFacultyEmails(new Set())
  }

  const handleSelectFaculty = (email: string) => {
    const newSelected = new Set(selectedFacultyEmails)
    if (newSelected.has(email)) {
      newSelected.delete(email)
    } else {
      newSelected.add(email)
    }
    setSelectedFacultyEmails(newSelected)
  }

  const handleSelectAllFaculty = () => {
    if (selectedFacultyEmails.size === filteredFaculty.length && filteredFaculty.length > 0) {
      setSelectedFacultyEmails(new Set())
    } else {
      setSelectedFacultyEmails(new Set(filteredFaculty.map(f => f.email)))
    }
  }

  const handleBulkDelete = () => {
    if (selectedFacultyEmails.size === 0) return
    setShowDeleteModal(true)
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      const emailsToDelete = Array.from(selectedFacultyEmails)
      const success = await FacultyService.deleteFaculty(emailsToDelete)

      if (success) {
        setFaculty(prev => prev.filter(f => !emailsToDelete.includes(f.email)))
        setSelectedFacultyEmails(new Set())
        setIsDeleteMode(false)
        setShowDeleteModal(false)
      }
    } catch (error) {
      logger.error('Error deleting faculty', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEditClick = (f: FacultySummary) => {
    setFacultyToEdit(f)
    setShowEditModal(true)
  }

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    try {
      setLastRefresh(new Date())
      // Small delay for animation
      await new Promise(resolve => setTimeout(resolve, 800))
    } finally {
      setIsRefreshing(false)
    }
  }



  const getItemsToDelete = () => {
    return Array.from(selectedFacultyEmails).map(email => {
      const f = faculty.find(item => item.email === email)
      return {
        name: f?.name || 'Unknown Faculty',
        email: email
      }
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <div
        className={cn(
          "transition-all duration-300 min-h-screen flex flex-col overflow-hidden w-full lg:w-auto",
          isSidebarCollapsed ? "lg:ml-20" : "lg:ml-64"
        )}
      >
        <PageHeader
          title="FACULTY MANAGEMENT"
          tagline="MANAGE FACULTY MEMBERS AND THEIR CLASS ASSIGNMENTS"
          onRefresh={handleManualRefresh}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto">
          <div className={cn("max-w-full mx-auto py-8", isSidebarCollapsed ? "px-4 sm:px-6 lg:pr-8 lg:pl-6" : "px-4 sm:px-6 lg:px-8")}>
            {/* Search and Actions Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
              <div className="relative group flex-1 max-w-2xl">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <SearchIcon className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search faculty by name, email..."
                  className="block w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                />
              </div>

              <div className="flex items-center gap-3 self-end lg:self-auto">
                {!isDeleteMode ? (
                  <>
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-gray-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 uppercase tracking-widest"
                    >
                      <Plus className="w-5 h-5" />
                      ADD FACULTY
                    </button>
                    {faculty.length > 0 && (
                      <button
                        onClick={handleDeleteModeToggle}
                        className="p-3 rounded-xl bg-white border border-gray-200 text-red-600 hover:bg-red-50 transition-all shadow-sm hover:shadow-md active:scale-95"
                        title="Delete Mode"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleBulkDelete}
                      disabled={selectedFacultyEmails.size === 0}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-lg shadow-red-100 uppercase tracking-widest"
                    >
                      <Trash2 className="w-4 h-4" />
                      DELETE SELECTED ({selectedFacultyEmails.size})
                    </button>
                    <button
                      onClick={handleDeleteModeToggle}
                      className="px-6 py-3 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold transition-all shadow-sm uppercase tracking-widest"
                    >
                      CANCEL
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Table Content */}
            {loading ? (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <TableSkeleton />
              </div>
            ) : filteredFaculty.length > 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        {isDeleteMode && (
                          <th className="w-[50px] pl-6 py-4">
                            <input
                              type="checkbox"
                              checked={filteredFaculty.length > 0 && selectedFacultyEmails.size === filteredFaculty.length}
                              onChange={handleSelectAllFaculty}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                            />
                          </th>
                        )}
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Faculty Details</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Assigned Classes</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Additional Classes</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Subjects</th>
                        {!isDeleteMode && (
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredFaculty.map((f, i) => (
                        <tr key={i} className="group hover:bg-gray-50 transition-colors">
                          {isDeleteMode && (
                            <td className="pl-6 py-4">
                              <input
                                type="checkbox"
                                checked={selectedFacultyEmails.has(f.email)}
                                onChange={() => handleSelectFaculty(f.email)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                                {f.name?.[0] || <User className="w-5 h-5" />}
                              </div>
                              <div>
                                <div className="font-semibold text-gray-900">{f.name || 'Unknown User'}</div>
                                <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                                  <Mail className="w-3 h-3" />
                                  {f.email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              {(() => {
                                const uniqueClasses = new Map<string, string>()
                                f.assignments.forEach(a => {
                                  const key = `${a.year}-${a.section}`
                                  if (!uniqueClasses.has(key)) {
                                    uniqueClasses.set(key, `Year ${a.year} - ${a.section}`)
                                  }
                                })
                                return Array.from(uniqueClasses.values()).map((label, idx) => (
                                  <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-lg bg-gray-900 text-white text-[10px] font-bold uppercase tracking-wider shadow-sm">
                                    {label}
                                  </span>
                                ))
                              })()}
                              {(!f.assignments || f.assignments.length === 0) && (
                                <span className="text-gray-400 text-sm italic">No classes</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              {(() => {
                                const classDetails = f.assignments.map(a => ({
                                  year: a.year,
                                  section: a.section,
                                  subject: a.subject_name
                                }))
                                return classDetails.map((c, idx) => (
                                  <span key={idx} className="text-xs text-gray-600">
                                    Year {c.year} - {c.section}: <span className="font-semibold text-gray-900">{c.subject}</span>
                                  </span>
                                ))
                              })()}
                              {(!f.assignments || f.assignments.length === 0) && (
                                <span className="text-gray-400 text-sm italic">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-2">
                              {(f.subjects || []).map((s: string, idx: number) => (
                                <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-sm">
                                  {s}
                                </span>
                              ))}
                              {(!f.subjects || f.subjects.length === 0) && (
                                <span className="text-gray-400 text-sm italic">No subjects</span>
                              )}
                            </div>
                          </td>
                          {!isDeleteMode && (
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <button
                                  onClick={() => router.push(`/faculty/manage-faculty/${encodeURIComponent(f.email)}`)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                  onClick={() => handleEditClick(f)}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Edit Assignments"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 p-16 flex flex-col items-center justify-center text-center">
                <Image src="/icons/student.png" alt="No faculty" width={80} height={80} className="mb-6 opacity-50 grayscale" />
                <h3 className="text-lg font-bold uppercase text-gray-900">No Faculty Found</h3>
                <p className="text-gray-500 mt-2 max-w-sm mx-auto">
                  {searchQuery ? 'No results matched your search.' : 'Get started by adding faculty members'}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="mt-6 px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-all"
                  >
                    ADD FACULTY
                  </button>
                )}
              </div>
            )}

          </div>
        </main>
      </div>

      {/* Add Faculty Modal */}
      <AddFacultyModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          // Trigger reload
          window.location.reload() // Simple reload for now
        }}
        dept={departmentName}
      />

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setSelectedFacultyEmails(new Set())
        }}
        onConfirm={handleDelete}
        title="Delete Faculty"
        itemsToDelete={getItemsToDelete()}
        type="faculty"
        isLoading={loading}
      />



      {/* Edit Assignments Modal */}
      {facultyToEdit && (
        <EditFacultyAssignmentsModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false)
            setFacultyToEdit(null)
          }}
          onSuccess={() => {
            // Reload data to reflect changes
            window.location.reload()
          }}
          facultyEmail={facultyToEdit.email}
          facultyName={facultyToEdit.name}
          facultyId={facultyToEdit.assignments[0]?.faculty_id || ''} // Fallback if needed, though usually present
          dept={departmentName}
        />
      )}
    </div>
  )
}
