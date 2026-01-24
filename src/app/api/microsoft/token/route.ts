import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { MicrosoftTokenService } from '@/lib/auth/microsoftTokenService'

export async function GET() {
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

    // First, check if we have a valid provider_token in the session
    if (session?.provider_token) {
      return NextResponse.json({ 
        accessToken: session.provider_token,
        source: 'session'
      })
    }

    // If no provider_token, try to refresh using our stored refresh token
    logger.info('No provider_token in session, attempting token refresh')
    
    const tokenData = await MicrosoftTokenService.refreshAccessToken(userId)
    
    if (!tokenData) {
      logger.warn('No Microsoft token available - user may need to re-authenticate')
      return NextResponse.json({ 
        error: 'No Microsoft token available',
        requiresReauth: true 
      }, { status: 401 })
    }

    return NextResponse.json({ 
      accessToken: tokenData.accessToken,
      expiresAt: tokenData.expiresAt,
      source: 'refreshed'
    })
  } catch (error) {
    logger.error('Error getting Microsoft token:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
