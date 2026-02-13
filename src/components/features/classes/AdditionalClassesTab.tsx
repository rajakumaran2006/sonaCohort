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
import { Plus, Trash2, ChevronDown, CheckCircle, XCircle, User, FileText, Clock } from 'lucide-react'
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
}

export default function AdditionalClassesTab({ peertutorsInfo, assignedStudents }: AdditionalClassesTabProps) {
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
  const [isLinkMandatory, setIsLinkMandatory] = useState(true) // Default to true for safety

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

  const handleExportToExcel = () => {
    if (additionalClasses.length === 0) return

    try {
      const groupedBySubject = additionalClasses.reduce((acc, classItem) => {
        if (!acc[classItem.subject_name]) {
          acc[classItem.subject_name] = []
        }
        acc[classItem.subject_name].push(classItem)
        return acc
      }, {} as Record<string, AdditionalClassWithAttendance[]>)

      const exportData: unknown[][] = []
      let totalClassesOverall = 0
      let totalPresentCountOverall = 0
      let totalStudentCountOverall = 0

      exportData.push(['Peer Tutor Name', peertutorsInfo?.name || 'N/A'])
      exportData.push([])

      Object.keys(groupedBySubject).forEach((subject) => {
        const classes = groupedBySubject[subject]
        
        exportData.push(['Subject', subject])
        exportData.push(['Date', 'Topic', 'Students Present', 'Students Absent', 'Total Students'])
        
        let subjectTotalClasses = 0
        let subjectTotalPresent = 0
        let subjectTotalStudents = 0

        classes.forEach((classItem) => {
          const presentCount = classItem.attendance_records.filter(r => r.status === 'present').length
          const absentCount = classItem.attendance_records.filter(r => r.status === 'absent').length
          const totalCount = classItem.attendance_records.length

          exportData.push([
            parseLocalDate(classItem.class_date).toLocaleDateString('en-GB'),
            classItem.topic,
            presentCount,
            absentCount,
            totalCount
          ])

          subjectTotalClasses++
          subjectTotalPresent += presentCount
          subjectTotalStudents += totalCount
        })

        exportData.push([])
        exportData.push(['Total Classes Taken', subjectTotalClasses])
        exportData.push(['Total Students Present', subjectTotalPresent])
        exportData.push([])

        totalClassesOverall += subjectTotalClasses
        totalPresentCountOverall += subjectTotalPresent
        totalStudentCountOverall += subjectTotalStudents
      })

      exportData.push([])
      exportData.push(['OVERALL SUMMARY'])
      exportData.push(['Total Classes Taken (All Subjects)', totalClassesOverall])
      exportData.push(['Total Students Present Count', totalPresentCountOverall])
      
      const attendancePercentage = totalStudentCountOverall > 0 
        ? ((totalPresentCountOverall / totalStudentCountOverall) * 100).toFixed(2)
        : '0.00'
      exportData.push(['Student Attendance Percentage', `${attendancePercentage}%`])

      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.aoa_to_sheet(exportData)
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Additional Classes Report')
      const fileName = `Additional_Classes_${peertutorsInfo?.name?.replace(/\s+/g, '_') || 'Report'}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(workbook, fileName)
    } catch (error) {
      logger.error('Error exporting to Excel:', error)
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
      
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-gray-200">
        <div>
          <h2 className="text-lg font-bold text-gray-900 uppercase tracking-tight">Additional Classes</h2>
          <p className="text-xs font-medium text-gray-500 mt-1">Manage extra sessions and attendance</p>
        </div>
        <div className="flex items-center gap-3">
            {assignedStudents.length > 0 && (
            <>
               <button
                  onClick={toggleDeleteMode}
                  title={deleteMode ? "Cancel Delete Mode" : "Delete Classes"}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm ${
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
                     className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm"
                  >
                     Delete ({selectedClasses.size})
                  </button>
               )}

               <button
                  onClick={handleAddClass}
                  className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm"
               >
                  <Plus size={14} strokeWidth={3} />
                  <span>Add Class</span>
               </button>
            </>
            )}
        </div>
      </div>
   
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

      {/* Main List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
         {additionalClasses.length > 0 ? (
            <>
               {/* Mobile Card View */}
               <div className="md:hidden divide-y divide-gray-100">
                  {additionalClasses.map((classItem) => {
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
                                       <p className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-100">{classItem.topic}</p>
                                    </div>
                                    <div className="space-y-4">
                                       {(classItem.start_time || classItem.end_time) && (
                                          <div>
                                             <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-widest mb-2">Time</h4>
                                             <p className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-100 inline-block">
                                                {formatTime(classItem.start_time || undefined)} - {formatTime(classItem.end_time || undefined)}
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
                                                   ? 'bg-green-400 text-black' 
                                                   : 'bg-red-400 text-black'
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
                  <table className="w-full">
                     <thead className="bg-gray-50">
                        <tr className="border-b border-gray-200">
                           <th colSpan={deleteMode ? 7 : 6} className="px-6 py-4">
                              <div className="flex items-center justify-between">
                                 <div className="flex items-center gap-3">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">History ({additionalClasses.length})</h3>
                                 </div>
                                 <div className="flex items-center gap-3">
                                    {!deleteMode && additionalClasses.length > 0 && (
                                       <ExportButton onClick={handleExportToExcel} />
                                    )}
                                    
                                  </div>
                               </div>
                           </th>
                        </tr>
                        <tr className="border-b border-gray-100">
                           {deleteMode && <th className="px-6 py-3 w-10"></th>}
                           <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Subject</th>
                           <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Topic</th>
                           <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
                           <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Time</th>
                           <th className="px-6 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Attendance</th>
                           <th className="px-6 py-3 w-10"></th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {additionalClasses.map((classItem) => {
                           const presentCount = classItem.attendance_records.filter(r => r.status === 'present').length
                           const totalCount = classItem.attendance_records.length
                           const isExpanded = expandedRows.has(classItem.id)
                           const isSelected = selectedClasses.has(classItem.id)

                           return (
                              <React.Fragment key={classItem.id}>
                                 <tr className={`hover:bg-gray-50/80 transition-colors group ${isSelected ? 'bg-blue-50/30' : ''}`}>
                                    {deleteMode && (
                                       <td className="px-6 py-4 text-center">
                                          <input
                                             type="checkbox"
                                             checked={isSelected}
                                             onChange={() => toggleClassSelection(classItem.id)}
                                             className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                          />
                                       </td>
                                    )}
                                    <td className="px-6 py-4 text-left">
                                       <p className="text-sm font-bold text-gray-900">{classItem.subject_name}</p>
                                    </td>
                                    <td className="px-6 py-4 text-left">
                                       <p className="text-sm font-medium text-gray-600">{classItem.topic}</p>
                                    </td>
                                    <td className="px-6 py-4 text-left">
                                       <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                                          {parseLocalDate(classItem.class_date).toLocaleDateString()}
                                       </span>
                                    </td>
                                    <td className="px-6 py-4 text-left">
                                       <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-md whitespace-nowrap">
                                          {classItem.start_time ? `${formatTime(classItem.start_time)} - ${formatTime(classItem.end_time)}` : '--:--'}
                                       </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                       <div className="flex items-center justify-center text-xs font-bold text-gray-700">
                                          <span className="text-green-600">{presentCount}</span>
                                          <span className="text-gray-400 mx-1">/</span>
                                          <span className="text-gray-900">{totalCount}</span>
                                       </div>
                                    </td>
                                    <td className="px-6 py-4">
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
                                    </td>
                                 </tr>
                                  {isExpanded && (
                                     <tr className="bg-gray-50/30">
                                        <td colSpan={deleteMode ? 7 : 6} className="px-6 py-6">
                                           <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
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
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                       {classItem.attendance_records.map((record) => (
                                                          <div key={record.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50">
                                                             <div className="overflow-hidden min-w-0 flex-1 mr-2">
                                                                <p className="text-xs font-bold text-gray-900 truncate">{record.student_name}</p>
                                                                <p className="text-[10px] text-gray-400 truncate">{record.student_email}</p>
                                                             </div>
                                                             <span className={`text-[9px] font-bold uppercase px-2.5 py-1 rounded flex-shrink-0 ${
                                                                record.status === 'present' 
                                                                   ? 'bg-green-400 text-black' 
                                                                   : 'bg-red-400 text-black'
                                                             }`}>
                                                                {record.status}
                                                             </span>
                                                          </div>
                                                       ))}
                                                    </div>
                                                 </div>
                                              ) : (
                                                 <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">No attendance records found</p>
                                                 </div>
                                              )}
                                           </div>
                                        </td>
                                     </tr>
                                  )}
                              </React.Fragment>
                           )
                        })}
                     </tbody>
                  </table>
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

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Delete Selected Classes"
        itemsToDelete={Array.from(selectedClasses).map(classId => {
          const item = additionalClasses.find(c => c.id === classId)
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
