import { createClient } from '@/utils/supabase/client'
import { MicrosoftGraphService } from '../auth/microsoftGraph'
import { MicrosoftUser } from '@/lib/types'

export interface PeerTutor {
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

export interface PeerTutorAssignment {
  name: string
  email: string
  faculty_id: string
  dept: string
  year: string
  section: string
  assigned_by: string
}

export class PeerTutorService {
  /**
   * Create a peer tutor from Microsoft Graph user data
   */
  static async createFromMicrosoftUser(
    microsoftUser: MicrosoftUser,
    facultyId: string,
    dept: string,
    year: string,
    section: string
  ): Promise<PeerTutor | null> {
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
        console.error('Error creating peer tutor from Microsoft user:', error)
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
        console.warn('Failed to assign new peer tutor to future classes, but peer tutor was created successfully. The peer tutor will not be automatically assigned to future scheduled classes and will need to be manually assigned.')
      }

      return data as PeerTutor
    } catch (error) {
      console.error('Error in createFromMicrosoftUser:', error)
      return null
    }
  }

  /**
   * Get all peer tutors for a specific department, year, and section
   */
  static async getPeerTutorsBySection(dept: string, year: string, section: string): Promise<PeerTutor[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .order('name')

      if (error) {
        console.error('Error getting peer tutors by section:', error)
        return []
      }

      return data as PeerTutor[] || []
    } catch (error) {
      console.error('Error in getPeerTutorsBySection:', error)
      return []
    }
  }

  /**
   * Get all peer tutors across all departments
   */
  static async getAllPeerTutors(): Promise<PeerTutor[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .order('dept, year, section, name')

      if (error) {
        console.error('Error getting all peer tutors:', error)
        return []
      }

      return data as PeerTutor[] || []
    } catch (error) {
      console.error('Error in getAllPeerTutors:', error)
      return []
    }
  }

  /**
   * Get all peer tutors for a specific department
   */
  static async getPeerTutorsByDepartment(dept: string): Promise<PeerTutor[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('dept', dept)
        .order('year, section, name')

      if (error) {
        console.error('Error getting peer tutors by department:', error)
        return []
      }

      return data as PeerTutor[] || []
    } catch (error) {
      console.error('Error in getPeerTutorsByDepartment:', error)
      return []
    }
  }

  /**
   * Get peer tutors by years (array of years)
   */
  static async getPeerTutorsByYears(years: string[]): Promise<PeerTutor[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .in('year', years)
        .order('year, section, name')

      if (error) {
        console.error('Error getting peer tutors by years:', error)
        return []
      }

      return data as PeerTutor[] || []
    } catch (error) {
      console.error('Error in getPeerTutorsByYears:', error)
      return []
    }
  }

  /**
   * Check if a student is already a peer tutor
   */
  static async isAlreadyPeerTutor(email: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_tutors')
        .select('id')
        .eq('email', email)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error checking if student is peer tutor:', error)
        return false
      }

      return !!data
    } catch (error) {
      console.error('Error in isAlreadyPeerTutor:', error)
      return false
    }
  }

  /**
   * Assign a new peer tutor
   */
  static async assignPeerTutor(assignment: PeerTutorAssignment): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('peer_tutors')
        .insert([assignment])

      if (error) {
        console.error('Error assigning peer tutor:', error)
        return false
      }

      // After successfully creating the peer tutor, get the created peer tutor with created_at
      const { data: createdPeerTutor, error: fetchError } = await supabase
        .from('peer_tutors')
        .select('id, created_at')
        .eq('dept', assignment.dept)
        .eq('year', assignment.year)
        .eq('section', assignment.section)
        .eq('email', assignment.email)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (fetchError || !createdPeerTutor) {
        console.error('Error fetching created peer tutor:', fetchError)
        return false
      }

      // After successfully creating the peer tutor, assign them to future scheduled classes
      // Pass the peer tutor ID and creation date to correctly filter classes
      const assignmentResult = await this.assignNewTutorToFutureClasses(
        assignment.dept, 
        assignment.year, 
        assignment.section,
        createdPeerTutor.id,
        createdPeerTutor.created_at
      )

      if (!assignmentResult) {
        console.warn('Failed to assign new peer tutor to future classes, but peer tutor was created successfully. The peer tutor will not be automatically assigned to future scheduled classes and will need to be manually assigned.')
      }

      return true
    } catch (error) {
      console.error('Error in assignPeerTutor:', error)
      return false
    }
  }

  /**
   * Remove a peer tutor and all related records (CASCADE DELETE)
   */
  static async removePeerTutor(id: string, forceDelete: boolean = false): Promise<{ success: boolean; message: string }> {
    try {
      const supabase = createClient()
      
      // First, check if there are any students assigned to this peer tutor
      const { data: assignedStudents, error: checkError } = await supabase
        .from('peer_students')
        .select('id, name')
        .eq('assigned_peer_tutor_id', id)

      if (checkError) {
        console.error('Error checking assigned students:', checkError)
        return { success: false, message: 'Failed to check assigned students' }
      }

      if (assignedStudents && assignedStudents.length > 0 && !forceDelete) {
        const studentNames = assignedStudents.map(s => s.name).join(', ')
        return { 
          success: false, 
          message: `Cannot delete peer tutor. The following students are still assigned: ${studentNames}. Please reassign or remove these students first.` 
        }
      }

      console.log(`Starting cascade delete for peer tutor: ${id}`)
      const deletedRecords: string[] = []

      // 1. Delete attendance records
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .delete()
        .eq('peer_tutor_id', id)
        .select()

      if (attendanceError) {
        console.error('Error deleting attendance records:', attendanceError)
      } else if (attendanceData && attendanceData.length > 0) {
        deletedRecords.push(`${attendanceData.length} attendance records`)
      }

 

      // 3. Delete scheduled classes
      const { data: scheduledClassesData, error: scheduledClassesError } = await supabase
        .from('scheduled_classes')
        .delete()
        .eq('peer_tutor_id', id)
        .select()

      if (scheduledClassesError) {
        console.error('Error deleting scheduled classes:', scheduledClassesError)
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
        console.error('Error deleting additional classes:', additionalClassesError)
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
        console.error('Error deleting renumeration records:', renumerationError)
      } else if (renumerationData && renumerationData.length > 0) {
        deletedRecords.push(`${renumerationData.length} renumeration records`)
      }

      // Note: Feedback system is separate from peer tutors
      // Feedback forms are created by faculty and responses are submitted by students
      // No direct relationship exists between peer tutors and feedback records

      // 6. Delete class assignments (old table if exists)
      const { data: classAssignmentsData } = await supabase
        .from('peer_tutor_class_assignments')
        .delete()
        .eq('peer_tutor_id', id)
        .select()

      if (classAssignmentsData && classAssignmentsData.length > 0) {
        deletedRecords.push(`${classAssignmentsData.length} class assignments`)
      }


      // 8. Unassign all students if force delete is enabled
      if (assignedStudents && assignedStudents.length > 0 && forceDelete) {
        const { error: unassignError } = await supabase
          .from('peer_students')
          .update({ assigned_peer_tutor_id: null })
          .eq('assigned_peer_tutor_id', id)

        if (unassignError) {
          console.error('Error unassigning students:', unassignError)
          return { 
            success: false, 
            message: `Failed to unassign students: ${unassignError.message || 'Unknown error'}` 
          }
        }
        deletedRecords.push(`${assignedStudents.length} students unassigned`)
      }

      // 9. Finally, delete the peer tutor record
      const { error: deleteError } = await supabase
        .from('peer_tutors')
        .delete()
        .eq('id', id)

      if (deleteError) {
        console.error('Error removing peer tutor:', deleteError)
        return { 
          success: false, 
          message: `Failed to delete peer tutor: ${deleteError.message || 'Unknown error'}` 
        }
      }

      // Build success message
      let message = 'Peer tutor deleted successfully'
      if (deletedRecords.length > 0) {
        message += `. Deleted: ${deletedRecords.join(', ')}`
      }

      console.log(`Cascade delete completed for peer tutor ${id}:`, deletedRecords)
      return { success: true, message }
    } catch (error) {
      console.error('Error in removePeerTutor:', error)
      return { 
        success: false, 
        message: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }
    }
  }

  /**
   * Search for students using Microsoft Graph (excluding existing peer tutors and students)
   */
  static async searchAvailableStudents(query: string): Promise<MicrosoftUser[]> {
    try {
      // Get all existing peer tutor emails to exclude them
      const existingPeerTutors = await this.getAllPeerTutors()
      const existingPeerTutorEmails = existingPeerTutors.map(pt => pt.email.toLowerCase())

      // Get all existing student emails to exclude them
      const supabase = createClient()
      const { data: existingStudents, error } = await supabase
        .from('peer_students')
        .select('email')
      
      if (error) {
        console.error('Error getting existing students:', error)
      }
      
      const existingStudentEmails = (existingStudents || []).map(s => s.email.toLowerCase())

      // Combine all emails to exclude
      const allExcludedEmails = [...existingPeerTutorEmails, ...existingStudentEmails]

      // Search Microsoft Graph for students
      const searchResults = await MicrosoftGraphService.searchUsers(query)
      
      // Filter out existing peer tutors and students
      const availableStudents = searchResults.filter(student => 
        !allExcludedEmails.includes(student.mail?.toLowerCase() || '')
      )

      return availableStudents
    } catch (error) {
      console.error('Error searching available students:', error)
      return []
    }
  }

  /**
   * Get peer tutor statistics
   */
  static async getPeerTutorStats(): Promise<{
    total: number
    active: number
    byDepartment: Record<string, number>
    byYear: Record<string, number>
  }> {
    try {
      const allPeerTutors = await this.getAllPeerTutors()
      
      const stats = {
        total: allPeerTutors.length,
        active: allPeerTutors.length, // Assuming all are active for now
        byDepartment: {} as Record<string, number>,
        byYear: {} as Record<string, number>
      }

      // Count by department
      allPeerTutors.forEach(pt => {
        stats.byDepartment[pt.dept] = (stats.byDepartment[pt.dept] || 0) + 1
        stats.byYear[pt.year] = (stats.byYear[pt.year] || 0) + 1
      })

      return stats
    } catch (error) {
      console.error('Error getting peer tutor stats:', error)
      return { total: 0, active: 0, byDepartment: {}, byYear: {} }
    }
  }

  /**
   * Get peer tutor by ID
   */
  static async getPeerTutorById(id: string): Promise<PeerTutor | null> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('Error getting peer tutor by ID:', error)
        return null
      }

      return data as PeerTutor
    } catch (error) {
      console.error('Error in getPeerTutorById:', error)
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
    peerTutorId?: string,
    peerTutorCreatedAt?: string
  ): Promise<boolean> {
    try {
      const supabase = createClient()

      let newPeerTutor: { id: string; created_at?: string } | null = null

      // If peer tutor ID and created_at are provided, use them; otherwise fetch the newest one
      if (peerTutorId && peerTutorCreatedAt) {
        newPeerTutor = { id: peerTutorId }
      } else {
        // Get the newly created peer tutor
        const { data: fetchedPeerTutor, error: tutorError } = await supabase
          .from('peer_tutors')
          .select('id, created_at')
          .eq('dept', dept)
          .eq('year', year)
          .eq('section', section)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (tutorError || !fetchedPeerTutor) {
          console.error('Error getting new peer tutor:', tutorError)
          return false
        }

        newPeerTutor = fetchedPeerTutor
      }

      // Calculate tomorrow (next day from today)
      // When a new peer tutor is added, allocate classes starting from tomorrow
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowDateString = tomorrow.toISOString().split('T')[0]

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
        .gte('scheduled_date', tomorrowDateString)

      if (classesError) {
        console.error('Error getting future scheduled classes:', classesError)
        return false
      }

      if (!futureClasses || futureClasses.length === 0) {
        console.log('No future scheduled classes found for new peer tutor')
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
        .eq('peer_tutor_id', newPeerTutor.id)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .gte('scheduled_date', tomorrowDateString)

      if (existingError) {
        console.error('Error checking existing classes for peer tutor:', existingError)
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
        console.log('New peer tutor already has all future scheduled classes')
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
        peer_tutor_id: newPeerTutor.id,
        topics: classData.topics || null
      }))

      // Insert all records in a batch (Supabase allows batch inserts)
      const { error: insertError, count } = await supabase
        .from('scheduled_classes')
        .insert(recordsToInsert)
        .select()

      if (insertError) {
        // If batch insert fails, try inserting one by one to identify which ones fail
        console.warn('Batch insert failed, trying individual inserts:', insertError)
        
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
                peer_tutor_id: newPeerTutor.id,
                topics: classData.topics || null
              }])

            if (individualError) {
              if (individualError.code === '23505') {
                // Unique constraint violation - this peer tutor already has this class-date
                // This shouldn't happen due to our check above, but handle it gracefully
                console.log(`Class ${classData.class_id} on ${classData.scheduled_date} already exists for this peer tutor`)
                successCount++
              } else {
                console.error(`Failed to insert class ${classData.class_id} on ${classData.scheduled_date}:`, individualError)
              }
            } else {
              successCount++
            }
          } catch (individualException) {
            console.error(`Exception inserting class ${classData.class_id} on ${classData.scheduled_date}:`, individualException)
          }
        }

        console.log(`Successfully allocated ${successCount} out of ${classesToInsert.length} classes to new peer tutor starting from ${tomorrowDateString}`)
        return successCount > 0
      }

      const insertedCount = count || recordsToInsert.length
      console.log(`Successfully allocated ${insertedCount} classes to new peer tutor starting from ${tomorrowDateString}`)
      return true
    } catch (error) {
      console.error('Error in assignNewTutorToFutureClasses:', {
        error,
        dept,
        year,
        section,
        message: 'Failed to assign new peer tutor to future classes'
      })
      return false
    }
  }

  static async transferPeerTutors(ids: string[], newSection: string): Promise<boolean> {
    const supabase = createClient()

    try {
      const { error } = await supabase
        .from('peer_tutors')
        .update({ section: newSection })
        .in('id', ids)

      if (error) {
        console.error('Error transferring peer tutors:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in transferPeerTutors:', error)
      return false
    }
  }

}
