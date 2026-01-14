import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RoleDetectionService } from '@/lib/services/roleDetectionService'
import { logger } from '@/lib/logger'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    
    // Verify the user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user || user.email !== email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Detect all available roles for the user
    const { roles, dashboardPaths } = await RoleDetectionService.detectUserRoles(email, supabase)

    logger.info(`Detected roles for ${email}:`, roles)

    return NextResponse.json({ roles, dashboardPaths })

  } catch (error) {
    logger.error('Error detecting roles:', error)
    return NextResponse.json(
      { error: 'Failed to detect roles' },
      { status: 500 }
    )
  }
}
