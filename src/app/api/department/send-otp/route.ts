import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { OtpService } from '@/lib/services/otpService'
import { logger } from '@/lib/logger'
import { MicrosoftTokenService } from '@/lib/auth/microsoftTokenService'

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
    const { deptId } = body

    if (!deptId) {
      return NextResponse.json({ error: 'Department ID is required' }, { status: 400 })
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

    // Target email to send OTP
    const targetEmail = dept.faculty_email || userEmail

    // Generate 6-digit OTP
    const otp = OtpService.generateOtp(deptId, targetEmail)

    // Attempt to send email via Microsoft Graph API if session / provider token exists
    let emailSent = false
    const subject = `Security OTP: Delete Department ${dept.name} - Sona Cohort`
    const content = `Dear ${user.user_metadata?.name || 'Faculty Incharge'},\n\nYour security verification OTP to delete the department "${dept.name}" (ID: ${dept.id}) and remove all associated records is:\n\n${otp}\n\nThis OTP is valid for 10 minutes. If you did not request this department deletion, please ignore this email immediately.\n\nRegards,\nSona Cohort Security System`

    try {
      const { data: { session } } = await supabase.auth.getSession()
      let accessToken = session?.provider_token

      if (!accessToken) {
        const tokenData = await MicrosoftTokenService.refreshAccessToken(user.id)
        accessToken = tokenData?.accessToken || undefined
      }

      if (accessToken) {
        const message = {
          message: {
            subject: subject,
            body: {
              contentType: 'Text',
              content: content,
            },
            toRecipients: [
              {
                emailAddress: {
                  address: targetEmail,
                },
              },
            ],
          },
          saveToSentItems: 'true',
        }

        const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        })

        if (graphRes.ok) {
          emailSent = true
          logger.info(`[send-otp] OTP email sent successfully to ${targetEmail} via Microsoft Graph`)
        } else {
          logger.warn(`[send-otp] Graph API returned ${graphRes.status}. Fallback logger active.`)
        }
      }
    } catch (e) {
      logger.warn('[send-otp] Error attempting to send email via Graph API:', e)
    }

    logger.info(`[SECURITY OTP DISPATCH] Target: ${targetEmail} | Dept: ${dept.name} | OTP: ${otp}`)

    return NextResponse.json({
      success: true,
      message: `OTP sent to ${targetEmail}`,
      targetEmail,
      emailSent,
      // Pass debug OTP in dev mode for convenient testing if needed
      debugOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
    })
  } catch (error) {
    logger.error('Error in send-otp route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
