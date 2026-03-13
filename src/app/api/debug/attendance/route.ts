import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email') || 'student@example.com'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: studentTrue } = await supabase.from('peer_students').select('*').ilike('email', email).eq('peer_tutor', true).limit(1).maybeSingle()
  const { data: studentFalse } = await supabase.from('peer_students').select('*').ilike('email', email).eq('peer_tutor', false).limit(1).maybeSingle()

  return NextResponse.json({ 
    foundAsPeerTutor: !!studentTrue,
    foundAsStudent: !!studentFalse,
    studentFalse
  })
}
