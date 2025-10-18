
'use client'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { PeerTutorService, PeerTutor } from '@/lib/services/peerTutorService'
import { StudentService, Student } from '@/lib/services/studentService'
import { AssignmentService, Assignment, AssignmentStats } from '@/lib/services/assignmentService'
import AssignPeerTutorModal from '@/components/forms/AssignPeerTutorModal'
import AddStudentModal from '@/components/forms/AddStudentModal'
import BulkImportExport from '@/components/forms/BulkImportExport'
import PeerTutorMappingExport from '@/components/forms/PeerTutorMappingExport'
import DateAssignmentModal from '@/components/forms/DateAssignmentModal'
import { ClassService, Class } from '@/lib/services/classService'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { ExamMarksService } from '@/lib/services/examMarksService'
import { AttendanceService, AttendanceRecord } from '@/lib/services/attendanceService'
import { FacultyService } from '@/lib/services/facultyService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import { createClient } from '@/utils/supabase/client'
import DeleteConfirmationModal from '@/components/forms/DeleteConfirmationModal'

interface PeerTutorWithStats extends PeerTutor 
{
  classStats: {
    totalClasses: number
    completedClasses: number
    pendingClasses: number
  }
  additionalClassesCount: number
}

interface PeerTutorsTabProps {
  peerTutors: PeerTutor[]
  students: Student[]
  setIsModalOpen: (isOpen: boolean) => void
  handleRemovePeerTutor: (tutorId: string) => void
  onPeerTutorClick: (tutorId: string) => void
}

