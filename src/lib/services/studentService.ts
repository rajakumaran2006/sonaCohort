import { createClient } from '@/utils/supabase/client'
import { MicrosoftGraphService } from '../auth/microsoftGraph'
import { PeerTutorService } from './peerTutorService'

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

export interface StudentWithPeerTutor extends Student {
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
    microsoftUser: any,
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
        console.error('Error creating student from Microsoft user:', error)
        return null
      }

      return data as Student
    } catch (error) {
      console.error('Error in createFromMicrosoftUser:', error)
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
        console.error('Error getting all students:', error)
        return []
      }

      return data as Student[] || []
    } catch (error) {
      console.error('Error in getAllStudents:', error)
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
        console.error('Error getting students by section:', error)
        return []
      }

      return data as Student[] || []
    } catch (error) {
      console.error('Error in getStudentsBySection:', error)
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
        console.error('Error checking if student exists:', error)
        return false
      }

      return !!data
    } catch (error) {
      console.error('Error in isStudentExists:', error)
      return false
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
        console.error('Error adding student:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in addStudent:', error)
      return false
    }
  }

  /**
   * Remove a student
   */
  static async removeStudent(id: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('peer_students')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error removing student:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in removeStudent:', error)
      return false
    }
  }

  /**
   * Search for available students using Microsoft Graph (excluding existing students and peer tutors)
   */
  static async searchAvailableStudents(query: string, dept: string, year: string, section: string): Promise<any[]> {
    try {
      // Get all existing student emails to exclude them
      const existingStudents = await this.getStudentsBySection(dept, year, section)
      const existingStudentEmails = existingStudents.map(s => s.email.toLowerCase())

      // Get all existing peer tutor emails to exclude them
      const existingPeerTutors = await PeerTutorService.getAllPeerTutors()
      const existingPeerTutorEmails = existingPeerTutors.map(pt => pt.email.toLowerCase())

      // Combine all emails to exclude
      const allExcludedEmails = [...existingStudentEmails, ...existingPeerTutorEmails]

      // Search Microsoft Graph for students
      const searchResults = await MicrosoftGraphService.searchUsers(query)
      
      // Filter out existing students and peer tutors
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
   * Get all students with their assigned peer tutor information
   */
  static async getAllStudentsWithPeerTutors(): Promise<StudentWithPeerTutor[]> {
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
        .eq('peer_tutor', false)
        .order('name')

      if (error) {
        console.error('Error getting students with peer tutors:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error in getAllStudentsWithPeerTutors:', error)
      return []
    }
  }

  /**
   * Get students assigned to a specific peer tutor
   */
  static async getStudentsByPeerTutor(peerTutorId: string): Promise<Student[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('*')
        .eq('assigned_peer_tutor_id', peerTutorId)
        .eq('peer_tutor', false)
        .order('name')

      if (error) {
        console.error('Error getting students by peer tutor:', error)
        return []
      }

      return data as Student[] || []
    } catch (error) {
      console.error('Error in getStudentsByPeerTutor:', error)
      return []
    }
  }
}
