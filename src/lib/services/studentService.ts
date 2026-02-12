import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { MicrosoftGraphService } from '../auth/microsoftGraph'
import { peertutorservice } from './peerTutorService'

import { MicrosoftUser } from '@/lib/types'

export interface Student {
  id: string
  name: string
  email: string | null
  dept: string
  year: string
  section: string
  faculty_id: string
  peer_tutor: boolean
  assigned_peer_tutor_id?: string | null
  is_manual_entry?: boolean
  created_at: string
}

export interface StudentWithpeertutors extends Student {
  assigned_peer_tutor?: {
    id: string
    name: string
    email: string
  } | null
}

export interface StudentAssignment {
  name: string
  email?: string | null
  dept: string
  year: string
  section: string
  faculty_id: string
  peer_tutor?: boolean
  is_manual_entry?: boolean
}

export class StudentService {
  /**
   * Create a student from Microsoft Graph user data
   */
  static async createFromMicrosoftUser(
    microsoftUser: MicrosoftUser,
    facultyId: string,
    dept: string,
    year: string,
    section: string
  ): Promise<Student | null> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .insert({
          name: microsoftUser.displayName,
          email: microsoftUser.mail || microsoftUser.userPrincipalName,
          dept,
          year,
          section,
          faculty_id: facultyId,
          peer_tutor: false
        })
        .select()
        .single()

      if (error) {
        logger.error('Error creating student from Microsoft user:', error)
        return null
      }

