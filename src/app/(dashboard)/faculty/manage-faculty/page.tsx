'use client'

import React, { useState, useEffect } from 'react'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'

import { useAuth } from '@/lib/auth/AuthContext'
import { FacultyService, FacultySummary } from '@/lib/services/facultyService'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Search, Plus, User, Mail, School } from 'lucide-react'
import Image from 'next/image'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import AddFacultyModal from '@/components/forms/modals/AddFacultyModal'
import DeleteConfirmationModal from '@/components/forms/modals/DeleteConfirmationModal'
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
  const [departmentName, setDepartmentName] = useState('')
  
  // Selection State
  const [selectedFaculty, setSelectedFaculty] = useState<string[]>([])

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


  const handleDelete = async () => {
    setLoading(true)
    try {
      const success = await FacultyService.deleteFaculty(selectedFaculty)
      if (success) {
        // Remove deleted faculty from local state
        setFaculty(prev => prev.filter(f => !selectedFaculty.includes(f.email)))
        setSelectedFaculty([])
        setShowDeleteModal(false)
      }
    } catch (error) {
      logger.error('Error deleting faculty', error)
    } finally {
      setLoading(false)
    }
  }

  const getItemsToDelete = () => {
    return selectedFaculty.map(email => {
      const f = faculty.find(item => item.email === email)
      return {
        name: f?.name || 'Unknown Faculty',
        email: email
      }
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out",
          isSidebarCollapsed ? "lg:ml-20" : "lg:ml-64"
        )}
      >
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Faculty Management</h1>
              <p className="text-sm text-gray-500 mt-1">Manage faculty members and their class assignments</p>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-gray-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
            >
              <Plus className="w-5 h-5" />
              ADD FACULTY
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-8">

          {/* Search Bar */}
          <div className="mb-8 max-w-2xl">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search faculty by name, email..."
                className="block w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
              />
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
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Faculty Details</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Assigned Classes</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Subjects</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredFaculty.map((f, i) => (
                      <tr key={i} className="group hover:bg-gray-50 transition-colors">
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
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <School className="w-4 h-4 text-gray-400" />
                            {/* Mock data display - replace with actual counts */}
                            <span>{f.totalClasses || 0} Classes Assigned</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            {/* Mock subjects */}
                            {(f.subjects || []).map((s: string, idx: number) => (
                              <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs font-bold shadow-sm">
                                {s}
                              </span>
                            ))}
                            {(!f.subjects || f.subjects.length === 0) && (
                              <span className="text-gray-400 text-sm italic">No subjects</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline">
                            Edit Assignments
                          </button>
                        </td>
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
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Faculty"
        itemsToDelete={getItemsToDelete()}
        type="faculty"
        isLoading={loading}
      />
    </div>
  )
}
