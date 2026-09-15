import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { FacultyService } from '@/lib/services/facultyService'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { departmentId } = body

    if (!departmentId || typeof departmentId !== 'string') {
      return NextResponse.json({ error: 'Invalid department ID' }, { status: 400 })
    }

    // Check if user has access to this department
    const departments = await FacultyService.getAllFacultyDepartments(user.email, supabase)
    const matchedDept = departments.find(d => d.id === departmentId)

    if (!matchedDept) {
      logger.warn(`User ${user.email} attempted to set unauthorized department: ${departmentId}`)
      return NextResponse.json({ error: 'Unauthorized department access' }, { status: 403 })
    }

    const response = NextResponse.json({ 
      success: true, 
      department: {
        id: matchedDept.id,
        name: matchedDept.name,
      } 
    })

    // Set active faculty department cookie
    response.cookies.set('active_faculty_dept_id', departmentId, {
      path: '/',
      httpOnly: false, // Accessible from client-side JavaScript as well
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    })

    return response
  } catch (error) {
    logger.error('Error in /api/set-department:', error)
    return NextResponse.json({ error: 'Failed to set active department' }, { status: 500 })
  }
}
