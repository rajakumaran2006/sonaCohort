import { createClient } from '@/lib/supabase/client'
import { Student } from '../services/studentService'
import { logger } from '@/lib/logger'
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
        .ilike('email', email)
        .eq('peer_tutor', false)
        .limit(1)
        .maybeSingle()

      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          return null
        }
        logger.error('Error verifying student:', error)
        return null
      }

      return data as Student
    } catch (error) {
      logger.error('Error in verifyStudent:', error)
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
      logger.error('Error getting student dashboard path:', error)
      throw error
    }
  }
}