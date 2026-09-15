import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import { peertutors } from '../services/peerTutorService'
import { getEmailVariants } from '@/lib/utils/emailUtils'

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
      const variants = getEmailVariants(email)
      
      const { data, error } = await supabase
        .from('peer_tutors')
        .select('id')
        .in('email', variants)
        .limit(1)

      if (error) {
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

      return !!(data && data.length > 0)
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
      const variants = getEmailVariants(email)
      
      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .in('email', variants)
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) {
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

      return (data && data.length > 0) ? data[0] : null
    } catch (error) {
      logger.error('Error in getpeertutorsByEmail:', {
        error: error instanceof Error ? error.message : String(error),
        email: email,
        fullError: error
      })
      return null
    }
  }

  /**
   * Get all peer tutor allocations for a user by email
   * @param email User's email
   * @param supabaseClient Optional Supabase client instance
   * @returns Array of peer tutor allocations
   */
  static async getAllpeertutorsByEmail(email: string, supabaseClient?: SupabaseClient): Promise<peertutors[]> {
    try {
      const supabase = supabaseClient || createClient()
      const variants = getEmailVariants(email)
      
      const { data, error } = await supabase
        .from('peer_tutors')
        .select('*')
        .in('email', variants)
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('Error getting all peer tutors for email:', {
          message: error.message,
          code: error.code,
          email
        })
        return []
      }

      // Sort allocations by created_at DESC (most recently allocated department first)
      const sorted = (data || []).sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0
        return timeB - timeA
      })

      return sorted
    } catch (error) {
      logger.error('Error in getAllpeertutorsByEmail:', {
        error: error instanceof Error ? error.message : String(error),
        email
      })
      return []
    }
  }
}
