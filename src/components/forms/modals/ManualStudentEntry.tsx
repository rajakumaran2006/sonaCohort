'use client'

import { useState } from 'react'
import { X, UserPlus, Loader2 } from 'lucide-react'
import { StudentService } from '@/lib/services/studentService'
import { useAuth } from '@/lib/auth/AuthContext'
import { toast } from 'sonner'

interface ManualStudentEntryProps {
  dept: string
  year: string
  section: string
  onClose: () => void
  mode?: 'student' | 'peer-tutor'
}

export default function ManualStudentEntry({
  dept,
  year,
  section,
  onClose,
  onSuccess,
  mode = 'student'
}: ManualStudentEntryProps) {
  const { user } = useAuth()
  const [studentName, setStudentName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!studentName.trim()) {
      toast.error('Please enter a name')
      return
    }

    if (!user?.id) {
      toast.error('User not authenticated')
      return
    }

    setIsSubmitting(true)

    try {
      let result;
      
      if (mode === 'peer-tutor') {
        const { peertutorservice } = await import('@/lib/services/peerTutorService')
        result = await peertutorservice.assignpeertutors({
          name: studentName.trim(),
          email: null,
          dept,
          year,
          section,
          faculty_id: user.id,
          assigned_by: user.user_metadata?.full_name || user.email || 'Unknown',
          is_manual_entry: true
        })
      } else {
        result = await StudentService.addStudent({
          name: studentName.trim(),
          email: null, // Manual entry has no email
          dept,
          year,
          section,
          faculty_id: user.id,
          peer_tutor: false,
          is_manual_entry: true
        })
      }

      if (result.success) {
        toast.success(`${studentName} added successfully as manual entry`)
        setStudentName('')
        onSuccess()
        onClose()
      } else {
        toast.error(result.error || 'Failed to add user')
      }
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 uppercase">ADD MANUAL STUDENT</h3>
            <p className="text-xs text-gray-600 mt-1">
              {dept} • Year {year} • Section {section}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label htmlFor="studentName" className="block text-sm font-semibold text-gray-700 mb-2">
              Student Name <span className="text-red-500">*</span>
            </label>
            <input
              id="studentName"
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Enter student name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              autoFocus
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500 mt-2">
              Email will be added later using Microsoft Graph
            </p>
          </div>

          {/* Footer */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-all disabled:opacity-50"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !studentName.trim()}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg shadow-lg transition-all flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  ADDING...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  ADD STUDENT
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
