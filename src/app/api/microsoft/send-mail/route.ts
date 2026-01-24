import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MicrosoftTokenService } from '@/lib/auth/microsoftTokenService'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Authenticate the user securely
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id

    // Get the session to access the provider_token if available
    const { data: { session } } = await supabase.auth.getSession()

    // Parse request body
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    
    const { to, subject, content } = body

    // Validate required fields
    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json({ error: 'Recipients are required' }, { status: 400 })
    }

    if (!subject || typeof subject !== 'string' || subject.trim() === '') {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json({ error: 'Email content is required' }, { status: 400 })
    }

    // Get the provider token - try session first, then refresh
    let accessToken = session?.provider_token

    // If no token in session, try to refresh using our stored refresh token
    if (!accessToken) {
      logger.info('[send-mail] No provider token in session, attempting Azure refresh...')
      
      const tokenData = await MicrosoftTokenService.refreshAccessToken(userId)
      
      if (!tokenData) {
        logger.error('[send-mail] Failed to refresh token via Azure')
        return NextResponse.json({ 
          error: 'Session expired. Please sign out and sign in again.',
          requiresReauth: true
        }, { status: 401 })
      }
      
      accessToken = tokenData.accessToken
      logger.info('[send-mail] Token refreshed successfully')
    }

    // Build the email message payload for Microsoft Graph
    const message = {
      message: {
        subject: subject.trim(),
        body: {
          contentType: 'HTML',
          content: content.replace(/\n/g, '<br>')
        },
        toRecipients: to.map((email: string) => ({
          emailAddress: {
            address: email.trim()
          }
        }))
      },
      saveToSentItems: true
    }

    logger.info('[send-mail] Sending email to', to.length, 'recipient(s)')

    // Send email via Microsoft Graph
    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    })

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text()
      logger.error(`[send-mail] Microsoft Graph error ${graphResponse.status}:`, errorText)
      
      // Parse error message if possible
      let errorMessage = 'Failed to send email'
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || errorMessage
      } catch {
        // Keep default error message
      }

      // Handle auth errors - try refresh one more time
      if (graphResponse.status === 401 || graphResponse.status === 403) {
        logger.info('[send-mail] Token expired during send, attempting refresh...')
        
        const tokenData = await MicrosoftTokenService.refreshAccessToken(userId)
        
        if (tokenData) {
          // Retry the send with new token
          const retryResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenData.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(message)
          })
          
          if (retryResponse.ok) {
            logger.info('[send-mail] Email sent successfully on retry')
            return NextResponse.json({ success: true })
          }
        }
        
        return NextResponse.json({ 
          error: 'Microsoft session expired. Please sign out and sign in again.',
          requiresReauth: true
        }, { status: 401 })
      }
      
      return NextResponse.json({ error: errorMessage }, { status: graphResponse.status })
    }

    logger.info('[send-mail] Email sent successfully to', to.length, 'recipient(s)')
    return NextResponse.json({ success: true })
    
  } catch (error) {
    logger.error('[send-mail] Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