      return data as Student
    } catch (error) {
      logger.error('Error in createFromMicrosoftUser:', error)
      return null
    }
  }

  /**
   * Get all students
   */
  static async getAllStudents(): Promise<Student[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('*')
        .eq('peer_tutor', false)
        .order('name')

      if (error) {
        logger.error('Error getting all students:', error)
        return []
      }

      return data as Student[] || []
    } catch (error) {
      logger.error('Error in getAllStudents:', error)
      return []
    }
  }

  /**
   * Get all students for a specific department
   */
  static async getStudentsByDepartment(dept: string): Promise<Student[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('*')
        .eq('dept', dept)
        .eq('peer_tutor', false)
        .order('year, section, name')

      if (error) {
        logger.error('Error getting students by department:', error)
        return []
      }

      return data as Student[] || []
    } catch (error) {
      logger.error('Error in getStudentsByDepartment:', error)
      return []
    }
  }

  /**
   * Get all students for a specific department, year, and section
   */
  static async getStudentsBySection(dept: string, year: string, section: string): Promise<Student[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('*')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .order('name')

      if (error) {
        logger.error('Error getting students by section:', error)
        return []
      }

      return data as Student[] || []
    } catch (error) {
      logger.error('Error in getStudentsBySection:', error)
      return []
    }
  }

  /**
   * Check if a student already exists in the database
   */
  static async isStudentExists(email: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('id')
        .eq('email', email)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error('Error checking if student exists:', error)
        return false
      }

      return !!data
    } catch (error) {
      logger.error('Error in isStudentExists:', error)
      return false
    }
  }

  /**
   * Check if an email belongs to a student (anywhere in the system)
   */
  static async isStudent(email: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('id')
        .eq('email', email)
        .eq('peer_tutor', false)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error('Error checking if email is student:', error)
        return false
      }

      return !!data
    } catch (error) {
      logger.error('Error in isStudent:', error)
      return false
    }
  }

  /**
   * Get student details by email
   */
  static async getStudentByEmail(email: string): Promise<Student | null> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('*')
        .eq('email', email)
        .eq('peer_tutor', false)
        .single()

      if (error) {
        if (error.code !== 'PGRST116') {
          logger.error('Error getting student by email:', error)
        }
        return null
      }

      return data as Student
    } catch (error) {
      logger.error('Error in getStudentByEmail:', error)
      return null
    }
  }

  /**
   * Add a new student
   */
  static async addStudent(student: StudentAssignment): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = createClient()
      
      // Only check for existing email if email is provided
      if (student.email) {
        // First, check if this email is already a student ANYWHERE (any dept/year/section)
        const existingStudent = await this.getStudentByEmail(student.email)
        
        if (existingStudent) {
          // Check if it's in the SAME section trying to add to
          if (existingStudent.dept === student.dept && 
              existingStudent.year === student.year && 
              existingStudent.section === student.section) {
            return { 
              success: false, 
              error: `${student.name} is already a student in ${student.dept} Year ${student.year} Section ${student.section}` 
            }
          } else {
            // Exists in a DIFFERENT section
            return { 
              success: false, 
              error: `${student.name} already exists as student in ${existingStudent.dept} Year ${existingStudent.year} Section ${existingStudent.section}` 
            }
          }
        }

        // Also check if this email is already a peer tutor
        const existingPeerTutor = await peertutorservice.getPeerTutorByEmail(student.email)
        
        if (existingPeerTutor) {
          return { 
            success: false, 
            error: `${student.name} already exists as peer tutor in ${existingPeerTutor.dept} Year ${existingPeerTutor.year} Section ${existingPeerTutor.section}` 
          }
        }
      }

      // Set is_manual_entry flag if email is null
      const studentData = {
        ...student,
        is_manual_entry: student.email ? false : true
      }

      // Insert the new student
      const { error } = await supabase
        .from('peer_students')
        .insert([studentData])

      if (error) {
        logger.error('Error adding student:', error)
        
        // Check for specific error codes
        if (error.code === '23505') {
          return { success: false, error: 'This user is already a student in this section' }
        }
        
        return { success: false, error: `Failed to add student: ${error.message}` }
      }

      return { success: true }
    } catch (error) {
      logger.error('Error in addStudent:', error)
      return { success: false, error: 'An unexpected error occurred while adding student' }
    }
  }

  /**
   * Remove a student
   */
  /**
   * Remove a student and all associated data
   */
  static async removeStudent(id: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      logger.info(`Starting student removal for: ${id}`)
      
      // 1. Delete authentication/attendance records linked to this student
      // Note: We need to check if there are any other tables linking to students
      // For now, primarily attendance records
      
      // Attempt to delete from attendance table if it exists and has student_id
      // We'll wrap this in a try-catch or check error codes in case columns differ
      const { error: attendanceError } = await supabase
        .from('attendance')
        .delete()
        .eq('student_id', id)

      if (attendanceError) {
        logger.warn('Error deleting student attendance (or records not found):', attendanceError)
        // Proceeding anyway as it might be a schema mismatch or no records
      }

      // 1.5 Delete additional class attendance records
      const { error: additionalAttendanceError } = await supabase
        .from('additional_class_attendance')
        .delete()
        .eq('student_id', id)

      if (additionalAttendanceError) {
         logger.warn('Error deleting additional class attendance:', additionalAttendanceError)
      }

      // 2. Delete the student record
      const { error } = await supabase
        .from('peer_students')
        .delete()
        .eq('id', id)

      if (error) {
        logger.error('Error removing student:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in removeStudent:', error)
      return false
    }
  }

  /**
   * Search for available students using Microsoft Graph (returns all results, validation happens during addition)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async searchAvailableStudents(query: string, dept: string, year: string, section: string): Promise<MicrosoftUser[]> {
    try {
      // Search Microsoft Graph for students - return all results
      // Validation for existing users will happen during the addition process
      const searchResults = await MicrosoftGraphService.searchUsers(query)
      return searchResults
    } catch (error) {
      logger.error('Error searching available students:', error)
      return []
    }
  }

  /**
   * Get all students with their assigned peer tutor information
   */
  static async getAllStudentsWithpeerTutor(facultyId?: string): Promise<StudentWithpeertutors[]> {
    try {
      const supabase = createClient()
      
      let query = supabase
        .from('peer_students')
        .select(`
          *,
          assigned_peer_tutor:assigned_peer_tutor_id (
            id,
            name,
            email
          )
        `)
        .eq('peer_tutor', false)
        .order('name')

      if (facultyId) {
        query = query.eq('faculty_id', facultyId)
      }

      const { data, error } = await query

      if (error) {
        logger.error('Error getting students with peer tutors:', error)
        return []
      }

      return data || []
    } catch (error) {
      logger.error('Error in getAllStudentsWithpeerTutor:', error)
      return []
    }
  }

  /**
   * Get students assigned to a specific peer tutor
   */
  static async getStudentsBypeertutors(peertutorsId: string): Promise<Student[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('*')
        .eq('assigned_peer_tutor_id', peertutorsId)
        .eq('peer_tutor', false)
        .order('name')

      if (error) {
        logger.error('Error getting students by peer tutor:', error)
        return []
      }

      return data as Student[] || []
    } catch (error) {
      logger.error('Error in getStudentsBypeertutors:', error)
      return []
    }
  }

  // Transfer students to a new section
  static async transferStudents(ids: string[], newSection: string): Promise<boolean> {
    const supabase = createClient()

    try {
      const { error } = await supabase
        .from('peer_students')
        .update({ section: newSection })
        .in('id', ids)

      if (error) {
        logger.error('Error transferring students:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in transferStudents:', error)
      return false
    }
  }


  /**
   * Get all students for a specific department with their assigned peer tutor information
   */
  static async getStudentsWithpeerTutorByDepartment(dept: string): Promise<StudentWithpeertutors[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select(`
          *,
          assigned_peer_tutor:assigned_peer_tutor_id (
            id,
            name,
            email
          )
        `)
        .eq('dept', dept)
        .eq('peer_tutor', false)
        .order('name')

      if (error) {
        logger.error('Error getting students with peer tutors by department:', error)
        return []
      }

      return data || []
    } catch (error) {
      logger.error('Error in getStudentsWithpeerTutorByDepartment:', error)
      return []
    }
  }

  /**
   * Get all manually added students (students with no email)
   */
  static async getManualStudents(dept: string, year: string, section: string): Promise<Student[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('*')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .eq('is_manual_entry', true)
        .eq('peer_tutor', false)
        .order('name')

      if (error) {
        logger.error('Error getting manual students:', error)
        return []
      }

      return data as Student[] || []
    } catch (error) {
      logger.error('Error in getManualStudents:', error)
      return []
    }
  }

  /**
   * Update student email from Microsoft Graph user
   */
  static async updateStudentEmail(
    studentId: string,
    microsoftUser: MicrosoftUser
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = createClient()
      
      // First, verify the student exists and is a manual entry
      const { data: student, error: fetchError } = await supabase
        .from('peer_students')
        .select('*')
        .eq('id', studentId)
        .single()
      
      if (fetchError || !student) {
        logger.error('Student not found:', fetchError)
        return { success: false, error: 'Student not found' }
      }

      // Check if email already exists in the system
      const email = microsoftUser.mail || microsoftUser.userPrincipalName
      if (email) {
        const { data: existingStudent } = await supabase
          .from('peer_students')
          .select('id')
          .eq('email', email)
          .single()
        
        if (existingStudent && existingStudent.id !== studentId) {
          return { success: false, error: 'Email already exists in the system' }
        }
      }

      // Update the student with Microsoft Graph data
      const { error: updateError } = await supabase
        .from('peer_students')
        .update({
          name: microsoftUser.displayName,
          email: email,
          is_manual_entry: false
        })
        .eq('id', studentId)

      if (updateError) {
        logger.error('Error updating student email:', updateError)
        return { success: false, error: 'Failed to update student' }
      }

      return { success: true }
    } catch (error) {
      logger.error('Error in updateStudentEmail:', error)
      return { success: false, error: 'An unexpected error occurred' }
    }
  }
}
