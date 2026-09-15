import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RoleDetectionService } from '@/lib/services/roleDetectionService'
import { MicrosoftTokenService } from '@/lib/auth/microsoftTokenService'
import { FacultyService } from '@/lib/services/facultyService'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { logger } from '@/lib/logger'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      // Store the Microsoft refresh token for future token refreshes
      if (data.session?.provider_refresh_token) {
        await MicrosoftTokenService.storeRefreshToken(
          data.user.id,
          data.session.provider_refresh_token
        )
        logger.info('Stored Microsoft refresh token for user:', data.user.id)
      }
      
      const userEmail = data.user.email
      
      if (!userEmail) {
        logger.error('No email found for user')
        return NextResponse.redirect(`${origin}/login?error=no_email`)
      }

      try {
        // Detect all available roles for the user
        const { roles, dashboardPaths } = await RoleDetectionService.detectUserRoles(userEmail, supabase)
        
        logger.info(`Detected roles for ${userEmail}:`, roles)

        // If user has no roles, they don't have access
        if (roles.length === 0) {
          logger.info(`User ${userEmail} has no access`)
          // Sign out the user
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/login?error=no_access`)
        }

        // If user has exactly one role, check whether they have multiple departments/allocations
        if (roles.length === 1) {
          const role = roles[0]

          // Check if single-role faculty has multiple departments
          if (role === 'faculty') {
            const departments = await FacultyService.getAllFacultyDepartments(userEmail, supabase)
            if (departments.length > 1) {
              logger.info(`Faculty ${userEmail} has ${departments.length} departments, redirecting to select-department`)
              const response = NextResponse.redirect(`${origin}/auth/select-department?next=${encodeURIComponent(next)}`)
              response.cookies.set('user_role', 'faculty', {
                path: '/',
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
              })
              return response
            }
          }

          // Check if single-role peer tutor has multiple allocations
          if (role === 'peer') {
            const allocations = await peertutorsAuthService.getAllpeertutorsByEmail(userEmail, supabase)
            if (allocations.length > 1) {
              logger.info(`Peer tutor ${userEmail} has ${allocations.length} allocations, redirecting to select-department`)
              const response = NextResponse.redirect(`${origin}/auth/select-department?role=peer&next=${encodeURIComponent(next)}`)
              response.cookies.set('user_role', 'peer', {
                path: '/',
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
              })
              return response
            }
          }

          const dashboardPath = dashboardPaths[role]
          logger.info(`User has single role: ${role}, redirecting to ${dashboardPath}`)
          
          // Store the selected role
          const response = NextResponse.redirect(`${origin}${dashboardPath}`)
          response.cookies.set('user_role', role, { 
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
          })
          return response
        }

        // If user has multiple roles, redirect to role selection page
        logger.info(`User has multiple roles: ${roles.join(', ')}, redirecting to role selection`)
        const pathsParam = encodeURIComponent(JSON.stringify(dashboardPaths))
        const response = NextResponse.redirect(`${origin}/auth/select-role?roles=${roles.join(',')}&paths=${pathsParam}&next=${encodeURIComponent(next)}`)
        return response

      } catch (roleError) {
        logger.error('Error detecting user roles:', roleError)
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=role_detection_failed`)
      }
    } else if (error) {
      logger.error('Error exchanging code for session:', error)
      return NextResponse.redirect(`${origin}/login?error=auth_failed`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
