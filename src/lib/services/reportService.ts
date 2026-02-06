import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { AttendanceService } from './attendanceService'
import { ScheduledClassWithDetails } from './scheduledClassService'
import { AdditionalClassService } from './additionalClassService'

export interface peerTutorubject {
  subject_name: string
  class_id: string
  total_classes: number
  completed_classes: number
  pending_classes: number
  additional_classes: number
}

export interface peertutorsReportData {
  peer_tutor_id: string
  peer_tutor_name: string
  peer_tutor_email: string
  dept: string
  year: string
  section: string
  subjects: peerTutorubject[]
}

export interface ClassAttendanceReport {
  class_id: string
  scheduled_class_id: string
  subject_name: string
  scheduled_date: string
  topics: string
  attendance_records: {
    student_id: string
    student_name: string
    student_email: string
    status: 'present' | 'absent'
  }[]
  present_count: number
  absent_count: number
  total_students: number
  start_time?: string
  end_time?: string
  link?: string
}

export interface FullClassReport {
  subject_name: string
  columns: {
    id: string
    date: string
    time: string
    is_additional: boolean
    topics: string
  }[]
  rows: {
    student_id: string
    student_name: string
    student_email: string
    attendance: {
      [class_id: string]: 'present' | 'absent' | 'on_duty' | 'late' | 'upcoming'
    }
    stats: {
      present: number
      total: number
      percentage: number
    }
  }[]
}

export interface TopicSheetData {
  subject_name: string
  classes: {
    id: string
    date: string
    hour: string
    topic: string
    is_additional: boolean
  }[]
}

export interface ExcelExportData {
  subject_name: string
  student_name: string
  present_absent_status: string
  hours_present: number
  attendance_percentage: number
  topics_taught: string[]
}

