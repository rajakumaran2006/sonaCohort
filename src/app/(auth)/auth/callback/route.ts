import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { FacultyService } from '@/lib/services/facultyService'
import { AdminService } from '@/lib/services/adminService'
import { StudentAuthService } from '@/lib/auth/studentAuthService'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/admin/dashboard'

  console.log('Callback route called with:', { code: !!code, next })

  if (code) {
    const supabase = await createClient()
    
    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.session) {
      console.log('Session created successfully:', data.session)
      console.log('User data:', data.session.user)
      console.log('User metadata:', data.session.user?.user_metadata)
      
      const userEmail = data.session.user.email
      if (!userEmail) {
        console.error('No email found in user session')
        return NextResponse.redirect(`${origin}/login?error=authentication_failed`)
      }

      // Determine the correct dashboard path based on user type
      let finalRedirectPath = next
      
      // If next is the default dashboard, determine the correct path
      if (next === '/admin/dashboard') {
        try {
          finalRedirectPath = await AdminService.getDashboardPath(userEmail, supabase)
          console.log('Determined correct dashboard path:', finalRedirectPath)
        } catch (error) {
          console.error('Error determining dashboard path:', error)
          finalRedirectPath = '/admin/dashboard'
        }
      }
      
      // If redirecting to faculty dashboard, verify faculty access
      if (finalRedirectPath.startsWith('/faculty')) {
        try {
          const department = await FacultyService.verifyFacultyAccess(userEmail, supabase)
          if (!department) {
            console.log('Faculty access denied for:', userEmail)
            return NextResponse.redirect(`${origin}/login?error=faculty_access_denied`)
          }
          
          console.log('Faculty access verified for department:', department.name)
        } catch (error) {
          console.error('Error verifying faculty access:', error)
          return NextResponse.redirect(`${origin}/login?error=faculty_verification_failed`)
        }
      }
      
      // If redirecting to admin dashboard, verify admin access
      if (finalRedirectPath.startsWith('/admin')) {
        try {
          const isAdmin = await AdminService.isAdmin(userEmail, supabase)
          if (!isAdmin) {
            console.log('Admin access denied for:', userEmail)
            return NextResponse.redirect(`${origin}/login?error=admin_access_denied`)
          }
          
          console.log('Admin access verified for:', userEmail)
        } catch (error) {
          console.error('Error verifying admin access:', error)
          return NextResponse.redirect(`${origin}/login?error=admin_verification_failed`)
        }
      }

      // If redirecting to peer dashboard, verify peer tutor access
      if (finalRedirectPath.startsWith('/peer')) {
        try {
          const { PeerTutorAuthService } = await import('@/lib/auth/peerTutorAuthService')
          const isPeerTutor = await PeerTutorAuthService.isPeerTutor(userEmail, supabase)
          if (!isPeerTutor) {
            console.log('Peer tutor access denied for:', userEmail)
            return NextResponse.redirect(`${origin}/login?error=peer_access_denied`)
          }
          
          console.log('Peer tutor access verified for:', userEmail)
        } catch (error) {
          console.error('Error verifying peer tutor access:', error)
          return NextResponse.redirect(`${origin}/login?error=peer_verification_failed`)
        }
      }

      // If redirecting to student dashboard, verify student access
      if (finalRedirectPath.startsWith('/student')) {
        try {
          const student = await StudentAuthService.verifyStudent(userEmail, supabase)
          if (!student) {
            console.log('Student access denied for:', userEmail)
            return NextResponse.redirect(`${origin}/login?error=student_access_denied`)
          }
          
          console.log('Student access verified for:', userEmail)
        } catch (error) {
          console.error('Error verifying student access:', error)
          return NextResponse.redirect(`${origin}/login?error=student_verification_failed`)
        }
      }
      
      console.log('Redirecting to:', `${origin}${finalRedirectPath}`)
      return NextResponse.redirect(`${origin}${finalRedirectPath}`)
    } else {
      console.error('Error exchanging code for session:', error)
      return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(error?.message || 'Unknown error')}`)
    }
  }

  // No code provided, redirect to error page
  console.log('No code provided, redirecting to error page')
  return NextResponse.redirect(`${origin}/auth/auth-code-error?error=no_code`)
}
