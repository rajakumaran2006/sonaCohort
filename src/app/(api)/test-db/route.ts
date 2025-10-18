import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Test if we can connect to Supabase
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError) {
      return NextResponse.json({ 
        error: 'Session error', 
        details: sessionError 
      }, { status: 500 })
    }

    if (!session) {
      return NextResponse.json({ 
        error: 'No session found' 
      }, { status: 401 })
    }

    // Test if departments table exists by trying to select from it
    const { data: tableTest, error: tableError } = await supabase
      .from('departments')
      .select('*')
      .limit(1)

    if (tableError) {
      return NextResponse.json({ 
        error: 'Table access error', 
        details: tableError,
        message: 'The departments table might not exist or you might not have permission to access it'
      }, { status: 500 })
    }

    // Test table structure
    const { data: structure, error: structureError } = await supabase
      .from('departments')
      .select('id, name, faculty_name, faculty_email, created_at, updated_at')
      .limit(0)

    if (structureError) {
      return NextResponse.json({ 
        error: 'Structure check error', 
        details: structureError 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Database connection and table access successful',
      tableExists: true,
      rowCount: tableTest?.length || 0,
      structure: 'All required columns are accessible'
    })

  } catch (error) {
    console.error('Database test error:', error)
    return NextResponse.json({ 
      error: 'Database test failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
