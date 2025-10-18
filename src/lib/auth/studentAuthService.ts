import { createClient } from '@/utils/supabase/client'
import { Student } from '../services/studentService'
import type { SupabaseClient } from '@supabase/supabase-js'

export class StudentAuthService {
  /**
   * Verify if a user is a registered student
   * @param email User's email from Microsoft authentication
   * @param supabaseClient Optional Supabase client instance (for server-side usage)
   */
  static async verifyStudent(email: string, supabaseClient?: SupabaseClient): Promise<Student | null> {
    try {
      const supabase = supabaseClient || createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('*')
        .eq('email', email)
        .eq('peer_tutor', false)
        .single()

      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          return null
        }
        console.error('Error verifying student:', error)
        return null
      }

      return data as Student
    } catch (error) {
      console.error('Error in verifyStudent:', error)
      return null
    }
  }

  /**
   * Get student dashboard path
   * @param email User's email
   * @param supabaseClient Optional Supabase client instance (for server-side usage)
   */
  static async getStudentDashboardPath(email: string, supabaseClient?: SupabaseClient): Promise<string> {
    try {
      const student = await this.verifyStudent(email, supabaseClient)
      
      if (student) {
        return '/student/dashboard'
      }
      
      throw new Error('Student not found')
    } catch (error) {
      console.error('Error getting student dashboard path:', error)
      throw error
    }
  }
}