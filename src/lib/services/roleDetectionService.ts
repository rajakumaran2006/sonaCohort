import { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { AdminService } from './adminService'
import { FacultyService } from './facultyService'
import { peertutorservice} from './peerTutorService'
import { StudentService } from './studentService'
import { getEmailVariants } from '@/lib/utils/emailUtils'

export type UserRole = 'admin' | 'faculty' | 'peer' | 'student'

export interface UserRoleInfo {
  roles: UserRole[]
  dashboardPaths: Record<UserRole, string>  
}

export class RoleDetectionService {
  /**
   * Detect all available roles for a user by email
   * Checks in order: Faculty → Admin → Peer Tutor → Student
   * @param email User's email address
   * @param supabaseClient Optional Supabase client for server-side usage
   * @returns Object containing all available roles and their dashboard paths
   */
  static async detectUserRoles(
    email: string,
    supabaseClient?: SupabaseClient
  ): Promise<UserRoleInfo> {
    const roles: UserRole[] = []
    const dashboardPaths: Partial<Record<UserRole, string>> = {}

    const normalizedEmail = email?.trim()?.toLowerCase()
    if (!normalizedEmail) {
      // console.log('No email provided for role detection')
      return { roles, dashboardPaths: dashboardPaths as Record<UserRole, string> }
    }

    try {
      // Check Faculty (first priority)
      try {
        const department = await FacultyService.verifyFacultyAccess(normalizedEmail, supabaseClient)
        if (department) {
          roles.push('faculty')
          dashboardPaths.faculty = '/faculty/dashboard'
          // console.log('User has faculty role')
        }
      } catch {
        // console.log('Faculty check failed:', error)
      }
      
      // If not added as department faculty, check individual faculty
      if (!roles.includes('faculty')) {
        try {
           const isIndividual = await FacultyService.isFacultyMember(normalizedEmail, supabaseClient)
           if (isIndividual) {
             roles.push('faculty')
             dashboardPaths.faculty = '/faculty-portal/dashboard'
           }
        } catch {
           // Ignore error
        }
      }

      // Check Admin (second priority)
      try {
        const isAdmin = await AdminService.isAdmin(normalizedEmail, supabaseClient)
        if (isAdmin) {
          roles.push('admin')
          dashboardPaths.admin = '/admin/dashboard'
          // console.log('User has admin role')
        }
      } catch {
        // console.log('Admin check failed:', error)
      }

      // Check Peer Tutor (third priority)
      try {
        const client = supabaseClient
        const variants = getEmailVariants(normalizedEmail)
        if (client) {
          const { data: peerTutor } = await client
             .from('peer_tutors')
             .select('faculty_id')
             .in('email', variants)
             .limit(1)
          
            if (peerTutor && peerTutor.length > 0) {
              roles.push('peer')
              dashboardPaths.peer = '/peer/dashboard'
            }
        } else {
          // Fallback if no client provided (unlikely in auth flow)
          const ispeertutors = await peertutorservice.isAlreadypeertutors(normalizedEmail)
          if (ispeertutors) {
            roles.push('peer')
            dashboardPaths.peer = '/peer/dashboard'
          }
        }
      } catch (err) {
        logger.error('Peer tutor check error:', err)
      }

      // Check Student (fourth priority)
      try {
        const client = supabaseClient
        const variants = getEmailVariants(normalizedEmail)
        if (client) {
          const { data: student } = await client
            .from('peer_students')
            .select('id, email, name, assigned_peer_tutor_id')
            .in('email', variants)
            .limit(1)
          
          if (student && student.length > 0) {
            roles.push('student')
            dashboardPaths.student = '/student/dashboard'
          }
        } else {
          // Fallback to client-side service
          const student = await StudentService.getStudentByEmail(normalizedEmail)
          if (student) {
            roles.push('student')
            dashboardPaths.student = '/student/dashboard'
          }
        }
      } catch (err) {
        logger.error('Student check error:', err)
      }

      // console.log(`Role detection complete for ${normalizedEmail}:`, roles)
      return { 
        roles, 
        dashboardPaths: dashboardPaths as Record<UserRole, string> 
      }
    } catch (error) {
      logger.error('Error detecting user roles:', error)
      return { roles, dashboardPaths: dashboardPaths as Record<UserRole, string> }
    }
  }

  /**
   * Get the primary dashboard path for a user
   * If user has multiple roles, returns the highest priority role's dashboard
   * Priority order: Faculty > Admin > Peer Tutor > Student
   * @param email User's email address
   * @param supabaseClient Optional Supabase client
   * @returns Primary dashboard path
   */
  static async getPrimaryDashboardPath(
    email: string,
    supabaseClient?: SupabaseClient
  ): Promise<string> {
    const { roles, dashboardPaths } = await this.detectUserRoles(email, supabaseClient)

    if (roles.length === 0) {
      // console.log('No roles found, returning default path')
      return '/login?error=no_access'
    }

    // Return the first role's dashboard (highest priority)
    const primaryRole = roles[0]
    return dashboardPaths[primaryRole] || '/login?error=no_access'
  }

  /**
   * Check if a user has a specific role
   * @param email User's email address
   * @param role Role to check
   * @param supabaseClient Optional Supabase client
   * @returns True if user has the role
   */
  static async hasRole(
    email: string,
    role: UserRole,
    supabaseClient?: SupabaseClient
  ): Promise<boolean> {
    const { roles } = await this.detectUserRoles(email, supabaseClient)
    return roles.includes(role)
  }

  /**
   * Check if a user has multiple roles
   * @param email User's email address
   * @param supabaseClient Optional Supabase client
   * @returns True if user has more than one role
   */
  static async hasMultipleRoles(
    email: string,
    supabaseClient?: SupabaseClient
  ): Promise<boolean> {
    const { roles } = await this.detectUserRoles(email, supabaseClient)
    return roles.length > 1
  }
}
