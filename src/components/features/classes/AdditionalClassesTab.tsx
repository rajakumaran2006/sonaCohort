'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { AttendanceRecord } from '@/lib/services/attendanceService'
import ExportButton from '@/components/ui/ExportButton'
import { AdditionalClassService, AdditionalClassWithAttendance } from '@/lib/services/additionalClassService'
import { FacultyService } from '@/lib/services/facultyService'
import DeleteConfirmationModal from '@/components/forms/modals/DeleteConfirmationModal'
import DatePicker from '@/components/ui/DatePicker'
import * as XLSX from 'xlsx'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { Plus, Trash2, ChevronDown, CheckCircle, XCircle, User, FileText, Clock, Search, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { isValidUrl } from '@/lib/utils/validators'

const formatTime = (timeStr: string | null | undefined) => {
  if (!timeStr) return '??:??'
  try {
    const [hours, minutes] = timeStr.split(':')
    const h = parseInt(hours, 10)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${minutes} ${ampm}`
  } catch {
    return timeStr
  }
}

// Helper to parse "YYYY-MM-DD" as a local date (prevents timezone shifts)
const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date()
  // Handle if dateStr already has time or T, but mainly expecting YYYY-MM-DD
  const cleanDate = dateStr.split('T')[0]
  const [y, m, d] = cleanDate.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const getTodayDateStr = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface peertutorsInfo {
  id: string
  name: string
  faculty_id?: string
  dept?: string
  year?: string
  section?: string
}

interface Student {
  id: string
  name: string
  email?: string | null
}

interface AdditionalClassesTabProps {
  peertutorsInfo: peertutorsInfo
  assignedStudents: Student[]
  scheduledClasses?: { scheduled_date?: string }[]
  deptInfo: {
    faculty_name?: string
    name: string
  } | null
}

export default function AdditionalClassesTab({ peertutorsInfo, assignedStudents, deptInfo }: AdditionalClassesTabProps) {
  // const { user } = useAuth() // keeping user if it might be needed, or remove if truly unused. The error said 'user' is assigned but never used.

  const [additionalClasses, setAdditionalClasses] = useState<AdditionalClassWithAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newClass, setNewClass] = useState({
    subject: '',
    topic: '',
    date: getTodayDateStr(),
    startTime: '',
    endTime: '',
    link: '',
    students: [] as AttendanceRecord[]
  })
  const [saving, setSaving] = useState(false)
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set())
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [initialClassState, setInitialClassState] = useState<typeof newClass | null>(null)
  const [isLinkMandatory, setIsLinkMandatory] = useState(true)

  // Filter states
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const disabledDates = React.useMemo(() => {
    // We want to allow additional classes on any day, even if there are existing classes
    return []
  }, [])

  const loadAdditionalClasses = useCallback(async () => {
    if (!peertutorsInfo?.id) return

    setLoading(true)
    try {
      const classes = await AdditionalClassService.getAdditionalClassesBypeertutors(peertutorsInfo.id)
      setAdditionalClasses(classes)
    } catch (error) {
      logger.error('Error loading additional classes:', error)
    } finally {
      setLoading(false)
    }
  }, [peertutorsInfo?.id])

  useEffect(() => {
    if (peertutorsInfo) {
      loadAdditionalClasses()
    }
  }, [peertutorsInfo, loadAdditionalClasses])

  useEffect(() => {
    if (assignedStudents && assignedStudents.length > 0) {
      const attendanceRecords: AttendanceRecord[] = assignedStudents.map(student => ({
        student_id: student.id,
        student_name: student.name,
        student_email: student.email || '',
        status: 'present' as const
      }))
      setNewClass(prev => ({ ...prev, students: attendanceRecords }))
    }
  }, [assignedStudents])

  const loadAvailableSubjects = async () => {
    if (!peertutorsInfo?.id) return

    setLoadingSubjects(true)
    try {
      const subjects = await AdditionalClassService.getAvailableSubjectsForpeertutors(peertutorsInfo.id)
      setAvailableSubjects(subjects)
    } catch (error) {
      logger.error('Error loading available subjects:', error)
    } finally {
      setLoadingSubjects(false)
    }
  }

  // Fetch settings on mount or when peer tutor info changes
  useEffect(() => {
    const fetchSettings = async () => {
      // We prioritize fetching by department name because peertutorsInfo.faculty_id is likely the Auth ID,
      // while getFacultyDepartment expects the Department UUID.
      if (!peertutorsInfo?.dept) {
        logger.warn('No department found in peer tutor info, skipping settings fetch')
        return
      }

      try {
        logger.info(`Checking mandatory link setting for dept: ${peertutorsInfo.dept}`)
        const facultyDept = await FacultyService.getFacultyDepartmentByName(peertutorsInfo.dept)
        
        if (facultyDept) {
            // Explicit check: only true if it is NOT false. (null/undefined => true)
            const isMandatory = facultyDept.is_class_link_mandatory !== false
            logger.info(`Mandatory link setting retrieved: ${isMandatory}`)
            setIsLinkMandatory(isMandatory)
        } else {
            logger.warn(`Could not retrieve faculty settings for department: ${peertutorsInfo.dept}`)
        }
      } catch (error) {
        logger.error('Error fetching class settings:', error)
      }
    }

    fetchSettings()
  }, [peertutorsInfo])

  const handleAddClass = () => {
    if (assignedStudents.length === 0) {
      toast.warning("You need assigned students to create an additional class")
      return
    }

    const startState = {
      subject: '',
      topic: '',
      date: getTodayDateStr(),
      startTime: '',
      endTime: '',
      link: '',
      students: assignedStudents.map(student => ({
        student_id: student.id,
        student_name: student.name,
        student_email: student.email || '',
        status: 'present' as const
      }))
    }
    setNewClass(startState)
    setInitialClassState(null)
    setEditingId(null)
    setShowAddForm(true)
    loadAvailableSubjects()
  }

  const handleEditClass = (classItem: AdditionalClassWithAttendance) => {
    const startState = {
      subject: classItem.subject_name,
      topic: classItem.topic,
      date: classItem.class_date ? classItem.class_date.split('T')[0] : '',
      startTime: classItem.start_time || '',
      endTime: classItem.end_time || '',
      link: classItem.link || '',
      students: classItem.attendance_records.map(record => ({
        student_id: record.student_id,
        student_name: record.student_name,
        student_email: record.student_email || '',
        status: record.status
      }))
    }
    setNewClass(startState)
    setInitialClassState(startState)
    setEditingId(classItem.id)
    setShowAddForm(true)
    loadAvailableSubjects()
  }


// ... (existing code)

  const handleSaveClass = async () => {
    if (!newClass.subject.trim() || !newClass.topic.trim() || !newClass.date) {
      toast.error('Please fill in all required fields')
      return
    }

    if (isLinkMandatory && !newClass.link) {
      toast.error('Class link is mandatory')
      return
    }

    if (newClass.link && !isValidUrl(newClass.link)) {
        toast.error('Please enter a valid link')
        return
    }

    if (newClass.topic.length > 50) {
      toast.error('Topic must be 50 characters or less')
      return
    }

    if (!peertutorsInfo?.id) {
// ... (rest of function)
      toast.error('Peer tutor information not available')
      return
    }
    
    // Validate at least one student is present
    const hasPresentStudent = newClass.students.some(student => student.status === 'present')
    if (!hasPresentStudent) {
      toast.warning('At least one student must be marked as present', { position: 'top-right' })
      return
    }

    if (newClass.startTime && newClass.endTime && newClass.endTime <= newClass.startTime) {
      toast.error('End time must be after start time')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
          // Update existing class

          const success = await AdditionalClassService.updateAdditionalClassDetails(editingId, {
              subject_name: newClass.subject,
              topic: newClass.topic,
              class_date: newClass.date,
              start_time: newClass.startTime,
              end_time: newClass.endTime,
              link: newClass.link
          })
          
          // Update attendance
          await AdditionalClassService.updateAttendanceForAdditionalClass(editingId, peertutorsInfo.id, newClass.students)

          if (success) {
            await loadAdditionalClasses()
            setShowAddForm(false)
            setEditingId(null)
            resetForm()
            toast.success('Class updated successfully')
          } else {
             toast.error('Failed to update class')
          }

      } else {
          // Create new class
          const additionalClass = await AdditionalClassService.createAdditionalClass(
            peertutorsInfo.id,
            newClass.subject,
            newClass.topic,
            newClass.date,
            newClass.students,
            newClass.startTime,
            newClass.endTime,
            newClass.link
          )

          if (additionalClass) {
            await loadAdditionalClasses()
            setShowAddForm(false)
            resetForm()
            toast.success('Class created successfully')
          } else {
            toast.error('Error creating additional class. Please try again.')
          }
      }
    } catch (error) {
      logger.error('Error saving additional class:', error)
      toast.error('Error saving additional class. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setNewClass({
      subject: '',
      topic: '',
      date: getTodayDateStr(),
      startTime: '',
      endTime: '',
      link: '',
      students: []
    })
  }

  const handleStudentStatusChange = (studentId: string, status: 'present' | 'absent') => {
    setNewClass(prev => ({
      ...prev,
      students: prev.students.map(student =>
        student.student_id === studentId ? { ...student, status } : student
      )
    }))
  }

  const toggleDeleteMode = () => {
    if (deleteMode) {
      setSelectedClasses(new Set())
    }
    setDeleteMode(!deleteMode)
  }

  const toggleClassSelection = (classId: string) => {
    const newSelected = new Set(selectedClasses)
    if (newSelected.has(classId)) {
      newSelected.delete(classId)
    } else {
      newSelected.add(classId)
    }
    setSelectedClasses(newSelected)
  }

  const toggleRowExpand = (classId: string) => {
    const newExpanded = new Set<string>()
    // If the clicked row is not currently expanded, expand it (and close all others)
    // If the clicked row is currently expanded, close it (leave the set empty)
    if (!expandedRows.has(classId)) {
      newExpanded.add(classId)
    }
    setExpandedRows(newExpanded)
  }

  const handleDeleteClick = () => {
    if (selectedClasses.size === 0) {
      toast.warning('Please select at least one class to delete')
      return
    }
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (selectedClasses.size === 0) return

    setIsDeleting(true)
    try {
      const deletePromises = Array.from(selectedClasses).map(classId =>
        AdditionalClassService.deleteAdditionalClass(classId)
      )
      
      await Promise.all(deletePromises)
      await loadAdditionalClasses()
      
      setDeleteMode(false)
      setSelectedClasses(new Set())
      setShowDeleteModal(false)
      
    } catch (error) {
      logger.error('Error deleting classes:', error)
      toast.error('Error deleting classes. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Filter classes
  const filteredAdditionalClasses = React.useMemo(() => {
    let filtered = additionalClasses

    // Apply date range filters
    if (fromDate) {
      filtered = filtered.filter(item => new Date(item.class_date) >= new Date(fromDate))
    }
    if (toDate) {
      const end = new Date(toDate)
      end.setHours(23, 59, 59, 999)
      filtered = filtered.filter(item => new Date(item.class_date) <= end)
    }

    // Apply search filter (Subject or Topic)
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(item =>
        item.subject_name.toLowerCase().includes(term) ||
        item.topic.toLowerCase().includes(term)
      )
    }

    // Apply subject filter
    if (filterSubject) {
      filtered = filtered.filter(item => item.subject_name === filterSubject)
    }

    return filtered
  }, [additionalClasses, searchTerm, filterSubject, fromDate, toDate])

  const getUniqueSubjects = () => [...new Set(additionalClasses.map(c => c.subject_name))].sort().map(s => ({ label: s, value: s }))

  const handleExportToExcel = () => {
    if (filteredAdditionalClasses.length === 0) {
      toast.warning('No data to export. Please adjust your filters.')
      return
    }

    try {
      const filtersApplied = !!(searchTerm || filterSubject || fromDate || toDate)

      const metadata = [
        ['PEER TUTOR ADDITIONAL CLASS REPORT'],
        ['Export Date:', new Date().toLocaleDateString(), 'Export Time:', new Date().toLocaleTimeString()],
        ['Dept:', peertutorsInfo?.dept || 'N/A', 'Year:', peertutorsInfo?.year || 'N/A', 'Section:', peertutorsInfo?.section || 'N/A'],
        ['Filter Applied:', filtersApplied ? 'YES' : 'NO', 'Filters:', [
          searchTerm ? `Search: ${searchTerm}` : '',
          filterSubject ? `Subject: ${filterSubject}` : '',
          fromDate ? `From: ${fromDate}` : '',
          toDate ? `To: ${toDate}` : ''
        ].filter(Boolean).join(', ') || 'None'],
        ['Incharge:', deptInfo?.faculty_name || 'N/A', 'Tutor:', peertutorsInfo?.name || 'N/A', 'Assigned Students:', (assignedStudents || []).length],
        [''],
        ['SUBJECT', 'DATE', 'TOPIC', 'TIME', 'PRESENT', 'ABSENT', 'TOTAL']
      ]

      const exportData = filteredAdditionalClasses.map(classItem => {
        const presentCount = classItem.attendance_records.filter(r => r.status === 'present').length
        const absentCount = classItem.attendance_records.filter(r => r.status === 'absent').length
        const totalCount = classItem.attendance_records.length
        
        return [
          classItem.subject_name,
          parseLocalDate(classItem.class_date).toLocaleDateString('en-GB'),
          classItem.topic,
          classItem.start_time ? `${formatTime(classItem.start_time)} - ${formatTime(classItem.end_time)}` : '--:--',
          presentCount,
          absentCount,
          totalCount
        ]
      })

      const ws = XLSX.utils.aoa_to_sheet([...metadata, ...exportData])
      
      // Fix column widths
      ws['!cols'] = [
        { wch: 25 }, { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Additional Classes')
      XLSX.writeFile(wb, `Additional_Classes_Export_${new Date().toISOString().split('T')[0]}.xlsx`)
      toast.success('Successfully exported additional classes')
    } catch (error) {
      logger.error('Error exporting to Excel:', error)
      toast.error('Error exporting to Excel. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
         <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      
      {/* Unified Header, Filters & Table Container */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header & Filters */}
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex flex-col space-y-4">
            {/* Title & Static Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 uppercase tracking-tight">Additional Classes</h2>
                <p className="text-xs font-medium text-gray-500 mt-1">Manage extra sessions and attendance</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {assignedStudents.length > 0 && (
                  <>
                    <button
                      onClick={toggleDeleteMode}
                      title={deleteMode ? "Cancel Delete Mode" : "Delete Classes"}
                      className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm ${
                        deleteMode 
                          ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' 
                          : 'bg-red-600 hover:bg-red-700 text-white'
                      }`}
                    >
                      {deleteMode ? (
                        <>
                          <span className="text-lg leading-none">&times;</span>
                          <span>Cancel</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} strokeWidth={2.5} />
                          <span>Delete</span>
                        </>
                      )}
                    </button>

                    {deleteMode && selectedClasses.size > 0 && (
                      <button
                        onClick={handleDeleteClick}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm"
                      >
                        Delete ({selectedClasses.size})
                      </button>
                    )}

                    {!deleteMode && (
                      <button
                        onClick={handleAddClass}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm"
                      >
                        <Plus size={14} strokeWidth={3} />
                        <span>Add Class</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Filters Row */}
            <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center pt-2">
              <div className="relative w-full lg:max-w-xs">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search subject or topic..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 focus:border-blue-400 rounded-xl text-xs transition-all outline-none shadow-sm"
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              </div>

              <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                {/* Date range filters */}
                <div className="flex flex-row items-center gap-2 w-full sm:w-auto bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="text-[10px] font-bold text-gray-600 focus:outline-none bg-transparent uppercase tracking-tighter"
                    placeholder="From"
                  />
                  <span className="text-gray-300 mx-1">|</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="text-[10px] font-bold text-gray-600 focus:outline-none bg-transparent uppercase tracking-tighter"
                    placeholder="To"
                  />
                </div>

                {/* Subject Filter */}
                <div className="relative w-full sm:w-auto sm:min-w-[140px]">
                  <select
                    value={filterSubject}
                    onChange={(e) => setFilterSubject(e.target.value)}
                    className="w-full appearance-none pl-4 pr-10 py-2 bg-white border border-gray-200 focus:border-blue-400 rounded-xl text-xs font-bold text-gray-600 outline-none shadow-sm uppercase tracking-wider"
                  >
                    <option value="">Subject</option>
                    {getUniqueSubjects().map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" size={14} />
                </div>

                <div className="w-full sm:w-auto flex flex-row gap-2">
                  <div className="flex-1 sm:flex-none">
                    <ExportButton onClick={handleExportToExcel} disabled={filteredAdditionalClasses.length === 0} />
                  </div>
                  
                  {(filterSubject || searchTerm || fromDate || toDate) && (
                    <button 
                      onClick={() => {
                        setFilterSubject('')
                        setSearchTerm('')
                        setFromDate('')
                        setToDate('')
                      }}
                      className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 rounded-xl transition-colors uppercase tracking-wider"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* ↓ Table / empty state rendered directly inside this same card — no gap ↓ */}
   
      {/* Add Class Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 animate-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">{editingId ? 'Manage Class Entry' : 'New Class Entry'}</h3>
             <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600"><XCircle size={20} /></button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Subject</label>
              {loadingSubjects ? (
                 <div className="h-10 w-full bg-gray-50 rounded-lg animate-pulse"></div>
              ) : (
                 <div className="relative">
                    <select
                      value={newClass.subject}
                      onChange={(e) => setNewClass(prev => ({ ...prev, subject: e.target.value }))}
                      className="w-full appearance-none pl-4 pr-10 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl text-sm font-medium transition-all outline-none"
                    >
                      <option value="">Select Subject</option>
                      {availableSubjects.map((subject) => (
                        <option key={subject} value={subject}>{subject}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={16} />
                 </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Topic</label>
                <span className={`text-[9px] font-black uppercase tracking-widest ${newClass.topic.length >= 50 ? 'text-red-500' : 'text-gray-400'}`}>
                  {newClass.topic.length}/50 Chars
                </span>
              </div>
              <div className="relative">
                 <input
                   type="text"
                   maxLength={50}
                   value={newClass.topic}
                   onChange={(e) => {
                     const val = e.target.value;
                     if (val.length <= 50) {
                       setNewClass(prev => ({ ...prev, topic: val }))
                     }
                   }}
                   className={`w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl text-sm font-medium transition-all outline-none ${newClass.topic.length > 50 ? 'border-red-300' : ''}`}
                   placeholder="Enter topic name"
                 />
                 <FileText className="absolute left-3.5 top-3 text-gray-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Date</label>
              <DatePicker
                value={newClass.date}
                onChange={(date) => setNewClass(prev => ({ ...prev, date }))}
                disabledDates={disabledDates}
                placeholder="Select date"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Start Time</label>
              <input
                type="time"
                value={newClass.startTime}
                onChange={(e) => setNewClass(prev => ({ ...prev, startTime: e.target.value }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl text-sm font-medium transition-all outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">End Time</label>
              <input
                type="time"
                value={newClass.endTime}
                min={newClass.startTime}
                onChange={(e) => setNewClass(prev => ({ ...prev, endTime: e.target.value }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl text-sm font-medium transition-all outline-none"
              />
            </div>

            <div className="space-y-2 md:col-span-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                Class Link {isLinkMandatory ? '' : '(Optional)'}
              </label>
              <input
                type="url"
                value={newClass.link}
                onChange={(e) => setNewClass(prev => ({ ...prev, link: e.target.value }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl text-sm font-medium transition-all outline-none"
                placeholder={isLinkMandatory ? "https:/outlook.com/..." : "https:/outlook.com/... (Optional)"}
              />
            </div>
          </div>

          {newClass.students.length > 0 && (
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-5">
              <div className="flex justify-between items-center mb-4">
                 <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Attendance Sheet</h4>
                 <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wider">
                    <span className="text-green-600">Present</span>
                    <span className="text-gray-300">/</span>
                    <span className="text-red-600">Absent</span>
                 </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {newClass.students.map((student) => (
                  <div key={student.student_id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold">
                          {student.student_name.substring(0,2).toUpperCase()}
                       </div>
                       <div>
                          <p className="text-xs font-bold text-gray-900">{student.student_name}</p>
                          <p className="text-[10px] text-gray-400 truncate max-w-[100px]">{student.student_email}</p>
                       </div>
                    </div>
                    <div className="flex bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => handleStudentStatusChange(student.student_id, 'present')}
                        className={`p-1 rounded ${student.status === 'present' ? 'bg-white shadow-sm text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                         <CheckCircle size={16} />
                      </button>
                      <button
                        onClick={() => handleStudentStatusChange(student.student_id, 'absent')}
                        className={`p-1 rounded ${student.status === 'absent' ? 'bg-white shadow-sm text-red-600' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                         <XCircle size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveClass}
              disabled={saving || (!!editingId && !!initialClassState && (
                JSON.stringify(newClass) === JSON.stringify(initialClassState)
              ))}
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle size={16} />}
              <span className='uppercase'>{editingId ? 'Update' : 'Save'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main List — sits flush below the filter header inside the same card */}
      <div>
         {filteredAdditionalClasses.length > 0 ? (
            <>
               {/* Mobile Card View */}
               <div className="md:hidden divide-y divide-gray-100">
                  {filteredAdditionalClasses.map((classItem) => {
                     const presentCount = classItem.attendance_records.filter(r => r.status === 'present').length
                     const totalCount = classItem.attendance_records.length
                     const isExpanded = expandedRows.has(classItem.id)
                     const isSelected = selectedClasses.has(classItem.id)

                     return (
                        <div key={classItem.id} className={`p-4 ${isSelected ? 'bg-blue-50/30' : ''}`}>
                           <div className="flex items-start gap-3">
                              {deleteMode && (
                                 <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleClassSelection(classItem.id)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer mt-1"
                                 />
                              )}
                              <div className="flex-1 min-w-0">
                                 <div className="flex items-center justify-between gap-2 mb-2">
                                    <h4 className="text-sm font-bold text-gray-900 truncate">{classItem.subject_name}</h4>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                       <span className="text-xs font-bold text-black bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{presentCount} / {totalCount}</span>
                                    </div>
                                 </div>
                                 <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                                       {parseLocalDate(classItem.class_date).toLocaleDateString()}
                                    </span>
                                    <div className="flex items-center gap-2">

                                       <button
                                          onClick={() => handleEditClass(classItem)}
                                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-black border border-gray-300 text-white shadow-sm active:bg-gray-800"
                                       >
                                          Manage
                                       </button>
                                       <button
                                          onClick={() => toggleRowExpand(classItem.id)}
                                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                                             isExpanded 
                                                ? 'bg-white border border-gray-200 text-black' 
                                                : 'bg-white border border-gray-200 text-black hover:text-gray-700'
                                          }`}
                                       >
                                          <ChevronDown size={12} className={`bg-white transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                       </button>
                                    </div>
                                 </div>
                              </div>
                           </div>
                           
                           {isExpanded && (
                              <div className="mt-4 bg-gray-50 rounded-xl border border-gray-200 p-4">
                                 {/* Mobile Class Details */}
                                 <div className="mb-6 space-y-4">
                                    <div>
                                       <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-widest mb-2">Topic</h4>
                                       <p className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-100">
                                          {classItem.topic.split(' ').slice(0, 3).join(' ')}{classItem.topic.split(' ').length > 3 ? '...' : ''}
                                       </p>
                                    </div>
                                    <div className="space-y-4">
                                       {(classItem.start_time || classItem.end_time) && (
                                          <div>
                                             <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-widest mb-2">Time</h4>
                                             <p className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-100 inline-block">
                                                {(() => {
                                                   if (!classItem.start_time || !classItem.end_time) return '-- MINS';
                                                   const [startH, startM] = classItem.start_time.split(':').map(Number);
                                                   const [endH, endM] = classItem.end_time.split(':').map(Number);
                                                   const diffMins = (endH * 60 + endM) - (startH * 60 + startM);
                                                   return `${diffMins} MINS`;
                                                })()}
                                             </p>
                                          </div>
                                       )}
                                       <div>
                                          <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-widest mb-2">Link</h4>
                                          {classItem.link ? (
                                             <a href={classItem.link} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 hover:text-gray-900 hover:underline bg-gray-50 p-2 rounded border border-gray-100 break-all block">
                                                {classItem.link}
                                             </a>
                                          ) : (
                                             <p className="text-xs text-gray-400 italic bg-white p-2 rounded border border-gray-100 inline-block">
                                                No link provided
                                             </p>
                                          )}
                                       </div>
                                    </div>
                                 </div>

                                 <div className="flex items-center gap-2 mb-3 pt-4 border-t border-gray-200">
                                    <User size={14} className="text-gray-400" />
                                    <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-widest">Student Attendance</h4>
                                 </div>
                                 
                                 {classItem.attendance_records.length > 0 ? (
                                    <div className="space-y-2">
                                       {classItem.attendance_records.map((record) => (
                                          <div key={record.id} className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 bg-white">
                                             <div className="overflow-hidden flex-1 min-w-0 mr-2">
                                                <p className="text-xs font-bold text-gray-900 truncate">{record.student_name}</p>
                                                <p className="text-[10px] text-gray-400 truncate">{record.student_email}</p>
                                             </div>
                                             <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded flex-shrink-0 ${
                                                record.status === 'present' 
                                                   ? 'bg-green-600 text-white'
                                                   : 'bg-red-600 text-white'
                                             }`}>
                                                {record.status}
                                             </span>
                                          </div>
                                       ))}
                                    </div>
                                 ) : (
                                    <p className="text-xs text-gray-400 italic">No attendance records found.</p>
                                 )}
                              </div>
                           )}
                        </div>
                     )
                  })}
               </div>

               {/* Desktop Table View */}
               <div className="hidden md:block overflow-x-auto">
                  <Table>
                     <TableHeader>
                        <TableRow className="bg-white hover:bg-white border-b border-gray-100">
                           {deleteMode ? (
                               <TableHead className="py-4 pl-6 w-10"><span className="sr-only">Select</span></TableHead>
                           ) : null}
                           <TableHead className={`py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] whitespace-nowrap ${!deleteMode ? 'pl-6' : 'px-2'}`}>Subject</TableHead>
                           <TableHead className="py-4 px-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] whitespace-nowrap">Topic</TableHead>
                           <TableHead className="py-4 px-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] whitespace-nowrap">Date</TableHead>
                           <TableHead className="py-4 px-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] whitespace-nowrap">Time</TableHead>
                           <TableHead className="py-4 px-2 text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] whitespace-nowrap">Attendance</TableHead>
                           <TableHead className="py-4 pr-6 w-10"><span className="sr-only">Actions</span></TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {filteredAdditionalClasses.map((classItem) => {
                           const presentCount = classItem.attendance_records.filter(r => r.status === 'present').length
                           const totalCount = classItem.attendance_records.length
                           const isExpanded = expandedRows.has(classItem.id)
                           const isSelected = selectedClasses.has(classItem.id)

                           return (
                              <React.Fragment key={classItem.id}>
                                 <TableRow className={`hover:bg-gray-50/80 transition-colors group ${isSelected ? 'bg-blue-50/30' : ''}`}>
                                    {deleteMode && (
                                       <TableCell className="py-4 pl-6 text-center">
                                          <input
                                             type="checkbox"
                                             checked={isSelected}
                                             onChange={() => toggleClassSelection(classItem.id)}
                                             className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                          />
                                       </TableCell>
                                    )}
                                    <TableCell className={`py-5 text-left ${!deleteMode ? 'pl-6' : 'px-2'}`}>
                                       <p className="text-sm font-black text-gray-900 uppercase tracking-tight">{classItem.subject_name}</p>
                                    </TableCell>
                                    <TableCell className="py-5 px-2 text-left">
                                       <p className="text-sm font-medium text-gray-500 leading-tight max-w-[200px]" title={classItem.topic}>
                                          {classItem.topic.split(' ').slice(0, 3).join(' ')}{classItem.topic.split(' ').length > 3 ? '...' : ''}
                                       </p>
                                    </TableCell>
                                    <TableCell className="py-5 px-2 text-left">
                                       <span className="text-xs font-black text-gray-900 uppercase tracking-wider">
                                          {parseLocalDate(classItem.class_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                       </span>
                                    </TableCell>
                                    <TableCell className="py-5 px-2 text-left">
                                       <span className="text-xs font-black text-gray-900 uppercase tracking-wider whitespace-nowrap">
                                          {(() => {
                                             if (!classItem.start_time || !classItem.end_time) return '-- MINS';
                                             const [startH, startM] = classItem.start_time.split(':').map(Number);
                                             const [endH, endM] = classItem.end_time.split(':').map(Number);
                                             const diffMins = (endH * 60 + endM) - (startH * 60 + startM);
                                             return `${diffMins} MINS`;
                                          })()}
                                       </span>
                                    </TableCell>
                                    <TableCell className="py-5 px-2 text-center">
                                       <div className="inline-flex items-center justify-center px-2 py-1 bg-gray-50 rounded-lg border border-gray-100">
                                          <span className="text-xs font-black text-emerald-600">{presentCount}</span>
                                          <span className="text-[10px] font-bold text-gray-300 mx-1">/</span>
                                          <span className="text-xs font-black text-gray-900">{totalCount}</span>
                                       </div>
                                    </TableCell>
                                    <TableCell className="py-4 pr-6">
                                       <div className="flex items-center justify-end gap-2">
                                          <button
                                             onClick={() => handleEditClass(classItem)}
                                             className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all bg-gray-900 text-white hover:bg-gray-800 shadow-sm"
                                          >
                                             <span>Manage</span>
                                          </button>
                                          <button
                                             onClick={() => toggleRowExpand(classItem.id)}
                                             className={`p-1.5 rounded-lg border transition-all ${
                                                isExpanded 
                                                   ? 'bg-gray-100 border-gray-300 text-gray-900' 
                                                   : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
                                             }`}
                                          >  
                                             <ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                          </button>
                                       </div>
                                    </TableCell>
                                 </TableRow>
                                   {isExpanded && (
                                      <TableRow className="bg-gray-50/30">
                                         <TableCell colSpan={deleteMode ? 7 : 6} className="p-0">
                                            <div className="bg-white border-y border-gray-200 p-6 shadow-inner">
                                               {/* Class Details Header */}
                                               <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-4">Class Details</p>
                                               
                                               {/* Topics Covered Section */}
                                               <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                                  <div className="md:col-span-1 flex flex-col">
                                                     <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Topics Covered</h4>
                                                     <div className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100 flex-grow">
                                                        {classItem.topic}
                                                     </div>
                                                  </div>
                                                  <div className="md:col-span-1 flex flex-col gap-4">
                                                     {(classItem.start_time || classItem.end_time) && (
                                                        <div>
                                                           <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Time</h4>
                                                           <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100 w-full">
                                                              <div className="flex items-center gap-2">
                                                                 <Clock className="w-4 h-4 text-gray-400" />
                                                                 {formatTime(classItem.start_time)} - {formatTime(classItem.end_time)}
                                                              </div>
                                                           </div>
                                                        </div>
                                                     )}
                                                     <div className="flex-1 flex flex-col">
                                                        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Link</h4>
                                                        <div className="flex-grow">
                                                           {classItem.link ? (
                                                              <a href={classItem.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 hover:underline bg-gray-50 p-3 rounded-lg border border-gray-100 w-full break-all h-full">
                                                                 <span className="truncate">{classItem.link}</span>
                                                              </a>
                                                           ) : (
                                                              <div className="text-sm text-gray-400 italic bg-gray-50 p-3 rounded-lg border border-gray-100 w-full h-full flex items-center">
                                                                 No link provided
                                                              </div>
                                                           )}
                                                        </div>
                                                     </div>
                                                  </div>
                                               </div>
                                               
                                               {/* Attendance List Section */}
                                               {classItem.attendance_records.length > 0 ? (
                                                  <div>
                                                     <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                                                        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Attendance List</h4>
                                                        <div className="flex gap-4">
                                                           <div className="flex items-center gap-2">
                                                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Present ({classItem.attendance_records.filter(r => r.status === 'present').length})</span>
                                                           </div>
                                                           <div className="flex items-center gap-2">
                                                              <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Absent ({classItem.attendance_records.filter(r => r.status === 'absent').length})</span>
                                                           </div>
                                                        </div>
                                                     </div>
                                                      <div className="overflow-hidden border border-gray-200 rounded-xl shadow-sm">
                                                         <Table>
                                                            <TableHeader>
                                                               <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 border-b border-gray-100">
                                                                  <TableHead className="py-5 pl-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] whitespace-nowrap">Student</TableHead>
                                                                  <TableHead className="py-5 px-2 text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] whitespace-nowrap">Class</TableHead>
                                                                  <TableHead className="py-5 px-2 text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] whitespace-nowrap">Date</TableHead>
                                                                  <TableHead className="py-5 pr-6 text-right text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] whitespace-nowrap">Status</TableHead>
                                                               </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                               {classItem.attendance_records.map((record) => (
                                                                  <TableRow key={record.id} className="group hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0">
                                                                     <TableCell className="py-4 pl-6">
                                                                        <div className="flex items-center text-left w-full h-full">
                                                                           <div className="mr-4 flex-shrink-0">
                                                                              <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center shadow-sm">
                                                                                 <span className="text-white text-xs font-black uppercase">
                                                                                    {record.student_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                                                 </span>
                                                                              </div>
                                                                           </div>
                                                                           <div className="min-w-0 flex-1">
                                                                              <div className="text-xs font-black text-gray-900 uppercase tracking-tight truncate">
                                                                                 {record.student_name}
                                                                              </div>
                                                                              <div className="text-[10px] text-gray-400 font-medium truncate">
                                                                                 {record.student_email}
                                                                              </div>
                                                                           </div>
                                                                        </div>
                                                                     </TableCell>
                                                                     <TableCell className="py-4 px-2 text-center">
                                                                        <div className="text-[10px] font-black uppercase text-gray-900 tracking-wider">
                                                                           {classItem.subject_name}
                                                                        </div>
                                                                     </TableCell>
                                                                     <TableCell className="py-4 px-2 uppercase text-center">
                                                                        <div className="text-[10px] font-black text-gray-900 uppercase tracking-wider whitespace-nowrap">
                                                                           {parseLocalDate(classItem.class_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                        </div>
                                                                     </TableCell>
                                                                     <TableCell className="py-4 pr-6 text-right">
                                                                        <span className={`inline-flex items-center justify-center px-4 py-1.5 rounded-[4px] text-[10px] font-black uppercase tracking-wider min-w-[100px] shadow-sm transform transition-all hover:scale-105 ${
                                                                           record.status === 'present' 
                                                                              ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(0,255,163,0.15)]' 
                                                                              : 'bg-red-600 text-white shadow-[0_0_15px_rgba(255,77,77,0.15)]'
                                                                        }`}>
                                                                           {record.status === 'present' ? 'Present' : 'Absent'}
                                                                        </span>
                                                                     </TableCell>
                                                                  </TableRow>
                                                               ))}
                                                            </TableBody>
                                                         </Table>
                                                      </div>
                                                  </div>
                                               ) : (
                                                  <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                                     <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">No attendance records found</p>
                                                  </div>
                                               )}
                                            </div>
                                         </TableCell>
                                      </TableRow>
                                   )}
                              </React.Fragment>
                           )
                        })}
                     </TableBody>
                  </Table>
               </div>
            </>
         ) : (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="w-16 h-16  rounded-full flex items-center justify-center mb-4">
                  <Image src="/icons/search.png" alt="search" width={64} height={64} />
               </div>
               <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">No Additional Classes</h3>
               <p className="text-xs text-gray-400 mt-2 max-w-xs block">
                  {assignedStudents.length > 0
                    ? "You haven't added any extra classes yet. Click \"Add Class\" to get started." 
                    : "You currently don't have any students assigned to you."}
               </p>
            </div>
         )}
      </div>
      </div>{/* end unified card */}

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Delete Selected Classes"
        itemsToDelete={Array.from(selectedClasses).map(classId => {
          const item = filteredAdditionalClasses.find(c => c.id === classId)
          return {
             name: item?.subject_name || 'Unknown Subject',
             email: item?.topic || 'Unknown Topic',
             additionalInfo: parseLocalDate(item?.class_date || '').toLocaleDateString()
          }
        })}
        type="all"
        isLoading={isDeleting}
      />
    </div>
  )
}
