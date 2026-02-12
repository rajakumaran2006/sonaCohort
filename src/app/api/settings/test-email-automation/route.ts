import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EmailAutomationService } from '@/lib/services/emailAutomationService'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get faculty department
    const { data: dept, error: deptError } = await supabase
      .from('departments')
      .select('id, name')
      .ilike('faculty_email', user.email)
      .single()

    if (deptError || !dept) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    }

    // Trigger automation with force=true
    const result = await EmailAutomationService.processMorningReminders({
      departmentId: dept.id,
      force: true
    }, supabase)

    return NextResponse.json(result)

  } catch (error) {
    logger.error('Error in test-email-automation:', error)
    return NextResponse.json({ 
      success: false, 
      errors: [error instanceof Error ? error.message : String(error)] 
    }, { status: 500 })
  }
}
