'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef, Fragment, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { PeerTutorService, PeerTutor } from '@/lib/services/peerTutorService'
import { StudentService, Student } from '@/lib/services/studentService'
import { AssignmentService, Assignment, AssignmentStats } from '@/lib/services/assignmentService'
import AssignPeerTutorModal from '@/components/forms/AssignPeerTutorModal'
import AddStudentModal from '@/components/forms/AddStudentModal'
import BulkImportExport from '@/components/forms/BulkImportExport'
import ClassesImportExport from '@/components/forms/ClassesImportExport'
import PeerTutorMappingExport from '@/components/forms/PeerTutorMappingExport'
import DateAssignmentModal from '@/components/forms/DateAssignmentModal'
import { ClassService, Class } from '@/lib/services/classService'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { AttendanceService, AttendanceRecord } from '@/lib/services/attendanceService'
import { FacultyService } from '@/lib/services/facultyService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import { ReportService } from '@/lib/services/reportService'
import { createClient } from '@/utils/supabase/client'
import DeleteConfirmationModal from '@/components/forms/DeleteConfirmationModal'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Eye } from 'lucide-react'

// Helper to build an XLSX worksheet with a common header block and ordered columns
function createSheetWithHeader(
  dept: string,
  year: string,
  section: string,
  title: string,
  rows: Array<Record<string, any>>,
  headersInOrder: string[]
) {
  const headerRows = [
    [`${title} Export Report`],
    [`Department: ${dept}`],
    [`Year: ${year}`],
    [`Section: ${section}`],
    [
      `Generated on: ${new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}`
    ],
    [] // spacer row
  ]

  const ws = XLSX.utils.aoa_to_sheet(headerRows)

  // Ensure columns are in the exact order by mapping each row
  const orderedRows = rows.map((row) => {
    const ordered: Record<string, any> = {}
    headersInOrder.forEach((key) => {
      ordered[key] = row[key]
    })
    return ordered
  })

  // Start data at A7 (after 6 header rows)
  XLSX.utils.sheet_add_json(ws, orderedRows, {
    header: headersInOrder,
    origin: 'A7',
    skipHeader: false
  })

  return ws
}

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
  dept: string
  year: string
  section: string
}

