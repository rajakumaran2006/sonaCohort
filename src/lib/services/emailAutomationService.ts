import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { ScheduledClassWithDetails } from './scheduledClassService'
import { AdditionalClass } from './additionalClassService'

export class EmailAutomationService {
  /**
   * Process morning reminders for today's scheduled classes
   */
  static async processMorningReminders(): Promise<{ success: boolean; sentCount: number; errors: string[] }> {
    try {
      const supabase = createClient()
      const errors: string[] = []
      let sentCount = 0

      // 1. Get all departments with email notifications enabled
      const { data: departments, error: deptError } = await supabase
        .from('departments')
        .select('*')
        .eq('enable_email_notifications', true)

      if (deptError) {
        logger.error('Error fetching departments for reminders:', deptError)
        return { success: false, sentCount, errors: [deptError.message] }
      }

      logger.info(`Found ${departments.length} departments with enabled notifications`)

      const today = new Date()
      const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD

      const currentHour = new Date().getHours() // Local server time. Ideally utilize timezone from settings if available.

      // 2. Iterate through each department
      for (const dept of departments) {
        try {
          // Check time window (simple check: match hour)
          // If no time set, default to 8 AM. 
          const reminderTime = dept.morning_reminder_time || '08:00'
          const [reminderHourStr] = reminderTime.split(':')
          const reminderHour = parseInt(reminderHourStr, 10)
          
          // Allow sending if current hour matches reminder hour. 
          // This assumes cron runs hourly.
          // Note: If running locally or irregular cron, this might miss. 
          // For testing, user can force 'all' via API param which bypasses logic if we implemented that check there,
          // but here we are inside the service.
          // Let's assume strict hourly check for production safety.
          if (currentHour !== reminderHour) {
             // logger.info(`Skipping dept ${dept.name}: Current hour ${currentHour} != Reminder hour ${reminderHour}`)
             continue
          }

          // Check if custom message exists
          // const messageTemplate = dept.morning_reminder_message || 
          //   "This is a reminder for your scheduled class today. Please ensure you conduct the class on time."

          // Fetch peer tutors for this department who have scheduled classes TODAY
          // We can't query scheduled_classes by 'dept' directly easily since schema is text based, 
          // let's rely on querying scheduled_classes by date and filtering by department name
          
          const { data: scheduledClasses, error: classError } = await supabase
            .from('scheduled_classes')
            .select(`
              *,
              peer_tutor:peer_tutors(id, name, email)
            `)
            .eq('scheduled_date', todayStr)
            .ilike('dept', dept.name) // Assuming case might differ
            
          if (classError) {
            logger.error(`Error fetching classes for dept ${dept.name}:`, classError)
            errors.push(`Dept ${dept.name}: ${classError.message}`)
            continue
          }

          if (!scheduledClasses || scheduledClasses.length === 0) {
            logger.info(`No scheduled classes for ${dept.name} today`)
            continue
          }

          // Group by Peer Tutor to send one email per tutor if multiple classes (optional, or per class)
          // The prompt says "if there is scheuded class they will get mail" - implies one email reminder.
          
          const tutorMap = new Map<string, { name: string; email: string; classes: ScheduledClassWithDetails[] }>()
          
          for (const cls of scheduledClasses) {
            if (!cls.peer_tutor) continue
            
            const tutorId = cls.peer_tutor.id
            if (!tutorMap.has(tutorId)) {
              tutorMap.set(tutorId, {
                name: cls.peer_tutor.name,
                email: cls.peer_tutor.email,
                classes: []
              })
            }
            tutorMap.get(tutorId)?.classes.push(cls)
          }

          // Send emails
          for (const [, tutorData] of tutorMap.entries()) {
            try {
              // Extract class names/subjects
              /* eslint-disable @typescript-eslint/no-explicit-any */
              const classNames = tutorData.classes
                .map(c => (c as any).class?.subject_name || (c as any).subject || 'Untitled Class')
                .join(', ')
              /* eslint-enable @typescript-eslint/no-explicit-any */
              
              // Get message template
              const messageTemplate = dept.morning_reminder_message || 
                "Dear {tutor_name}, this is a reminder for your scheduled classes today: {class_names}"
              
              // Replace placeholders
              const personalizedMessage = messageTemplate
                .replace(/{tutor_name}/g, tutorData.name)
                .replace(/{class_names}/g, classNames)
              
              // Construct email
              const subject = `Class Reminder - ${todayStr}`
              const content = `${personalizedMessage}<br/><br/>Regards,<br/>${dept.faculty_name}`

              // Send email via internal API (will use faculty's Microsoft Graph token)
              const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', '') || 'http://localhost:3000'}/api/cron/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: dept.faculty_email,
                  to: [tutorData.email],
                  subject,
                  content
                })
              })

              if (emailResponse.ok) {
                logger.info(`✓ Morning reminder sent to ${tutorData.email}`)
                sentCount++
              } else {
                const errorData = await emailResponse.text()
                logger.error(`✗ Failed to send to ${tutorData.email}:`, errorData)
                errors.push(`Failed to send to ${tutorData.email}: ${errorData}`)
              }
            } catch (emailError) {
              logger.error(`Error sending email to ${tutorData.email}:`, emailError)
              errors.push(`${tutorData.email}: ${emailError instanceof Error ? emailError.message : String(emailError)}`)
            }
          }

        } catch (err) {
          logger.error(`Error processing department ${dept.name}:`, err)
          errors.push(`Dept ${dept.name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      return { success: true, sentCount, errors }
    } catch (error) {
      logger.error('Error in processMorningReminders:', error)
      return { success: false, sentCount: 0, errors: [error instanceof Error ? error.message : String(error)] }
    }
  }

  /**
   * Process pending notices for classes that are overdue
   * Logic: "takes only the shceudl class continous three pending"
   */
  static async processPendingWarnings(): Promise<{ success: boolean; sentCount: number; errors: string[] }> {
    try {
      const supabase = createClient()
      const errors: string[] = []
      let sentCount = 0

      // 1. Get enabled departments
      const { data: departments, error: deptError } = await supabase
        .from('departments')
        .select('*')
        .eq('enable_email_notifications', true)

      if (deptError) {
        return { success: false, sentCount, errors: [deptError.message] }
      }

      for (const dept of departments) {
        try {
          const threshold = dept.pending_class_threshold || 3
          const excludeAdditional = dept.exclude_additional_classes || false
          // const warningTemplate = dept.pending_warning_message || 
          //   "You have consecutive pending classes. Please complete them and update the status immediately."

          // Fetch ALL peer tutors for this department
          const { data: tutors, error: tutorError } = await supabase
            .from('peer_tutors')
            .select('id, name, email')
            .ilike('dept', dept.name)

          if (tutorError || !tutors) continue

          for (const tutor of tutors) {
            // Fetch scheduled classes for this tutor, ordered by date DESC (newest first)
            // We need to check continuity.
            // Only consider past classes (before today) or include today? "Pending" usually means past.
            
            const todayStr = new Date().toISOString().split('T')[0]

            // Fetch scheduled classes
            const { data: scheduledData, error: schedError } = await supabase
              .from('scheduled_classes')
              .select('*')
              .eq('peer_tutor_id', tutor.id)
              .lt('scheduled_date', todayStr) // Past dates only
              .order('scheduled_date', { ascending: false }) // Newest past class first

            if (schedError) continue

            // Normalize classes
            type ClassCheckItem = (ScheduledClassWithDetails & { type?: string }) | (AdditionalClass & { scheduled_date: string; completion_status: string; type: string })
            let classesToCheck: ClassCheckItem[] = (scheduledData as unknown as ScheduledClassWithDetails[]) || []

            // If we DO NOT exclude additional, we need to fetch them too and merge/sort.
            // If Exclude is TRUE, we SKIP fetching additional classes entirely.
            // This means we only check the continuity of scheduled classes.
            if (!excludeAdditional) {
              const { data: additionalData } = await supabase
                .from('additional_classes')
                .select('*')
                .eq('peer_tutor_id', tutor.id)
                .lt('class_date', todayStr)
                .order('class_date', { ascending: false })
              
              if (additionalData) {
                // Additional classes are considered 'completed' events that break the pending chain
                const additionalMapped = additionalData.map(a => ({
                  ...a,
                  scheduled_date: a.class_date,
                  completion_status: 'completed', // Additional classes are records of classes taken
                  type: 'additional'
                }))
                
                classesToCheck = [...classesToCheck, ...additionalMapped].sort((a, b) => 
                  new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
                )
              }
            } else {
               // Exclude is TRUE: We treat additional classes as if they don't exist.
               // So if a tutor has [Pending, Pending, Additional(Done), Pending],
               // We see [Pending, Pending, Pending] -> 3 consecutive pending -> WARNING.
            }

            // Check continuity
            let consecutivePending = 0
            const pendingClasses = []

            for (const cls of classesToCheck) {
              // Determine if pending
              // Scheduled class is pending if status != 'completed' (and maybe 'not_started'?)
              // The service defines 'not_started' | 'pending' | 'completed'
              const isPending = cls.completion_status !== 'completed' && cls.type !== 'additional'
              
              if (isPending) {
                consecutivePending++
                pendingClasses.push(cls)
              } else {
                // Break chain
                break
              }
            }

            if (consecutivePending >= threshold) {
              // Trigger Warning Email
              try {
                const warningTemplate = dept.pending_warning_message || 
                  "You have consecutive pending classes. Please complete them and update the status immediately."
                
                const subject = `Urgent: Pending Classes Warning (${consecutivePending} classes)`
                const content = `Dear ${tutor.name},<br/><br/>${warningTemplate}<br/><br/>` +
                  `You have ${consecutivePending} consecutive classes marked as pending/incomplete.<br/>` +
                  `Please update their status as soon as possible.<br/><br/>` +
                  `Regards,<br/>${dept.faculty_name}`

                // Send email via internal API
                const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', '') || 'http://localhost:3000'}/api/cron/send-email`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    from: dept.faculty_email,
                    to: [tutor.email],
                    subject,
                    content
                  })
                })

                if (emailResponse.ok) {
                  logger.info(`✓ Pending warning sent to ${tutor.email} (${consecutivePending} pending)`)
                  sentCount++
                } else {
                  const errorData = await emailResponse.text()
                  logger.error(`✗ Failed to send warning to ${tutor.email}:`, errorData)
                  errors.push(`Failed to send to ${tutor.email}: ${errorData}`)
                }
              } catch (emailError) {
                logger.error(`Error sending warning to ${tutor.email}:`, emailError)
                errors.push(`${tutor.email}: ${emailError instanceof Error ? emailError.message : String(emailError)}`)
              }
            }
          }

        } catch (err) {
           errors.push(`Dept ${dept.name}: ${JSON.stringify(err)}`)
        }
      }

      return { success: true, sentCount, errors }

    } catch (error) {
      logger.error('Error in processPendingWarnings:', error)
      return { success: false, sentCount: 0, errors: [String(error)] }
    }
  }
}
