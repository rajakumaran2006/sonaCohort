import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

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
  image_link?: string
  completion_status?: 'not_started' | 'pending' | 'completed'
  attendance_completed?: boolean
  topics_completed?: boolean
  completed_at?: string
  start_time?: string | null
  end_time?: string | null
  link?: string | null
}

export interface CreateScheduledClassData {
  class_id: string
  scheduled_date: string
  dept: string
  year: string
  section: string
  faculty_id: string
  topics?: string
  image_link?: string
  start_time?: string
  end_time?: string
  link?: string
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
  } | null
}

export class ScheduledClassService {
  /**
   * Create a new scheduled class
   * Creates a scheduled class for the specific section
   */
  static async createScheduledClass(data: CreateScheduledClassData): Promise<boolean> {
    try {
      const supabase = createClient()

      // Validate required fields with detailed logging
      logger.info('createScheduledClass called with data:', data)

      if (!data.class_id) {
        logger.error('class_id is required')
        return false
      }
      if (!data.faculty_id) {
        logger.error('faculty_id is required')
        return false
      }
      if (!data.scheduled_date) {
        logger.error('scheduled_date is required')
        return false
      }
      if (!data.dept || !data.year || !data.section) {
        logger.error('dept, year, and section are required', { dept: data.dept, year: data.year, section: data.section })
        return false
      }

      // Get the class to verify it exists and get section information
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('subject_name, year, dept, section')
        .eq('id', data.class_id)
        .single()

      if (classError || !classData) {
        logger.error('Error getting class data:', classError)
        return false
      }

      // Normalize year format
      const normalizeYear = (year: string): string => {
        const yearMap: { [key: string]: string } = {
          '2nd Year': '2', '3rd Year': '3', '4th Year': '4',
          '2': '2', '3': '3', '4': '4'
        }
        return yearMap[year] || year
      }
      const normalizedYear = normalizeYear(data.year)
      const normalizedDept = data.dept.trim()
      const normalizedSection = data.section.trim()

      // Verify the class section matches the provided section
      if (classData.section !== normalizedSection) {
        logger.warn(`Class section (${classData.section}) does not match provided section (${normalizedSection}). Using class section.`)
      }

      // Check if the scheduled date is valid (today or future, not past)
      let scheduledDate: Date
      try {
        // Safe parsing to avoid timezone shifts (especially for YYYY-MM-DD strings)
        const dateParts = data.scheduled_date.split(/[-/]/)
        if (dateParts.length === 3) {
          const year = parseInt(dateParts[0])
          const month = parseInt(dateParts[1]) - 1
          const day = parseInt(dateParts[2])
          scheduledDate = new Date(year, month, day)
        } else {
          scheduledDate = new Date(data.scheduled_date)
        }

        if (isNaN(scheduledDate.getTime())) {
          logger.error('Invalid scheduled_date format:', data.scheduled_date)
          return false
        }
        scheduledDate.setHours(0, 0, 0, 0)
      } catch (error) {
        logger.error('Error parsing scheduled_date:', data.scheduled_date, error)
        return false
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Allow scheduling for today and future dates (reject only past dates)
      if (scheduledDate < today) {
        logger.info('Scheduled date is in the past. Not creating scheduled classes.')
        return false
      }

      // Always create scheduled classes for ALL peer tutors in this section
      logger.info('Fetching peer tutors for:', { dept: normalizedDept, year: normalizedYear, section: normalizedSection })

      const { data: peerTutor, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('id')
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)

      if (tutorsError) {
        logger.error('Error fetching peer tutors:', tutorsError)
        return false
      }

      logger.info('Found peer tutors:', peerTutor?.length || 0)

      if (!peerTutor || peerTutor.length === 0) {
        logger.warn('No peer tutors found for this section. Creating a placeholder scheduled class.')

        // Check if a placeholder already exists
        const { data: existingPlaceholder } = await supabase
          .from('scheduled_classes')
          .select('id')
          .eq('class_id', data.class_id)
          .eq('scheduled_date', data.scheduled_date)
          .ilike('dept', normalizedDept)
          .eq('year', normalizedYear)
          .eq('section', normalizedSection)
          .is('peer_tutor_id', null)
          .maybeSingle()

        if (existingPlaceholder) {
          logger.info('Placeholder scheduled class already exists')
          return true
        }

        // Create placeholder
        const { error: placeholderError } = await supabase
          .from('scheduled_classes')
          .insert({
            class_id: data.class_id,
            scheduled_date: data.scheduled_date,
            dept: normalizedDept,
            year: normalizedYear,
            section: normalizedSection,
            faculty_id: data.faculty_id,
            peer_tutor_id: null,
            topics: data.topics,
            start_time: data.start_time,
            end_time: data.end_time,
            link: data.link
          })

        if (placeholderError) {
          logger.error('Error creating placeholder scheduled class:', placeholderError)
          return false
        }

        return true
      }

      // Check which peer tutors already have this scheduled class
      const peertutorsIds = peerTutor.map(t => t.id).filter(id => id) // Remove any undefined/null IDs
      logger.info('Checking existing scheduled classes for peer tutor IDs:', peertutorsIds.length)

      if (peertutorsIds.length === 0) {
        logger.error('No valid peer tutor IDs found')
        return false
      }

      const { data: existing, error: existErr } = await supabase
        .from('scheduled_classes')
        .select('peer_tutor_id')
        .eq('class_id', data.class_id)
        .eq('scheduled_date', data.scheduled_date)
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)
        .in('peer_tutor_id', peertutorsIds)

      let existingTutorIds = new Set<string>()

      if (existErr) {
        logger.error('Error checking existing scheduled classes:', existErr)
        // Don't return false here - continue to create if the check fails
        // This handles cases where the query might fail but we can still create
        logger.warn('Continuing despite error checking existing classes - will create for all peer tutors')
      } else {
        // Only use existing data if there was no error
        existingTutorIds = new Set((existing || []).map(e => e.peer_tutor_id))
      }

      const tutorsToCreate = peerTutor.filter(t => !existingTutorIds.has(t.id))

      if (tutorsToCreate.length === 0) {
        logger.info('All peer tutors already have this scheduled class')
        return true
      }

      logger.info(`Creating scheduled classes for ${tutorsToCreate.length} peer tutor(s)`)

      // Create scheduled classes for all peer tutors that don't have it
      const recordsToInsert = tutorsToCreate.map(tutor => ({
        class_id: data.class_id,
        scheduled_date: data.scheduled_date,
        dept: normalizedDept,
        year: normalizedYear,
        section: normalizedSection,
        faculty_id: data.faculty_id,
        peer_tutor_id: tutor.id,
        topics: data.topics,
        start_time: data.start_time,
        end_time: data.end_time,
        link: data.link
      }))

      const { error: insertError } = await supabase
        .from('scheduled_classes')
        .insert(recordsToInsert)

      if (insertError) {
        logger.error('Error creating scheduled classes for peer tutors:', insertError)
        return false
      }

      logger.info(`✓ Created scheduled classes for ${tutorsToCreate.length} peer tutor(s) in section:`, normalizedSection)
      return true
    } catch (error) {
      logger.error('Error in createScheduledClass:', error)
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
    peertutorsId?: string
  ): Promise<ScheduledClassWithDetails[]> {
    try {
      const supabase = createClient()

      // Normalize year, department, and section
      const normalizeYear = (year: string): string => {
        const yearMap: { [key: string]: string } = {
          '2nd Year': '2', '3rd Year': '3', '4th Year': '4',
          '2': '2', '3': '3', '4': '4'
        }
        return yearMap[year] || year
      }
      const normalizedYear = normalizeYear(year)
      const normalizedDept = dept.trim()
      const normalizedSection = section.trim()

      let query = supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name,
            created_at
          ),
          peer_tutor:peer_tutors(
            id,
            name,
            email
          )
        `)
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)
        .order('scheduled_date', { ascending: true })

      // Filter by peer tutor if provided
      if (peertutorsId) {
        query = query.eq('peer_tutor_id', peertutorsId)
      }

      const { data, error } = await query

      if (error) {
        logger.error('Error getting scheduled classes:', error)
        return []
      }

      return data || []
    } catch (error) {
      logger.error('Error in getScheduledClassesByYearSection:', error)
      return []
    }
  }

  /**
   * Get scheduled classes ordered by date for a specific dept/year/section
   */
  static async getScheduledClassesByDate(dept: string, year: string, section: string, peertutorsId?: string): Promise<ScheduledClassWithDetails[]> {
    try {
      const supabase = createClient()

      // Normalize year, department, and section
      const normalizeYear = (year: string): string => {
        const yearMap: { [key: string]: string } = {
          '2nd Year': '2', '3rd Year': '3', '4th Year': '4',
          '2': '2', '3': '3', '4': '4'
        }
        return yearMap[year] || year
      }
      const normalizedYear = normalizeYear(year)
      const normalizedDept = dept.trim()
      const normalizedSection = section.trim()

      let query = supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name,
            created_at
          )
        `)
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)
        .order('scheduled_date', { ascending: true })

