import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { OtpService } from '@/lib/services/otpService'
import { DepartmentService } from '@/lib/services/departmentService'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Authenticate user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized user' }, { status: 401 })
    }

    const userEmail = user.email.toLowerCase().trim()

    const body = await request.json()
    const { deptId, otp } = body

    if (!deptId || !otp) {
      return NextResponse.json({ error: 'Department ID and OTP are required' }, { status: 400 })
    }

    // Verify department exists
    const { data: dept, error: deptError } = await supabase
      .from('departments')
      .select('id, name, faculty_email')
      .eq('id', deptId)
      .single()

    if (deptError || !dept) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    }

    // Verify user authorization: must be superadmin or match department faculty_email
    const { data: superadmin } = await supabase
      .from('superadmin')
      .select('id')
      .eq('email', userEmail)
      .maybeSingle()

    const isDeptIncharge = dept.faculty_email && dept.faculty_email.toLowerCase().trim() === userEmail

    if (!superadmin && !isDeptIncharge) {
      return NextResponse.json({ error: 'Access denied: You can only delete departments allocated to you' }, { status: 403 })
    }

    const targetEmail = dept.faculty_email || userEmail

    // Verify OTP
    const verification = OtpService.verifyOtp(deptId, targetEmail, otp)

    if (!verification.valid) {
      return NextResponse.json({ error: verification.reason || 'Invalid OTP' }, { status: 400 })
    }

    logger.info(`[DELETE DEPT] OTP Verified successfully. Proceeding to delete department ${dept.name} (${dept.id})`)

    // Perform cascade delete
    const deleteSuccess = await DepartmentService.deleteDepartment(deptId)

    if (!deleteSuccess) {
      return NextResponse.json({ error: 'Failed to delete department records' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Department "${dept.name}" and all associated records have been permanently deleted.`
    })
  } catch (error) {
    logger.error('Error in delete-with-otp route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
