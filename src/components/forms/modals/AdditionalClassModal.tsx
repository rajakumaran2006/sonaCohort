'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { X, CheckCircle, XCircle, FileText, ChevronDown, Clock, Link as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import { FacultyService } from '@/lib/services/facultyService'
import { logger } from '@/lib/logger'
import { isValidUrl } from '@/lib/utils/validators'
import DatePicker from '@/components/ui/DatePicker'

interface AttendanceRecord {
  student_id: string
  student_name: string
  student_email: string
  status: 'present' | 'absent'
}

interface Student {
  id: string
  name: string
  email?: string | null
}

interface AdditionalClassModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  peertutorsInfo: {
    id: string
    name: string
    dept?: string
    year?: string
    section?: string
  }
  assignedStudents: Student[]
}

const getTodayDateStr = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function AdditionalClassModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  peertutorsInfo, 
  assignedStudents 
}: AdditionalClassModalProps) {
  const [saving, setSaving] = useState(false)
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])
  const [isLinkMandatory, setIsLinkMandatory] = useState(true)
  
  const [formData, setFormData] = useState({
    subject: '',
    topic: '',
    date: getTodayDateStr(),
    startTime: '',
    endTime: '',
    link: '',
    students: [] as AttendanceRecord[]
  })

  const loadAvailableSubjects = useCallback(async () => {
    if (!peertutorsInfo?.id) return
    try {
      const subjects = await AdditionalClassService.getAvailableSubjectsForpeertutors(peertutorsInfo.id)
      setAvailableSubjects(subjects)
    } catch (error) {
      logger.error('Error loading available subjects:', error)
    }
  }, [peertutorsInfo?.id])

  const fetchSettings = useCallback(async () => {
    if (!peertutorsInfo?.dept) return
    try {
      const facultyDept = await FacultyService.getFacultyDepartmentByName(peertutorsInfo.dept)
      if (facultyDept) {
        setIsLinkMandatory(facultyDept.is_class_link_mandatory !== false)
      }
    } catch (error) {
      logger.error('Error fetching class settings:', error)
    }
  }, [peertutorsInfo?.dept])

  useEffect(() => {
    if (isOpen && assignedStudents.length > 0) {
      const attendanceRecords: AttendanceRecord[] = assignedStudents.map(student => ({
        student_id: student.id,
        student_name: student.name,
        student_email: student.email || '',
        status: 'present' as const
      }))
      setFormData(prev => ({ ...prev, students: attendanceRecords }))
      loadAvailableSubjects()
      fetchSettings()
    }
  }, [isOpen, assignedStudents, loadAvailableSubjects, fetchSettings])

  const handleStudentStatusChange = (studentId: string, status: 'present' | 'absent') => {
    setFormData(prev => ({
      ...prev,
      students: prev.students.map(student =>
        student.student_id === studentId ? { ...student, status } : student
      )
    }))
  }

  const handleSave = async () => {
    if (!formData.subject.trim() || !formData.topic.trim() || !formData.date) {
      toast.error('Please fill in all required fields')
      return
    }

    if (isLinkMandatory && !formData.link) {
      toast.error('Class link is mandatory')
      return
    }

    if (formData.link && !isValidUrl(formData.link)) {
      toast.error('Please enter a valid link')
      return
    }

    if (formData.topic.length > 50) {
      toast.error('Topic must be 50 characters or less')
      return
    }

    const hasPresentStudent = formData.students.some(student => student.status === 'present')
    if (!hasPresentStudent) {
      toast.warning('At least one student must be marked as present')
      return
    }

    if (formData.startTime && formData.endTime && formData.endTime <= formData.startTime) {
      toast.error('End time must be after start time')
      return
    }

    setSaving(true)
    try {
      const additionalClass = await AdditionalClassService.createAdditionalClass(
        peertutorsInfo.id,
        formData.subject,
        formData.topic,
        formData.date,
        formData.students,
        formData.startTime,
        formData.endTime,
        formData.link
      )

      if (additionalClass) {
        toast.success('Additional class created successfully')
        onSuccess()
        onClose()
      } else {
        toast.error('Error creating additional class')
      }
    } catch (error) {
      logger.error('Error saving additional class:', error)
      toast.error('Error saving additional class')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-white/20 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div>
            <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Add Additional Class</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Create an unscheduled session & mark attendance</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2.5 rounded-2xl hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {/* Main Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Subject</label>
              <div className="relative">
                <select
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full appearance-none pl-4 pr-10 py-3.5 bg-gray-50 border border-transparent focus:bg-white focus:border-gray-900 rounded-[1.25rem] text-sm font-bold transition-all outline-none"
                >
                  <option value="">Select Subject</option>
                  {availableSubjects.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-4 text-gray-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Topic</label>
                <span className={`text-[9px] font-black uppercase tracking-widest ${formData.topic.length >= 50 ? 'text-red-500' : 'text-gray-300'}`}>
                  {formData.topic.length}/50
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  maxLength={50}
                  value={formData.topic}
                  onChange={(e) => setFormData(prev => ({ ...prev, topic: e.target.value }))}
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-transparent focus:bg-white focus:border-gray-900 rounded-[1.25rem] text-sm font-bold transition-all outline-none"
                  placeholder="What will you teach?"
                />
                <FileText className="absolute left-4 top-4 text-gray-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Date</label>
              <DatePicker
                value={formData.date}
                onChange={(date) => setFormData(prev => ({ ...prev, date }))}
                placeholder="Select date"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Start Time</label>
              <div className="relative">
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-transparent focus:bg-white focus:border-gray-900 rounded-[1.25rem] text-sm font-bold transition-all outline-none"
                />
                <Clock className="absolute left-4 top-4 text-gray-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">End Time</label>
              <div className="relative">
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-transparent focus:bg-white focus:border-gray-900 rounded-[1.25rem] text-sm font-bold transition-all outline-none"
                />
                <Clock className="absolute left-4 top-4 text-gray-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-2 md:col-span-1 lg:col-span-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                Link {isLinkMandatory ? '' : '(Optional)'}
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={formData.link}
                  onChange={(e) => setFormData(prev => ({ ...prev, link: e.target.value }))}
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-transparent focus:bg-white focus:border-gray-900 rounded-[1.25rem] text-sm font-bold transition-all outline-none"
                  placeholder="Meeting link..."
                />
                <LinkIcon className="absolute left-4 top-4 text-gray-400 pointer-events-none" size={16} />
              </div>
            </div>
          </div>

          {/* Attendance Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Attendance Sheet</h4>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></div>
                  <span className="text-[9px] font-black text-gray-400 uppercase">Present</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-200"></div>
                  <span className="text-[9px] font-black text-gray-400 uppercase">Absent</span>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {formData.students.map((student) => (
                <div 
                  key={student.student_id} 
                  className={`flex items-center justify-between p-4 rounded-3xl border transition-all duration-300 ${
                    student.status === 'present' 
                      ? 'bg-emerald-50/30 border-emerald-100' 
                      : 'bg-rose-50/30 border-rose-100'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-black shadow-sm shrink-0 transition-colors bg-black text-white">
                      {student.student_name.substring(0,2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-gray-900 uppercase truncate mb-0.5">{student.student_name}</p>
                      <p className="text-[9px] font-bold text-gray-400 uppercase truncate">{student.student_email}</p>
                    </div>
                  </div>
                  
                  <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-gray-100 ml-2">
                    <button
                      onClick={() => handleStudentStatusChange(student.student_id, 'present')}
                      className={`p-1.5 rounded-xl transition-all ${
                        student.status === 'present' 
                          ? 'bg-emerald-500 text-white shadow-md' 
                          : 'text-gray-300 hover:text-emerald-500'
                      }`}
                    >
                      <CheckCircle size={14} strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => handleStudentStatusChange(student.student_id, 'absent')}
                      className={`p-1.5 rounded-xl transition-all ${
                        student.status === 'absent' 
                          ? 'bg-rose-500 text-white shadow-md' 
                          : 'text-gray-300 hover:text-rose-500'
                      }`}
                    >
                      <XCircle size={14} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-white hover:shadow-sm transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-gray-900 hover:bg-black shadow-lg shadow-gray-200 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              'Create Class & Mark Attendance'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
