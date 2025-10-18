import { createClient } from '@/utils/supabase/client'
import { MicrosoftGraphService } from '../auth/microsoftGraph'

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
    microsoftUser: any,
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

      // 2. Delete exam marks records submitted by this peer tutor
      const { data: examMarksData, error: examMarksError } = await supabase
        .from('exam_marks')
        .delete()
        .eq('peer_tutor_id', id)
        .select()

      if (examMarksError) {
        console.error('Error deleting exam marks records:', examMarksError)
      } else if (examMarksData && examMarksData.length > 0) {
        deletedRecords.push(`${examMarksData.length} exam marks`)
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

      // 6. Delete feedback records
      const { data: feedbackData, error: feedbackError } = await supabase
        .from('feedback')
        .delete()
        .eq('peer_tutor_id', id)
        .select()

      if (feedbackError) {
        console.error('Error deleting feedback records:', feedbackError)
      } else if (feedbackData && feedbackData.length > 0) {
        deletedRecords.push(`${feedbackData.length} feedback submissions`)
      }

      // 7. Delete class assignments (old table if exists)
      const { data: classAssignmentsData } = await supabase
        .from('peer_tutor_class_assignments')
        .delete()
        .eq('peer_tutor_id', id)
        .select()

      if (classAssignmentsData && classAssignmentsData.length > 0) {
        deletedRecords.push(`${classAssignmentsData.length} class assignments`)
      }

      // 8. Delete peer tutor exam marks (old table if exists)
      const { data: tutorExamMarksData } = await supabase
        .from('peer_tutor_exam_marks')
        .delete()
        .eq('peer_tutor_id', id)
        .select()

      if (tutorExamMarksData && tutorExamMarksData.length > 0) {
        deletedRecords.push(`${tutorExamMarksData.length} peer tutor exam marks`)
      }

      // 9. Unassign all students if force delete is enabled
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

      // 10. Finally, delete the peer tutor record
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
  static async searchAvailableStudents(query: string): Promise<any[]> {
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
}