function PeerTutorsTab({ peerTutors, students, setIsModalOpen, handleRemovePeerTutor, onPeerTutorClick }: PeerTutorsTabProps) {
  const [peerTutorsWithStats, setPeerTutorsWithStats] = useState<PeerTutorWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [peerTutorStudentCounts, setPeerTutorStudentCounts] = useState<{[key: string]: number}>({})
  const [sortBy, setSortBy] = useState<'name' | 'completed' | 'additional' | 'students'>('name')
  const [showSortPopup, setShowSortPopup] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  const [selectedPeerTutors, setSelectedPeerTutors] = useState<Set<string>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<'selected' | 'single'>('selected')
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [itemsToDelete, setItemsToDelete] = useState<Array<{name: string, email: string, additionalInfo: string}>>([])


  useEffect(() => {
    const loadPeerTutorStats = async () => {
      setLoading(true)
      try {
        const tutorsWithStats = await Promise.all(
          peerTutors.map(async (tutor) => {
            const classStats = await ScheduledClassService.getPeerTutorClassStats(tutor.id)
            const additionalClasses = await AdditionalClassService.getAdditionalClassesByPeerTutor(tutor.id)
            return {
              ...tutor,
              classStats,
              additionalClassesCount: additionalClasses.length
            }
          })
        )
        setPeerTutorsWithStats(tutorsWithStats)

        // Calculate student counts for each peer tutor
        const studentCounts: {[key: string]: number} = {}
        peerTutors.forEach(tutor => {
          const count = students.filter(student => student.assigned_peer_tutor_id === tutor.id).length
          studentCounts[tutor.id] = count
        })
        setPeerTutorStudentCounts(studentCounts)
      } catch (error) {
        console.error('Error loading peer tutor stats:', error)
        // Fallback to original data without stats
        setPeerTutorsWithStats(peerTutors.map(tutor => ({
          ...tutor,
          classStats: { totalClasses: 0, completedClasses: 0, pendingClasses: 0 },
          additionalClassesCount: 0
        })))
      } finally {
        setLoading(false)
      }
    }

    if (peerTutors.length > 0) {
      loadPeerTutorStats()
    } else {
      setPeerTutorsWithStats([])
      setPeerTutorStudentCounts({})
      setLoading(false)
    }
  }, [peerTutors, students])

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setShowSortPopup(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Sort peer tutors based on selected option
  const sortedPeerTutors = [...peerTutorsWithStats].sort((a, b) => {
    switch (sortBy) {
      case 'completed':
        return (b.classStats?.completedClasses || 0) - (a.classStats?.completedClasses || 0)
      case 'additional':
        return (b.additionalClassesCount || 0) - (a.additionalClassesCount || 0)
      case 'students':
        return (peerTutorStudentCounts[b.id] || 0) - (peerTutorStudentCounts[a.id] || 0)
      case 'name':
      default:
        return a.name.localeCompare(b.name)
    }
  })

  // Export function for peer tutors
  const exportPeerTutors = () => {
    const exportData = peerTutorsWithStats.map(tutor => ({
      'Name': tutor.name,
      'Email': tutor.email,
      'Total Classes Allocated': tutor.classStats?.totalClasses || 0,
      'Completed Classes': tutor.classStats?.completedClasses || 0,
      'Pending Classes': tutor.classStats?.pendingClasses || 0,
      'Additional Classes Taken': tutor.additionalClassesCount || 0,
      'Students Assigned': peerTutorStudentCounts[tutor.id] || 0
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Peer Tutors')
    
    const fileName = `peer_tutors_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  // Selection functions
  const handleSelectAll = () => {
    if (selectedPeerTutors.size === sortedPeerTutors.length) {
      setSelectedPeerTutors(new Set())
    } else {
      setSelectedPeerTutors(new Set(sortedPeerTutors.map(t => t.id)))
    }
  }

  const handleSelectOne = (tutorId: string) => {
    const newSelected = new Set(selectedPeerTutors)
    if (newSelected.has(tutorId)) {
      newSelected.delete(tutorId)
    } else {
      newSelected.add(tutorId)
    }
    setSelectedPeerTutors(newSelected)
  }

  // Delete functions
  const handleBulkDelete = () => {
    const idsToDelete = Array.from(selectedPeerTutors)
    const items = peerTutorsWithStats
      .filter(t => idsToDelete.includes(t.id))
      .map(t => ({
        name: t.name,
        email: t.email,
        additionalInfo: `${peerTutorStudentCounts[t.id] || 0} student(s) assigned, ${t.classStats?.totalClasses || 0} total class(es)`
      }))
    
    setItemsToDelete(items)
    setDeleteTarget('selected')
    setShowDeleteModal(true)
  }

  const handleSingleDelete = (tutorId: string) => {
    const tutor = peerTutorsWithStats.find(t => t.id === tutorId)
    if (tutor) {
      const items = [{
        name: tutor.name,
        email: tutor.email,
        additionalInfo: `${peerTutorStudentCounts[tutor.id] || 0} student(s) assigned, ${tutor.classStats?.totalClasses || 0} total class(es)`
      }]
      setItemsToDelete(items)
    }
    setDeleteTarget('single')
    setSingleDeleteId(tutorId)
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    const idsToDelete = deleteTarget === 'selected' 
      ? Array.from(selectedPeerTutors)
      : singleDeleteId ? [singleDeleteId] : []

    for (const id of idsToDelete) {
      await handleRemovePeerTutor(id)
    }

    setSelectedPeerTutors(new Set())
    setSingleDeleteId(null)
    setShowDeleteModal(false)
    setIsDeleteMode(false)
  }

  const toggleDeleteMode = () => {
    setIsDeleteMode(!isDeleteMode)
    setSelectedPeerTutors(new Set())
  }

  const cancelDeleteMode = () => {
    setIsDeleteMode(false)
    setSelectedPeerTutors(new Set())
  }


  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-medium text-gray-900">Peer Tutors ({peerTutors.length})</h3>
          {isDeleteMode && selectedPeerTutors.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs sm:text-sm font-medium transition-colors duration-200 flex items-center space-x-1 sm:space-x-2"
            >
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Delete ({selectedPeerTutors.size})</span>
            </button>
          )}
          {isDeleteMode && (
            <button
              onClick={cancelDeleteMode}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md text-xs sm:text-sm font-medium transition-colors duration-200"
            >
              Cancel
            </button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {!isDeleteMode && (
            <>
          {/* Sort/Filter Button */}
          <div className="relative" ref={sortRef}>
          <button
              onClick={() => setShowSortPopup(!showSortPopup)}
              className={`w-full sm:w-auto px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2 ${
                sortBy !== 'name'
                  ? 'bg-blue-100 text-blue-600 hover:bg-blue-200 border border-blue-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
              }`}
              title="Sort peer tutors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
              <span className="hidden sm:inline">Sort By</span>
              <span className="sm:hidden">Sort</span>
          </button>

            {/* Sort Popup */}
            {showSortPopup && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                <div className="p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Sort Peer Tutors By</h4>
                  
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setSortBy('name')
                        setShowSortPopup(false)
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        sortBy === 'name'
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Name (A-Z)
                    </button>
                    
                    <button
                      onClick={() => {
                        setSortBy('completed')
                        setShowSortPopup(false)
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        sortBy === 'completed'
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Completed Classes (High to Low)
                    </button>
                    
                    <button
                      onClick={() => {
                        setSortBy('additional')
                        setShowSortPopup(false)
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        sortBy === 'additional'
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Additional Classes (High to Low)
                    </button>
                    
                    <button
                      onClick={() => {
                        setSortBy('students')
                        setShowSortPopup(false)
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        sortBy === 'students'
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Students Assigned (High to Low)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
          >
            Add Peer Tutor
          </button>

          <button
            onClick={exportPeerTutors}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export</span>
          </button>

          <button
            onClick={toggleDeleteMode}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete</span>
          </button>
            </>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
          <span className="text-gray-500">Loading peer tutor statistics...</span>
        </div>
      ) : sortedPeerTutors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-lg">
          <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
          <p className="text-lg font-medium text-gray-900 mb-2">No peer tutors assigned</p>
          <p className="text-sm text-gray-500 text-center px-4">Click the "Add Peer Tutor" button to assign peer tutors to this section</p>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="block lg:hidden space-y-4">
            {sortedPeerTutors.map((tutor) => (
              <div key={tutor.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-start gap-3">
                    {isDeleteMode && (
                      <input
                        type="checkbox"
                        checked={selectedPeerTutors.has(tutor.id)}
                        onChange={() => handleSelectOne(tutor.id)}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer mt-1"
                      />
                    )}
                    <div className="flex-1">
                      <button
                        onClick={() => onPeerTutorClick(tutor.id)}
                        className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors text-left w-full"
                      >
                        {tutor.name}
                      </button>
                      <p className="text-sm text-gray-600 mt-1">{tutor.email}</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Classes</p>
                      <p className="text-xl font-bold text-gray-900">{tutor.classStats.totalClasses}</p>
                    </div>
                    
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Completed</p>
                      <p className="text-xl font-bold text-gray-900">{tutor.classStats.completedClasses}</p>
                    </div>
                    
                    <div className="bg-yellow-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pending</p>
                      <p className="text-xl font-bold text-gray-900">{tutor.classStats.pendingClasses}</p>
                    </div>
                    
                    <div className="bg-purple-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Additional</p>
                      <p className="text-xl font-bold text-gray-900">{tutor.additionalClassesCount || 0}</p>
                    </div>
                    
                    <div className="bg-blue-50 rounded-lg p-3 col-span-2">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Students Assigned</p>
                      <p className="text-xl font-bold text-gray-900">{peerTutorStudentCounts[tutor.id] || 0}</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => onPeerTutorClick(tutor.id)}
                    className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors duration-200"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {isDeleteMode && (
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedPeerTutors.size === sortedPeerTutors.length && sortedPeerTutors.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                  />
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Classes Allocated
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Completed Classes
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pending Classes
              </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Additional Classes Taken
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Students Assigned
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
                {sortedPeerTutors.map((tutor) => (
                <tr key={tutor.id} className="hover:bg-gray-50">
                  {isDeleteMode && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedPeerTutors.has(tutor.id)}
                        onChange={() => handleSelectOne(tutor.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => onPeerTutorClick(tutor.id)}
                      className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors"
                    >
                      {tutor.name}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{tutor.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-semibold text-gray-900">
                      {tutor.classStats.totalClasses}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-semibold text-gray-900">
                      {tutor.classStats.completedClasses}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-semibold text-gray-900">
                      {tutor.classStats.pendingClasses}
                    </div>
                  </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm font-semibold text-gray-900">
                        {tutor.additionalClassesCount || 0}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-semibold text-gray-900">
                      {peerTutorStudentCounts[tutor.id] || 0}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      {!isDeleteMode && (
                        <button
                          onClick={() => handleSingleDelete(tutor.id)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                ))}
          </tbody>
        </table>
      </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setSingleDeleteId(null)
          setItemsToDelete([])
        }}
        onConfirm={confirmDelete}
        title="Confirm Peer Tutor Deletion"
        itemsToDelete={itemsToDelete}
        type="peer-tutors"
      />
    </div>
  )
}

interface StudentsTabProps {
  students: Student[]
  peerTutors: PeerTutor[]
  setIsStudentModalOpen: (isOpen: boolean) => void
  handleRemoveStudent: (studentId: string) => void
}

function StudentsTab({ students, peerTutors, setIsStudentModalOpen, handleRemoveStudent }: StudentsTabProps) {
  const [filteredStudents, setFilteredStudents] = useState<Student[]>(students)
  const [selectedPeerTutor, setSelectedPeerTutor] = useState<string>('all')
  const [showFilterPopup, setShowFilterPopup] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<'selected' | 'single'>('selected')
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [itemsToDeleteStudents, setItemsToDeleteStudents] = useState<Array<{name: string, email: string, additionalInfo: string}>>([])


  // Apply peer tutor filter
  useEffect(() => {
    let filtered = students

    if (selectedPeerTutor !== 'all') {
      filtered = filtered.filter(student => student.assigned_peer_tutor_id === selectedPeerTutor)
    }

    setFilteredStudents(filtered)
  }, [students, selectedPeerTutor])

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilterPopup(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const hasActiveFilters = selectedPeerTutor !== 'all'

  const clearFilters = () => {
    setSelectedPeerTutor('all')
  }

  // Export function for students
  const exportStudents = () => {
    const exportData = filteredStudents.map(student => {
      const assignedPeerTutor = peerTutors.find(tutor => tutor.id === student.assigned_peer_tutor_id)
      return {
        'Name': student.name,
        'Email': student.email,
        'Year & Section': `${student.year.includes('Year') ? student.year : `${student.year} Year`} - ${student.section.includes('Section') ? student.section : `Section ${student.section}`}`,
        'Assigned Peer Tutor': assignedPeerTutor?.name || 'Not assigned'
      }
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Students')
    
    const fileName = `students_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  // Selection functions
  const handleSelectAllStudents = () => {
    if (selectedStudents.size === filteredStudents.length) {
      setSelectedStudents(new Set())
    } else {
      setSelectedStudents(new Set(filteredStudents.map(s => s.id)))
    }
  }

  const handleSelectOneStudent = (studentId: string) => {
    const newSelected = new Set(selectedStudents)
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId)
    } else {
      newSelected.add(studentId)
    }
    setSelectedStudents(newSelected)
  }

  // Delete functions
  const handleBulkDeleteStudents = () => {
    const idsToDelete = Array.from(selectedStudents)
    const items = students
      .filter(s => idsToDelete.includes(s.id))
      .map(s => {
        const assignedPeerTutor = peerTutors.find(tutor => tutor.id === s.assigned_peer_tutor_id)
        return {
          name: s.name,
          email: s.email,
          additionalInfo: `${s.year} - ${s.section}${assignedPeerTutor ? `, Assigned to: ${assignedPeerTutor.name}` : ''}`
        }
      })
    
    setItemsToDeleteStudents(items)
    setDeleteTarget('selected')
    setShowDeleteModal(true)
  }

  const handleSingleDeleteStudent = (studentId: string) => {
    const student = students.find(s => s.id === studentId)
    if (student) {
      const assignedPeerTutor = peerTutors.find(tutor => tutor.id === student.assigned_peer_tutor_id)
      const items = [{
        name: student.name,
        email: student.email,
        additionalInfo: `${student.year} - ${student.section}${assignedPeerTutor ? `, Assigned to: ${assignedPeerTutor.name}` : ''}`
      }]
      setItemsToDeleteStudents(items)
    }
    setDeleteTarget('single')
    setSingleDeleteId(studentId)
    setShowDeleteModal(true)
  }

  const confirmDeleteStudents = async () => {
    const idsToDelete = deleteTarget === 'selected' 
      ? Array.from(selectedStudents)
      : singleDeleteId ? [singleDeleteId] : []

    for (const id of idsToDelete) {
      await handleRemoveStudent(id)
    }

    setSelectedStudents(new Set())
    setSingleDeleteId(null)
    setShowDeleteModal(false)
    setIsDeleteMode(false)
  }

  const toggleDeleteModeStudents = () => {
    setIsDeleteMode(!isDeleteMode)
    setSelectedStudents(new Set())
  }

  const cancelDeleteModeStudents = () => {
    setIsDeleteMode(false)
    setSelectedStudents(new Set())
  }


  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-medium text-gray-900">
            Students ({filteredStudents.length} of {students.length})
            {hasActiveFilters && (
              <span className="ml-2 text-sm text-blue-600">
                (Filtered)
              </span>
            )}
          </h3>
          {isDeleteMode && selectedStudents.size > 0 && (
            <button
              onClick={handleBulkDeleteStudents}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs sm:text-sm font-medium transition-colors duration-200 flex items-center space-x-1 sm:space-x-2"
            >
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Delete ({selectedStudents.size})</span>
            </button>
          )}
          {isDeleteMode && (
            <button
              onClick={cancelDeleteModeStudents}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md text-xs sm:text-sm font-medium transition-colors duration-200"
            >
              Cancel
            </button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {!isDeleteMode && (
            <>
          {/* Filter Button */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilterPopup(!showFilterPopup)}
              className={`w-full sm:w-auto px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2 ${
                hasActiveFilters
                  ? 'bg-blue-100 text-blue-600 hover:bg-blue-200 border border-blue-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
              }`}
              title="Filter students"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="hidden sm:inline">Filter By</span>
              <span className="sm:hidden">Filter</span>
            </button>

            {/* Filter Popup */}
            {showFilterPopup && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-900">Filter Students</h4>
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Peer Tutor</label>
                      <select
                        value={selectedPeerTutor}
                        onChange={(e) => setSelectedPeerTutor(e.target.value)}
                        className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="all">All Peer Tutors</option>
                        {peerTutors.map(tutor => (
                          <option key={tutor.id} value={tutor.id}>{tutor.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button 
            onClick={() => setIsStudentModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
          >
            Add Student
          </button>

          {/* Export Button */}
          <button
            onClick={exportStudents}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export</span>
          </button>

          <button
            onClick={toggleDeleteModeStudents}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete</span>
          </button>
            </>
          )}
        </div>
      </div>

      {filteredStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-lg">
          <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
          <p className="text-lg font-medium text-gray-900 mb-2">No students found</p>
          <p className="text-sm text-gray-500 text-center px-4">Click the "Add Student" button to add students to this section</p>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="block lg:hidden space-y-4">
            {filteredStudents.map((student) => {
              const assignedPeerTutor = peerTutors.find(tutor => tutor.id === student.assigned_peer_tutor_id)
              return (
                <div key={student.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-4 py-3 border-b border-gray-200">
                    <div className="flex items-start gap-3">
                      {isDeleteMode && (
                        <input
                          type="checkbox"
                          checked={selectedStudents.has(student.id)}
                          onChange={() => handleSelectOneStudent(student.id)}
                          className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer mt-1"
                        />
                      )}
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-gray-900">{student.name}</h4>
                        <p className="text-sm text-gray-600 mt-1">{student.email}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 space-y-3">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-24 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Year & Section
                      </div>
                      <div className="flex-1 text-sm text-gray-900">
                        {student.year.includes('Year') ? student.year : `${student.year} Year`} - 
                        {student.section.includes('Section') ? student.section : `Section ${student.section}`}
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-24 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Peer Tutor
                      </div>
                      <div className="flex-1">
                        {assignedPeerTutor ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {assignedPeerTutor.name}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">Not assigned</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="pt-3 border-t border-gray-200">
                      <button 
                        onClick={() => handleRemoveStudent(student.id)}
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors duration-200"
                      >
                        Remove Student
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {isDeleteMode && (
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0}
                    onChange={handleSelectAllStudents}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                  />
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Year & Section
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assigned Peer Tutor
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                {filteredStudents.map((student) => {
                        const assignedPeerTutor = peerTutors.find(tutor => tutor.id === student.assigned_peer_tutor_id)
                        return (
                          <tr key={student.id} className="hover:bg-gray-50">
                            {isDeleteMode && (
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={selectedStudents.has(student.id)}
                                  onChange={() => handleSelectOneStudent(student.id)}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                />
                              </td>
                            )}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{student.name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{student.email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {student.year.includes('Year') ? student.year : `${student.year} Year`} - 
                                {student.section.includes('Section') ? student.section : `Section ${student.section}`}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {assignedPeerTutor ? (
                                <div className="text-sm text-gray-900">
                                  {assignedPeerTutor.name}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500">
                                  Not assigned
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              {!isDeleteMode && (
                                <button 
                                  onClick={() => handleSingleDeleteStudent(student.id)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  Delete
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                })}
                  </tbody>
        </table>
      </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setSingleDeleteId(null)
          setItemsToDeleteStudents([])
        }}
        onConfirm={confirmDeleteStudents}
        title="Confirm Student Deletion"
        itemsToDelete={itemsToDeleteStudents}
        type="students"
      />
    </div>
  )
}

interface ImportExportTabProps {
  dept: string
  year: string
  section: string
  onImportComplete: () => void
  onShowExportModal: () => void
}

function ImportExportTab({ dept, year, section, onImportComplete, onShowExportModal }: ImportExportTabProps) {
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState({
    totalPeerTutors: 0,
    totalStudents: 0,
    totalClasses: 0,
    totalAttendanceRecords: 0,
    totalExams: 0,
    assignedStudents: 0,
    scheduledClasses: 0
  })
  const [activeSubTab, setActiveSubTab] = useState<'export' | 'import' | 'advanced'>('export')

  const dbYear = year
  const dbSection = section

  useEffect(() => {
    loadAnalytics()
  }, [dept, dbYear, dbSection])

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      const [tutors, sectionStudents, classes, scheduledClasses, examTypes] = await Promise.all([
        PeerTutorService.getPeerTutorsBySection(dept, dbYear, dbSection),
        StudentService.getStudentsBySection(dept, dbYear, dbSection),
        ClassService.getClassesByYearSection(dept, dbYear, dbSection),
        ScheduledClassService.getScheduledClassesByYearSection(dept, dbYear, dbSection),
        ExamMarksService.getExamTypesForSection(dept, dbYear, dbSection)
      ])

      const assignedCount = sectionStudents.filter(s => s.assigned_peer_tutor_id).length

      setAnalytics({
        totalPeerTutors: tutors.length,
        totalStudents: sectionStudents.length,
        totalClasses: classes.length,
        totalAttendanceRecords: 0, // Will be calculated if needed
        totalExams: examTypes.length,
        assignedStudents: assignedCount,
        scheduledClasses: scheduledClasses.length
      })
    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExportPeerDetails = async () => {
    try {
      const tutors = await PeerTutorService.getPeerTutorsBySection(dept, dbYear, dbSection)
      const exportData = tutors.map(tutor => ({
        'Name': tutor.name,
        'Email': tutor.email,
        'Department': tutor.dept,
        'Year': tutor.year,
        'Section': tutor.section,
        'Created At': new Date(tutor.created_at).toLocaleDateString()
      }))

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Peer Tutors')
      XLSX.writeFile(wb, `peer_tutors_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (error) {
      console.error('Error exporting peer details:', error)
      alert('Failed to export peer tutor details')
    }
  }

  const handleExportStudents = async () => {
    try {
      const sectionStudents = await StudentService.getStudentsBySection(dept, dbYear, dbSection)
      const tutors = await PeerTutorService.getPeerTutorsBySection(dept, dbYear, dbSection)
      
      const exportData = sectionStudents.map(student => {
        const assignedTutor = tutors.find(t => t.id === student.assigned_peer_tutor_id)
        return {
          'Name': student.name,
          'Email': student.email,
          'Department': student.dept,
          'Year': student.year,
          'Section': student.section,
          'Assigned Peer Tutor': assignedTutor?.name || 'Not Assigned',
          'Created At': new Date(student.created_at).toLocaleDateString()
        }
      })

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Students')
      XLSX.writeFile(wb, `students_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (error) {
      console.error('Error exporting students:', error)
      alert('Failed to export students')
    }
  }

  const handleExportAssignments = async () => {
    try {
      const assignments = await AssignmentService.getAssignments(dept, dbYear, dbSection)
      const tutors = await PeerTutorService.getPeerTutorsBySection(dept, dbYear, dbSection)
      const sectionStudents = await StudentService.getStudentsBySection(dept, dbYear, dbSection)

      const exportData = assignments.map(assignment => {
        const tutor = tutors.find(t => t.id === assignment.peer_tutor_id)
        const student = sectionStudents.find(s => s.id === assignment.student_id)
        return {
          'Peer Tutor Name': tutor?.name || 'Unknown',
          'Peer Tutor Email': tutor?.email || 'Unknown',
          'Student Name': student?.name || 'Unknown',
          'Student Email': student?.email || 'Unknown',
          'Department': assignment.dept,
          'Year': assignment.year,
          'Section': assignment.section,
          'Assigned Date': new Date(assignment.created_at).toLocaleDateString()
        }
      })

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Assignments')
      XLSX.writeFile(wb, `assignments_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (error) {
      console.error('Error exporting assignments:', error)
      alert('Failed to export assignments')
    }
  }

  const handleExportAttendance = async () => {
    try {
      const scheduledClasses = await ScheduledClassService.getScheduledClassesByYearSection(dept, dbYear, dbSection)
      const supabase = createClient()
      
      const allAttendance: any[] = []
      
      for (const scheduledClass of scheduledClasses) {
        const { data: attendanceRecords } = await supabase
          .from('attendance')
          .select(`
            *,
            peer_tutors(name, email),
            peer_students(name, email)
          `)
          .eq('scheduled_class_id', scheduledClass.id)

        if (attendanceRecords) {
          attendanceRecords.forEach(record => {
            allAttendance.push({
              'Subject': scheduledClass.class?.subject_name || 'Unknown',
              'Date': new Date(scheduledClass.scheduled_date).toLocaleDateString(),
              'Peer Tutor': record.peer_tutors?.name || 'Unknown',
              'Student': record.peer_students?.name || 'Unknown',
              'Status': record.status,
              'Recorded At': new Date(record.created_at).toLocaleDateString()
            })
          })
        }
      }

      const ws = XLSX.utils.json_to_sheet(allAttendance)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
      XLSX.writeFile(wb, `attendance_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (error) {
      console.error('Error exporting attendance:', error)
      alert('Failed to export attendance records')
    }
  }

  const handleExportExams = async () => {
    try {
      const examTypes = await ExamMarksService.getExamTypesForSection(dept, dbYear, dbSection)
      const allExamData: any[] = []

      for (const exam of examTypes) {
        const details = await ExamMarksService.getExamDetailsForSection(exam.exam_type, dept, dbYear, dbSection)
        
        details.forEach(tutorData => {
          tutorData.students.forEach((student: any) => {
            exam.subjects.forEach((subject: string) => {
              allExamData.push({
                'Exam Type': exam.exam_name,
                'Subject': subject,
                'Peer Tutor': tutorData.peer_tutor.name,
                'Student': student.name,
                'Student Email': student.email,
                'Marks': student.marks[subject] || 'Pending'
              })
            })
          })
        })
      }

      const ws = XLSX.utils.json_to_sheet(allExamData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Exam Marks')
      XLSX.writeFile(wb, `exams_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (error) {
      console.error('Error exporting exams:', error)
      alert('Failed to export exam data')
    }
  }

  const handleExportAll = async () => {
    try {
      const wb = XLSX.utils.book_new()

      // Peer Tutors Sheet
      const tutors = await PeerTutorService.getPeerTutorsBySection(dept, dbYear, dbSection)
      const tutorData = tutors.map(t => ({
        'Name': t.name,
        'Email': t.email,
        'Department': t.dept,
        'Year': t.year,
        'Section': t.section
      }))
      const tutorWs = XLSX.utils.json_to_sheet(tutorData)
      XLSX.utils.book_append_sheet(wb, tutorWs, 'Peer Tutors')

      // Students Sheet
      const sectionStudents = await StudentService.getStudentsBySection(dept, dbYear, dbSection)
      const studentData = sectionStudents.map(s => {
        const assignedTutor = tutors.find(t => t.id === s.assigned_peer_tutor_id)
        return {
          'Name': s.name,
          'Email': s.email,
          'Assigned Peer Tutor': assignedTutor?.name || 'Not Assigned'
        }
      })
      const studentWs = XLSX.utils.json_to_sheet(studentData)
      XLSX.utils.book_append_sheet(wb, studentWs, 'Students')

      // Assignments Sheet
      const assignments = await AssignmentService.getAssignments(dept, dbYear, dbSection)
      const assignmentData = assignments.map(a => {
        const tutor = tutors.find(t => t.id === a.peer_tutor_id)
        const student = sectionStudents.find(s => s.id === a.student_id)
        return {
          'Peer Tutor': tutor?.name || 'Unknown',
          'Student': student?.name || 'Unknown',
          'Assigned Date': new Date(a.created_at).toLocaleDateString()
        }
      })
      const assignmentWs = XLSX.utils.json_to_sheet(assignmentData)
      XLSX.utils.book_append_sheet(wb, assignmentWs, 'Assignments')

      XLSX.writeFile(wb, `complete_data_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (error) {
      console.error('Error exporting all data:', error)
      alert('Failed to export complete data')
    }
  }

  const handleExportTemplate = () => {
    const wb = XLSX.utils.book_new()

    // Peer Tutors Template
    const tutorTemplate = [
      { 'Name': 'John Doe', 'Email': 'john.doe@example.com', 'Department': dept, 'Year': year, 'Section': section }
    ]
    const tutorWs = XLSX.utils.json_to_sheet(tutorTemplate)
    XLSX.utils.book_append_sheet(wb, tutorWs, 'Peer Tutors Template')

    // Students Template
    const studentTemplate = [
      { 'Name': 'Jane Smith', 'Email': 'jane.smith@example.com', 'Department': dept, 'Year': year, 'Section': section }
    ]
    const studentWs = XLSX.utils.json_to_sheet(studentTemplate)
    XLSX.utils.book_append_sheet(wb, studentWs, 'Students Template')

    XLSX.writeFile(wb, `import_template_${dept}_${year}_${section}.xlsx`)
  }

  if (loading) {
  return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
        <span className="text-gray-500">Loading analytics...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Analytics Section */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl p-4 sm:p-6 border border-blue-200">
        <div className="flex items-center mb-4">
          <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">Analytics Overview</h3>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-600">{analytics.totalPeerTutors}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Peer Tutors</div>
          </div>
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-green-600">{analytics.totalStudents}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Students</div>
          </div>
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-purple-600">{analytics.assignedStudents}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Assigned</div>
          </div>
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-orange-600">{analytics.totalClasses}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Classes</div>
          </div>
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-indigo-600">{analytics.scheduledClasses}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Scheduled</div>
          </div>
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-pink-600">{analytics.totalExams}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Exams</div>
          </div>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 overflow-x-auto">
          <nav className="-mb-px flex space-x-4 sm:space-x-6 lg:space-x-8 px-4 sm:px-6 min-w-max sm:min-w-0" aria-label="Import Export Tabs">
            <button
              onClick={() => setActiveSubTab('export')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                activeSubTab === 'export'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Export
            </button>
            <button
              onClick={() => setActiveSubTab('import')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                activeSubTab === 'import'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Import
            </button>
            <button
              onClick={() => setActiveSubTab('advanced')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                activeSubTab === 'advanced'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Advanced
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {activeSubTab === 'export' && (
    <div>
      <div className="mb-6">
                <div className="flex items-center mb-2">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">Export Data to Excel</h3>
                </div>
                <p className="text-xs sm:text-sm text-gray-600">Select the data you want to export and download in Excel format</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Export Peer Details */}
          <button
              onClick={handleExportPeerDetails}
              className="group bg-white hover:bg-blue-50 border-2 border-gray-200 hover:border-blue-300 rounded-lg p-4 transition-all duration-200 text-left"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
                </div>
                <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded">XLSX</span>
              </div>
              <h4 className="text-sm font-semibold text-gray-900 mb-1">Peer Tutor Details</h4>
              <p className="text-xs text-gray-500">Export all peer tutor information</p>
          </button>

            {/* Export Students */}
            <button
              onClick={handleExportStudents}
              className="group bg-white hover:bg-green-50 border-2 border-gray-200 hover:border-green-300 rounded-lg p-4 transition-all duration-200 text-left"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13.5 3.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" />
                  </svg>
        </div>
                <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded">XLSX</span>
      </div>
              <h4 className="text-sm font-semibold text-gray-900 mb-1">Student Details</h4>
              <p className="text-xs text-gray-500">Export all student information</p>
            </button>

            {/* Export Assignments */}
            <button
              onClick={handleExportAssignments}
              className="group bg-white hover:bg-purple-50 border-2 border-gray-200 hover:border-purple-300 rounded-lg p-4 transition-all duration-200 text-left"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                  <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-purple-600 bg-purple-100 px-2 py-1 rounded">XLSX</span>
              </div>
              <h4 className="text-sm font-semibold text-gray-900 mb-1">Peer-Student Assignments</h4>
              <p className="text-xs text-gray-500">Export assignment mappings</p>
            </button>

            {/* Export Attendance */}
            <button
              onClick={handleExportAttendance}
              className="group bg-white hover:bg-orange-50 border-2 border-gray-200 hover:border-orange-300 rounded-lg p-4 transition-all duration-200 text-left"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                  <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-1 rounded">XLSX</span>
              </div>
              <h4 className="text-sm font-semibold text-gray-900 mb-1">Attendance Records</h4>
              <p className="text-xs text-gray-500">Export all attendance data</p>
            </button>

            {/* Export Exams */}
            <button
              onClick={handleExportExams}
              className="group bg-white hover:bg-pink-50 border-2 border-gray-200 hover:border-pink-300 rounded-lg p-4 transition-all duration-200 text-left"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center group-hover:bg-pink-200 transition-colors">
                  <svg className="w-5 h-5 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-pink-600 bg-pink-100 px-2 py-1 rounded">XLSX</span>
              </div>
              <h4 className="text-sm font-semibold text-gray-900 mb-1">Exam Marks</h4>
              <p className="text-xs text-gray-500">Export all exam results</p>
            </button>

            {/* Export Complete Data */}
            <button
              onClick={handleExportAll}
              className="group bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-lg p-4 transition-all duration-200 text-left shadow-md hover:shadow-lg"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-colors">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
                <span className="text-xs font-semibold bg-white/20 px-2 py-1 rounded">ALL</span>
              </div>
              <h4 className="text-sm font-semibold mb-1">Complete Export</h4>
              <p className="text-xs opacity-90">All data in one file</p>
            </button>

            {/* Export Template */}
            <button
              onClick={handleExportTemplate}
              className="group bg-white hover:bg-gray-50 border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-lg p-4 transition-all duration-200 text-left"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded">TEMPLATE</span>
              </div>
              <h4 className="text-sm font-semibold text-gray-900 mb-1">Download Template</h4>
              <p className="text-xs text-gray-500">Get import template file</p>
            </button>
          </div>
            </div>
          )}

          {activeSubTab === 'import' && (
            <div>
              <div className="mb-4">
                <div className="flex items-center mb-2">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">Import Data</h3>
                </div>
                <p className="text-xs sm:text-sm text-gray-600">Upload Excel files to import peer tutors and students</p>
              </div>

              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg p-4 sm:p-6 border border-indigo-200">
      <BulkImportExport 
        dept={dept} 
        year={year} 
        section={section} 
        onImportComplete={onImportComplete}
      />
              </div>
            </div>
          )}

          {activeSubTab === 'advanced' && (
            <div>
              <div className="mb-4">
                <div className="flex items-center mb-2">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">Advanced Export Options</h3>
                </div>
                <p className="text-xs sm:text-sm text-gray-600">Specialized export formats with custom options</p>
              </div>

              <button
                onClick={onShowExportModal}
                className="w-full group bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg px-6 py-6 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <div className="flex items-center justify-center sm:justify-start gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-colors flex-shrink-0">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold text-base sm:text-lg mb-1">Export Peer Tutor Mapping</div>
                    <div className="text-xs sm:text-sm opacity-90">Hierarchical structure with customizable headers and advanced formatting</div>
                  </div>
                </div>
              </button>

              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-xs sm:text-sm text-amber-800">
                    <p className="font-semibold mb-1">Advanced Export Features:</p>
                    <ul className="list-disc list-inside space-y-1 text-amber-700">
                      <li>Customizable headers and footers</li>
                      <li>Hierarchical organization by peer tutor</li>
                      <li>Professional formatting for presentations</li>
                      <li>Multiple layout options</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface AssignTabProps {
  dept: string
  year: string
  section: string
}

function AssignTab({ dept, year, section }: AssignTabProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [stats, setStats] = useState<AssignmentStats | null>(null)
  const [unassignedStudents, setUnassignedStudents] = useState<Student[]>([])
  const [peerTutorsWithStudents, setPeerTutorsWithStudents] = useState<Array<{
    peerTutor: PeerTutor
    students: Student[]
  }>>([])
  const [loading, setLoading] = useState(true)
  const [selectedStudent, setSelectedStudent] = useState<string>('')
  const [selectedPeerTutor, setSelectedPeerTutor] = useState<string>('')

  // Use raw values directly for database operations
  const dbYear = year
  const dbSection = section

  useEffect(() => {
    loadAssignments()
  }, [dept, dbYear, dbSection])

  const loadAssignments = async () => {
    try {
      setLoading(true)
      console.log('Loading assignments for:', { dept, year: dbYear, section: dbSection })
      const [assignmentsData, statsData, unassignedData, tutorsWithStudentsData] = await Promise.all([
        AssignmentService.getAssignments(dept, dbYear, dbSection),
        AssignmentService.getAssignmentStats(dept, dbYear, dbSection),
        AssignmentService.getUnassignedStudents(dept, dbYear, dbSection),
        AssignmentService.getPeerTutorsWithStudents(dept, dbYear, dbSection)
      ])
      console.log('Assignments data:', assignmentsData)
      console.log('Stats data:', statsData)
      setAssignments(assignmentsData)
      setStats(statsData)
      setUnassignedStudents(unassignedData)
      setPeerTutorsWithStudents(tutorsWithStudentsData)
    } catch (error) {
      console.error('Error loading assignments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAutoAssign = async () => {
    try {
      console.log('Auto assigning for:', { dept, year: dbYear, section: dbSection })
      const success = await AssignmentService.autoAssignStudents(dept, dbYear, dbSection)
      if (success) {
        await loadAssignments()
      }
    } catch (error) {
      console.error('Error auto-assigning students:', error)
    }
  }

  const handleManualAssign = async () => {
    if (!selectedStudent || !selectedPeerTutor) return

    try {
      const success = await AssignmentService.assignStudent(selectedStudent, selectedPeerTutor)
      if (success) {
        setSelectedStudent('')
        setSelectedPeerTutor('')
        await loadAssignments()
      }
    } catch (error) {
      console.error('Error manually assigning student:', error)
    }
  }

  const handleUnassignStudent = async (studentId: string) => {
    try {
      const success = await AssignmentService.unassignStudent(studentId)
      if (success) {
        await loadAssignments()
      }
    } catch (error) {
      console.error('Error unassigning student:', error)
    }
  }

  // Export assignments with unassigned data
  const handleExportAssignments = async () => {
    try {
      const wb = XLSX.utils.book_new()

      // Sheet 1: Peer-Student Assignments
      const assignmentData: any[] = []
      peerTutorsWithStudents.forEach(({ peerTutor, students }) => {
        students.forEach(student => {
          assignmentData.push({
            'Peer Tutor Name': peerTutor.name,
            'Peer Tutor Email': peerTutor.email,
            'Student Name': student.name,
            'Student Email': student.email,
            'Department': dept,
            'Year': year,
            'Section': section
          })
        })
      })

      if (assignmentData.length > 0) {
        const assignmentWs = XLSX.utils.json_to_sheet(assignmentData)
        XLSX.utils.book_append_sheet(wb, assignmentWs, 'Peer-Student Assignments')
      }

      // Sheet 2: Unassigned Students (if any)
      if (unassignedStudents.length > 0) {
        const unassignedStudentData = unassignedStudents.map(student => ({
          'Student Name': student.name,
          'Student Email': student.email,
          'Department': student.dept,
          'Year': student.year,
          'Section': student.section,
          'Status': 'Unassigned'
        }))
        const unassignedStudentWs = XLSX.utils.json_to_sheet(unassignedStudentData)
        XLSX.utils.book_append_sheet(wb, unassignedStudentWs, 'Unassigned Students')
      }

      // Sheet 3: Peer Tutors without Students (if any)
      const allPeerTutors = await PeerTutorService.getPeerTutorsBySection(dept, dbYear, dbSection)
      const unassignedPeerTutors = allPeerTutors.filter(tutor => 
        !peerTutorsWithStudents.some(pts => pts.peerTutor.id === tutor.id)
      )

      if (unassignedPeerTutors.length > 0) {
        const unassignedPeerData = unassignedPeerTutors.map(tutor => ({
          'Peer Tutor Name': tutor.name,
          'Peer Tutor Email': tutor.email,
          'Department': tutor.dept,
          'Year': tutor.year,
          'Section': tutor.section,
          'Status': 'No Students Assigned'
        }))
        const unassignedPeerWs = XLSX.utils.json_to_sheet(unassignedPeerData)
        XLSX.utils.book_append_sheet(wb, unassignedPeerWs, 'Unassigned Peer Tutors')
      }

      // Save the file
      const fileName = `assignments_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)
    } catch (error) {
      console.error('Error exporting assignments:', error)
      alert('Failed to export assignments. Please try again.')
    }
  }

  // Helper function to get initials from name
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div>
      {/* Header with Export Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Assignment Management</h3>
          <p className="text-sm text-gray-600 mt-1">Manage peer tutor and student assignments</p>
        </div>
        <button
          onClick={handleExportAssignments}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Export Assignments</span>
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-xl sm:text-2xl font-bold text-blue-600">{stats.totalStudents}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Total Students</div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-xl sm:text-2xl font-bold text-green-600">{stats.totalPeerTutors}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Peer Tutors</div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-xl sm:text-2xl font-bold text-purple-600">{stats.assignedStudents}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Assigned</div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-xl sm:text-2xl font-bold text-orange-600">{stats.unassignedStudents}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Unassigned</div>
          </div>
        </div>
      )}

      {/* Auto Assign Button - Only show if there are unassigned students */}
      {unassignedStudents.length > 0 && (
        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleAutoAssign}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Auto Assign Students</span>
          </button>
          <div className="text-xs sm:text-sm text-gray-500 flex items-center px-2">
            <svg className="w-4 h-4 mr-1 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {stats?.unassignedStudents || 0} unassigned student{(stats?.unassignedStudents || 0) !== 1 ? 's' : ''} remaining
          </div>
        </div>
      )}

      {/* Manual Assignment Section */}
      {unassignedStudents.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Manual Assignment</h3>
            <p className="text-sm text-gray-600 mt-1">Assign unassigned students to peer tutors</p>
          </div>
          <div className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Student</label>
                <select
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="">Choose a student...</option>
                  {unassignedStudents.map(student => (
                    <option key={student.id} value={student.id}>{student.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Peer Tutor</label>
                <select
                  value={selectedPeerTutor}
                  onChange={(e) => setSelectedPeerTutor(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="">Choose a peer tutor...</option>
                  {peerTutorsWithStudents.map(({ peerTutor }) => (
                    <option key={peerTutor.id} value={peerTutor.id}>{peerTutor.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:self-end">
              <button
                onClick={handleManualAssign}
                disabled={!selectedStudent || !selectedPeerTutor}
                  className="w-full sm:w-auto bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Assign
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Peer Tutor Cards */}
      <div className="space-y-4 sm:space-y-6">
        {peerTutorsWithStudents.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No peer tutors found</h3>
            <p className="text-gray-500 text-sm px-4">Add peer tutors to this section to start assigning students.</p>
          </div>
        ) : (
          peerTutorsWithStudents.map(({ peerTutor, students }) => (
            <div key={peerTutor.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm sm:text-base font-medium text-blue-600">
                        {getInitials(peerTutor.name)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base sm:text-lg font-medium text-gray-900 truncate">{peerTutor.name}</h3>
                      <p className="text-xs sm:text-sm text-gray-500 truncate">{peerTutor.email}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {students.length} {students.length === 1 ? 'student' : 'students'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                {students.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-gray-500 text-sm">No students assigned yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {students.map((student) => (
                      <div key={student.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors gap-2">
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-medium text-green-600">
                              {getInitials(student.name)}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-900 text-sm truncate">{student.name}</div>
                            <div className="text-xs text-gray-500 truncate">{student.email}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnassignStudent(student.id)}
                          className="sm:flex-shrink-0 text-red-600 hover:text-red-800 text-xs font-medium px-2 py-1 hover:bg-red-50 rounded transition-colors self-start sm:self-center"
                        >
                          Unassign
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

interface ClassesTabProps {
  dept: string
  year: string
  section: string
  departmentId: string // Add departmentId prop
}

function ClassesTab({ dept, year, section, departmentId }: ClassesTabProps) {
  const [classes, setClasses] = useState<Class[]>([])
  const [scheduledClasses, setScheduledClasses] = useState<ScheduledClassWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDateAssignmentModal, setShowDateAssignmentModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'scheduled'>('all')
  const [filterByClass, setFilterByClass] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'date' | 'class'>('date')
  const [newClass, setNewClass] = useState({
    subject_name: ''
  })
  const [allSubjects, setAllSubjects] = useState<string[]>([])
  const [filteredSubjects, setFilteredSubjects] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)

  // Use raw values directly for database operations
  const dbYear = year
  const dbSection = section

  useEffect(() => {
    loadClasses()
    loadAllSubjects()
  }, [dept, dbYear, dbSection])

  const loadClasses = async () => {
    try {
      setLoading(true)
      const [classesData, scheduledClassesData] = await Promise.all([
        ClassService.getClassesByYearSection(dept, dbYear, dbSection),
        ScheduledClassService.getScheduledClassesByYearSection(dept, dbYear, dbSection)
      ])
      setClasses(classesData)
      setScheduledClasses(scheduledClassesData)
    } catch (error) {
      console.error('Error loading classes:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAllSubjects = async () => {
    try {
      setLoadingSubjects(true)
      const subjects = await ClassService.getAllUniqueSubjects()
      setAllSubjects(subjects)
    } catch (error) {
      console.error('Error loading subjects:', error)
    } finally {
      setLoadingSubjects(false)
    }
  }

  const handleSubjectInputChange = (value: string) => {
    setNewClass({ subject_name: value })
    setSelectedSuggestionIndex(-1) // Reset selection when typing
    
    if (value.length > 0) {
      // Filter subjects that contain the input value (case-insensitive)
      const filtered = allSubjects.filter(subject =>
        subject.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredSubjects(filtered)
      setShowSuggestions(filtered.length > 0)
    } else {
      setShowSuggestions(false)
      setFilteredSubjects([])
    }
  }

  const handleSubjectSelect = (subject: string) => {
    setNewClass({ subject_name: subject })
    setShowSuggestions(false)
    setFilteredSubjects([])
  }

  const handleSubjectInputBlur = () => {
    // Delay hiding suggestions to allow for clicks
    setTimeout(() => {
      setShowSuggestions(false)
      setSelectedSuggestionIndex(-1)
    }, 200)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || filteredSubjects.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => 
          prev < filteredSubjects.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedSuggestionIndex >= 0) {
          handleSubjectSelect(filteredSubjects[selectedSuggestionIndex])
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        break
    }
  }

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClass.subject_name.trim()) return

    try {
      const success = await ClassService.createClass({
        subject_name: newClass.subject_name,
        dept: dept,
        year: dbYear,
        section: dbSection,
        faculty_id: departmentId // Use the actual department ID
      })

      if (success) {
        setNewClass({ subject_name: '' })
        setShowAddModal(false)
        setShowSuggestions(false)
        setFilteredSubjects([])
        await loadClasses()
      }
    } catch (error) {
      console.error('Error adding class:', error)
    }
  }

  const handleDeleteClass = async (classId: string) => {
    if (confirm('Are you sure you want to delete this class?')) {
      try {
        const success = await ClassService.deleteClass(classId)
        if (success) {
          await loadClasses()
        }
      } catch (error) {
        console.error('Error deleting class:', error)
      }
    }
  }

  const handleExportClasses = async () => {
    try {
      // Group classes by subject with their scheduled dates
      const exportData: any[] = []
      
      // Add title and context information
      exportData.push(['Classes Export Report'])
      exportData.push([`Department: ${dept}`])
      exportData.push([`Year: ${year}`])
      exportData.push([`Section: ${section}`])
      exportData.push([`Generated on: ${new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}`])
      exportData.push([]) // Empty row for spacing
      
      // Add header
      exportData.push(['Subject', 'Scheduled Date'])
      
      // Group classes by subject
      const subjectGroups = new Map<string, ScheduledClassWithDetails[]>()
      
      classes.forEach(classItem => {
        const scheduledForClass = scheduledClasses.filter(sc => sc.class_id === classItem.id)
        if (scheduledForClass.length > 0) {
          if (!subjectGroups.has(classItem.subject_name)) {
            subjectGroups.set(classItem.subject_name, [])
          }
          subjectGroups.get(classItem.subject_name)!.push(...scheduledForClass)
        } else {
          // Add unscheduled classes
          if (!subjectGroups.has(classItem.subject_name)) {
            subjectGroups.set(classItem.subject_name, [])
          }
        }
      })
      
      // Create hierarchical export data
      subjectGroups.forEach((scheduledClasses, subjectName) => {
        if (scheduledClasses.length > 0) {
          // Add subject as parent row
          exportData.push([subjectName, ''])
          
          // Add scheduled dates as child rows
          scheduledClasses.forEach(sc => {
            const scheduledDate = new Date(sc.scheduled_date).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })
            exportData.push(['', scheduledDate])
          })
        } else {
          // Add unscheduled subject
          exportData.push([subjectName, 'Not Scheduled'])
        }
        
        // Add empty row for spacing
        exportData.push(['', ''])
      })
      
      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(exportData)
      
      // Set column widths
      ws['!cols'] = [
        { wch: 30 }, // Subject
        { wch: 20 }  // Scheduled Date
      ]
      
      // Add styling for different row types
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
      for (let row = range.s.r; row <= range.e.r; row++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: 0 })
        const cell = ws[cellAddress]
        
        if (cell && cell.v) {
          if (!cell.s) cell.s = {}
          
          // Style title row
          if (row === 0 && cell.v === 'Classes Export Report') {
            cell.s.font = { bold: true, size: 16 }
            cell.s.alignment = { horizontal: 'center' }
          }
          // Style context information rows
          else if (row >= 1 && row <= 4) {
            cell.s.font = { bold: true }
          }
          // Style header row
          else if (row === 6) {
            cell.s.font = { bold: true }
            cell.s.fill = { fgColor: { rgb: 'E5E7EB' } }
          }
          // Style subject rows (parent rows) - check if it's a subject name in first column
          else if (cell.v && cell.v !== '' && ws[`A${row + 1}`] && ws[`A${row + 1}`].v === cell.v && ws[`B${row + 1}`] && ws[`B${row + 1}`].v === '') {
            cell.s.font = { bold: true }
          }
        }
      }
      
      XLSX.utils.book_append_sheet(wb, ws, 'Classes Export')
      
      // Export as Excel file
      const fileName = `classes_export_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)
      
      setShowExportModal(false)
    } catch (error) {
      console.error('Error exporting classes:', error)
      alert('Error exporting classes. Please try again.')
    }
  }

  const handleDeleteScheduledClass = async (scheduledClassId: string) => {
    if (confirm('Are you sure you want to remove this schedule?')) {
      try {
        const success = await ScheduledClassService.deleteScheduledClass(scheduledClassId)
        if (success) {
          await loadClasses()
        }
      } catch (error) {
        console.error('Error deleting scheduled class:', error)
      }
    }
  }

  // Get unique subject names for filtering
  const getUniqueSubjects = () => {
    const subjects = new Set<string>()
    scheduledClasses.forEach(sc => subjects.add(sc.class.subject_name))
    return Array.from(subjects).sort()
  }

  // Filter and sort scheduled classes
  const getFilteredAndSortedScheduledClasses = () => {
    let filtered = scheduledClasses

    // Filter by class/subject
    if (filterByClass) {
      filtered = filtered.filter(sc => sc.class.subject_name === filterByClass)
    }

    // Sort by date or class name
    if (sortOrder === 'date') {
      filtered = filtered.sort((a, b) => 
        new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
      )
    } else {
      filtered = filtered.sort((a, b) => 
        a.class.subject_name.localeCompare(b.class.subject_name)
      )
    }

    return filtered
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div>
      {/* Action Buttons */}
      <div className="mb-6 flex space-x-3">
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center space-x-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Add New Class</span>
        </button>
        
        {classes.length > 0 && (
          <button
            onClick={() => setShowDateAssignmentModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center space-x-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Assign Dates</span>
          </button>
        )}
        
        {classes.length > 0 && (
          <button
            onClick={() => setShowExportModal(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center space-x-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export Classes</span>
          </button>
        )}
      </div>

      {/* Classes List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Classes ({classes.length}) - Scheduled ({scheduledClasses.length})
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Manage subjects and schedules for this section
          </p>
          
          {/* Sub-tabs */}
          <div className="mt-4">
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveSubTab('all')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeSubTab === 'all'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                All Classes
              </button>
              <button
                onClick={() => setActiveSubTab('scheduled')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeSubTab === 'scheduled'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Scheduled Classes
              </button>
            </nav>
          </div>
        </div>
        <div className="p-6">
          {activeSubTab === 'all' ? (
            // All Classes Tab
            classes.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-4">
                  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No classes created</h3>
                <p className="text-gray-500">Click "Add New Class" to create the first class for this section.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {classes.map((classItem) => {
                  const isScheduled = scheduledClasses.some(sc => sc.class_id === classItem.id)
                  return (
                    <div key={classItem.id} className={`flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 ${
                      isScheduled ? 'border-green-200 bg-green-50' : 'border-gray-200'
                    }`}>
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                            isScheduled ? 'bg-green-100' : 'bg-blue-100'
                          }`}>
                            <svg className={`h-5 w-5 ${
                              isScheduled ? 'text-green-600' : 'text-blue-600'
                            }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{classItem.subject_name}</div>
                          <div className="text-sm text-gray-500">
                            {isScheduled ? 'Scheduled' : 'Not scheduled'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleDeleteClass(classItem.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            // Scheduled Classes Tab
            <div>
              {scheduledClasses.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-4">
                    <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No scheduled classes</h3>
                  <p className="text-gray-500">Click "Assign Dates" to schedule classes for this section.</p>
                </div>
              ) : (
                <div>
                  {/* Filter and Sort Controls */}
                  <div className="mb-6 flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Filter by Class
                      </label>
                      <select
                        value={filterByClass}
                        onChange={(e) => setFilterByClass(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">All Classes</option>
                        {getUniqueSubjects().map((subject) => (
                          <option key={subject} value={subject}>
                            {subject}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Sort by
                      </label>
                      <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as 'date' | 'class')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="date">Date</option>
                        <option value="class">Class Name</option>
                      </select>
                    </div>
                  </div>

                  {/* Scheduled Classes List */}
                  <div className="space-y-3">
                    {getFilteredAndSortedScheduledClasses().map((scheduledClass) => (
                      <div key={scheduledClass.id} className="flex items-center justify-between p-4 border border-green-200 rounded-lg bg-green-50 hover:bg-green-100">
                        <div className="flex items-center space-x-4">
                          <div className="flex-shrink-0">
                            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                              <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{scheduledClass.class.subject_name}</div>
                            <div className="text-sm text-green-600">
                              Scheduled: {new Date(scheduledClass.scheduled_date).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                              })} ({new Date(scheduledClass.scheduled_date).toLocaleDateString('en-US', {
                                weekday: 'long'
                              })})
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleDeleteScheduledClass(scheduledClass.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Remove Schedule
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Class Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Add New Class</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddClass} className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newClass.subject_name}
                    onChange={(e) => handleSubjectInputChange(e.target.value)}
                    onBlur={handleSubjectInputBlur}
                    onFocus={() => {
                      if (filteredSubjects.length > 0) {
                        setShowSuggestions(true)
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Type to search subjects (e.g., 'DB' for 'DBMS')"
                    required
                    autoComplete="off"
                  />
                  {loadingSubjects && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
                
                {/* Autocomplete Suggestions */}
                {showSuggestions && filteredSubjects.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredSubjects.slice(0, 10).map((subject, index) => (
                      <div
                        key={index}
                        onClick={() => handleSubjectSelect(subject)}
                        className={`px-3 py-2 cursor-pointer text-sm border-b border-gray-100 last:border-b-0 ${
                          index === selectedSuggestionIndex 
                            ? 'bg-blue-100 text-blue-900' 
                            : 'hover:bg-blue-50 text-gray-900'
                        }`}
                      >
                        <span>{subject}</span>
                      </div>
                    ))}
                    {filteredSubjects.length > 10 && (
                      <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50">
                        Showing first 10 of {filteredSubjects.length} results
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors duration-200"
                >
                  Add Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Date Assignment Modal */}
      <DateAssignmentModal
        isOpen={showDateAssignmentModal}
        onClose={() => setShowDateAssignmentModal(false)}
        onSuccess={() => {
          loadClasses() // Reload classes after successful date assignment
        }}
        dept={dept}
        year={dbYear}
        section={dbSection}
        faculty_id={departmentId}
      />

      {/* Export Classes Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Export Classes</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {dept} - Year {year} - Section {section}
                </p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-4">
                This will export all classes with their scheduled dates in a hierarchical format:
              </p>
              <ul className="text-sm text-gray-600 space-y-1 ml-4">
                <li>• Subject names as parent rows</li>
                <li>• Scheduled dates as child rows under each subject</li>
                <li>• Unscheduled subjects will show "Not Scheduled"</li>
              </ul>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={handleExportClasses}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export Excel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface AttendanceTabProps {
  dept: string
  year: string
  section: string
}

function AttendanceTab({ dept, year, section }: AttendanceTabProps) {
  const [loading, setLoading] = useState(false)
  const [scheduledClasses, setScheduledClasses] = useState<ScheduledClassWithDetails[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [peerTutorAttendance, setPeerTutorAttendance] = useState<any[]>([])
  const [selectedPeerTutor, setSelectedPeerTutor] = useState<any>(null)
  const [studentDetails, setStudentDetails] = useState<any[]>([])
  const [view, setView] = useState<'classes' | 'peer-tutors' | 'students'>('classes')

  // Use raw values directly for database operations
  const dbYear = year
  const dbSection = section

  useEffect(() => {
    loadScheduledClasses()
  }, [dept, dbYear, dbSection])

  const loadScheduledClasses = async () => {
    try {
      setLoading(true)
      console.log('Loading scheduled classes for:', { dept, dbYear, dbSection })
      const classes = await ScheduledClassService.getScheduledClassesByYearSection(dept, dbYear, dbSection)
      
      // Sort classes by date (past to future)
      const sortedClasses = classes.sort((a, b) => {
        const dateA = new Date(a.scheduled_date)
        const dateB = new Date(b.scheduled_date)
        return dateA.getTime() - dateB.getTime()
      })
      
      console.log('Loaded and sorted scheduled classes:', sortedClasses)
      setScheduledClasses(sortedClasses)
    } catch (error) {
      console.error('Error loading scheduled classes:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadPeerTutorAttendance = async (scheduledClassId: string) => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      console.log('Loading peer tutor attendance for scheduled class:', scheduledClassId)
      
      // First, let's see what attendance records exist in the database
      const { data: allAttendance, error: allError } = await supabase
        .from('attendance')
        .select('scheduled_class_id, peer_tutor_id, student_id, status')
        .limit(10)
      
      console.log('All attendance records in database:', allAttendance, 'Error:', allError)
      
      // First try simple query to see if records exist
      const { data: simpleData, error: simpleError } = await supabase
        .from('attendance')
        .select('*')
        .eq('scheduled_class_id', scheduledClassId)
      
      console.log('Simple attendance query result:', simpleData, 'Error:', simpleError)
      
      if (simpleError) {
        console.error('Error in simple query:', simpleError)
      }
      
      // Get attendance records for this scheduled class grouped by peer tutor
      const { data: attendanceData, error } = await supabase
        .from('attendance')
        .select(`
          *,
          peer_tutors(
            id,
            name,
            email
          )
        `)
        .eq('scheduled_class_id', scheduledClassId)

      console.log('Full attendance query result:', attendanceData, 'Error:', error)

      if (error) {
        console.error('Error loading peer tutor attendance:', error)
        return
      }

      // If no records found by scheduled_class_id, try by class_id
      let recordsToProcess = attendanceData || []
      
      if (recordsToProcess.length === 0 && (!simpleData || simpleData.length === 0)) {
        console.log('No records found by scheduled_class_id, trying class_id...')
        
        // Get the class_id from the scheduled class
        const selectedScheduledClass = scheduledClasses.find(sc => sc.id === scheduledClassId)
        if (selectedScheduledClass) {
          console.log('Trying to find attendance by class_id:', selectedScheduledClass.class_id)
          
          const { data: classAttendanceData, error: classError } = await supabase
            .from('attendance')
            .select(`
              *,
              peer_tutors(
                id,
                name,
                email
              )
            `)
            .eq('class_id', selectedScheduledClass.class_id)
          
          console.log('Attendance by class_id result:', classAttendanceData, 'Error:', classError)
          
          if (classAttendanceData && classAttendanceData.length > 0) {
            console.log('Found attendance records by class_id, using those')
            recordsToProcess = classAttendanceData
          }
        }
      }
      
      // If we found records by class_id, use those instead
      if (recordsToProcess.length === 0 && simpleData && simpleData.length > 0) {
        console.log('Using simple data since joined query returned empty')
        recordsToProcess = simpleData
        
        // Fetch peer tutor names separately
        const peerTutorIds = [...new Set(simpleData.map(r => r.peer_tutor_id))]
        const { data: peerTutors } = await supabase
          .from('peer_tutors')
          .select('id, name, email')
          .in('id', peerTutorIds)
        
        console.log('Fetched peer tutors:', peerTutors)
        
        const peerTutorMap = new Map(peerTutors?.map(p => [p.id, p]) || [])
        
        // Group by peer tutor and count present/absent
        const peerTutorAttendanceMap = new Map()
        
        recordsToProcess.forEach(record => {
          const peerTutorId = record.peer_tutor_id
          const peerTutor = peerTutorMap.get(peerTutorId)
          const peerTutorName = peerTutor?.name || 'Unknown Peer Tutor'
          
          if (!peerTutorAttendanceMap.has(peerTutorId)) {
            peerTutorAttendanceMap.set(peerTutorId, {
              peer_tutor_id: peerTutorId,
              peer_tutor_name: peerTutorName,
              peer_tutor_email: peerTutor?.email || 'No email',
              present_count: 0,
              absent_count: 0,
              total_count: 0
            })
          }
          
          const peerTutorData = peerTutorAttendanceMap.get(peerTutorId)
          peerTutorData.total_count++
          
          if (record.status === 'present') {
            peerTutorData.present_count++
          } else {
            peerTutorData.absent_count++
          }
        })

        const peerTutorAttendanceList = Array.from(peerTutorAttendanceMap.values())
        console.log('Peer tutor attendance (with separate queries):', peerTutorAttendanceList)
        setPeerTutorAttendance(peerTutorAttendanceList)
        return
      }

      // Group by peer tutor and count present/absent (for joined query)
      const peerTutorMap = new Map()
      
      recordsToProcess.forEach(record => {
        const peerTutorId = record.peer_tutor_id
        const peerTutorName = record.peer_tutors?.name || 'Unknown Peer Tutor'
        
        if (!peerTutorMap.has(peerTutorId)) {
          peerTutorMap.set(peerTutorId, {
            peer_tutor_id: peerTutorId,
            peer_tutor_name: peerTutorName,
            peer_tutor_email: record.peer_tutors?.email || 'No email',
            present_count: 0,
            absent_count: 0,
            total_count: 0
          })
        }
        
        const peerTutor = peerTutorMap.get(peerTutorId)
        peerTutor.total_count++
        
        if (record.status === 'present') {
          peerTutor.present_count++
        } else {
          peerTutor.absent_count++
        }
      })

      const peerTutorAttendanceList = Array.from(peerTutorMap.values())
      console.log('Peer tutor attendance (with joins):', peerTutorAttendanceList)
      setPeerTutorAttendance(peerTutorAttendanceList)
    } catch (error) {
      console.error('Error loading peer tutor attendance:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleClassSelect = async (scheduledClassId: string) => {
    setSelectedClass(scheduledClassId)
    setView('peer-tutors')
    await loadPeerTutorAttendanceForClass(scheduledClassId)
  }

  const loadPeerTutorAttendanceForClass = async (scheduledClassId: string) => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      console.log('Loading peer tutor attendance for class:', scheduledClassId)
      
      // Get the scheduled class details
      const selectedScheduledClass = scheduledClasses.find(sc => sc.id === scheduledClassId)
      if (!selectedScheduledClass) {
        console.error('Scheduled class not found')
        return
      }

      // Get all scheduled classes for the same class (all peer tutors)
      // Scheduled classes are created per peer tutor for the same class
      const { data: allScheduledClasses, error: scheduledClassError } = await supabase
        .from('scheduled_classes')
        .select(`
          *,
          peer_tutor:peer_tutors(
            id,
            name,
            email
          )
        `)
        .eq('class_id', selectedScheduledClass.class_id)
        .eq('dept', dept)
        .eq('year', dbYear)
        .eq('section', dbSection)
        .eq('scheduled_date', selectedScheduledClass.scheduled_date)

      if (scheduledClassError) {
        console.error('Error loading scheduled classes:', scheduledClassError)
        return
      }

      console.log('All scheduled classes for this class:', allScheduledClasses)

      // For each scheduled class, check if there are any attendance records (student attendance)
      // If the peer tutor marked any student attendance, they were present
      const scheduledClassIds = allScheduledClasses?.map(sc => sc.id) || []
      console.log('Querying attendance for scheduled class IDs:', scheduledClassIds)
      
      const { data: attendanceRecords, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .in('scheduled_class_id', scheduledClassIds)

      if (attendanceError) {
        console.error('Error loading attendance records:', attendanceError)
        return
      }

      console.log('Attendance records found:', attendanceRecords?.length || 0, attendanceRecords)

      // Create a map to track if peer tutor marked attendance (has any student records)
      // Group attendance records by scheduled_class_id
      const attendanceByScheduledClass = new Map()
      if (attendanceRecords && attendanceRecords.length > 0) {
        attendanceRecords.forEach(record => {
          if (record.scheduled_class_id) {
            // If there's at least one attendance record for this scheduled class,
            // it means the peer tutor was present and marked attendance
            if (!attendanceByScheduledClass.has(record.scheduled_class_id)) {
              attendanceByScheduledClass.set(record.scheduled_class_id, 'present')
            }
          }
        })
      }

      console.log('Attendance map by scheduled class:', attendanceByScheduledClass)

      // Process scheduled classes to create peer tutor attendance list
      const peerTutorAttendanceList: any[] = []
      
      if (allScheduledClasses) {
        allScheduledClasses.forEach(scheduledClass => {
          const peerTutor = scheduledClass.peer_tutor
          if (peerTutor) {
            const completionStatus = scheduledClass.completion_status || 'not_started'
            const hasAttendanceRecord = attendanceByScheduledClass.has(scheduledClass.id)
            
            // Determine attendance status:
            // - If class is not completed, show as 'pending'
            // - If completed and has record, use the record status
            // - If completed but no record, default to 'absent'
            let attendanceStatus = 'pending'
            if (completionStatus === 'completed') {
              attendanceStatus = hasAttendanceRecord 
                ? attendanceByScheduledClass.get(scheduledClass.id) 
                : 'absent'
            }
            
            peerTutorAttendanceList.push({
              scheduled_class_id: scheduledClass.id,
              peer_tutor_id: peerTutor.id,
              peer_tutor_name: peerTutor.name,
              peer_tutor_email: peerTutor.email,
              attendance_status: attendanceStatus,
              completion_status: completionStatus,
              present_count: attendanceStatus === 'present' ? 1 : 0,
              absent_count: attendanceStatus === 'absent' ? 1 : 0,
              total_count: 1
            })
          }
        })
      }

      console.log('Peer tutor attendance for class:', peerTutorAttendanceList)
      setPeerTutorAttendance(peerTutorAttendanceList)
      
    } catch (error) {
      console.error('Error loading peer tutor attendance:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStudentDetails = async (scheduledClassId: string, peerTutorId: string) => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      console.log('=== Loading Student Details ===')
      console.log('Scheduled Class ID:', scheduledClassId)
      console.log('Peer Tutor ID:', peerTutorId)
      
      // Check the scheduled class details first
      const { data: scheduledClassData } = await supabase
        .from('scheduled_classes')
        .select('*')
        .eq('id', scheduledClassId)
        .single()
      
      console.log('Scheduled Class Details:', scheduledClassData)
      
      // First, let's check if there are ANY attendance records for this scheduled class
      const { data: allRecords, error: allError } = await supabase
        .from('attendance')
        .select('*')
        .eq('scheduled_class_id', scheduledClassId)
      
      console.log('ALL attendance records for this scheduled class:', allRecords?.length || 0, allRecords)
      
      // Now check specifically for this peer tutor
      const { data: simpleData, error: simpleError } = await supabase
        .from('attendance')
        .select('*')
        .eq('scheduled_class_id', scheduledClassId)
        .eq('peer_tutor_id', peerTutorId)
      
      console.log('Attendance records for this peer tutor:', simpleData?.length || 0, simpleData)
      console.log('Error (if any):', simpleError)
      
      // Also check if there are ANY attendance records for this peer tutor (regardless of scheduled_class_id)
      const { data: peerTutorRecords } = await supabase
        .from('attendance')
        .select('*, scheduled_classes(scheduled_date, class_id)')
        .eq('peer_tutor_id', peerTutorId)
        .order('created_at', { ascending: false })
        .limit(10)
      
      console.log('Recent attendance records for this peer tutor (any scheduled class):', peerTutorRecords)
      
      // Get student details for this peer tutor and scheduled class
      const { data: attendanceData, error } = await supabase
        .from('attendance')
        .select(`
          *,
          peer_students(
            id,
            name,
            email
          )
        `)
        .eq('scheduled_class_id', scheduledClassId)
        .eq('peer_tutor_id', peerTutorId)

      console.log('Full student query result:', attendanceData, 'Error:', error)

      if (error) {
        console.error('Error loading student details:', error)
        return
      }

      // Use simple data if joined query fails
      let recordsToProcess = attendanceData || []
      if (recordsToProcess.length === 0 && simpleData && simpleData.length > 0) {
        console.log('Using simple data for students since joined query returned empty')
        recordsToProcess = simpleData
        
        // Fetch student names separately
        const studentIds = [...new Set(simpleData.map(r => r.student_id))]
        const { data: students } = await supabase
          .from('peer_students')
          .select('id, name, email')
          .in('id', studentIds)
        
        console.log('Fetched students:', students)
        
        const studentMap = new Map(students?.map(s => [s.id, s]) || [])
        
        const studentDetails = recordsToProcess.map(record => {
          const student = studentMap.get(record.student_id)
          return {
            student_id: record.student_id,
            student_name: student?.name || 'Unknown Student',
            student_email: student?.email || 'No email',
            status: record.status,
            created_at: record.created_at
          }
        })
        
        console.log('Student details (with separate queries):', studentDetails)
        setStudentDetails(studentDetails)
        return
      }

      const studentDetails = recordsToProcess.map(record => ({
        student_id: record.student_id,
        student_name: record.peer_students?.name || 'Unknown Student',
        student_email: record.peer_students?.email || 'No email',
        status: record.status,
        created_at: record.created_at
      }))

      console.log('Student details (with joins):', studentDetails)
      setStudentDetails(studentDetails)
    } catch (error) {
      console.error('Error loading student details:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePeerTutorClick = async (peerTutor: any) => {
    setSelectedPeerTutor(peerTutor)
    setView('students')
    // Use the peer tutor's specific scheduled class ID
    await loadStudentDetails(peerTutor.scheduled_class_id, peerTutor.peer_tutor_id)
  }

  const handleBackToClasses = () => {
    setView('classes')
    setSelectedClass('')
    setPeerTutorAttendance([])
  }

  const handleBackToPeerTutors = () => {
    setView('peer-tutors')
    setSelectedPeerTutor(null)
    setStudentDetails([])
  }

  const handleExportClassAttendance = async () => {
    try {
      const selectedScheduledClass = scheduledClasses.find(sc => sc.id === selectedClass)
      if (!selectedScheduledClass) {
        alert('Please select a class first')
        return
      }

      const wb = XLSX.utils.book_new()
      const supabase = createClient()

      // Filter peer tutors by attendance status
      const presentPeerTutors = peerTutorAttendance.filter(pt => pt.attendance_status === 'present')
      const absentPeerTutors = peerTutorAttendance.filter(pt => pt.attendance_status === 'absent')

      // Sheet 1: Present Peer Tutors with Student Attendance
      if (presentPeerTutors.length > 0) {
        const presentDataWithStudents: any[] = []

        for (const pt of presentPeerTutors) {
          // Get student attendance for this peer tutor
          const { data: studentAttendance } = await supabase
            .from('attendance')
            .select(`
              *,
              peer_students(name, email)
            `)
            .eq('scheduled_class_id', pt.scheduled_class_id)
            .eq('peer_tutor_id', pt.peer_tutor_id)

          if (studentAttendance && studentAttendance.length > 0) {
            // Add each student attendance record
            studentAttendance.forEach(record => {
              presentDataWithStudents.push({
                'Peer Tutor Name': pt.peer_tutor_name,
                'Peer Tutor Email': pt.peer_tutor_email,
                'Student Name': record.peer_students?.name || 'Unknown',
                'Student Email': record.peer_students?.email || 'Unknown',
                'Student Status': record.status === 'present' ? 'Present' : 'Absent',
                'Subject': selectedScheduledClass.class?.subject_name || 'Unknown',
                'Date': new Date(selectedScheduledClass.scheduled_date).toLocaleDateString('en-GB'),
                'Department': dept,
                'Year': year,
                'Section': section,
                'Peer Tutor Status': 'Present'
              })
            })
          } else {
            // If no student records, just add peer tutor row
            presentDataWithStudents.push({
              'Peer Tutor Name': pt.peer_tutor_name,
              'Peer Tutor Email': pt.peer_tutor_email,
              'Student Name': 'No student records',
              'Student Email': '-',
              'Student Status': '-',
              'Subject': selectedScheduledClass.class?.subject_name || 'Unknown',
              'Date': new Date(selectedScheduledClass.scheduled_date).toLocaleDateString('en-GB'),
              'Department': dept,
              'Year': year,
              'Section': section,
              'Peer Tutor Status': 'Present'
            })
          }
        }

        const presentWs = XLSX.utils.json_to_sheet(presentDataWithStudents)
        XLSX.utils.book_append_sheet(wb, presentWs, 'Present - With Students')
      }

      // Sheet 2: Absent Peer Tutors
      if (absentPeerTutors.length > 0) {
        const absentData = absentPeerTutors.map(pt => ({
          'Peer Tutor Name': pt.peer_tutor_name,
          'Peer Tutor Email': pt.peer_tutor_email,
          'Subject': selectedScheduledClass.class?.subject_name || 'Unknown',
          'Date': new Date(selectedScheduledClass.scheduled_date).toLocaleDateString('en-GB'),
          'Department': dept,
          'Year': year,
          'Section': section,
          'Status': 'Absent',
          'Completion Status': pt.completion_status
        }))
        const absentWs = XLSX.utils.json_to_sheet(absentData)
        XLSX.utils.book_append_sheet(wb, absentWs, 'Absent Peer Tutors')
      }

      // Sheet 3: Summary
      const summaryData = [{
        'Subject': selectedScheduledClass.class?.subject_name || 'Unknown',
        'Date': new Date(selectedScheduledClass.scheduled_date).toLocaleDateString('en-GB'),
        'Total Peer Tutors': peerTutorAttendance.length,
        'Present': presentPeerTutors.length,
        'Absent': absentPeerTutors.length,
        'Pending': peerTutorAttendance.filter(pt => pt.attendance_status === 'pending').length
      }]
      const summaryWs = XLSX.utils.json_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

      // Save file
      const fileName = `attendance_${selectedScheduledClass.class?.subject_name}_${new Date(selectedScheduledClass.scheduled_date).toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)
    } catch (error) {
      console.error('Error exporting attendance:', error)
      alert('Failed to export attendance. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const handleExportAllAttendance = async () => {
    try {
      const wb = XLSX.utils.book_new()
      const allAttendanceData: any[] = []

      for (const scheduledClass of scheduledClasses) {
        const supabase = createClient()
        const { data: allScheduledClasses } = await supabase
          .from('scheduled_classes')
          .select(`
            *,
            peer_tutor:peer_tutors(id, name, email)
          `)
          .eq('class_id', scheduledClass.class_id)
          .eq('dept', dept)
          .eq('year', dbYear)
          .eq('section', dbSection)
          .eq('scheduled_date', scheduledClass.scheduled_date)

        if (allScheduledClasses) {
          const scheduledClassIds = allScheduledClasses.map(sc => sc.id)
          const { data: attendanceRecords } = await supabase
            .from('attendance')
            .select('*')
            .in('scheduled_class_id', scheduledClassIds)

          const attendanceByScheduledClass = new Map()
          if (attendanceRecords && attendanceRecords.length > 0) {
            attendanceRecords.forEach(record => {
              if (record.scheduled_class_id) {
                attendanceByScheduledClass.set(record.scheduled_class_id, 'present')
              }
            })
          }

          allScheduledClasses.forEach(sc => {
            const peerTutor = sc.peer_tutor
            if (peerTutor) {
              const completionStatus = sc.completion_status || 'not_started'
              const hasAttendanceRecord = attendanceByScheduledClass.has(sc.id)
              let attendanceStatus = 'pending'
              
              if (completionStatus === 'completed') {
                attendanceStatus = hasAttendanceRecord ? 'present' : 'absent'
              }

              allAttendanceData.push({
                'Subject': scheduledClass.class?.subject_name || 'Unknown',
                'Date': new Date(scheduledClass.scheduled_date).toLocaleDateString('en-GB'),
                'Peer Tutor Name': peerTutor.name,
                'Peer Tutor Email': peerTutor.email,
                'Attendance Status': attendanceStatus.charAt(0).toUpperCase() + attendanceStatus.slice(1),
                'Completion Status': completionStatus,
                'Department': dept,
                'Year': year,
                'Section': section
              })
            }
          })
        }
      }

      const ws = XLSX.utils.json_to_sheet(allAttendanceData)
      XLSX.utils.book_append_sheet(wb, ws, 'All Attendance')
      XLSX.writeFile(wb, `all_attendance_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (error) {
      console.error('Error exporting all attendance:', error)
      alert('Failed to export all attendance. Please try again.')
    }
  }

  // Classes View
  if (view === 'classes') {
    return (
      <div>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Scheduled Classes</h3>
            <p className="text-xs sm:text-sm text-gray-600">
            Click on a class to view attendance records by peer tutor
          </p>
          </div>
          
          {scheduledClasses.length > 0 && (
            <button
              onClick={handleExportAllAttendance}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">Export All Attendance</span>
              <span className="sm:hidden">Export</span>
            </button>
          )}
        </div>

        {scheduledClasses.length > 0 ? (
          <div className="space-y-3 sm:space-y-4">
            {scheduledClasses.map((scheduledClass) => (
              <div
                key={scheduledClass.id}
                onClick={() => handleClassSelect(scheduledClass.id)}
                className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 hover:border-blue-300 hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base sm:text-lg font-medium text-gray-900 mb-2 truncate">
                      {scheduledClass.class.subject_name}
                    </h4>
                    <div className="text-xs sm:text-sm text-gray-600 space-y-1">
                      <div>
                        <span className="font-medium">Date:</span> {new Date(scheduledClass.scheduled_date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          weekday: 'short'
                        })}
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <span><span className="font-medium">Dept:</span> {scheduledClass.dept}</span>
                        <span>|</span>
                        <span><span className="font-medium">Year:</span> {scheduledClass.year}</span>
                        <span>|</span>
                        <span><span className="font-medium">Sec:</span> {scheduledClass.section}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No scheduled classes found</h3>
            <p className="text-sm text-gray-500 mb-4 px-4">No classes have been scheduled for this section yet.</p>
            <p className="text-xs sm:text-sm text-gray-400">Go to the Classes tab to schedule classes first.</p>
          </div>
        )}
      </div>
    )
  }

  // Peer Tutors View
  if (view === 'peer-tutors') {
    const selectedScheduledClass = scheduledClasses.find(sc => sc.id === selectedClass)
    
    return (
      <div>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <button
              onClick={handleBackToClasses}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm sm:text-base lg:text-lg font-medium text-gray-900 truncate">
                {selectedScheduledClass?.class.subject_name} - Peer Tutor Attendance
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                <span className="font-medium">Date:</span> {selectedScheduledClass && new Date(selectedScheduledClass.scheduled_date).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  weekday: 'short'
                })}
              </p>
            </div>
          </div>
          
          {/* Export Button */}
          <button
            onClick={handleExportClassAttendance}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="hidden sm:inline">Export Attendance</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>

        {peerTutorAttendance.length > 0 ? (
          <>
            {/* Mobile Card View */}
            <div className="block lg:hidden space-y-3">
              {peerTutorAttendance.map((peerTutor) => (
                <div
                  key={peerTutor.peer_tutor_id}
                  onClick={() => handlePeerTutorClick(peerTutor)}
                  className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-blue-600">
                          {peerTutor.peer_tutor_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-gray-900 truncate">{peerTutor.peer_tutor_name}</h4>
                        <p className="text-xs text-gray-600 truncate">{peerTutor.peer_tutor_email}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        peerTutor.attendance_status === 'present' 
                          ? 'bg-green-100 text-green-800' 
                          : peerTutor.attendance_status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {peerTutor.attendance_status === 'present' ? 'Present' : peerTutor.attendance_status === 'pending' ? 'Pending' : 'Absent'}
                      </span>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePeerTutorClick(peerTutor)
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors duration-200"
                    >
                      View Student Details
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h4 className="text-md font-medium text-gray-900">Peer Tutor Attendance Summary</h4>
              <p className="text-sm text-gray-600 mt-1">
                {peerTutorAttendance.length} peer tutors
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Peer Tutor Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Attendance Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {peerTutorAttendance.map((peerTutor) => (
                    <tr key={peerTutor.peer_tutor_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handlePeerTutorClick(peerTutor)}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                            <span className="text-sm font-medium text-blue-600">
                              {peerTutor.peer_tutor_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-gray-900">
                            {peerTutor.peer_tutor_name}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{peerTutor.peer_tutor_email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          peerTutor.attendance_status === 'present' 
                            ? 'bg-green-100 text-green-800' 
                            : peerTutor.attendance_status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {peerTutor.attendance_status === 'present' ? 'Present' : peerTutor.attendance_status === 'pending' ? 'Pending' : 'Absent'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePeerTutorClick(peerTutor)
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-xs font-medium transition-colors duration-200"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No attendance records found</h3>
            <p className="text-sm text-gray-500 px-4">No attendance has been marked for this class yet.</p>
          </div>
        )}
      </div>
    )
  }

  // Students Popup View
  if (view === 'students') {
    // Use the peer tutor's specific scheduled class ID
    const selectedScheduledClass = scheduledClasses.find(sc => sc.id === selectedPeerTutor?.scheduled_class_id)
    
    return (
      <div>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={handleBackToPeerTutors}></div>
        
        {/* Popup */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBackToPeerTutors}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm sm:text-base lg:text-lg font-medium text-gray-900 truncate">
                    {selectedPeerTutor?.peer_tutor_name} - Student Details
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    {selectedScheduledClass?.class.subject_name} | 
                    <span className="font-medium"> Date:</span> {selectedScheduledClass && new Date(selectedScheduledClass.scheduled_date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      weekday: 'short'
                    })}
                  </p>
                  <div className="mt-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      selectedPeerTutor?.attendance_status === 'present' 
                        ? 'bg-green-100 text-green-800' 
                        : selectedPeerTutor?.attendance_status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      Peer Tutor: {selectedPeerTutor?.attendance_status === 'present' ? 'Present' : selectedPeerTutor?.attendance_status === 'pending' ? 'Pending' : 'Absent'}
                    </span>
                </div>
              </div>
              <button
                onClick={handleBackToPeerTutors}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors duration-200"
              >
                  <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-150px)] sm:max-h-[calc(90vh-120px)]">
              {studentDetails.length > 0 ? (
                <>
                  {/* Mobile Card View */}
                  <div className="block lg:hidden space-y-3">
                    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Student Attendance Details</h4>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="text-gray-600">{studentDetails.length} students</span>
                        <span>|</span>
                        <span className="text-green-600 font-medium">
                          {studentDetails.filter(s => s.status === 'present').length} Present
                        </span>
                        <span>|</span>
                        <span className="text-red-600 font-medium">
                          {studentDetails.filter(s => s.status === 'absent').length} Absent
                        </span>
                      </div>
                    </div>
                    
                    {studentDetails.map((student) => (
                      <div key={student.student_id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className={`px-4 py-3 border-b border-gray-200 ${
                          student.status === 'present' ? 'bg-green-50' : 'bg-red-50'
                        }`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                              student.status === 'present' ? 'bg-green-100' : 'bg-red-100'
                            }`}>
                              <span className={`text-sm font-medium ${
                                student.status === 'present' ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {student.student_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-semibold text-gray-900 truncate">{student.student_name}</h4>
                              <p className="text-xs text-gray-600 truncate">{student.student_email}</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-500">Status</span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              student.status === 'present' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {student.status === 'present' ? 'Present' : 'Absent'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-medium text-gray-500">Recorded At</span>
                            <div className="text-right">
                              <div className="text-gray-900">
                                {student.created_at ? new Date(student.created_at).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric'
                                }) : 'N/A'}
                              </div>
                              <div className="text-gray-500">
                                {student.created_at ? new Date(student.created_at).toLocaleTimeString() : 'N/A'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden lg:block bg-white rounded-lg border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h4 className="text-md font-medium text-gray-900">Student Attendance Details</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {studentDetails.length} students | 
                      <span className="text-green-600 font-medium ml-1">
                        {studentDetails.filter(s => s.status === 'present').length} Present
                      </span>
                      <span className="text-red-600 font-medium ml-2">
                        {studentDetails.filter(s => s.status === 'absent').length} Absent
                      </span>
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Student Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Email
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Recorded At
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {studentDetails.map((student) => (
                          <tr key={student.student_id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                                  student.status === 'present' ? 'bg-green-100' : 'bg-red-100'
                                }`}>
                                  <span className={`text-sm font-medium ${
                                    student.status === 'present' ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {student.student_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                                  </span>
                                </div>
                                <div className="text-sm font-medium text-gray-900">
                                  {student.student_name}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{student.student_email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                student.status === 'present' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {student.status === 'present' ? 'Present' : 'Absent'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {student.created_at ? new Date(student.created_at).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric'
                                }) : 'N/A'}
                              </div>
                              <div className="text-sm text-gray-500">
                                {student.created_at ? new Date(student.created_at).toLocaleTimeString() : 'N/A'}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No student records found</h3>
                <p className="text-sm text-gray-500 px-4">No attendance has been marked for this peer tutor yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}

interface ExamTabProps {
  dept: string
  year: string
  section: string
}

function ExamTab({ dept, year, section }: ExamTabProps) {
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [selectedExamType, setSelectedExamType] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])
  const [peerTutors, setPeerTutors] = useState<PeerTutor[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [examRequests, setExamRequests] = useState<any[]>([])
  const [selectedExam, setSelectedExam] = useState<any>(null)
  const [examDetails, setExamDetails] = useState<any[]>([])
  const [view, setView] = useState<'list' | 'create' | 'details'>('list')

  // Use raw values directly for database operations
  const dbYear = year
  const dbSection = section

  const allExamTypes = [
    { value: 'cie-1', label: 'CIE - 1' },
    { value: 'cie-2', label: 'CIE - 2' },
    { value: 'cie-3', label: 'CIE - 3' },
    { value: 'semester', label: 'Semester' }
  ]

  // Filter out exam types that already exist
  const availableExamTypes = allExamTypes.filter(examType => 
    !examRequests.some(request => request.exam_type === examType.value)
  )

  useEffect(() => {
    loadData()
  }, [dept, dbYear, dbSection])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Load subjects from classes
      const classes = await ClassService.getClassesByYearSection(dept, dbYear, dbSection)
      const subjectNames = classes.map(cls => cls.subject_name)
      const uniqueSubjects = [...new Set(subjectNames)]
      setAvailableSubjects(uniqueSubjects)
      setSubjects(uniqueSubjects) // Auto-populate subjects

      // Load peer tutors for this section
      const tutors = await PeerTutorService.getPeerTutorsBySection(dept, dbYear, dbSection)
      setPeerTutors(tutors)

      // Load students for this section
      const sectionStudents = await StudentService.getStudentsBySection(dept, dbYear, dbSection)
      setStudents(sectionStudents)

      // Load exam requests for this section
      const requests = await ExamMarksService.getExamTypesForSection(dept, dbYear, dbSection)
      setExamRequests(requests)
    } catch (error) {
      console.error('Error loading exam data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSendExam = async () => {
    if (!selectedExamType) {
      alert('Please select an exam type.')
      return
    }

    if (subjects.length === 0) {
      alert('Please add at least one subject.')
      return
    }

    if (peerTutors.length === 0) {
      alert('No peer tutors found for this section. Please assign peer tutors first.')
      return
    }

    if (students.length === 0) {
      alert('No students found for this section.')
      return
    }

    setSending(true)
    try {
      // Create exam marks for all peer tutors and their assigned students
      const allMarksToSave = []
      
      console.log('Starting exam creation process...')
      console.log('Peer tutors:', peerTutors)
      console.log('Subjects:', subjects)
      console.log('Selected exam type:', selectedExamType)

      for (const peerTutor of peerTutors) {
        console.log(`Processing peer tutor: ${peerTutor.name} (${peerTutor.id})`)
        
        // Validate peer tutor data
        if (!peerTutor.id) {
          console.error('Invalid peer tutor data:', peerTutor)
          alert(`Invalid peer tutor data for ${peerTutor.name}. Please check the data.`)
          return
        }

        // Get assigned students for this peer tutor
        const assignedStudents = await AssignmentService.getStudentsByPeerTutor(peerTutor.id)
        console.log(`Assigned students for ${peerTutor.name}:`, assignedStudents)
        
        // Create marks for each assigned student and subject
        for (const student of assignedStudents) {
          // Validate student data
          if (!student.id) {
            console.error('Invalid student data:', student)
            alert(`Invalid student data for ${student.name}. Please check the data.`)
            return
          }

          for (const subject of subjects) {
            // Validate subject data
            if (!subject || subject.trim() === '') {
              console.error('Invalid subject:', subject)
              alert(`Invalid subject: "${subject}". Please check the subjects.`)
              return
            }

            allMarksToSave.push({
              peer_tutor_id: peerTutor.id,
              student_id: student.id,
              subject_name: subject.trim(),
              marks: 0 // Default to 0, peer tutors can update later
            })
          }
        }
      }

      console.log('Total marks to save:', allMarksToSave.length)
      console.log('Sample marks data:', allMarksToSave.slice(0, 3))

      if (allMarksToSave.length === 0) {
        alert('No student assignments found. Please assign students to peer tutors first.')
        return
      }

      // Validate all marks before sending
      const invalidMarks = allMarksToSave.filter(mark => 
        !mark.peer_tutor_id || 
        !mark.student_id || 
        !mark.subject_name || 
        typeof mark.marks !== 'number'
      )

      if (invalidMarks.length > 0) {
        console.error('Invalid marks found:', invalidMarks)
        alert('Some marks data is invalid. Please check the console for details.')
        return
      }

      // Check if the exam_marks table exists before attempting to save
      const tableExists = await ExamMarksService.checkTableExists()
      if (!tableExists) {
        alert(`The exam_marks table does not exist in the database. 

Please run the following SQL script in your Supabase SQL editor:

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Run the create_exam_marks_table.sql script

This will create the necessary table for storing exam marks.`)
        return
      }

      const success = await ExamMarksService.saveMarks(selectedExamType, allMarksToSave)
      if (success) {
        alert(`Exam "${availableExamTypes.find(t => t.value === selectedExamType)?.label}" sent successfully to all peer tutors and students!`)
        setSelectedExamType('')
        setSubjects(availableSubjects) // Reset to all available subjects
        
        // Reload exam requests and go back to list view
        await loadData()
        setView('list')
      } else {
        alert('Failed to send exam. Please check the console for error details and try again.')
      }
    } catch (error) {
      console.error('Error sending exam:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`An error occurred while sending the exam: ${errorMessage}`)
    } finally {
      setSending(false)
    }
  }

  const handleAddSubject = () => {
    const newSubject = prompt('Enter subject name:')
    if (newSubject && newSubject.trim() && !subjects.includes(newSubject.trim())) {
      setSubjects([...subjects, newSubject.trim()])
    }
  }

  const handleRemoveSubject = (subject: string) => {
    setSubjects(subjects.filter(s => s !== subject))
  }

  const handleExamSelect = async (exam: any) => {
    console.log('handleExamSelect called with exam:', exam)
    console.log('Parameters being passed:', {
      examType: exam.exam_type,
      dept,
      dbYear,
      dbSection
    })
    
    setSelectedExam(exam)
    setView('details')
    
    try {
      setLoading(true)
      const details = await ExamMarksService.getExamDetailsForSection(exam.exam_type, dept, dbYear, dbSection)
      console.log('Exam details received:', details)
      setExamDetails(details)
    } catch (error) {
      console.error('Error loading exam details:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Error loading exam details: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  const handleBackToList = () => {
    setView('list')
    setSelectedExam(null)
    setExamDetails([])
  }

  const handleCreateNew = () => {
    setView('create')
    setSelectedExamType('')
    setSubjects(availableSubjects)
  }

  const handleExportAllExams = async () => {
    try {
      const wb = XLSX.utils.book_new()

      for (const exam of examRequests) {
        const details = await ExamMarksService.getExamDetailsForSection(exam.exam_type, dept, dbYear, dbSection)
        const examData: any[] = []

        details.forEach(tutorData => {
          tutorData.students.forEach((student: any) => {
            const rowData: any = {
              'Exam Type': exam.exam_name,
              'Peer Tutor': tutorData.peer_tutor.name,
              'Peer Tutor Email': tutorData.peer_tutor.email,
              'Student Name': student.name,
              'Student Email': student.email
            }

            // Add each subject as a column
            exam.subjects.forEach((subject: string) => {
              rowData[subject] = student.marks[subject] || 'Pending'
            })

            examData.push(rowData)
          })
        })

        if (examData.length > 0) {
          const ws = XLSX.utils.json_to_sheet(examData)
          XLSX.utils.book_append_sheet(wb, ws, exam.exam_name)
        }
      }

      XLSX.writeFile(wb, `all_exams_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (error) {
      console.error('Error exporting all exams:', error)
      alert('Failed to export all exams. Please try again.')
    }
  }

  const handleExportExamDetails = async () => {
    try {
      if (!selectedExam) return

      const wb = XLSX.utils.book_new()

      // Summary Sheet
      const summaryData = [{
        'Exam Type': selectedExam.exam_name,
        'Total Peer Tutors': examDetails.length,
        'Total Students': examDetails.reduce((sum, td) => sum + td.students.length, 0),
        'Subjects': selectedExam.subjects.join(', '),
        'Department': dept,
        'Year': year,
        'Section': section,
        'Created': new Date(selectedExam.created_at).toLocaleDateString('en-GB')
      }]
      const summaryWs = XLSX.utils.json_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

      // Create a sheet for each peer tutor with their students' marks
      examDetails.forEach(tutorData => {
        const tutorSheetData: any[] = []

        tutorData.students.forEach((student: any) => {
          const rowData: any = {
            'Student Name': student.name,
            'Student Email': student.email
          }

          // Add each subject as a column with marks
          selectedExam.subjects.forEach((subject: string) => {
            rowData[subject] = student.marks[subject] || 'Pending'
          })

          tutorSheetData.push(rowData)
        })

        if (tutorSheetData.length > 0) {
          const ws = XLSX.utils.json_to_sheet(tutorSheetData)
          // Sheet name limited to 31 characters
          const sheetName = tutorData.peer_tutor.name.substring(0, 31)
          XLSX.utils.book_append_sheet(wb, ws, sheetName)
        }
      })

      // All Data Combined Sheet
      const allData: any[] = []
      examDetails.forEach(tutorData => {
        tutorData.students.forEach((student: any) => {
          const rowData: any = {
            'Peer Tutor': tutorData.peer_tutor.name,
            'Peer Tutor Email': tutorData.peer_tutor.email,
            'Student Name': student.name,
            'Student Email': student.email
          }

          selectedExam.subjects.forEach((subject: string) => {
            rowData[subject] = student.marks[subject] || 'Pending'
          })

          allData.push(rowData)
        })
      })

      if (allData.length > 0) {
        const allDataWs = XLSX.utils.json_to_sheet(allData)
        XLSX.utils.book_append_sheet(wb, allDataWs, 'All Students Combined')
      }

      const fileName = `exam_${selectedExam.exam_name}_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)
    } catch (error) {
      console.error('Error exporting exam details:', error)
      alert('Failed to export exam details. Please try again.')
    }
  }

  const handleDeleteExam = async (examType: string, examName: string) => {
    // Show confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete the "${examName}" exam?\n\nThis will permanently delete all marks for this exam type for all students. This action cannot be undone.`
    )

    if (!confirmed) return

    setSending(true)
    try {
      const success = await ExamMarksService.deleteExamTypeForSection(examType, dept, dbYear, dbSection)
      if (success) {
        alert(`"${examName}" exam deleted successfully!`)
        // Reload exam requests and go back to list view
        await loadData()
        setView('list')
        setSelectedExam(null)
        setExamDetails([])
      } else {
        alert('Failed to delete exam. Please try again.')
      }
    } catch (error) {
      console.error('Error deleting exam:', error)
      alert('An error occurred while deleting the exam.')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // List View
  if (view === 'list') {
    return (
      <div>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Exam Requests</h3>
            <p className="text-xs sm:text-sm text-gray-600">
              View and manage exam requests sent to this section
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            {examRequests.length > 0 && (
              <button
                onClick={handleExportAllExams}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden sm:inline">Export All Exams</span>
                <span className="sm:hidden">Export</span>
              </button>
            )}
          <button
            onClick={handleCreateNew}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2 flex-shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Create New Exam</span>
          </button>
          </div>
        </div>

        {examRequests.length > 0 ? (
          <div className="space-y-3 sm:space-y-4">
            {examRequests.map((exam) => (
              <div
                key={exam.exam_type}
                onClick={() => handleExamSelect(exam)}
                className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 hover:border-blue-300 hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base sm:text-lg font-medium text-gray-900 mb-2 truncate">{exam.exam_name}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Subjects:</span> {exam.subjects.length}
                      </div>
                      <div>
                        <span className="font-medium">Peer Tutors:</span> {exam.peer_tutors.length}
                      </div>
                      <div>
                        <span className="font-medium">Total Students:</span> {exam.total_students}
                      </div>
                    </div>
                    <div className="mt-2">
                      <span className="text-xs text-gray-500">
                        Created: {new Date(exam.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No exam requests yet</h3>
            <p className="text-sm text-gray-500 mb-4 px-4">Create your first exam request to get started.</p>
            <button
              onClick={handleCreateNew}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
            >
              Create First Exam
            </button>
          </div>
        )}
      </div>
    )
  }

  // Details View
  if (view === 'details' && selectedExam) {
    return (
      <div>
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <button
              onClick={handleBackToList}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-medium text-gray-900 truncate">{selectedExam.exam_name}</h3>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Peer tutors and student marks for this exam
              </p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleExportExamDetails}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">Export Exam Data</span>
              <span className="sm:hidden">Export</span>
            </button>
          <button
            onClick={() => handleDeleteExam(selectedExam.exam_type, selectedExam.exam_name)}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2 flex-shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
              <span className="hidden sm:inline">Delete Exam</span>
              <span className="sm:hidden">Delete</span>
          </button>
          </div>
        </div>

        {examDetails.length > 0 ? (
          <div>
            {/* Status Summary */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
              <h4 className="text-sm sm:text-md font-medium text-gray-900 mb-4">Exam Status Summary</h4>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {(() => {
                  let totalStudents = 0
                  let totalMarks = 0
                  let pendingMarks = 0
                  let completedMarks = 0
                  
                  examDetails.forEach(tutorData => {
                    tutorData.students.forEach((student: any) => {
                      totalStudents++
                      selectedExam.subjects.forEach((subject: string) => {
                        totalMarks++
                        const mark = student.marks[subject]
                        if (!mark || mark === '' || mark === '0') {
                          pendingMarks++
                        } else {
                          completedMarks++
                        }
                      })
                    })
                  })
                  
                  return (
                    <>
                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <div className="text-xl sm:text-2xl font-bold text-blue-600">{totalStudents}</div>
                        <div className="text-xs sm:text-sm text-gray-600 mt-1">Total Students</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <div className="text-xl sm:text-2xl font-bold text-green-600">{completedMarks}</div>
                        <div className="text-xs sm:text-sm text-gray-600 mt-1">Completed Marks</div>
                      </div>
                      <div className="text-center p-3 bg-orange-50 rounded-lg">
                        <div className="text-xl sm:text-2xl font-bold text-orange-600">{pendingMarks}</div>
                        <div className="text-xs sm:text-sm text-gray-600 mt-1">Pending Marks</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-xl sm:text-2xl font-bold text-gray-600">{totalMarks}</div>
                        <div className="text-xs sm:text-sm text-gray-600 mt-1">Total Marks</div>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>

            {/* Peer Tutor Details */}
            <div className="space-y-4 sm:space-y-6">
              {examDetails.map((tutorData) => (
                <div key={tutorData.peer_tutor.id} className="bg-white rounded-lg border border-gray-200">
                  <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-blue-600">
                          {tutorData.peer_tutor.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                        </span>
                      </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-base sm:text-lg font-medium text-gray-900 truncate">{tutorData.peer_tutor.name}</h4>
                          <p className="text-xs sm:text-sm text-gray-500 truncate">{tutorData.peer_tutor.email}</p>
                      </div>
                    </div>
                      <div className="flex-shrink-0">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {tutorData.students.length} {tutorData.students.length === 1 ? 'student' : 'students'}
                      </span>
                    </div>
                  </div>
                </div>
                
                  {/* Mobile Card View */}
                  <div className="block lg:hidden p-4">
                    <div className="space-y-3">
                      {tutorData.students.map((student: any) => (
                        <div key={student.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 border-b border-gray-200">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <span className="text-sm font-medium text-green-600">
                                  {(student.name || 'Unknown').split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h5 className="text-sm font-semibold text-gray-900 truncate">{student.name || 'Unknown Student'}</h5>
                                <p className="text-xs text-gray-600 truncate">{student.email || 'No email'}</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="p-4 space-y-2">
                            {selectedExam.subjects.map((subject: string) => {
                              const mark = student.marks[subject]
                              const isCIE = selectedExam.exam_type.toLowerCase().includes('cie')
                              const isSEM = selectedExam.exam_type.toLowerCase().includes('sem')
                              const isPending = !mark || mark === '' || mark === '0'
                              
                              return (
                                <div key={subject} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{subject}</span>
                                  <div>
                                    {isPending ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                        Pending
                                      </span>
                                    ) : isCIE ? (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        parseInt(mark) >= 40 ? 'bg-green-100 text-green-800' : 
                                        parseInt(mark) >= 25 ? 'bg-yellow-100 text-yellow-800' : 
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        {mark}
                                      </span>
                                    ) : isSEM ? (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        mark === 'pass' ? 'bg-green-100 text-green-800' :
                                        mark === 'fail' ? 'bg-red-100 text-red-800' :
                                        mark === 'absent' ? 'bg-gray-100 text-gray-800' :
                                        mark === 'retest' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-blue-100 text-blue-800'
                                      }`}>
                                        {mark}
                                      </span>
                                    ) : (
                                      <span className="text-sm font-medium text-gray-900">{mark}</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden lg:block p-6">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Student Name
                          </th>
                          {selectedExam.subjects.map((subject: string) => (
                            <th key={subject} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {subject}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {tutorData.students.map((student: any) => (
                          <tr key={student.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                                  <span className="text-sm font-medium text-green-600">
                                    {(student.name || 'Unknown').split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {student.name || 'Unknown Student'}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {student.email || 'No email'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            {selectedExam.subjects.map((subject: string) => {
                              const mark = student.marks[subject]
                              const isCIE = selectedExam.exam_type.toLowerCase().includes('cie')
                              const isSEM = selectedExam.exam_type.toLowerCase().includes('sem')
                              
                              // Check if mark is pending (not assigned yet)
                              const isPending = !mark || mark === '' || mark === '0'
                              
                              return (
                                <td key={subject} className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center space-x-2">
                                    {isPending ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                        Pending
                                      </span>
                                    ) : isCIE ? (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        parseInt(mark) >= 40 ? 'bg-green-100 text-green-800' : 
                                        parseInt(mark) >= 25 ? 'bg-yellow-100 text-yellow-800' : 
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        {mark}
                                      </span>
                                    ) : isSEM ? (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        mark === 'pass' ? 'bg-green-100 text-green-800' :
                                        mark === 'fail' ? 'bg-red-100 text-red-800' :
                                        mark === 'absent' ? 'bg-gray-100 text-gray-800' :
                                        mark === 'retest' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-blue-100 text-blue-800'
                                      }`}>
                                        {mark}
                                      </span>
                                    ) : (
                                      <span className="text-sm text-gray-900">{mark}</span>
                                    )}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No marks found</h3>
            <p className="text-sm text-gray-500 px-4">No marks have been entered for this exam yet.</p>
          </div>
        )}
      </div>
    )
  }

  // Create View
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBackToList}
            className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Send Exam to Students</h3>
            <p className="text-sm text-gray-600">
              Create and send exam types to all peer tutors and students in this section
            </p>
          </div>
        </div>
      </div>

      {/* Exam Type Selection */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h4 className="text-md font-medium text-gray-900 mb-4">Select Exam Type</h4>
        {availableExamTypes.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {availableExamTypes.map((examType) => (
              <button
                key={examType.value}
                onClick={() => setSelectedExamType(examType.value)}
                className={`p-3 border rounded-lg text-center transition-colors duration-200 ${
                  selectedExamType === examType.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium">{examType.label}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">All exam types created</h3>
            <p className="text-gray-500">All available exam types (CIE-1, CIE-2, CIE-3, Semester) have already been created for this section.</p>
          </div>
        )}
      </div>

      {/* Subjects Selection */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-md font-medium text-gray-900">Subjects</h4>
          <button
            onClick={handleAddSubject}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200"
          >
            Add Subject
          </button>
        </div>
        
        {subjects.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {subjects.map((subject) => (
              <div
                key={subject}
                className="flex items-center bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
              >
                <span>{subject}</span>
                <button
                  onClick={() => handleRemoveSubject(subject)}
                  className="ml-2 text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No subjects selected. Add subjects from classes or create new ones.</p>
        )}
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 mb-6">
        <h4 className="text-md font-medium text-gray-900 mb-3">Summary</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Exam Type:</span>
            <span className="ml-2 font-medium">
              {selectedExamType ? availableExamTypes.find(t => t.value === selectedExamType)?.label : 'Not selected'}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Subjects:</span>
            <span className="ml-2 font-medium">{subjects.length}</span>
          </div>
          <div>
            <span className="text-gray-600">Peer Tutors:</span>
            <span className="ml-2 font-medium">{peerTutors.length}</span>
          </div>
        </div>
      </div>

      {/* Send Button */}
      <div className="flex justify-between">
        <button
          onClick={async () => {
            console.log('Testing database connection...')
            const tableExists = await ExamMarksService.checkTableExists()
            const testResult = await ExamMarksService.testCreateExamMark()
            alert(`Table exists: ${tableExists}\nTest insert: ${testResult ? 'Success' : 'Failed'}\nCheck console for details.`)
          }}
          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
        >
          Test Database
        </button>
        
        <button
          onClick={handleSendExam}
          disabled={!selectedExamType || subjects.length === 0 || sending}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center space-x-2"
        >
          {sending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Sending...</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span>Send Exam</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default function SectionPage() {
  return (
    <FacultyProtectedRoute>
      <SectionContent />
    </FacultyProtectedRoute>
  )
}

function SectionContent() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const deptId = params.deptId as string
  const yearId = params.yearId as string
  const sectionId = params.sectionId as string
  
  // Ensure params are defined and cast to string
  if (!deptId || !yearId || !sectionId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Invalid Route</h1>
          <p className="text-gray-600">Missing required parameters</p>
        </div>
      </div>
    )
  }
  
  // Cast params to string (Next.js params can be string arrays)
  const deptIdStr = Array.isArray(deptId) ? deptId[0] : deptId
  const yearIdStr = Array.isArray(yearId) ? yearId[0] : yearId
  const sectionIdStr = Array.isArray(sectionId) ? sectionId[0] : sectionId
  
  const [department, setDepartment] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'peer-tutors' | 'students' | 'assign' | 'classes' | 'attendance' | 'exam' | 'import-export'>('peer-tutors')
  const [loading, setLoading] = useState(true)
  const [peerTutors, setPeerTutors] = useState<PeerTutor[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  
  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [peerTutorToDelete, setPeerTutorToDelete] = useState<PeerTutor | null>(null)
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'force-confirm' | 'success' | 'error'>('confirm')
  const [deleteMessage, setDeleteMessage] = useState('')
  const [deleteType, setDeleteType] = useState<'peer-tutors' | 'students'>('peer-tutors')

  // Check if sidebar is collapsed
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

    // Check initially
    checkSidebarState()

    // Listen for custom events
    const handleSidebarToggle = () => checkSidebarState()
    window.addEventListener('sidebar-toggle', handleSidebarToggle)

    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle)
    }
  }, [])

  // Handle tab parameter from URL
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && ['peer-tutors', 'students', 'assign', 'classes', 'attendance', 'exam', 'import-export'].includes(tabParam)) {
      setActiveTab(tabParam as 'peer-tutors' | 'students' | 'assign' | 'classes' | 'attendance' | 'exam' | 'import-export')
    }
  }, [searchParams])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownOpen) {
        const target = event.target as Element
        // Check if the click is outside any dropdown
        if (!target.closest('[data-dropdown]')) {
          setDropdownOpen(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  // Load department and peer tutors data
  useEffect(() => {
    const loadData = async () => {
      try {
        // Get faculty's actual department
        let facultyDepartment = 'Computer Science' // fallback
        if (user?.email) {
          const facultyDept = await FacultyService.verifyFacultyAccess(user.email)
          if (facultyDept) {
            facultyDepartment = facultyDept.name
          }
        }

        // Set department info with actual faculty department
        setDepartment({
          id: deptIdStr,
          name: facultyDepartment, // ← Use actual department
          faculty_name: user?.user_metadata?.full_name || user?.user_metadata?.name || 'Faculty Member'
        })

        // Load peer tutors for this section using actual department
        const tutors = await PeerTutorService.getPeerTutorsBySection(
          facultyDepartment, // ← Use actual department
          yearIdStr,         // ← Use raw value for fetching
          sectionIdStr       // ← Use raw value for fetching
        )
        setPeerTutors(tutors)

        // Load students for this section using actual department
        const sectionStudents = await StudentService.getStudentsBySection(
          facultyDepartment, // ← Use actual department
          yearIdStr,         // ← Use raw value for fetching
          sectionIdStr       // ← Use raw value for fetching
        )
        setStudents(sectionStudents)
      } catch (error) {
        console.error('Error loading section data:', error)
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      loadData()
    }
  }, [deptId, yearId, sectionId, user])

  const yearNames: { [key: string]: string } = {
    '2': '2nd Year',
    '3': '3rd Year', 
    '4': '4th Year'
  }

  const sectionNames: { [key: string]: string } = {
    'A': 'Section A',
    'B': 'Section B',
    'C': 'Section C'
  }

  // Mock data for dropdown options
  const yearOptions = [
    { id: '2', name: '2nd Year' },
    { id: '3', name: '3rd Year' },
    { id: '4', name: '4th Year' }
  ]

  const sectionOptions = [
    { id: 'A', name: 'Section A' },
    { id: 'B', name: 'Section B' },
    { id: 'C', name: 'Section C' }
  ]

  const handleSignOut = async () => {
    // await signOut() // This line was removed as per the new_code
  }

  const handleBackToYear = () => {
    router.push(`/faculty/department/${deptId}/year/${yearId}`)
  }

  const handleDropdownToggle = (dropdown: string) => {
    setDropdownOpen(dropdownOpen === dropdown ? null : dropdown)
  }

  const handleYearChange = (newYearId: string) => {
    router.push(`/faculty/department/${deptIdStr}/year/${newYearId}/section/${sectionIdStr}`)
    setDropdownOpen(null)
  }

  const handleSectionChange = (newSectionId: string) => {
    router.push(`/faculty/department/${deptIdStr}/year/${yearIdStr}/section/${newSectionId}`)
    setDropdownOpen(null)
  }

  const handleBackToDashboard = () => {
    router.push('/faculty/dashboard')
  }

  const handlePeerTutorAssigned = () => {
    // Reload peer tutors data
    const loadPeerTutors = async () => {
      try {
        // Get faculty's actual department
        let facultyDepartment = 'Computer Science' // fallback
        if (user?.email) {
          const facultyDept = await FacultyService.verifyFacultyAccess(user.email)
          if (facultyDept) {
            facultyDepartment = facultyDept.name
          }
        }

        const tutors = await PeerTutorService.getPeerTutorsBySection(
          facultyDepartment, // ← Use actual department
          yearIdStr,         // ← Use raw value for fetching
          sectionIdStr       // ← Use raw value for fetching
        )
        setPeerTutors(tutors)
      } catch (error) {
        console.error('Error reloading peer tutors:', error)
      }
    }
    loadPeerTutors()
  }

  const handleStudentAdded = () => {
    // Reload students data
    const loadStudents = async () => {
      try {
        // Get faculty's actual department
        let facultyDepartment = 'Computer Science' // fallback
        if (user?.email) {
          const facultyDept = await FacultyService.verifyFacultyAccess(user.email)
          if (facultyDept) {
            facultyDepartment = facultyDept.name
          }
        }

        const sectionStudents = await StudentService.getStudentsBySection(
          facultyDepartment, // ← Use actual department
          yearIdStr,         // ← Use raw value for fetching
          sectionIdStr       // ← Use raw value for fetching
        )
        setStudents(sectionStudents)
      } catch (error) {
        console.error('Error reloading students:', error)
      }
    }
    loadStudents()
  }

  const handleRemovePeerTutor = (tutorId: string) => {
    const tutor = peerTutors.find(t => t.id === tutorId)
    if (tutor) {
      setPeerTutorToDelete(tutor)
      setDeleteStep('confirm')
      setDeleteMessage('')
      setDeleteType('peer-tutors')
      setShowDeleteModal(true)
    }
  }

  const confirmDeletePeerTutor = async () => {
    if (!peerTutorToDelete) return

    try {
      const result = await PeerTutorService.removePeerTutor(peerTutorToDelete.id)
      if (result.success) {
        setDeleteStep('success')
        setDeleteMessage(result.message)
        handlePeerTutorAssigned() // Reload data
      } else {
        // Check if the error is about assigned students
        if (result.message.includes('students are still assigned')) {
          setDeleteStep('force-confirm')
          setDeleteMessage(result.message)
        } else {
          setDeleteStep('error')
          setDeleteMessage(result.message)
        }
      }
    } catch (error) {
      console.error('Error removing peer tutor:', error)
      setDeleteStep('error')
      setDeleteMessage('An unexpected error occurred while deleting the peer tutor.')
    }
  }

  const confirmForceDeletePeerTutor = async () => {
    if (!peerTutorToDelete) return

    try {
      const forceResult = await PeerTutorService.removePeerTutor(peerTutorToDelete.id, true)
      if (forceResult.success) {
        setDeleteStep('success')
        setDeleteMessage(forceResult.message)
        handlePeerTutorAssigned() // Reload data
      } else {
        setDeleteStep('error')
        setDeleteMessage(forceResult.message)
      }
    } catch (error) {
      console.error('Error force removing peer tutor:', error)
      setDeleteStep('error')
      setDeleteMessage('An unexpected error occurred while force deleting the peer tutor.')
    }
  }

  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setPeerTutorToDelete(null)
    setDeleteStep('confirm')
    setDeleteMessage('')
  }

  const handleRemoveStudent = (studentId: string) => {
    const student = students.find(s => s.id === studentId)
    if (student) {
      setPeerTutorToDelete({
        id: student.id,
        name: student.name,
        email: student.email,
        dept: student.dept,
        year: student.year,
        section: student.section,
        faculty_id: '',
        created_at: '',
        assigned_by: ''
      } as PeerTutor) // Cast to PeerTutor for modal compatibility
      setDeleteStep('confirm')
      setDeleteMessage('')
      setDeleteType('students')
      setShowDeleteModal(true)
    }
  }

  const confirmDeleteStudent = async () => {
    if (!peerTutorToDelete) return

    try {
      const success = await StudentService.removeStudent(peerTutorToDelete.id)
      if (success) {
        setDeleteStep('success')
        setDeleteMessage('Student deleted successfully')
        handleStudentAdded() // Reload data
      } else {
        setDeleteStep('error')
        setDeleteMessage('Failed to delete student')
      }
    } catch (error) {
      console.error('Error removing student:', error)
      setDeleteStep('error')
      setDeleteMessage('An unexpected error occurred while deleting the student.')
    }
  }

  const handlePeerTutorClick = (tutorId: string) => {
    router.push(`/faculty/peer-tutor/${tutorId}`)
  }

  const handleBulkImportComplete = () => {
    // This will be called when bulk import is completed
    // We can reload the assignments data if needed
    console.log('Bulk import completed')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main content */}
      <div className={`${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 h-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 lg:hidden"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div className="ml-2 lg:ml-0">
                  <h1 className="text-2xl roboto-condensed-title text-gray-900">
                    {department?.name} - {yearNames[yearIdStr] || yearIdStr} - {sectionNames[sectionIdStr] || sectionIdStr}
                  </h1>
                  <p className="text-sm roboto-condensed-subtitle text-gray-600 mt-1">
                    Manage peer tutors, students, assignments, and classes for this section
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.back()}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Back
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1">
          <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
            {/* Interactive Breadcrumb */}
            <div className="py-4">
              <nav className="flex" aria-label="Breadcrumb">
                <ol className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
                  <li>
                    <div className="flex items-center">
                      <button
                        onClick={handleBackToDashboard}
                        className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors duration-200"
                      >
                        Dashboard
                      </button>
                    </div>
                  </li>
                  <li>
                    <div data-dropdown className="flex items-center relative">
                      <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
                      </svg>
                      <button
                        onClick={() => handleDropdownToggle('year')}
                        className="ml-2 sm:ml-4 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors duration-200 flex items-center"
                      >
                        {yearNames[yearIdStr]}
                        <svg className="ml-1 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {dropdownOpen === 'year' && (
                        <div data-dropdown className="absolute top-full left-0 mt-1 w-32 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                          <div className="py-1">
                            {yearOptions.map((year) => (
                              <button
                                key={year.id}
                                onClick={() => handleYearChange(year.id)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-200"
                              >
                                {year.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                  <li>
                    <div data-dropdown className="flex items-center relative">
                      <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
                      </svg>
                      <button
                        onClick={() => handleDropdownToggle('section')}
                        className="ml-2 sm:ml-4 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors duration-200 flex items-center"
                      >
                        {sectionNames[sectionIdStr]}
                        <svg className="ml-1 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {dropdownOpen === 'section' && (
                        <div data-dropdown className="absolute top-full left-0 mt-1 w-32 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                          <div className="py-1">
                            {sectionOptions.map((section) => (
                              <button
                                key={section.id}
                                onClick={() => handleSectionChange(section.id)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-200"
                              >
                                {section.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                </ol>
              </nav>
            </div>
          <div className="bg-white rounded-lg shadow">
            {/* Tabs */}
            <div className="border-b border-gray-200 overflow-x-auto">
              <nav className="-mb-px flex space-x-4 sm:space-x-6 lg:space-x-8 px-4 sm:px-6 min-w-max sm:min-w-0" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('peer-tutors')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                    activeTab === 'peer-tutors'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Peer Tutors
                </button>
                <button
                  onClick={() => setActiveTab('students')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                    activeTab === 'students'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Students
                </button>
                <button
                  onClick={() => setActiveTab('assign')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                    activeTab === 'assign'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Assign
                </button>
                <button
                  onClick={() => setActiveTab('classes')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                    activeTab === 'classes'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Classes
                </button>
                <button
                  onClick={() => setActiveTab('attendance')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                    activeTab === 'attendance'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Attendance
                </button>
                <button
                  onClick={() => setActiveTab('exam')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                    activeTab === 'exam'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Exam
                </button>
                <button
                  onClick={() => setActiveTab('import-export')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                    activeTab === 'import-export'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Import/Export
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            <div className="p-4 sm:p-6">
              {activeTab === 'peer-tutors' ? (
                <PeerTutorsTab 
                  peerTutors={peerTutors} 
                  students={students}
                  setIsModalOpen={setIsModalOpen} 
                  handleRemovePeerTutor={handleRemovePeerTutor}
                  onPeerTutorClick={handlePeerTutorClick}
                />
              ) : activeTab === 'students' ? (
                <StudentsTab 
                  students={students} 
                  peerTutors={peerTutors}
                  setIsStudentModalOpen={setIsStudentModalOpen} 
                  handleRemoveStudent={handleRemoveStudent}
                />
              ) : activeTab === 'assign' ? (
                <AssignTab 
                  dept={department?.name || 'Computer Science'} 
                  year={yearId} 
                  section={sectionId} 
                />
              ) : activeTab === 'classes' ? (
                <ClassesTab 
                  dept={department?.name || 'Computer Science'} 
                  year={yearId} 
                  section={sectionId}
                  departmentId={department?.id || deptId} // Pass the department ID
                />
              ) : activeTab === 'attendance' ? (
                <AttendanceTab 
                  dept={department?.name || 'Computer Science'} 
                  year={yearId} 
                  section={sectionId}
                />
              ) : activeTab === 'exam' ? (
                <ExamTab 
                  dept={department?.name || 'Computer Science'} 
                  year={yearId} 
                  section={sectionId}
                />
              ) : activeTab === 'import-export' ? (
                <ImportExportTab 
                  dept={department?.name || 'Computer Science'} 
                  year={yearId} 
                  section={sectionId}
                  onImportComplete={handleBulkImportComplete}
                  onShowExportModal={() => setShowExportModal(true)}
                />
              ) : null}
            </div>
          </div>
          </div>
        </main>

      {/* Modals */}
      <AssignPeerTutorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handlePeerTutorAssigned}
        dept={department?.name} // ← This will now be the actual department
        year={yearIdStr}        // ← "2" (raw value for storage)
        section={sectionIdStr}  // ← "A" (raw value for storage)
      />

      <AddStudentModal
        isOpen={isStudentModalOpen}
        onClose={() => setIsStudentModalOpen(false)}
        onSuccess={handleStudentAdded}
        dept={department?.name} // ← This will now be the actual department
        year={yearIdStr}        // ← "2" (raw value for storage)
        section={sectionIdStr}  // ← "A" (raw value for storage)
      />

      {/* Export Modal */}
      {showExportModal && (
        <PeerTutorMappingExport
          dept={department?.name || 'Computer Science'}
          year={yearId}
          section={sectionId}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && peerTutorToDelete && (
        <DeleteConfirmationModal
          isOpen={showDeleteModal}
          onClose={closeDeleteModal}
          onConfirm={
            deleteStep === 'confirm' 
              ? (deleteType === 'peer-tutors' ? confirmDeletePeerTutor : confirmDeleteStudent)
              : deleteStep === 'force-confirm' 
                ? confirmForceDeletePeerTutor 
                : closeDeleteModal
          }
          title={
            deleteStep === 'confirm' 
              ? `Delete ${deleteType === 'peer-tutors' ? 'Peer Tutor' : 'Student'}` 
              : deleteStep === 'force-confirm' 
                ? 'Force Delete Peer Tutor' 
                : deleteStep === 'success' 
                  ? 'Deletion Successful' 
                  : 'Deletion Failed'
          }
          itemsToDelete={[{
            name: peerTutorToDelete.name,
            email: peerTutorToDelete.email,
            additionalInfo: deleteStep === 'force-confirm' 
              ? 'This will unassign all students from this peer tutor'
              : deleteStep === 'success' || deleteStep === 'error'
                ? deleteMessage
                : 'This action cannot be undone'
          }]}
          type={deleteType}
        />
      )}
      </div>
    </div>
  )
}



