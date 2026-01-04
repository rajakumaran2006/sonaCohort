'use client'
import React, { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'

import { AttendanceRecord } from '@/lib/services/attendanceService'
import { AdditionalClassService, AdditionalClassWithAttendance } from '@/lib/services/additionalClassService'
import DeleteConfirmationModal from '@/components/forms/DeleteConfirmationModal'
import * as XLSX from 'xlsx'
import { Plus, Trash2, FileDown, ChevronDown, CheckCircle, XCircle, Calendar, User, FileText } from 'lucide-react'

interface PeerTutorInfo {
  id: string
  name: string
}

interface Student {
  id: string
  name: string
  email: string
}

interface AdditionalClassesTabProps {
  peerTutorInfo: PeerTutorInfo
  assignedStudents: Student[]
}

export default function AdditionalClassesTab({ peerTutorInfo, assignedStudents }: AdditionalClassesTabProps) {
  // const { user } = useAuth() // keeping user if it might be needed, or remove if truly unused. The error said 'user' is assigned but never used.

  const [additionalClasses, setAdditionalClasses] = useState<AdditionalClassWithAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newClass, setNewClass] = useState({
    subject: '',
    topic: '',
    date: '',
    students: [] as AttendanceRecord[]
  })
  const [saving, setSaving] = useState(false)
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set())
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const loadAdditionalClasses = useCallback(async () => {
    if (!peerTutorInfo?.id) return

    setLoading(true)
    try {
      const classes = await AdditionalClassService.getAdditionalClassesByPeerTutor(peerTutorInfo.id)
      setAdditionalClasses(classes)
    } catch (error) {
      console.error('Error loading additional classes:', error)
    } finally {
      setLoading(false)
    }
  }, [peerTutorInfo?.id])

  useEffect(() => {
    if (peerTutorInfo) {
      loadAdditionalClasses()
    }
  }, [peerTutorInfo, loadAdditionalClasses])

  useEffect(() => {
    if (assignedStudents && assignedStudents.length > 0) {
      const attendanceRecords: AttendanceRecord[] = assignedStudents.map(student => ({
        student_id: student.id,
        student_name: student.name,
        student_email: student.email,
        status: 'present' as const
      }))
      setNewClass(prev => ({ ...prev, students: attendanceRecords }))
    }
  }, [assignedStudents])

  const loadAvailableSubjects = async () => {
    if (!peerTutorInfo?.id) return

    setLoadingSubjects(true)
    try {
      const subjects = await AdditionalClassService.getAvailableSubjectsForPeerTutor(peerTutorInfo.id)
      setAvailableSubjects(subjects)
    } catch (error) {
      console.error('Error loading available subjects:', error)
    } finally {
      setLoadingSubjects(false)
    }
  }

  const handleAddClass = () => {
    if (assignedStudents.length === 0) {
      alert("You need assigned students to create an additional class")
      return
    }

    setNewClass({
      subject: '',
      topic: '',
      date: '',
      students: assignedStudents.map(student => ({
        student_id: student.id,
        student_name: student.name,
        student_email: student.email,
        status: 'present' as const
      }))
    })
    setShowAddForm(true)
    loadAvailableSubjects()
  }

  const handleSaveClass = async () => {
    if (!newClass.subject.trim() || !newClass.topic.trim() || !newClass.date) {
      alert('Please fill in all required fields')
      return
    }

    if (!peerTutorInfo?.id) {
      alert('Peer tutor information not available')
      return
    }

    setSaving(true)
    try {
      const additionalClass = await AdditionalClassService.createAdditionalClass(
        peerTutorInfo.id,
        newClass.subject,
        newClass.topic,
        newClass.date,
        newClass.students
      )

      if (additionalClass) {
        await loadAdditionalClasses()
        setShowAddForm(false)
        setNewClass({
          subject: '',
          topic: '',
          date: '',
          students: []
        })
      } else {
        alert('Error creating additional class. Please try again.')
      }
    } catch (error) {
      console.error('Error saving additional class:', error)
      alert('Error saving additional class. Please try again.')
    } finally {
      setSaving(false)
    }
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
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(classId)) {
      newExpanded.delete(classId)
    } else {
      newExpanded.add(classId)
    }
    setExpandedRows(newExpanded)
  }

  const handleDeleteClick = () => {
    if (selectedClasses.size === 0) {
      alert('Please select at least one class to delete')
      return
    }
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (selectedClasses.size === 0) return


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
      console.error('Error deleting classes:', error)
      alert('Error deleting classes. Please try again.')
    } finally {

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

      exportData.push(['Peer Tutor Name', peerTutorInfo?.name || 'N/A'])
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
            new Date(classItem.class_date).toLocaleDateString('en-GB'),
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
      const fileName = `Additional_Classes_${peerTutorInfo?.name?.replace(/\s+/g, '_') || 'Report'}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(workbook, fileName)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
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
            <button
               onClick={handleAddClass}
               className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm"
            >
               <Plus size={14} strokeWidth={3} />
               <span>Add Class</span>
            </button>
            )}
        </div>
      </div>

      {/* Add Class Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 animate-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">New Class Entry</h3>
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
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Topic</label>
              <div className="relative">
                 <input
                   type="text"
                   value={newClass.topic}
                   onChange={(e) => setNewClass(prev => ({ ...prev, topic: e.target.value }))}
                   className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl text-sm font-medium transition-all outline-none"
                   placeholder="Enter topic name"
                 />
                 <FileText className="absolute left-3.5 top-3 text-gray-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Date</label>
              <div className="relative">
                 <input
                   type="date"
                   value={newClass.date}
                   onChange={(e) => setNewClass(prev => ({ ...prev, date: e.target.value }))}
                   className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl text-sm font-medium transition-all outline-none"
                 />
                 <Calendar className="absolute left-3.5 top-3 text-gray-400 pointer-events-none" size={16} />
              </div>
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
                       <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">
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
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle size={16} />}
              <span>Save Class</span>
            </button>
          </div>
        </div>
      )}

      {/* Main List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
         <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-blue-500"></span>
               <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">History ({additionalClasses.length})</h3>
            </div>
            
            <div className="flex items-center gap-3">
               {!deleteMode && additionalClasses.length > 0 && (
                   <button
                     onClick={handleExportToExcel}
                     className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:text-blue-600 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-100 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                   >
                     <FileDown size={14} /> <span>Export</span>
                   </button>
               )}
               
               {additionalClasses.length > 0 && (
                   <div className="flex items-center gap-2">
                      <button
                        onClick={toggleDeleteMode}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                           deleteMode 
                              ? 'bg-gray-100 text-gray-600 border-gray-200' 
                              : 'text-gray-400 hover:text-red-500 border-transparent hover:bg-red-50'
                        }`}
                      >
                        <Trash2 size={14} /> <span>{deleteMode ? 'Cancel' : 'Delete'}</span>
                      </button>
                      
                      {deleteMode && selectedClasses.size > 0 && (
                         <button
                           onClick={handleDeleteClick}
                           className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm"
                         >
                            <span>Delete ({selectedClasses.size})</span>
                         </button>
                      )}
                   </div>
               )}
            </div>
         </div>

         {additionalClasses.length > 0 ? (
            <div className="overflow-x-auto">
               <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                     <tr>
                        {deleteMode && <th className="px-6 py-3 w-10"></th>}
                        <th className="px-6 py-3 w-10"></th>
                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Subject</th>
                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Topic</th>
                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
                        <th className="px-6 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Attendance</th>
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
                                 <td className="px-6 py-4">
                                    <button
                                       onClick={() => toggleRowExpand(classItem.id)}
                                       className={`p-1.5 rounded-lg border transition-all ${
                                          isExpanded 
                                             ? 'bg-blue-50 border-blue-200 text-blue-600' 
                                             : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
                                       }`}
                                    >  
                                       <ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>
                                 </td>
                                 <td className="px-6 py-4">
                                    <p className="text-sm font-bold text-gray-900">{classItem.subject_name}</p>
                                 </td>
                                 <td className="px-6 py-4">
                                    <p className="text-sm font-medium text-gray-600">{classItem.topic}</p>
                                 </td>
                                 <td className="px-6 py-4">
                                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                                       {new Date(classItem.class_date).toLocaleDateString()}
                                    </span>
                                 </td>
                                 <td className="px-6 py-4">
                                    <div className="flex items-center justify-center gap-2">
                                       <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-100">{presentCount}</span>
                                       <span className="text-[10px] font-medium text-gray-400 uppercase">of</span>
                                       <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{totalCount}</span>
                                    </div>
                                 </td>
                              </tr>
                              {isExpanded && (
                                 <tr className="bg-gray-50/50 shadow-inner">
                                    <td colSpan={deleteMode ? 6 : 5} className="px-6 py-6 ring-2 ring-transparent">
                                       <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm max-w-4xl mx-auto">
                                          <div className="flex items-center gap-2 mb-4">
                                             <User size={16} className="text-gray-400" />
                                             <h4 className="text-xs font-bold text-gray-900 uppercase tracking-widest">Student Attendance Detail</h4>
                                          </div>
                                          
                                          {classItem.attendance_records.length > 0 ? (
                                             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {classItem.attendance_records.map((record) => (
                                                   <div key={record.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-sm transition-all">
                                                      <div className="overflow-hidden">
                                                         <p className="text-xs font-bold text-gray-900 truncate">{record.student_name}</p>
                                                         <p className="text-[10px] text-gray-400 truncate">{record.student_email}</p>
                                                      </div>
                                                      <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded ${
                                                         record.status === 'present' 
                                                            ? 'bg-green-100 text-green-700' 
                                                            : 'bg-red-100 text-red-700'
                                                      }`}>
                                                         {record.status}
                                                      </span>
                                                   </div>
                                                ))}
                                             </div>
                                          ) : (
                                             <p className="text-sm text-gray-400 italic">No attendance records found.</p>
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
             additionalInfo: new Date(item?.class_date || '').toLocaleDateString()
          }
        })}
        type="all"
      />
    </div>
  )
}
