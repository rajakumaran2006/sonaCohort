import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get the current session
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session) {
      return NextResponse.json({ error: 'No session found' }, { status: 401 })
    }

    // For Microsoft OAuth, we need to get the provider token
    // This will be the Microsoft access token that can be used with Graph API
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json({ error: 'No user found' }, { status: 401 })
    }

    // Get the provider token from the user's session
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    
    if (!currentSession?.provider_token) {
      console.warn('No provider token found - user may not have Microsoft OAuth session')
      return NextResponse.json({ error: 'No Microsoft token available' }, { status: 401 })
    }

    return NextResponse.json({ 
      accessToken: currentSession.provider_token 
    })
  } catch (error) {
    console.error('Error getting Microsoft token:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
