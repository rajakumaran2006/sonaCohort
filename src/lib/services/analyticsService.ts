import { createClient } from '@/utils/supabase/client'

import { AdditionalClass } from './additionalClassService'

interface AnalyticsScheduledClass {
  id: string
  scheduled_date: string
  completion_status: 'not_started' | 'pending' | 'completed' // Approximated from DB values
  attendance_completed: boolean
  topics_completed: boolean
  class: {
    subject_name: string
  } | {
    subject_name: string
  }[]
}

export interface PendingClassStudent {
  id: string
  name: string
  email: string
  year: string
  section: string
  dept: string
  peer_tutor_id: string
  peer_tutor_name: string
  pending_count: number
  continuous_pending_count: number
  scheduled_classes: Array<{
    id: string
    scheduled_date: string
    subject_name: string
    completion_status: string
  }>
  additional_classes: Array<{
    id: string
    class_date: string
    subject_name: string
  }>
}

export interface PendingClassAnalytics {
  students: PendingClassStudent[]
  total_students: number
  total_pending_classes: number
  average_pending_per_student: number
}

export class AnalyticsService {
  /**
   * Get pending class analytics for a department
   */
  static async getPendingClassAnalytics(
    dept: string,
    threshold: number = 1,
    excludeAdditionalClasses: boolean = false,
    continuousPendingOnly: boolean = false
  ): Promise<PendingClassAnalytics> {
    try {
      const supabase = createClient()

      // Get all peer tutors in the department
      const { data: peerTutor, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('id, name, email, year, section, dept')
        .eq('dept', dept)

      if (tutorError) {
        console.error('Error fetching peer tutors:', tutorError)
        return {
          students: [],
          total_students: 0,
          total_pending_classes: 0,
          average_pending_per_student: 0
        }
      }

      if (!peerTutor || peerTutor.length === 0) {
        return {
          students: [],
          total_students: 0,
          total_pending_classes: 0,
          average_pending_per_student: 0
        }
      }

      // Get pending class data for each peer tutor
      const studentsWithPendingClasses: PendingClassStudent[] = []

      for (const tutor of peerTutor) {
        const pendingData = await this.calculatePendingClassesForpeertutors(
          tutor.id,
          tutor.name,
          tutor.year,
          tutor.section,
          tutor.dept,
          excludeAdditionalClasses
        )

        if (pendingData) {
          // Apply threshold filter
          if (threshold === 1 && pendingData.pending_count >= 1) {
            studentsWithPendingClasses.push(pendingData)
          } else if (threshold === 3 && pendingData.pending_count === 3) {
            if (continuousPendingOnly) {
              if (pendingData.continuous_pending_count >= 3) {
                studentsWithPendingClasses.push(pendingData)
              }
            } else {
              studentsWithPendingClasses.push(pendingData)
            }
          } else if (threshold > 3 && pendingData.pending_count > 3) {
            if (continuousPendingOnly) {
              if (pendingData.continuous_pending_count > 3) {
                studentsWithPendingClasses.push(pendingData)
              }
            } else {
              studentsWithPendingClasses.push(pendingData)
            }
          }
        }
      }

      // Calculate statistics
      const total_students = studentsWithPendingClasses.length
      const total_pending_classes = studentsWithPendingClasses.reduce(
        (sum, student) => sum + student.pending_count,
        0
      )
      const average_pending_per_student =
        total_students > 0 ? Math.round((total_pending_classes / total_students) * 10) / 10 : 0

      return {
        students: studentsWithPendingClasses.sort((a, b) => b.pending_count - a.pending_count),
        total_students,
        total_pending_classes,
        average_pending_per_student
      }
    } catch (error) {
      console.error('Error in getPendingClassAnalytics:', error)
      return {
        students: [],
        total_students: 0,
        total_pending_classes: 0,
        average_pending_per_student: 0
      }
    }
  }

  /**
   * Calculate pending classes for a specific peer tutor
   */
  private static async calculatePendingClassesForpeertutors(
    peertutorsId: string,
    peertutorsName: string,
    year: string,
    section: string,
    dept: string,
    excludeAdditionalClasses: boolean
  ): Promise<PendingClassStudent | null> {
    try {
      const supabase = createClient()

      // Get all scheduled classes for this peer tutor
      const { data: scheduledClasses, error: scheduledError } = await supabase
        .from('scheduled_classes')
        .select(`
          id,
          scheduled_date,
          completion_status,
          attendance_completed,
          topics_completed,
          class:classes!inner(
            subject_name
          )
        `)
        .eq('peer_tutor_id', peertutorsId)
        .order('scheduled_date', { ascending: true })

      if (scheduledError) {
        console.error('Error fetching scheduled classes:', scheduledError)
        return null
      }

      // Filter for pending classes (up to today)
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const pendingClasses = (scheduledClasses || []).filter(cls => {
        const classDate = new Date(cls.scheduled_date)
        classDate.setHours(0, 0, 0, 0)
        
        // Only include classes up to today
        if (classDate > today) return false

        // Check if class is pending
        return (
          cls.completion_status !== 'completed' &&
          !(cls.attendance_completed && cls.topics_completed)
        )
      })

      // Get additional classes if needed for continuous calculation
      let additionalClasses: Pick<AdditionalClass, 'id' | 'class_date' | 'subject_name'>[] = []
      if (excludeAdditionalClasses) {
        const { data: addClasses, error: addError } = await supabase
          .from('additional_classes')
          .select('id, class_date, subject_name')
          .eq('peer_tutor_id', peertutorsId)
          .order('class_date', { ascending: true })

        if (!addError && addClasses) {
          additionalClasses = addClasses.filter(cls => {
            const classDate = new Date(cls.class_date)
            classDate.setHours(0, 0, 0, 0)
            return classDate <= today
          })
        }
      }

      // Calculate continuous pending count
      const continuousPendingCount = this.calculateContinuousPending(
        pendingClasses,
        additionalClasses,
        excludeAdditionalClasses
      )

      if (pendingClasses.length === 0) {
        return null
      }

      return {
        id: peertutorsId,
        name: peertutorsName,
        email: '', // Will be filled from peer_tutors table if needed
        year,
        section,
        dept,
        peer_tutor_id: peertutorsId,
        peer_tutor_name: peertutorsName,
        pending_count: pendingClasses.length,
        continuous_pending_count: continuousPendingCount,
        scheduled_classes: pendingClasses.map(cls => {
          const classData = Array.isArray(cls.class) ? cls.class[0] : cls.class
          return {
            id: cls.id,
            scheduled_date: cls.scheduled_date,
            subject_name: classData?.subject_name || '',
            completion_status: cls.completion_status || 'not_started'
          }
        }),
        additional_classes: additionalClasses.map(cls => ({
          id: cls.id,
          class_date: cls.class_date,
          subject_name: cls.subject_name
        }))
      }
    } catch (error) {
      console.error('Error calculating pending classes for peer tutor:', error)
      return null
    }
  }

  /**
   * Calculate continuous pending classes
   * This counts the longest streak of consecutive pending classes
   * If excludeAdditionalClasses is true, additional classes break the streak
   */
  private static calculateContinuousPending(
    pendingClasses: AnalyticsScheduledClass[],
    additionalClasses: Pick<AdditionalClass, 'id' | 'class_date' | 'subject_name'>[],
    excludeAdditionalClasses: boolean
  ): number {
    if (pendingClasses.length === 0) return 0

    // Sort pending classes by date
    const sortedPending = [...pendingClasses].sort((a, b) => 
      new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
    )

    if (!excludeAdditionalClasses) {
      // If not excluding additional classes, just count consecutive pending from the end
      let count = 0
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Count backwards from today
      for (let i = sortedPending.length - 1; i >= 0; i--) {
        const classDate = new Date(sortedPending[i].scheduled_date)
        classDate.setHours(0, 0, 0, 0)
        
        if (classDate <= today) {
          count++
        } else {
          break
        }
      }
      return count
    }

    // If excluding additional classes, we need to check for breaks in the streak
    const sortedAdditional = [...additionalClasses].sort((a, b) =>
      new Date(a.class_date).getTime() - new Date(b.class_date).getTime()
    )

    let maxStreak = 0
    let currentStreak = 0
    let lastPendingDate: Date | null = null

    for (const pendingClass of sortedPending) {
      const pendingDate = new Date(pendingClass.scheduled_date)
      pendingDate.setHours(0, 0, 0, 0)

      if (lastPendingDate) {
        const currentDate = lastPendingDate;
        // Check if there's an additional class between lastPendingDate and pendingDate
        const hasAdditionalBetween = sortedAdditional.some(addCls => {
          const addDate = new Date(addCls.class_date)
          addDate.setHours(0, 0, 0, 0)
          return addDate > currentDate && addDate < pendingDate
        })

        if (hasAdditionalBetween) {
          // Additional class breaks the streak
          maxStreak = Math.max(maxStreak, currentStreak)
          currentStreak = 1
        } else {
          currentStreak++
        }
      } else {
        currentStreak = 1
      }

      lastPendingDate = pendingDate
    }

    maxStreak = Math.max(maxStreak, currentStreak)
    return maxStreak
  }

  /**
   * Get pending class statistics by year
   */
  static async getPendingClassStatsByYear(dept: string): Promise<{
    year: string
    total_students: number
    pending_students: number
    total_pending_classes: number
  }[]> {
    try {
      // const supabase = createClient()

      const years = ['2', '3', '4']
      const stats = []

      for (const year of years) {
        const analytics = await this.getPendingClassAnalytics(dept, 1, false, false)
        const yearStudents = analytics.students.filter(s => s.year === year)

        stats.push({
          year,
          total_students: yearStudents.length,
          pending_students: yearStudents.length,
          total_pending_classes: yearStudents.reduce((sum, s) => sum + s.pending_count, 0)
        })
      }

      return stats
    } catch (error) {
      console.error('Error in getPendingClassStatsByYear:', error)
      return []
    }
  }
}
