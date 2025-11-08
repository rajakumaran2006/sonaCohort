import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    
    // Get the current session
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session) {
      return NextResponse.json({ error: 'No session found' }, { status: 401 })
    }

    // Try to refresh the session to get a new provider token
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
    
    if (refreshError || !refreshedSession) {
      console.error('Error refreshing session:', refreshError)
      return NextResponse.json({ error: 'Failed to refresh session' }, { status: 401 })
    }

    // Check if we now have a provider token
    if (!refreshedSession.provider_token) {
      console.warn('No provider token after refresh - user may need to re-authenticate')
      return NextResponse.json({ error: 'No Microsoft token available after refresh' }, { status: 401 })
    }

    return NextResponse.json({ 
      accessToken: refreshedSession.provider_token 
    })
  } catch (error) {
    console.error('Error refreshing Microsoft token:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
