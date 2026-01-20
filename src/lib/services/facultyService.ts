import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface FacultyDepartment {
  id: string
  name: string
  faculty_name: string
  faculty_email: string
  created_at: string
  admin_email?: string
}

export class FacultyService {
  /**
   * Verify if a faculty member's email matches a department record
   * @param email Faculty member's email from Microsoft authentication
   * @param supabaseClient Optional Supabase client instance (for server-side usage)
   * @returns Department information if verified, null otherwise
   */
  static async verifyFacultyAccess(email: string, supabaseClient?: SupabaseClient): Promise<FacultyDepartment | null> {
    try {
      if (!email || email.trim() === '') {
        logger.info('No email provided for faculty verification')
        return null
      }

      const supabase = supabaseClient || createClient()
      const normalizedEmail = email.trim().toLowerCase()
      
      // First, check if the departments table exists and is accessible
      try {
        const { error } = await supabase
          .from('departments')
          .select('id')
          .limit(1)

        if (error) {
          logger.info('Departments table not accessible:', error.message)
          logger.info('Full error object:', error)
          return null
        }
        
        logger.info('Departments table is accessible, proceeding with faculty verification')
      } catch (tableError) {
        logger.info('Departments table check failed:', tableError)
        return null
      }
      
      // Query the departments table to find a match (case-insensitive, trimmed)
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .ilike('faculty_email', normalizedEmail)
        .maybeSingle() // Use maybeSingle to avoid errors when no record found

      if (error) {
        logger.error('Error verifying faculty access:', error)
        // Log the error details for debugging
        logger.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        return null
      }

      if (data) {
        logger.info('Faculty access verified for department:', data.name, 'for email:', normalizedEmail)
        return data as FacultyDepartment
      }

      logger.info('No department found for email (normalized):', normalizedEmail)

      // Fallback: fetch potential matches and compare after trimming/lowercasing
      const { data: candidates, error: fallbackError } = await supabase
        .from('departments')
        .select('id, name, faculty_email')
        .ilike('faculty_email', `%${normalizedEmail}%`)

      if (fallbackError) {
        logger.info('Fallback email search failed:', fallbackError)
        return null
      }

      if (candidates && candidates.length > 0) {
        const match = (candidates as Array<{ id: string; name: string; faculty_email: string }>).find(c => {
          const stored = (c.faculty_email || '').toLowerCase().replace(/\s+/g, '').trim()
          const incoming = normalizedEmail.replace(/\s+/g, '').trim()
          return stored === incoming
        })

        if (match) {
          logger.info('Faculty access verified via fallback for department:', match.name, 'stored email:', match.faculty_email)
          return match as unknown as FacultyDepartment
        }

        logger.info('Fallback search found candidates but none matched after normalization:', candidates.map(c => c.faculty_email))
      }

      return null
    } catch (error) {
      logger.error('Error in verifyFacultyAccess:', error)
      return null
    }
  }

  /**
   * Get faculty member's department information
   * @param facultyId Faculty member's ID
   * @returns Department information
   */
  static async getFacultyDepartment(facultyId: string): Promise<FacultyDepartment | null> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('id', facultyId)
        .single()

      if (error) {
        logger.error('Error getting faculty department:', error)
        return null
      }

      return data as FacultyDepartment
    } catch (error) {
      logger.error('Error in getFacultyDepartment:', error)
      return null
    }
  }

  /**
   * Get all departments for overview purposes
   * @returns List of all departments
   */
  static async getAllDepartments(): Promise<FacultyDepartment[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name')

      if (error) {
        logger.error('Error getting all departments:', error)
        return []
      }

      return data as FacultyDepartment[] || []
    } catch (error) {
      logger.error('Error in getAllDepartments:', error)
      return []
    }
  }

  /**
   * Check if user has faculty access based on email
   * @param email User's email
   * @returns True if user has faculty access, false otherwise
   */
  static async hasFacultyAccess(email: string): Promise<boolean> {
    try {
      const department = await this.verifyFacultyAccess(email)
      return department !== null
    } catch (error) {
      logger.error('Error checking faculty access:', error)
      return false
    }
  }
}