export class ReportService {
  /**
   * Get all subjects assigned to a peer tutor
   */
  static async getpeerTutorubjects(peertutorsId: string): Promise<peerTutorubject[]> {
    try {
      const supabase = createClient()

      // Get peer tutor info first (including created_at)
      const { data: peertutors, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('dept, year, section, created_at')
        .eq('id', peertutorsId)
        .single()

      if (tutorError || !peertutors) {
        logger.error('Error getting peer tutor info:', tutorError)
        return []
      }

      // Calculate the minimum date for classes (day after peer tutor was created)
      const createdDate = new Date(peertutors.created_at)
      createdDate.setHours(0, 0, 0, 0)
      const minimumClassDate = new Date(createdDate)
      minimumClassDate.setDate(minimumClassDate.getDate() + 1) // Day after creation

      // Get ALL scheduled classes for this peer tutor with class details (no date filter)
      // This ensures we get all subjects that are assigned to this peer tutor
      const { data: allScheduledClasses, error: allScheduledError } = await supabase
        .from('scheduled_classes')
        .select(`
          class_id,
          scheduled_date,
          completion_status,
          attendance_completed,
          topics_completed,
          class:classes!inner(
            id,
            subject_name
          )
        `)
        .eq('peer_tutor_id', peertutorsId)

      if (allScheduledError) {
        logger.error('Error getting scheduled classes:', allScheduledError)
        return []
      }



      if (!allScheduledClasses || allScheduledClasses.length === 0) {
        // If no scheduled classes at all, check if there are classes available for this dept/year/section
        // This handles the case where a peer tutor exists but hasn't been assigned any classes yet
        const { data: classes, error: classesError } = await supabase
          .from('classes')
          .select('id, subject_name')
          .eq('dept', peertutors.dept)
          .eq('year', peertutors.year)
          .eq('section', peertutors.section)

        if (classesError) {
          logger.error('Error getting classes:', classesError)
          return []
        }

        // Return subjects with zero stats if no scheduled classes exist
        return classes.map(cls => ({
          subject_name: cls.subject_name,
          class_id: cls.id,
          total_classes: 0,
          completed_classes: 0,
          pending_classes: 0,
          additional_classes: 0
        }))
      }

      // Get additional classes for this peer tutor
      const additionalClasses = await AdditionalClassService.getAdditionalClassesBypeertutors(peertutorsId)

      // Group scheduled classes by class_id to get unique subjects
      // Use all scheduled classes to determine which subjects are assigned
      const classMap = new Map<string, {
        class_id: string
        subject_name: string
        allScheduledClasses: {
          class_id: string
          scheduled_date: string
          completion_status?: 'not_started' | 'pending' | 'completed'
          attendance_completed?: boolean
          topics_completed?: boolean
          class: {
            id: string
            subject_name: string
          } | {
            id: string
            subject_name: string
          }[]
        }[]
        scheduledClassesForStats: {
          class_id: string
          scheduled_date: string
          completion_status?: 'not_started' | 'pending' | 'completed'
          attendance_completed?: boolean
          topics_completed?: boolean
          class: {
            id: string
            subject_name: string
          } | {
            id: string
            subject_name: string
          }[]
        }[]
      }>()

      allScheduledClasses.forEach(sc => {
        const classId = sc.class_id
        const classData = Array.isArray(sc.class) ? sc.class[0] : sc.class
        const subjectName = classData?.subject_name || ''

        if (!classMap.has(classId)) {
          classMap.set(classId, {
            class_id: classId,
            subject_name: subjectName,
            allScheduledClasses: [],
            scheduledClassesForStats: []
          })
        }

        classMap.get(classId)!.allScheduledClasses.push(sc)

        // Add to stats array if it's after the creation date
        const classDate = new Date(sc.scheduled_date)
        classDate.setHours(0, 0, 0, 0)
        if (classDate >= minimumClassDate) {
          classMap.get(classId)!.scheduledClassesForStats.push(sc)
        }
      })

      // Process subjects with class statistics
      // Use scheduledClassesForStats for counting (only classes after creation date)
      const subjects: peerTutorubject[] = Array.from(classMap.values()).map(classData => {
        const classScheduledClasses = classData.scheduledClassesForStats
        const totalClasses = classScheduledClasses.length
        const completedClasses = classScheduledClasses.filter(sc =>
          sc.completion_status === 'completed' ||
          (sc.attendance_completed && sc.topics_completed)
        ).length
        const pendingClasses = totalClasses - completedClasses

        // Count additional classes for this subject
        const additionalClassesForSubject = additionalClasses.filter(ac => ac.subject_name === classData.subject_name).length

        return {
          subject_name: classData.subject_name,
          class_id: classData.class_id,
          total_classes: totalClasses,
          completed_classes: completedClasses,
          pending_classes: pendingClasses,
          additional_classes: additionalClassesForSubject
        }
      })

      return subjects
    } catch (error) {
      logger.error('Error in getpeerTutorubjects:', error)
      return []
    }
  }

  /**
   * Get scheduled classes for a specific subject and peer tutor
   */
  static async getSubjectScheduledClasses(peertutorsId: string, subjectName: string): Promise<ScheduledClassWithDetails[]> {
    try {
      const supabase = createClient()

      // Get peer tutor info (including created_at)
      const { data: peertutors, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('dept, year, section, created_at')
        .eq('id', peertutorsId)
        .single()

      if (tutorError || !peertutors) {
        logger.error('Error getting peer tutor info:', tutorError)
        return []
      }

      // Calculate the minimum date for classes (day after peer tutor was created)
      const createdDate = new Date(peertutors.created_at)
      createdDate.setHours(0, 0, 0, 0)
      const minimumClassDate = new Date(createdDate)
      minimumClassDate.setDate(minimumClassDate.getDate() + 1) // Day after creation

      // Get scheduled classes for this subject (only from day after creation)
      const { data: scheduledClasses, error: scheduledError } = await supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name,
            created_at,
            dept,
            year,
            section
          ),
          peer_tutor:peer_tutors!inner(
            id,
            name,
            email
          )
        `)
        .eq('peer_tutor_id', peertutorsId)
        .eq('class.subject_name', subjectName)
        .gte('scheduled_date', minimumClassDate.toISOString().split('T')[0])
        .order('scheduled_date', { ascending: true })

      if (scheduledError) {
        logger.error('Error getting scheduled classes:', scheduledError)
        return []
      }

      return scheduledClasses || []
    } catch (error) {
      logger.error('Error in getSubjectScheduledClasses:', error)
      return []
    }
  }

  /**
   * Get detailed attendance report for a specific scheduled class
   */
  static async getClassAttendanceReport(scheduledClassId: string): Promise<ClassAttendanceReport | null> {
    try {
      const supabase = createClient()

      // Get scheduled class details
      const { data: scheduledClass, error: classError } = await supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name
          )
        `)
        .eq('id', scheduledClassId)
        .single()

      if (classError || !scheduledClass) {
        logger.error('Error getting scheduled class:', classError)
        return null
      }

      // Get attendance records
      const attendanceRecords = await AttendanceService.getAttendanceByScheduledClass(scheduledClassId)

      const presentCount = attendanceRecords.filter(record => record.status === 'present').length
      const absentCount = attendanceRecords.filter(record => record.status === 'absent').length

      return {
        class_id: scheduledClass.class_id,
        scheduled_class_id: scheduledClassId,
        subject_name: scheduledClass.class.subject_name,
        scheduled_date: scheduledClass.scheduled_date,
        topics: scheduledClass.topics || '',
        attendance_records: attendanceRecords.map(record => ({
          student_id: record.student_id,
          student_name: record.student_name,
          student_email: record.student_email,
          status: record.status
        })),
        present_count: presentCount,
        absent_count: absentCount,
        total_students: attendanceRecords.length,
        start_time: scheduledClass.start_time,
        end_time: scheduledClass.end_time,
        link: scheduledClass.link
      }
    } catch (error) {
      logger.error('Error in getClassAttendanceReport:', error)
      return null
    }
  }

