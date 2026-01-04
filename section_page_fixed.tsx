'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef, Fragment, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import Image from 'next/image'
import { PeerTutorService, PeerTutor } from '@/lib/services/peerTutorService'
import { StudentService, Student } from '@/lib/services/studentService'
import { AssignmentService } from '@/lib/services/assignmentService'
import AssignPeerTutorModal from '@/components/forms/AssignPeerTutorModal'
import AddStudentModal from '@/components/forms/AddStudentModal'
import BulkImportExport from '@/components/forms/BulkImportExport'
import ClassesImportExport from '@/components/forms/ClassesImportExport'
import AssignmentImportModal from '@/components/forms/AssignmentImportModal'
import PeerTutorImportModal from '@/components/forms/PeerTutorImportModal'
import StudentImportModal from '@/components/forms/StudentImportModal'
import DateAssignmentModal from '@/components/forms/DateAssignmentModal'
import { ClassService } from '@/lib/services/classService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { AttendanceService } from '@/lib/services/attendanceService'
import { FacultyService } from '@/lib/services/facultyService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import { ReportService } from '@/lib/services/reportService'
import DeleteConfirmationModal from '@/components/forms/DeleteConfirmationModal'

import { createClient } from '@/utils/supabase/client'
import { Users, MoreHorizontal, ArrowUpRight, Plus, Trash2, Download, Upload, Search, X, Eye } from 'lucide-react'
import { toast } from 'sonner'


import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { SectionPageSkeleton } from '@/components/skeletons/SectionPageSkeleton'
import { AssignTabSkeleton } from '@/components/skeletons/AssignTabSkeleton'
import { ClassesTabSkeleton } from '@/components/skeletons/ClassesTabSkeleton'
import AttendanceTabSkeleton from '@/components/skeletons/AttendanceTabSkeleton'
import ImportExportTabSkeleton from '@/components/skeletons/ImportExportTabSkeleton'
import TransferModal from '@/components/common/TransferModal'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatedRefreshButton } from '@/components/ui/AnimatedRefreshButton'
import { BackButton } from '@/components/ui/BackButton'

// Helper to build an XLSX worksheet with a common header block and ordered columns
function createSheetWithHeader(
  dept: string,
  year: string,
  section: string,
  title: string,
  rows: Array<Record<string, unknown>>,
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
    const ordered: Record<string, unknown> = {}
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
  handleRemovePeerTutor: (tutorId: string, silent?: boolean) => Promise<{ success: boolean } | void>
  onPeerTutorClick: (tutorId: string) => void
  dept: string
  year: string
  section: string
  onRefresh: () => Promise<void>
}

