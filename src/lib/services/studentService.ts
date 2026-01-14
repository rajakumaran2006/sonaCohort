import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { MicrosoftGraphService } from '../auth/microsoftGraph'
import { peertutorservice } from './peerTutorService'

import { MicrosoftUser } from '@/lib/types'

export interface Student {
  id: string
  name: string
  email: string
  dept: string
  year: string
  section: string
  faculty_id: string
  peer_tutor: boolean
  assigned_peer_tutor_id?: string | null
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
  email: string
  dept: string
  year: string
  section: string
  faculty_id: string
  peer_tutor?: boolean
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
  static async addStudent(student: StudentAssignment): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('peer_students')
        .insert([student])

      if (error) {
        logger.error('Error adding student:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in addStudent:', error)
      return false
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
   * Search for available students using Microsoft Graph (excluding existing students and peer tutors)
   */
  static async searchAvailableStudents(query: string, dept: string, year: string, section: string): Promise<MicrosoftUser[]> {
    try {
      // Get all existing student emails to exclude them
      const existingStudents = await this.getStudentsBySection(dept, year, section)
      const existingStudentEmails = existingStudents.map(s => s.email.toLowerCase())

      // Get all existing peer tutor emails to exclude them
      const existingpeerTutor = await peertutorservice.getAllpeerTutor()
      const existingpeertutorsEmails = existingpeerTutor.map(pt => pt.email.toLowerCase())

      // Combine all emails to exclude
      const allExcludedEmails = [...existingStudentEmails, ...existingpeertutorsEmails]

      // Search Microsoft Graph for students
      const searchResults = await MicrosoftGraphService.searchUsers(query)
      
      // Filter out existing students and peer tutors
      const availableStudents = searchResults.filter(student => 
        !allExcludedEmails.includes(student.mail?.toLowerCase() || '')
      )

      return availableStudents
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
}
