import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { RoleDetectionService, UserRole } from '@/lib/services/roleDetectionService'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { role } = await request.json()
    
    if (!role || !['admin', 'faculty', 'peer', 'student'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Verify user actually has this role using RoleDetectionService
    // We cast role to UserRole because we've already validated it's one of the allowed strings
    const hasRole = await RoleDetectionService.hasRole(user.email, role as UserRole, supabase)
    
    if (!hasRole) {
      logger.warn(`User ${user.email} attempted to set unauthorized role: ${role}`)
      return NextResponse.json({ error: 'Unauthorized role assignment' }, { status: 403 })
    }

    const response = NextResponse.json({ success: true })
    
    // Set the role cookie
    response.cookies.set('user_role', role, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    })

    return response
  } catch (error) {
    logger.error('Error setting role:', error)
    return NextResponse.json({ error: 'Failed to set role' }, { status: 500 })
  }
}
