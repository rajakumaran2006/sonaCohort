import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MicrosoftGraphService } from '../auth/microsoftGraph'
export interface FacultyDepartment {
  id: string
  name: string
  faculty_name: string
  faculty_email: string
  created_at: string
  admin_email?: string
  is_class_link_mandatory?: boolean
  enable_email_notifications?: boolean
  enable_daily_reminders?: boolean
  enable_pending_reminders?: boolean
  pending_class_threshold?: number
  exclude_additional_classes?: boolean
  morning_reminder_time?: string
  morning_reminder_message?: string
  pending_warning_message?: string
  last_daily_reminder_date?: string
  academic_year?: string
  semester_type?: 'odd' | 'even' | null
}
export interface FacultyAllocation {
  id: string
  faculty_name: string
  faculty_email: string
  faculty_id: string
  dept: string
  year: string
  section: string
  subject_name: string
  created_at: string
}

export interface FacultyDashboardStat extends FacultyAllocation {
  peerTutorsCount: number
  completionPercentage: number
}

export interface FacultySummary {
  name: string
  email: string
  subjects: string[]
  totalClasses: number
  assignments: FacultyAllocation[]
}

export class FacultyService {
  /**
   * Update faculty department settings
   * @param facultyId Faculty Department ID
   * @param settings Settings to update
   */
  static async updateFacultySettings(facultyId: string, settings: Partial<FacultyDepartment>): Promise<boolean> {
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('departments')
        .update(settings)
        .eq('id', facultyId)

      if (error) {
        logger.error('Error updating faculty settings:', JSON.stringify(error, null, 2))
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in updateFacultySettings:', error)
      return false
    }
  }
  /**
   * Verify if a faculty member's email matches a department record
   * @param email Faculty member's email from Microsoft authentication
   * @param supabaseClient Optional Supabase client instance (for server-side usage)
   * @returns Department information if verified, null otherwise
   */
  static async verifyFacultyAccess(email: string, supabaseClient?: SupabaseClient): Promise<FacultyDepartment | null> {
    try {
      if (!email || email.trim() === '') {
        logger.info('No email provided for faculty verification')
        return null
      }

      const supabase = supabaseClient || createClient()
      const normalizedEmail = email.trim().toLowerCase()

      // First, check if the departments table exists and is accessible
      try {
        const { error } = await supabase
          .from('departments')
          .select('id')
          .limit(1)

        if (error) {
          logger.info('Departments table not accessible:', error.message)
          logger.info('Full error object:', error)
          return null
        }

        logger.info('Departments table is accessible, proceeding with faculty verification')
      } catch (tableError) {
        logger.info('Departments table check failed:', tableError)
        return null
      }

      // Query the departments table to find a match (case-insensitive, trimmed)
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .ilike('faculty_email', normalizedEmail)
        .maybeSingle() // Use maybeSingle to avoid errors when no record found

      if (error) {
        logger.error('Error verifying faculty access:', error)
        // Log the error details for debugging
        logger.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        return null
      }

      if (data) {
        logger.info('Faculty access verified for department:', data.name, 'for email:', normalizedEmail)
        return data as FacultyDepartment
      }

      logger.info('No department found for email (normalized):', normalizedEmail)

      // Fallback: fetch potential matches and compare after trimming/lowercasing
      const { data: candidates, error: fallbackError } = await supabase
        .from('departments')
        .select('id, name, faculty_email')
        .ilike('faculty_email', `%${normalizedEmail}%`)

      if (fallbackError) {
        logger.info('Fallback email search failed:', fallbackError)
        return null
      }

      if (candidates && candidates.length > 0) {
        const match = (candidates as Array<{ id: string; name: string; faculty_email: string }>).find(c => {
          const stored = (c.faculty_email || '').toLowerCase().replace(/\s+/g, '').trim()
          const incoming = normalizedEmail.replace(/\s+/g, '').trim()
          return stored === incoming
        })

        if (match) {
          logger.info('Faculty access verified via fallback for department:', match.name, 'stored email:', match.faculty_email)
          return match as unknown as FacultyDepartment
        }

        logger.info('Fallback search found candidates but none matched after normalization:', candidates.map(c => c.faculty_email))
      }

      return null
    } catch (error) {
      logger.error('Error in verifyFacultyAccess:', error)
      return null
    }
  }

