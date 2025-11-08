'use client'

import { useState, useEffect } from 'react'
import { ClassService } from '@/lib/services/classService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'

interface DateAssignmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  dept: string
  year: string
  section: string
  faculty_id: string
}

export default function DateAssignmentModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  dept, 
  year, 
  section,
  faculty_id
}: DateAssignmentModalProps) {
  const [subjects, setSubjects] = useState<string[]>([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [occupiedDates, setOccupiedDates] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadSubjects()
      loadOccupiedDates()
    }
  }, [isOpen, dept, year, section])

  const loadSubjects = async () => {
    try {
      // Get subjects from all sections of the same year, not just current section
      // This allows users to schedule classes for subjects that exist in other sections
      const sections = await ClassService.getSectionsForYear(dept, year)
      
      // Get unique subjects from all sections of this year
      const subjectSet = new Set<string>()
      for (const sec of sections) {
        const sectionSubjects = await ClassService.getUniqueSubjects(dept, year, sec)
        sectionSubjects.forEach(sub => subjectSet.add(sub))
      }
      
      setSubjects(Array.from(subjectSet).sort())
    } catch (error) {
      console.error('Error loading subjects:', error)
      // Fallback to current section only
      try {
        const uniqueSubjects = await ClassService.getUniqueSubjects(dept, year, section)
        setSubjects(uniqueSubjects)
      } catch (fallbackError) {
        setError('Failed to load subjects')
      }
    }
  }

  const loadOccupiedDates = async () => {
    try {
      const dates = await ScheduledClassService.getOccupiedDates(dept, year, section)
      setOccupiedDates(dates)
    } catch (error) {
      console.error('Error loading occupied dates:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSubject || !selectedDate) {
      setError('Please select both subject and date')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Check if date is available
      const isAvailable = await ScheduledClassService.isDateAvailable(selectedDate, dept, year, section)
      if (!isAvailable) {
        setError('This date is already occupied. Please select a different date.')
        setLoading(false)
        return
      }

      // Validate section is not 'ALL'
      if (!section || section.trim().toUpperCase() === 'ALL') {
        setError('Cannot create class with section "ALL". Please navigate to a specific section page.')
        setLoading(false)
        return
      }

      // First, get the class_id for the selected subject in the current section
      let classes = await ClassService.getClassesByYearSection(dept, year, section)
      let selectedClass = classes.find(cls => cls.subject_name === selectedSubject)
      
      // If the class doesn't exist in this section, create it first
      if (!selectedClass) {
        // Create the class for the specific section
        const classCreated = await ClassService.createClass({
          subject_name: selectedSubject,
          dept,
          year,
          section,
          faculty_id
        })
        
        if (!classCreated) {
          setError('Failed to create class. Please try again.')
          setLoading(false)
          return
        }
        
        // Reload classes to get the newly created class
        classes = await ClassService.getClassesByYearSection(dept, year, section)
        selectedClass = classes.find(cls => cls.subject_name === selectedSubject)
        
        if (!selectedClass) {
          setError('Class was created but could not be found. Please try again.')
          setLoading(false)
          return
        }
      }

      // Create the scheduled class
      console.log('DateAssignmentModal calling createScheduledClass with:', {
        class_id: selectedClass.id,
        scheduled_date: selectedDate,
        dept,
        year,
        section,
        faculty_id
      })
      
      const success = await ScheduledClassService.createScheduledClass({
        class_id: selectedClass.id,
        scheduled_date: selectedDate,
        dept,
        year,
        section,
        faculty_id
      })

      if (success) {
        onSuccess()
        onClose()
        setSelectedSubject('')
        setSelectedDate('')
        setError('')
      } else {
        setError('Failed to assign date. Please check the console for details and try again.')
        console.error('createScheduledClass returned false')
      }
    } catch (error) {
      console.error('Error assigning date:', error)
      setError('Failed to assign date. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getMinDate = () => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }

  const isDateDisabled = (date: string) => {
    return occupiedDates.includes(date)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-semibold mb-4">Assign Date to Class</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Subject
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Choose a subject...</option>
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={getMinDate()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {selectedDate && isDateDisabled(selectedDate) && (
              <p className="text-red-500 text-sm mt-1">
                This date is already occupied
              </p>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedSubject || !selectedDate || isDateDisabled(selectedDate)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Assigning...' : 'Assign Date'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
