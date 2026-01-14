/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef, Fragment, useMemo, useCallback, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import Image from 'next/image'
import { peertutorservice, peertutors } from '@/lib/services/peerTutorService'
import { StudentService, Student } from '@/lib/services/studentService'
import { AssignmentService } from '@/lib/services/assignmentService'
import AssignpeertutorsModal from '@/components/forms/modals/AssignPeerTutorModal'
import AddStudentModal from '@/components/forms/modals/AddStudentModal'
import BulkImportExport from '@/components/forms/import-export/BulkImportExport'
import ClassesImportExport from '@/components/forms/import-export/ClassesImportExport'
import AssignmentImportModal from '@/components/forms/import-export/AssignmentImportModal'
import PeerTutorsImportModal from '@/components/forms/import-export/PeerTutorImportModal'
import StudentImportModal from '@/components/forms/import-export/StudentImportModal'
import DateAssignmentModal from '@/components/forms/modals/DateAssignmentModal'
import ClassImportModal from '@/components/forms/import-export/ClassImportModal'
import { ClassService } from '@/lib/services/classService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { AttendanceService } from '@/lib/services/attendanceService'
import { FacultyService } from '@/lib/services/facultyService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import { ReportService } from '@/lib/services/reportService'
import DeleteConfirmationModal from '@/components/forms/modals/DeleteConfirmationModal'




