/**
 * Email Service for generating mailto links to send data to super admin
 */

export interface ExportOption {
  id: string
  label: string
  description: string
  category: 'exams' | 'attendance' | 'peer-tutors' | 'classes' | 'analytics'
}

export const AVAILABLE_EXPORTS: ExportOption[] = [
  {
    id: 'all-exams',
    label: 'All Exams Data',
    description: 'Complete export of all exam records with peer tutor marks and student details',
    category: 'exams'
  },
  {
    id: 'exam-details',
    label: 'Individual Exam Details',
    description: 'Detailed export for a specific exam including all marks and analytics',
    category: 'exams'
  },
  {
    id: 'peer-tutor-marks',
    label: 'Peer Tutor Exam Marks',
    description: 'Export of marks entered by specific peer tutors',
    category: 'exams'
  },
  {
    id: 'peer-tutors-list',
    label: 'Peer Tutors List',
    description: 'Complete list of peer tutors with their details and assignments',
    category: 'peer-tutors'
  },
  {
    id: 'peer-tutor-reports',
    label: 'Peer Tutor Reports',
    description: 'Filtered reports data for peer tutors',
    category: 'peer-tutors'
  },
  {
    id: 'classes-export',
    label: 'Classes Schedule',
    description: 'Export of all scheduled classes with filters applied',
    category: 'classes'
  },
  {
    id: 'attendance-report',
    label: 'Attendance Report',
    description: 'Comprehensive attendance data for peer tutors and students',
    category: 'attendance'
  }
]

export class EmailService {
  private static SUPER_ADMIN_EMAIL = 'admin@peerTutor.edu' // Default, can be configured

  /**
   * Set the super admin email address
   */
  static setSuperAdminEmail(email: string) {
    this.SUPER_ADMIN_EMAIL = email
  }

  /**
   * Get the super admin email address
   */
  static getSuperAdminEmail(): string {
    return this.SUPER_ADMIN_EMAIL
  }

  /**
   * Generate a mailto link for sending exports to super admin
   */
  static generateMailtoLink(
    selectedExports: ExportOption[],
    facultyName: string,
    facultyEmail: string,
    department: string
  ): string {
    const subject = encodeURIComponent(
      `Data Export Request - ${department} - ${new Date().toLocaleDateString()}`
    )

    const body = this.generateEmailBody(selectedExports, facultyName, facultyEmail, department)
    const encodedBody = encodeURIComponent(body)

    return `mailto:${this.SUPER_ADMIN_EMAIL}?subject=${subject}&body=${encodedBody}`
  }

  /**
   * Generate email body content
   */
  private static generateEmailBody(
    selectedExports: ExportOption[],
    facultyName: string,
    facultyEmail: string,
    department: string
  ): string {
    const exportsList = selectedExports
      .map((exp, index) => `${index + 1}. ${exp.label} - ${exp.description}`)
      .join('\n')

    return `Dear Admin,

I am requesting to share the following data exports from the Peer Tutors system:

FACULTY INFORMATION:
- Name: ${facultyName}
- Email: ${facultyEmail}
- Department: ${department}
- Date: ${new Date().toLocaleDateString()}

REQUESTED EXPORTS:
${exportsList}

INSTRUCTIONS:
The selected data exports have been generated and downloaded to my computer. I will attach the following Excel files to this email:

${selectedExports.map((exp, index) => `${index + 1}. ${exp.label}.xlsx`).join('\n')}

Please review the attached data at your earliest convenience.

Best regards,
${facultyName}
${department}
`
  }

  /**
   * Get export options by category
   */
  static getExportsByCategory(category: ExportOption['category']): ExportOption[] {
    return AVAILABLE_EXPORTS.filter(exp => exp.category === category)
  }

  /**
   * Get all export categories
   */
  static getCategories(): Array<{ id: ExportOption['category']; label: string }> {
    return [
      { id: 'exams', label: 'Exams & Assessments' },
      { id: 'attendance', label: 'Attendance Records' },
      { id: 'peer-tutors', label: 'Peer Tutors Data' },
      { id: 'classes', label: 'Classes & Schedule' },
      { id: 'analytics', label: 'Analytics & Reports' }
    ]
  }

  /**
   * Send email with attachments via API endpoint
   */
  static async sendEmailWithAttachments(
    facultyEmail: string,
    selectedExports: ExportOption[]
  ): Promise<{ success: boolean; adminEmail?: string; error?: string }> {
    try {
      const response = await fetch('/api/send-export-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          facultyEmail,
          selectedExportIds: selectedExports.map(exp => exp.id)
        })
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to send email'
        }
      }

      return {
        success: true,
        adminEmail: data.adminEmail
      }
    } catch (error) {
      console.error('Error sending email:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }
}
