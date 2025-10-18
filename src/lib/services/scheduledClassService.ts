import { createClient } from '@/utils/supabase/client'

export interface ScheduledClass {
  id: string
  class_id: string
  scheduled_date: string
  dept: string
  year: string
  section: string
  faculty_id: string
  peer_tutor_id: string
  created_at: string
  updated_at: string
  topics?: string
  completion_status?: 'not_started' | 'pending' | 'completed'
  attendance_completed?: boolean
  topics_completed?: boolean
  completed_at?: string
}

export interface CreateScheduledClassData {
  class_id: string
  scheduled_date: string
  dept: string
  year: string
  section: string
  faculty_id: string
  peer_tutor_id: string
  topics?: string
}

export interface ScheduledClassWithDetails extends ScheduledClass {
  class: {
    id: string
    subject_name: string
    created_at: string
    dept: string
    year: string
    section: string
  }
  peer_tutor: {
    id: string
    name: string
    email: string
  }
}

export class ScheduledClassService {
  /**
   * Create a new scheduled class
   */
  static async createScheduledClass(data: CreateScheduledClassData): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Get all peer tutors for the specified dept/year/section
      const { data: peerTutors, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('id')
        .eq('dept', data.dept)
        .eq('year', data.year)
        .eq('section', data.section)

      if (tutorsError) {
        console.error('Error getting peer tutors:', tutorsError)
        return false
      }

      if (!peerTutors || peerTutors.length === 0) {
        console.error('No peer tutors found for the specified criteria')
        return false
      }

      // Create scheduled class records for each peer tutor
      const scheduledClassData = peerTutors.map(tutor => ({
        ...data,
        peer_tutor_id: tutor.id
      }))

      const { error } = await supabase
        .from('scheduled_classes')
        .insert(scheduledClassData)

      if (error) {
        console.error('Error creating scheduled classes:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in createScheduledClass:', error)
      return false
    }
  }

  /**
   * Get scheduled classes for a specific dept/year/section
   */
  static async getScheduledClassesByYearSection(
    dept: string, 
    year: string, 
    section: string, 
    peerTutorId?: string
  ): Promise<ScheduledClassWithDetails[]> {
    try {
      const supabase = createClient()
      
      let query = supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name,
            created_at
          ),
          peer_tutor:peer_tutors!inner(
            id,
            name,
            email
          )
        `)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .order('scheduled_date', { ascending: true })

      // Filter by peer tutor if provided
      if (peerTutorId) {
        query = query.eq('peer_tutor_id', peerTutorId)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error getting scheduled classes:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error in getScheduledClassesByYearSection:', error)
      return []
    }
  }

  /**
   * Get scheduled classes ordered by date for a specific dept/year/section
   */
  static async getScheduledClassesByDate(dept: string, year: string, section: string): Promise<ScheduledClassWithDetails[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name,
            created_at
          )
        `)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .order('scheduled_date', { ascending: true })