      if (peertutorsId) {
        query = query.eq('peer_tutor_id', peertutorsId)
      }

      const { data, error } = await query

      if (error) {
        logger.error('Error getting scheduled classes by date:', error)
        return []
      }

      return data || []
    } catch (error) {
      logger.error('Error in getScheduledClassesByDate:', error)
      return []
    }
  }

  /**
   * Get occupied dates for a specific dept/year/section
   */
  static async getOccupiedDates(dept: string, year: string, section: string): Promise<string[]> {
    try {
      const supabase = createClient()

      // Normalize year, department, and section
      const normalizeYear = (year: string): string => {
        const yearMap: { [key: string]: string } = {
          '2nd Year': '2', '3rd Year': '3', '4th Year': '4',
          '2': '2', '3': '3', '4': '4'
        }
        return yearMap[year] || year
      }
      const normalizedYear = normalizeYear(year)
      const normalizedDept = dept.trim()
      const normalizedSection = section.trim()

      const { data, error } = await supabase
        .from('scheduled_classes')
        .select('scheduled_date')
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)

      if (error) {
        logger.error('Error getting occupied dates:', error)
        return []
      }

      return data.map(item => item.scheduled_date).filter(Boolean)
    } catch (error) {
      logger.error('Error in getOccupiedDates:', error)
      return []
    }
  }

  /**
   * Check if a date is available for a specific dept/year/section
   */
  static async isDateAvailable(scheduledDate: string, dept: string, year: string, section: string, excludeScheduledClassId?: string): Promise<boolean> {
    try {
      const supabase = createClient()

      // Normalize year, department, and section
      const normalizeYear = (year: string): string => {
        const yearMap: { [key: string]: string } = {
          '2nd Year': '2', '3rd Year': '3', '4th Year': '4',
          '2': '2', '3': '3', '4': '4'
        }
        return yearMap[year] || year
      }
      const normalizedYear = normalizeYear(year)
      const normalizedDept = dept.trim()
      const normalizedSection = section.trim()

      let query = supabase
        .from('scheduled_classes')
        .select('id')
        .eq('scheduled_date', scheduledDate)
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)

      if (excludeScheduledClassId) {
        query = query.neq('id', excludeScheduledClassId)
      }

      const { data, error } = await query

      if (error) {
        logger.error('Error checking date availability:', error)
        return false
      }

      return data.length === 0
    } catch (error) {
      logger.error('Error in isDateAvailable:', error)
      return false
    }
  }

  /**
   * Get unique subjects that have scheduled classes for a specific dept/year/section
   */
  static async getUniqueSubjectsWithSchedules(dept: string, year: string, section: string): Promise<string[]> {
    try {
      const supabase = createClient()

      // Normalize year, department, and section
      const normalizeYear = (year: string): string => {
        const yearMap: { [key: string]: string } = {
          '2nd Year': '2', '3rd Year': '3', '4th Year': '4',
          '2': '2', '3': '3', '4': '4'
        }
        return yearMap[year] || year
      }
      const normalizedYear = normalizeYear(year)
      const normalizedDept = dept.trim()
      const normalizedSection = section.trim()

      const { data, error } = await supabase
        .from('scheduled_classes')
        .select(`
          class:classes!inner(
            subject_name
          )
        `)
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)

      if (error) {
        logger.error('Error getting unique subjects with schedules:', error)
        return []
      }

      // Get unique subject names
      const uniqueSubjects = [...new Set(data.map((item: { class: { subject_name: string } | { subject_name: string }[] }) => {
        const classData = Array.isArray(item.class) ? item.class[0] : item.class
        return classData?.subject_name
      }))].filter(Boolean)
      return uniqueSubjects
    } catch (error) {
      logger.error('Error in getUniqueSubjectsWithSchedules:', error)
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
        logger.error('Error getting all subjects:', error)
        return []
      }

      // Get unique subject names
      const uniqueSubjects = [...new Set(data.map(item => item.subject_name))]
      return uniqueSubjects
    } catch (error) {
      logger.error('Error in getAllSubjects:', error)
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
        logger.error('Error deleting scheduled class:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in deleteScheduledClass:', error)
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
        logger.error('Error updating scheduled class date:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in updateScheduledClassDate:', error)
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
        logger.error('Error getting scheduled class by ID:', error)
        return null
      }

      return data
    } catch (error) {
      logger.error('Error in getScheduledClassById:', error)
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
        logger.error('Error getting scheduled class by class_id:', error)
        return null
      }

      return data
    } catch (error) {
      logger.error('Error in getScheduledClassByClassId:', error)
      return null
    }
  }

  /**
   * Get all scheduled classes for a specific class_id
   */
  static async getAllScheduledClassesByClassId(classId: string): Promise<ScheduledClass[]> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('scheduled_classes')
        .select('*')
        .eq('class_id', classId)
        .order('scheduled_date', { ascending: true })

      if (error) {
        logger.error('Error getting all scheduled classes by class_id:', error)
        return []
      }

      return data || []
    } catch (error) {
      logger.error('Error in getAllScheduledClassesByClassId:', error)
      return []
    }
  }

  /**
   * Update details for a scheduled class (topics, timing, link)
   */
  static async updateScheduledClassDetails(
    scheduledClassId: string,
    data: {
      topics?: string,
      start_time?: string,
      end_time?: string,
      link?: string,
      class_id?: string
    }
  ): Promise<boolean> {
    try {
      const supabase = createClient()

      logger.info('updateScheduledClassDetails called with:', { scheduledClassId, data })

      // First, verify the scheduled class exists
      const { data: existingClass, error: checkError } = await supabase
        .from('scheduled_classes')
        .select('id, topics, start_time, end_time, link, peer_tutor_id')
        .eq('id', scheduledClassId)
        .maybeSingle()

      if (checkError) {
        logger.error('Error checking existing scheduled class:', checkError)
        return false
      }

      if (!existingClass) {
        logger.error('Scheduled class not found with ID:', scheduledClassId)
        return false
      }

      logger.info('Found existing scheduled class:', existingClass)

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString()
      }

      if (data.topics !== undefined) {
        updateData.topics = data.topics
        updateData.topics_completed = data.topics.trim().length > 0
      }
      if (data.start_time !== undefined) updateData.start_time = data.start_time
      if (data.end_time !== undefined) updateData.end_time = data.end_time
      if (data.link !== undefined) updateData.link = data.link
      if (data.class_id !== undefined) updateData.class_id = data.class_id

      logger.info('Updating with data:', updateData)

      const { data: result, error, count } = await supabase
        .from('scheduled_classes')
        .update(updateData)
        .eq('id', scheduledClassId)
        .select()

      if (error) {
        logger.error('Error updating scheduled class details:', error)
        return false
      }

      logger.info('Update result:', { result, count, rowsAffected: result?.length || 0 })

      if (!result || result.length === 0) {
        logger.error('Update succeeded but no rows were affected. Scheduled class ID may not exist or RLS policy blocking update.')
        return false
      }

      logger.info('Successfully updated scheduled class:', result[0])
      return true
    } catch (error) {
      logger.error('Error in updateScheduledClassDetails:', error)
      return false
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
        logger.error('Error updating scheduled class topics:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in updateScheduledClassTopics:', error)
      return false
    }
  }

  /**
   * Update image link for a scheduled class
   */
  static async updateScheduledClassImageLink(scheduledClassId: string, imageLink: string): Promise<boolean> {
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('scheduled_classes')
        .update({
          image_link: imageLink,
          updated_at: new Date().toISOString()
        })
        .eq('id', scheduledClassId)

      if (error) {
        logger.error('Error updating scheduled class image link:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in updateScheduledClassImageLink:', error)
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
        logger.error('Error updating scheduled class completion:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in updateScheduledClassCompletion:', error)
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
        logger.error('Error getting scheduled class completion:', error)
        return null
      }

      return data
    } catch (error) {
      logger.error('Error in getScheduledClassCompletion:', error)
      return null
    }
  }

  /**
   * Get peer tutor class status for faculty attendance monitoring
   */
  static async getpeertutorsClassStatus(dept: string, year: string, section: string, subject?: string): Promise<{
    completed: ScheduledClassWithDetails[]
    pending: ScheduledClassWithDetails[]
  }> {
    try {
      const supabase = createClient()

      // Normalize year, department, and section
      const normalizeYear = (year: string): string => {
        const yearMap: { [key: string]: string } = {
          '2nd Year': '2', '3rd Year': '3', '4th Year': '4',
          '2': '2', '3': '3', '4': '4'
        }
        return yearMap[year] || year
      }
      const normalizedYear = normalizeYear(year)
      const normalizedDept = dept.trim()
      const normalizedSection = section.trim()

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
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)
        .order('scheduled_date', { ascending: true })

      // Add subject filter if provided
      if (subject) {
        query = query.eq('class.subject_name', subject)
      }

      const { data, error } = await query

      logger.info('Query result for peer tutor class status:', { dept, year, section, subject }, 'Data count:', data?.length || 0)

      if (error) {
        logger.error('Error getting peer tutor class status:', error)
        logger.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        logger.error('Query filters:', { dept, year, section, subject })
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
      logger.error('Error in getpeertutorsClassStatus:', error)
      return { completed: [], pending: [] }
    }
  }

  /**
   * Get peer tutor class status with date filtering
   */
  static async getpeertutorsClassStatusWithDate(dept: string, year: string, section: string, dateFilter: string): Promise<{
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

      logger.info('Date filter processing:', {
        originalDateFilter: dateFilter,
        targetDate: targetDate.toISOString(),
        dateString: dateString
      })

      // Normalize year, department, and section
      const normalizeYear = (year: string): string => {
        const yearMap: { [key: string]: string } = {
          '2nd Year': '2', '3rd Year': '3', '4th Year': '4',
          '2': '2', '3': '3', '4': '4'
        }
        return yearMap[year] || year
      }
      const normalizedYear = normalizeYear(year)
      const normalizedDept = dept.trim()
      const normalizedSection = section.trim()

      // Get all scheduled classes for the specified filters
      const query = supabase
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
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)
        .eq('scheduled_date', dateString)
        .order('scheduled_date', { ascending: true })

      const { data, error } = await query

      logger.info('Query result for peer tutor class status with date:', { dept, year, section, dateFilter }, 'Data count:', data?.length || 0)

      if (error) {
        logger.error('Error getting peer tutor class status with date:', error)
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
      logger.error('Error in getpeertutorsClassStatusWithDate:', error)
      return { completed: [], pending: [] }
    }
  }

  /**
   * Get peer tutor class status by year only (all sections, all dates)
   */
  static async getpeertutorsClassStatusByYear(dept: string, year: string): Promise<{
    completed: ScheduledClassWithDetails[]
    pending: ScheduledClassWithDetails[]
  }> {
    try {
      const supabase = createClient()

      // Get all scheduled classes for the specified year
      const query = supabase
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

      logger.info('Query result for peer tutor class status by year:', { dept, year }, 'Data count:', data?.length || 0)

      if (error) {
        logger.error('Error getting peer tutor class status by year:', error)
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
      logger.error('Error in getpeertutorsClassStatusByYear:', error)
      return { completed: [], pending: [] }
    }
  }

  /**
   * Get peer tutor class status by year and date (all sections)
   */
  static async getpeertutorsClassStatusByYearAndDate(dept: string, year: string, dateFilter: string): Promise<{
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

      logger.info('Date filter processing (year+date):', {
        originalDateFilter: dateFilter,
        targetDate: targetDate.toISOString(),
        dateString: dateString
      })

      // Get all scheduled classes for the specified year and date
      const query = supabase
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

      logger.info('Query result for peer tutor class status by year and date:', { dept, year, dateFilter }, 'Data count:', data?.length || 0)

      if (error) {
        logger.error('Error getting peer tutor class status by year and date:', error)
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
      logger.error('Error in getpeertutorsClassStatusByYearAndDate:', error)
      return { completed: [], pending: [] }
    }
  }

  /**
   * Get all classes for a department (when no filters are selected)
   */
  static async getAllClassesForDepartment(dept: string): Promise<{ completed: ScheduledClassWithDetails[], pending: ScheduledClassWithDetails[] }> {
    try {
      const supabase = createClient()

      logger.info('Getting all classes for department:', dept)

      // Validate department parameter
      if (!dept || typeof dept !== 'string' || dept.trim() === '') {
        logger.error('Invalid department parameter:', dept)
        return { completed: [], pending: [] }
      }

      // First, get all scheduled classes for the department
      const { data: scheduledClasses, error: scheduledError } = await supabase
        .from('scheduled_classes')
        .select('*')
        .eq('dept', dept.trim())
        .order('scheduled_date', { ascending: false })

      if (scheduledError) {
        logger.error('Error getting scheduled classes for department:', scheduledError)
        logger.error('Error details:', {
          message: scheduledError.message || 'Unknown error',
          details: scheduledError.details || 'No details available',
          hint: scheduledError.hint || 'No hint available',
          code: scheduledError.code || 'No code available'
        })

        // Check if it's a table not found error
        if (scheduledError.code === '42P01' || scheduledError.message?.includes('relation') || scheduledError.message?.includes('does not exist')) {
          logger.error('Table "scheduled_classes" may not exist or be accessible')
        }

        return { completed: [], pending: [] }
      }

      if (!scheduledClasses || scheduledClasses.length === 0) {
        logger.info('No scheduled classes found for department:', dept)
        return { completed: [], pending: [] }
      }

      logger.info('Found scheduled classes:', scheduledClasses.length)

      // Get unique class IDs and peer tutor IDs
      const classIds = [...new Set(scheduledClasses.map(sc => sc.class_id))]
      const peertutorsIds = [...new Set(scheduledClasses.map(sc => sc.peer_tutor_id))]

      // Get class details
      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('id, subject_name, dept, year, section, created_at')
        .in('id', classIds)

      if (classesError) {
        logger.error('Error getting class details:', classesError)
        return { completed: [], pending: [] }
      }

      // Get peer tutor details
      const { data: peerTutor, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('id, name, email')
        .in('id', peertutorsIds)

      if (tutorsError) {
        logger.error('Error getting peer tutor details:', tutorsError)
        return { completed: [], pending: [] }
      }

      // Create lookup maps
      const classMap = new Map(classes?.map(c => [c.id, c]) || [])
      const tutorMap = new Map(peerTutor?.map(t => [t.id, t]) || [])

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

      const relevantClasses = enrichedClasses

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

      logger.info('Processed classes - Completed:', completed.length, 'Pending:', pending.length)
      return { completed, pending }
    } catch (error) {
      logger.error('Error in getAllClassesForDepartment:', error)
      logger.error('Error type:', typeof error)
      logger.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
      logger.error('Department parameter:', dept)
      return { completed: [], pending: [] }
    }
  }

  /**
   * Get class statistics for a specific peer tutor
   * Only counts classes from the day after the peer tutor was created
   */
  static async getpeertutorsClassStats(peertutorsId: string): Promise<{
    totalClasses: number
    completedClasses: number
    pendingClasses: number
    upcomingClasses: number
    overdueClasses: number
  }> {
    try {
      const supabase = createClient()

      // Get all scheduled classes for this peer tutor
      const { data: scheduledClasses, error } = await supabase
        .from('scheduled_classes')
        .select('*')
        .eq('peer_tutor_id', peertutorsId)

      if (error) {
        logger.error('Error getting peer tutor class stats:', error)
        return { totalClasses: 0, completedClasses: 0, pendingClasses: 0, upcomingClasses: 0, overdueClasses: 0 }
      }

      if (!scheduledClasses || scheduledClasses.length === 0) {
        return { totalClasses: 0, completedClasses: 0, pendingClasses: 0, upcomingClasses: 0, overdueClasses: 0 }
      }

      // Total classes allocated should include ALL scheduled classes (past, present, and future)
      // from the day after the peer tutor was created
      const totalClasses = scheduledClasses.length

      // For completed/pending counts, we consider all classes assigned to the tutor (past, present, and future)
      const relevantClasses = scheduledClasses

      // Count completed and pending classes
      const scheduledCompletedClasses = relevantClasses.filter(cls => {
        return cls.completion_status === 'completed' ||
          (cls.attendance_completed && cls.topics_completed) ||
          (cls.completion_status === 'pending' && cls.attendance_completed && cls.topics_completed)
      }).length

      // Total completed classes = scheduled completed only (excluding additional classes for dashboard cards)
      const completedClasses = scheduledCompletedClasses

      const pendingClassesList = relevantClasses.filter(cls => {
        return (cls.completion_status === 'pending' && !(cls.attendance_completed && cls.topics_completed)) ||
          cls.completion_status === 'not_started' ||
          (!cls.completion_status && !(cls.attendance_completed && cls.topics_completed))
      })

      const pendingClasses = pendingClassesList.length

      // Calculate Upcoming and Overdue (User's definition of "Pending")
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      let upcomingClasses = 0
      let overdueClasses = 0

      pendingClassesList.forEach(cls => {
        if (!cls.scheduled_date) {
          overdueClasses++ // Default to overdue if no date? or ignore? treating as overdue/pending seems safer
          return
        }

        const classDate = new Date(cls.scheduled_date)
        classDate.setHours(0, 0, 0, 0)

        // User rule: 
        // Upcoming = scheduled_date > today (Tomorrow onwards)
        // Pending (Overdue) = scheduled_date <= today (Today or Past)

        if (classDate.getTime() >= today.getTime()) {
          upcomingClasses++
        } else {
          overdueClasses++
        }
      })

      return {
        totalClasses, // Include all classes (past, present, future)
        completedClasses,
        pendingClasses, // Existing Total Pending
        upcomingClasses, // New Split: Upcoming
        overdueClasses   // New Split: Pending/Overdue
      }
    } catch (error) {
      logger.error('Error in getpeertutorsClassStats:', error)
      return { totalClasses: 0, completedClasses: 0, pendingClasses: 0, upcomingClasses: 0, overdueClasses: 0 }
    }
  }

  /**
   * Get scheduled class count for a specific class
   */
  static async getScheduledClassCount(classId: string): Promise<number> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('scheduled_classes')
        .select('id')
        .eq('class_id', classId)

      if (error) {
        logger.error('Error getting scheduled class count:', error)
        return 0
      }

      return data?.length || 0
    } catch (error) {
      logger.error('Error in getScheduledClassCount:', error)
      return 0
    }
  }

  /**
   * Get scheduled class counts for all classes in a single query
   * Returns a map of class_id -> count
   */
  static async getAllScheduledClassCounts(): Promise<Record<string, number>> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('scheduled_classes')
        .select('class_id')

      if (error) {
        logger.error('Error getting all scheduled class counts:', error)
        return {}
      }

      if (!data) return {}

      // Aggregate counts by class_id
      const counts: Record<string, number> = {}
      data.forEach(item => {
        counts[item.class_id] = (counts[item.class_id] || 0) + 1
      })

      return counts
    } catch (error) {
      logger.error('Error in getAllScheduledClassCounts:', error)
      return {}
    }
  }

  /**
   * Get all peer tutors allocated to a specific scheduled class
   */
  static async getpeerTutorForScheduledClass(classId: string, dept: string, year: string, section: string): Promise<{
    id: string
    name: string
    email: string
  }[]> {
    try {
      const supabase = createClient()

      // Normalize year, department, and section
      const normalizeYear = (year: string): string => {
        const yearMap: { [key: string]: string } = {
          '2nd Year': '2', '3rd Year': '3', '4th Year': '4',
          '2': '2', '3': '3', '4': '4'
        }
        return yearMap[year] || year
      }
      const normalizedYear = normalizeYear(year)
      const normalizedDept = dept.trim()
      const normalizedSection = section.trim()

      // Get all scheduled classes for this class_id, dept, year, section
      const { data: scheduledClasses, error } = await supabase
        .from('scheduled_classes')
        .select(`
          peer_tutor_id,
          peer_tutor:peer_tutors!inner(
            id,
            name,
            email
          )
        `)
        .eq('class_id', classId)
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)

      if (error) {
        logger.error('Error getting peer tutors for scheduled class:', error)
        return []
      }

      // Extract unique peer tutors
      // Extract unique peer tutors
      const peerTutor = (scheduledClasses || []).map((sc: { peer_tutor: { id: string, name: string, email: string } | { id: string, name: string, email: string }[] }) => {
        return Array.isArray(sc.peer_tutor) ? sc.peer_tutor[0] : sc.peer_tutor
      }).filter(Boolean)

      // Remove duplicates based on ID
      const uniquepeerTutor = peerTutor.filter((tutor: { id: string }, index: number, self: { id: string }[]) =>
        index === self.findIndex((t) => t.id === tutor.id)
      )

      return uniquepeerTutor
    } catch (error) {
      logger.error('Error in getpeerTutorForScheduledClass:', error)
      return []
    }
  }

}
