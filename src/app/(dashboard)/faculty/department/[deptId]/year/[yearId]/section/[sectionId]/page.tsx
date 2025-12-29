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
import AssignmentImportModal from '@/components/forms/AssignmentImportModal'
import PeerTutorImportModal from '@/components/forms/PeerTutorImportModal'
import StudentImportModal from '@/components/forms/StudentImportModal'
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
import { Eye, Users, BookOpen, Clock, MoreHorizontal, ArrowUpRight, Plus, Trash2, Download, Upload, Search, X, ChevronDown, Check, Filter, Edit2, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent, StatCard } from '@/components/ui'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { SectionPageSkeleton } from '@/components/skeletons/SectionPageSkeleton'
import { AssignTabSkeleton } from '@/components/skeletons/AssignTabSkeleton'
import { ClassesTabSkeleton } from '@/components/skeletons/ClassesTabSkeleton'
import AttendanceTabSkeleton from '@/components/skeletons/AttendanceTabSkeleton'
import ImportExportTabSkeleton from '@/components/skeletons/ImportExportTabSkeleton'
import TransferModal from '@/components/common/TransferModal'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

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
           <img src="/icons/student.png" alt="No peer tutors assigned" className="mx-auto h-24 w-24 opacity-60 grayscale" />
          <p className="text-lg font-semibold text-gray-900 mb-2">NO PEER TUTOR ASSIGNED</p>
          <p className="text-sm text-gray-500 text-center px-4">Click "ADD" to Assign a Peer Tutor</p>
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
                           <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm">
                                       {tutor.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
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
  const [peerTutorsWithStats, setPeerTutorsWithStats] = useState<PeerTutorWithStats[]>([])
  const [peerTutorStudentCounts, setPeerTutorStudentCounts] = useState<{[key: string]: number}>({})
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
    const loadPeerTutorStats = async () => {
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
        // Fallback
        setPeerTutorsWithStats(peerTutors.map(tutor => ({
          ...tutor,
          classStats: { totalClasses: 0, completedClasses: 0, pendingClasses: 0 },
          additionalClassesCount: 0
        })))
        setPeerTutorStudentCounts({})
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
         <img src="/icons/student.png" alt="No students found" className="mx-auto h-24 w-24 opacity-60 grayscale" />
          <p className="text-lg font-semibold text-gray-900 mb-2">NO STUDENTS FOUND</p>
          <p className="text-sm text-gray-500 text-center px-4">Click "ADD" to add students</p>
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
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
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
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm">
                              {student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
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
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                            Assigned
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
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
            // Refresh the page to show new students
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
                      <div>{row.peerTutorName}</div>
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
  const [activeSubTab, setActiveSubTab] = useState<'import' | 'export' | 'advanced'>('import')
  const [activeAdvancedTab, setActiveAdvancedTab] = useState<'general' | 'attendance' | 'nextTopicSheet' | 'mark'>('general')

  const dbYear = year
  const dbSection = section

  // React Query for Analytics
  const { data: analytics = {
        totalPeerTutors: 0,
        totalStudents: 0,
        totalClasses: 0,
        totalAttendanceRecords: 0,
        assignedStudents: 0,
        scheduledClasses: 0
      }, isLoading } = useQuery({
    queryKey: ['importExportAnalytics', dept, dbYear, dbSection],
    queryFn: async () => {
      const [tutors, sectionStudents, classes, scheduledClasses] = await Promise.all([
        PeerTutorService.getPeerTutorsBySection(dept, dbYear, dbSection),
        StudentService.getStudentsBySection(dept, dbYear, dbSection),
        ClassService.getClassesByYearSection(dept, dbYear, dbSection),
        ScheduledClassService.getScheduledClassesByYearSection(dept, dbYear, dbSection)
      ])

      const assignedCount = sectionStudents.filter(s => s.assigned_peer_tutor_id).length

      return {
        totalPeerTutors: tutors.length,
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
          <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{analytics.totalPeerTutors}</div>
          <div className="flex items-center text-emerald-500 text-xs font-bold relative z-10">
            <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
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
            <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
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
            <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
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
            <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
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
            <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
            <span>CLASSES</span>
          </div>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <nav className="flex space-x-8" aria-label="Import Export Tabs">
            <button
              onClick={() => setActiveSubTab('import')}
              className={`pb-3 px-1 border-b-2 font-semibold text-sm uppercase tracking-wide transition-colors ${
                activeSubTab === 'import'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
              }`}
            >
              Import
            </button>
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
          {activeSubTab === 'import' && (
            <div>
              <div className="mb-6">
                <div className="flex items-center mb-2">
                  <svg className="w-6 h-6 text-indigo-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900 uppercase">Import Data</h3>
                </div>
                <p className="text-sm text-gray-500">Upload Excel files to import peer tutors, students, and classes</p>
              </div>

              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
                  <BulkImportExport 
                    dept={dept} 
                    year={year} 
                    section={section} 
                    onImportComplete={onImportComplete}
                  />
                </div>
                
                <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
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
                  <svg className="w-6 h-6 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900 uppercase">Export Data to Excel</h3>
                </div>
                <p className="text-sm text-gray-500">Select the data you want to export and download in Excel format</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Export Peer Details */}
          <button
              onClick={handleExportPeerDetails}
              className="group bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-xl p-5 transition-all duration-200 text-left shadow-sm hover:shadow-md"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13.5 3.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md">XLSX</span>
              </div>
              <h4 className="text-sm font-bold text-gray-900 mb-1">PEER TUTOR DETAILS</h4>
              <p className="text-xs text-gray-500">Export all peer tutor information</p>
          </button>

            {/* Export Students */}
            <button
              onClick={handleExportStudents}
              className="group bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-xl p-5 transition-all duration-200 text-left shadow-sm hover:shadow-md"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
        </div>
                <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md">XLSX</span>
      </div>
              <h4 className="text-sm font-bold text-gray-900 mb-1">STUDENT DETAILS</h4>
              <p className="text-xs text-gray-500">Export all student information</p>
            </button>

            {/* Export Assignments */}
            <button
              onClick={handleExportAssignments}
              className="group bg-white hover:bg-purple-50 border border-gray-200 hover:border-purple-300 rounded-xl p-5 transition-all duration-200 text-left shadow-sm hover:shadow-md"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                  <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md">XLSX</span>
              </div>
              <h4 className="text-sm font-bold text-gray-900 mb-1">ASSIGNMENTS</h4>
              <p className="text-xs text-gray-500">Export assignment mappings</p>
            </button>

            {/* Export Attendance */}
            <button
              onClick={handleExportAttendance}
              className="group bg-white hover:bg-orange-50 border border-gray-200 hover:border-orange-300 rounded-xl p-5 transition-all duration-200 text-left shadow-sm hover:shadow-md"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                  <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
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
  const [selectedPeerTutor, setSelectedPeerTutor] = useState<string>('')
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [showUnassignAllModal, setShowUnassignAllModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  // --- Queries ---

  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
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

  const { data: peerTutorsWithStudents = [], isLoading: loadingTutors } = useQuery({
    queryKey: ['peerTutorsWithStudents', dept, dbYear, dbSection],
    queryFn: () => AssignmentService.getPeerTutorsWithStudents(dept, dbYear, dbSection)
  })

  const loading = loadingAssignments || loadingStats || loadingUnassigned || loadingTutors

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['assignments', dept, dbYear, dbSection] })
    queryClient.invalidateQueries({ queryKey: ['assignmentStats', dept, dbYear, dbSection] })
    queryClient.invalidateQueries({ queryKey: ['unassignedStudents', dept, dbYear, dbSection] })
    queryClient.invalidateQueries({ queryKey: ['peerTutorsWithStudents', dept, dbYear, dbSection] })
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
    if (!selectedStudent || !selectedPeerTutor) return

    try {
      const success = await AssignmentService.assignStudent(selectedStudent, selectedPeerTutor)
      if (success) {
        setSelectedStudent('')
        setSelectedPeerTutor('')
        invalidateQueries()
      }
    } catch (error) {
      console.error('Error manually assigning student:', error)
    }
  }

  const handleUnassignStudent = async (studentId: string) => {
    try {
      const success = await AssignmentService.unassignStudent(studentId)
      if (success) {
        invalidateQueries()
      }
    } catch (error) {
      console.error('Error unassigning student:', error)
    }
  }

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
    const allStudentIds = peerTutorsWithStudents.flatMap(({ students }) => 
      students.map(s => s.id)
    )
    
    if (selectedStudents.size === allStudentIds.length) {
      setSelectedStudents(new Set())
    } else {
      setSelectedStudents(new Set(allStudentIds))
    }
  }

  const handleBulkUnassign = async () => {
    if (selectedStudents.size === 0) return

    if (confirm(`Are you sure you want to unassign ${selectedStudents.size} student(s)?`)) {
      try {
        for (const studentId of selectedStudents) {
          await AssignmentService.unassignStudent(studentId)
          invalidateQueries()
        }
        setSelectedStudents(new Set())
        setIsDeleteMode(false)
        invalidateQueries()
      } catch (error) {
        console.error('Error bulk unassigning students:', error)
      }
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

      peerTutorsWithStudents.forEach(({ peerTutor, students }) => {
        if (!groupedAssignments.has(peerTutor.id)) {
          groupedAssignments.set(peerTutor.id, {
            tutorName: peerTutor.name,
            tutorEmail: peerTutor.email,
            students: []
          })
        }
        const group = groupedAssignments.get(peerTutor.id)!
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
      let currentRow = 1 // Start after header (0-indexed in array, but Excel is 1-indexed? SheetJS uses object properties)
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

        group.students.forEach((student, itemsIndex) => {
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
              <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
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
              <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
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
              <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
              <span>AVERAGE</span>
            </div>
          </div>

          <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Assignment Rate</h3>
              <button className="text-gray-300 hover:text-gray-500 transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
            </div>
            <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">{stats?.totalPeerTutors && stats?.totalStudents ? Math.round((stats.assignedStudents / stats.totalStudents) * 100) : 0}%</div>
            <div className="flex items-center text-purple-500 text-xs font-bold relative z-10">
              <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
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
                {peerTutorsWithStudents.some(({ students }) => students.length > 0) && (
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
                onClick={handleBulkUnassign}
                className="h-10 px-5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                <span>Unassign ({selectedStudents.size})</span>
              </button>
            )}
            {peerTutorsWithStudents.some(({ students }) => students.length > 0) && (
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
        
        {peerTutorsWithStudents.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center">
               <img src="/icons/student.png" alt="No assignments found" className="mx-auto h-24 w-24 opacity-60 grayscale" />
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
                          checked={selectedStudents.size > 0 && selectedStudents.size === peerTutorsWithStudents.flatMap(({ students }) => students).length}
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
                  {peerTutorsWithStudents.flatMap(({ peerTutor, students }) => {
                    if (students.length === 0) {
                      return [
                        <tr key={`${peerTutor.id}-empty`} className="hover:bg-gray-50">
                          {isDeleteMode && <td className="px-3 sm:px-4 md:px-6 py-4"></td>}
                          <td className="px-3 sm:px-4 md:px-6 py-4 text-center align-middle border-r border-gray-200">
                            <div className="flex flex-col items-center justify-center min-w-0">
                              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mb-2">
                                <span className="text-sm font-bold text-gray-600">
                                  {peerTutor.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
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
                          <td colSpan={isDeleteMode ? 2 : 3} className="px-3 sm:px-4 md:px-6 py-4 text-center">
                            <div className="text-sm text-gray-500 italic">No students assigned</div>
                          </td>
                        </tr>
                      ]
                    }
                    return students.map((student, index) => (
                      <tr key={`${peerTutor.id}-${student.id}`} className="hover:bg-gray-50">
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
                                    {peerTutor.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
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
  
  // Delete mode state
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set())
  const [selectedScheduledGroups, setSelectedScheduledGroups] = useState<Set<string>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [subjectsToDelete, setSubjectsToDelete] = useState<Array<{name: string, canDelete: boolean, reason?: string}>>([])

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

  // Derived loading state
  const loading = loadingClasses || loadingScheduled || loadingSubjectsList

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


  const handleDeleteClass = async (classId: string) => {
    if (confirm('Are you sure you want to delete this class?')) {
      try {
        const success = await ClassService.deleteClass(classId)
        if (success) {
          invalidateQueries()
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
      toast.error('Failed to export subjects')
    }
  }

  const handleDeleteScheduledClass = async (scheduledClassId: string) => {
    if (confirm('Are you sure you want to remove this schedule?')) {
      try {
        const success = await ScheduledClassService.deleteScheduledClass(scheduledClassId)
        if (success) {
          invalidateQueries()
        }
      } catch (error) {
        console.error('Error deleting scheduled class:', error)
      }
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

  const handleBulkDeleteScheduledGroups = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedScheduledGroups.size} scheduled class groups?`)) {
      return
    }

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
    } catch (error) {
      console.error('Error deleting scheduled groups:', error)
      alert('Failed to delete scheduled groups')
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
    } catch (error) {
      console.error('Error deleting subjects:', error)
      alert('Failed to delete some subjects. Please try again.')
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
      // Count unique scheduled dates for this class
      const uniqueScheduledDates = new Set(scheduledForClass.map(sc => sc.scheduled_date))
      
      if (!subjectMap.has(classItem.subject_name)) {
        subjectMap.set(classItem.subject_name, {
          name: classItem.subject_name,
          classesAllocated: 0,
          peerTutorsAllocated: 0,
          isScheduled: false
        })
      }
      
      const subjectData = subjectMap.get(classItem.subject_name)!
      // Add the count of unique scheduled dates instead of total scheduled class entries
      subjectData.classesAllocated += uniqueScheduledDates.size
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
      invalidateQueries()
    } catch (error) {
      console.error('Error deleting scheduled class group:', error)
      alert('Failed to remove schedule. Please try again.')
    }
  }


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
             <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
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
             <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
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
             <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
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
             <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
             <span>AVERAGE</span>
          </div>
        </div>
      </div>
      {/* Subjects List */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                SUBJECTS ({classes.length}) - SCHEDULED ({getGroupedScheduledClasses().length})
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
                  <span>ADD SUBJECT</span>
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
                  <span>ASSIGN DATES</span>
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
                <img src="/icons/classes.png" alt="No subjects created" className="mx-auto h-24 w-24 opacity-60 grayscale" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">NO SUBJECTS CREATED</h3>
                <p className="text-gray-500 text-sm">Click "ADD" to create the subject</p>
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
                          {subject.peerTutorsAllocated}
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
                  <img src="/icons/classes.png" alt="No scheduled subjects" className="mx-auto h-24 w-24 opacity-60 grayscale" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">NO SCHEDULED SUBJECTS</h3>
                  <p className="text-gray-500">Click "Assign" to schedule subjects</p>
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
          invalidateQueries() // Reload classes after successful date assignment
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
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-8 py-6 border-b border-gray-200">
              <div className="flex items-center justify-center w-16 h-16 mx-auto bg-red-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 text-center">
                Delete Subjects
              </h3>
              <p className="text-sm text-gray-500 text-center mt-2">
                Review the subjects below before confirming deletion
              </p>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {/* Subjects Table */}
              <div className="space-y-3">
                {subjectsToDelete.map((subject, index) => (
                  <div
                    key={index}
                    className={`rounded-lg border-2 p-4 transition-all ${
                      subject.canDelete
                        ? 'bg-white border-gray-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-gray-900 truncate">
                          {subject.name}
                        </p>
                        {!subject.canDelete && subject.reason && (
                          <div className="flex items-start gap-2 mt-2">
                            <svg className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <span className="text-sm text-red-700 font-medium">
                              Cannot delete: {subject.reason}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {subject.canDelete ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white text-gray-700 border border-gray-300">
                            Can delete
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                            Cannot delete
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer - Summary and Actions */}
            <div className="px-8 py-6 border-t border-gray-200 bg-gray-50">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-xs text-gray-500 font-medium mb-1 uppercase tracking-wide">Total selected</div>
                  <div className="text-2xl font-bold text-gray-900">{subjectsToDelete.length}</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-xs text-green-600 font-medium mb-1 uppercase tracking-wide">Will be deleted</div>
                  <div className="text-2xl font-bold text-green-600">
                    {subjectsToDelete.filter(s => s.canDelete).length}
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-xs text-red-600 font-medium mb-1 uppercase tracking-wide">Cannot be deleted</div>
                  <div className="text-2xl font-bold text-red-600">
                    {subjectsToDelete.filter(s => !s.canDelete).length}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row justify-end gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="w-full sm:w-auto px-6 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                {subjectsToDelete.some(s => s.canDelete) && (
                  <button
                    onClick={confirmBulkDelete}
                    className="w-full sm:w-auto px-6 py-3 text-sm font-medium text-white bg-red-600 border border-transparent rounded-xl hover:bg-red-700 transition-all"
                  >
                    Delete {subjectsToDelete.filter(s => s.canDelete).length} Subject(s)
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
  const [selectedClassType, setSelectedClassType] = useState<'scheduled' | 'additional'>('scheduled')
  const [peerTutorAttendance, setPeerTutorAttendance] = useState<any[]>([])
  const [selectedPeerTutor, setSelectedPeerTutor] = useState<any>(null)
  const [studentDetails, setStudentDetails] = useState<any[]>([])
  const [view, setView] = useState<'classes' | 'peer-tutors' | 'students'>('classes')
  const [expandedClassRows, setExpandedClassRows] = useState<Set<string>>(new Set())
  const [expandedPeerTutorRows, setExpandedPeerTutorRows] = useState<Set<string>>(new Set())
  const [peerTutorStudentDetails, setPeerTutorStudentDetails] = useState<Map<string, any[]>>(new Map())
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
          
          {uniqueClasses.length > 0 && (
            <button
              onClick={handleExportAllAttendance}
              className="h-10 px-4 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
            >
              EXPORT ALL
            </button>
          )}
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
                              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mr-3">
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
            <img src="/icons/attendance.png" alt="No scheduled classes" className="mx-auto h-24 w-24 opacity-60 grayscale" />
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
  const { data: peerTutors = [], isLoading: isPeerTutorsLoading } = useQuery({
    queryKey: ['peerTutors', department?.name, yearIdStr, sectionIdStr],
    queryFn: () => PeerTutorService.getPeerTutorsBySection(
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
    enabled: !!department?.name
  })

  const isLoading = isDepartmentLoading || isPeerTutorsLoading || isStudentsLoading

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)
  
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['department'] }),
        queryClient.invalidateQueries({ queryKey: ['peerTutors'] }),
        queryClient.invalidateQueries({ queryKey: ['students'] })
      ])
      setLastRefresh(new Date())
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  const handlePeerTutorAssigned = () => {
    queryClient.invalidateQueries({ queryKey: ['peerTutors'] })
  }

  const handleStudentAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['students'] })
  }

  const handleRemovePeerTutor = async (tutorId: string, silent: boolean = false) => {
    try {
      const result = await PeerTutorService.removePeerTutor(tutorId)
      if (result.success) {
        // Data reload should be handled by caller via onRefresh
        if (!silent) toast.success(result.message)
        return { success: true }
      } else {
        // Check if the error is about assigned students
        if (result.message.includes('students are still assigned')) {
          const forceDelete = confirm(`${result.message}\n\nDo you want to force delete this peer tutor? This will unassign all students.`)
          if (forceDelete) {
            const forceResult = await PeerTutorService.removePeerTutor(tutorId, true)
            if (forceResult.success) {
              if (!silent) toast.success(forceResult.message)
              return { success: true }
            } else {
              if (!silent) toast.error(forceResult.message)
              return { success: false }
            }
          }
           return { success: false }
        } else {
          if (!silent) toast.error(result.message)
          return { success: false }
        }
      }
    } catch (error) {
      console.error('Error removing peer tutor:', error)
      if (!silent) toast.error('An unexpected error occurred while deleting the peer tutor.')
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

  const handlePeerTutorClick = (tutorId: string) => {
    router.push(`/faculty/peer-tutor/${tutorId}`)
  }

  const handleBulkImportComplete = () => {
    // This will be called when bulk import is completed
    // We can reload the assignments data if needed
    console.log('Bulk import completed')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main content */}
      <div className={`${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden transition-all duration-300 ease-in-out`}>
        {isLoading ? (
          <SectionPageSkeleton />
        ) : (
          <>
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
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                className={`p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all ${isRefreshing ? 'animate-spin text-blue-600' : ''}`}
              >
                <ArrowUpRight className={`w-5 h-5 ${isRefreshing ? 'rotate-45' : ''}`} />
              </button>
                <button
                  onClick={() => router.back()}
                   className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                BACK
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
                        DASHBOARD
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
            <div className="bg-white sticky top-0 z-10 border-b border-gray-100">
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
                <PeerTutorsTab 
                  peerTutors={peerTutors} 
                  students={students}
                  setIsModalOpen={setIsModalOpen} 
                  handleRemovePeerTutor={handleRemovePeerTutor}
                  onPeerTutorClick={handlePeerTutorClick}
                  dept={department?.name || 'Computer Science'}
                  year={yearId}
                  section={sectionId}
                  onRefresh={handleRefresh}
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
                  onRefresh={handleRefresh}
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
        dept={department?.name || ''} // ← This will now be the actual department
        year={yearIdStr}        // ← "2" (raw value for storage)
        section={sectionIdStr}  // ← "A" (raw value for storage)
      />

      <AddStudentModal
        isOpen={isStudentModalOpen}
        onClose={() => setIsStudentModalOpen(false)}
        onSuccess={handleStudentAdded}
        dept={department?.name || ''} // ← This will now be the actual department
        year={yearIdStr}        // ← "2" (raw value for storage)
        section={sectionIdStr}  // ← "A" (raw value for storage)
      />

      {/* Delete Confirmation Modal */}

          </>
        )}
      </div>
    </div>
  )
}