  /**
   * Get faculty member's department information
   * @param facultyId Faculty member's ID
   * @returns Department information
   */
  static async getFacultyDepartment(facultyId: string): Promise<FacultyDepartment | null> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('id', facultyId)
        .single()

      if (error) {
        logger.error('Error getting faculty department:', JSON.stringify(error, null, 2))
        logger.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        })
        return null
      }

      return data as FacultyDepartment
    } catch (error) {
      logger.error('Error in getFacultyDepartment:', error)
      return null
    }
  }

  /**
   * Get faculty department by name (case-insensitive)
   * @param deptName Department Name
   * @returns Department information
   */
  static async getFacultyDepartmentByName(deptName: string): Promise<FacultyDepartment | null> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .ilike('name', deptName.trim())
        .maybeSingle()

      if (error) {
        logger.error('Error getting faculty department by name:', error)
        return null
      }

      return data as FacultyDepartment
    } catch (error) {
      logger.error('Error in getFacultyDepartmentByName:', error)
      return null
    }
  }

  /**
   * Get all departments for overview purposes
   * @returns List of all departments
   */
  static async getAllDepartments(): Promise<FacultyDepartment[]> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name')

      if (error) {
        logger.error('Error getting all departments:', error)
        return []
      }

      return data as FacultyDepartment[] || []
    } catch (error) {
      logger.error('Error in getAllDepartments:', error)
      return []
    }
  }

  /**
   * Check if user has faculty access based on email
   * @param email User's email
   * @returns True if user has faculty access, false otherwise
   */
  static async hasFacultyAccess(email: string): Promise<boolean> {
    try {
      const department = await this.verifyFacultyAccess(email)
      if (department) return true

      // Also check individual faculty allocations
      return await this.isFacultyMember(email)
    } catch (error) {
      logger.error('Error checking faculty access:', error)
      return false
    }
  }

  /**
   * Check if user is an individual faculty member (in faculty_allocations)
   * @param email User's email
   */
  static async isFacultyMember(email: string, supabaseClient?: SupabaseClient): Promise<boolean> {
    try {
      const supabase = supabaseClient || createClient()

      const { data, error } = await supabase
        .from('faculty_allocations')
        .select('id')
        .ilike('faculty_email', email.trim())
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') {
        logger.error('Error checking individual faculty status:', error)
        return false
      }

      return !!data
    } catch (error) {
      logger.error('Error in isFacultyMember:', error)
      return false
    }
  }

  /**
   * Get assignments for an individual faculty member
   * @param email User's email
   */
  static async getIndividualAssignments(email: string): Promise<FacultyAllocation[]> {
    try {
      const supabase = createClient()

      // Use ilike for case-insensitive email matching
      const { data, error } = await supabase
        .from('faculty_allocations')
        .select('*')
        .ilike('faculty_email', email.trim())

      if (error) {
        logger.error('Error fetching faculty assignments:', error)
        return []
      }

      return (data as FacultyAllocation[]) || []
    } catch (error) {
      logger.error('Error in getIndividualAssignments:', error)
      return []
    }
  }

  /**
   * Get dashboard statistics for a faculty member
   * Returns assignments with peer tutor count and completion percentage
   */
  static async getDashboardStats(email: string): Promise<FacultyDashboardStat[]> {
    try {
      const supabase = createClient()
      const assignments = await this.getIndividualAssignments(email)

      if (!assignments.length) return []

      // For each assignment, fetch stats from scheduled_classes
      const statsPromises = assignments.map(async (assignment) => {
        // Query scheduled_classes for this specific assignment (subject, dept, year, section)
        // We use the faculty_id if available, but filtering by subject/section is safer given the data model
        const { data: classes, error } = await supabase
          .from('scheduled_classes')
          .select(`
            peer_tutor_id, 
            completion_status, 
            attendance_completed, 
            topics_completed,
            class:classes!inner(subject_name)
          `)
          .eq('dept', assignment.dept)
          .eq('year', assignment.year)
          .eq('section', assignment.section)
          .eq('classes.subject_name', assignment.subject_name)

        if (error) {
          logger.error(`Error fetching stats for ${assignment.subject_name}:`, error)
          logger.error(`Detailed error for ${assignment.subject_name}:`, {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            assignment: {
              dept: assignment.dept,
              year: assignment.year,
              section: assignment.section,
              subject: assignment.subject_name
            }
          })
          return {
            ...assignment,
            peerTutorsCount: 0,
            completionPercentage: 0
          }
        }

        const uniqueTutors = new Set(classes.map(c => c.peer_tutor_id).filter(Boolean))
        const totalClasses = classes.length
        const completedClasses = classes.filter(c =>
          c.completion_status === 'completed' ||
          (c.attendance_completed && c.topics_completed)
        ).length

        const completionPercentage = totalClasses > 0
          ? Math.round((completedClasses / totalClasses) * 100)
          : 0

        return {
          ...assignment,
          peerTutorsCount: uniqueTutors.size,
          completionPercentage
        }
      })

      return await Promise.all(statsPromises)
    } catch (error) {
      logger.error('Error in getDashboardStats:', error)
      return []
    }
  }

  /**
   * Search available users for faculty assignment (Microsoft Graph)
   */
  static async searchAvailableUsers(query: string): Promise<import('@/lib/types').MicrosoftUser[]> {
    try {
      return await MicrosoftGraphService.searchUsers(query)
    } catch (error) {
      logger.error('Error searching users:', error)
      return []
    }
  }

  /**
   * Get all faculty members (Incharge view)
   */
  /**
  * Get all faculty members (Incharge view)
  */
  /**
   * Get a specific faculty allocation by ID
   * @param allocationId Allocation ID
   */
  static async getFacultyAllocationById(allocationId: string): Promise<FacultyAllocation | null> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('faculty_allocations')
        .select('*')
        .eq('id', allocationId)
        .single()

      if (error) {
        logger.error('Error fetching faculty allocation:', error)
        return null
      }

      return data as FacultyAllocation
    } catch (error) {
      logger.error('Error in getFacultyAllocationById:', error)
      return null
    }
  }



  static async getAllFaculty(deptName?: string): Promise<FacultySummary[]> {
    try {
      const supabase = createClient()

      let query = supabase
        .from('faculty_allocations')
        .select('*')

      // Filter by department if provided
      if (deptName) {
        query = query.eq('dept', deptName)
      }

      const { data, error } = await query

      if (error) {
        logger.error('Error getting all faculty:', error)
        return []
      }

      if (!data) return []

      // Aggregate data by faculty_email
      const facultyMap = new Map<string, {
        name: string
        email: string
        subjects: Set<string>
        totalClasses: number
        assignments: FacultyAllocation[]
      }>()

      data.forEach((allocation: FacultyAllocation) => {
        const email = allocation.faculty_email
        if (!facultyMap.has(email)) {
          facultyMap.set(email, {
            name: allocation.faculty_name,
            email: allocation.faculty_email,
            subjects: new Set(),
            totalClasses: 0,
            assignments: []
          })
        }

        const faculty = facultyMap.get(email)!
        faculty.subjects.add(allocation.subject_name)
        faculty.totalClasses++
        faculty.assignments.push(allocation)
      })

      // Convert map to array and format for UI
      return Array.from(facultyMap.values()).map(f => ({
        name: f.name,
        email: f.email,
        subjects: Array.from(f.subjects),
        totalClasses: f.totalClasses,
        assignments: f.assignments
      }))
    } catch (error) {
      logger.error('Error in getAllFaculty:', error)
      return []
    }
  }

  /**
    * Assign faculty to classes/sections
    */

  static async assignFaculty(data: {
    user: import('@/lib/types').MicrosoftUser
    dept: string
    assignments: {
      year: string
      section: string
      subjects: string[]
    }[]
  }): Promise<boolean> {
    try {
      const supabase = createClient()
      logger.info('Assigning faculty:', data)

      const recordsToInsert = []

      for (const assignment of data.assignments) {
        for (const subject of assignment.subjects) {
          recordsToInsert.push({
            faculty_name: data.user.displayName || data.user.givenName || 'Unknown Faculty',
            faculty_email: data.user.mail || data.user.userPrincipalName,
            faculty_id: data.user.id,
            dept: data.dept, // Use actual department from input
            year: assignment.year,
            section: assignment.section,
            subject_name: subject,
            created_at: new Date().toISOString()
          })
        }
      }

      if (recordsToInsert.length === 0) {
        logger.warn('No assignments to insert')
        return true
      }

      const { error } = await supabase
        .from('faculty_allocations')
        .insert(recordsToInsert)

      if (error) {
        logger.error('Error inserting faculty allocations:', error)
        return false
      }

      logger.info(`Successfully assigned ${recordsToInsert.length} allocations for ${data.user.displayName}`)
      return true
    } catch (e) {
      logger.error('Error assigning faculty:', e)
      return false
    }
  }

  /**
   * Delete faculty members (remove all their allocations)
   * @param emails List of faculty emails to delete
   */
  static async deleteFaculty(emails: string[]): Promise<boolean> {
    try {
      if (!emails || emails.length === 0) return true

      const supabase = createClient()

      logger.info('Attempting to delete faculty allocations for emails:', emails)

      const { error, count } = await supabase
        .from('faculty_allocations')
        .delete({ count: 'exact' })
        .in('faculty_email', emails)

      if (error) {
        logger.error('Error deleting faculty:', error)
        return false
      }

      logger.info(`Successfully deleted ${count} faculty allocation records`)
      return true
    } catch (error) {
      logger.error('Error in deleteFaculty:', error)
      return false
    }
  }

  /**
   * Delete a specific faculty allocation
   * @param id Allocation ID
   */
  static async deleteFacultyAllocation(id: string): Promise<boolean> {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('faculty_allocations')
        .delete()
        .eq('id', id)

      if (error) {
        logger.error('Error deleting faculty allocation:', error)
        return false
      }
      return true
    } catch (error) {
      logger.error('Error in deleteFacultyAllocation:', error)
      return false
    }
  }

  /**
   * Update a specific faculty allocation
   * @param id Allocation ID
   * @param updates Partial updates
   */
  static async updateFacultyAllocation(id: string, updates: Partial<FacultyAllocation>): Promise<boolean> {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('faculty_allocations')
        .update(updates)
        .eq('id', id)

      if (error) {
        logger.error('Error updating faculty allocation:', error)
        return false
      }
      return true
    } catch (error) {
      logger.error('Error in updateFacultyAllocation:', error)
      return false
    }
  }

  /**
   * Create a new faculty allocation
   * @param allocation Allocation data
   */
  static async createFacultyAllocation(allocation: Omit<FacultyAllocation, 'id' | 'created_at'>): Promise<FacultyAllocation | null> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('faculty_allocations')
        .insert({
          ...allocation,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        logger.error('Error creating faculty allocation:', error)
        return null
      }
      return data as FacultyAllocation
    } catch (error) {
      logger.error('Error in createFacultyAllocation:', error)
      return null
    }
  }


  /**
   * Get all valid emails for a department (Peer Tutors and Students)
   * @param deptName Department ID
   * @param supabaseClient Optional Supabase client (for server-side usage)
   * @returns List of valid emails
   */
  static async getAllDepartmentEmails(deptName: string, supabaseClient?: SupabaseClient): Promise<string[]> {
    try {
      const supabase = supabaseClient || createClient()
      const emails = new Set<string>()

      // 1. Get all peer tutors for the department
      const { data: peerTutors, error: ptError } = await supabase
        .from('peer_tutors')
        .select('email')
        .eq('dept', deptName)

      if (ptError) {
        logger.error('Error fetching peer tutor emails:', ptError)
      } else if (peerTutors) {
        peerTutors.forEach(pt => {
          if (pt.email) emails.add(pt.email.toLowerCase().trim())
        })
      }

      // 2. Get all students for the department
      const { data: students, error: sError } = await supabase
        .from('peer_students')
        .select('email')
        .eq('dept', deptName)

      if (sError) {
        logger.error('Error fetching student emails:', sError)
      } else if (students) {
        students.forEach(s => {
          if (s.email) emails.add(s.email.toLowerCase().trim())
        })
      }

      return Array.from(emails)
    } catch (error) {
      logger.error('Error in getAllDepartmentEmails:', error)
      return []
    }
  }
}

