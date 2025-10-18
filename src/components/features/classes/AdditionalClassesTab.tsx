'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { AttendanceService, AttendanceRecord } from '@/lib/services/attendanceService'
import { AdditionalClassService, AdditionalClassWithAttendance, AdditionalClassAttendanceRecord } from '@/lib/services/additionalClassService'

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
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Additional Classes ({additionalClasses.length})</h3>
        </div>

        {additionalClasses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
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

                  return (
                    <tr key={classItem.id} className="hover:bg-gray-50">
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
    </div>
  )
}
