'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export interface Superadmin {
  id: string
  email: string
  name: string
  created_at: string
}

/**
 * Service for managing superadmin data
 */
export class SuperadminService {
  /**
   * Get all superadmins
   */
  static async getSuperadmins(): Promise<Superadmin[]> {
    try {
      const supabase = await createClient()
      
      const { data, error } = await supabase
        .from('superadmin')
        .select('*')
        .order('name', { ascending: true })

      if (error) {
        logger.error('Error fetching superadmins:', error)
        return []
      }

      return data || []
    } catch (error) {
      logger.error('Error in getSuperadmins:', error)
      return []
    }
  }

  /**
   * Verify if a user has superadmin access by email
   * @param email The email to verify
   * @returns The superadmin record if found, null otherwise
   */
  static async verifySuperadminAccess(email: string): Promise<Superadmin | null> {
    try {
      const supabase = await createClient()
      
      const { data, error } = await supabase
        .from('superadmin')
        .select('*')
        .eq('email', email.toLowerCase())
        .single()

      if (error) {
        logger.info('User not found in superadmin table:', email)
        return null
      }

      logger.info('Superadmin access verified for:', email)
      return data
    } catch (error) {
      logger.error('Error in verifySuperadminAccess:', error)
      return null
    }
  }

  /**
   * Get superadmin by ID
   */
  static async getSuperadminById(id: string): Promise<Superadmin | null> {
    try {
      const supabase = await createClient()
      
      const { data, error } = await supabase
        .from('superadmin')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        logger.error('Error fetching superadmin by ID:', error)
        return null
      }

      return data
    } catch (error) {
      logger.error('Error in getSuperadminById:', error)
      return null
    }
  }
}
