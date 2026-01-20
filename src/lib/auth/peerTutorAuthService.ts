import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import { peertutors } from '../services/peerTutorService'

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

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found - user is not a peer tutor
          return false
        }
        
        // Log actual errors
        logger.error('Error checking if user is peer tutor:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          email: email,
          fullError: error
        })
        return false
      }

      return !!data
    } catch (error) {
      logger.error('Error in ispeertutors:', {
        error: error instanceof Error ? error.message : String(error),
        email: email,
        fullError: error
      })
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

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found - this is expected when user is not a peer tutor
          logger.debug(`No peer tutor found for email: ${email}`)
          return null
        }
        
        // Log the full error object with all properties
        logger.error('Error getting peer tutor:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          email: email,
          fullError: error
        })
        return null
      }

      return data
    } catch (error) {
      logger.error('Error in getpeertutorsByEmail:', {
        error: error instanceof Error ? error.message : String(error),
        email: email,
        fullError: error
      })
      return null
    }
  }
}
