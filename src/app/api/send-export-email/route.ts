import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { FacultyService } from '@/lib/services/facultyService'
import { ExportGenerationService } from '@/lib/services/exportGenerationService'
import { AVAILABLE_EXPORTS } from '@/lib/services/emailService'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { facultyEmail, selectedExportIds } = body

    if (!facultyEmail || !selectedExportIds || selectedExportIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get server-side Supabase client
    const supabase = await createClient()

    // Get faculty department
    const department = await FacultyService.verifyFacultyAccess(facultyEmail, supabase)
    if (!department) {
      return NextResponse.json(
        { success: false, error: 'Faculty not found' },
        { status: 404 }
      )
    }

    // Get admin email from department
    // Prioritize the admin email set in the department record
    const adminEmail = department.admin_email || process.env.ADMIN_EMAIL || 'admin@peertutors.edu'

    // Generate exports
    const exportFiles = await ExportGenerationService.generateExports(
      selectedExportIds,
      facultyEmail,
      department.name
    )

    if (exportFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate exports' },
        { status: 500 }
      )
    }

    // Get export details for email body
    const selectedExports = AVAILABLE_EXPORTS.filter(exp => 
      selectedExportIds.includes(exp.id)
    )

    // Create email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    // Prepare email content
    const exportsList = selectedExports
      .map((exp, index) => `${index + 1}. ${exp.label} - ${exp.description}`)
      .join('\n')

    const emailBody = `Dear Admin,

I am sharing the following data exports from the Peer Tutors system:

FACULTY INFORMATION:
- Name: ${department.faculty_name}
- Email: ${facultyEmail}
- Department: ${department.name}
- Date: ${new Date().toLocaleDateString()}

EXPORTED DATA:
${exportsList}

The requested data is attached as Excel files to this email.

Best regards,
${department.faculty_name}
${department.name}
`

    // Prepare attachments
    const attachments = exportFiles.map(file => ({
      filename: file.filename,
      content: file.buffer,
      contentType: file.mimeType
    }))

    // Send email
    const info = await transporter.sendMail({
      from: `"${department.faculty_name}" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `Data Export Request - ${department.name} - ${new Date().toLocaleDateString()}`,
      text: emailBody,
      attachments: attachments
    })

    console.log('Email sent:', info.messageId)

    return NextResponse.json({
      success: true,
      adminEmail: adminEmail,
      filesGenerated: exportFiles.length,
      messageId: info.messageId
    })

  } catch (error) {
    console.error('Error sending export email:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
