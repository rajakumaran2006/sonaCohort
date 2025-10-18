'use client'

import { useState, useEffect } from 'react'
import { Class } from '@/lib/services/classService'
import { AttendanceService, AttendanceRecord } from '@/lib/services/attendanceService'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
import { ClassService } from '@/lib/services/classService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'

interface ClassDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  classItem: Class | null
  userEmail: string
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

// Helper function to get avatar color based on name
const getAvatarColor = (name: string): string => {
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 
    'bg-indigo-500', 'bg-yellow-500', 'bg-red-500', 'bg-teal-500'
  ]
  const index = name.length % colors.length
  return colors[index]
}

export default function ClassDetailsModal({ isOpen, onClose, classItem, userEmail }: ClassDetailsModalProps) {
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [topics, setTopics] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentStep, setCurrentStep] = useState<'topics' | 'attendance' | 'completed'>('topics')
  const [peerTutorId, setPeerTutorId] = useState<string>('')
  const [completionStatus, setCompletionStatus] = useState<any>(null)
  const [isEditable, setIsEditable] = useState(true)
  const [scheduledClassId, setScheduledClassId] = useState<string>('')

  useEffect(() => {
    if (isOpen && classItem && userEmail) {
      loadClassDetails()
      checkCompletionStatus()
      setCurrentStep('topics') // Always start with topics
    }
  }, [isOpen, classItem, userEmail])

  const loadClassDetails = async () => {
    if (!classItem) return

    setLoading(true)
    try {
      // Get peer tutor info
      const tutorInfo = await PeerTutorAuthService.getPeerTutorByEmail(userEmail)
      if (!tutorInfo) return

      setPeerTutorId(tutorInfo.id)

      // Get students assigned to this peer tutor
      const students = await AttendanceService.getStudentsForAttendance(tutorInfo.id)
      
      // Get existing attendance for this class
      const existingAttendance = await AttendanceService.getAttendanceByClass(classItem.id)
      
      // Get scheduled class info and topics
      console.log('Loading class details for:', classItem)
      
      let scheduledClass = null
      if (classItem.scheduled_class_id) {
        scheduledClass = await ScheduledClassService.getScheduledClassById(classItem.scheduled_class_id)
      } else {
        // If no scheduled_class_id, try to find it by class_id and other criteria
        console.log('No scheduled_class_id found, trying to find scheduled class by class_id')
        scheduledClass = await ScheduledClassService.getScheduledClassByClassId(classItem.id)
      }
      
      if (scheduledClass) {
        console.log('Found scheduled class:', scheduledClass)
        setScheduledClassId(scheduledClass.id)
        setTopics(scheduledClass.topics || '')
      } else {
        console.warn('No scheduled class found for class:', classItem.id)
        setScheduledClassId('')
        setTopics('')
      }

      // Merge students with existing attendance
      const attendanceData = students.map(student => {
        const existing = existingAttendance.find(att => att.student_id === student.id)
        return {
          student_id: student.id,
          student_name: student.name,
          student_email: student.email,
          status: existing?.status || 'present' as 'present' | 'absent'
        }
      })

      setAttendanceRecords(attendanceData)
    } catch (error) {
      console.error('Error loading class details:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkCompletionStatus = async () => {
    if (!scheduledClassId) return

    try {
      const completion = await ScheduledClassService.getScheduledClassCompletion(scheduledClassId)
      setCompletionStatus(completion)
      
      // Check if class is still editable (only on the same day)
      const today = new Date()
      const classDay = classItem?.class_date ? new Date(classItem.class_date) : new Date(classItem?.created_at || '')
      
      today.setHours(0, 0, 0, 0)
      classDay.setHours(0, 0, 0, 0)
      
      const editable = today.getTime() === classDay.getTime()
      setIsEditable(editable)
    } catch (error) {
      console.error('Error checking completion status:', error)
    }
  }



  const handleProceedToAttendance = async () => {
    if (!topics.trim()) {
      alert('Please add topics before proceeding to attendance.')
      return
    }
    
    setCurrentStep('attendance')
  }

  const handleAttendanceChange = (studentId: string, status: 'present' | 'absent') => {
    setAttendanceRecords(prev => 
      prev.map(record => 
        record.student_id === studentId 
          ? { ...record, status }
          : record
      )
    )
  }

  const handleSaveAttendance = async () => {
    if (!classItem || !peerTutorId || !isEditable || !scheduledClassId) {
      console.error('Cannot save attendance:', { classItem: !!classItem, peerTutorId, isEditable, scheduledClassId })
      alert('Cannot save attendance. Please check if the class is editable.')
      return
    }

    // Validate attendance records
    if (!attendanceRecords || attendanceRecords.length === 0) {
      alert('No students found to mark attendance for.')
      return
    }

    // Check if all students have attendance marked
    const hasUnmarkedStudents = attendanceRecords.some(record => !record.status)
    if (hasUnmarkedStudents) {
      alert('Please mark attendance for all students before saving.')
      return
    }

    setSaving(true)
    try {
      console.log('Saving attendance for class:', classItem.id)
      console.log('Attendance records to save:', attendanceRecords)
      
      await AttendanceService.markAttendanceForScheduledClass(scheduledClassId, peerTutorId, attendanceRecords)
      
      console.log('Attendance saved successfully, updating completion status...')
      
      // Check if topics exist for completion status
      const hasTopics = topics.trim().length > 0
      
      // Update completion status
      const completionSuccess = await ScheduledClassService.updateScheduledClassCompletion(
        scheduledClassId,
        true, // attendance completed
        hasTopics  // topics completed only if topics exist
      )
      
      if (completionSuccess) {
        console.log('Completion status updated successfully')
        
        // Only show completed step if both attendance and topics are done
        if (hasTopics) {
          setCurrentStep('completed')
        } else {
          // If no topics, just close the modal
          onClose()
        }
      } else {
        console.error('Failed to update completion status')
        alert('Attendance saved, but failed to update completion status.')
      }
    } catch (error) {
      console.error('Failed to save attendance:', error)
      alert('Failed to save attendance. Please check the console for details.')
    } finally {
      setSaving(false)
    }
  }

  const handleCompleteClass = async () => {
    if (!scheduledClassId || !peerTutorId) {
      alert('Cannot complete class. Missing required information.')
      return
    }

    if (!topics.trim()) {
      alert('Please add topics before completing the class.')
      return
    }

    if (attendanceRecords.length === 0) {
      alert('Please mark attendance for all students before completing the class.')
      return
    }

    setSaving(true)
    try {
      // Save topics first
      const topicsSuccess = await ScheduledClassService.updateScheduledClassTopics(scheduledClassId, topics)
      if (!topicsSuccess) {
        alert('Failed to save topics. Please try again.')
        return
      }

      // Save attendance
      const attendanceSuccess = await AttendanceService.markAttendanceForScheduledClass(scheduledClassId, peerTutorId, attendanceRecords)
      if (!attendanceSuccess) {
        alert('Failed to save attendance. Please try again.')
        return
      }

      // Update completion status
      const completionSuccess = await ScheduledClassService.updateScheduledClassCompletion(
        scheduledClassId,
        true, // attendance completed
        true  // topics completed
      )

      if (completionSuccess) {
        alert('Class completed successfully!')
        onClose()
      } else {
        alert('Failed to update completion status. Please try again.')
      }
    } catch (error) {
      console.error('Error completing class:', error)
      alert('An error occurred while completing the class. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleRetakeAttendance = () => {
    setCurrentStep('attendance')
  }

  if (!isOpen || !classItem) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">{classItem.subject_name}</h3>
              <p className="text-sm text-gray-500">
                {classItem.class_date ? new Date(classItem.class_date).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                }) : 'Not scheduled'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-center space-x-8">
            <div className={`flex items-center ${currentStep === 'topics' ? 'text-blue-600' : currentStep === 'attendance' || currentStep === 'completed' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentStep === 'topics' ? 'bg-blue-100 text-blue-600' : 
                currentStep === 'attendance' || currentStep === 'completed' ? 'bg-green-100 text-green-600' : 
                'bg-gray-100 text-gray-400'
              }`}>
                1
              </div>
              <span className="ml-2 text-sm font-medium">Topics</span>
            </div>
            <div className={`flex-1 h-0.5 ${currentStep === 'attendance' || currentStep === 'completed' ? 'bg-green-600' : 'bg-gray-200'}`}></div>
            <div className={`flex items-center ${currentStep === 'attendance' ? 'text-blue-600' : currentStep === 'completed' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentStep === 'attendance' ? 'bg-blue-100 text-blue-600' : 
                currentStep === 'completed' ? 'bg-green-100 text-green-600' : 
                'bg-gray-100 text-gray-400'
              }`}>
                2
              </div>
              <span className="ml-2 text-sm font-medium">Attendance</span>
            </div>
            <div className={`flex-1 h-0.5 ${currentStep === 'completed' ? 'bg-green-600' : 'bg-gray-200'}`}></div>
            <div className={`flex items-center ${currentStep === 'completed' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentStep === 'completed' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
              }`}>
                ✓
              </div>
              <span className="ml-2 text-sm font-medium">Complete</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {currentStep === 'topics' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h4 className="text-lg font-medium text-gray-900 mb-2">Step 1: Add Topics Covered</h4>
                    <p className="text-sm text-gray-600">Add the topics you covered in this class (separate multiple topics with commas)</p>
                  </div>
                  
                  {/* Topics Text Area */}
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="space-y-3">
                      <textarea
                        placeholder="Enter topics covered in this class (e.g., Introduction to React, State Management, Component Lifecycle)"
                        value={topics}
                        onChange={(e) => setTopics(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">
                          {topics.trim().length > 0 ? `${topics.split(',').filter(t => t.trim()).length} topic(s) added` : 'No topics added yet'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Proceed Button */}
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={handleProceedToAttendance}
                      disabled={!topics.trim() || saving}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      {saving && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      )}
                      {saving ? 'Saving...' : 'Proceed to Attendance →'}
                    </button>
                  </div>
                </div>
              )}

              {currentStep === 'attendance' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h4 className="text-lg font-medium text-gray-900 mb-2">Step 2: Mark Attendance</h4>
                    <p className="text-sm text-gray-600">Mark attendance for your assigned students</p>
                  </div>
                  
                  <div className="space-y-3">
                    {attendanceRecords.map((record) => (
                      <div key={record.student_id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                        <div className="flex items-center">
                          <div className={`w-10 h-10 ${getAvatarColor(record.student_name)} rounded-full flex items-center justify-center text-white font-medium text-sm mr-3`}>
                            {getInitials(record.student_name)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{record.student_name}</p>
                            <p className="text-sm text-gray-500">{record.student_email}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name={`attendance-${record.student_id}`}
                              checked={record.status === 'present'}
                              onChange={() => handleAttendanceChange(record.student_id, 'present')}
                              className="mr-2 text-green-600"
                            />
                            <span className="text-green-600 font-medium">Present</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name={`attendance-${record.student_id}`}
                              checked={record.status === 'absent'}
                              onChange={() => handleAttendanceChange(record.student_id, 'absent')}
                              className="mr-2 text-red-600"
                            />
                            <span className="text-red-600 font-medium">Absent</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={handleSaveAttendance}
                      disabled={saving}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      {saving ? 'Saving...' : 'Complete Class'}
                    </button>
                  </div>
                </div>
              )}

              {currentStep === 'completed' && (
                <div className="text-center space-y-6">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">Class Completed Successfully!</h4>
                    <p className="text-sm text-gray-600">
                      You have successfully added topics and marked attendance for this class.
                    </p>
                  </div>
                  <button
                    onClick={handleCompleteClass}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
