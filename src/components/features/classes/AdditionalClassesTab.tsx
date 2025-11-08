'use client'
import React, { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { AttendanceService, AttendanceRecord } from '@/lib/services/attendanceService'
import { AdditionalClassService, AdditionalClassWithAttendance, AdditionalClassAttendanceRecord } from '@/lib/services/additionalClassService'
import DeleteConfirmationModal from '@/components/forms/DeleteConfirmationModal'
import * as XLSX from 'xlsx'

interface AdditionalClassesTabProps {
  peerTutorInfo: any
}

export default function AdditionalClassesTab({ peerTutorInfo }: AdditionalClassesTabProps) {
  const { user } = useAuth()
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
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (peerTutorInfo) {
      loadAdditionalClasses()
    }
  }, [peerTutorInfo])

  const loadAdditionalClasses = async () => {
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
  }

  const loadStudents = async () => {
    if (!peerTutorInfo?.id) return

    try {
      const students = await AttendanceService.getStudentsForAttendance(peerTutorInfo.id)
      console.log('Loaded students for additional class:', students)
      const attendanceRecords: AttendanceRecord[] = students.map(student => ({
        student_id: student.id,
        student_name: student.name,
        student_email: student.email,
        status: 'present' as const
      }))
      console.log('Created attendance records:', attendanceRecords)
      setNewClass(prev => ({ ...prev, students: attendanceRecords }))
    } catch (error) {
      console.error('Error loading students:', error)
    }
  }

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
    setNewClass({
      subject: '',
      topic: '',
      date: '',
      students: []
    })
    setShowAddForm(true)
    loadAvailableSubjects()
    loadStudents()
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

    console.log('Saving additional class with data:', {
      peerTutorId: peerTutorInfo.id,
      subject: newClass.subject,
      topic: newClass.topic,
      date: newClass.date,
      students: newClass.students
    })

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
        // Reload the classes to get the updated list with attendance records
        await loadAdditionalClasses()
        setShowAddForm(false)
        setNewClass({
          subject: '',
          topic: '',
          date: '',
          students: []
        })
        alert('Additional class created successfully!')
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

    setDeleting(true)
    try {
      const deletePromises = Array.from(selectedClasses).map(classId =>
        AdditionalClassService.deleteAdditionalClass(classId)
      )
      
      await Promise.all(deletePromises)
      
      // Reload classes after deletion
      await loadAdditionalClasses()
      
      // Reset delete mode and selections
      setDeleteMode(false)
      setSelectedClasses(new Set())
      setShowDeleteModal(false)
      
      alert('Selected classes deleted successfully!')
    } catch (error) {
      console.error('Error deleting classes:', error)
      alert('Error deleting classes. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const handleExportToExcel = () => {
    if (additionalClasses.length === 0) {
      alert('No classes to export')
      return
    }

    try {
      // Group classes by subject
      const groupedBySubject = additionalClasses.reduce((acc, classItem) => {
        if (!acc[classItem.subject_name]) {
          acc[classItem.subject_name] = []
        }
        acc[classItem.subject_name].push(classItem)
        return acc
      }, {} as Record<string, AdditionalClassWithAttendance[]>)

      // Prepare data for export
      const exportData: any[][] = []
      let totalClassesOverall = 0
      let totalPresentCountOverall = 0
      let totalStudentCountOverall = 0

      // Add header
      exportData.push(['Peer Tutor Name', peerTutorInfo?.name || 'N/A'])
      exportData.push([]) // Empty row

      // Process each subject
      Object.keys(groupedBySubject).forEach((subject) => {
        const classes = groupedBySubject[subject]
        
        // Subject header
        exportData.push(['Subject', subject])
        exportData.push(['Date', 'Topic', 'Students Present', 'Students Absent', 'Total Students'])
        
        let subjectTotalClasses = 0
        let subjectTotalPresent = 0
        let subjectTotalStudents = 0

        // Add class details
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

        // Subject summary
        exportData.push([]) // Empty row
        exportData.push(['Total Classes Taken', subjectTotalClasses])
        exportData.push(['Total Students Present', subjectTotalPresent])
        exportData.push([]) // Empty row after each subject

        totalClassesOverall += subjectTotalClasses
        totalPresentCountOverall += subjectTotalPresent
        totalStudentCountOverall += subjectTotalStudents
      })

      // Overall summary
      exportData.push([]) // Empty row
      exportData.push(['OVERALL SUMMARY'])
      exportData.push(['Total Classes Taken (All Subjects)', totalClassesOverall])
      exportData.push(['Total Students Present Count', totalPresentCountOverall])
      
      // Calculate attendance percentage
      const attendancePercentage = totalStudentCountOverall > 0 
        ? ((totalPresentCountOverall / totalStudentCountOverall) * 100).toFixed(2)
        : '0.00'
      exportData.push(['Student Attendance Percentage', `${attendancePercentage}%`])

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.aoa_to_sheet(exportData)

      // Apply formatting
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
      
      // Make headers bold
      for (let row = 0; row <= range.e.r; row++) {
        for (let col = 0; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
          if (worksheet[cellAddress]) {
            const cell = worksheet[cellAddress]
            
            // Bold headers and subject names
            if (row === 2 || (worksheet[cellAddress]?.v && typeof worksheet[cellAddress].v === 'string' && worksheet[cellAddress].v.includes('Subject'))) {
              if (!cell.s) cell.s = {}
              if (!cell.s.font) cell.s.font = {}
              cell.s.font.bold = true
            }
            
            // Bold overall summary
            if (cell.v && typeof cell.v === 'string' && cell.v.includes('OVERALL SUMMARY')) {
              if (!cell.s) cell.s = {}
              if (!cell.s.font) cell.s.font = {}
              cell.s.font.bold = true
              cell.s.font.size = 12
            }
          }
        }
      }

      // Set column widths
      worksheet['!cols'] = [
        { wch: 25 }, // Date column
        { wch: 30 }, // Topic column
        { wch: 18 }, // Present column
        { wch: 18 }, // Absent column
        { wch: 15 }  // Total column
      ]

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Additional Classes Report')

      // Generate filename
      const fileName = `Additional_Classes_${peerTutorInfo?.name?.replace(/\s+/g, '_') || 'Report'}_${new Date().toISOString().split('T')[0]}.xlsx`

      // Save file
      XLSX.writeFile(workbook, fileName)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      alert('Error exporting to Excel. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Additional Classes</h2>
          <p className="text-gray-600 mt-1">Add extra classes and mark attendance for additional topics</p>
        </div>
        <button
          onClick={handleAddClass}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>Add Class</span>
        </button>
      </div>

      {/* Add Class Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Additional Class</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Subject Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subject *
              </label>
              {loadingSubjects ? (
                <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  <span className="text-gray-500">Loading subjects...</span>
                </div>
              ) : (
                <select
                  value={newClass.subject}
                  onChange={(e) => setNewClass(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a subject</option>
                  {availableSubjects.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Topic Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Topic *
              </label>
              <input
                type="text"
                value={newClass.topic}
                onChange={(e) => setNewClass(prev => ({ ...prev, topic: e.target.value }))}
                placeholder="Enter topic name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Date Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date *
              </label>
              <input
                type="date"
                value={newClass.date}
                onChange={(e) => setNewClass(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Attendance Section */}
          {newClass.students.length > 0 && (
            <div className="mt-6">
              <h4 className="text-md font-medium text-gray-900 mb-3">Mark Attendance</h4>
              <div className="space-y-2">
                {newClass.students.map((student) => (
                  <div key={student.student_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <span className="font-medium text-gray-900">{student.student_name}</span>
                      <span className="text-gray-500 ml-2">({student.student_email})</span>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleStudentStatusChange(student.student_id, 'present')}
                        className={`px-3 py-1 rounded-md text-sm font-medium ${
                          student.status === 'present'
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-green-50'
                        }`}
                      >
                        Present
                      </button>
                      <button
                        onClick={() => handleStudentStatusChange(student.student_id, 'absent')}
                        className={`px-3 py-1 rounded-md text-sm font-medium ${
                          student.status === 'absent'
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-red-50'
                        }`}
                      >
                        Absent
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveClass}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 flex items-center space-x-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Save Class</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Additional Classes List */}
      <div className="bg-white rounded-lg shadow-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Additional Classes (<span className="text-black">{additionalClasses.length}</span>)</h3>
          <div className="flex items-center space-x-3">
            {!deleteMode && (
              <button
                onClick={handleExportToExcel}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export Excel</span>
              </button>
            )}
            <button
              onClick={toggleDeleteMode}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 transition-colors ${
                deleteMode
                  ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-500'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>{deleteMode ? 'Cancel' : 'Delete'}</span>
            </button>
            {deleteMode && selectedClasses.size > 0 && (
              <button
                onClick={handleDeleteClick}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Delete Selected ({selectedClasses.size})</span>
              </button>
            )}
          </div>
        </div>

        {additionalClasses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {deleteMode && (
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                      <input
                        type="checkbox"
                        checked={selectedClasses.size === additionalClasses.length && additionalClasses.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedClasses(new Set(additionalClasses.map(c => c.id)))
                          } else {
                            setSelectedClasses(new Set())
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Topic
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Present
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Absent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {additionalClasses.map((classItem) => {
                  const presentCount = classItem.attendance_records.filter(r => r.status === 'present').length
                  const absentCount = classItem.attendance_records.filter(r => r.status === 'absent').length
                  const totalCount = classItem.attendance_records.length
                  const isExpanded = expandedRows.has(classItem.id)
                  const isSelected = selectedClasses.has(classItem.id)

                  return (
                    <React.Fragment key={classItem.id}>
                      <tr className={`hover:bg-gray-50 ${isSelected && deleteMode ? 'bg-red-50' : ''}`}>
                        {deleteMode && (
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleClassSelection(classItem.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => toggleRowExpand(classItem.id)}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            <svg
                              className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{classItem.subject_name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{classItem.topic}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {new Date(classItem.class_date).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {presentCount}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            {absentCount}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {totalCount}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={deleteMode ? 8 : 7} className="px-6 py-4 bg-gray-50">
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">Topics Covered</h4>
                                <p className="text-sm text-gray-700">{classItem.topic}</p>
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-3">Students Attendance</h4>
                                {classItem.attendance_records.length > 0 ? (
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 border border-gray-300 rounded-lg">
                                      <thead className="bg-gray-100">
                                        <tr>
                                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                                            Student Name
                                          </th>
                                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                                            Email
                                          </th>
                                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                                            Status
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="bg-white divide-y divide-gray-200">
                                        {classItem.attendance_records.map((record) => (
                                          <tr key={record.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                              {record.student_name}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                              {record.student_email || 'N/A'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-center">
                                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                record.status === 'present'
                                                  ? 'bg-green-100 text-green-800'
                                                  : 'bg-red-100 text-red-800'
                                              }`}>
                                                {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-500">No attendance records available</p>
                                )}
                              </div>
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
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No additional classes yet</h3>
            <p className="text-gray-500">Add your first additional class to get started.</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
        }}
        onConfirm={confirmDelete}
        title="Confirm Delete Additional Classes"
        itemsToDelete={Array.from(selectedClasses).map(classId => {
          const classItem = additionalClasses.find(c => c.id === classId)
          return {
            name: `${classItem?.subject_name || 'Unknown'} - ${classItem?.topic || 'Unknown'}`,
            email: new Date(classItem?.class_date || '').toLocaleDateString(),
            additionalInfo: `Date: ${new Date(classItem?.class_date || '').toLocaleDateString()}`
          }
        })}
        type="all"
      />
    </div>
  )
}
