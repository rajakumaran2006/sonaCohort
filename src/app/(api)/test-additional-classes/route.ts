import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createClient()
    
    // Test 1: Check if additional_classes table exists
    const { data: tableCheck, error: tableError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'additional_classes')
      .single()

    if (tableError && tableError.code !== 'PGRST116') {
      return NextResponse.json({
        success: false,
        error: 'Database connection error',
        details: tableError.message
      }, { status: 500 })
    }

    if (!tableCheck) {
      return NextResponse.json({
        success: false,
        error: 'additional_classes table does not exist',
        message: 'Please run the migration script: additional_classes_migration.sql'
      }, { status: 404 })
    }

    // Test 2: Check if additional_class_id column exists in attendance table
    const { data: columnCheck, error: columnError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'attendance')
      .eq('column_name', 'additional_class_id')
      .single()

    if (columnError && columnError.code !== 'PGRST116') {
      return NextResponse.json({
        success: false,
        error: 'Error checking attendance table',
        details: columnError.message
      }, { status: 500 })
    }

    if (!columnCheck) {
      return NextResponse.json({
        success: false,
        error: 'additional_class_id column does not exist in attendance table',
        message: 'Please run the migration script: additional_classes_migration.sql'
      }, { status: 404 })
    }

    // Test 3: Try to query the additional_classes table (should return empty array if table exists)
    const { data: testQuery, error: queryError } = await supabase
      .from('additional_classes')
      .select('id')
      .limit(1)

    if (queryError) {
      return NextResponse.json({
        success: false,
        error: 'Error querying additional_classes table',
        details: queryError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Additional classes database setup is correct',
      tests: {
        tableExists: true,
        columnExists: true,
        queryWorks: true
      }
    })

  } catch (error) {
    console.error('Test error:', error)
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
