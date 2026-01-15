import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RoleDetectionService } from '@/lib/services/roleDetectionService'
import { logger } from '@/lib/logger'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
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

        // If user has exactly one role, redirect directly to that dashboard
        if (roles.length === 1) {
          const role = roles[0]
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
        const response = NextResponse.redirect(`${origin}/auth/select-role?roles=${roles.join(',')}&next=${encodeURIComponent(next)}`)
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
