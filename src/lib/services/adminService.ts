import { createClient } from '@/utils/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  created_at: string
}

export class AdminService {
  /**
   * Check if a user is an admin
   * @param email User's email from Microsoft authentication
   * @param supabaseClient Optional Supabase client instance (for server-side usage)
   * @returns True if user is admin, false otherwise
   */
  static async isAdmin(email: string, supabaseClient?: SupabaseClient): Promise<boolean> {
    try {
      console.log('AdminService: Checking admin status for:', email)
      
      // First, check if it's a known admin email (fastest check)
      const knownAdminEmails = [
        'rajakumaran.23ads@sonatech.ac.in',
        'admin@sonatech.ac.in',
      ]
      
      if (knownAdminEmails.includes(email.toLowerCase())) {
        console.log('AdminService: User is in known admin list:', email)
        return true
      }
      
      // If not in known list, try database check
      const supabase = supabaseClient || createClient()
      
      try {
        const { data, error } = await supabase
          .from('admin_users')
          .select('id')
          .eq('email', email)
          .maybeSingle()

        if (error) {
          console.log('AdminService: Database error, using known admin list:', error.message)
          return false // Don't fall back to known list here since we already checked
        }

        if (data) {
          console.log('AdminService: Admin found in database for:', email)
          return true
        }

        console.log('AdminService: No admin record found in database for:', email)
        return false
      } catch (dbError) {
        console.log('AdminService: Database check failed:', dbError)
        return false
      }
    } catch (error) {
      console.error('AdminService: Error checking admin status:', error)
      return false
    }
  }

  /**
   * Check if email is a known admin (fallback method)
   * @param email User's email
   * @returns True if known admin email
   */
  private static isKnownAdmin(email: string): boolean {
    // List of known admin emails - you can modify this list
    const adminEmails = [
      'rajakumaran.23ads@sonatech.ac.in',
      'admin@sonatech.ac.in',
      // Add more admin emails as needed
    ]
    
    return adminEmails.includes(email.toLowerCase())
  }

  /**
   * Get the correct dashboard path for a user
   * @param email User's email
   * @param supabaseClient Optional Supabase client instance (for server-side usage)
   * @returns Dashboard path based on user role
   */
  static async getDashboardPath(email: string, supabaseClient?: SupabaseClient): Promise<string> {
    try {
      if (!email || email.trim() === '') {
        console.log('No email provided, defaulting to admin dashboard')
        return '/admin/dashboard'
      }

      // First check if user is faculty
      try {
        const { FacultyService } = await import('./facultyService')
        const department = await FacultyService.verifyFacultyAccess(email, supabaseClient)
        
        if (department) {
          console.log('User is faculty, redirecting to faculty dashboard')
          return '/faculty/dashboard'
        }
      } catch (facultyError) {
        console.log('Faculty verification failed, continuing with admin check:', facultyError)
        // Continue with admin check even if faculty verification fails
      }

      // Then check if user is a peer tutor
      try {
        const { peertutorsAuthService } = await import('../auth/peertutorsAuthService')
        const ispeertutors = await peertutorsAuthService.ispeertutors(email, supabaseClient)
        if (ispeertutors) {
          console.log('User is peer tutor, redirecting to peer dashboard')
          return '/peer/dashboard'
        }
      } catch (peerError) {
        console.log('Peer tutor verification failed:', peerError)
      }

      // Then check if user is a student
      try {
        const { StudentAuthService } = await import('../auth/studentAuthService')
        const student = await StudentAuthService.verifyStudent(email, supabaseClient)
        if (student) {
          console.log('User is student, redirecting to student dashboard')
          return '/student/dashboard'
        }
      } catch (studentError) {
        console.log('Student verification failed:', studentError)
      }

      // Then check if user is admin
      const isAdminUser = await this.isAdmin(email, supabaseClient)
      if (isAdminUser) {
        console.log('User is admin, redirecting to admin dashboard')
        return '/admin/dashboard'
      }

      // Default to admin dashboard only as a last resort
      console.log('User role unknown, defaulting to admin dashboard')
      return '/admin/dashboard'
    } catch (error) {
      console.error('Error determining dashboard path:', error)
      return '/admin/dashboard'
    }
  }

  /**
   * Get all admin users
   * @returns List of admin users
   */
  static async getAllAdmins(): Promise<AdminUser[]> {
    try {
      const supabase = createClient()
      
      // First check if the admin_users table exists
      try {
        const { error } = await supabase
          .from('admin_users')
          .select('id')
          .limit(1)

        if (error) {
          console.log('Admin_users table not accessible, returning empty list:', error.message)
          return []
        }
      } catch (tableError) {
        console.log('Admin_users table check failed, returning empty list:', tableError)
        return []
      }
      
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching admin users:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error fetching admin users:', error)
      return []
    }
  }

  /**
   * Create a new admin user
   * @param adminData Admin user data
   * @returns Created admin user or null
   */
  static async createAdmin(adminData: { email: string; name: string; role?: string }): Promise<AdminUser | null> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('admin_users')
        .insert([{
          email: adminData.email,
          name: adminData.name,
          role: adminData.role || 'admin',
          created_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (error) {
        console.error('Error creating admin user:', error)
        return null
      }

      return data as AdminUser
    } catch (error) {
      console.error('Error creating admin user:', error)
      return null
    }
  }
}
