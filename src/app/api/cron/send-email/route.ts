import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftTokenService } from '@/lib/auth/microsoftTokenService'
import { logger } from '@/lib/logger'

/**
 * Server-side email sending endpoint for cron jobs
 * This endpoint sends emails on behalf of faculty members using their stored Microsoft tokens
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    
    const { from, to, subject, content } = body

    // Validate required fields
    if (!from || typeof from !== 'string') {
      return NextResponse.json({ error: 'Sender email (from) is required' }, { status: 400 })
    }

    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json({ error: 'Recipients are required' }, { status: 400 })
    }

    if (!subject || typeof subject !== 'string' || subject.trim() === '') {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json({ error: 'Email content is required' }, { status: 400 })
    }

    // Initialize Supabase Admin Client (Service Role)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Find the faculty department record
    const { data: deptData, error: deptError } = await supabase
      .from('departments')
      .select('*')
      .ilike('faculty_email', from.trim())
      .maybeSingle()

    if (deptError || !deptData) {
      logger.error('[cron-email] Faculty not found:', from, deptError)
      return NextResponse.json({ error: 'Faculty member not found' }, { status: 404 })
    }

    // Get stored tokens for this faculty member
    // We need to find their Supabase auth user ID
    // Since we're using Microsoft auth, we can look up by email in auth.users
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
    
    if (usersError) {
      logger.error('[cron-email] Error listing users:', usersError)
      return NextResponse.json({ error: 'Failed to authenticate sender' }, { status: 500 })
    }

    const facultyUser = users.find(u => 
      u.email?.toLowerCase() === from.toLowerCase() ||
      u.user_metadata?.email?.toLowerCase() === from.toLowerCase()
    )

    if (!facultyUser) {
      logger.error('[cron-email] Faculty user not found in auth.users:', from)
      return NextResponse.json({ error: 'Faculty authentication not found' }, { status: 404 })
    }

    // Get or refresh access token (pass admin client to bypass RLS in cron context)
    const tokenData = await MicrosoftTokenService.refreshAccessToken(facultyUser.id, supabase)
    
    if (!tokenData) {
      logger.error('[cron-email] Failed to get access token for:', from)
      return NextResponse.json({ 
        error: 'Failed to authenticate. Faculty member may need to sign in again.',
        requiresReauth: true
      }, { status: 401 })
    }

    // Build the email message payload for Microsoft Graph
    const message = {
      message: {
        subject: subject.trim(),
        body: {
          contentType: 'HTML',
          content: content
        },
        toRecipients: to.map((email: string) => ({
          emailAddress: {
            address: email.trim()
          }
        }))
      },
      saveToSentItems: true
    }

    logger.info(`[cron-email] Sending email from ${from} to ${to.length} recipient(s)`)

    // Send email via Microsoft Graph
    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    })

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text()
      logger.error(`[cron-email] Microsoft Graph error ${graphResponse.status}:`, errorText)
      
      // Parse error message if possible
      let errorMessage = 'Failed to send email'
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || errorMessage
      } catch {
        // Keep default error message
      }
      
      return NextResponse.json({ error: errorMessage }, { status: graphResponse.status })
    }

    logger.info(`[cron-email] Email sent successfully from ${from} to ${to.length} recipient(s)`)
    return NextResponse.json({ success: true })
    
  } catch (error) {
    logger.error('[cron-email] Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