  /**
   * Get comprehensive report data for a peer tutor
   */
  static async getpeertutorsReportData(peertutorsId: string): Promise<peertutorsReportData | null> {
    try {
      const supabase = createClient()

      // Get peer tutor info
      const { data: peertutors, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('id', peertutorsId)
        .single()

      if (tutorError || !peertutors) {
        logger.error('Error getting peer tutor info:', tutorError)
        return null
      }

      // Get subjects
      const subjects = await this.getpeerTutorubjects(peertutorsId)

      return {
        peer_tutor_id: peertutors.id,
        peer_tutor_name: peertutors.name,
        peer_tutor_email: peertutors.email,
        dept: peertutors.dept,
        year: peertutors.year,
        section: peertutors.section,
        subjects
      }
    } catch (error) {
      logger.error('Error in getpeertutorsReportData:', error)
      return null
    }
  }

  /**
   * Get comprehensive attendance report matrix for a specific subject
   */
  static async getSubjectFullClassReport(peertutorsId: string, subjectName: string): Promise<FullClassReport | null> {
    try {
      const supabase = createClient()

      // 1. Get peer tutor info
      const { data: peertutors, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('id', peertutorsId)
        .single()

      if (tutorError || !peertutors) {
        logger.error('Error getting peer tutor info:', tutorError)
        return null
      }

      // Calculate start date
      const createdDate = new Date(peertutors.created_at)
      createdDate.setHours(0, 0, 0, 0)
      const minimumClassDate = new Date(createdDate)
      minimumClassDate.setDate(minimumClassDate.getDate() + 1)

      // 2. Get Scheduled Classes (Completed only)
      const { data: scheduledClasses, error: scheduledError } = await supabase
        .from('scheduled_classes')
        .select(`
          id,
          class_id,
          scheduled_date,
          start_time,
          end_time,
          topics,
          class:classes!inner(subject_name)
        `)
        .eq('peer_tutor_id', peertutorsId)
        .eq('class.subject_name', subjectName)
        .gte('scheduled_date', minimumClassDate.toISOString().split('T')[0])
        .or('completion_status.eq.completed,and(attendance_completed.eq.true,topics_completed.eq.true)')
        .order('scheduled_date', { ascending: true })

      if (scheduledError) {
        logger.error('Error getting scheduled classes:', scheduledError)
        return null
      }

      // 3. Get Additional Classes
      const { data: additionalClasses, error: additionalError } = await supabase
        .from('additional_classes')
        .select('*')
        .eq('peer_tutor_id', peertutorsId)
        .eq('subject_name', subjectName)
        .order('class_date', { ascending: true })

      if (additionalError) {
        logger.error('Error getting additional classes:', additionalError)
        return null
      }

      // 4. Merge and Sort Classes (Columns)
      const columns = [
        ...(scheduledClasses || []).map(c => ({
          id: c.id,
          date: c.scheduled_date,
          time: c.start_time && c.end_time ? `${formatTime(c.start_time)} - ${formatTime(c.end_time)}` : new Date(c.scheduled_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          is_additional: false,
          topics: c.topics || ''
        })),
        ...(additionalClasses || []).map(c => ({
          id: c.id,
          date: c.class_date,
          time: c.start_time && c.end_time ? `${formatTime(c.start_time)} - ${formatTime(c.end_time)}` : 'Additional',
          is_additional: true,
          topics: c.topic || ''
        }))
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      if (columns.length === 0) {
        return { subject_name: subjectName, columns: [], rows: [] }
      }

      // 5. Get Students
      const { data: students, error: studentsError } = await supabase
        .from('peer_students')
        .select('id, name, email')
        .eq('assigned_peer_tutor_id', peertutorsId)
        .eq('peer_tutor', false)
        .order('name')

      if (studentsError) {
        logger.error('Error getting students:', studentsError)
        return null
      }

      // 6. Get Attendance Records
      // Scheduled
      const scheduledIds = scheduledClasses?.map(c => c.id) || []
      let scheduledAttendance: { student_id: string; scheduled_class_id: string; status: string }[] = []
      if (scheduledIds.length > 0) {
        const { data: sa, error: saError } = await supabase
          .from('attendance')
          .select('student_id, scheduled_class_id, status')
          .in('scheduled_class_id', scheduledIds)

        if (saError) logger.error('Error fetching scheduled attendance', saError)
        else scheduledAttendance = sa || []
      }

      // Additional
      const additionalIds = additionalClasses?.map(c => c.id) || []
      let additionalAttendance: { student_id: string; additional_class_id: string; status: string }[] = []
      if (additionalIds.length > 0) {
        const { data: aa, error: aaError } = await supabase
          .from('additional_class_attendance')
          .select('student_id, additional_class_id, status')
          .in('additional_class_id', additionalIds)

        if (aaError) logger.error('Error fetching additional attendance', aaError)
        else additionalAttendance = aa || []
      }


      // Get current date for upcoming logic
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 7. Build Rows
      const rows = students.map(student => {
        const attendanceMap: Record<string, 'present' | 'absent' | 'on_duty' | 'late' | 'upcoming'> = {}
        let presentCount = 0
        let totalCount = 0

        // Process columns to populate map and stats
        columns.forEach(col => {
          let status: string | null = null

          if (!col.is_additional) {
            const record = scheduledAttendance.find(r => r.student_id === student.id && r.scheduled_class_id === col.id)
            status = record?.status ?? null
          } else {
            const record = additionalAttendance.find(r => r.student_id === student.id && r.additional_class_id === col.id)
            status = record?.status ?? null
          }

          const classDate = new Date(col.date);
          classDate.setHours(0, 0, 0, 0);

          if (status) {
            attendanceMap[col.id] = status as 'present' | 'absent' | 'on_duty' | 'late'
            totalCount++
            if (status === 'present') presentCount++
          } else {
            // Logic for upcoming classes
            if (!col.is_additional && classDate.getTime() > today.getTime()) {
              attendanceMap[col.id] = 'upcoming';
              // Do NOT increment totalCount for upcoming classes
            } else {
              // Past or today with no record = Absent
              totalCount++
              attendanceMap[col.id] = 'absent'
            }
          }
        })

        return {
          student_id: student.id,
          student_name: student.name,
          student_email: student.email,
          attendance: attendanceMap,
          stats: {
            present: presentCount,
            total: totalCount,
            percentage: totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0
          }
        }
      })

      return {
        subject_name: subjectName,
        columns,
        rows
      }

    } catch (error) {
      logger.error('Error in getSubjectFullClassReport:', error)
      return null
    }
  }

  /**
   * Get Excel export data for a peer tutor
   */
  static async getExcelExportData(peertutorsId: string): Promise<ExcelExportData[]> {
    try {
      const supabase = createClient()

      // Get peer tutor info (including created_at)
      const { data: peertutors, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('dept, year, section, created_at')
        .eq('id', peertutorsId)
        .single()

      if (tutorError || !peertutors) {
        logger.error('Error getting peer tutor info:', tutorError)
        return []
      }

      // Calculate the minimum date for classes (day after peer tutor was created)
      const createdDate = new Date(peertutors.created_at)
      createdDate.setHours(0, 0, 0, 0)
      const minimumClassDate = new Date(createdDate)
      minimumClassDate.setDate(minimumClassDate.getDate() + 1) // Day after creation

      // Get all scheduled classes for this peer tutor (only from day after creation)
      const { data: scheduledClasses, error: scheduledError } = await supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(
            id,
            subject_name
          )
        `)
        .eq('peer_tutor_id', peertutorsId)
        .gte('scheduled_date', minimumClassDate.toISOString().split('T')[0])
        .order('scheduled_date', { ascending: true })

      if (scheduledError) {
        logger.error('Error getting scheduled classes:', scheduledError)
        return []
      }

      // Get all students assigned to this peer tutor
      const { data: students, error: studentsError } = await supabase
        .from('peer_students')
        .select('id, name, email')
        .eq('assigned_peer_tutor_id', peertutorsId)
        .eq('peer_tutor', false)

      if (studentsError) {
        logger.error('Error getting students:', studentsError)
        return []
      }

      // Get all attendance records for this peer tutor
      const { data: attendanceRecords, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .eq('peer_tutor_id', peertutorsId)

      if (attendanceError) {
        logger.error('Error getting attendance records:', attendanceError)
        return []
      }

      // Process data for Excel export
      const exportData: ExcelExportData[] = []

      for (const student of students) {
        // Get attendance records for this student
        const studentAttendance = attendanceRecords.filter(record => record.student_id === student.id)

        // Group by subject
        const subjectGroups = new Map<string, {
          presentCount: number
          totalCount: number
          topics: string[]
        }>()

        for (const attendance of studentAttendance) {
          // Find the corresponding scheduled class
          const scheduledClass = scheduledClasses.find(sc =>
            sc.class_id === attendance.class_id || sc.id === attendance.scheduled_class_id
          )

          if (scheduledClass) {
            const subjectName = scheduledClass.class.subject_name
            const key = subjectName

            if (!subjectGroups.has(key)) {
              subjectGroups.set(key, {
                presentCount: 0,
                totalCount: 0,
                topics: []
              })
            }

            const group = subjectGroups.get(key)!
            group.totalCount++
            if (attendance.status === 'present') {
              group.presentCount++
            }

            // Add topic if available
            if (scheduledClass.topics && !group.topics.includes(scheduledClass.topics)) {
              group.topics.push(scheduledClass.topics)
            }
          }
        }

        // Create export data for each subject
        for (const [subjectName, data] of subjectGroups) {
          const attendancePercentage = data.totalCount > 0 ? (data.presentCount / data.totalCount) * 100 : 0

          exportData.push({
            subject_name: subjectName,
            student_name: student.name,
            present_absent_status: data.presentCount > 0 ? 'Present' : 'Absent',
            hours_present: data.presentCount, // Assuming 1 hour per class
            attendance_percentage: Math.round(attendancePercentage * 100) / 100,
            topics_taught: data.topics
          })
        }
      }

      return exportData
    } catch (error) {
      logger.error('Error in getExcelExportData:', error)
      return []
    }
  }

  /**
   * Get all peer tutors with their report data
   */
  static async getAllpeertutorsReports(facultyId?: string): Promise<peertutorsReportData[]> {
    try {
      const supabase = createClient()

      // Get all peer tutors
      let query = supabase
        .from('peer_tutors')
        .select('*')
        .order('name')

      if (facultyId) {
        query = query.eq('faculty_id', facultyId)
      }

      const { data: peerTutor, error: tutorsError } = await query

      if (tutorsError) {
        logger.error('Error getting peer tutors:', tutorsError)
        return []
      }

      // Get report data for each peer tutor
      const reports = await Promise.all(
        peerTutor.map(async (tutor) => {
          const subjects = await this.getpeerTutorubjects(tutor.id)
          return {
            peer_tutor_id: tutor.id,
            peer_tutor_name: tutor.name,
            peer_tutor_email: tutor.email,
            dept: tutor.dept,
            year: tutor.year,
            section: tutor.section,
            subjects
          }
        })
      )

      return reports
    } catch (error) {
      logger.error('Error in getAllpeertutorsReports:', error)
      return []
    }
  }
  /**
   * Get topic sheet data (only class details, no attendance) for all subjects
   */
  static async getTopicSheetData(peertutorsId: string): Promise<TopicSheetData[]> {
    try {
      const supabase = createClient()

      // 1. Get all assigned subjects first
      const assignedSubjects = await this.getpeerTutorubjects(peertutorsId)

      // Initialize map with all subjects
      const subjectMap = new Map<string, TopicSheetData>()
      assignedSubjects.forEach(sub => {
        subjectMap.set(sub.subject_name, {
          subject_name: sub.subject_name,
          classes: []
        })
      })

      // 2. Get peer tutor info for creation date filter
      const { data: peertutors, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('created_at')
        .eq('id', peertutorsId)
        .single()

      if (tutorError || !peertutors) {
        logger.error('Error getting peer tutor info:', tutorError)
        return []
      }

      // Calculate the minimum date for classes (day after peer tutor was created)
      const createdDate = new Date(peertutors.created_at)
      createdDate.setHours(0, 0, 0, 0)
      const minimumClassDate = new Date(createdDate)
      minimumClassDate.setDate(minimumClassDate.getDate() + 1)

      // 3. Get All Scheduled Classes (Completed only)
      const { data: scheduledClasses, error: scheduledError } = await supabase
        .from('scheduled_classes')
        .select(`
          id,
          class_id,
          scheduled_date,
          start_time,
          end_time,
          topics,
          class:classes!inner(subject_name)
        `)
        .eq('peer_tutor_id', peertutorsId)
        .gte('scheduled_date', minimumClassDate.toISOString().split('T')[0])
        .or('completion_status.eq.completed,and(attendance_completed.eq.true,topics_completed.eq.true)')
        .order('scheduled_date', { ascending: true })

      if (scheduledError) {
        logger.error('Error getting scheduled classes:', scheduledError)
        return []
      }

      // 4. Get All Additional Classes
      const { data: additionalClasses, error: additionalError } = await supabase
        .from('additional_classes')
        .select('*')
        .eq('peer_tutor_id', peertutorsId)
        .order('class_date', { ascending: true })

      if (additionalError) {
        logger.error('Error getting additional classes:', additionalError)
        return []
      }

      // 5. Populate classes
      // Process Scheduled Classes
      scheduledClasses?.forEach(sc => {
        // @ts-expect-error - Supabase returns nested class object
        const subjectName = sc.class?.subject_name
        if (!subjectName) return

        if (!subjectMap.has(subjectName)) {
          // This ensures even if a subject wasn't in the initial list (unlikely if logic is correct), it's added
          subjectMap.set(subjectName, { subject_name: subjectName, classes: [] })
        }

        subjectMap.get(subjectName)!.classes.push({
          id: sc.id,
          date: sc.scheduled_date,
          hour: sc.start_time && sc.end_time ? `${formatTime(sc.start_time)} - ${formatTime(sc.end_time)}` : new Date(sc.scheduled_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          topic: sc.topics || '',
          is_additional: false
        })
      })

      // Process Additional Classes
      additionalClasses?.forEach(ac => {
        const subjectName = ac.subject_name
        if (!subjectName) return

        if (!subjectMap.has(subjectName)) {
          // Should ideally be there, but safe to add
          subjectMap.set(subjectName, { subject_name: subjectName, classes: [] })
        }

        subjectMap.get(subjectName)!.classes.push({
          id: ac.id,
          date: ac.class_date,
          hour: ac.start_time && ac.end_time ? `${formatTime(ac.start_time)} - ${formatTime(ac.end_time)}` : 'Additional',
          topic: ac.topic || '',
          is_additional: true
        })
      })

      // Sort classes by date for each subject and return values
      const result = Array.from(subjectMap.values()).map(data => ({
        ...data,
        classes: data.classes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      }))

      return result
    } catch (error) {
      logger.error('Error in getTopicSheetData:', error)
      return []
    }
  }

  /**
   * Get attendance sheet data for all subjects
   */
  static async getAttendanceSheetData(peertutorsId: string): Promise<FullClassReport[]> {
    try {
      // 1. Get all subjects for the peer tutor
      const subjects = await this.getpeerTutorubjects(peertutorsId)

      if (!subjects || subjects.length === 0) return []

      // 2. Fetch full class report for each subject
      const reports = await Promise.all(
        subjects.map(async (subject) => {
          return await this.getSubjectFullClassReport(peertutorsId, subject.subject_name)
        })
      )

      // Filter out nulls
      return reports.filter((r): r is FullClassReport => r !== null)
    } catch (error) {
      logger.error('Error in getAttendanceSheetData:', error)
      return []
    }
  }
}

function formatTime(timeString: string) {
  if (!timeString) return ''
  const [hours, minutes] = timeString.split(':')
  const date = new Date()
  date.setHours(parseInt(hours), parseInt(minutes))
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
