'use client'

import { useState, useEffect, useCallback } from 'react'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { ClassService } from '@/lib/services/classService'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

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

  const loadSubjects = useCallback(async () => {
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
      logger.error('Error loading subjects:', error)
      // Fallback to current section only
      try {
        const uniqueSubjects = await ClassService.getUniqueSubjects(dept, year, section)
        setSubjects(uniqueSubjects)
      } catch {
        setError('Failed to load subjects')
      }
    }
  }, [dept, year, section])

  const loadOccupiedDates = useCallback(async () => {
    try {
      const dates = await ScheduledClassService.getOccupiedDates(dept, year, section)
      setOccupiedDates(dates)
    } catch (error) {
      logger.error('Error loading occupied dates:', error)
    }
  }, [dept, year, section])

  useEffect(() => {
    if (isOpen) {
      loadSubjects()
      loadOccupiedDates()
    }
  }, [isOpen, dept, year, section, loadSubjects, loadOccupiedDates])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSubject || !selectedDate) {
      setError('Please select both subject and date')
      return
    }

    setLoading(true)
    setError('')

    try {
      // 1. Get all sections for this year and department
      const sections = await ClassService.getSectionsForYear(dept, year) // e.g., ['A', 'B', 'C']
      
      const results = {
        success: [] as string[],
        failed: [] as string[],
        conflicts: [] as string[]
      }

      // 2. Iterate through each section
      for (const currentSection of sections) {
        try {
          // A. Ensure Class (Subject) Exists in this Section
          let classes = await ClassService.getClassesByYearSection(dept, year, currentSection)
          let targetClass = classes.find(cls => cls.subject_name === selectedSubject)

          if (!targetClass) {
            logger.info(`Class ${selectedSubject} missing in Section ${currentSection}. Creating...`)
            await ClassService.createClass({
              subject_name: selectedSubject,
              dept,
              year,
              section: currentSection,
              faculty_id
            })

            // Re-fetch to confirm creation and get ID
            classes = await ClassService.getClassesByYearSection(dept, year, currentSection)
            targetClass = classes.find(cls => cls.subject_name === selectedSubject)

            if (!targetClass) {
              results.failed.push(currentSection)
              logger.error(`Failed to create class ${selectedSubject} in Section ${currentSection}`)
              continue
            }
          }

          // B. Check for Date Conflicts in this Section
          const isDateFree = await ScheduledClassService.isDateAvailable(selectedDate, dept, year, currentSection)
          if (!isDateFree) {
            results.conflicts.push(currentSection)
            logger.warn(`Date ${selectedDate} already occupied in Section ${currentSection}`)
            continue
          }

          // C. Schedule the Class
          // Note: createScheduledClass handles sections without peer tutors by creating placeholder records
          const scheduled = await ScheduledClassService.createScheduledClass({
            class_id: targetClass.id,
            scheduled_date: selectedDate,
            dept,
            year,
            section: currentSection,
            faculty_id
          })

          if (scheduled) {
            results.success.push(currentSection)
          } else {
            results.failed.push(currentSection)
          }

        } catch (sectionError) {
          logger.error(`Error processing Section ${currentSection}:`, sectionError)
          results.failed.push(currentSection)
        }
      }

      // 3. Construct Summary Message
      const totalSections = sections.length
      const successCount = results.success.length
      const conflictCount = results.conflicts.length
      const failedCount = results.failed.length
      
      // Calculate sections where scheduling was attempted (not already scheduled)
      const attemptedSections = totalSections - conflictCount
      
      if (successCount === attemptedSections && conflictCount === 0) {
        // Complete success - all sections scheduled
        toast.success(`Successfully scheduled for all ${successCount} sections!`)
        onSuccess()
        onClose()
      } else if (successCount === attemptedSections && conflictCount > 0) {
        // All new schedules succeeded, some sections already had this date scheduled
        toast.success(`Successfully scheduled for ${successCount} section${successCount > 1 ? 's' : ''}!`)
        onSuccess() 
        onClose()
      } else if (successCount > 0) {
        // Partial success - some scheduled, some failed/conflicts
        let msg = `Scheduled for ${successCount}/${attemptedSections} sections.`
        if (failedCount > 0) {
           msg += ` Failed in: ${results.failed.join(', ')}.`
        }
        toast.info(msg)
        if (conflictCount > 0) {
           // Only show conflict warning if there were actual failures in addition to conflicts
           toast.warning(`Date already occupied in sections: ${results.conflicts.join(', ')}`)
        }
        onSuccess() 
        onClose()
      } else {
        // Total failure - nothing was scheduled
        if (conflictCount > 0 && failedCount === 0) {
            // All sections already have this date scheduled
            toast.info(`All sections already have a class scheduled on ${selectedDate}`)
            onSuccess()
            onClose()
        } else if (failedCount > 0) {
            setError(`Failed to schedule in any section. Errors in: ${results.failed.join(', ')}`)
        } else {
            setError('Failed to schedule class.') 
        }
      }

    } catch (error) {
      logger.error('Error assigning date:', error)
      setError('An unexpected error occurred. Please try again.')
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

  // Redesigned UI with error handling improvements
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95 duration-300 border border-white/20">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Assign Date</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">
              Schedule a class session
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Select Subject
            </label>
            <div className="relative">
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                required
              >
                <option value="">Choose a subject...</option>
                {subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Select Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={getMinDate()}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder-gray-400"
              required
            />
            {selectedDate && isDateDisabled(selectedDate) && (
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mt-1 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Date already occupied
              </p>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl animate-in fade-in slide-in-from-top-2">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-[11px] font-bold text-red-600 leading-relaxed uppercase tracking-wide">
                  {error}
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-[11px] font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 rounded-xl transition-all"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedSubject || !selectedDate || isDateDisabled(selectedDate)}
              className="px-8 py-2.5 bg-blue-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Assigning...
                </>
              ) : (
                'Assign Date'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
