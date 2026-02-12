import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

/**
 * Diagnostic endpoint to check email automation configuration
 */
export async function GET() {
  try {
    const supabase = await createClient()
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      serverTime: {
        current: new Date().toISOString(),
        hour: new Date().getHours(),
        date: new Date().toISOString().split('T')[0]
      },
      checks: {}
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // 1. Check departments table structure
    try {
      const { data: depts, error: deptError } = await supabase
        .from('departments')
        .select('*')
        .limit(1)

      if (deptError) {
        diagnostics.checks.departmentsTable = {
          status: 'ERROR',
          error: deptError.message
        }
      } else if (depts && depts.length > 0) {
        const columns = Object.keys(depts[0])
        diagnostics.checks.departmentsTable = {
          status: 'OK',
          hasColumns: {
            enable_email_notifications: columns.includes('enable_email_notifications'),
            morning_reminder_time: columns.includes('morning_reminder_time'),
            pending_class_threshold: columns.includes('pending_class_threshold'),
            exclude_additional_classes: columns.includes('exclude_additional_classes'),
            morning_reminder_message: columns.includes('morning_reminder_message'),
            pending_warning_message: columns.includes('pending_warning_message')
          }
        }
      } else {
        diagnostics.checks.departmentsTable = {
          status: 'WARNING',
          message: 'No departments found'
        }
      }
    } catch (err) {
      diagnostics.checks.departmentsTable = {
        status: 'ERROR',
        error: String(err)
      }
    }

    // 2. Check departments with email notifications enabled
    try {
      const { data: enabledDepts, error: enabledError } = await supabase
        .from('departments')
        .select('*')
        .eq('enable_email_notifications', true)

      diagnostics.checks.enabledDepartments = {
        status: enabledError ? 'ERROR' : 'OK',
        count: enabledDepts?.length || 0,
        departments: enabledDepts?.map(d => ({
          name: d.name,
          faculty_email: d.faculty_email,
          morning_reminder_time: d.morning_reminder_time,
          pending_class_threshold: d.pending_class_threshold,
          exclude_additional_classes: d.exclude_additional_classes
        })) || []
      }
    } catch (err) {
      diagnostics.checks.enabledDepartments = {
        status: 'ERROR',
        error: String(err)
      }
    }

    // 3. Check scheduled classes for today
    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const { data: todayClasses, error: classError } = await supabase
        .from('scheduled_classes')
        .select('*, peer_tutor:peer_tutors(id, name, email)')
        .eq('scheduled_date', todayStr)

      diagnostics.checks.scheduledClassesToday = {
        status: classError ? 'ERROR' : 'OK',
        count: todayClasses?.length || 0,
        date: todayStr,
        sampleClasses: todayClasses?.slice(0, 3).map(c => ({
          dept: c.dept,
          peer_tutor: c.peer_tutor?.name,
          subject: c.subject
        })) || []
      }
    } catch (err) {
      diagnostics.checks.scheduledClassesToday = {
        status: 'ERROR',
        error: String(err)
      }
    }

    // 4. Check peer tutors
    try {
      const { data: tutors, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('id, name, email, dept')
        .limit(5)

      diagnostics.checks.peerTutors = {
        status: tutorError ? 'ERROR' : 'OK',
        totalCount: tutors?.length || 0,
        samples: tutors || []
      }
    } catch (err) {
      diagnostics.checks.peerTutors = {
        status: 'ERROR',
        error: String(err)
      }
    }

    // 5. Summary
    const hasRequiredColumns = diagnostics.checks.departmentsTable?.hasColumns?.morning_reminder_time === true
    const hasEnabledDepts = (diagnostics.checks.enabledDepartments?.count || 0) > 0
    const hasClassesToday = (diagnostics.checks.scheduledClassesToday?.count || 0) > 0

    diagnostics.summary = {
      ready: hasRequiredColumns && hasEnabledDepts && hasClassesToday,
      issues: []
    }

    if (!hasRequiredColumns) {
      diagnostics.summary.issues.push('❌ Database migration not applied - run fix_morning_reminder_time.sql')
    }
    if (!hasEnabledDepts) {
      diagnostics.summary.issues.push('❌ No departments have email notifications enabled')
    }
    if (!hasClassesToday) {
      diagnostics.summary.issues.push('⚠️ No scheduled classes for today')
    }

    if (diagnostics.summary.ready) {
      diagnostics.summary.message = '✅ Email automation is configured correctly'
    }

    return NextResponse.json(diagnostics, { status: 200 })

  } catch (error) {
    logger.error('[diagnostics] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : String(error) 
    }, { status: 500 })
  }
}
