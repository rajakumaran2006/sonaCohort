'use client'

import React, { useState, useEffect } from 'react'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { FacultyService } from '@/lib/services/facultyService'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Search, Plus, User, Mail, School, BookOpen, Loader2, Trash } from 'lucide-react'
import Image from 'next/image'
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
  const router = useRouter()
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed] = useSidebarCollapsed()
  
  // Data State
  const [faculty, setFaculty] = useState<any[]>([])
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
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedFaculty(filteredFaculty.map(f => f.email))
    } else {
      setSelectedFaculty([])
    }
  }

  const handleSelectOne = (email: string) => {
    if (selectedFaculty.includes(email)) {
      setSelectedFaculty(selectedFaculty.filter(e => e !== email))
    } else {
      setSelectedFaculty([...selectedFaculty, email])
    }
  }

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
            
            {/* Top actions removed as requested to be in table */}
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-8">
          
          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
             
             {/* Table Header & Controls */}
             <div className="p-6 border-b border-gray-50 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                   <h3 className="text-lg font-bold text-gray-900 uppercase tracking-widest">
                      Faculty List
                   </h3>
                   
                   <div className="flex items-center gap-3">
                      {selectedFaculty.length > 0 && (
                        <button
                          onClick={() => setShowDeleteModal(true)}
                          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-xl transition-all border border-red-200"
                        >
                          <Trash className="w-4 h-4" />
                          DELETE ({selectedFaculty.length})
                        </button>
                      )}
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-gray-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                      >
                        <Plus className="w-4 h-4" />
                        ADD FACULTY
                      </button>
                   </div>
                </div>

                {/* Search Bar */}
                <div className="max-w-md">
                   <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                      </div>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search faculty..."
                        className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                      />
                   </div>
                </div>
             </div>

             {/* Table Content */}
          {loading ? (
             <div className="flex justify-center items-center h-64">
               <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
             </div>
          ) : filteredFaculty.length > 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-6 py-4 w-12">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                            checked={filteredFaculty.length > 0 && selectedFaculty.length === filteredFaculty.length}
                            onChange={handleSelectAll}
                          />
                        </th>
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
                            <input 
                              type="checkbox" 
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                              checked={selectedFaculty.includes(f.email)}
                              onChange={() => handleSelectOne(f.email)}
                            />
                          </td>
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-3">
                               <div className="w-10 h-10 rounded-full bg-gray-500 text-white flex items-center justify-center font-bold">
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
                                 <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-500 text-white text-xs font-medium border border-gray-500">
                                   {s}
                                 </span>
                               ))}
                               {(!f.subjects || f.subjects.length === 0) && (
                                 <span className="text-gray-400 text-sm italic">No subjects</span>
                               )}
                             </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button className="px-6 py-2 bg-white hover:bg-gray-50 text-gray-600 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm border border-gray-200 hover:shadow-md">
                              EDIT
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
