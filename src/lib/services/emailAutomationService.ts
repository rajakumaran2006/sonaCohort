import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { ScheduledClassWithDetails } from './scheduledClassService'
import { AdditionalClass } from './additionalClassService'

import { SupabaseClient } from '@supabase/supabase-js'
import { MicrosoftTokenService } from '@/lib/auth/microsoftTokenService'

export class EmailAutomationService {
  /**
   * Process morning reminders for today's scheduled classes
   */
  static async processMorningReminders(options?: { departmentId?: string; force?: boolean; userId?: string }, supabaseClient?: SupabaseClient): Promise<{ success: boolean; sentCount: number; errors: string[]; debugInfo?: string[] }> {
    try {
      const supabase = supabaseClient || createClient()
      const errors: string[] = []
      const debugLogs: string[] = []
      let sentCount = 0

      // 1. Get departments
      let query = supabase
        .from('departments')
        .select('*')
      
      // Only filter by enabled if NOT forced
      if (!options?.force) {
        query = query.eq('enable_daily_reminders', true)
      }
      
      if (options?.departmentId) {
        query = query.eq('id', options.departmentId)
      }

      const { data: departments, error: deptError } = await query

      if (deptError) {
        logger.error('Error fetching departments for reminders:', deptError)
        return { success: false, sentCount, errors: [deptError.message] }
      }

      debugLogs.push(`Found ${departments?.length || 0} departments`)
      logger.info(`Found ${departments?.length || 0} departments with enabled notifications`)

      const today = new Date()
      const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD


      // 2. Iterate through each department
      for (const dept of departments || []) {
        let deptHasError = false
        try {
          // Check if already sent today (unless forced)
          if (!options?.force && dept.last_daily_reminder_date === todayStr) {
             debugLogs.push(`Skipping dept ${dept.name}: Already sent today`)
             continue
          }

          // Check time window (simple check: match hour)
          // Ignored if forced
          // Time check removed - we now rely on the Cron job schedule (9:35 AM default)
          // if (!options?.force) { ... }

          
          debugLogs.push(`Checking classes for dept: "${dept.name}" on date: ${todayStr}`)

          // Fetch peer tutors for this department who have scheduled classes TODAY
          // Using ilike for department name matching as text
          const { data: scheduledClasses, error: classError } = await supabase
            .from('scheduled_classes')
            .select(`
              *,
              peer_tutor:peer_tutors(id, name, email),
              class:classes(subject_name)
            `)
            .eq('scheduled_date', todayStr)
            .ilike('dept', dept.name)
            
          if (classError) {
            logger.error(`Error fetching classes for dept ${dept.name}:`, classError)
            errors.push(`Dept ${dept.name}: ${classError.message}`)
            continue
          }

          if (!scheduledClasses || scheduledClasses.length === 0) {
            debugLogs.push(`No classes found for ${dept.name} on ${todayStr}.`)
            
            // DIAGNOSTIC CHECKS
            // 1. Check if ANY classes exist for today (ignoring dept)
            const { count: totalToday } = await supabase
              .from('scheduled_classes')
              .select('*', { count: 'exact', head: true })
              .eq('scheduled_date', todayStr)
            debugLogs.push(`Diagnostic: Total classes in system for ${todayStr}: ${totalToday}`)

            // 2. Check if ANY classes exist for this dept (ignoring date)
            const { count: totalDept } = await supabase
              .from('scheduled_classes')
              .select('*', { count: 'exact', head: true })
              .ilike('dept', dept.name)
            debugLogs.push(`Diagnostic: Total classes in system for dept "${dept.name}": ${totalDept}`)
            
            continue
          }

          debugLogs.push(`Found ${scheduledClasses.length} classes for ${dept.name}.`)

          // Group by Peer Tutor
          const tutorMap = new Map<string, { name: string; email: string; classes: typeof scheduledClasses }>()
          
          for (const cls of scheduledClasses) {
            if (!cls.peer_tutor) continue
            
            const tutorId = (cls.peer_tutor as unknown as { id: string }).id
            const tutorName = (cls.peer_tutor as unknown as { name: string }).name
            const tutorEmail = (cls.peer_tutor as unknown as { email: string }).email
            if (!tutorMap.has(tutorId)) {
              tutorMap.set(tutorId, {
                name: tutorName,
                email: tutorEmail,
                classes: []
              })
            }
            tutorMap.get(tutorId)?.classes.push(cls)
          }

          // Send emails in parallel to avoid Vercel timeouts
          const emailPromises = Array.from(tutorMap.entries()).map(async ([, tutorData]) => {
            try {
              const classNames = tutorData.classes
                .map(c => {
                  const classData = c.class as unknown as { subject_name: string } | null
                  return classData?.subject_name || 'Untitled Class'
                })
                .join(', ')
              
              const messageTemplate = dept.morning_reminder_message || 
                "Dear {tutor_name}, this is a reminder for your scheduled classes today: {class_names}"
              
              const personalizedMessage = messageTemplate
                .replace(/{tutor_name}/g, tutorData.name)
                .replace(/{class_names}/g, classNames)
                .replace(/{class_name}/g, classNames)
              
              const subject = `Class Reminder - ${todayStr}`
              const content = `${personalizedMessage}<br/><br/>Regards,<br/>${dept.faculty_name}`

              if (options?.userId && options.force) {
                 const result = await this.sendEmailDirectly(options.userId, [tutorData.email], subject, content)
                 if (result.success) {
                    logger.info(`✓ Morning reminder sent to ${tutorData.email} (Direct)`)
                    return { success: true, email: tutorData.email }
                 } else {
                    const errMsg = result.error || 'Unknown error'
                    logger.error(`✗ Failed to send to ${tutorData.email} (Direct):`, errMsg)
                    return { success: false, email: tutorData.email, error: errMsg }
                 }
              } else {
                  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                  const emailResponse = await fetch(`${appUrl}/api/cron/send-email`, {
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
                    return { success: true, email: tutorData.email }
                  } else {
                    const errorData = await emailResponse.text()
                    logger.error(`✗ Failed to send to ${tutorData.email}:`, errorData)
                    return { success: false, email: tutorData.email, error: errorData }
                  }
              }
            } catch (emailError) {
              const errMsg = emailError instanceof Error ? emailError.message : String(emailError)
              logger.error(`Error sending email to ${tutorData.email}:`, emailError)
              return { success: false, email: tutorData.email, error: errMsg }
            }
          })

          const emailResults = await Promise.all(emailPromises)
          
          // Process results
          for (const res of emailResults) {
            if (res.success) {
              sentCount++
            } else {
              errors.push(`Failed to send to ${res.email}: ${res.error}`)
              deptHasError = true
            }
          }

          // Update last_daily_reminder_date if emails were sent or if the check ran successfully without errors.
          // This ensures we don't spam, but also allows retrying if there was an error.
          
          if (!deptHasError) { 
             await supabase.from('departments')
               .update({ last_daily_reminder_date: todayStr })
               .eq('id', dept.id)
          }

        } catch (err) {
          logger.error(`Error processing department ${dept.name}:`, err)
          errors.push(`Dept ${dept.name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      return { success: true, sentCount, errors, debugInfo: debugLogs }
    } catch (error) {
      logger.error('Error in processMorningReminders:', error)
      return { success: false, sentCount: 0, errors: [error instanceof Error ? error.message : String(error)] }
    }
  }

  /**
   * Helper to send email directly using Microsoft Graph (bypassing the cron API)
   * Used for "Test Runs" where we have the user's session/ID but no service role key.
   */
  private static async sendEmailDirectly(userId: string, to: string[], subject: string, content: string): Promise<{ success: boolean; error?: string }> {
     try {
        const tokenData = await MicrosoftTokenService.refreshAccessToken(userId)
        
        if (!tokenData || !tokenData.accessToken) {
            return { success: false, error: 'Failed to get access token for user. Try signing in again.' }
        }

        const message = {
          message: {
            subject: subject,
            body: {
              contentType: 'HTML',
              content: content
            },
            toRecipients: to.map(email => ({
              emailAddress: {
                address: email
              }
            }))
          },
          saveToSentItems: true
        }

        const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message)
        })

        if (!graphResponse.ok) {
           const text = await graphResponse.text()
           return { success: false, error: `Graph Error: ${text}` }
        }

        return { success: true }
     } catch (e) {
        logger.error('Error in sendEmailDirectly:', e)
        return { success: false, error: e instanceof Error ? e.message : String(e) }
     }
  }

  /**
   * Process pending notices for classes that are overdue
   * Logic: "takes only the shceudl class continous three pending"
   */
  static async processPendingWarnings(supabaseClient?: SupabaseClient): Promise<{ success: boolean; sentCount: number; errors: string[] }> {
    try {
      const supabase = supabaseClient || createClient()
      const errors: string[] = []
      let sentCount = 0

      // 1. Get enabled departments
      const { data: departments, error: deptError } = await supabase
        .from('departments')
        .select('*')
        .eq('enable_pending_reminders', true)

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
                const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                const emailResponse = await fetch(`${appUrl}/api/cron/send-email`, {
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
