import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { MicrosoftGraphService } from '../auth/microsoftGraph'
import { MicrosoftUser } from '@/lib/types'

export interface peertutors {
  id: string
  name: string
  email: string
  faculty_id: string
  dept: string
  year: string
  section: string
  created_at: string
  assigned_by: string
}

export interface peertutorsAssignment {
  name: string
  email: string | null
  faculty_id: string
  dept: string
  year: string
  section: string
  assigned_by: string
  is_manual_entry?: boolean
}

export class peertutorservice {
  /**
   * Create a peer tutor from Microsoft Graph user data
   */
  static async createFromMicrosoftUser(
    microsoftUser: MicrosoftUser,
    facultyId: string,
    dept: string,
    year: string,
    section: string
  ): Promise<peertutors | null> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('peer_tutors')
        .insert({
          name: microsoftUser.displayName,
          email: microsoftUser.mail || microsoftUser.userPrincipalName,
          faculty_id: facultyId,
          dept,
          year,
          section,
          assigned_by: facultyId
        })
        .select()
        .single()

      if (error) {
        logger.error('Error creating peer tutor from Microsoft user:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          fullError: JSON.stringify(error, null, 2)
        })
        return null
      }

      // After successfully creating the peer tutor, assign them to future scheduled classes
      // Pass the peer tutor ID and creation date to correctly filter classes
      const assignmentResult = await this.assignNewTutorToFutureClasses(
        dept,
        year,
        section,
        data.id,
        data.created_at
      )

      if (!assignmentResult) {
        logger.warn('Failed to assign new peer tutor to future classes, but peer tutor was created successfully. The peer tutor will not be automatically assigned to future scheduled classes and will need to be manually assigned.')
      }

      return data as peertutors
    } catch (error) {
      logger.error('Error in createFromMicrosoftUser:', error)
      return null
    }
  }

  /**
   * Get all peer tutors for a specific department, year, and section
   */
  static async getpeerTutorBySection(dept: string, year: string, section: string): Promise<peertutors[]> {
    try {
      const supabase = createClient()

      // Sanitize inputs to ensure better matching
      // e.g. "Year 2" -> "2", "Sec B" -> "B", "Section A" -> "A"
      const cleanYear = year?.toString().replace(/year/gi, '').trim() || ''
      const cleanSection = section?.toString().replace(/sec(tion)?\.?/gi, '').trim() || ''



      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .ilike('dept', `%${dept}%`)
        .ilike('year', `%${cleanYear}%`)
        .ilike('section', `%${cleanSection}%`)
        .order('name')

      if (error) {
        logger.error('Error getting peer tutors by section:', error)
        return []
      }

      return data as peertutors[] || []
    } catch (error) {
      logger.error('Error in getpeerTutorBySection:', error)
      return []
    }
  }

  /**
   * Get all peer tutors across all departments
   */
  static async getAllpeerTutor(facultyId?: string): Promise<peertutors[]> {
    try {
      const supabase = createClient()

      let query = supabase
        .from('peer_tutors')
        .select('*')
        .order('dept, year, section, name')

      if (facultyId) {
        query = query.eq('faculty_id', facultyId)
      }

      const { data, error } = await query

      if (error) {
        logger.error('Error getting all peer tutors:', error)
        return []
      }

      return data as peertutors[] || []
    } catch (error) {
      logger.error('Error in getAllpeerTutor:', error)
      return []
    }
  }

  /**
   * Get all peer tutors for a specific department
   */
  static async getpeerTutorByDepartment(dept: string): Promise<peertutors[]> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('dept', dept)
        .order('year, section, name')

      if (error) {
        logger.error('Error getting peer tutors by department:', error)
        return []
      }

      return data as peertutors[] || []
    } catch (error) {
      logger.error('Error in getpeerTutorByDepartment:', error)
      return []
    }
  }

  /**
   * Get peer tutors by years (array of years)
   */
  static async getpeerTutorByYears(years: string[]): Promise<peertutors[]> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .in('year', years)
        .order('year, section, name')

      if (error) {
        logger.error('Error getting peer tutors by years:', error)
        return []
      }

      return data as peertutors[] || []
    } catch (error) {
      logger.error('Error in getpeerTutorByYears:', error)
      return []
    }
  }

  /**
   * Check if a student is already a peer tutor
   */
  static async isAlreadypeertutors(email: string): Promise<boolean> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('peer_tutors')
        .select('id')
        .eq('email', email)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error('Error checking if student is peer tutor:', error)
        return false
      }

      return !!data
    } catch (error) {
      logger.error('Error in isAlreadypeertutors:', error)
      return false
    }
  }

  /**
   * Get peer tutor by email with full details
   */
  static async getPeerTutorByEmail(email: string): Promise<peertutors | null> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('email', email)
        .single()

      if (error) {
        if (error.code !== 'PGRST116') { // PGRST116 = no rows returned
          logger.error('Error getting peer tutor by email:', error)
        }
        return null
      }

      return data as peertutors
    } catch (error) {
      logger.error('Error in getPeerTutorByEmail:', error)
      return null
    }
  }

  /**
   * Assign a new peer tutor
   */
  static async assignpeertutors(assignment: peertutorsAssignment): Promise<{ success: boolean; error?: string; data?: { id: string } }> {
    try {
      const supabase = createClient()

      // First, check if this email is already a peer tutor ANYWHERE (any dept/year/section)
      // Only perform email checks if email is provided
      if (assignment.email) {
        const existingPeerTutor = await this.getPeerTutorByEmail(assignment.email)
        
        if (existingPeerTutor) {
          // Check if it's in the SAME section trying to add to
          if (existingPeerTutor.dept === assignment.dept && 
              existingPeerTutor.year === assignment.year && 
              existingPeerTutor.section === assignment.section) {
            return { 
              success: false, 
              error: `${assignment.name} is already a peer tutor in ${assignment.dept} Year ${assignment.year} Section ${assignment.section}` 
            }
          } else {
            // Exists in a DIFFERENT section
            return { 
              success: false, 
              error: `${assignment.name} already exists as peer tutor in ${existingPeerTutor.dept} Year ${existingPeerTutor.year} Section ${existingPeerTutor.section}` 
            }
          }
        }

        // Also check if this email is already a student
        const { data: existingStudent, error: studentCheckError } = await supabase
          .from('peer_students')
          .select('id, name, dept, year, section')
          .eq('email', assignment.email)
          .maybeSingle()

        if (studentCheckError) {
          logger.error('Error checking for existing student:', studentCheckError)
        }

        if (existingStudent) {
          return { 
            success: false, 
            error: `${assignment.name} already exists as student in ${existingStudent.dept} Year ${existingStudent.year} Section ${existingStudent.section}` 
          }
        }
      }

      // Insert the new peer tutor
      const { data: insertedData, error: insertError } = await supabase
        .from('peer_tutors')
        .insert([{
          name: assignment.name,
          email: assignment.email,
          faculty_id: assignment.faculty_id,
          dept: assignment.dept,
          year: assignment.year,
          section: assignment.section,
          assigned_by: assignment.assigned_by,
          is_manual_entry: assignment.is_manual_entry
        }])
        .select('id, created_at')
        .single()

      if (insertError) {
        logger.error('Error inserting peer tutor:', {
          error: insertError,
          message: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
          assignment
        })
        
        // Check for specific error codes
        if (insertError.code === '23505') {
          return { success: false, error: 'This user is already a peer tutor in this section' }
        }
        
        return { success: false, error: `Failed to add peer tutor: ${insertError.message}` }
      }

      if (!insertedData) {
        logger.error('No data returned after insert:', { assignment })
        return { success: false, error: 'Failed to create peer tutor record' }
      }

      logger.info('Successfully created peer tutor:', {
        id: insertedData.id,
        name: assignment.name,
        email: assignment.email,
        dept: assignment.dept,
        year: assignment.year,
        section: assignment.section
      })

      // After successfully creating the peer tutor, assign them to future scheduled classes
      // Pass the peer tutor ID and creation date to correctly filter classes
      const assignmentResult = await this.assignNewTutorToFutureClasses(
        assignment.dept,
        assignment.year,
        assignment.section,
        insertedData.id,
        insertedData.created_at
      )

      if (!assignmentResult) {
        logger.warn('Failed to assign new peer tutor to future classes, but peer tutor was created successfully. The peer tutor will not be automatically assigned to future scheduled classes and will need to be manually assigned.')
      }

      return { success: true, data: { id: insertedData.id } }
    } catch (error) {
      logger.error('Unexpected error in assignpeertutors:', {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        assignment
      })
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }
    }
  }

  /**
   * Remove a peer tutor and unassign related students (students and their attendance remain intact)
   */
  static async removepeertutors(id: string,
    _forceDelete: boolean = false): Promise<{ success: boolean; message: string }> {
    try {
      const supabase = createClient()

      // logger.info(`Starting peer tutor removal for: ${id}`)
      const deletedRecords: string[] = []

      // 1. Check if there are any students assigned to this peer tutor
      const { data: assignedStudents, error: checkError } = await supabase
        .from('peer_students')
        .select('id, name')
        .eq('assigned_peer_tutor_id', id)

      if (checkError) {
        logger.error('Error checking assigned students:', checkError)
        return { success: false, message: 'Failed to check assigned students' }
      }

      // 2. Unassign students (set assigned_peer_tutor_id to null) - keep student data and attendance intact
      if (assignedStudents && assignedStudents.length > 0) {
        const { error: unassignError } = await supabase
          .from('peer_students')
          .update({ assigned_peer_tutor_id: null })
          .eq('assigned_peer_tutor_id', id)

        if (unassignError) {
          logger.error('Error unassigning students:', unassignError)
          return {
            success: false,
            message: `Failed to unassign students: ${unassignError.message || 'Unknown error'}`
          }
        }
        deletedRecords.push(`${assignedStudents.length} students unassigned`)
      }

      // 3. Delete scheduled classes for this peer tutor
      const { data: scheduledClassesData, error: scheduledClassesError } = await supabase
        .from('scheduled_classes')
        .delete()
        .eq('peer_tutor_id', id)
        .select()

      if (scheduledClassesError) {
        logger.error('Error deleting scheduled classes:', scheduledClassesError)
        return { success: false, message: `Failed to delete scheduled classes: ${scheduledClassesError.message}` }
      } else if (scheduledClassesData && scheduledClassesData.length > 0) {
        deletedRecords.push(`${scheduledClassesData.length} scheduled classes`)
      }

      // 4. Delete additional classes
      const { data: additionalClassesData, error: additionalClassesError } = await supabase
        .from('additional_classes')
        .delete()
        .eq('peer_tutor_id', id)
        .select()

      if (additionalClassesError) {
        logger.error('Error deleting additional classes:', additionalClassesError)
        return { success: false, message: `Failed to delete additional classes: ${additionalClassesError.message}` }
      } else if (additionalClassesData && additionalClassesData.length > 0) {
        deletedRecords.push(`${additionalClassesData.length} additional classes`)
      }

      // 5. Delete renumeration records
      const { data: renumerationData, error: renumerationError } = await supabase
        .from('peer_tutor_renumerations')
        .delete()
        .eq('peer_tutor_id', id)
        .select()

      if (renumerationError) {
        logger.error('Error deleting renumeration records:', renumerationError)
        return { success: false, message: `Failed to delete renumeration records: ${renumerationError.message}` }
      } else if (renumerationData && renumerationData.length > 0) {
        deletedRecords.push(`${renumerationData.length} renumeration records`)
      }

      // 6. Delete class assignments (old table if exists)
      const { data: classAssignmentsData, error: classAssignmentsError } = await supabase
        .from('peer_tutor_class_assignments')
        .delete()
        .eq('peer_tutor_id', id)
        .select()

      if (classAssignmentsError) {
        // Only log warning if it's likely just table missing. 
        // We don't want to stop deletion for a legacy/optional table error.
        logger.warn('Error deleting class assignments (table might not exist or other error):', classAssignmentsError)
      } else if (classAssignmentsData && Array.isArray(classAssignmentsData) && classAssignmentsData.length > 0) {
        deletedRecords.push(`${classAssignmentsData.length} class assignments`)
      }

      // 7. Delete attendance records linked to this peer tutor
      // Note: Student attendance (attendance records with student_id) will remain intact
      // Only peer tutor's own attendance records are deleted
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .delete()
        .eq('peer_tutor_id', id)
        .select()

      if (attendanceError) {
        logger.error('Error deleting peer tutor attendance records:', attendanceError)
        return { success: false, message: `Failed to delete attendance records: ${attendanceError.message}` }
      } else if (attendanceData && attendanceData.length > 0) {
        deletedRecords.push(`${attendanceData.length} peer tutor attendance records`)
      }

      // 8. Finally, delete the peer tutor record
      const { error: deleteError } = await supabase
        .from('peer_tutors')
        .delete()
        .eq('id', id)

      if (deleteError) {
        logger.error('Error removing peer tutor:', deleteError)
        return {
          success: false,
          message: `Failed to delete peer tutor: ${deleteError.message || 'Unknown error'}`
        }
      }

      // Build success message
      let message = 'Peer tutor deleted successfully'
      if (deletedRecords.length > 0) {
        message += `. ${deletedRecords.join(', ')}`
      }

      // logger.info(`Peer tutor removal completed for ${id}:`, deletedRecords)
      return { success: true, message }
    } catch (error) {
      logger.error('Error in removepeertutors:', error)
      return {
        success: false,
        message: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Search for students using Microsoft Graph (returns all results, validation happens during assignment)
   */
  static async searchAvailableStudents(query: string): Promise<MicrosoftUser[]> {
    try {
      // Search Microsoft Graph for students - return all results
      // Validation for existing users will happen during the assignment process
      const searchResults = await MicrosoftGraphService.searchUsers(query)
      return searchResults
    } catch (error) {
      logger.error('Error searching available students:', error)
      return []
    }
  }

  /**
   * Get peer tutor statistics
   */
  static async getpeerTutortats(): Promise<{
    total: number
    active: number
    byDepartment: Record<string, number>
    byYear: Record<string, number>
  }> {
    try {
      const allpeerTutor = await this.getAllpeerTutor()

      const stats = {
        total: allpeerTutor.length,
        active: allpeerTutor.length, // Assuming all are active for now
        byDepartment: {} as Record<string, number>,
        byYear: {} as Record<string, number>
      }

      // Count by department
      allpeerTutor.forEach(pt => {
        stats.byDepartment[pt.dept] = (stats.byDepartment[pt.dept] || 0) + 1
        stats.byYear[pt.year] = (stats.byYear[pt.year] || 0) + 1
      })

      return stats
    } catch (error) {
      logger.error('Error getting peer tutor stats:', error)
      return { total: 0, active: 0, byDepartment: {}, byYear: {} }
    }
  }

  /**
   * Get peer tutor by ID
   */
  static async getpeertutorsById(id: string): Promise<peertutors | null> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        logger.error('Error getting peer tutor by ID:', error)
        return null
      }

      return data as peertutors
    } catch (error) {
      logger.error('Error in getpeertutorsById:', error)
      return null
    }
  }

  /**
   * Assign a new peer tutor to future scheduled classes (from tomorrow onwards based on when they were created)
   */
  static async assignNewTutorToFutureClasses(
    dept: string,
    year: string,
    section: string,
    peertutorsId?: string,
    peertutorsCreatedAt?: string
  ): Promise<boolean> {
    try {
      const supabase = createClient()

      let newpeertutors: { id: string; created_at?: string } | null = null

      // If peer tutor ID and created_at are provided, use them; otherwise fetch the newest one
      if (peertutorsId && peertutorsCreatedAt) {
        newpeertutors = { id: peertutorsId }
      } else {
        // Get the newly created peer tutor
        const { data: fetchedpeertutors, error: tutorError } = await supabase
          .from('peer_tutors')
          .select('id, created_at')
          .eq('dept', dept)
          .eq('year', year)
          .eq('section', section)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (tutorError || !fetchedpeertutors) {
          logger.error('Error getting new peer tutor:', tutorError)
          return false
        }

        newpeertutors = fetchedpeertutors
      }

      // Calculate allocateFromDate (today)
      // When a new peer tutor is added, allocate classes starting from TODAY
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const allocateFromDate = new Date(today)
      // allocateFromDate.setDate(tomorrow.getDate() + 1) // REMOVED: Start from today
      const allocateFromDateString = allocateFromDate.toISOString().split('T')[0]

      // Get all unique class_id and scheduled_date combinations for future classes
      // from any peer tutor in this section (we want to allocate the new tutor to all future classes)
      const { data: futureClasses, error: classesError } = await supabase
        .from('scheduled_classes')
        .select(`
          class_id,
          scheduled_date,
          dept,
          year,
          section,
          faculty_id,
          topics
        `)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .gte('scheduled_date', allocateFromDateString)

      if (classesError) {
        logger.error('Error getting future scheduled classes:', classesError)
        return false
      }

      if (!futureClasses || futureClasses.length === 0) {
        // logger.info('No future scheduled classes found for new peer tutor')
        return true // No future classes to assign
      }

      // Get unique class_id and scheduled_date combinations
      // Using Map to ensure uniqueness
      const uniqueClassesMap = new Map<string, {
        class_id: string
        scheduled_date: string
        dept: string
        year: string
        section: string
        faculty_id: string
        topics?: string | null
      }>()

      futureClasses.forEach(classData => {
        const key = `${classData.class_id}-${classData.scheduled_date}`
        if (!uniqueClassesMap.has(key)) {
          uniqueClassesMap.set(key, {
            class_id: classData.class_id,
            scheduled_date: classData.scheduled_date,
            dept: classData.dept,
            year: classData.year,
            section: classData.section,
            faculty_id: classData.faculty_id,
            topics: classData.topics
          })
        }
      })

      const uniqueClasses = Array.from(uniqueClassesMap.values())

      // Check which classes this specific peer tutor doesn't already have
      const { data: existingClasses, error: existingError } = await supabase
        .from('scheduled_classes')
        .select('class_id, scheduled_date')
        .eq('peer_tutor_id', newpeertutors.id)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .gte('scheduled_date', allocateFromDateString)

      if (existingError) {
        logger.error('Error checking existing classes for peer tutor:', existingError)
        return false
      }

      // Create a set of existing class keys for quick lookup
      const existingKeys = new Set(
        (existingClasses || []).map(c => `${c.class_id}-${c.scheduled_date}`)
      )

      // Filter out classes that this peer tutor already has
      const classesToInsert = uniqueClasses.filter(classData => {
        const key = `${classData.class_id}-${classData.scheduled_date}`
        return !existingKeys.has(key)
      })

      if (classesToInsert.length === 0) {
        // logger.info('New peer tutor already has all future scheduled classes')
        return true
      }

      // Multiple peer tutors can now be assigned to the same class-date.
      // Create new scheduled_class records for the new peer tutor.
      // Each peer tutor gets their own record for each class-date combination.

      const recordsToInsert = classesToInsert.map(classData => ({
        class_id: classData.class_id,
        scheduled_date: classData.scheduled_date,
        dept: classData.dept,
        year: classData.year,
        section: classData.section,
        faculty_id: classData.faculty_id,
        peer_tutor_id: newpeertutors.id,
        topics: classData.topics || null
      }))

      // Insert all records in a batch (Supabase allows batch inserts)
      const { error: insertError } = await supabase
        .from('scheduled_classes')
        .insert(recordsToInsert)
        .select()

      if (insertError) {
        // If batch insert fails, try inserting one by one to identify which ones fail
        logger.warn('Batch insert failed, trying individual inserts:', insertError)

        let successCount = 0
        for (const classData of classesToInsert) {
          try {
            const { error: individualError } = await supabase
              .from('scheduled_classes')
              .insert([{
                class_id: classData.class_id,
                scheduled_date: classData.scheduled_date,
                dept: classData.dept,
                year: classData.year,
                section: classData.section,
                faculty_id: classData.faculty_id,
                peer_tutor_id: newpeertutors.id,
                topics: classData.topics || null
              }])

            if (individualError) {
              if (individualError.code === '23505') {
                // Unique constraint violation - this peer tutor already has this class-date
                // This shouldn't happen due to our check above, but handle it gracefully
                // logger.info(`Class ${classData.class_id} on ${classData.scheduled_date} already exists for this peer tutor`)
                successCount++
              } else {
                logger.error(`Failed to insert class ${classData.class_id} on ${classData.scheduled_date}:`, individualError)
              }
            } else {
              successCount++
            }
          } catch (individualException) {
            logger.error(`Exception inserting class ${classData.class_id} on ${classData.scheduled_date}:`, individualException)
          }
        }

        // logger.info(`Successfully allocated ${successCount} out of ${classesToInsert.length} classes to new peer tutor starting from ${allocateFromDateString}`)
        return successCount > 0
      }



      // CLEANUP: Remove "placeholder" scheduled classes (where peer_tutor_id is null)
      // for the class_id/date combinations we just filled.
      // This prevents duplicates where we have one row with tutor and one row with null.
      if (classesToInsert.length > 0) {
        const classIds = classesToInsert.map(c => c.class_id)
        const scheduledDates = classesToInsert.map(c => c.scheduled_date)

        const { error: cleanupError } = await supabase
          .from('scheduled_classes')
          .delete()
          .is('peer_tutor_id', null)
          .eq('dept', dept)
          .eq('year', year)
          .eq('section', section)
          .in('class_id', classIds)
          .in('scheduled_date', scheduledDates)

        if (cleanupError) {
          logger.error('Error cleaning up placeholder scheduled classes:', cleanupError)
          // Don't return false, because the assignment itself succeeded.
        } else {
          // logger.info('Successfully cleaned up placeholder scheduled classes')
        }
      }

      return true
    } catch (error) {
      logger.error('Error in assignNewTutorToFutureClasses:', {
        error,
        dept,
        year,
        section,
        message: 'Failed to assign new peer tutor to future classes'
      })
      return false
    }
  }

  static async transferpeerTutor(ids: string[], newSection: string): Promise<boolean> {
    const supabase = createClient()

    try {
      const { error } = await supabase
        .from('peer_tutors')
        .update({ section: newSection })
        .in('id', ids)

      if (error) {
        logger.error('Error transferring peer tutors:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in transferpeerTutor:', error)
      return false
    }
  }

}
