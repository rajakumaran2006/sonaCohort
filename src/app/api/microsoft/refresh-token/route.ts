import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { MicrosoftTokenService } from '@/lib/auth/microsoftTokenService'

export async function POST() {
  try {
    const supabase = await createClient()
    
    // Authenticate the user securely
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id

    // Get the session for token operations
    // const { data: { session } } = await supabase.auth.getSession()

    // First, try to refresh the Supabase session (this might give us a new provider_token)
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
    
    if (!refreshError && refreshedSession?.provider_token) {
      // Supabase refresh worked, return the new token
      return NextResponse.json({ 
        accessToken: refreshedSession.provider_token,
        source: 'supabase_refresh'
      })
    }

    // If Supabase refresh didn't give us a token, use our stored refresh token
    logger.info('Supabase refresh did not return provider_token, using stored refresh token')
    
    const tokenData = await MicrosoftTokenService.refreshAccessToken(userId)
    
    if (!tokenData) {
      logger.warn('Failed to refresh Microsoft token - user needs to re-authenticate')
      return NextResponse.json({ 
        error: 'Token refresh failed. Please sign in again.',
        requiresReauth: true 
      }, { status: 401 })
    }

    return NextResponse.json({ 
      accessToken: tokenData.accessToken,
      expiresAt: tokenData.expiresAt,
      source: 'azure_refresh'
    })
  } catch (error) {
    logger.error('Error refreshing Microsoft token:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