function PeerTutorsTab({ peerTutors, students, setIsModalOpen, handleRemovePeerTutor, onPeerTutorClick, dept, year, section }: PeerTutorsTabProps) {
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
            // Get all additional classes for this peer tutor
            // Note: Since additional_classes table doesn't store dept/year/section,
            // we count all additional classes for the peer tutor
            // This is correct because peer tutors are already filtered by section,
            // so their additional classes should logically belong to this section
            const additionalClasses = await AdditionalClassService.getAdditionalClassesByPeerTutor(tutor.id)
            
            // Debug logging
            console.log(`Peer Tutor ${tutor.name} (${tutor.id}):`, {
              dept: tutor.dept,
              year: tutor.year,
              section: tutor.section,
              currentSection: { dept, year, section },
              additionalClassesCount: additionalClasses.length,
              matchesSection: tutor.dept === dept && tutor.year === year && tutor.section === section
            })
            
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

  // Export function for peer tutors (matches table order + header)
  const exportPeerTutors = () => {
    const rows = peerTutorsWithStats.map(tutor => ({
      'Name': tutor.name,
      'Email': tutor.email,
      'Total Classes Allocated': tutor.classStats?.totalClasses || 0,
      'Completed Classes': tutor.classStats?.completedClasses || 0,
      'Pending Classes': tutor.classStats?.pendingClasses || 0,
      'Additional Classes Taken': tutor.additionalClassesCount || 0,
      'Students Assigned': peerTutorStudentCounts[tutor.id] || 0
    }))

    const headers = [
      'Name',
      'Email',
      'Total Classes Allocated',
      'Completed Classes',
      'Pending Classes',
      'Additional Classes Taken',
      'Students Assigned'
    ]

    const ws = createSheetWithHeader(dept, year, section, 'Peer Tutors', rows, headers)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Peer Tutors')
    const fileName = `peer_tutors_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`
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
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
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
            onClick={toggleDeleteMode}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete</span>
          </button>
          {sortedPeerTutors.length > 0 && (
            <button
              onClick={exportPeerTutors}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Export</span>
            </button>
          )}
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
                
                <div className="p-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Classes</p>
                      <p className="text-xl font-bold text-black">{tutor.classStats.totalClasses}</p>
                    </div>
                    
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Completed</p>
                      <p className="text-xl font-bold text-black">{tutor.classStats.completedClasses}</p>
                    </div>
                    
                    <div className="bg-yellow-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pending</p>
                      <p className="text-xl font-bold text-black">{tutor.classStats.pendingClasses}</p>
                    </div>
                    
                    <div className="bg-purple-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Additional</p>
                      <p className="text-xl font-bold text-black">{tutor.additionalClassesCount || 0}</p>
                    </div>
                    
                    <div className="bg-blue-50 rounded-lg p-3 col-span-2">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Students Assigned</p>
                      <p className="text-xl font-bold text-black">{peerTutorStudentCounts[tutor.id] || 0}</p>
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
        <table className="min-w-full table-fixed divide-y divide-gray-200">
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
                Total Classes
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Completed Classes
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pending Classes
              </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Additional Classes
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Students Assigned
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
                    <div className="text-sm font-semibold text-black">
                      {tutor.classStats.totalClasses}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-semibold text-black">
                      {tutor.classStats.completedClasses}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-semibold text-black">
                      {tutor.classStats.pendingClasses}
                    </div>
                  </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm font-semibold text-black">
                        {tutor.additionalClassesCount || 0}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-semibold text-black">
                      {peerTutorStudentCounts[tutor.id] || 0}
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
  dept: string
  year: string
  section: string
}

function StudentsTab({ students, peerTutors, setIsStudentModalOpen, handleRemoveStudent, dept, year, section }: StudentsTabProps) {
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

  // Ensure students with the same peer tutor are listed consecutively
  const sortedStudents = useMemo(() => {
    const copy = [...filteredStudents]
    copy.sort((a, b) => {
      const aKey = a.assigned_peer_tutor_id || 'unassigned'
      const bKey = b.assigned_peer_tutor_id || 'unassigned'
      if (aKey !== bKey) return aKey.localeCompare(bKey)
      return a.name.localeCompare(b.name)
    })
    return copy
  }, [filteredStudents])

  // Group counts for peer tutor to enable rowSpan in table view
  const tutorGroupInfo = useMemo(() => {
    const groupMap = new Map<string, { count: number; firstIndex: number }>()
    sortedStudents.forEach((student, index) => {
      const key = student.assigned_peer_tutor_id || 'unassigned'
      const existing = groupMap.get(key)
      if (existing) {
        existing.count += 1
      } else {
        groupMap.set(key, { count: 1, firstIndex: index })
      }
    })
    return groupMap
  }, [sortedStudents])

  // Export function for students (matches table order + header)
  const exportStudents = () => {
    const rows = filteredStudents.map(student => {
      const assignedPeerTutor = peerTutors.find(tutor => tutor.id === student.assigned_peer_tutor_id)
      return {
        'Name': student.name,
        'Email': student.email,
        'Year & Section': `${student.year} - ${student.section}`,
        'Assigned Peer Tutor': assignedPeerTutor?.name || 'Not assigned'
      }
    })

    const headers = ['Name', 'Email', 'Year & Section', 'Assigned Peer Tutor']
    const ws = createSheetWithHeader(dept, year, section, 'Students', rows, headers)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Students')
    const fileName = `students_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`
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
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
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



          <button
            onClick={toggleDeleteModeStudents}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete</span>
          </button>
                    {/* Export Button */}
                    {filteredStudents.length > 0 && (
                      <button
                        onClick={exportStudents}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>Export</span>
                      </button>
                    )}
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
            {sortedStudents.map((student) => {
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
        <table className="min-w-full table-fixed divide-y divide-gray-200">
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-1/3">
                Email
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                Assigned Peer Tutor
              </th>
            </tr>
          </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                {sortedStudents.map((student, index) => {
                        const assignedPeerTutor = peerTutors.find(tutor => tutor.id === student.assigned_peer_tutor_id)
                        const groupKey = student.assigned_peer_tutor_id || 'unassigned'
                        const group = tutorGroupInfo.get(groupKey)
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
                            <td className="px-6 py-4 whitespace-nowrap align-middle w-1/3">
                              <div className="text-sm font-medium text-gray-900">{student.name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200 align-middle w-1/3">
                              <div className="text-sm text-gray-500">{student.email}</div>
                            </td>
                            {group && group.firstIndex === index && (
                              <td className="px-6 py-4 whitespace-nowrap align-middle w-1/3 text-center" rowSpan={group.count}>
                                {assignedPeerTutor ? (
                                  <div className="text-sm text-gray-900 inline-block">
                                    {assignedPeerTutor.name}
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-500 inline-block">
                                    Not assigned
                                  </div>
                                )}
                              </td>
                            )}
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

interface PeerTutorDetailViewProps {
  peerTutorId: string
  peerTutorName: string
  dept: string
  year: string
  section: string
  onBack: () => void
}

interface SubjectAttendanceData {
  subjectName: string
  dates: string[]
  students: {
    sNo: number
    studentName: string
    studentId: string
    hour: number
    dateAttendance: { [date: string]: 'P' | 'A' | '' }
    totalHoursPresent: number
    attendancePercentage: number
  }[]
}

function PeerTutorDetailView({ peerTutorId, peerTutorName, dept, year, section, onBack }: PeerTutorDetailViewProps) {
  const [loading, setLoading] = useState(true)
  const [subjectsData, setSubjectsData] = useState<SubjectAttendanceData[]>([])

  useEffect(() => {
    loadDetailData()
  }, [peerTutorId, dept, year, section])

  const loadDetailData = async () => {
    try {
      setLoading(true)
      const supabase = createClient()

      // Get students assigned to this peer tutor
      const students = await AttendanceService.getStudentsForAttendance(peerTutorId)
      
      // Get all subjects assigned to this peer tutor
      const subjects = await ReportService.getPeerTutorSubjects(peerTutorId)
      
      // Get all scheduled classes for this peer tutor
      const { data: scheduledClasses } = await supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name
          )
        `)
        .eq('peer_tutor_id', peerTutorId)
        .order('scheduled_date', { ascending: true })

      // Get all additional classes for this peer tutor
      const additionalClasses = await AdditionalClassService.getAdditionalClassesByPeerTutor(peerTutorId)

      // Get all attendance records for scheduled classes
      const scheduledClassIds = (scheduledClasses || []).map(sc => sc.id)
      const { data: attendanceRecords } = await supabase
        .from('attendance')
        .select('scheduled_class_id, student_id, status')
        .in('scheduled_class_id', scheduledClassIds)

      // Get attendance records for additional classes
      const additionalClassIds = additionalClasses.map(ac => ac.id)
      const { data: additionalAttendanceRecords } = await supabase
        .from('additional_class_attendance')
        .select('additional_class_id, student_id, status')
        .in('additional_class_id', additionalClassIds)

      // Create attendance map: scheduled_class_id -> student_id -> status
      const attendanceMap = new Map<string, Map<string, 'P' | 'A'>>()
      attendanceRecords?.forEach(record => {
        if (!attendanceMap.has(record.scheduled_class_id)) {
          attendanceMap.set(record.scheduled_class_id, new Map())
        }
        attendanceMap.get(record.scheduled_class_id)!.set(record.student_id, record.status as 'P' | 'A')
      })

      // Create additional attendance map: additional_class_id -> student_id -> status
      const additionalAttendanceMap = new Map<string, Map<string, 'P' | 'A'>>()
      additionalAttendanceRecords?.forEach(record => {
        if (!additionalAttendanceMap.has(record.additional_class_id)) {
          additionalAttendanceMap.set(record.additional_class_id, new Map())
        }
        additionalAttendanceMap.get(record.additional_class_id)!.set(record.student_id, record.status as 'P' | 'A')
      })

      // Process each subject
      const subjectsWithData: SubjectAttendanceData[] = []

      subjects.forEach((subject: any, subjectIdx: number) => {
        // Get scheduled classes for this subject
        const subjectScheduledClasses = (scheduledClasses || []).filter(
          sc => sc.class?.subject_name === subject.subject_name
        )

        // Get additional classes for this subject
        const subjectAdditionalClasses = additionalClasses.filter(
          ac => ac.subject_name === subject.subject_name
        )

        // Collect all dates (scheduled + additional)
        const scheduledDates = subjectScheduledClasses.map(sc => sc.scheduled_date)
        const additionalDates = subjectAdditionalClasses.map(ac => ac.class_date)
        const allDates = [...new Set([...scheduledDates, ...additionalDates])].sort()

        // Process each student
        const studentRows = students.map((student, studentIdx) => {
          const dateAttendance: { [date: string]: 'P' | 'A' | '' } = {}
          let totalHoursPresent = 0
          let totalHours = 0

          // Process scheduled class dates
          subjectScheduledClasses.forEach(sc => {
            const date = sc.scheduled_date
            const studentAttendance = attendanceMap.get(sc.id)?.get(student.id)
            if (studentAttendance) {
              dateAttendance[date] = studentAttendance
              totalHours++
              if (studentAttendance === 'P') {
                totalHoursPresent++
              }
            } else {
              dateAttendance[date] = ''
              totalHours++
            }
          })

          // Process additional class dates
          subjectAdditionalClasses.forEach(ac => {
            const date = ac.class_date
            const studentAttendance = additionalAttendanceMap.get(ac.id)?.get(student.id)
            if (studentAttendance) {
              dateAttendance[date] = studentAttendance
              totalHours++
              if (studentAttendance === 'P') {
                totalHoursPresent++
              }
            } else {
              dateAttendance[date] = ''
              totalHours++
            }
          })

          const attendancePercentage = totalHours > 0 
            ? Math.round((totalHoursPresent / totalHours) * 100) 
            : 0

          return {
            sNo: studentIdx + 1,
            studentName: student.name,
            studentId: student.id,
            hour: totalHours,
            dateAttendance,
            totalHoursPresent,
            attendancePercentage
          }
        })

        subjectsWithData.push({
          subjectName: subject.subject_name,
          dates: allDates,
          students: studentRows
        })
      })

      setSubjectsData(subjectsWithData)
    } catch (error) {
      console.error('Error loading detail data:', error)
      setSubjectsData([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-gray-700 transition-colors"
        >
          General
        </button>
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-900 font-medium">{peerTutorName}</span>
      </div>

      {/* Subject Tables */}
      {subjectsData.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No subject data available</p>
        </div>
      ) : (
        subjectsData.map((subjectData, subjectIdx) => (
          <div key={subjectIdx} className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
            {/* Subject Header */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Subject Name {subjectIdx + 1}: {subjectData.subjectName}
              </h3>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                <thead className="bg-gray-50">
                  {/* Top header row */}
                  <tr>
                    <th rowSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                      S.No
                    </th>
                    <th rowSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                      Name
                    </th>
                    <th rowSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                      Hour
                    </th>
                    {subjectData.dates.length > 0 && (
                      <th colSpan={subjectData.dates.length} className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                        Date
                      </th>
                    )}
                    <th colSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                      No of Hours Present
                    </th>
                    <th rowSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                      %
                    </th>
                  </tr>
                  {/* Second header row */}
                  <tr>
                    {subjectData.dates.map((date, dateIdx) => {
                      const dateObj = new Date(date)
                      const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })
                      return (
                        <th key={dateIdx} className="px-2 py-2 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100 min-w-[60px]">
                          {formattedDate}
                        </th>
                      )
                    })}
                    <th className="px-4 py-2 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                      Hours
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {subjectData.students.length === 0 ? (
                    <tr>
                      <td colSpan={4 + subjectData.dates.length + 3} className="px-6 py-8 text-center text-sm text-gray-500">
                        No students assigned
                      </td>
                    </tr>
                  ) : (
                    subjectData.students.map((student) => (
                      <tr key={student.studentId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-center text-sm text-gray-900 border border-gray-300">
                          {student.sNo}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 border border-gray-300">
                          {student.studentName}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-900 border border-gray-300">
                          {student.hour}
                        </td>
                        {subjectData.dates.map((date, dateIdx) => {
                          const status = student.dateAttendance[date] || ''
                          return (
                            <td key={dateIdx} className="px-2 py-3 text-center text-sm text-gray-900 border border-gray-300">
                              {status}
                            </td>
                          )
                        })}
                        <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900 border border-gray-300">
                          {student.totalHoursPresent}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900 border border-gray-300">
                          {student.attendancePercentage}%
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900 border border-gray-300">
                          {student.attendancePercentage}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Signature Section */}
            <div className="px-6 py-4 border-t border-gray-200">
              <div className="text-sm font-medium text-gray-700">SIGNATURE OF FACULTY:</div>
              <div className="mt-2 border-b border-gray-300 w-64"></div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

interface GeneralTabProps {
  dept: string
  year: string
  section: string
}

interface PeerTutorGeneralRow {
  peerTutorName: string
  peerTutorId: string
  classesAllocated: { completed: number; total: number }
  additionalClassesTaken: number
  attendancePercentage: number
}

function GeneralTab({ dept, year, section }: GeneralTabProps) {
  const [loading, setLoading] = useState(true)
  const [generalData, setGeneralData] = useState<PeerTutorGeneralRow[]>([])
  const [selectedPeerTutor, setSelectedPeerTutor] = useState<string | null>(null)
  const [selectedPeerTutorName, setSelectedPeerTutorName] = useState<string>('')

  useEffect(() => {
    loadGeneralData()
  }, [dept, year, section])

  const loadGeneralData = async () => {
    try {
      setLoading(true)
      
      // Get all peer tutors for this section
      const peerTutors = await PeerTutorService.getPeerTutorsBySection(dept, year, section)
      
      // Get stats for each peer tutor
      const tutorsWithStats = await Promise.all(
        peerTutors.map(async (tutor) => {
          const classStats = await ScheduledClassService.getPeerTutorClassStats(tutor.id)
          const additionalClasses = await AdditionalClassService.getAdditionalClassesByPeerTutor(tutor.id)
          
          // Calculate attendance percentage
          // Formula: (completed classes + additional classes) / total classes allocated * 100
          const numerator = classStats.completedClasses + additionalClasses.length
          const denominator = classStats.totalClasses
          const attendancePercentage = denominator > 0 
            ? Math.round((numerator / denominator) * 100) 
            : 0
          
          return {
            peerTutorName: tutor.name,
            peerTutorId: tutor.id,
            classesAllocated: {
              completed: classStats.completedClasses,
              total: classStats.totalClasses
            },
            additionalClassesTaken: additionalClasses.length,
            attendancePercentage
          }
        })
      )
      
      setGeneralData(tutorsWithStats)
    } catch (error) {
      console.error('Error loading general data:', error)
      setGeneralData([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (selectedPeerTutor) {
    return (
      <PeerTutorDetailView
        peerTutorId={selectedPeerTutor}
        peerTutorName={selectedPeerTutorName}
        dept={dept}
        year={year}
        section={section}
        onBack={() => {
          setSelectedPeerTutor(null)
          setSelectedPeerTutorName('')
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                  Peer Tutor Name
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                  Classes Allocated
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                  Additional Classes Taken
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Attendance Percentage
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {generalData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                    No peer tutor data available
                  </td>
                </tr>
              ) : (
                generalData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                      <div className="text-sm font-medium text-gray-900">{row.peerTutorName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200">
                      <div className="text-sm font-semibold text-gray-900">
                        {row.classesAllocated.completed}/{row.classesAllocated.total}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200">
                      <div className="text-sm font-semibold text-gray-900">
                        {row.additionalClassesTaken}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm font-semibold text-gray-900">
                        {row.attendancePercentage}%
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <button
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                        onClick={() => {
                          setSelectedPeerTutor(row.peerTutorId)
                          setSelectedPeerTutorName(row.peerTutorName)
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1.5 text-gray-600" />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

interface AdvancedAttendanceTabProps {
  dept: string
  year: string
  section: string
}

interface PeerTutorAttendanceRow {
  sNo: number
  peerTutorName: string
  subject: string
  hour: number
  dateAttendance: { [date: string]: 'P' | 'A' | '' }
  totalHoursPresent: number
  attendancePercentage: number
}

function AdvancedAttendanceTab({ dept, year, section }: AdvancedAttendanceTabProps) {
  const [loading, setLoading] = useState(true)
  const [attendanceData, setAttendanceData] = useState<PeerTutorAttendanceRow[]>([])
  const [dates, setDates] = useState<string[]>([])

  useEffect(() => {
    loadAttendanceData()
  }, [dept, year, section])

  const loadAttendanceData = async () => {
    try {
      setLoading(true)
      const supabase = createClient()

      // Get all peer tutors for this section
      const peerTutors = await PeerTutorService.getPeerTutorsBySection(dept, year, section)
      
      // Get all scheduled classes for this section
      const { data: scheduledClasses, error } = await supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name
          ),
          peer_tutor:peer_tutors!inner(
            id,
            name,
            email
          )
        `)
        .eq('dept', dept)
        .eq('year', year)
        .in('section', [section, 'ALL'])
        .order('scheduled_date', { ascending: true })

      if (error) {
        console.error('Error loading scheduled classes:', error)
        setAttendanceData([])
        setDates([])
        return
      }

      // Get unique dates from scheduled classes
      const uniqueDates = [...new Set((scheduledClasses || []).map(sc => sc.scheduled_date))].sort()
      setDates(uniqueDates)

      // Get attendance records for all scheduled classes
      const scheduledClassIds = (scheduledClasses || []).map(sc => sc.id)
      const { data: attendanceRecords } = await supabase
        .from('attendance')
        .select('scheduled_class_id, status')
        .in('scheduled_class_id', scheduledClassIds)

      // Create a map of scheduled class ID to attendance status
      const attendanceMap = new Map<string, 'P' | 'A'>()
      if (attendanceRecords) {
        // Group by scheduled_class_id and determine if peer tutor was present
        // If any student attendance exists, peer tutor was present
        const classAttendanceMap = new Map<string, Set<string>>()
        attendanceRecords.forEach(record => {
          if (!classAttendanceMap.has(record.scheduled_class_id)) {
            classAttendanceMap.set(record.scheduled_class_id, new Set())
          }
          classAttendanceMap.get(record.scheduled_class_id)?.add(record.status)
        })

        classAttendanceMap.forEach((statuses, classId) => {
          // If there are any attendance records, peer tutor was present
          attendanceMap.set(classId, 'P')
        })
      }

      // Build attendance data rows
      const rows: PeerTutorAttendanceRow[] = []
      let sNo = 1

      // Group by peer tutor and subject
      const tutorSubjectMap = new Map<string, Map<string, any[]>>()
      
      scheduledClasses?.forEach(sc => {
        const tutorId = sc.peer_tutor_id
        const subjectName = sc.class?.subject_name || 'Unknown'
        const key = `${tutorId}-${subjectName}`
        
        if (!tutorSubjectMap.has(tutorId)) {
          tutorSubjectMap.set(tutorId, new Map())
        }
        const subjectMap = tutorSubjectMap.get(tutorId)!
        if (!subjectMap.has(subjectName)) {
          subjectMap.set(subjectName, [])
        }
        subjectMap.get(subjectName)!.push(sc)
      })

      // Create rows for each peer tutor-subject combination
      peerTutors.forEach(tutor => {
        const subjectMap = tutorSubjectMap.get(tutor.id)
        if (!subjectMap || subjectMap.size === 0) {
          // Add row even if no subjects assigned
          rows.push({
            sNo: sNo++,
            peerTutorName: tutor.name,
            subject: 'No subjects assigned',
            hour: 0,
            dateAttendance: {},
            totalHoursPresent: 0,
            attendancePercentage: 0
          })
        } else {
          subjectMap.forEach((classes, subjectName) => {
            const dateAttendance: { [date: string]: 'P' | 'A' | '' } = {}
            let totalHoursPresent = 0
            let totalHours = 0

            classes.forEach(sc => {
              const date = sc.scheduled_date
              const isPresent = attendanceMap.has(sc.id) && attendanceMap.get(sc.id) === 'P'
              dateAttendance[date] = isPresent ? 'P' : 'A'
              totalHours++
              if (isPresent) {
                totalHoursPresent++
              }
            })

            const attendancePercentage = totalHours > 0 ? Math.round((totalHoursPresent / totalHours) * 100) : 0

            rows.push({
              sNo: sNo++,
              peerTutorName: tutor.name,
              subject: subjectName,
              hour: totalHours,
              dateAttendance,
              totalHoursPresent,
              attendancePercentage
            })
          })
        }
      })

      setAttendanceData(rows)
    } catch (error) {
      console.error('Error loading attendance data:', error)
      setAttendanceData([])
      setDates([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
            <thead className="bg-gray-50">
              {/* Top header row */}
              <tr>
                <th rowSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                  S.No
                </th>
                <th rowSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                  Name
                </th>
                <th rowSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                  Hour
                </th>
                {dates.length > 0 && (
                  <th colSpan={dates.length} className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                    Date
                  </th>
                )}
                <th colSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                  No of Hours Present
                </th>
              </tr>
              {/* Second header row */}
              <tr>
                {dates.map((date, idx) => {
                  const dateObj = new Date(date)
                  const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })
                  return (
                    <th key={idx} className="px-2 py-2 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100 min-w-[60px]">
                      {formattedDate}
                    </th>
                  )
                })}
                <th className="px-4 py-2 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                  Hours
                </th>
                <th className="px-4 py-2 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border border-gray-300 bg-gray-100">
                  %
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {attendanceData.length === 0 ? (
                <tr>
                  <td colSpan={4 + dates.length + 2} className="px-6 py-8 text-center text-sm text-gray-500">
                    No attendance data available
                  </td>
                </tr>
              ) : (
                attendanceData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-center text-sm text-gray-900 border border-gray-300">
                      {row.sNo}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 border border-gray-300">
                      <div>{row.peerTutorName}</div>
                      <div className="text-xs text-gray-500">{row.subject}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-900 border border-gray-300">
                      {row.hour}
                    </td>
                    {dates.map((date, dateIdx) => {
                      const status = row.dateAttendance[date] || ''
                      return (
                        <td key={dateIdx} className="px-2 py-3 text-center text-sm text-gray-900 border border-gray-300">
                          {status}
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900 border border-gray-300">
                      {row.totalHoursPresent}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900 border border-gray-300">
                      {row.attendancePercentage}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

interface ImportExportTabProps {
  dept: string
  year: string
  section: string
  facultyId: string
  onImportComplete: () => void
  onShowExportModal: () => void
}

function ImportExportTab({ dept, year, section, facultyId, onImportComplete, onShowExportModal }: ImportExportTabProps) {
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState({
    totalPeerTutors: 0,
    totalStudents: 0,
    totalClasses: 0,
    totalAttendanceRecords: 0,
    assignedStudents: 0,
    scheduledClasses: 0
  })
  const [activeSubTab, setActiveSubTab] = useState<'import' | 'export' | 'advanced'>('import')
  const [activeAdvancedTab, setActiveAdvancedTab] = useState<'general' | 'attendance' | 'nextTopicSheet' | 'mark'>('general')

  const dbYear = year
  const dbSection = section

  useEffect(() => {
    loadAnalytics()
  }, [dept, dbYear, dbSection])

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      const [tutors, sectionStudents, classes, scheduledClasses] = await Promise.all([
        PeerTutorService.getPeerTutorsBySection(dept, dbYear, dbSection),
        StudentService.getStudentsBySection(dept, dbYear, dbSection),
        ClassService.getClassesByYearSection(dept, dbYear, dbSection),
        ScheduledClassService.getScheduledClassesByYearSection(dept, dbYear, dbSection)
      ])

      const assignedCount = sectionStudents.filter(s => s.assigned_peer_tutor_id).length

      setAnalytics({
        totalPeerTutors: tutors.length,
        totalStudents: sectionStudents.length,
        totalClasses: classes.length,
        totalAttendanceRecords: 0, // Will be calculated if needed
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
      const students = await StudentService.getStudentsBySection(dept, dbYear, dbSection)
      const scheduledClasses = await ScheduledClassService.getScheduledClassesByYearSection(dept, dbYear, dbSection)
      
      // Get class statistics for each tutor
      const tutorsWithStats = await Promise.all(tutors.map(async (tutor) => {
        // Calculate the minimum date for classes (day after peer tutor was created)
        const createdDate = new Date(tutor.created_at)
        createdDate.setHours(0, 0, 0, 0)
        const minimumClassDate = new Date(createdDate)
        minimumClassDate.setDate(minimumClassDate.getDate() + 1) // Day after creation
        
        // Get class statistics for this tutor, only counting classes from day after creation
        const tutorClasses = scheduledClasses.filter(sc => {
          if (sc.peer_tutor_id !== tutor.id) return false
          const classDate = new Date(sc.scheduled_date)
          classDate.setHours(0, 0, 0, 0)
          return classDate >= minimumClassDate
        })
        const completedClasses = tutorClasses.filter(sc => sc.completion_status === 'completed').length
        const pendingClasses = tutorClasses.filter(sc => sc.completion_status === 'pending' || sc.completion_status === 'not_started').length
        const totalClasses = tutorClasses.length
        
        // Get additional classes count
        const additionalClasses = await AdditionalClassService.getAdditionalClassesByPeerTutor(tutor.id)
        // Filter by current section (additional classes should have dept, year, section if they were created in the AttendanceTab)
        const sectionAdditionalClasses = additionalClasses.filter(ac => {
          // Since additional classes might not have dept/year/section directly,
          // we'll count all additional classes for peer tutors in this section
          return true
        })
        
        // Get assigned students count
        const assignedStudents = students.filter(s => s.assigned_peer_tutor_id === tutor.id)
        
        return {
          'Name': tutor.name,
          'Email': tutor.email,
          'Total Classes Allocated': totalClasses,
          'Completed Classes': completedClasses,
          'Pending Classes': pendingClasses,
          'Additional Classes Taken': sectionAdditionalClasses.length,
          'Students Assigned': assignedStudents.length
        }
      }))

      const ws = XLSX.utils.json_to_sheet(tutorsWithStats)
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
          'Assigned Peer Tutor': assignedTutor?.name || 'Not assigned'
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
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-black">{analytics.totalPeerTutors}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Peer Tutors</div>
          </div>
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-black">{analytics.totalStudents}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Students</div>
          </div>
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-black">{analytics.assignedStudents}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Assigned</div>
          </div>
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-black">{analytics.totalClasses}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Subjects</div>
          </div>
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-black">{analytics.scheduledClasses}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Scheduled</div>
          </div>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 overflow-x-auto">
          <nav className="-mb-px flex space-x-4 sm:space-x-6 lg:space-x-8 px-4 sm:px-6 min-w-max sm:min-w-0" aria-label="Import Export Tabs">
            <button
              onClick={() => setActiveSubTab('import')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                activeSubTab === 'import'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Import
            </button>
            <button
              onClick={() => setActiveSubTab('export')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                activeSubTab === 'export'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Export
            </button>
            <button
              onClick={() => setActiveSubTab('advanced')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                activeSubTab === 'advanced'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Advanced
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {activeSubTab === 'import' && (
            <div>
              <div className="mb-4">
                <div className="flex items-center mb-2">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">Import Data</h3>
                </div>
                <p className="text-xs sm:text-sm text-gray-600">Upload Excel files to import peer tutors, students, and classes</p>
              </div>

              <div className="space-y-6">
                <div className="bg-white rounded-lg p-4 sm:p-6 border border-gray-200">
                  <BulkImportExport 
                    dept={dept} 
                    year={year} 
                    section={section} 
                    onImportComplete={onImportComplete}
                  />
                </div>
                
                <div className="bg-white rounded-lg p-4 sm:p-6 border border-gray-200">
                  <ClassesImportExport 
                    dept={dept} 
                    year={year} 
                    section={section} 
                    facultyId={facultyId}
                    onImportComplete={onImportComplete}
                  />
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'export' && (
    <div>
      <div className="mb-6">
                <div className="flex items-center mb-2">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">EXPORT DATA TO EXCEL</h3>
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
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13.5 3.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-black-600 bg-gray-100 px-2 py-1 rounded">XLSX</span>
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
                  
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
        </div>
                <span className="text-xs font-semibold text-black bg-gray-100 px-2 py-1 rounded">XLSX</span>
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
                <span className="text-xs font-semibold text-black bg-gray-100 px-2 py-1 rounded">XLSX</span>
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
                <span className="text-xs font-semibold text-black bg-gray-100 px-2 py-1 rounded">XLSX</span>
              </div>
              <h4 className="text-sm font-semibold text-gray-900 mb-1">Attendance Records</h4>
              <p className="text-xs text-gray-500">Export all attendance data</p>
            </button>
          </div>
            </div>
          )}

          {activeSubTab === 'advanced' && (
            <div>
              {/* Advanced Sub-tabs */}
              <div className="mb-6">
                <nav className="flex space-x-4 sm:space-x-6 lg:space-x-8 border-b border-gray-200">
                  <button
                    onClick={() => setActiveAdvancedTab('general')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                      activeAdvancedTab === 'general'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    General
                  </button>
                  <button
                    onClick={() => setActiveAdvancedTab('attendance')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                      activeAdvancedTab === 'attendance'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Attendance
                  </button>
                  <button
                    onClick={() => setActiveAdvancedTab('nextTopicSheet')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                      activeAdvancedTab === 'nextTopicSheet'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Next Topic Sheet
                  </button>
                  <button
                    onClick={() => setActiveAdvancedTab('mark')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 ${
                      activeAdvancedTab === 'mark'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Mark
                  </button>
                </nav>
              </div>

              {/* Advanced Tab Content */}
              {activeAdvancedTab === 'general' && (
                <GeneralTab dept={dept} year={dbYear} section={dbSection} />
              )}
              {activeAdvancedTab === 'attendance' && (
                <AdvancedAttendanceTab dept={dept} year={dbYear} section={dbSection} />
              )}
              {activeAdvancedTab === 'nextTopicSheet' && (
                <div className="text-center py-12">
                  <p className="text-gray-500">Next Topic Sheet content coming soon...</p>
                </div>
              )}
              {activeAdvancedTab === 'mark' && (
                <div className="text-center py-12">
                  <p className="text-gray-500">Mark content coming soon...</p>
                </div>
              )}
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

  // Export assignments (only table rows shown + header)
  const handleExportAssignments = async () => {
    try {
      const rows: any[] = []
      peerTutorsWithStudents.forEach(({ peerTutor, students }) => {
        students.forEach((student) => {
          rows.push({
            'Peer Tutor': peerTutor.name,
            'Peer Tutor Email': peerTutor.email,
            'Student': student.name,
            'Student Email': student.email
          })
        })
      })

      const headers = ['Peer Tutor', 'Peer Tutor Email', 'Student', 'Student Email']
      const ws = createSheetWithHeader(dept, year, section, 'Assignments', rows, headers)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Assignments')
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
        {assignments.length > 0 && (
          <button
            onClick={handleExportAssignments}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export</span>
          </button>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-xl sm:text-2xl font-bold text-black">{stats.assignedStudents}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Assigned</div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-xl sm:text-2xl font-bold text-black">{stats.unassignedStudents}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Unassigned</div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-xl sm:text-2xl font-bold text-black">{stats?.averageStudentsPerTutor || 0}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Avg Students/Tutor</div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-xl sm:text-2xl font-bold text-black">{stats?.totalPeerTutors && stats?.totalStudents ? Math.round((stats.assignedStudents / stats.totalStudents) * 100) : 0}%</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Assignment Rate</div>
          </div>
        </div>
      )}

      {/* Manual Assignment Section */}
      {unassignedStudents.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Manual Assignment</h3>
              <p className="text-sm text-gray-600 mt-1">Assign unassigned students to peer tutors</p>
            </div>
            <button
              onClick={handleAutoAssign}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Auto Assign</span>
            </button>
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

      {/* Current Assignments Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Current Assignments</h3>
          <p className="text-sm text-gray-600 mt-1">View all peer tutor and student assignments</p>
        </div>
        
        {peerTutorsWithStudents.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments found</h3>
            <p className="text-gray-500 text-sm px-4">Add peer tutors to this section to start assigning students.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 sm:px-4 md:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] sm:min-w-[150px]">
                      Peer Tutor
                    </th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[140px] sm:min-w-[180px]">
                      Peer Tutor Email
                    </th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] sm:min-w-[150px]">
                      Student
                    </th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[140px] sm:min-w-[180px]">
                      Student Email
                    </th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] sm:min-w-[100px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {peerTutorsWithStudents.flatMap(({ peerTutor, students }) => {
                    if (students.length === 0) {
                      return [
                        <tr key={`${peerTutor.id}-empty`} className="hover:bg-gray-50">
                          <td className="px-3 sm:px-4 md:px-6 py-4 text-center align-middle border-r border-gray-200">
                            <div className="flex flex-col items-center justify-center min-w-0">
                              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mb-2">
                                <span className="text-sm font-medium text-blue-600">
                                  {getInitials(peerTutor.name)}
                                </span>
                              </div>
                              <div className="text-sm font-medium text-gray-900 break-words text-center px-1 max-w-full">
                                {peerTutor.name}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 md:px-6 py-4 text-center align-middle border-r border-gray-200">
                            <div 
                              className="text-xs sm:text-sm text-gray-500 break-words text-center px-1 min-w-0 max-w-full" 
                              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                            >
                              {peerTutor.email}
                            </div>
                          </td>
                          <td colSpan={3} className="px-3 sm:px-4 md:px-6 py-4 text-center">
                            <div className="text-sm text-gray-500 italic">No students assigned</div>
                          </td>
                        </tr>
                      ]
                    }
                    return students.map((student, index) => (
                      <tr key={`${peerTutor.id}-${student.id}`} className="hover:bg-gray-50">
                        {index === 0 && (
                          <>
                            <td 
                              rowSpan={students.length} 
                              className="px-3 sm:px-4 md:px-6 py-4 text-center align-middle border-r border-gray-200"
                            >
                              <div className="flex flex-col items-center justify-center min-w-0">
                                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mb-2">
                                  <span className="text-sm font-medium text-blue-600">
                                    {getInitials(peerTutor.name)}
                                  </span>
                                </div>
                                <div className="text-sm font-medium text-gray-900 break-words text-center px-1 max-w-full">
                                  {peerTutor.name}
                                </div>
                              </div>
                            </td>
                            <td 
                              rowSpan={students.length} 
                              className="px-3 sm:px-4 md:px-6 py-4 text-center align-middle border-r border-gray-200"
                            >
                              <div 
                                className="text-xs sm:text-sm text-gray-500 break-words text-center px-1 min-w-0 max-w-full" 
                                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                              >
                                {peerTutor.email}
                              </div>
                            </td>
                          </>
                        )}
                        <td className="px-3 sm:px-4 md:px-6 py-4">
                          <div className="flex items-center min-w-0">
                            <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mr-2 sm:mr-3">
                              <span className="text-xs font-medium text-green-600">
                                {getInitials(student.name)}
                              </span>
                            </div>
                            <div className="text-sm font-medium text-gray-900 break-words min-w-0 flex-1">
                              {student.name}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 md:px-6 py-4">
                          <div 
                            className="text-xs sm:text-sm text-gray-500 break-words min-w-0 max-w-full" 
                            style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                          >
                            {student.email}
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 md:px-6 py-4 text-center text-sm font-medium">
                          <button
                            onClick={() => handleUnassignStudent(student.id)}
                            className="text-red-600 hover:text-red-900 px-2 sm:px-3 py-1 rounded-md hover:bg-red-50 transition-colors text-xs sm:text-sm whitespace-nowrap"
                          >
                            Unassign
                          </button>
                        </td>
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            </div>
          </div>
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

    // Validate section is not 'ALL'
    if (!dbSection || dbSection.trim().toUpperCase() === 'ALL') {
      alert('Cannot create class with section "ALL". Please navigate to a specific section page.')
      return
    }

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
      } else {
        alert('Failed to create class. Please check the console for details.')
      }
    } catch (error) {
      console.error('Error adding class:', error)
      alert('Error creating class: ' + (error instanceof Error ? error.message : 'Unknown error'))
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

  const handleExportSubjects = async () => {
    try {
      const subjectRows = getSubjectsWithAllocations().map((s) => ({
        'Name': s.name,
        'Classes Allocated': s.classesAllocated,
        'Peer Tutors Allocated': s.peerTutorsAllocated,
        'Status': s.isScheduled ? 'Scheduled' : 'Not scheduled'
      }))

      const headers = ['Name', 'Classes Allocated', 'Peer Tutors Allocated', 'Status']
      const ws = createSheetWithHeader(dept, year, section, 'Subjects', subjectRows, headers)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Subjects')
      const fileName = `subjects_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)
      setShowExportModal(false)
    } catch (error) {
      console.error('Error exporting subjects:', error)
      alert('Failed to export subjects')
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

  // Get subjects with their allocation data for table view
  const getSubjectsWithAllocations = () => {
    const subjectMap = new Map<string, {
      name: string,
      classesAllocated: number,
      peerTutorsAllocated: number,
      isScheduled: boolean
    }>()

    // Process all classes
    classes.forEach(classItem => {
      const scheduledForClass = scheduledClasses.filter(sc => sc.class_id === classItem.id)
      const uniquePeerTutors = new Set(scheduledForClass.map(sc => sc.peer_tutor_id))
      
      if (!subjectMap.has(classItem.subject_name)) {
        subjectMap.set(classItem.subject_name, {
          name: classItem.subject_name,
          classesAllocated: 0,
          peerTutorsAllocated: 0,
          isScheduled: false
        })
      }
      
      const subjectData = subjectMap.get(classItem.subject_name)!
      subjectData.classesAllocated += scheduledForClass.length
      subjectData.peerTutorsAllocated = Math.max(subjectData.peerTutorsAllocated, uniquePeerTutors.size)
      subjectData.isScheduled = scheduledForClass.length > 0 || subjectData.isScheduled
    })

    return Array.from(subjectMap.values()).sort((a, b) => a.name.localeCompare(b.name))
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

  // Group scheduled classes by subject and date for table view
  const getGroupedScheduledClasses = () => {
    const filtered = getFilteredAndSortedScheduledClasses()
    
    // Group by subject name and scheduled date
    const grouped = new Map<string, {
      subject_name: string
      scheduled_date: string
      peer_tutor_count: number
      scheduled_class_ids: string[]
    }>()

    filtered.forEach(scheduledClass => {
      const key = `${scheduledClass.class.subject_name}-${scheduledClass.scheduled_date}`
      
      if (!grouped.has(key)) {
        grouped.set(key, {
          subject_name: scheduledClass.class.subject_name,
          scheduled_date: scheduledClass.scheduled_date,
          peer_tutor_count: 0,
          scheduled_class_ids: []
        })
      }
      
      const group = grouped.get(key)!
      group.peer_tutor_count++
      group.scheduled_class_ids.push(scheduledClass.id)
    })

    return Array.from(grouped.values())
  }

  // Handle deletion of scheduled class group (all peer tutors for a subject on a specific date)
  const handleDeleteScheduledClassGroup = async (subjectName: string, scheduledDate: string) => {
    if (!confirm(`Are you sure you want to remove the schedule for "${subjectName}" on ${new Date(scheduledDate).toLocaleDateString('en-GB')}? This will remove the schedule for all peer tutors assigned to this subject on this date.`)) {
      return
    }

    try {
      // Find all scheduled classes for this subject and date
      const classesToDelete = scheduledClasses.filter(sc => 
        sc.class.subject_name === subjectName && sc.scheduled_date === scheduledDate
      )

      // Delete each scheduled class
      for (const scheduledClass of classesToDelete) {
        const success = await ScheduledClassService.deleteScheduledClass(scheduledClass.id)
        if (!success) {
          console.error(`Failed to delete scheduled class ${scheduledClass.id}`)
        }
      }

      // Reload classes to reflect changes
      await loadClasses()
    } catch (error) {
      console.error('Error deleting scheduled class group:', error)
      alert('Failed to remove schedule. Please try again.')
    }
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
      {/* Subjects List */}
      <div className="bg-white rounded-lg">
        <div className="border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Subjects ({classes.length}) - Scheduled ({getGroupedScheduledClasses().length})
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Manage subjects and schedules for this section
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center space-x-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Add New Subject</span>
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
                  <span>Export Subjects</span>
                </button>
              )}
            </div>
          </div>
          
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
                All Subjects
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
        <div className="border border-gray-200">
          {activeSubTab === 'all' ? (
            // All Subjects Tab
            classes.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-4">
                  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No subjects created</h3>
                <p className="text-gray-500">Click "Add New Subject" to create the first subject for this section.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Classes Allocated
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Peer Tutors Allocated
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {getSubjectsWithAllocations().map((subject) => (
                      <tr key={subject.name} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                              subject.isScheduled ? 'bg-green-100' : 'bg-blue-100'
                            }`}>
                              <svg className={`h-4 w-4 ${
                                subject.isScheduled ? 'text-green-600' : 'text-blue-600'
                              }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{subject.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                          {subject.classesAllocated}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                          {subject.peerTutorsAllocated}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            subject.isScheduled 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {subject.isScheduled ? 'Scheduled' : 'Not scheduled'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center">
                          <button
                            onClick={() => {
                              // Find the first class for this subject to delete
                              const classToDelete = classes.find(c => c.subject_name === subject.name)
                              if (classToDelete) {
                                handleDeleteClass(classToDelete.id)
                              }
                            }}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : activeSubTab === 'scheduled' ? (
            // Scheduled Subjects Tab
            <div>
              {scheduledClasses.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-4">
                    <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No scheduled subjects</h3>
                  <p className="text-gray-500">Click "Assign Dates" to schedule subjects for this section.</p>
                </div>
              ) : (
                <div>
                  {/* Filter and Sort Controls */}
                  <div className="mb-6 w-48 flex flex-col sm:flex-row gap-4 mx-4 my-4">
                    <div className="flex-1">
                      <select
                        value={filterByClass}
                        onChange={(e) => setFilterByClass(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">All Subjects</option>
                        {getUniqueSubjects().map((subject) => (
                          <option key={subject} value={subject}>
                            {subject}
                          </option>
                        ))}
                      </select>
                    </div>
                    </div>

                  {/* Scheduled Subjects Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Subject Name
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Scheduled Date
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Day
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            No. of Peer Tutors
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {getGroupedScheduledClasses().map((group) => (
                          <tr key={`${group.subject_name}-${group.scheduled_date}`} className="hover:bg-green-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-8 w-8">
                                  <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                                    <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">{group.subject_name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">
                                {new Date(group.scheduled_date).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric'
                                })}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-green-600 font-medium">
                                {new Date(group.scheduled_date).toLocaleDateString('en-US', {
                                  weekday: 'long'
                                })}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900 font-semibold">
                                {group.peer_tutor_count}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center">
                              <button
                                onClick={() => handleDeleteScheduledClassGroup(group.subject_name, group.scheduled_date)}
                                className="text-red-600 hover:text-red-800"
                              >
                                Remove Schedule
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : null}
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
                onClick={handleExportSubjects}
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
  const [additionalClasses, setAdditionalClasses] = useState<any[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [selectedClassType, setSelectedClassType] = useState<'scheduled' | 'additional'>('scheduled')
  const [peerTutorAttendance, setPeerTutorAttendance] = useState<any[]>([])
  const [selectedPeerTutor, setSelectedPeerTutor] = useState<any>(null)
  const [studentDetails, setStudentDetails] = useState<any[]>([])
  const [view, setView] = useState<'classes' | 'peer-tutors' | 'students'>('classes')
  const [expandedClassRows, setExpandedClassRows] = useState<Set<string>>(new Set())
  const [expandedPeerTutorRows, setExpandedPeerTutorRows] = useState<Set<string>>(new Set())
  const [peerTutorStudentDetails, setPeerTutorStudentDetails] = useState<Map<string, any[]>>(new Map())
  const [subjectAttendanceRate, setSubjectAttendanceRate] = useState<Record<string, number>>({})
  const [presentScheduledClassIds, setPresentScheduledClassIds] = useState<Set<string>>(new Set())

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

  const loadAdditionalClasses = async () => {
    try {
      // Get all peer tutors for this section
      const peerTutors = await PeerTutorService.getPeerTutorsBySection(dept, dbYear, dbSection)
      
      // Get additional classes for all peer tutors
      const allAdditionalClasses = await Promise.all(
        peerTutors.map(async (tutor) => {
          const classes = await AdditionalClassService.getAdditionalClassesByPeerTutor(tutor.id)
          return classes.map(cls => ({
            ...cls,
            peer_tutor: {
              id: tutor.id,
              name: tutor.name,
              email: tutor.email
            },
            dept,
            year: dbYear,
            section: dbSection,
            class: {
              id: cls.id,
              subject_name: cls.subject_name,
              created_at: cls.created_at
            },
            scheduled_date: cls.class_date,
            isAdditional: true
          }))
        })
      )
      
      const flattened = allAdditionalClasses.flat()
      const sortedAdditionalClasses = flattened.sort((a, b) => {
        const dateA = new Date(a.class_date)
        const dateB = new Date(b.class_date)
        return dateA.getTime() - dateB.getTime()
      })
      
      console.log('Loaded additional classes:', sortedAdditionalClasses)
      setAdditionalClasses(sortedAdditionalClasses)
    } catch (error) {
      console.error('Error loading additional classes:', error)
      setAdditionalClasses([])
    }
  }

  // Compute peer tutor attendance percentage per subject for scheduled classes only
  useEffect(() => {
    const computeSubjectAttendanceRate = async () => {
      try {
        if (!scheduledClasses || scheduledClasses.length === 0) {
          setSubjectAttendanceRate({})
          return
        }
        const supabase = createClient()
        const scheduledIds = scheduledClasses.map(sc => sc.id)
        const { data, error } = await supabase
          .from('attendance')
          .select('scheduled_class_id')
          .in('scheduled_class_id', scheduledIds)

        if (error) {
          console.error('Error loading attendance for rate calc:', error)
          setSubjectAttendanceRate({})
          return
        }

        const presentSet = new Set<string>((data || [])
          .map((r: any) => r.scheduled_class_id)
          .filter(Boolean))

        // store for per-date calculations
        setPresentScheduledClassIds(new Set<string>(presentSet))

        const bySubject = new Map<string, string[]>()
        scheduledClasses.forEach(sc => {
          const subject = sc.class.subject_name
          if (!bySubject.has(subject)) bySubject.set(subject, [])
          bySubject.get(subject)!.push(sc.id)
        })

        const rateMap: Record<string, number> = {}
        bySubject.forEach((ids, subject) => {
          const total = ids.length
          const present = ids.filter(id => presentSet.has(id)).length
          const rate = total > 0 ? Math.round((present / total) * 100) : 0
          rateMap[subject] = rate
        })

        setSubjectAttendanceRate(rateMap)
      } catch (err) {
        console.error('Error computing subject attendance rate:', err)
        setSubjectAttendanceRate({})
      }
    }

    computeSubjectAttendanceRate()
  }, [scheduledClasses])

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


  const loadPeerTutorAttendanceForClass = async (classIdOrSubject: string, isAdditional: boolean = false) => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      console.log('Loading peer tutor attendance for class:', classIdOrSubject, 'isAdditional:', isAdditional)
      
      const peerTutorAttendanceList: any[] = []
      
      if (isAdditional) {
        // Handle additional class
        const additionalClass = additionalClasses.find(ac => ac.id === classIdOrSubject)
        if (!additionalClass) {
          console.error('Additional class not found')
          return
        }
        
        // For additional classes, the peer tutor is always present (they created it)
        // Show attendance records from additional_class_attendance
        peerTutorAttendanceList.push({
          scheduled_class_id: additionalClass.id,
          peer_tutor_id: additionalClass.peer_tutor_id,
          peer_tutor_name: additionalClass.peer_tutor.name,
          peer_tutor_email: additionalClass.peer_tutor.email,
          attendance_status: 'present',
          completion_status: 'completed',
          present_count: additionalClass.attendance_records.filter((r: any) => r.status === 'present').length,
          absent_count: additionalClass.attendance_records.filter((r: any) => r.status === 'absent').length,
          total_count: additionalClass.attendance_records.length,
          isAdditional: true
        })
      } else {
        // Handle scheduled class
        const selectedScheduledClass = scheduledClasses.find(sc => sc.id === classIdOrSubject)
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
                total_count: 1,
                isAdditional: false
              })
            }
          })
        }
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
      console.log('Class ID:', scheduledClassId)
      console.log('Peer Tutor ID:', peerTutorId)
      
      // Check if this is an additional class
      const additionalClass = additionalClasses.find(ac => ac.id === scheduledClassId)
      
      if (additionalClass) {
        // Handle additional class attendance
        console.log('Loading student details for additional class:', additionalClass)
        
        const studentDetailsList = additionalClass.attendance_records.map((record: any) => ({
          student_id: record.student_id,
          student_name: record.student_name,
          student_email: '', // Additional class attendance doesn't have email in the record
          status: record.status,
          created_at: record.created_at,
          updated_at: record.updated_at
        }))
        
        // Fetch student emails if needed
        if (studentDetailsList.length > 0) {
          const studentIds = studentDetailsList.map((s: any) => s.student_id)
          const { data: students } = await supabase
            .from('peer_students')
            .select('id, email')
            .in('id', studentIds)
          
          const studentEmailMap = new Map(students?.map((s: any) => [s.id, s.email]) || [])
          studentDetailsList.forEach((student: any) => {
            student.student_email = studentEmailMap.get(student.student_id) || ''
          })
        }
        
        console.log('Student details for additional class:', studentDetailsList)
        setStudentDetails(studentDetailsList)
        return
      }
      
      // Handle scheduled class (existing logic)
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
    const isExpanded = expandedPeerTutorRows.has(peerTutor.peer_tutor_id)
    
    if (isExpanded) {
      // Collapse
      const newExpanded = new Set(expandedPeerTutorRows)
      newExpanded.delete(peerTutor.peer_tutor_id)
      setExpandedPeerTutorRows(newExpanded)
    } else {
      // Expand and load student details if not already loaded
      const newExpanded = new Set(expandedPeerTutorRows)
      newExpanded.add(peerTutor.peer_tutor_id)
      setExpandedPeerTutorRows(newExpanded)
      
      // Load student details if not already cached
      if (!peerTutorStudentDetails.has(peerTutor.peer_tutor_id)) {
        await loadStudentDetailsForPeerTutor(peerTutor.scheduled_class_id, peerTutor.peer_tutor_id)
      }
    }
  }
  
  const loadStudentDetailsForPeerTutor = async (scheduledClassId: string, peerTutorId: string) => {
    try {
      const supabase = createClient()
      
      // Check if this is an additional class
      const additionalClass = additionalClasses.find(ac => ac.id === scheduledClassId)
      
      if (additionalClass) {
        // Handle additional class attendance
        const studentDetailsList = additionalClass.attendance_records.map((record: any) => ({
          student_id: record.student_id,
          student_name: record.student_name,
          student_email: '',
          status: record.status,
          created_at: record.created_at,
          updated_at: record.updated_at
        }))
        
        // Fetch student emails if needed
        if (studentDetailsList.length > 0) {
          const studentIds = studentDetailsList.map((s: any) => s.student_id)
          const { data: students } = await supabase
            .from('peer_students')
            .select('id, email')
            .in('id', studentIds)
          
          const studentEmailMap = new Map(students?.map((s: any) => [s.id, s.email]) || [])
          studentDetailsList.forEach((student: any) => {
            student.student_email = studentEmailMap.get(student.student_id) || ''
          })
        }
        
        // Cache the student details
        const newMap = new Map(peerTutorStudentDetails)
        newMap.set(peerTutorId, studentDetailsList)
        setPeerTutorStudentDetails(newMap)
        return
      }
      
      // Handle scheduled class
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
      
      if (error) {
        console.error('Error loading student details:', error)
        return
      }
      
      // Process and store student details
      const students = (attendanceData || []).map(record => ({
        student_id: record.student_id,
        student_name: record.peer_students?.name || 'Unknown Student',
        student_email: record.peer_students?.email || 'No email',
        status: record.status,
        created_at: record.created_at
      }))
      
      // Cache the student details
      const newMap = new Map(peerTutorStudentDetails)
      newMap.set(peerTutorId, students)
      setPeerTutorStudentDetails(newMap)
    } catch (error) {
      console.error('Error in loadStudentDetailsForPeerTutor:', error)
    }
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
    // Group scheduled classes by subject_name to show unique classes with counts
    const groupedClasses = scheduledClasses.reduce((acc, scheduledClass) => {
      const subjectName = scheduledClass.class.subject_name
      if (!acc[subjectName]) {
        acc[subjectName] = {
          subject_name: subjectName,
          dept: scheduledClass.dept,
          year: scheduledClass.year,
          section: scheduledClass.section,
          peer_tutor_ids: new Set<string>(),
          dates: new Set<string>(),
          scheduled_class_ids: [] as string[]
        }
      }
      acc[subjectName].peer_tutor_ids.add(scheduledClass.peer_tutor_id)
      if (scheduledClass.scheduled_date) acc[subjectName].dates.add(scheduledClass.scheduled_date)
      acc[subjectName].scheduled_class_ids.push(scheduledClass.id)
      return acc
    }, {} as Record<string, { subject_name: string; dept: string; year: string; section: string; peer_tutor_ids: Set<string>; dates: Set<string>; scheduled_class_ids: string[] }>)

    const uniqueClasses = Object.values(groupedClasses).map(gc => ({
      subject_name: gc.subject_name,
      dept: gc.dept,
      year: gc.year,
      section: gc.section,
      total_scheduled_instances: gc.dates.size,
      peer_tutors_count: gc.peer_tutor_ids.size,
      scheduled_class_ids: gc.scheduled_class_ids
    }))

    const toggleExpandClass = (classId: string) => {
      const next = new Set(expandedClassRows)
      if (next.has(classId)) next.delete(classId)
      else next.add(classId)
      setExpandedClassRows(next)
    }

    const getDateSummaryForClass = (subjectName: string) => {
      const scheduledItems = scheduledClasses.filter(sc => sc.class.subject_name === subjectName)
      const byDate = new Map<string, { tutors: Set<string> }>()
      
      scheduledItems.forEach(sc => {
        const dateKey = sc.scheduled_date
        if (!dateKey) return
        if (!byDate.has(dateKey)) byDate.set(dateKey, { tutors: new Set<string>() })
        byDate.get(dateKey)!.tutors.add(sc.peer_tutor_id)
      })
      
      return Array.from(byDate.entries()).sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    }

    const handleClassSelect = async (classIdOrSubject: string) => {
      setSelectedClass(classIdOrSubject)
      setSelectedClassType('scheduled')
      setView('peer-tutors')
      await loadPeerTutorAttendanceForClass(classIdOrSubject, false)
    }

    return (
      <div>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
              {`Classes (${uniqueClasses.length}) - Scheduled (${scheduledClasses.length})`}
            </h3>
            <p className="text-xs sm:text-sm text-gray-600">
              Click on a class to view allocated peer tutors and attendance records
            </p>
          </div>
          
          {uniqueClasses.length > 0 && (
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
        {uniqueClasses.length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Mobile Card View */}
            <div className="block lg:hidden">
              {uniqueClasses.map((classItem) => (
                <div
                  key={classItem.subject_name}
                  onClick={() => handleClassSelect(classItem.subject_name)}
                  className="border-b border-gray-200 last:border-b-0 p-4 hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-medium text-gray-900 mb-1 truncate">
                        {classItem.subject_name}
                      </h4>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {classItem.total_scheduled_instances} Instance{classItem.total_scheduled_instances !== 1 ? 's' : ''}
                          </span>
                          <span className="text-xs text-gray-900">
                            {classItem.peer_tutors_count} Peer Tutor{classItem.peer_tutors_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-3">
                      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block">
              <div className="px-6 py-4 border-b border-gray-200">
                <h4 className="text-md font-medium text-gray-900">Scheduled Classes Overview</h4>
                <p className="text-sm text-gray-600 mt-1">
                  {uniqueClasses.length} scheduled classes
                </p>
              </div>
              <div className="w-full">
                <table className="w-full table-fixed divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-[40%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Class Name
                      </th>
                      <th className="w-[30%] px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Scheduled Classes
                      </th>
                      <th className="w-[30%] px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        PP Attendance %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {uniqueClasses.map((classItem) => (
                      <Fragment key={classItem.subject_name}>
                        <tr 
                          className="hover:bg-gray-50 transition-colors duration-200"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                              </div>
                              <button
                                onClick={() => toggleExpandClass(classItem.subject_name)}
                                className="text-sm font-medium text-gray-900 text-left"
                              >
                                {classItem.subject_name}
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {classItem.total_scheduled_instances}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-sm text-gray-900">
                                {subjectAttendanceRate[classItem.subject_name] !== undefined ? `${subjectAttendanceRate[classItem.subject_name]}%` : '-'}
                              </span>
                              <button
                                onClick={() => toggleExpandClass(classItem.subject_name)}
                                className="text-gray-500 hover:text-gray-700"
                                aria-label={expandedClassRows.has(classItem.subject_name) ? 'Collapse' : 'Expand'}
                              >
                                {expandedClassRows.has(classItem.subject_name) ? (
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedClassRows.has(classItem.subject_name) && (() => {
                          const dateSummary = getDateSummaryForClass(classItem.subject_name)
                          if (dateSummary.length === 0) {
                            return (
                              <tr key={`${classItem.subject_name}-expanded`} className="bg-gray-50">
                                <td colSpan={3} className="px-6 py-4">
                                  <div className="text-sm text-gray-500 text-center">No class instances found.</div>
                                </td>
                              </tr>
                            )
                          }
                          return (
                            <tr key={`${classItem.subject_name}-expanded`} className="bg-gray-50">
                              <td colSpan={3} className="px-6 py-4">
                                <div className="w-full">
                                  <table className="w-full table-fixed divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th className="w-[18%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                          Date
                                        </th>
                                        <th className="w-[18%] px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                          Day
                                        </th>
                    <th className="w-[24%] px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Attendance
                    </th>
                                        <th className="w-[12%] px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                          Peer Tutors
                                        </th>
                                        <th className="w-[28%] px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                          Actions
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                      {dateSummary.map(([dateStr, data]) => (
                                        <tr key={dateStr} className="hover:bg-gray-50">
                                          <td className="px-4 py-4">
                                            <div className="text-sm text-gray-900">
                                              {new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            </div>
                                          </td>
                                          <td className="px-4 py-4 text-center">
                        <div className="text-sm text-gray-700 font-medium">
                                              {new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long' })}
                                            </div>
                                          </td>
                                          <td className="px-4 py-4 text-center">
                        {(() => {
                          const idsForDate = scheduledClasses
                            .filter(sc => sc.class.subject_name === classItem.subject_name && sc.scheduled_date === dateStr)
                            .map(sc => sc.id)
                          const total = idsForDate.length
                          const present = idsForDate.filter(id => presentScheduledClassIds.has(id)).length
                          const rate = total > 0 ? Math.round((present / total) * 100) : 0
                          return (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {rate}%
                            </span>
                          )
                        })()}
                                          </td>
                                          <td className="px-4 py-4 text-center">
                                            <div className="text-sm text-gray-900">
                                              {data.tutors.size}
                                            </div>
                                          </td>
                                          <td className="px-4 py-4 text-sm font-medium text-center">
                                            <button
                                              onClick={() => {
                            const scheduledMatch = scheduledClasses.find(sc => sc.class.subject_name === classItem.subject_name && sc.scheduled_date === dateStr)
                                                if (scheduledMatch) {
                                                  handleClassSelect(scheduledMatch.id)
                                                }
                                              }}
                                              className="text-blue-600 hover:text-blue-800"
                                            >
                                              View Details
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )
                        })()}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
    const displayClass = selectedScheduledClass
    const classDate = selectedScheduledClass?.scheduled_date
    
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
                {displayClass?.class?.subject_name || 'Unknown'} - Peer Tutor Attendance
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                <span className="font-medium">Date:</span> {classDate && new Date(classDate).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  weekday: 'short'
                })}
              </p>
            </div>
          </div>
          
          {/* Export Button */}
          {peerTutorAttendance.length > 0 && (
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
          )}
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
                    <th className="px-6 py-3 text-left text-xs font-medium te`xt-gray-500 uppercase tracking-wider">
                      Attendance Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {peerTutorAttendance.map((peerTutor) => (
                    <>
                      <tr key={peerTutor.peer_tutor_id} className="hover:bg-gray-50 cursor-pointer">
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
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-900">
                              {peerTutorStudentDetails.get(peerTutor.peer_tutor_id)?.length || 0} Student{(peerTutorStudentDetails.get(peerTutor.peer_tutor_id)?.length || 0) !== 1 ? 's' : ''}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handlePeerTutorClick(peerTutor)
                              }}
                              className="ml-4 text-gray-500 hover:text-gray-700"
                              aria-label={expandedPeerTutorRows.has(peerTutor.peer_tutor_id) ? 'Collapse' : 'Expand'}
                            >
                              {expandedPeerTutorRows.has(peerTutor.peer_tutor_id) ? (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              ) : (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedPeerTutorRows.has(peerTutor.peer_tutor_id) && (() => {
                        const students = peerTutorStudentDetails.get(peerTutor.peer_tutor_id) || []
                        if (students.length === 0) {
                          return (
                            <tr key={`${peerTutor.peer_tutor_id}-expanded`} className="bg-gray-50">
                              <td colSpan={4} className="px-6 py-4">
                                <div className="text-sm text-gray-500 text-center">No student attendance records found.</div>
                              </td>
                            </tr>
                          )
                        }
                        return (
                          <tr key={`${peerTutor.peer_tutor_id}-expanded`} className="bg-gray-50">
                            <td colSpan={4} className="px-6 py-4">
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
                                        Attendance Status
                                      </th>
                                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Recorded At
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {students.map((student) => (
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
                                          <div className="text-xs text-gray-500">
                                            {student.created_at ? new Date(student.created_at).toLocaleTimeString() : 'N/A'}
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )
                      })()}
                    </>
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
  const [activeTab, setActiveTab] = useState<'peer-tutors' | 'students' | 'assign' | 'classes' | 'attendance'  | 'import-export'>('peer-tutors')
  const [loading, setLoading] = useState(true)
  const [peerTutors, setPeerTutors] = useState<PeerTutor[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  
  // Delete confirmation modal state
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Check if sidebar is collapsed - read from localStorage first (source of truth)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed')
      if (saved !== null) {
        return JSON.parse(saved)
      }
    }
    return false
  })

  // Listen for sidebar collapse state changes
  useEffect(() => {
    const checkSidebarState = () => {
      if (typeof window !== 'undefined') {
        // Read from localStorage first (sidebar's source of truth)
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved !== null) {
          const collapsed = JSON.parse(saved)
          setIsSidebarCollapsed(collapsed)
        } else {
          // Fallback to DOM check if localStorage doesn't have value
          const sidebar = document.querySelector('[data-sidebar-collapsed]')
          if (sidebar) {
            const collapsed = sidebar.getAttribute('data-sidebar-collapsed') === 'true'
            setIsSidebarCollapsed(collapsed)
          }
        }
      }
    }

    // Check initially with a small delay to ensure sidebar has rendered
    const timer = setTimeout(checkSidebarState, 0)

    // Listen for custom events
    const handleSidebarToggle = () => {
      // Use a small delay to ensure localStorage is updated
      setTimeout(checkSidebarState, 0)
    }
    window.addEventListener('sidebar-toggle', handleSidebarToggle)

    // Also listen for storage changes (in case sidebar state changes in another tab/window)
    window.addEventListener('storage', checkSidebarState)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('sidebar-toggle', handleSidebarToggle)
      window.removeEventListener('storage', checkSidebarState)
    }
  }, [])

  // Handle tab parameter from URL
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && ['peer-tutors', 'students', 'assign', 'classes', 'attendance', 'import-export'].includes(tabParam)) {
      setActiveTab(tabParam as 'peer-tutors' | 'students' | 'assign' | 'classes' | 'attendance'  | 'import-export')
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

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      // Reload all data
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
            name: facultyDepartment,
            faculty_name: user?.user_metadata?.full_name || user?.user_metadata?.name || 'Faculty Member'
          })

          // Load peer tutors for this section using actual department
          const tutors = await PeerTutorService.getPeerTutorsBySection(
            facultyDepartment,
            yearIdStr,
            sectionIdStr
          )
          setPeerTutors(tutors)

          // Load students for this section using actual department
          const sectionStudents = await StudentService.getStudentsBySection(
            facultyDepartment,
            yearIdStr,
            sectionIdStr
          )
          setStudents(sectionStudents)
        } catch (error) {
          console.error('Error refreshing section data:', error)
        }
      }

      await loadData()
      setLastRefresh(new Date())
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
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

  const handleRemovePeerTutor = async (tutorId: string) => {
    try {
      const result = await PeerTutorService.removePeerTutor(tutorId)
      if (result.success) {
        handlePeerTutorAssigned() // Reload data
        alert(result.message)
      } else {
        // Check if the error is about assigned students
        if (result.message.includes('students are still assigned')) {
          const forceDelete = confirm(`${result.message}\n\nDo you want to force delete this peer tutor? This will unassign all students.`)
          if (forceDelete) {
            const forceResult = await PeerTutorService.removePeerTutor(tutorId, true)
            if (forceResult.success) {
              handlePeerTutorAssigned() // Reload data
              alert(forceResult.message)
            } else {
              alert(forceResult.message)
            }
          }
        } else {
          alert(result.message)
        }
      }
    } catch (error) {
      console.error('Error removing peer tutor:', error)
      alert('An unexpected error occurred while deleting the peer tutor.')
    }
  }

  const handleRemoveStudent = async (studentId: string) => {
    try {
      const success = await StudentService.removeStudent(studentId)
      if (success) {
        handleStudentAdded() // Reload data
        alert('Student deleted successfully')
      } else {
        alert('Failed to delete student')
      }
    } catch (error) {
      console.error('Error removing student:', error)
      alert('An unexpected error occurred while deleting the student.')
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
      <div className="min-h-screen bg-gray-50">
        {/* Sidebar */}
        <FacultySidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Main content */}
        <div className={`${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 h-16 w-full">
          <div className={`max-w-full mx-auto h-full flex items-center ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
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
                      Loading...
                    </h1>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Loading Content */}
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading section data...</p>
            </div>
          </main>
        </div>
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
        <header className="bg-white shadow-sm border-b border-gray-200 h-16 w-full">
          <div className={`max-w-full mx-auto h-full flex items-center ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
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
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Refresh data"
                >
                  <svg 
                    className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  onClick={() => router.back()}
                  className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors"
                >
                  <svg 
                    className="w-4 h-4 mr-2" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1">
          <div className={`max-w-full mx-auto py-6 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
            {/* Interactive Breadcrumb */}
            <div className="mb-4">
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
                  dept={department?.name || 'Computer Science'}
                  year={yearId}
                  section={sectionId}
                />
              ) : activeTab === 'students' ? (
                <StudentsTab 
                  students={students} 
                  peerTutors={peerTutors}
                  setIsStudentModalOpen={setIsStudentModalOpen} 
                  handleRemoveStudent={handleRemoveStudent}
                  dept={department?.name || 'Computer Science'}
                  year={yearId}
                  section={sectionId}
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
              ) : activeTab === 'import-export' ? (
                <ImportExportTab 
                  dept={department?.name || 'Computer Science'} 
                  year={yearId} 
                  section={sectionId}
                  facultyId={department?.id || deptId}
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
      </div>
    </div>
  )
}