import { createClient } from '@/lib/supabase/client'
import { Users, MoreHorizontal, ArrowUpRight, Plus, Trash2, Download, Upload, Search, X, Eye, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'


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

interface peertutorsWithStats extends peertutors 
{
  classStats: {
    totalClasses: number
    completedClasses: number
    pendingClasses: number
    upcomingClasses: number
    overdueClasses: number
    attendancePercentage: number
  }
  additionalClassesCount: number
}

interface PeerTutorTabProps {
  peerTutor: peertutors[]
  students: Student[]
  setIsModalOpen: (isOpen: boolean) => void
  handleRemovepeertutors: (tutorId: string, silent?: boolean) => Promise<{ success: boolean } | void>
  onpeertutorsClick: (tutorId: string) => void
  dept: string
  year: string
  section: string
  onRefresh: () => Promise<void>
}

function PeerTutorTab({ peerTutor, students, setIsModalOpen, handleRemovepeertutors, onpeertutorsClick, dept, year, section, onRefresh }: PeerTutorTabProps) {
  const [peerTutorWithStats, setpeerTutorWithStats] = useState<peertutorsWithStats[]>([])
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [peerTutortudentCounts, setpeerTutortudentCounts] = useState<{[key: string]: number}>({})
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
      const success = await peertutorservice.transferpeerTutor(ids, newSection)
      if (success) {
        // Refresh page or update local state
        await onRefresh()
        toast.success('Peer tutors transferred successfully')
      }
    } catch (error) {
      logger.error('Failed to transfer peer tutors:', error)
    }
  }

  const openTransferModal = () => {
    const selectedIds = Array.from(selectedpeerTutor)
    const items = peerTutorWithStats
      .filter(pt => selectedIds.includes(pt.id))
      .map(pt => ({
        id: pt.id,
        name: pt.name,
        email: pt.email,
        hasAssignment: (peerTutortudentCounts[pt.id] || 0) > 0
      }))
    
    setItemsToTransfer(items)
    setShowTransferModal(true)
  }
  const [showSortPopup, setShowSortPopup] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  const [selectedpeerTutor, setSelectedpeerTutor] = useState<Set<string>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<'selected' | 'single'>('selected')
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTransferMode, setIsTransferMode] = useState(false)
  const [itemsToDelete, setItemsToDelete] = useState<Array<{name: string, email: string, additionalInfo: string}>>([])


  useEffect(() => {
    const loadpeerTutortats = async () => {
      setLoading(true)
      try {
        const tutorsWithStats = await Promise.all(
          peerTutor.map(async (tutor) => {
            const classStats = await ScheduledClassService.getpeertutorsClassStats(tutor.id)
            // Get all additional classes for this peer tutor
            // Note: Since additional_classes table doesn't store dept/year/section,
            // we count all additional classes for the peer tutor
            // This is correct because peer tutors are already filtered by section,
            // so their additional classes should logically belong to this section
            const additionalClasses = await AdditionalClassService.getAdditionalClassesBypeertutors(tutor.id)
            
            
            // Debug logging
            logger.info(`Peer Tutor ${tutor.name} (${tutor.id}):`, {
              dept: tutor.dept,
              year: tutor.year,
              section: tutor.section,
              currentSection: { dept, year, section },
              additionalClassesCount: additionalClasses.length,
              matchesSection: tutor.dept === dept && tutor.year === year && tutor.section === section
            })
            
            const attendancePercentage = classStats.totalClasses > 0 
              ? Math.round(((classStats.completedClasses + additionalClasses.length) / classStats.totalClasses) * 100)
              : 0
            
            return {
              ...tutor,
              classStats: {
                ...classStats,
                upcomingClasses: classStats.upcomingClasses || 0,
                overdueClasses: classStats.overdueClasses || 0,
                attendancePercentage
              },
              additionalClassesCount: additionalClasses.length
            }
          })
        )
        setpeerTutorWithStats(tutorsWithStats)

        // Calculate student counts for each peer tutor
        const studentCounts: {[key: string]: number} = {}
        peerTutor.forEach(tutor => {
          const count = students.filter(student => student.assigned_peer_tutor_id === tutor.id).length
          studentCounts[tutor.id] = count
        })
        setpeerTutortudentCounts(studentCounts)
      } catch (error) {
        logger.error('Error loading peer tutor stats:', error)
        // Fallback to original data without stats
        setpeerTutorWithStats(peerTutor.map(tutor => ({
          ...tutor,
          classStats: { totalClasses: 0, completedClasses: 0, pendingClasses: 0, upcomingClasses: 0, overdueClasses: 0, attendancePercentage: 0 },
          additionalClassesCount: 0
        })))
      } finally {
        setLoading(false)
      }
    }

    if (peerTutor.length > 0) {
      loadpeerTutortats()
    } else {
      setpeerTutorWithStats([])
      setpeerTutortudentCounts({})
      setLoading(false)
    }
  }, [peerTutor, students, dept, year, section])

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
  const filteredAndSortedpeerTutor = [...peerTutorWithStats]
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
          return (peerTutortudentCounts[b.id] || 0) - (peerTutortudentCounts[a.id] || 0)
        case 'name':
        default:
          return a.name.localeCompare(b.name)
      }
    })

  // Keep backward compatibility
  const sortedpeerTutor = filteredAndSortedpeerTutor

  // Export function for peer tutors (matches table order + header)
  const exportpeerTutor = () => {
    const rows = peerTutorWithStats.map(tutor => ({
      'Name': tutor.name,
      'Total Classes Allocated': tutor.classStats?.totalClasses || 0,
      'Completed Classes': tutor.classStats?.completedClasses || 0,
      'Pending Classes': tutor.classStats?.pendingClasses || 0,
      'Additional Classes Taken': tutor.additionalClassesCount || 0,
      'Students Assigned': peerTutortudentCounts[tutor.id] || 0
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
    if (selectedpeerTutor.size === sortedpeerTutor.length) {
      setSelectedpeerTutor(new Set())
    } else {
      setSelectedpeerTutor(new Set(sortedpeerTutor.map(t => t.id)))
    }
  }

  const handleSelectOne = (tutorId: string) => {
    const newSelected = new Set(selectedpeerTutor)
    if (newSelected.has(tutorId)) {
      newSelected.delete(tutorId)
    } else {
      newSelected.add(tutorId)
    }
    setSelectedpeerTutor(newSelected)
  }

  // Delete functions
  const handleBulkDelete = () => {
    const idsToDelete = Array.from(selectedpeerTutor)
    const items = peerTutorWithStats
      .filter(t => idsToDelete.includes(t.id))
      .map(t => ({
        name: t.name,
        email: t.email,
        additionalInfo: `${peerTutortudentCounts[t.id] || 0} student(s) assigned, ${t.classStats?.totalClasses || 0} total class(es)`
      }))
    
    setItemsToDelete(items)
    setDeleteTarget('selected')
    setShowDeleteModal(true)
  }



  const confirmDelete = async () => {
    const idsToDelete = deleteTarget === 'selected' 
      ? Array.from(selectedpeerTutor)
      : singleDeleteId ? [singleDeleteId] : []

    setIsDeleting(true)
    try {
      let successCount = 0
      for (const id of idsToDelete) {
        // Pass true as second argument for silent deletion
        const result = await handleRemovepeertutors(id, true)
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
       logger.error("Deletion failed", error)
       toast.error("FAILED TO DELETE PEER TUTORS", {
         style: { textTransform: 'uppercase', fontWeight: 'bold' }
       })
    } finally {
      setIsDeleting(false)
      setSelectedpeerTutor(new Set())
      setSingleDeleteId(null)
      setShowDeleteModal(false)
      setIsDeleteMode(false)
    }
  }

  const toggleDeleteMode = () => {
    setIsDeleteMode(!isDeleteMode)
    setIsTransferMode(false)
    setSelectedpeerTutor(new Set())
  }

  const toggleTransferMode = () => {
    setIsTransferMode(!isTransferMode)
    setIsDeleteMode(false)
    setSelectedpeerTutor(new Set())
  }

  const cancelTransferMode = () => {
    setIsTransferMode(false)
    setSelectedpeerTutor(new Set())
  }

  const cancelDeleteMode = () => {
    setIsDeleteMode(false)
    setSelectedpeerTutor(new Set())
  }




  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Stats Cards */}
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Peer Tutor Count */}
          <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">PEER TUTORS</h3>
            </div>
            <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">
              {peerTutor.length}
            </div>
            <div className="flex items-center text-blue-500 text-xs font-bold relative z-10">
               <span>TOTAL COUNT</span>
            </div>
          </div>
          
          {/* Card 2: Assigned Count */}
          <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">ASSIGNED</h3>
            </div>
            {(() => {
              const assignedpeerTutorCount = peerTutor.filter(pt => (peerTutortudentCounts[pt.id] || 0) > 0).length
              const notAssignedCount = peerTutor.length - assignedpeerTutorCount
              
              return (
                <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">
                  {assignedpeerTutorCount}<span className="text-gray-300 text-2xl font-normal">/</span>{notAssignedCount}
                </div>
              )
            })()}
            <div className="flex items-center text-emerald-500 text-xs font-bold relative z-10">
               <span>ASSIGNED / NOT ASSIGNED</span>
            </div>
          </div>
  
          {/* Card 3: Classes (Updated) */}
          <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">CLASSES</h3>
            </div>
            {(() => {
              // Calculate upcoming and overdue across all tutors
              const totalUpcoming = peerTutorWithStats.reduce((sum, pt) => sum + (pt.classStats?.upcomingClasses || 0), 0)
              const totalOverdue = peerTutorWithStats.reduce((sum, pt) => sum + (pt.classStats?.overdueClasses || 0), 0)
              
              return (
                <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10 flex items-baseline gap-2">
                  <span className="text-black">{totalUpcoming}</span>
                  <span className="text-gray-300 text-2xl font-normal">/</span>
                  <span className="text-black">{totalOverdue}</span>
                </div>
              )
            })()}
            <div className="flex items-center text-xs font-bold relative z-10 gap-2">
                 {/* Subtitle Removed as per user request */}
                 <span className="text-yellow-400">UPCOMING / </span>
                 <span className="text-red-400">PENDING</span>
            </div>
          </div>
  
          {/* Card 4: Additional Classes */}
          <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">ADDITIONAL CLASSES</h3>
            </div>
            {(() => {
              const totalAdditionalClasses = peerTutorWithStats.reduce((sum, pt) => sum + (pt.additionalClassesCount || 0), 0)

              return (
                <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">
                  {totalAdditionalClasses}
                </div>
              )
            })()}
            <div className="flex items-center text-purple-500 text-xs font-bold relative z-10">
               <span>TOTAL ADDITIONAL</span>
            </div>
          </div>
        </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-medium text-gray-900">PEER TUTORS ({peerTutor.length})</h3>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {!isDeleteMode && !isTransferMode && (
            <>
          {/* Search Bar */}
          {peerTutor.length > 0 && (
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
          {peerTutor.length > 0 && <div className="h-8 w-[1px] bg-gray-200 mx-1"></div>}

          {/* Sort Button - Icon Only */}
          {peerTutor.length > 0 && (
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

          {/* Delete Button */}
          {peerTutor.length > 0 && (
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

          {/* Transfer Button */}
          {peerTutor.length > 0 && (
          <button
            onClick={toggleTransferMode}
            className="h-12 px-6 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-100 text-sm font-medium transition-all flex items-center justify-center gap-2"
          >
            <ArrowUpRight className="w-4 h-4" />
            TRANSFER
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
            {sortedpeerTutor.length > 0 && (
              <button
                onClick={exportpeerTutor}
                className="h-12 px-4 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                EXPORT
              </button>
            )}
            </>
          )}

          {/* Delete Mode Actions */}
          {isDeleteMode && selectedpeerTutor.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="h-12 px-6 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              DELETE ({selectedpeerTutor.size})
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
          {isTransferMode && selectedpeerTutor.size > 0 && (
            <button
              onClick={openTransferModal}
              className="h-12 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2"
            >
              <ArrowUpRight className="w-4 h-4" />
              CONFIRM({selectedpeerTutor.size})
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
      ) : sortedpeerTutor.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-lg">
           <Image src="/icons/student.png" alt="No peer tutors assigned" width={96} height={96} className="mx-auto opacity-60 grayscale" />
          <p className="text-lg font-semibold text-gray-900 mb-2">NO PEER TUTOR ASSIGNED</p>
          <p className="text-sm text-gray-500 text-center px-4">Click &quot;ADD&quot; to Assign a Peer Tutor</p>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="block lg:hidden space-y-4">
            {sortedpeerTutor.map((tutor) => (
              <div key={tutor.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-start gap-3">
                    {(isDeleteMode || isTransferMode) && (
                      <input
                        type="checkbox"
                        checked={selectedpeerTutor.has(tutor.id)}
                        onChange={() => handleSelectOne(tutor.id)}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer mt-1"
                      />
                    )}
                    <div className="flex-1">
                      <button
                        onClick={() => onpeertutorsClick(tutor.id)}
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
                      <p className="text-xs text-purple-500 uppercase tracking-wide mb-1">Additional</p>
                      <p className="text-xl font-bold text-black">{tutor.additionalClassesCount || 0}</p>
                    </div>
                    
                    <div className="bg-gray-100 rounded-lg p-3 col-span-2">
                       <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Attendance</p>
                       <div className="flex items-center justify-between">
                         <p className="text-xl font-bold text-black">{tutor.classStats.attendancePercentage}%</p>
                         <div className="w-24 h-1.5 bg-white rounded-full overflow-hidden border border-gray-200">
                           <div 
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, tutor.classStats.attendancePercentage)}%` }}
                           ></div>
                         </div>
                       </div>
                    </div>
                    
                    <div className="bg-gray-100 rounded-lg p-3 col-span-2">
                       <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Students Assigned</p>
                       <p className="text-xl font-bold text-black">{peerTutortudentCounts[tutor.id] || 0}</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => onpeertutorsClick(tutor.id)}
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
                    checked={selectedpeerTutor.size === sortedpeerTutor.length && sortedpeerTutor.length > 0}
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
              <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider" title="(Completed Scheduled + Additional Classes) / Total Allocated Scheduled">
                ATTENDANCE
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
                {sortedpeerTutor.map((tutor) => (
                <tr key={tutor.id} className="group hover:bg-gray-50 transition-colors">
                  {(isDeleteMode || isTransferMode) && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedpeerTutor.has(tutor.id)}
                        onChange={() => handleSelectOne(tutor.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                     <div className="flex items-center cursor-pointer" onClick={() => onpeertutorsClick(tutor.id)}>
                        <div className="flex-shrink-0 h-10 w-10">
                           <div className="w-10 h-10 rounded-full bg-black border border-gray-800 flex items-center justify-center ring-1 ring-gray-900 shadow-inner">
                                       <span className="text-white font-bold text-sm tracking-tighter">
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
                      {peerTutortudentCounts[tutor.id] || 0}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-xs font-bold text-gray-900">
                        {tutor.classStats.attendancePercentage}%
                      </div>
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(100, tutor.classStats.attendancePercentage)}%` }}
                        ></div>
                      </div>
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
      

      



      {/* Import Modals */}
      {showImportModal && (
        <PeerTutorsImportModal
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
  peerTutor: peertutors[]
  setIsStudentModalOpen: (isOpen: boolean) => void
  handleRemoveStudent: (studentId: string, silent?: boolean) => Promise<boolean | void>
  dept: string
  year: string
  section: string
  onRefresh: () => Promise<void>
}

function StudentsTab({ students, peerTutor, setIsStudentModalOpen, handleRemoveStudent, dept, year, section, onRefresh }: StudentsTabProps) {
  const [filteredStudents, setFilteredStudents] = useState<Student[]>(students)

  const [selectedpeertutors, setSelectedpeertutors] = useState<string>('all')
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
      filtered = filtered.filter(student => {
        const assignedpeertutors = peerTutor.find(tutor => tutor.id === student.assigned_peer_tutor_id)
        return (
          student.name.toLowerCase().includes(q) ||
          student.email.toLowerCase().includes(q) ||
          student.section.toLowerCase().includes(q) ||
          assignedpeertutors?.name.toLowerCase().includes(q)
        )
      })
    }

    // Apply peer tutor filter
    if (selectedpeertutors !== 'all') {
      filtered = filtered.filter(student => student.assigned_peer_tutor_id === selectedpeertutors)
    }

    setFilteredStudents(filtered)
  }, [students, selectedpeertutors, searchQuery])

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

  const hasActiveFilters = selectedpeertutors !== 'all'

  const clearFilters = () => {
    setSelectedpeertutors('all')
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
      const assignedpeertutors = peerTutor.find(tutor => tutor.id === student.assigned_peer_tutor_id)
      return {
        'Name': student.name,
        'Year & Section': `${student.year} - ${student.section}`,
        'Assigned Peer Tutor': assignedpeertutors?.name || 'Not assigned'
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
        const assignedpeertutors = peerTutor.find(tutor => tutor.id === s.assigned_peer_tutor_id)
        return {
          name: s.name,
          email: s.email,
          additionalInfo: `${s.year} - ${s.section}${assignedpeertutors ? `, Assigned to: ${assignedpeertutors.name}` : ''}`
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
                        value={selectedpeertutors}
                        onChange={(e) => setSelectedpeertutors(e.target.value)}
                        className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="all">All Peer Tutors</option>
                        {peerTutor.map(tutor => (
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
              const assignedpeertutors = peerTutor.find(tutor => tutor.id === student.assigned_peer_tutor_id)
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
                        {assignedpeertutors ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-gray-100 text-black border border-gray-200 uppercase tracking-wider">
                            {assignedpeertutors.name}
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
                  const assignedpeertutors = peerTutor.find(tutor => tutor.id === student.assigned_peer_tutor_id)
                  
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
                        {assignedpeertutors ? (
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
                        {assignedpeertutors ? (
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-bold text-gray-900">{assignedpeertutors.name}</span>
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

interface PeertutorsDetailViewProps {
  peertutorsId: string
  peertutorsName: string
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

function PeertutorsDetailView({ peertutorsId, peertutorsName, onBack }: PeertutorsDetailViewProps) {
  const [loading, setLoading] = useState(true)
  const [subjectsData, setSubjectsData] = useState<SubjectAttendanceData[]>([])



  const loadDetailData = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()

      // Get students assigned to this peer tutor
      const students = await AttendanceService.getStudentsForAttendance(peertutorsId)
      
      // Get all subjects assigned to this peer tutor
      const subjects = await ReportService.getpeerTutorubjects(peertutorsId)
      
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
        .eq('peer_tutor_id', peertutorsId)
        .order('scheduled_date', { ascending: true })

      // Get all additional classes for this peer tutor
      const additionalClasses = await AdditionalClassService.getAdditionalClassesBypeertutors(peertutorsId)

      // Get all attendance records for scheduled classes
      const scheduledClassIds = (scheduledClasses || []).map(sc => sc.id)
      const { data: attendanceRecords } = await supabase
        .from('attendance')
        .select('scheduled_class_id, student_id, status')
        .in('scheduled_class_id', scheduledClassIds)

      // Create attendance map: scheduled_class_id -> student_id -> status
      const attendanceMap = new Map<string, Map<string, 'P' | 'A'>>()
      attendanceRecords?.forEach(record => {
        if (!attendanceMap.has(record.scheduled_class_id)) {
          attendanceMap.set(record.scheduled_class_id, new Map())
        }
        attendanceMap.get(record.scheduled_class_id)!.set(record.student_id, record.status as 'P' | 'A')
      })

      // Get all attendance records for additional classes
      const additionalClassIds = additionalClasses.map(ac => ac.id)
      const { data: additionalAttendanceRecords } = additionalClassIds.length > 0 
        ? await supabase
            .from('additional_class_attendance')
            .select('additional_class_id, student_id, status')
            .in('additional_class_id', additionalClassIds)
        : { data: [] }

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

      subjects.forEach((subject: any) => {
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
  }, [peertutorsId])

  useEffect(() => {
    loadDetailData()
  }, [loadDetailData])

  if (loading) {
    return <TableSkeleton />
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
        <span className="text-gray-900 font-medium">{peertutorsName}</span>
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

interface peertutorsGeneralRow {
  peertutorsName: string
  peertutorsId: string
  classesAllocated: { completed: number; total: number }
  additionalClassesTaken: number
  attendancePercentage: number
}

function GeneralTab({ dept, year, section }: GeneralTabProps) {
  const [loading, setLoading] = useState(true)
  const [generalData, setGeneralData] = useState<peertutorsGeneralRow[]>([])
  const [selectedpeertutors, setSelectedpeertutors] = useState<string | null>(null)
  const [selectedpeertutorsName, setSelectedpeertutorsName] = useState<string>('')

  const loadGeneralData = useCallback(async () => {
    try {
      setLoading(true)
      
      // Get all peer tutors for this section
      const peerTutor = await peertutorservice.getpeerTutorBySection(dept, year, section)
      
      // Get stats for each peer tutor
      const tutorsWithStats = await Promise.all(
        peerTutor.map(async (tutor) => {
          const classStats = await ScheduledClassService.getpeertutorsClassStats(tutor.id)
          const additionalClasses = await AdditionalClassService.getAdditionalClassesBypeertutors(tutor.id)
          
          // Calculate attendance percentage
          // Formula: (completed classes + additional classes) / total classes allocated * 100
          const numerator = classStats.completedClasses + additionalClasses.length
          const denominator = classStats.totalClasses
          const attendancePercentage = denominator > 0 
            ? Math.round((numerator / denominator) * 100) 
            : 0
          
          return {
            peertutorsName: tutor.name,
            peertutorsId: tutor.id,
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
  }, [dept, year, section])

  useEffect(() => {
    loadGeneralData()
  }, [dept, year, section, loadGeneralData])



  if (loading) {
    return <TableSkeleton />
  }

  if (selectedpeertutors) {
    return (
      <PeertutorsDetailView
        peertutorsId={selectedpeertutors}
        peertutorsName={selectedpeertutorsName}
        onBack={() => {
          setSelectedpeertutors(null)
          setSelectedpeertutorsName('')
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
                      <div className="text-sm font-medium text-gray-900">{row.peertutorsName}</div>
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
                        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                        onClick={() => {
                          setSelectedpeertutors(row.peertutorsId)
                          setSelectedpeertutorsName(row.peertutorsName)
                        }}
                      >
                        VIEW
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

interface peertutorsAttendanceRow {
  sNo: number
  peertutorsName: string
  subject: string
  hour: number
  dateAttendance: { [date: string]: 'P' | 'A' | '' }
  totalHoursPresent: number
  attendancePercentage: number
}

function AdvancedAttendanceTab({ dept, year, section }: AdvancedAttendanceTabProps) {
  const [loading, setLoading] = useState(true)
  const [attendanceData, setAttendanceData] = useState<peertutorsAttendanceRow[]>([])
  const [dates, setDates] = useState<string[]>([])

  const loadAttendanceData = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()

      // Get all peer tutors for this section
      const peerTutor = await peertutorservice.getpeerTutorBySection(dept, year, section)
      
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
      const rows: peertutorsAttendanceRow[] = []
      let sNo = 1

      // Group by peer tutor and subject
      const tutorSubjectMap = new Map<string, Map<string, any[]>>()
      
      scheduledClasses?.forEach(sc => {
        const tutorId = sc.peer_tutor_id
        const subjectName = sc.class?.subject_name || 'Unknown'
        // const key = `${tutorId}-${subjectName}`
        
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
      peerTutor.forEach(tutor => {
        const subjectMap = tutorSubjectMap.get(tutor.id)
        if (!subjectMap || subjectMap.size === 0) {
          // Add row even if no subjects assigned
          rows.push({
            sNo: sNo++,
            peertutorsName: tutor.name,
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
              peertutorsName: tutor.name,
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
  }, [dept, year, section])

  useEffect(() => {
    loadAttendanceData()
  }, [dept, year, section, loadAttendanceData])



  if (loading) {
    return <AttendanceTabSkeleton />
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 border border-gray-200">
            <thead className="bg-white border-b border-gray-100">
              <tr>
                <th rowSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider border border-gray-200 bg-white">
                  S.NO
                </th>
                <th rowSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider border border-gray-200 bg-white">
                  NAME
                </th>
                <th rowSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider border border-gray-200 bg-white">
                  HOUR
                </th>
                {dates.length > 0 && (
                  <th colSpan={dates.length} className="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider border border-gray-200 bg-white">
                    DATE
                  </th>
                )}
                <th colSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider border border-gray-200 bg-white">
                  NO OF HOURS PRESENT
                </th>
              </tr>
              {/* Second header row */}
              <tr>
                {dates.map((date, idx) => {
                  const dateObj = new Date(date)
                  const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })
                  return (
                    <th key={idx} className="px-2 py-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider border border-gray-200 bg-white min-w-[60px]">
                      {formattedDate}
                    </th>
                  )
                })}
                <th className="px-4 py-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider border border-gray-200 bg-white">
                  HOURS
                </th>
                <th className="px-4 py-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider border border-gray-200 bg-white">
                  %
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {attendanceData.length === 0 ? (
                <tr>
                  <td colSpan={4 + dates.length + 2} className="px-6 py-8 text-center text-sm text-gray-500">
                    No attendance data available
                  </td>
                </tr>
              ) : (
                attendanceData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-center text-sm font-medium text-gray-900 border border-gray-200">
                      {row.sNo}
                    </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 border border-gray-200">
                      <div>{row.peertutorsName}</div>
                      <div className="text-xs text-gray-500">{row.subject}</div>
                    </td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-gray-900 border border-gray-200">
                      {row.hour}
                    </td>
                    {dates.map((date, dateIdx) => {
                      const status = row.dateAttendance[date] || ''
                      return (
                        <td key={dateIdx} className="px-2 py-3 text-center text-sm font-medium text-gray-900 border border-gray-200">
                          {status}
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-center text-sm font-bold text-gray-900 border border-gray-200">
                      {row.totalHoursPresent}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-gray-900 border border-gray-200">
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
}

function ImportExportTab({ dept, year, section, facultyId, onImportComplete }: ImportExportTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'import' | 'export' | 'advanced'>('export')
  const [activeAdvancedTab, setActiveAdvancedTab] = useState<'general' | 'attendance' | 'nextTopicSheet' | 'mark'>('general')

  const dbYear = year
  const dbSection = section

  // React Query for Analytics
  const { data: analytics = {
        totalpeerTutor: 0,
        totalStudents: 0,
        totalClasses: 0,
        totalAttendanceRecords: 0,
        assignedStudents: 0,
        scheduledClasses: 0
      }, isLoading } = useQuery({
    queryKey: ['importExportAnalytics', dept, dbYear, dbSection],
    queryFn: async () => {
      const [tutors, sectionStudents, classes, scheduledClasses] = await Promise.all([
        peertutorservice.getpeerTutorBySection(dept, dbYear, dbSection),
        StudentService.getStudentsBySection(dept, dbYear, dbSection),
        ClassService.getClassesByYearSection(dept, dbYear, dbSection),
        ScheduledClassService.getScheduledClassesByYearSection(dept, dbYear, dbSection)
      ])

      const assignedCount = sectionStudents.filter(s => s.assigned_peer_tutor_id).length

      return {
        totalpeerTutor: tutors.length,
        totalStudents: sectionStudents.length,
        totalClasses: classes.length,
        totalAttendanceRecords: 0, // Will be calculated if needed
        assignedStudents: assignedCount,
        scheduledClasses: scheduledClasses.length
      }
    }
  })

  const handleExportPeerDetails = async () => {
    try {
      const tutors = await peertutorservice.getpeerTutorBySection(dept, dbYear, dbSection)
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
        const additionalClasses = await AdditionalClassService.getAdditionalClassesBypeertutors(tutor.id)
        // Filter by current section (additional classes should have dept, year, section if they were created in the AttendanceTab)
        const sectionAdditionalClasses = additionalClasses.filter(() => {
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
      toast.error('Failed to export peer tutor details')
    }
  }

  const handleExportStudents = async () => {
    try {
      const sectionStudents = await StudentService.getStudentsBySection(dept, dbYear, dbSection)
      const tutors = await peertutorservice.getpeerTutorBySection(dept, dbYear, dbSection)
      
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
      toast.error('Failed to export students')
    }
  }

  const handleExportAssignments = async () => {
    try {
      const assignments = await AssignmentService.getAssignments(dept, dbYear, dbSection)
      const tutors = await peertutorservice.getpeerTutorBySection(dept, dbYear, dbSection)
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
      toast.error('Failed to export assignments')
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
      toast.error('Failed to export attendance records')
    }
  }




  if (isLoading) {
    return <ImportExportTabSkeleton />
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Analytics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Peer Tutors</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{analytics.totalpeerTutor}</div>
          <div className="flex items-center text-emerald-500 text-xs font-bold relative z-10">
            <span>TOTAL</span>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Students</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{analytics.totalStudents}</div>
          <div className="flex items-center text-blue-500 text-xs font-bold relative z-10">
            <span>TOTAL</span>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Assigned</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{analytics.assignedStudents}</div>
          <div className="flex items-center text-orange-500 text-xs font-bold relative z-10">
            <span>ALLOCATED</span>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Subjects</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{analytics.totalClasses}</div>
          <div className="flex items-center text-purple-500 text-xs font-bold relative z-10">
            <span>TOTAL</span>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Scheduled</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{analytics.scheduledClasses}</div>
          <div className="flex items-center text-indigo-500 text-xs font-bold relative z-10">
            <span>CLASSES</span>
          </div>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <nav className="flex space-x-8" aria-label="Import Export Tabs">
            <button
              onClick={() => setActiveSubTab('export')}
              className={`pb-3 px-1 border-b-2 font-semibold text-sm uppercase tracking-wide transition-colors ${
                activeSubTab === 'export'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
              }`}
            >
              Export
            </button>
            <button
              onClick={() => setActiveSubTab('advanced')}
              className={`pb-3 px-1 border-b-2 font-semibold text-sm uppercase tracking-wide transition-colors ${
                activeSubTab === 'advanced'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
              }`}
            >
              Advanced
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          

             

          {activeSubTab === 'export' && (
    <div>
      <div className="mb-6">
                <div className="flex items-center mb-2">
                  <h3 className="text-lg font-semibold text-gray-900 uppercase">Export Data to Excel</h3>
                </div>
                <p className="text-sm text-gray-500">Select the data you want to export and download in Excel format</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Export Peer Details */}
          <button
              onClick={handleExportPeerDetails}
              className="bg-white border border-gray-200 rounded-xl p-5 transition-all duration-200 text-left shadow-sm hover:shadow-md"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md">XLSX</span>
              </div>
              <h4 className="text-sm font-bold text-gray-900 mb-1">PEER TUTOR DETAILS</h4>
              <p className="text-xs text-gray-500">Export all peer tutor information</p>
          </button>

            {/* Export Students */}
            <button
              onClick={handleExportStudents}
              className="bg-white border border-gray-200 rounded-xl p-5 transition-all duration-200 text-left shadow-sm hover:shadow-md"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md">XLSX</span>
              </div>
              <h4 className="text-sm font-bold text-gray-900 mb-1">STUDENT DETAILS</h4>
              <p className="text-xs text-gray-500">Export all student information</p>
            </button>

            {/* Export Assignments */}
            <button
              onClick={handleExportAssignments}
              className="bg-white border border-gray-200 rounded-xl p-5 transition-all duration-200 text-left shadow-sm hover:shadow-md"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md">XLSX</span>
              </div>
              <h4 className="text-sm font-bold text-gray-900 mb-1">ASSIGNMENTS</h4>
              <p className="text-xs text-gray-500">Export assignment mappings</p>
            </button>

            {/* Export Attendance */}
            <button
              onClick={handleExportAttendance}
              className="bg-white border border-gray-200 rounded-xl p-5 transition-all duration-200 text-left shadow-sm hover:shadow-md"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md">XLSX</span>
              </div>
              <h4 className="text-sm font-bold text-gray-900 mb-1">ATTENDANCE RECORDS</h4>
              <p className="text-xs text-gray-500">Export all attendance data</p>
            </button>
          </div>
            </div>
          )}

          {activeSubTab === 'advanced' && (
            <div>
              {/* Advanced Sub-tabs */}
              <div className="mb-6">
                <nav className="flex space-x-8 border-b border-gray-100">
                  <button
                    onClick={() => setActiveAdvancedTab('general')}
                    className={`pb-3 px-1 border-b-2 font-semibold text-sm uppercase tracking-wide transition-colors ${
                      activeAdvancedTab === 'general'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    General
                  </button>
                  <button
                    onClick={() => setActiveAdvancedTab('attendance')}
                    className={`pb-3 px-1 border-b-2 font-semibold text-sm uppercase tracking-wide transition-colors ${
                      activeAdvancedTab === 'attendance'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Attendance
                  </button>
                  <button
                    onClick={() => setActiveAdvancedTab('nextTopicSheet')}
                    className={`pb-3 px-1 border-b-2 font-semibold text-sm uppercase tracking-wide transition-colors ${
                      activeAdvancedTab === 'nextTopicSheet'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Next Topic Sheet
                  </button>
                  <button
                    onClick={() => setActiveAdvancedTab('mark')}
                    className={`pb-3 px-1 border-b-2 font-semibold text-sm uppercase tracking-wide transition-colors ${
                      activeAdvancedTab === 'mark'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
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
  const queryClient = useQueryClient()
  const dbYear = year
  const dbSection = section

  // --- State ---
  const [selectedStudent, setSelectedStudent] = useState<string>('')
  const [selectedpeertutors, setSelectedpeertutors] = useState<string>('')
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [showUnassignAllModal, setShowUnassignAllModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  // --- Queries ---

  const { isLoading: loadingAssignments } = useQuery({
    queryKey: ['assignments', dept, dbYear, dbSection],
    queryFn: () => AssignmentService.getAssignments(dept, dbYear, dbSection)
  })

  const { data: stats = null, isLoading: loadingStats } = useQuery({
    queryKey: ['assignmentStats', dept, dbYear, dbSection],
    queryFn: () => AssignmentService.getAssignmentStats(dept, dbYear, dbSection)
  })

  const { data: unassignedStudents = [], isLoading: loadingUnassigned } = useQuery({
    queryKey: ['unassignedStudents', dept, dbYear, dbSection],
    queryFn: () => AssignmentService.getUnassignedStudents(dept, dbYear, dbSection)
  })

  const { data: peerTutorWithStudents = [], isLoading: loadingTutors } = useQuery({
    queryKey: ['peerTutorWithStudents', dept, dbYear, dbSection],
    queryFn: () => AssignmentService.getpeerTutorWithStudents(dept, dbYear, dbSection)
  })

  // Check sync status across all sections
  const { data: syncStatus, isLoading: loadingSync } = useQuery({
    queryKey: ['yearSyncStatus', dept, dbYear],
    queryFn: () => ClassService.getYearSyncStatus(dept, dbYear),
    refetchInterval: 30000 // Check every 30s
  })

  const loading = loadingAssignments || loadingStats || loadingUnassigned || loadingTutors

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['assignments', dept, dbYear, dbSection] })
    queryClient.invalidateQueries({ queryKey: ['assignmentStats', dept, dbYear, dbSection] })
    queryClient.invalidateQueries({ queryKey: ['unassignedStudents', dept, dbYear, dbSection] })
    queryClient.invalidateQueries({ queryKey: ['peerTutorWithStudents', dept, dbYear, dbSection] })
    // Also invalidate students and peer tutors queries from parent scope if needed
    queryClient.invalidateQueries({ queryKey: ['students', dept, dbYear, dbSection] })
  }

  const handleAutoAssign = async () => {
    try {
      console.log('Auto assigning for:', { dept, year: dbYear, section: dbSection })
      const success = await AssignmentService.autoAssignStudents(dept, dbYear, dbSection)
      if (success) {
        invalidateQueries()
      }
    } catch (error) {
      console.error('Error auto-assigning students:', error)
    }
  }

  const handleManualAssign = async () => {
    if (!selectedStudent || !selectedpeertutors) return

    try {
      const success = await AssignmentService.assignStudent(selectedStudent, selectedpeertutors)
      if (success) {
        setSelectedStudent('')
        setSelectedpeertutors('')
        invalidateQueries()
      }
    } catch (error) {
      console.error('Error manually assigning student:', error)
    }
  }

  const [showBulkUnassignModal, setShowBulkUnassignModal] = useState(false)
  const [isBulkUnassigning, setIsBulkUnassigning] = useState(false)



  const handleUnassignAll = async () => {
    try {
      const success = await AssignmentService.unassignAllStudents(dept, dbYear, dbSection)
      if (success) {
        setShowUnassignAllModal(false)
        invalidateQueries()
      }
    } catch (error) {
      console.error('Error unassigning all students:', error)
    }
  }

  const toggleDeleteMode = () => {
    setIsDeleteMode(!isDeleteMode)
    setSelectedStudents(new Set())
  }

  const toggleStudentSelection = (studentId: string) => {
    const newSelected = new Set(selectedStudents)
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId)
    } else {
      newSelected.add(studentId)
    }
    setSelectedStudents(newSelected)
  }

  const toggleSelectAll = () => {
    const allStudentIds = peerTutorWithStudents.flatMap(({ students }) => 
      students.map(s => s.id)
    )
    
    if (selectedStudents.size === allStudentIds.length) {
      setSelectedStudents(new Set())
    } else {
      setSelectedStudents(new Set(allStudentIds))
    }
  }

  const handleBulkUnassign = () => {
    if (selectedStudents.size === 0) return
    setShowBulkUnassignModal(true)
  }

  const confirmBulkUnassign = async () => {
    setIsBulkUnassigning(true)
    try {
      for (const studentId of selectedStudents) {
        await AssignmentService.unassignStudent(studentId)
      }
      setSelectedStudents(new Set())
      setIsDeleteMode(false)
      invalidateQueries()
      toast.success(`Successfully unassigned ${selectedStudents.size} student(s)`)
      setShowBulkUnassignModal(false)
    } catch (error) {
      console.error('Error bulk unassigning students:', error)
      toast.error('Failed to unassign some students')
    } finally {
        setIsBulkUnassigning(false)
    }
  }

  // Export assignments (simple format for import) with merged cells
  const handleExportAssignments = async () => {
    try {
      // 1. Group students by peer tutor
      const groupedAssignments = new Map<string, {
        tutorName: string,
        tutorEmail: string,
        students: Array<{name: string, email: string}>
      }>()

      peerTutorWithStudents.forEach(({ peertutors, students }) => {
        if (!groupedAssignments.has(peertutors.id)) {
          groupedAssignments.set(peertutors.id, {
            tutorName: peertutors.name,
            tutorEmail: peertutors.email,
            students: []
          })
        }
        const group = groupedAssignments.get(peertutors.id)!
        students.forEach(student => {
          group.students.push({
            name: student.name,
            email: student.email
          })
        })
      })

      // 2. Prepare rows and merges
      const rows: any[] = []
      const merges: any[] = []
      // const currentRow = 1 // Start after header (0-indexed in array, but Excel is 1-indexed? SheetJS uses object properties)
      // Actually SheetJS uses 0-indexed for start/end in merges.
      // Header is row 0. Data starts at row 1.
      
      let rowIndex = 0

      Array.from(groupedAssignments.values()).forEach(group => {
        const studentCount = group.students.length

        if (studentCount === 0) {
           // Should ideally not happen for "Assignments", but if tutor has 0 students? 
           // We normally don't export them in specific Assignment export, but let's check user intent.
           // User wants "Assignments". If no students, no assignment.
           // Code below assumes existing assignments.
           return
        }

        group.students.forEach((student) => {
          rows.push({
            'Peer Tutor Name': group.tutorName,
            'Peer Tutor Email': group.tutorEmail,
            'Student Name': student.name,
            'Student Email': student.email
          })
          
          rowIndex++
        })

        // Add merge for Peer Tutor columns if more than 1 student
        // rowIndex currently points to the *next* empty row. 
        // The rows we just added are from (rowIndex - studentCount) to (rowIndex - 1)
        if (studentCount > 1) {
           const startRow = rowIndex - studentCount // 0-indexed relative to data
           // SheetJS adds header automatically with json_to_sheet, so header is Row 0. 
           // Data starts Row 1. 
           // So we need to offset by 1 for the actual sheet rows?
           // Yes. The merge object { s: {r, c}, e: {r, c} } uses 0-indexed absolute row numbers.
           // Our 'rows' array is just data.
           // So Data Row 0 corresponds to Excel Row 1.
           // Data Row 'startRow' corresponds to Excel Row 'startRow + 1'.
           
           const excelStartRow = startRow + 1
           const excelEndRow = excelStartRow + studentCount - 1
           
           // Merge Name (Column 0)
           merges.push({ s: { r: excelStartRow, c: 0 }, e: { r: excelEndRow, c: 0 } })
           // Merge Email (Column 1)
           merges.push({ s: { r: excelStartRow, c: 1 }, e: { r: excelEndRow, c: 1 } })
        }
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      
      // Apply merges
      if (merges.length > 0) {
        ws['!merges'] = merges
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Assignments')
      const fileName = `assignments_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)
    } catch (error) {
      console.error('Error exporting assignments:', error)
      toast.error('Failed to export assignments. Please try again.')
    }
  }



  if (loading) {
    return <AssignTabSkeleton />
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Assigned</h3>
              <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
            </div>
            <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{stats.assignedStudents}</div>
            <div className="flex items-center text-emerald-500 text-xs font-bold relative z-10">
              <span>ALLOCATED</span>
            </div>
          </div>

          <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Unassigned</h3>
              <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
            </div>
            <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{stats.unassignedStudents}</div>
            <div className="flex items-center text-orange-500 text-xs font-bold relative z-10">
              <span>REMAINING</span>
            </div>
          </div>

          <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Avg Students/Tutor</h3>
              <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
            </div>
            <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{stats?.averageStudentsPerTutor || 0}</div>
            <div className="flex items-center text-blue-500 text-xs font-bold relative z-10">
              <span>AVERAGE</span>
            </div>
          </div>

          <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Assignment Rate</h3>
              <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
            </div>
            <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{stats?.totalpeerTutor && stats?.totalStudents ? Math.round((stats.assignedStudents / stats.totalStudents) * 100) : 0}%</div>
            <div className="flex items-center text-purple-500 text-xs font-bold relative z-10">
              <span>COMPLETION</span>
            </div>
          </div>
        </div>
      )}

      {/* Manual Assignment Section */}
      {unassignedStudents.length > 0 && (
        <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm">
          <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">MANUAL ASSIGNMENT</h3>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleAutoAssign}
                className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>AUTO ASSIGN</span>
              </button>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">CHOOSE STUDENT</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">CHOOSE PEER TUTOR</label>
                <select
                  value={selectedpeertutors}
                  onChange={(e) => setSelectedpeertutors(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="">Choose a peer tutor...</option>
                  {peerTutorWithStudents.map(({ peertutors }) => (
                    <option key={peertutors.id} value={peertutors.id}>{peertutors.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:self-end">
              <button
                onClick={handleManualAssign}
                disabled={!selectedStudent || !selectedpeertutors}
                  className="w-full sm:w-auto h-10 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-8 rounded-xl text-sm font-medium transition-all shadow-sm"
              >
                Assign
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Current Assignments Table */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">ASSIGNMENTS</h3>
          <div className="flex items-center gap-3">
            {!isDeleteMode && (
              <>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
                >
                  <Upload className="w-4 h-4" />
                  IMPORT
                </button>
                {peerTutorWithStudents.some(({ students }) => students.length > 0) && (
                  <button
                    onClick={handleExportAssignments}
                    className="h-10 px-5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    EXPORT
                  </button>
                )}
              </>
            )}
            {isDeleteMode && selectedStudents.size > 0 && (
              <button
                  type="button"
                  onClick={handleBulkUnassign}
                  className="h-10 px-5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
                >
                <Trash2 className="w-4 h-4" />
                <span>Unassign ({selectedStudents.size})</span>
              </button>
            )}
            {peerTutorWithStudents.some(({ students }) => students.length > 0) && (
              <button
                onClick={toggleDeleteMode}
                className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-700 transition-all flex items-center justify-center group shadow-sm"
                title={isDeleteMode ? 'Exit delete mode' : 'Enter delete mode'}
              >
                <Trash2 className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
        </div>
        
        {peerTutorWithStudents.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center">
                <Image src="/icons/student.png" alt="No assignments found" width={96} height={96} className="mx-auto opacity-60 grayscale" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">NO ASSIGNMENTS FOUND</h3>
            <p className="text-gray-500 text-sm px-4 mb-6">Add peer tutors and students to start assigning, or import assignments.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {isDeleteMode && (
                      <th className="px-3 sm:px-4 md:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                        <input
                          type="checkbox"
                          checked={selectedStudents.size > 0 && selectedStudents.size === peerTutorWithStudents.flatMap(({ students }) => students).length}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 cursor-pointer"
                        />
                      </th>
                    )}
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
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {peerTutorWithStudents.flatMap(({ peertutors, students }) => {
                    if (students.length === 0) {
                      return [
                        <tr key={`${peertutors.id}-empty`} className="hover:bg-gray-50">
                          {isDeleteMode && <td className="px-3 sm:px-4 md:px-6 py-4"></td>}
                          <td className="px-3 sm:px-4 md:px-6 py-4 text-center align-middle border-r border-gray-200">
                            <div className="flex flex-col items-center justify-center min-w-0">
                              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mb-2">
                                <span className="text-sm font-bold text-gray-600">
                                  {peertutors.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                </span>
                              </div>
                              <div className="text-sm font-medium text-gray-900 break-words text-center px-1 max-w-full">
                                {peertutors.name}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 md:px-6 py-4 text-center align-middle border-r border-gray-200">
                            <div 
                              className="text-xs sm:text-sm text-gray-500 break-words text-center px-1 min-w-0 max-w-full" 
                              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                            >
                              {peertutors.email}
                            </div>
                          </td>
                          <td colSpan={isDeleteMode ? 2 : 3} className="px-3 sm:px-4 md:px-6 py-4 text-center">
                            <div className="text-sm text-gray-500 italic">No students assigned</div>
                          </td>
                        </tr>
                      ]
                    }
                    return students.map((student, index) => (
                      <tr key={`${peertutors.id}-${student.id}`} className="hover:bg-gray-50">
                        {isDeleteMode && (
                          <td className="px-3 sm:px-4 md:px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={selectedStudents.has(student.id)}
                              onChange={() => toggleStudentSelection(student.id)}
                              className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 cursor-pointer"
                            />
                          </td>
                        )}
                        {index === 0 && (
                          <>
                            <td 
                              rowSpan={students.length} 
                              className="px-3 sm:px-4 md:px-6 py-4 text-center align-middle border-r border-gray-200"
                            >
                              <div className="flex flex-col items-center justify-center min-w-0">
                                <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mb-2">
                                  <span className="text-sm font-bold text-gray-600">
                                    {peertutors.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </span>
                                </div>
                                <div className="text-sm font-medium text-gray-900 break-words text-center px-1 max-w-full">
                                  {peertutors.name}
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
                                {peertutors.email}
                              </div>
                            </td>
                          </>
                        )}
                        <td className="px-3 sm:px-4 md:px-6 py-4">
                          <div className="flex items-center min-w-0">
                            <div className="h-8 w-8 rounded-full bg-black flex items-center justify-center flex-shrink-0 mr-2 sm:mr-3 border border-gray-700">
                              <span className="text-xs font-bold text-gray-400">
                                {student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
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
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      
      {/* Bulk Unassign Confirmation Modal - Different from Unassign All */}
      {showBulkUnassignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                Unassign Selected Students?
              </h3>
              <p className="text-sm text-gray-600 text-center mb-6">
                Are you sure you want to unassign {selectedStudents.size} student(s)?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBulkUnassignModal(false)}
                  disabled={isBulkUnassigning}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkUnassign}
                  disabled={isBulkUnassigning}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  type="button"
                >
                   {isBulkUnassigning ? 'Processing...' : 'Unassign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unassign All Confirmation Modal */}
      {showUnassignAllModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                Unassign All Students?
              </h3>
              <p className="text-sm text-gray-600 text-center mb-6">
                This will unassign all {stats?.assignedStudents || 0} currently assigned student{stats?.assignedStudents !== 1 ? 's' : ''} from their peer tutors. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowUnassignAllModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnassignAll}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
                >
                  Unassign All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Import Modal */}
      {showImportModal && (
        <AssignmentImportModal
          dept={dept}
          year={dbYear}
          section={dbSection}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            invalidateQueries()
            setShowImportModal(false)
          }}
        />
      )}
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

  const [showAddModal, setShowAddModal] = useState(false)
  const [showDateAssignmentModal, setShowDateAssignmentModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showClassImportModal, setShowClassImportModal] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'scheduled'>('all')
  const [filterByClass, setFilterByClass] = useState<string>('')
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const [sortOrder, setSortOrder] = useState<'date' | 'class'>('date')
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const [newClass, setNewClass] = useState({
    subject_name: ''
  })
  const [filteredSubjects, setFilteredSubjects] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isSubjectFilterOpen, setIsSubjectFilterOpen] = useState(false)
  
  // Delete mode state
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set())
  const [selectedScheduledGroups, setSelectedScheduledGroups] = useState<Set<string>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showScheduledDeleteModal, setShowScheduledDeleteModal] = useState(false)
  const [subjectsToDelete, setSubjectsToDelete] = useState<Array<{name: string, canDelete: boolean, reason?: string}>>([])
  const [isDeletingSubjects, setIsDeletingSubjects] = useState(false)
  const [isDeletingScheduled, setIsDeletingScheduled] = useState(false)

  // Use raw values directly for database operations
  const dbYear = year
  const dbSection = section
  const queryClient = useQueryClient()

  // --- Queries ---

  const { data: classes = [], isLoading: loadingClasses } = useQuery({
    queryKey: ['classes', dept, dbYear, dbSection],
    queryFn: () => ClassService.getClassesByYearSection(dept, dbYear, dbSection)
  })

  const { data: scheduledClasses = [], isLoading: loadingScheduled } = useQuery({
    queryKey: ['scheduledClasses', dept, dbYear, dbSection],
    queryFn: () => ScheduledClassService.getScheduledClassesByYearSection(dept, dbYear, dbSection)
  })

  const { data: querySubjects = [], isLoading: loadingSubjectsList } = useQuery({
    queryKey: ['allSubjects'],
    queryFn: () => ClassService.getAllUniqueSubjects()
  })

  const { data: syncStatus, isLoading: loadingSync } = useQuery({
    queryKey: ['yearSyncStatus', dept, dbYear],
    queryFn: () => ClassService.getYearSyncStatus(dept, dbYear)
  })

  // Derived loading state


  const isLoading = loadingClasses || loadingScheduled || loadingSubjectsList

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['classes', dept, dbYear, dbSection] })
    queryClient.invalidateQueries({ queryKey: ['scheduledClasses', dept, dbYear, dbSection] })
    // If needed, invalidate dashboard stats
    queryClient.invalidateQueries({ queryKey: ['dashboardStats', dept] })
  }

  // No manual loadAllSubjects needed as it's handled by useQuery

  const handleSubjectInputChange = (value: string) => {
    setNewClass({ subject_name: value })
    setSelectedSuggestionIndex(-1) // Reset selection when typing
    
    if (value.length > 0) {
      // Filter subjects that contain the input value (case-insensitive)
      const filtered = querySubjects.filter(subject =>
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
      toast.error('Cannot create class with section "ALL". Please navigate to a specific section page.')
      return
    }

    try {
      // Use the new cross-section class creation method
      const result = await ClassService.createClassForAllSections(
        newClass.subject_name,
        dept,
        dbYear,
        departmentId // Use the actual department ID
      )

      if (result.success) {
        // Show success message with details
        toast.success(result.message)
        setNewClass({ subject_name: '' })
        setShowAddModal(false)
        setShowSuggestions(false)
        setFilteredSubjects([])
        invalidateQueries()
      } else {
        toast.error(result.message || 'Failed to create class. Please check the console for details.')
      }
    } catch (error) {
      console.error('Error adding class:', error)
      toast.error('Error creating class: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }




  const handleExportSubjects = async () => {
    try {
      const subjectRows = getSubjectsWithAllocations().map((s) => ({
        'Name': s.name,
        'Classes Allocated': s.classesAllocated,
        'Peer Tutors Allocated': s.peerTutorAllocated,
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
      toast.error('Failed to export subjects')
    }
  }



  // Delete mode handlers
  const toggleDeleteMode = () => {
    setIsDeleteMode(!isDeleteMode)
    setSelectedSubjects(new Set())
    setSelectedScheduledGroups(new Set())
  }

  const handleSelectAllScheduledGroups = () => {
    const allGroups = getGroupedScheduledClasses().map(g => `${g.subject_name}-${g.scheduled_date}`)
    if (selectedScheduledGroups.size === allGroups.length) {
      setSelectedScheduledGroups(new Set())
    } else {
      setSelectedScheduledGroups(new Set(allGroups))
    }
  }

  const handleSelectScheduledGroup = (groupKey: string) => {
    const newSelected = new Set(selectedScheduledGroups)
    if (newSelected.has(groupKey)) {
      newSelected.delete(groupKey)
    } else {
      newSelected.add(groupKey)
    }
    setSelectedScheduledGroups(newSelected)
  }

  const handleBulkDeleteScheduledGroups = () => {
    if (selectedScheduledGroups.size === 0) return
    setShowScheduledDeleteModal(true)
  }

  const confirmBulkDeleteScheduledGroups = async () => {
    setIsDeletingScheduled(true)
    try {
      const groups = getGroupedScheduledClasses()
      const groupsToDelete = groups.filter(g => 
        selectedScheduledGroups.has(`${g.subject_name}-${g.scheduled_date}`)
      )

      for (const group of groupsToDelete) {
         const classesToDelete = scheduledClasses.filter(sc => 
           sc.class.subject_name === group.subject_name && sc.scheduled_date === group.scheduled_date
         )
         for (const sc of classesToDelete) {
           await ScheduledClassService.deleteScheduledClass(sc.id)
         }
      }
      
      invalidateQueries()
      setSelectedScheduledGroups(new Set())
      setIsDeleteMode(false)
      setShowScheduledDeleteModal(false)
      toast.success(`Successfully deleted ${groupsToDelete.length} scheduled class group(s)`)
    } catch (error) {
      console.error('Error deleting scheduled groups:', error)
      toast.error('Failed to delete scheduled groups')
    } finally {
        setIsDeletingScheduled(false)
    }
  }

  const handleSelectAll = () => {
    const allSubjectNames = getSubjectsWithAllocations().map(s => s.name)
    if (selectedSubjects.size === allSubjectNames.length) {
      setSelectedSubjects(new Set())
    } else {
      setSelectedSubjects(new Set(allSubjectNames))
    }
  }

  const handleSelectSubject = (subjectName: string) => {
    const newSelected = new Set(selectedSubjects)
    if (newSelected.has(subjectName)) {
      newSelected.delete(subjectName)
    } else {
      newSelected.add(subjectName)
    }
    setSelectedSubjects(newSelected)
  }

  const handleBulkDelete = () => {
    const selectedSubjectNames = Array.from(selectedSubjects)
    const subjectsWithStatus = selectedSubjectNames.map(subjectName => {
      // Check if subject has scheduled classes
      const hasScheduledClasses = scheduledClasses.some(sc => sc.class.subject_name === subjectName)
      
      return {
        name: subjectName,
        canDelete: !hasScheduledClasses,
        reason: hasScheduledClasses ? 'Has scheduled classes' : undefined
      }
    })
    
    setSubjectsToDelete(subjectsWithStatus)
    setShowDeleteModal(true)
  }

  const confirmBulkDelete = async () => {
    const deletableSubjects = subjectsToDelete.filter(s => s.canDelete)
    
    setIsDeletingSubjects(true)
    try {
      for (const subject of deletableSubjects) {
        // Find all classes for this subject
        const classesToDelete = classes.filter(c => c.subject_name === subject.name)
        
        // Delete all classes for this subject
        for (const classItem of classesToDelete) {
          await ClassService.deleteClass(classItem.id)
        }
      }
      
      setShowDeleteModal(false)
      setIsDeleteMode(false)
      setSelectedSubjects(new Set())
      invalidateQueries()
      toast.success(`Successfully deleted ${deletableSubjects.length} subject(s)`)
    } catch (error) {
      console.error('Error deleting subjects:', error)
      toast.error('Failed to delete some subjects. Please try again.')
    } finally {
      setIsDeletingSubjects(false)
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
      peerTutorAllocated: number,
      isScheduled: boolean
    }>()

    // Process all classes
    classes.forEach(classItem => {
      const scheduledForClass = scheduledClasses.filter(sc => sc.class_id === classItem.id)
      const uniquepeerTutor = new Set(scheduledForClass.map(sc => sc.peer_tutor_id))
      // Count unique scheduled dates for this class
      const uniqueScheduledDates = new Set(scheduledForClass.map(sc => sc.scheduled_date))
      
      if (!subjectMap.has(classItem.subject_name)) {
        subjectMap.set(classItem.subject_name, {
          name: classItem.subject_name,
          classesAllocated: 0,
          peerTutorAllocated: 0,
          isScheduled: false
        })
      }
      
      const subjectData = subjectMap.get(classItem.subject_name)!
      // Add the count of unique scheduled dates instead of total scheduled class entries
      subjectData.classesAllocated += uniqueScheduledDates.size
      subjectData.peerTutorAllocated = Math.max(subjectData.peerTutorAllocated, uniquepeerTutor.size)
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



  if (isLoading) {
    return <ClassesTabSkeleton />
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Total Subjects</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{classes.length}</div>
          <div className="flex items-center text-emerald-500 text-xs font-bold relative z-10">
             <span>TOTAL</span>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Scheduled Classes</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{scheduledClasses.length}</div>
          <div className="flex items-center text-blue-500 text-xs font-bold relative z-10">
             <span>TOTAL ALLOCATED</span>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Pending Classes</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">
            {scheduledClasses.filter((sc: any) => sc.completion_status === 'pending' || sc.completion_status === 'not_started').length}
          </div>
          <div className="flex items-center text-orange-500 text-xs font-bold relative z-10">
             <span>REMAINING</span>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Avg Classes/Subject</h3>
            <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">
            {classes.length > 0 ? (scheduledClasses.length / classes.length).toFixed(1) : '0'}
          </div>
          <div className="flex items-center text-purple-500 text-xs font-bold relative z-10">
             <span>AVERAGE</span>
          </div>
        </div>
      </div>
      {/* Subjects List */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-3">
                SUBJECTS ({classes.length}) - SCHEDULED ({getGroupedScheduledClasses().length})
                {!loadingSync && syncStatus && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                    syncStatus.isSynced 
                      ? 'bg-gray-50 text-black-600 border-black-100' 
                      : 'bg-gray-50 text-black-600 border-black-100'
                  }`}>
                    {syncStatus.isSynced ? 'Synced' : 'Not Synced'}
                  </span>
                )}
              </h3>
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              {!isDeleteMode && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="h-10 px-5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>ADD</span>
                </button>
              )}

              {!isDeleteMode && (
                <button
                  onClick={() => setShowClassImportModal(true)}
                  className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
                >
                  <Upload className="w-4 h-4" />
                  <span>IMPORT</span>
                </button>
              )}


              
              {!isDeleteMode && classes.length > 0 && (
                <button
                  onClick={() => setShowDateAssignmentModal(true)}
                  className="h-10 px-5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>ASSIGN</span>
                </button>
              )}
              
              {!isDeleteMode && classes.length > 0 && (
                <>
                  {/* Delete Button */}
                  <button
                    onClick={toggleDeleteMode}
                    className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 transition-all flex items-center justify-center group"
                    title="Delete subjects"
                  >
                    <svg className="w-5 h-5 text-white group-hover:text-red-100 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>

                  
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="h-10 px-4 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
                  >
                    EXPORT
                  </button>
                </>
              )}
              
              {/* Delete Mode Actions */}
              {isDeleteMode && (activeSubTab === 'all' ? selectedSubjects.size > 0 : selectedScheduledGroups.size > 0) && (
                <button
                  type="button"
                  onClick={activeSubTab === 'all' ? handleBulkDelete : handleBulkDeleteScheduledGroups}
                  className="h-12 px-6 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete ({activeSubTab === 'all' ? selectedSubjects.size : selectedScheduledGroups.size})
                </button>
              )}
              {isDeleteMode && (
                <button
                  onClick={toggleDeleteMode}
                  className="h-12 px-6 bg-gray-500 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-all"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          
          {/* Sub-tabs */}
          <div className="mt-6">
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveSubTab('all')}
                className={`pb-3 px-1 border-b-2 font-semibold text-sm uppercase tracking-wide transition-colors ${
                  activeSubTab === 'all'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                }`}
              >
                All Subjects
              </button>
              <button
                onClick={() => setActiveSubTab('scheduled')}
                className={`pb-3 px-1 border-b-2 font-semibold text-sm uppercase tracking-wide transition-colors ${
                  activeSubTab === 'scheduled'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                }`}
              >
                Scheduled Classes
              </button>
            </nav>
          </div>
        </div>
        <div className="">
          {activeSubTab === 'all' ? (
            // All Subjects Tab
            classes.length === 0 ? (
              <div className="text-center py-12">
                <Image src="/icons/classes.png" alt="No subjects created" width={96} height={96} className="mx-auto opacity-60 grayscale" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">NO SUBJECTS CREATED</h3>
                <p className="text-gray-500 text-sm">Click &quot;ADD&quot; to create the subject</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-white border-b border-gray-100">
                    <tr>
                      {isDeleteMode && (
                        <th className="px-6 py-3 text-left w-10">
                          <input
                            type="checkbox"
                            checked={selectedSubjects.size === getSubjectsWithAllocations().length && getSubjectsWithAllocations().length > 0}
                            onChange={handleSelectAll}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                          />
                        </th>
                      )}
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                        NAME
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                        CLASSES ALLOCATED
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                        PEER TUTORS ALLOCATED
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                        STATUS
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {getSubjectsWithAllocations().map((subject) => (
                      <tr key={subject.name} className="hover:bg-gray-50">
                        {isDeleteMode && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedSubjects.has(subject.name)}
                              onChange={() => handleSelectSubject(subject.name)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-gray-100">
                              <svg className="h-4 w-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                          {subject.peerTutorAllocated}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 border border-gray-200">
                            {subject.isScheduled ? 'Scheduled' : 'Not scheduled'}
                          </span>
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
                  <Image src="/icons/classes.png" alt="No scheduled subjects" width={96} height={96} className="mx-auto opacity-60 grayscale" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">NO SCHEDULED SUBJECTS</h3>
                  <p className="text-gray-500">Click &quot;Assign&quot; to schedule subjects</p>
                </div>
              ) : (
                <div>
                  {/* Filter and Sort Controls */}
                  <div className="mb-6 w-48 flex flex-col sm:flex-row gap-4 mx-4 my-4">
                    <div className="flex-1 relative">
                      {isSubjectFilterOpen && (
                        <div className="fixed inset-0 z-10" onClick={() => setIsSubjectFilterOpen(false)} />
                      )}
                      <div className="relative z-20">
                        <button
                          type="button"
                          onClick={() => setIsSubjectFilterOpen(!isSubjectFilterOpen)}
                          className="relative w-full bg-white border border-gray-300 rounded-[20px] shadow-sm pl-4 pr-10 py-2 text-left cursor-default focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                          <span className="block truncate text-gray-700 font-medium">
                            {filterByClass || 'All Subjects'}
                          </span>
                          <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                            <ChevronDown className="h-5 w-5 text-gray-400" aria-hidden="true" />
                          </span>
                        </button>

                        {isSubjectFilterOpen && (
                          <div className="absolute mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                            <div
                              className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100 text-gray-900"
                              onClick={() => {
                                setFilterByClass('')
                                setIsSubjectFilterOpen(false)
                              }}
                            >
                              <span className={`block truncate ${filterByClass === '' ? 'font-semibold' : 'font-normal'}`}>
                                All Subjects
                              </span>
                              {filterByClass === '' && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600">
                                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </span>
                              )}
                            </div>
                            {getUniqueSubjects().map((subject) => (
                              <div
                                key={subject}
                                className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100 text-gray-900"
                                onClick={() => {
                                  setFilterByClass(subject)
                                  setIsSubjectFilterOpen(false)
                                }}
                              >
                                <span className={`block truncate ${filterByClass === subject ? 'font-semibold' : 'font-normal'}`}>
                                  {subject}
                                </span>
                                {filterByClass === subject && (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600">
                                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    </div>

                  {/* Scheduled Subjects Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {isDeleteMode && (
                            <th className="px-6 py-3 text-left w-10">
                              <input
                                type="checkbox"
                                checked={selectedScheduledGroups.size === getGroupedScheduledClasses().length && getGroupedScheduledClasses().length > 0}
                                onChange={handleSelectAllScheduledGroups}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                              />
                            </th>
                          )}
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
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {getGroupedScheduledClasses().map((group) => (
                          <tr key={`${group.subject_name}-${group.scheduled_date}`} className="hover:bg-gray-50">
                            {isDeleteMode && (
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={selectedScheduledGroups.has(`${group.subject_name}-${group.scheduled_date}`)}
                                  onChange={() => handleSelectScheduledGroup(`${group.subject_name}-${group.scheduled_date}`)}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                />
                              </td>
                            )}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-8 w-8">
                                  <div className="h-8 w-8 rounded-full bg-black flex items-center justify-center">
                                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                              <div className="text-sm text-gray-600 uppercase font-medium">
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

      {/* Add Class Modal - Redesigned */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95 duration-300 border border-white/20">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Add New Class</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">
                  Create a new subject entry
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-full hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-all duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddClass} className="space-y-6">
              <div className="relative">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Subject Name
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                  </div>
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
                    className="block w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="Search or enter subject name..."
                    required
                    autoComplete="off"
                  />
                  {loadingSubjects && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                    </div>
                  )}
                </div>
                
                {/* Autocomplete Suggestions */}
                {showSuggestions && filteredSubjects.length > 0 && (
                  <div className="absolute z-20 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-xl max-h-60 overflow-auto custom-scrollbar">
                    {filteredSubjects.slice(0, 10).map((subject, index) => (
                      <div
                        key={index}
                        onClick={() => handleSubjectSelect(subject)}
                        className={`px-4 py-3 cursor-pointer text-sm font-medium border-b border-gray-50 last:border-b-0 transition-colors ${
                          index === selectedSuggestionIndex 
                            ? 'bg-blue-50 text-blue-700' 
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        {subject}
                      </div>
                    ))}
                    {filteredSubjects.length > 10 && (
                      <div className="px-4 py-2 text-[10px] font-bold text-gray-400 bg-gray-50/50 uppercase tracking-wider text-center">
                        And {filteredSubjects.length - 10} more matches
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-50">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-6 py-2.5 text-[11px] font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-8 py-2.5 bg-blue-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
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
          invalidateQueries() // Reload classes after successful date assignment
        }}
        dept={dept}
        year={dbYear}
        section={dbSection}
        faculty_id={departmentId}
      />

      {/* Class Import Modal */}
      <ClassImportModal
        isOpen={showClassImportModal}
        onClose={() => setShowClassImportModal(false)}
        onSuccess={() => {
          invalidateQueries() // Reload classes after successful import
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
                <li>• Unscheduled subjects will show &quot;Not Scheduled&quot;</li>
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
      
      {/* Scheduled Classes Delete Confirmation Modal */}
      {showScheduledDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                Delete Scheduled Classes?
              </h3>
              <p className="text-sm text-gray-600 text-center mb-6">
                Are you sure you want to delete {selectedScheduledGroups.size} scheduled class group(s)?
                This action cannot be undone.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowScheduledDeleteModal(false)}
                  disabled={isDeletingScheduled}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkDeleteScheduledGroups}
                  disabled={isDeletingScheduled}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  type="button"
                >
                  {isDeletingScheduled ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="px-8 pt-10 pb-6 text-center border-b border-gray-50">
              <h3 className="text-2xl  text-left font-black text-gray-900 uppercase tracking-tight">
                Delete Subjects
              </h3>
              <p className="text-[10px] font-bold text-left text-gray-400 uppercase tracking-[0.2em] mt-2">
                Review the items below before permanent removal
              </p>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">
              <div className="space-y-4">
                {subjectsToDelete.map((subject, index) => (
                  <div
                    key={index}
                    className={`rounded-2xl border-2 p-5 transition-all duration-200 group ${
                      subject.canDelete
                        ? 'bg-white border-gray-100 hover:border-gray-200 shadow-sm'
                        : 'bg-red-50/50 border-red-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-gray-900 uppercase tracking-tight truncate">
                          {subject.name}
                        </p>
                        {!subject.canDelete && subject.reason && (
                          <div className="flex items-start gap-2 mt-2 bg-red-50 p-2.5 rounded-xl border border-red-100/50">
                            <svg className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <span className="text-[10px] text-red-700 font-bold uppercase tracking-tight">
                              CANNOT DELETE: {subject.reason}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {subject.canDelete ? (
                          <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100">
                            Safe to delete
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-red-100 text-red-600 border border-red-200">
                            Protected
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer - Summary and Actions */}
            <div className="px-8 py-8 border-t border-gray-100 bg-gray-50/50">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm transition-all duration-300">
                  <div className="text-[9px] text-gray-400 font-black uppercase tracking-[0.15em] mb-2">Total Selected</div>
                  <div className="text-2xl font-black text-gray-900">{subjectsToDelete.length}</div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm transition-all duration-300">
                  <div className="text-[9px] text-emerald-500 font-black uppercase tracking-[0.15em] mb-2">To be Deleted</div>
                  <div className="text-2xl font-black text-emerald-600">
                    {subjectsToDelete.filter(s => s.canDelete).length}
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm transition-all duration-300">
                  <div className="text-[9px] text-red-500 font-black uppercase tracking-[0.15em] mb-2">Cannot Delete</div>
                  <div className="text-2xl font-black text-red-600">
                    {subjectsToDelete.filter(s => !s.canDelete).length}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row justify-end gap-4">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="px-8 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest hover:bg-gray-100 rounded-xl transition-all"
                >
                  Cancel
                </button>
                {subjectsToDelete.some(s => s.canDelete) && (
                  <button
                    onClick={confirmBulkDelete}
                    disabled={isDeletingSubjects}
                    className="px-10 py-3 text-[11px] font-black text-white bg-red-600 uppercase tracking-widest hover:bg-red-700 rounded-xl transition-all shadow-lg shadow-red-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isDeletingSubjects ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Deleting...
                      </>
                    ) : (
                      `Confirm Deletion (${subjectsToDelete.filter(s => s.canDelete).length})`
                    )}
                  </button>
                )}
              </div>
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
  
  // Use raw values directly for database operations
  const dbYear = year
  const dbSection = section

  const [selectedClass, setSelectedClass] = useState<string>('')

  const [peertutorsAttendance, setpeertutorsAttendance] = useState<any[]>([])
  const [selectedpeertutors, setSelectedpeertutors] = useState<any>(null)
  const [studentDetails, setStudentDetails] = useState<any[]>([])
  const [view, setView] = useState<'classes' | 'peer-tutors' | 'students'>('classes')
  const [expandedClassRows, setExpandedClassRows] = useState<Set<string>>(new Set())
  const [expandedpeertutorsRows, setExpandedpeertutorsRows] = useState<Set<string>>(new Set())
  const [peerTutortudentDetails, setpeerTutortudentDetails] = useState<Map<string, any[]>>(new Map())
  const [presentScheduledClassIds, setPresentScheduledClassIds] = useState<Set<string>>(new Set())
  // React Query for Scheduled Classes
  const { data: scheduledClasses = [], isLoading: loadingScheduled } = useQuery({
    queryKey: ['scheduledClasses', dept, dbYear, dbSection],
    queryFn: async () => {
      console.log('Loading scheduled classes for:', { dept, dbYear, dbSection })
      const classes = await ScheduledClassService.getScheduledClassesByYearSection(dept, dbYear, dbSection)
      return classes.sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())
    }
  })

  // React Query for Additional Classes
  const { data: additionalClasses = [], isLoading: loadingAdditional } = useQuery({
    queryKey: ['additionalClasses', dept, dbYear, dbSection],
    queryFn: async () => {
      // Get all peer tutors for this section
      const peerTutor = await peertutorservice.getpeerTutorBySection(dept, dbYear, dbSection)
      
      // Get additional classes for all peer tutors
      const allAdditionalClasses = await Promise.all(
        peerTutor.map(async (tutor) => {
          const classes = await AdditionalClassService.getAdditionalClassesBypeertutors(tutor.id)
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
      return flattened.sort((a, b) => new Date(a.class_date).getTime() - new Date(b.class_date).getTime())
    }
  })

  // React Query for Attendance Rate (dependent on scheduledClasses)
  const { data: subjectAttendanceRate = {} } = useQuery({
    queryKey: ['attendanceRate', scheduledClasses.map(c => c.id).join(',')],
    queryFn: async () => {
        if (!scheduledClasses || scheduledClasses.length === 0) return {}
        
        const supabase = createClient()
        const scheduledIds = scheduledClasses.map(sc => sc.id)
        const { data, error } = await supabase
          .from('attendance')
          .select('scheduled_class_id')
          .in('scheduled_class_id', scheduledIds)

        if (error) {
          console.error('Error loading attendance for rate calc:', error)
          return {}
        }

        const presentSet = new Set<string>((data || [])
          .map((r: any) => r.scheduled_class_id)
          .filter(Boolean))

        // Update local state for per-date calculations (side effect, could be improved but keeping for compatibility)
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

        return rateMap
    },
    enabled: scheduledClasses.length > 0
  })


  const loadpeertutorsAttendanceForClass = async (classIdOrSubject: string, isAdditional: boolean = false) => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      console.log('Loading peer tutor attendance for class:', classIdOrSubject, 'isAdditional:', isAdditional)
      
      const peertutorsAttendanceList: any[] = []
      
      if (isAdditional) {
        // Handle additional class
        const additionalClass = additionalClasses.find(ac => ac.id === classIdOrSubject)
        if (!additionalClass) {
          console.error('Additional class not found')
          return
        }
        
        // For additional classes, the peer tutor is always present (they created it)
        // Show attendance records from additional_class_attendance
        peertutorsAttendanceList.push({
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
            const peertutors = scheduledClass.peer_tutor
            if (peertutors) {
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
              
              peertutorsAttendanceList.push({
                scheduled_class_id: scheduledClass.id,
                peer_tutor_id: peertutors.id,
                peer_tutor_name: peertutors.name,
                peer_tutor_email: peertutors.email,
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

      console.log('Peer tutor attendance for class:', peertutorsAttendanceList)
      setpeertutorsAttendance(peertutorsAttendanceList)
      
    } catch (error) {
      console.error('Error loading peer tutor attendance:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlepeertutorsClick = async (peertutors: any) => {
    const isExpanded = expandedpeertutorsRows.has(peertutors.peer_tutor_id)
    
    if (isExpanded) {
      // Collapse
      const newExpanded = new Set(expandedpeertutorsRows)
      newExpanded.delete(peertutors.peer_tutor_id)
      setExpandedpeertutorsRows(newExpanded)
    } else {
      // Expand and load student details if not already loaded
      const newExpanded = new Set(expandedpeertutorsRows)
      newExpanded.add(peertutors.peer_tutor_id)
      setExpandedpeertutorsRows(newExpanded)
      
      // Load student details if not already cached
      if (!peerTutortudentDetails.has(peertutors.peer_tutor_id)) {
        await loadStudentDetailsForpeertutors(peertutors.scheduled_class_id, peertutors.peer_tutor_id)
      }
    }
  }
  
  const loadStudentDetailsForpeertutors = async (scheduledClassId: string, peertutorsId: string) => {
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
        const newMap = new Map(peerTutortudentDetails)
        newMap.set(peertutorsId, studentDetailsList)
        setpeerTutortudentDetails(newMap)
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
        .eq('peer_tutor_id', peertutorsId)
      
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
      const newMap = new Map(peerTutortudentDetails)
      newMap.set(peertutorsId, students)
      setpeerTutortudentDetails(newMap)
    } catch (error) {
      console.error('Error in loadStudentDetailsForpeertutors:', error)
    }
  }

  const handleBackToClasses = () => {
    setView('classes')
    setSelectedClass('')
    setpeertutorsAttendance([])
  }

  const handleBackTopeerTutor = () => {
    setView('peer-tutors')
    setSelectedpeertutors(null)
    setStudentDetails([])
  }

  const handleExportClassAttendance = async () => {
    try {
      const selectedScheduledClass = scheduledClasses.find(sc => sc.id === selectedClass)
      if (!selectedScheduledClass) {
        toast.error('Please select a class first')
        return
      }

      const wb = XLSX.utils.book_new()
      const supabase = createClient()

      // Filter peer tutors by attendance status
      const presentpeerTutor = peertutorsAttendance.filter(pt => pt.attendance_status === 'present')
      const absentpeerTutor = peertutorsAttendance.filter(pt => pt.attendance_status === 'absent')

      // Sheet 1: Present Peer Tutors with Student Attendance
      if (presentpeerTutor.length > 0) {
        const presentDataWithStudents: any[] = []

        for (const pt of presentpeerTutor) {
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
      if (absentpeerTutor.length > 0) {
        const absentData = absentpeerTutor.map(pt => ({
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
        'Total Peer Tutors': peertutorsAttendance.length,
        'Present': presentpeerTutor.length,
        'Absent': absentpeerTutor.length,
        'Pending': peertutorsAttendance.filter(pt => pt.attendance_status === 'pending').length
      }]
      const summaryWs = XLSX.utils.json_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

      // Save file
      const fileName = `attendance_${selectedScheduledClass.class?.subject_name}_${new Date(selectedScheduledClass.scheduled_date).toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)
    } catch (error) {
      console.error('Error exporting attendance:', error)
      toast.error('Failed to export attendance. Please try again.')
    }
  }

  const isLoading = loadingScheduled || loadingAdditional || loading

  if (isLoading) {
    return <AttendanceTabSkeleton />
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
            const peertutors = sc.peer_tutor
            if (peertutors) {
              const completionStatus = sc.completion_status || 'not_started'
              const hasAttendanceRecord = attendanceByScheduledClass.has(sc.id)
              let attendanceStatus = 'pending'
              
              if (completionStatus === 'completed') {
                attendanceStatus = hasAttendanceRecord ? 'present' : 'absent'
              }

              allAttendanceData.push({
                'Subject': scheduledClass.class?.subject_name || 'Unknown',
                'Date': new Date(scheduledClass.scheduled_date).toLocaleDateString('en-GB'),
                'Peer Tutor Name': peertutors.name,
                'Peer Tutor Email': peertutors.email,
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
      toast.error('Failed to export all attendance. Please try again.')
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
      setView('peer-tutors')
      await loadpeertutorsAttendanceForClass(classIdOrSubject, false)
    }

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {`CLASSES (${uniqueClasses.length}) - SCHEDULED (${scheduledClasses.length})`}
            </h3>
            <p className="text-sm text-gray-500">
              Click on a class to view allocated peer tutors and attendance records
            </p>
          </div>
          
          <div className="flex items-center gap-3">

            {uniqueClasses.length > 0 && (
              <button
                onClick={handleExportAllAttendance}
                className="h-10 px-4 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
              >
                EXPORT
              </button>
            )}
          </div>
        </div>
        {uniqueClasses.length > 0 ? (
          <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
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
                <h4 className="text-md font-medium text-gray-900">SCHEDULED CLASSES OVERVIEW</h4>
                <p className="text-sm text-gray-600 mt-1">
                  {uniqueClasses.length} SCHEDULED CLASSES
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
                              <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mr-3">
                                <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
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
                                              className="text-gray-600 hover:text-gray-900 transition-colors"
                                              title="View Details"
                                            >
                                              <Eye className="w-5 h-5" />
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
            <Image src="/icons/attendance.png" alt="No scheduled classes" width={96} height={96} className="mx-auto opacity-60 grayscale" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">NO SCHEDULED CLASSES</h3>
            <p className="text-sm text-gray-500 mb-4 px-4">No classes have been scheduled</p>
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
          {peertutorsAttendance.length > 0 && (
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

        {peertutorsAttendance.length > 0 ? (
          <>
            {/* Mobile Card View */}
            <div className="block lg:hidden space-y-3">
              {peertutorsAttendance.map((peertutors) => (
                <div
                  key={peertutors.peer_tutor_id}
                  onClick={() => handlepeertutorsClick(peertutors)}
                  className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-blue-600">
                          {peertutors.peer_tutor_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-gray-900 truncate">{peertutors.peer_tutor_name}</h4>
                        <p className="text-xs text-gray-600 truncate">{peertutors.peer_tutor_email}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        peertutors.attendance_status === 'present' 
                          ? 'bg-green-100 text-green-800' 
                          : peertutors.attendance_status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {peertutors.attendance_status === 'present' ? 'Present' : peertutors.attendance_status === 'pending' ? 'Pending' : 'Absent'}
                      </span>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handlepeertutorsClick(peertutors)
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
                {peertutorsAttendance.length} peer tutors
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
                  {peertutorsAttendance.map((peertutors) => (
                    <>
                      <tr key={peertutors.peer_tutor_id} className="hover:bg-gray-50 cursor-pointer">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                              <span className="text-sm font-medium text-blue-600">
                                {peertutors.peer_tutor_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                              </span>
                            </div>
                            <div className="text-sm font-medium text-gray-900">
                              {peertutors.peer_tutor_name}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{peertutors.peer_tutor_email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            peertutors.attendance_status === 'present' 
                              ? 'bg-green-100 text-green-800' 
                              : peertutors.attendance_status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {peertutors.attendance_status === 'present' ? 'Present' : peertutors.attendance_status === 'pending' ? 'Pending' : 'Absent'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-900">
                              {peerTutortudentDetails.get(peertutors.peer_tutor_id)?.length || 0} Student{(peerTutortudentDetails.get(peertutors.peer_tutor_id)?.length || 0) !== 1 ? 's' : ''}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handlepeertutorsClick(peertutors)
                              }}
                              className="ml-4 text-gray-500 hover:text-gray-700"
                              aria-label={expandedpeertutorsRows.has(peertutors.peer_tutor_id) ? 'Collapse' : 'Expand'}
                            >
                              {expandedpeertutorsRows.has(peertutors.peer_tutor_id) ? (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              ) : (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedpeertutorsRows.has(peertutors.peer_tutor_id) && (() => {
                        const students = peerTutortudentDetails.get(peertutors.peer_tutor_id) || []
                        if (students.length === 0) {
                          return (
                            <tr key={`${peertutors.peer_tutor_id}-expanded`} className="bg-gray-50">
                              <td colSpan={4} className="px-6 py-4">
                                <div className="text-sm text-gray-500 text-center">No student attendance records found.</div>
                              </td>
                            </tr>
                          )
                        }
                        return (
                          <tr key={`${peertutors.peer_tutor_id}-expanded`} className="bg-gray-50">
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
    const selectedScheduledClass = scheduledClasses.find(sc => sc.id === selectedpeertutors?.scheduled_class_id)
    
    return (
      <div>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={handleBackTopeerTutor}></div>
        
        {/* Popup */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBackTopeerTutor}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm sm:text-base lg:text-lg font-medium text-gray-900 truncate">
                    {selectedpeertutors?.peer_tutor_name} - Student Details
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
                      selectedpeertutors?.attendance_status === 'present' 
                        ? 'bg-green-100 text-green-800' 
                        : selectedpeertutors?.attendance_status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      Peer Tutor: {selectedpeertutors?.attendance_status === 'present' ? 'Present' : selectedpeertutors?.attendance_status === 'pending' ? 'Pending' : 'Absent'}
                    </span>
                </div>
              </div>
              <button
                onClick={handleBackTopeerTutor}
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




interface BreadcrumbSelectProps {
  value: string
  options: { [key: string]: string }
  onChange: (value: string) => void
  className?: string
}

function BreadcrumbSelect({ value, options, onChange, className = '' }: BreadcrumbSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 transition-colors ${className}`}
      >
        <span>{options[value] || value}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[120px] bg-white border border-gray-100 rounded-lg shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
          {Object.entries(options).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                onChange(key)
                setIsOpen(false)
              }}
              className={`w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-gray-50 transition-colors whitespace-nowrap ${
                key === value ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SectionPage() {
  return (
    <FacultyProtectedRoute>
      <Suspense fallback={<SectionPageSkeleton />}>
        <SectionContent />
      </Suspense>
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
  
  // Cast params to string (Next.js params can be string arrays)
  const deptIdStr = Array.isArray(deptId) ? deptId[0] : deptId
  const yearIdStr = Array.isArray(yearId) ? yearId[0] : yearId
  const sectionIdStr = Array.isArray(sectionId) ? sectionId[0] : sectionId
  

  
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'peer-tutors' | 'students' | 'assign' | 'classes' | 'attendance'  | 'import-export'>('peer-tutors')
  
  // Faculty Department Query
  const { data: department, isLoading: isDepartmentLoading } = useQuery({
    queryKey: ['department', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      const facultyDept = await FacultyService.verifyFacultyAccess(user.email)
      return {
        id: deptIdStr,
        name: facultyDept?.name || 'Computer Science',
        faculty_name: user?.user_metadata?.full_name || user?.user_metadata?.name || 'Faculty Member'
      }
    },
    enabled: !!user?.email
  })

  // Peer Tutors Query
  const { data: peerTutor = [], isLoading: ispeerTutorLoading } = useQuery({
    queryKey: ['peerTutor', department?.name, yearIdStr, sectionIdStr],
    queryFn: () => peertutorservice.getpeerTutorBySection(
      department?.name || '',
      yearIdStr,
      sectionIdStr
    ),
    enabled: !!department?.name
  })

  // Students Query
  const { data: students = [], isLoading: isStudentsLoading } = useQuery({
    queryKey: ['students', department?.name, yearIdStr, sectionIdStr],
    queryFn: () => StudentService.getStudentsBySection(
      department?.name || '',
      yearIdStr,
      sectionIdStr
    ),
    enabled: !!department?.name && !!yearIdStr && !!sectionIdStr
  })

  const isLoading = isDepartmentLoading || ispeerTutorLoading || isStudentsLoading

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  

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

  // Mock data for dropdown options REMOVED
  
  const onBackToDashboard = () => {
    router.push('/faculty/dashboard')
  }



  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['department'] }),
        queryClient.invalidateQueries({ queryKey: ['peerTutor'] }),
        queryClient.invalidateQueries({ queryKey: ['students'] }),
        // Invalidate Assign tab queries
        queryClient.invalidateQueries({ queryKey: ['assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['assignmentStats'] }),
        queryClient.invalidateQueries({ queryKey: ['unassignedStudents'] }),
        queryClient.invalidateQueries({ queryKey: ['peerTutorWithStudents'] }),
        queryClient.invalidateQueries({ queryKey: ['yearSyncStatus'] })
      ])

    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  const handlepeertutorsAssigned = () => {
    queryClient.invalidateQueries({ queryKey: ['peerTutor'] })
    queryClient.invalidateQueries({ queryKey: ['peerTutorWithStudents'] })
    queryClient.invalidateQueries({ queryKey: ['assignmentStats'] })
    queryClient.invalidateQueries({ queryKey: ['unassignedStudents'] })
  }

  const handleStudentAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['students'] })
    queryClient.invalidateQueries({ queryKey: ['unassignedStudents'] })
    queryClient.invalidateQueries({ queryKey: ['assignmentStats'] })
  }

  const [showForceDeleteModal, setShowForceDeleteModal] = useState(false)
  const [tutorToForceDelete, setTutorToForceDelete] = useState<{id: string, message: string} | null>(null)
  
  const handleForceDeleteConfirm = async () => {
    if (!tutorToForceDelete) return
    
    const forceResult = await peertutorservice.removepeertutors(tutorToForceDelete.id, true)
    
    if (forceResult.success) {
      toast.success(forceResult.message)
      // Refresh logic would go here if needed, but the original logic returned true/false to caller
      // Since this is async/modal based now, we can't return to caller immediately.
      // We must assume the UI updates via react-query invalidation.
      handlepeertutorsAssigned() // Re-use this to invalidate queries
    } else {
      toast.error(forceResult.message)
    }
    
    setShowForceDeleteModal(false)
    setTutorToForceDelete(null)
  }

  const handleRemovepeertutors = async (tutorId: string, silent: boolean = false) => {
    try {
      // When silent mode is true (called from bulk delete modal after confirmation),
      // always use forceDelete to delete peer tutor along with all related data
      const result = await peertutorservice.removepeertutors(tutorId, silent)
      if (result.success) {
        if (!silent) toast.success(result.message)
        return { success: true }
      } else {
        // Check if the error is about assigned students (only happens when forceDelete is false)
        if (result.message.includes('students are still assigned')) {
           // Instead of confirm(), show Modal
           setTutorToForceDelete({
             id: tutorId,
             message: result.message
           })
           setShowForceDeleteModal(true)
           // We return false here because we haven't deleted yet. The Modal will handle the rest.
           return { success: false, pendingConfirmation: true } 
        } else {
          if (!silent) toast.error(result.message)
          return { success: false }
        }
      }
    } catch (error) {
       console.error('Error removing peer tutor:', error)
       if (!silent) toast.error('Failed to remove peer tutor')
       return { success: false }
    }
  }


  const handleRemoveStudent = async (studentId: string, silent: boolean = false) => {
    try {
      const success = await StudentService.removeStudent(studentId)
      if (success) {
        if (!silent) toast.success('Student deleted successfully')
        return true
      } else {
        if (!silent) toast.error('Failed to delete student')
        return false
      }
    } catch (error) {
      console.error('Error removing student:', error)
      if (!silent) toast.error('An unexpected error occurred while deleting the student.')
      return false
    }
  }

  const handlepeertutorsClick = (tutorId: string) => {
    router.push(`/faculty/peer-tutor/${tutorId}`)
  }

  const handleBulkImportComplete = () => {
    // This will be called when bulk import is completed
    // We can reload the assignments data if needed
    console.log('Bulk import completed')
  }

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

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main content */}
      <div className={`${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col transition-all duration-300 w-full lg:w-auto`}>
        {isLoading ? (
          <SectionPageSkeleton />
        ) : (
          <>
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 h-20 flex items-center px-8">
              <div className="flex justify-between items-center w-full">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                      {yearNames[yearIdStr] || yearIdStr} <span className="text-gray-300 mx-2">/</span> {department?.name || 'Loading'}
                    </h1>
                  </div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">
                    SECTION {sectionIdStr} MANAGEMENT & ACADEMIC OVERVIEW
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <AnimatedRefreshButton onRefresh={handleRefresh} isRefreshing={isRefreshing} />
                  <BackButton href={`/faculty/department/${deptIdStr}/year/${yearIdStr}`} />
                </div>
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-8 max-w-[1600px] mx-auto w-full">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-2 mb-8 text-[11px] font-bold uppercase tracking-widest">
                <button 
                onClick={onBackToDashboard}
                  className="text-gray-400 hover:text-blue-600 transition-colors"
                >
                  DASHBOARD
                </button>
                <span className="text-gray-300">/</span>
                <BreadcrumbSelect 
                  value={yearIdStr}
                  options={yearNames}
                  onChange={(newYear) => router.push(`/faculty/department/${deptIdStr}/year/${newYear}`)}
                  className="text-gray-400 hover:text-blue-600"
                />
                <span className="text-gray-300">/</span>
                <BreadcrumbSelect 
                  value={sectionIdStr}
                  options={sectionNames}
                  onChange={(newSection) => router.push(`/faculty/department/${deptIdStr}/year/${yearIdStr}/section/${newSection}`)}
                  className="text-blue-600"
                />
              </nav>

              <div className="bg-white rounded-[20px] shadow-sm border border-gray-200">
                {/* Tabs */}
                <div className="bg-white sticky top-0 z-10 border-b border-gray-100 rounded-t-[20px]">
                  <nav className="flex space-x-2 px-4 sm:px-6 py-3 overflow-x-auto no-scrollbar" aria-label="Tabs">
                    {[
                      { id: 'peer-tutors', label: 'PEER TUTORS' },
                      { id: 'students', label: 'STUDENTS' },
                      { id: 'assign', label: 'ASSIGN' },
                      { id: 'classes', label: 'CLASSES' },
                      { id: 'attendance', label: 'ATTENDANCE' },
                      { id: 'import-export', label: 'IMPORT/EXPORT' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                          activeTab === tab.id
                            ? 'bg-black text-white shadow-lg shadow-gray-200 scale-105' 
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </div>

                {/* Tab Content */}
                <div className="p-4 sm:p-6">
                  {activeTab === 'peer-tutors' ? (
                    <PeerTutorTab 
                      peerTutor={peerTutor} 
                      students={students}
                      setIsModalOpen={setIsModalOpen} 
                      handleRemovepeertutors={handleRemovepeertutors}
                      onpeertutorsClick={handlepeertutorsClick}
                      dept={department?.name || 'Computer Science'}
                      year={yearIdStr}
                      section={sectionIdStr}
                      onRefresh={handleRefresh}
                    />
                  ) : activeTab === 'students' ? (
                    <StudentsTab 
                      students={students} 
                      peerTutor={peerTutor}
                      setIsStudentModalOpen={setIsStudentModalOpen} 
                      handleRemoveStudent={handleRemoveStudent}
                      dept={department?.name || 'Computer Science'}
                      year={yearIdStr}
                      section={sectionIdStr}
                      onRefresh={handleRefresh}
                    />
                  ) : activeTab === 'assign' ? (
                    <AssignTab 
                      dept={department?.name || 'Computer Science'} 
                      year={yearIdStr} 
                      section={sectionIdStr} 
                    />
                  ) : activeTab === 'classes' ? (
                    <ClassesTab 
                      dept={department?.name || 'Computer Science'} 
                      year={yearIdStr} 
                      section={sectionIdStr}
                      departmentId={department?.id || deptIdStr}
                    />
                  ) : activeTab === 'attendance' ? (
                    <AttendanceTab 
                      dept={department?.name || 'Computer Science'} 
                      year={yearIdStr} 
                      section={sectionIdStr}
                    />
                  ) : activeTab === 'import-export' ? (
                    <ImportExportTab 
                      dept={department?.name || 'Computer Science'} 
                      year={yearIdStr} 
                      section={sectionIdStr}
                      facultyId={department?.id || deptIdStr}
                      onImportComplete={handleBulkImportComplete}
                    />
                  ) : null}
                </div>
              </div>
            </main>

            {/* Modals */}
            <AssignpeertutorsModal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              onSuccess={handlepeertutorsAssigned}
              dept={department?.name || ''}
              year={yearIdStr}
              section={sectionIdStr}
            />

            <AddStudentModal
              isOpen={isStudentModalOpen}
              onClose={() => setIsStudentModalOpen(false)}
              onSuccess={handleStudentAdded}
              dept={department?.name || ''}
              year={yearIdStr}
              section={sectionIdStr}
            />
          </>
        )}
      </div>
    </div>
  )
}