      if (error) {
        console.error('Error getting scheduled classes by date:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error in getScheduledClassesByDate:', error)
      return []
    }
  }

  /**
   * Get occupied dates for a specific dept/year/section
   */
  static async getOccupiedDates(dept: string, year: string, section: string): Promise<string[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('scheduled_classes')
        .select('scheduled_date')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (error) {
        console.error('Error getting occupied dates:', error)
        return []
      }

      return data.map(item => item.scheduled_date).filter(Boolean)
    } catch (error) {
      console.error('Error in getOccupiedDates:', error)
      return []
    }
  }

  /**
   * Check if a date is available for a specific dept/year/section
   */
  static async isDateAvailable(scheduledDate: string, dept: string, year: string, section: string, excludeScheduledClassId?: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      let query = supabase
        .from('scheduled_classes')
        .select('id')
        .eq('scheduled_date', scheduledDate)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (excludeScheduledClassId) {
        query = query.neq('id', excludeScheduledClassId)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error checking date availability:', error)
        return false
      }

      return data.length === 0
    } catch (error) {
      console.error('Error in isDateAvailable:', error)
      return false
    }
  }

  /**
   * Get unique subjects that have scheduled classes for a specific dept/year/section
   */
  static async getUniqueSubjectsWithSchedules(dept: string, year: string, section: string): Promise<string[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('scheduled_classes')
        .select(`
          class:classes!inner(
            subject_name
          )
        `)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (error) {
        console.error('Error getting unique subjects with schedules:', error)
        return []
      }

      // Get unique subject names
      const uniqueSubjects = [...new Set(data.map((item: any) => item.class.subject_name))]
      return uniqueSubjects
    } catch (error) {
      console.error('Error in getUniqueSubjectsWithSchedules:', error)
      return []
    }
  }

  /**
   * Get all subjects (both scheduled and unscheduled) for a specific dept/year/section
   */
  static async getAllSubjects(dept: string, year: string, section: string): Promise<string[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('classes')
        .select('subject_name')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (error) {
        console.error('Error getting all subjects:', error)
        return []
      }

      // Get unique subject names
      const uniqueSubjects = [...new Set(data.map(item => item.subject_name))]
      return uniqueSubjects
    } catch (error) {
      console.error('Error in getAllSubjects:', error)
      return []
    }
  }

  /**
   * Delete a scheduled class
   */
  static async deleteScheduledClass(scheduledClassId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('scheduled_classes')
        .delete()
        .eq('id', scheduledClassId)

      if (error) {
        console.error('Error deleting scheduled class:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in deleteScheduledClass:', error)
      return false
    }
  }

  /**
   * Update a scheduled class date
   */
  static async updateScheduledClassDate(scheduledClassId: string, newDate: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('scheduled_classes')
        .update({ scheduled_date: newDate })
        .eq('id', scheduledClassId)

      if (error) {
        console.error('Error updating scheduled class date:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in updateScheduledClassDate:', error)
      return false
    }
  }

  /**
   * Get a single scheduled class by ID
   */
  static async getScheduledClassById(scheduledClassId: string): Promise<ScheduledClass | null> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('scheduled_classes')
        .select('*')
        .eq('id', scheduledClassId)
        .single()

      if (error) {
        console.error('Error getting scheduled class by ID:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error in getScheduledClassById:', error)
      return null
    }
  }

  /**
   * Get scheduled class by class_id (fallback method)
   */
  static async getScheduledClassByClassId(classId: string): Promise<ScheduledClass | null> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('scheduled_classes')
        .select('*')
        .eq('class_id', classId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        console.error('Error getting scheduled class by class_id:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error in getScheduledClassByClassId:', error)
      return null
    }
  }

  /**
   * Update topics for a scheduled class
   */
  static async updateScheduledClassTopics(scheduledClassId: string, topics: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('scheduled_classes')
        .update({ 
          topics: topics,
          topics_completed: topics.trim().length > 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', scheduledClassId)

      if (error) {
        console.error('Error updating scheduled class topics:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in updateScheduledClassTopics:', error)
      return false
    }
  }

  /**
   * Update completion status for a scheduled class
   */
  static async updateScheduledClassCompletion(
    scheduledClassId: string, 
    attendanceCompleted: boolean, 
    topicsCompleted: boolean
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const completionStatus = attendanceCompleted && topicsCompleted ? 'completed' : 
                              (attendanceCompleted || topicsCompleted) ? 'pending' : 'not_started'
      
      const completedAt = completionStatus === 'completed' ? new Date().toISOString() : null

      const { error } = await supabase
        .from('scheduled_classes')
        .update({ 
          attendance_completed: attendanceCompleted,
          topics_completed: topicsCompleted,
          completion_status: completionStatus,
          completed_at: completedAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', scheduledClassId)

      if (error) {
        console.error('Error updating scheduled class completion:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in updateScheduledClassCompletion:', error)
      return false
    }
  }

  /**
   * Get completion status for a scheduled class
   */
  static async getScheduledClassCompletion(scheduledClassId: string): Promise<{
    attendance_completed: boolean
    topics_completed: boolean
    completion_status: 'not_started' | 'pending' | 'completed'
    completed_at: string | null
  } | null> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('scheduled_classes')
        .select('attendance_completed, topics_completed, completion_status, completed_at')
        .eq('id', scheduledClassId)
        .single()

      if (error) {
        console.error('Error getting scheduled class completion:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error in getScheduledClassCompletion:', error)
      return null
    }
  }

  /**
   * Get peer tutor class status for faculty attendance monitoring
   */
  static async getPeerTutorClassStatus(dept: string, year: string, section: string, subject?: string): Promise<{
    completed: ScheduledClassWithDetails[]
    pending: ScheduledClassWithDetails[]
  }> {
    try {
      const supabase = createClient()
      
      // Get all scheduled classes for the specified filters
      let query = supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name,
            created_at,
            dept,
            year,
            section
          ),
          peer_tutor:peer_tutors!inner(
            id,
            name,
            email
          )
        `)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .order('scheduled_date', { ascending: true })

      // Add subject filter if provided
      if (subject) {
        query = query.eq('class.subject_name', subject)
      }

      const { data, error } = await query

      console.log('Query result for peer tutor class status:', { dept, year, section, subject }, 'Data count:', data?.length || 0)
      
      if (error) {
        console.error('Error getting peer tutor class status:', error)
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        console.error('Query filters:', { dept, year, section, subject })
        return { completed: [], pending: [] }
      }

      // Filter classes based on date (today and previous days)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const relevantClasses = (data || []).filter(cls => {
        const classDate = new Date(cls.scheduled_date)
        classDate.setHours(0, 0, 0, 0)
        // Include today and past classes
        return classDate <= today
      })

      // Separate completed and pending classes
      const completed = relevantClasses.filter(cls => {
        // A class is considered completed if:
        // 1. completion_status is explicitly 'completed'
        // 2. Both attendance and topics are marked as completed
        // 3. completion_status is 'pending' but both attendance and topics are done
        return cls.completion_status === 'completed' || 
               (cls.attendance_completed && cls.topics_completed) ||
               (cls.completion_status === 'pending' && cls.attendance_completed && cls.topics_completed)
      })
      
      const pending = relevantClasses.filter(cls => {
        // A class is considered pending if:
        // 1. completion_status is 'pending' and not both attendance and topics are done
        // 2. completion_status is 'not_started'
        // 3. completion_status is null/undefined but not both attendance and topics are done
        return (cls.completion_status === 'pending' && !(cls.attendance_completed && cls.topics_completed)) ||
               cls.completion_status === 'not_started' ||
               (!cls.completion_status && !(cls.attendance_completed && cls.topics_completed))
      })

      return { completed, pending }
    } catch (error) {
      console.error('Error in getPeerTutorClassStatus:', error)
      return { completed: [], pending: [] }
    }
  }

  /**
   * Get peer tutor class status with date filtering
   */
  static async getPeerTutorClassStatusWithDate(dept: string, year: string, section: string, dateFilter: string): Promise<{
    completed: ScheduledClassWithDetails[]
    pending: ScheduledClassWithDetails[]
  }> {
    try {
      const supabase = createClient()
      
      // Determine the target date
      let targetDate: Date
      let dateString: string
      
      if (dateFilter === 'today') {
        targetDate = new Date()
        targetDate.setHours(0, 0, 0, 0)
        dateString = targetDate.toISOString().split('T')[0]
      } else {
        // Handle custom date - ensure it's in YYYY-MM-DD format
        targetDate = new Date(dateFilter)
        targetDate.setHours(0, 0, 0, 0)
        dateString = targetDate.toISOString().split('T')[0]
      }
      
      console.log('Date filter processing:', {
        originalDateFilter: dateFilter,
        targetDate: targetDate.toISOString(),
        dateString: dateString
      })
      
      // Get all scheduled classes for the specified filters
      let query = supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name,
            created_at,
            dept,
            year,
            section
          ),
          peer_tutor:peer_tutors!inner(
            id,
            name,
            email
          )
        `)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .eq('scheduled_date', dateString)
        .order('scheduled_date', { ascending: true })

      const { data, error } = await query

      console.log('Query result for peer tutor class status with date:', { dept, year, section, dateFilter }, 'Data count:', data?.length || 0)
      
      if (error) {
        console.error('Error getting peer tutor class status with date:', error)
        return { completed: [], pending: [] }
      }

      const relevantClasses = data || []

      // Separate completed and pending classes
      const completed = relevantClasses.filter(cls => {
        // A class is considered completed if:
        // 1. completion_status is explicitly 'completed'
        // 2. Both attendance and topics are marked as completed
        // 3. completion_status is 'pending' but both attendance and topics are done
        return cls.completion_status === 'completed' || 
               (cls.attendance_completed && cls.topics_completed) ||
               (cls.completion_status === 'pending' && cls.attendance_completed && cls.topics_completed)
      })
      
      const pending = relevantClasses.filter(cls => {
        // A class is considered pending if:
        // 1. completion_status is 'pending' and not both attendance and topics are done
        // 2. completion_status is 'not_started'
        // 3. completion_status is null/undefined but not both attendance and topics are done
        return (cls.completion_status === 'pending' && !(cls.attendance_completed && cls.topics_completed)) ||
               cls.completion_status === 'not_started' ||
               (!cls.completion_status && !(cls.attendance_completed && cls.topics_completed))
      })

      return { completed, pending }
    } catch (error) {
      console.error('Error in getPeerTutorClassStatusWithDate:', error)
      return { completed: [], pending: [] }
    }
  }

  /**
   * Get peer tutor class status by year only (all sections, all dates)
   */
  static async getPeerTutorClassStatusByYear(dept: string, year: string): Promise<{
    completed: ScheduledClassWithDetails[]
    pending: ScheduledClassWithDetails[]
  }> {
    try {
      const supabase = createClient()
      
      // Get all scheduled classes for the specified year
      let query = supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name,
            created_at,
            dept,
            year,
            section
          ),
          peer_tutor:peer_tutors!inner(
            id,
            name,
            email
          )
        `)
        .eq('dept', dept)
        .eq('year', year)
        .order('scheduled_date', { ascending: true })

      const { data, error } = await query

      console.log('Query result for peer tutor class status by year:', { dept, year }, 'Data count:', data?.length || 0)
      
      if (error) {
        console.error('Error getting peer tutor class status by year:', error)
        return { completed: [], pending: [] }
      }

      const relevantClasses = data || []

      // Separate completed and pending classes
      const completed = relevantClasses.filter(cls => {
        return cls.completion_status === 'completed' || 
               (cls.attendance_completed && cls.topics_completed) ||
               (cls.completion_status === 'pending' && cls.attendance_completed && cls.topics_completed)
      })
      
      const pending = relevantClasses.filter(cls => {
        return (cls.completion_status === 'pending' && !(cls.attendance_completed && cls.topics_completed)) ||
               cls.completion_status === 'not_started' ||
               (!cls.completion_status && !(cls.attendance_completed && cls.topics_completed))
      })

      return { completed, pending }
    } catch (error) {
      console.error('Error in getPeerTutorClassStatusByYear:', error)
      return { completed: [], pending: [] }
    }
  }

  /**
   * Get peer tutor class status by year and date (all sections)
   */
  static async getPeerTutorClassStatusByYearAndDate(dept: string, year: string, dateFilter: string): Promise<{
    completed: ScheduledClassWithDetails[]
    pending: ScheduledClassWithDetails[]
  }> {
    try {
      const supabase = createClient()
      
      // Determine the target date
      let targetDate: Date
      let dateString: string
      
      if (dateFilter === 'today') {
        targetDate = new Date()
        targetDate.setHours(0, 0, 0, 0)
        dateString = targetDate.toISOString().split('T')[0]
      } else {
        // Handle custom date - ensure it's in YYYY-MM-DD format
        targetDate = new Date(dateFilter)
        targetDate.setHours(0, 0, 0, 0)
        dateString = targetDate.toISOString().split('T')[0]
      }
      
      console.log('Date filter processing (year+date):', {
        originalDateFilter: dateFilter,
        targetDate: targetDate.toISOString(),
        dateString: dateString
      })
      
      // Get all scheduled classes for the specified year and date
      let query = supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name,
            created_at,
            dept,
            year,
            section
          ),
          peer_tutor:peer_tutors!inner(
            id,
            name,
            email
          )
        `)
        .eq('dept', dept)
        .eq('year', year)
        .eq('scheduled_date', dateString)
        .order('scheduled_date', { ascending: true })

      const { data, error } = await query

      console.log('Query result for peer tutor class status by year and date:', { dept, year, dateFilter }, 'Data count:', data?.length || 0)
      
      if (error) {
        console.error('Error getting peer tutor class status by year and date:', error)
        return { completed: [], pending: [] }
      }

      const relevantClasses = data || []

      // Separate completed and pending classes
      const completed = relevantClasses.filter(cls => {
        return cls.completion_status === 'completed' || 
               (cls.attendance_completed && cls.topics_completed) ||
               (cls.completion_status === 'pending' && cls.attendance_completed && cls.topics_completed)
      })
      
      const pending = relevantClasses.filter(cls => {
        return (cls.completion_status === 'pending' && !(cls.attendance_completed && cls.topics_completed)) ||
               cls.completion_status === 'not_started' ||
               (!cls.completion_status && !(cls.attendance_completed && cls.topics_completed))
      })

      return { completed, pending }
    } catch (error) {
      console.error('Error in getPeerTutorClassStatusByYearAndDate:', error)
      return { completed: [], pending: [] }
    }
  }

  /**
   * Get all classes for a department (when no filters are selected)
   */
  static async getAllClassesForDepartment(dept: string): Promise<{ completed: ScheduledClassWithDetails[], pending: ScheduledClassWithDetails[] }> {
    try {
      const supabase = createClient()
      
      console.log('Getting all classes for department:', dept)
      
      // First, get all scheduled classes for the department
      const { data: scheduledClasses, error: scheduledError } = await supabase
        .from('scheduled_classes')
        .select('*')
        .eq('dept', dept)
        .order('scheduled_date', { ascending: false })

      if (scheduledError) {
        console.error('Error getting scheduled classes for department:', scheduledError)
        console.error('Error details:', {
          message: scheduledError.message,
          details: scheduledError.details,
          hint: scheduledError.hint,
          code: scheduledError.code
        })
        return { completed: [], pending: [] }
      }

      if (!scheduledClasses || scheduledClasses.length === 0) {
        console.log('No scheduled classes found for department:', dept)
        return { completed: [], pending: [] }
      }

      console.log('Found scheduled classes:', scheduledClasses.length)

      // Get unique class IDs and peer tutor IDs
      const classIds = [...new Set(scheduledClasses.map(sc => sc.class_id))]
      const peerTutorIds = [...new Set(scheduledClasses.map(sc => sc.peer_tutor_id))]

      // Get class details
      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('id, subject_name, dept, year, section, created_at')
        .in('id', classIds)

      if (classesError) {
        console.error('Error getting class details:', classesError)
        return { completed: [], pending: [] }
      }

      // Get peer tutor details
      const { data: peerTutors, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('id, name, email')
        .in('id', peerTutorIds)

      if (tutorsError) {
        console.error('Error getting peer tutor details:', tutorsError)
        return { completed: [], pending: [] }
      }

      // Create lookup maps
      const classMap = new Map(classes?.map(c => [c.id, c]) || [])
      const tutorMap = new Map(peerTutors?.map(t => [t.id, t]) || [])

      // Combine the data
      const enrichedClasses: ScheduledClassWithDetails[] = scheduledClasses.map(sc => ({
        ...sc,
        class: classMap.get(sc.class_id) || {
          id: sc.class_id,
          subject_name: 'Unknown Subject',
          dept: sc.dept,
          year: sc.year,
          section: sc.section,
          created_at: new Date().toISOString()
        },
        peer_tutor: tutorMap.get(sc.peer_tutor_id) || {
          id: sc.peer_tutor_id,
          name: 'Unknown Tutor',
          email: 'unknown@email.com'
        }
      }))

      // Filter classes based on date (today and previous days)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const relevantClasses = enrichedClasses.filter(cls => {
        const classDate = new Date(cls.scheduled_date)
        classDate.setHours(0, 0, 0, 0)
        // Include today and past classes
        return classDate <= today
      })

      // Separate completed and pending classes
      const completed = relevantClasses.filter(cls => {
        // A class is considered completed if:
        // 1. completion_status is explicitly 'completed'
        // 2. Both attendance and topics are marked as completed
        // 3. completion_status is 'pending' but both attendance and topics are done
        return cls.completion_status === 'completed' || 
               (cls.attendance_completed && cls.topics_completed) ||
               (cls.completion_status === 'pending' && cls.attendance_completed && cls.topics_completed)
      })
      
      const pending = relevantClasses.filter(cls => {
        // A class is considered pending if:
        // 1. completion_status is 'pending' and not both attendance and topics are done
        // 2. completion_status is 'not_started'
        // 3. completion_status is null/undefined but not both attendance and topics are done
        return (cls.completion_status === 'pending' && !(cls.attendance_completed && cls.topics_completed)) ||
               cls.completion_status === 'not_started' ||
               (!cls.completion_status && !(cls.attendance_completed && cls.topics_completed))
      })

      console.log('Processed classes - Completed:', completed.length, 'Pending:', pending.length)
      return { completed, pending }
    } catch (error) {
      console.error('Error in getAllClassesForDepartment:', error)
      return { completed: [], pending: [] }
    }
  }

  /**
   * Get class statistics for a specific peer tutor
   */
  static async getPeerTutorClassStats(peerTutorId: string): Promise<{
    totalClasses: number
    completedClasses: number
    pendingClasses: number
  }> {
    try {
      const supabase = createClient()
      
      // Get all scheduled classes for this peer tutor
      const { data: scheduledClasses, error } = await supabase
        .from('scheduled_classes')
        .select('*')
        .eq('peer_tutor_id', peerTutorId)

      if (error) {
        console.error('Error getting peer tutor class stats:', error)
        return { totalClasses: 0, completedClasses: 0, pendingClasses: 0 }
      }

      if (!scheduledClasses || scheduledClasses.length === 0) {
        return { totalClasses: 0, completedClasses: 0, pendingClasses: 0 }
      }

      // Filter classes based on date (today and previous days)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const relevantClasses = scheduledClasses.filter(cls => {
        const classDate = new Date(cls.scheduled_date)
        classDate.setHours(0, 0, 0, 0)
        // Include today and past classes
        return classDate <= today
      })

      // Count completed and pending classes
      const completedClasses = relevantClasses.filter(cls => {
        return cls.completion_status === 'completed' || 
               (cls.attendance_completed && cls.topics_completed) ||
               (cls.completion_status === 'pending' && cls.attendance_completed && cls.topics_completed)
      }).length
      
      const pendingClasses = relevantClasses.filter(cls => {
        return (cls.completion_status === 'pending' && !(cls.attendance_completed && cls.topics_completed)) ||
               cls.completion_status === 'not_started' ||
               (!cls.completion_status && !(cls.attendance_completed && cls.topics_completed))
      }).length

      return {
        totalClasses: relevantClasses.length,
        completedClasses,
        pendingClasses
      }
    } catch (error) {
      console.error('Error in getPeerTutorClassStats:', error)
      return { totalClasses: 0, completedClasses: 0, pendingClasses: 0 }
    }
  }

}