function PeerTutorsTab({ peerTutors, students, setIsModalOpen, handleRemovePeerTutor, onPeerTutorClick, dept, year, section, onRefresh }: PeerTutorsTabProps) {
  const [peerTutorsWithStats, setPeerTutorsWithStats] = useState<PeerTutorWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [peerTutorStudentCounts, setPeerTutorStudentCounts] = useState<{[key: string]: number}>({})
  const [sortBy, setSortBy] = useState<'name' | 'completed' | 'additional' | 'students'>('name')
  
  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  // Transfer state
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [itemsToTransfer, setItemsToTransfer] = useState<Array<{id: string, name: string, email: string, hasAssignment: boolean}>>([])
  
  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false)
  const handleTransfer = async (newSection: string, ids: string[]) => {
    try {
      const success = await PeerTutorService.transferPeerTutors(ids, newSection)
      if (success) {
        // Refresh page or update local state
        await onRefresh()
        toast.success('Peer tutors transferred successfully')
      }
    } catch (error) {
      console.error('Failed to transfer peer tutors:', error)
    }
  }

  const openTransferModal = () => {
    const selectedIds = Array.from(selectedPeerTutors)
    const items = peerTutorsWithStats
      .filter(pt => selectedIds.includes(pt.id))
      .map(pt => ({
        id: pt.id,
        name: pt.name,
        email: pt.email,
        hasAssignment: (peerTutorStudentCounts[pt.id] || 0) > 0
      }))
    
    setItemsToTransfer(items)
    setShowTransferModal(true)
  }
  const [showSortPopup, setShowSortPopup] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  const [selectedPeerTutors, setSelectedPeerTutors] = useState<Set<string>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<'selected' | 'single'>('selected')
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTransferMode, setIsTransferMode] = useState(false)
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
  }, [peerTutors, students, dept, year, section])

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

  // Filter and sort peer tutors
  const filteredAndSortedPeerTutors = [...peerTutorsWithStats]
    .filter(tutor => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        tutor.name.toLowerCase().includes(q) ||
        tutor.email.toLowerCase().includes(q) ||
        tutor.section.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
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

  // Keep backward compatibility
  const sortedPeerTutors = filteredAndSortedPeerTutors

  // Export function for peer tutors (matches table order + header)
  const exportPeerTutors = () => {
    const rows = peerTutorsWithStats.map(tutor => ({
      'Name': tutor.name,
      'Total Classes Allocated': tutor.classStats?.totalClasses || 0,
      'Completed Classes': tutor.classStats?.completedClasses || 0,
      'Pending Classes': tutor.classStats?.pendingClasses || 0,
      'Additional Classes Taken': tutor.additionalClassesCount || 0,
      'Students Assigned': peerTutorStudentCounts[tutor.id] || 0
    }))

    const headers = [
      'Name',
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



  const confirmDelete = async () => {
    const idsToDelete = deleteTarget === 'selected' 
      ? Array.from(selectedPeerTutors)
      : singleDeleteId ? [singleDeleteId] : []

    setIsDeleting(true)
    try {
      let successCount = 0
      for (const id of idsToDelete) {
        // Pass true as second argument for silent deletion
        const result = await handleRemovePeerTutor(id, true)
        if (result && result.success) successCount++
      }
      
      if (successCount > 0) {
        await onRefresh()
        toast.success(
          deleteTarget === 'selected' 
            ? `${successCount} PEER TUTORS DELETED SUCCESSFULLY` 
            : 'PEER TUTOR DELETED SUCCESSFULLY',
          {
            style: {
              background: '#FEF08A', // yellow-200
              color: '#854D0E',     // yellow-800
              border: '1px solid #FDE047',
              textTransform: 'uppercase',
              fontWeight: 'bold',
              fontFamily: 'inherit'
            },
            className: 'uppercase font-bold'
          }
        )
      }
    } catch (error) {
       console.error("Deletion failed", error)
       toast.error("FAILED TO DELETE PEER TUTORS", {
         style: { textTransform: 'uppercase', fontWeight: 'bold' }
       })
    } finally {
      setIsDeleting(false)
      setSelectedPeerTutors(new Set())
      setSingleDeleteId(null)
      setShowDeleteModal(false)
      setIsDeleteMode(false)
    }
  }

  const toggleDeleteMode = () => {
    setIsDeleteMode(!isDeleteMode)
    setIsTransferMode(false)
    setSelectedPeerTutors(new Set())
  }

  const toggleTransferMode = () => {
    setIsTransferMode(!isTransferMode)
    setIsDeleteMode(false)
    setSelectedPeerTutors(new Set())
  }

  const cancelTransferMode = () => {
    setIsTransferMode(false)
    setSelectedPeerTutors(new Set())
  }

  const cancelDeleteMode = () => {
    setIsDeleteMode(false)
    setSelectedPeerTutors(new Set())
  }


  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Tutors / Students</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{peerTutors.length} <span className="text-gray-300 text-2xl font-normal">/</span> {Object.values(peerTutorStudentCounts).reduce((a, b) => a + b, 0)}</div>
          <div className="flex items-center text-emerald-500 text-xs font-bold relative z-10">
             <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
             <span>ALLOCATED</span>
          </div>
        </div>
        
        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Total Classes</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{peerTutorsWithStats.reduce((acc, t) => acc + (t.classStats?.totalClasses || 0), 0)}</div>
          <div className="flex items-center text-blue-500 text-xs font-bold relative z-10">
             <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
             <span>SCHEDULED</span>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Pending</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{peerTutorsWithStats.reduce((acc, t) => acc + (t.classStats?.pendingClasses || 0), 0)}</div>
          <div className="flex items-center text-orange-500 text-xs font-bold relative z-10">
             <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
             <span>REMAINING</span>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Additional Classes</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{peerTutorsWithStats.reduce((acc, t) => acc + (t.additionalClassesCount || 0), 0)}</div>
          <div className="flex items-center text-blue-500 text-xs font-bold relative z-10">
             <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
             <span>TOTAL CLASSES</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-medium text-gray-900">PEER TUTORS ({peerTutors.length})</h3>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {!isDeleteMode && !isTransferMode && (
            <>
          {/* Search Bar */}
          {peerTutors.length > 0 && (
          <div className={`relative flex items-center transition-all duration-300 ease-in-out ${isSearchExpanded ? 'w-64' : 'w-10'}`}>
            {isSearchExpanded ? (
              <div className="absolute inset-0 flex items-center w-full">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search peer tutor..."
                  className="w-full pl-10 pr-8 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
                  autoFocus
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <button 
                  onClick={() => {
                    setIsSearchExpanded(false)
                    setSearchQuery('')
                  }}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsSearchExpanded(true)}
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-all shadow-sm w-full flex justify-center"
              >
                <Search className="w-5 h-5" />
              </button>
            )}
          </div>
          )}

          {/* Divider */}
          {peerTutors.length > 0 && <div className="h-8 w-[1px] bg-gray-200 mx-1"></div>}

          {/* Sort Button - Icon Only */}
          {peerTutors.length > 0 && (
          <div className="relative" ref={sortRef}>
          <button
              onClick={() => setShowSortPopup(!showSortPopup)}
              className="w-12 h-12 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all flex items-center justify-center"
              title="Sort peer tutors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>

            {/* Sort Popup */}
            {showSortPopup && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                <div className="p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">SORT BY</h4>
                  
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
                      NAME (A-Z)
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
                      COMPLETED CLASSES (HIGH TO LOW)
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
                      ADDITIONAL CLASSES (HIGH TO LOW)
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
                      STUDENTS ASSIGNED (HIGH TO LOW)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* ADD Button - Prominent */}
          <button 
            onClick={() => setIsModalOpen(true)}
            className="h-12 px-8 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Users className="w-4 h-4" />
            ADD
          </button>

          {/* Transfer Button */}
          {peerTutors.length > 0 && (
          <button
            onClick={toggleTransferMode}
            className="h-12 px-6 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-100 text-sm font-medium transition-all flex items-center justify-center gap-2"
          >
            <ArrowUpRight className="w-4 h-4" />
            TRANSFER
          </button>
          )}

          {/* Delete Button */}
          {peerTutors.length > 0 && (
          <button
            onClick={toggleDeleteMode}
            className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 transition-all flex items-center justify-center group"
            title="Delete peer tutors"
          >
            <svg className="w-5 h-5 text-white group-hover:text-red-100 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
          )}

          {/* Import/Export Buttons */}
            <button
              onClick={() => setShowImportModal(true)}
              className="h-12 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <Upload className="w-4 h-4" />
              IMPORT
            </button>
            {sortedPeerTutors.length > 0 && (
              <button
                onClick={exportPeerTutors}
                className="h-12 px-4 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                EXPORT
              </button>
            )}
            </>
          )}

          {/* Delete Mode Actions */}
          {isDeleteMode && selectedPeerTutors.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="h-12 px-6 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              DELETE ({selectedPeerTutors.size})
            </button>
          )}
          {isDeleteMode && (
            <button
              onClick={cancelDeleteMode}
              className="h-12 px-6 bg-gray-500 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-all"
            >
              CANCEL
            </button>
          )}

          {/* Transfer Mode Actions */}
          {isTransferMode && selectedPeerTutors.size > 0 && (
            <button
              onClick={openTransferModal}
              className="h-12 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2"
            >
              <ArrowUpRight className="w-4 h-4" />
              CONFIRM({selectedPeerTutors.size})
            </button>
          )}

          {isTransferMode && (
            <button
              onClick={cancelTransferMode}
              className="h-12 px-6 bg-gray-500 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-all"
            >
              CANCEL
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <TableSkeleton />
      ) : sortedPeerTutors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-lg">
           <Image src="/icons/student.png" alt="No peer tutors assigned" width={96} height={96} className="mx-auto opacity-60 grayscale" />
          <p className="text-lg font-semibold text-gray-900 mb-2">NO PEER TUTOR ASSIGNED</p>
          <p className="text-sm text-gray-500 text-center px-4">Click &quot;ADD&quot; to Assign a Peer Tutor</p>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="block lg:hidden space-y-4">
            {sortedPeerTutors.map((tutor) => (
              <div key={tutor.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-start gap-3">
                    {(isDeleteMode || isTransferMode) && (
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
                    <div className="bg-gray-100 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Classes</p>
                      <p className="text-xl font-bold text-black">{tutor.classStats.totalClasses}</p>
                    </div>
                    
                    <div className="bg-gray-100 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Completed</p>
                      <p className="text-xl font-bold text-black">{tutor.classStats.completedClasses}</p>
                    </div>
                    
                    <div className="bg-gray-100 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pending</p>
                      <p className="text-xl font-bold text-black">{tutor.classStats.pendingClasses}</p>
                    </div>
                    
                    <div className="bg-gray-100 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Additional</p>
                      <p className="text-xl font-bold text-black">{tutor.additionalClassesCount || 0}</p>
                    </div>
                    
                    <div className="bg-gray-100 rounded-lg p-3 col-span-2">
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
          <thead className="bg-white border-b border-gray-100">
            <tr>
              {(isDeleteMode || isTransferMode) && (
                <th className="px-6 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedPeerTutors.size === sortedPeerTutors.length && sortedPeerTutors.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                  />
                </th>
              )}
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                PEER TUTOR
              </th>
              <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                YEAR & SECTION
              </th>
              <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                CLASSES ALLOCATED
              </th>
              <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                COMPLETED
              </th>
              <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                PENDING
              </th>
              <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                ADDITIONAL
              </th>
              <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                STUDENTS
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
                {sortedPeerTutors.map((tutor) => (
                <tr key={tutor.id} className="group hover:bg-gray-50 transition-colors">
                  {(isDeleteMode || isTransferMode) && (
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
                     <div className="flex items-center cursor-pointer" onClick={() => onPeerTutorClick(tutor.id)}>
                        <div className="flex-shrink-0 h-10 w-10">
                           <div className="w-10 h-10 rounded-full bg-black border border-gray-800 flex items-center justify-center ring-1 ring-gray-900 shadow-inner">
                                       <span className="text-gray-400 font-bold text-sm tracking-tighter">
                                         {tutor.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                       </span>
                                     </div>
                        </div>
                        <div className="ml-4">
                           <div className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{tutor.name}</div>
                           <div className="text-xs text-gray-500">{tutor.email}</div>
                        </div>
                     </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-500 font-medium">
                       {tutor.year || '2'} - {tutor.section || 'A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-bold text-gray-900">
                      {tutor.classStats.totalClasses}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-bold text-gray-900">
                      {tutor.classStats.completedClasses}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-bold text-gray-900">
                      {tutor.classStats.pendingClasses}
                    </div>
                  </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm font-bold text-black">
                        {tutor.additionalClassesCount || 0}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-bold text-black">
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
        title="PEER TUTOR DELETION"
        itemsToDelete={itemsToDelete}
        type="peer-tutors"
        isLoading={isDeleting}
      />

      <TransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onTransfer={handleTransfer}
        items={itemsToTransfer}
        type="peerTutors"
        dept={dept}
        year={year}
        currentSection={section}
      />
      
      {/* Peer Tutor Import Modal */}
      {showImportModal && (
        <PeerTutorImportModal
          dept={dept}
          year={year}
          section={section}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false)
            // Refresh the page to show new peer tutors
            onRefresh()
          }}
        />
      )}
    </div>
  )
}

interface StudentsTabProps {
  students: Student[]
  peerTutors: PeerTutor[]
  setIsStudentModalOpen: (isOpen: boolean) => void
  handleRemoveStudent: (studentId: string, silent?: boolean) => Promise<boolean | void>
  dept: string
  year: string
  section: string
  onRefresh: () => Promise<void>
}

function StudentsTab({ students, peerTutors, setIsStudentModalOpen, handleRemoveStudent, dept, year, section, onRefresh }: StudentsTabProps) {
  const [filteredStudents, setFilteredStudents] = useState<Student[]>(students)

  const [selectedPeerTutor, setSelectedPeerTutor] = useState<string>('all')
  const [showFilterPopup, setShowFilterPopup] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<'selected' | 'single'>('selected')
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTransferMode, setIsTransferMode] = useState(false)
  const [itemsToDeleteStudents, setItemsToDeleteStudents] = useState<Array<{name: string, email: string, additionalInfo: string}>>([])

  const [loading, setLoading] = useState(true)

  // Transfer state
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [itemsToTransfer, setItemsToTransfer] = useState<Array<{id: string, name: string, email: string, hasAssignment: boolean}>>([])
  
  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false)

  const handleTransfer = async (newSection: string, ids: string[]) => {
    try {
      const success = await StudentService.transferStudents(ids, newSection)
      if (success) {
        // Refresh page or update local state
        await onRefresh()
        toast.success('Students transferred successfully')
      }
    } catch (error) {
      console.error('Failed to transfer students:', error)
    }
  }

  const openTransferModal = () => {
    const selectedIds = Array.from(selectedStudents)
    const items = students
      .filter(s => selectedIds.includes(s.id))
      .map(s => ({
        id: s.id,
        name: s.name,
        email: s.email,
        hasAssignment: !!s.assigned_peer_tutor_id
      }))
    
    setItemsToTransfer(items)
    setShowTransferModal(true)
  }

  useEffect(() => {
    setLoading(false)
  }, [])

  // Apply peer tutor filter and search
  useEffect(() => {
    let filtered = students

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(student =>
        student.name.toLowerCase().includes(q) ||
        student.email.toLowerCase().includes(q) ||
        student.section.toLowerCase().includes(q)
      )
    }

    // Apply peer tutor filter
    if (selectedPeerTutor !== 'all') {
      filtered = filtered.filter(student => student.assigned_peer_tutor_id === selectedPeerTutor)
    }

    setFilteredStudents(filtered)
  }, [students, selectedPeerTutor, searchQuery])

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

  // Basic sorting by name (can be enhanced with proper sort controls later)
  const sortedStudents = useMemo(() => {
    const copy = [...filteredStudents]
    copy.sort((a, b) => a.name.localeCompare(b.name))
    return copy
  }, [filteredStudents])

  // Export function for students (matches table order + header)
  const exportStudents = () => {
    const rows = filteredStudents.map(student => {
      const assignedPeerTutor = peerTutors.find(tutor => tutor.id === student.assigned_peer_tutor_id)
      return {
        'Name': student.name,
        'Year & Section': `${student.year} - ${student.section}`,
        'Assigned Peer Tutor': assignedPeerTutor?.name || 'Not assigned'
      }
    })

    const headers = ['Name', 'Year & Section', 'Assigned Peer Tutor']
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




  const confirmDeleteStudents = async () => {
    const idsToDelete = deleteTarget === 'selected' 
      ? Array.from(selectedStudents)
      : singleDeleteId ? [singleDeleteId] : []

    setIsDeleting(true)
    try {
      let successCount = 0
      for (const id of idsToDelete) {
        // Pass true for silent to prevent individual toasts
        const success = await handleRemoveStudent(id, true)
        if (success) successCount++
      }
      
      await onRefresh()
      
      if (successCount > 0) {
        toast.success(
          deleteTarget === 'selected' 
            ? `${successCount} STUDENTS DELETED SUCCESSFULLY` 
            : 'STUDENT DELETED SUCCESSFULLY',
          {
            style: {
              background: '#FEF08A', // yellow-200
              color: '#854D0E',     // yellow-800
              border: '1px solid #FDE047',
              textTransform: 'uppercase',
              fontWeight: 'bold',
              fontFamily: 'inherit'
            },
            className: 'uppercase font-bold'
          }
        )
      }
    } catch (error) {
       console.error("Deletion failed", error)
       toast.error("FAILED TO DELETE STUDENTS")
    } finally {
      setIsDeleting(false)
      setSelectedStudents(new Set())
      setSingleDeleteId(null)
      setShowDeleteModal(false)
      setIsDeleteMode(false)
    }
  }


  const toggleDeleteModeStudents = () => {
    setIsDeleteMode(!isDeleteMode)
    setIsTransferMode(false)
    setSelectedStudents(new Set())
  }

  const toggleTransferMode = () => {
    setIsTransferMode(!isTransferMode)
    setIsDeleteMode(false)
    setSelectedStudents(new Set())
  }

  const cancelTransferMode = () => {
    setIsTransferMode(false)
    setSelectedStudents(new Set())
  }

  const cancelDeleteModeStudents = () => {
    setIsDeleteMode(false)
    setSelectedStudents(new Set())
  }


  return (
    <div>
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Total Students</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{students.length}</div>
          <div className="flex items-center text-emerald-500 text-xs font-bold relative z-10">
             <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
             <span>TOTAL</span>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Assigned / Unassigned</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{students.filter(s => s.assigned_peer_tutor_id).length} <span className="text-gray-300 text-2xl font-normal">/</span> {students.length}</div>
          <div className="flex items-center text-blue-500 text-xs font-bold relative z-10">
             <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
             <span>ALLOCATED</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-medium text-gray-900">
            STUDENTS ({filteredStudents.length} of {students.length})
            {hasActiveFilters && (
              <span className="ml-2 text-sm text-blue-600">
                (Filtered)
              </span>
            )}
          </h3>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Delete Mode Actions */}
          {isDeleteMode && selectedStudents.size > 0 && (
            <button
              onClick={handleBulkDeleteStudents}
              className="h-12 px-6 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              DELETE ({selectedStudents.size})
            </button>
          )}
          {isDeleteMode && (
            <button
              onClick={cancelDeleteModeStudents}
              className="h-12 px-6 bg-gray-500 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-all"
            >
              CANCEL
            </button>
          )}

          {/* Transfer Mode Actions */}
          {isTransferMode && selectedStudents.size > 0 && (
            <button
              onClick={openTransferModal}
              className="h-12 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2"
            >
              <ArrowUpRight className="w-4 h-4" />
              CONFIRM ({selectedStudents.size})
            </button>
          )}

          {isTransferMode && (
            <button
              onClick={cancelTransferMode}
              className="h-12 px-6 bg-gray-500 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-all"
            >
              CANCEL
            </button>
          )}
          {!isDeleteMode && !isTransferMode && (
            <>
          {/* Search Bar */}
          {students.length > 0 && (
          <div className={`relative flex items-center transition-all duration-300 ease-in-out ${isSearchExpanded ? 'w-64' : 'w-10'}`}>
            {isSearchExpanded ? (
              <div className="absolute inset-0 flex items-center w-full">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search students..."
                  className="w-full pl-10 pr-8 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
                  autoFocus
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <button 
                  onClick={() => {
                    setIsSearchExpanded(false)
                    setSearchQuery('')
                  }}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsSearchExpanded(true)}
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-all shadow-sm w-full flex justify-center"
              >
                <Search className="w-5 h-5" />
              </button>
            )}
          </div>
          )}

          {/* Divider */}
          {students.length > 0 && <div className="h-8 w-[1px] bg-gray-200 mx-1"></div>}

          {/* Filter Button - Icon Only */}
          {students.length > 0 && (
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilterPopup(!showFilterPopup)}
              className="w-12 h-12 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all flex items-center justify-center"
              title="Filter students"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>

            {/* Filter Popup */}
            {showFilterPopup && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-900">FILTER STUDENTS</h4>
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        CLEAR ALL
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">PEER TUTOR</label>
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
          )}

          {/* ADD Button - Prominent */}
          <button 
            onClick={() => setIsStudentModalOpen(true)}
            className="h-12 px-8 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            ADD
          </button>

          {/* Transfer Button */}
          {students.length > 0 && (
          <button
            onClick={toggleTransferMode}
            className="h-12 px-6 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-100 text-sm font-medium transition-all flex items-center justify-center gap-2"
          >
            <ArrowUpRight className="w-4 h-4" />
            TRANSFER
          </button>
          )}
          


          {/* Delete Button - Circular with User Icon */}
          {students.length > 0 && (
          <button
            onClick={toggleDeleteModeStudents}
            className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 transition-all flex items-center justify-center group"
            title="Delete students"
          >
            <svg className="w-5 h-5 text-white group-hover:text-red-100 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
          )}
          {/* Import/Export Buttons */}
            <button
              onClick={() => setShowImportModal(true)}
              className="h-12 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <Upload className="w-4 h-4" />
              IMPORT
            </button>
            {filteredStudents.length > 0 && (
              <button
                onClick={exportStudents}
                className="h-12 px-4 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                EXPORT
              </button>
            )}
            </>
          )}
        </div>
      </div>
      
      {loading ? (
        <TableSkeleton />
      ) : filteredStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-lg">
         <Image src="/icons/student.png" alt="No students found" width={96} height={96} className="mx-auto opacity-60 grayscale" />
          <p className="text-lg font-semibold text-gray-900 mb-2">NO STUDENTS FOUND</p>
          <p className="text-sm text-gray-500 text-center px-4">Click &quot;ADD&quot; to add students</p>
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
                      {(isDeleteMode || isTransferMode) && (
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
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-gray-100 text-black border border-gray-200 uppercase tracking-wider">
                            {assignedPeerTutor.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-white text-gray-400 border border-gray-100 uppercase tracking-wider">
                            Not assigned
                          </span>
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
              <thead className="bg-white border-b border-gray-100">
                <tr>
                  {(isDeleteMode || isTransferMode) && (
                    <th className="px-6 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0}
                        onChange={handleSelectAllStudents}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    STUDENT
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                    STATUS
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                    ASSIGNED PEER TUTOR
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {sortedStudents.map((student) => {
                  const assignedPeerTutor = peerTutors.find(tutor => tutor.id === student.assigned_peer_tutor_id)
                  
                  return (
                    <tr key={student.id} className="group hover:bg-gray-50 transition-colors">
                      {(isDeleteMode || isTransferMode) && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedStudents.has(student.id)}
                            onChange={() => handleSelectOneStudent(student.id)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                          />
                        </td>
                      )}
                      
                      {/* Student Info */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 shadow-sm">
                              <span className="text-slate-700 font-bold text-sm tracking-tighter">
                                {student.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{student.name}</div>
                            <div className="text-xs text-gray-500">{student.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {assignedPeerTutor ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-md text-[10px] font-bold bg-gray-100 text-black border border-gray-200 uppercase tracking-widest shadow-sm">
                            Assigned
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-md text-[10px] font-medium bg-white text-gray-400 border border-gray-100 uppercase tracking-widest">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Assigned Peer Tutor */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {assignedPeerTutor ? (
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-bold text-gray-900">{assignedPeerTutor.name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
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
        isLoading={isDeleting}
      />

      <TransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onTransfer={handleTransfer}
        items={itemsToTransfer}
        type="students"
        dept={dept}
        year={year}
        currentSection={section}
      />
      
      {/* Student Import Modal */}
      {showImportModal && (
        <StudentImportModal
          dept={dept}
          year={year}
          section={section}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false)
            onRefresh()
          }}
        />
      )}
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

