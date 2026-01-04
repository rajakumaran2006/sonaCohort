import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Test if additional_classes table exists and is accessible
    const { data: additionalClasses, error: classesError } = await supabase
      .from('additional_classes')
      .select('*')
      .limit(5)

    if (classesError) {
      return NextResponse.json({
        success: false,
        error: 'Error accessing additional_classes table',
        details: classesError.message
      }, { status: 500 })
    }

    // Test if additional_class_attendance table exists and is accessible
    const { data: attendanceRecords, error: attendanceError } = await supabase
      .from('additional_class_attendance')
      .select('*')
      .limit(5)

    if (attendanceError) {
      return NextResponse.json({
        success: false,
        error: 'Error accessing additional_class_attendance table',
        details: attendanceError.message
      }, { status: 500 })
    }

    // Test if we can join the tables
    const { data: joinedData, error: joinError } = await supabase
      .from('additional_classes')
      .select(`
        *,
        attendance:additional_class_attendance(*)
      `)
      .limit(3)

    if (joinError) {
      return NextResponse.json({
        success: false,
        error: 'Error joining tables',
        details: joinError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Database tables are accessible',
      data: {
        additionalClassesCount: additionalClasses?.length || 0,
        attendanceRecordsCount: attendanceRecords?.length || 0,
        joinedDataCount: joinedData?.length || 0,
        sampleAdditionalClasses: additionalClasses,
        sampleAttendanceRecords: attendanceRecords,
        sampleJoinedData: joinedData
      }
    })

  } catch (error) {
    console.error('Error in test API:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
