import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const { role } = await request.json()
    
    if (!role || !['admin', 'faculty', 'peer', 'student'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
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
