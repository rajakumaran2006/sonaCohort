import { createClient } from '@/utils/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { peertutors } from '../services/peertutorservice'

export class peertutorsAuthService {
  /**
   * Check if a user is a peer tutor
   * @param email User's email from Microsoft authentication
   * @param supabaseClient Optional Supabase client instance (for server-side usage)
   * @returns True if user is a peer tutor, false otherwise
   */
  static async ispeertutors(email: string, supabaseClient?: SupabaseClient): Promise<boolean> {
    try {
      const supabase = supabaseClient || createClient()
      
      const { data, error } = await supabase
        .from('peer_tutors')
        .select('id')
        .eq('email', email)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error checking if user is peer tutor:', error)
        return false
      }

      return !!data
    } catch (error) {
      console.error('Error in ispeertutors:', error)
      return false
    }
  }

  /**
   * Get peer tutor information by email
   * @param email User's email
   * @param supabaseClient Optional Supabase client instance (for server-side usage)
   * @returns Peer tutor data or null
   */
  static async getpeertutorsByEmail(email: string, supabaseClient?: SupabaseClient): Promise<peertutors | null> {
    try {
      const supabase = supabaseClient || createClient()
      
      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('email', email)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error getting peer tutor:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error in getpeertutorsByEmail:', error)
      return null
    }
  }
}
