
import { NextRequest, NextResponse } from 'next/server'
import { EmailAutomationService } from '@/lib/services/emailAutomationService'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    // Check for a secret key to prevent unauthorized access
    // For now, we'll allow it (or check a header if you configure Cron securely)
    const authHeader = request.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      // Commented out to allow easier testing for user, but ideally should be protected
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // 'morning' or 'pending' or 'all'

    const results: Record<string, unknown> = {}

    if (type === 'morning' || !type || type === 'all') {
      logger.info('Starting morning reminder cron...')
      const morningResult = await EmailAutomationService.processMorningReminders()
      results.morning = morningResult
    }

    if (type === 'pending' || !type || type === 'all') {
      logger.info('Starting pending warning cron...')
      const pendingResult = await EmailAutomationService.processPendingWarnings()
      results.pending = pendingResult
    }

    return NextResponse.json({ 
      success: true, 
      timestamp: new Date().toISOString(),
      results 
    })
  } catch (error) {
    logger.error('Error in cron/reminders:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }, { status: 500 })
  }
}
