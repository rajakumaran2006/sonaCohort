import { createClient } from '@/utils/supabase/client'
import { AttendanceService } from './attendanceService'
import { ScheduledClassWithDetails } from './scheduledClassService'
import { AdditionalClassService } from './additionalClassService'

export interface PeerTutorSubject {
  subject_name: string
  class_id: string
  total_classes: number
  completed_classes: number
  pending_classes: number
  additional_classes: number
}

export interface PeerTutorReportData {
  peer_tutor_id: string
  peer_tutor_name: string
  peer_tutor_email: string
  dept: string
  year: string
  section: string
  subjects: PeerTutorSubject[]
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
  static async getPeerTutorSubjects(peerTutorId: string): Promise<PeerTutorSubject[]> {
    try {
      const supabase = createClient()
      
      // Get peer tutor info first (including created_at)
      const { data: peerTutor, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('dept, year, section, created_at')
        .eq('id', peerTutorId)
        .single()

      if (tutorError || !peerTutor) {
        console.error('Error getting peer tutor info:', tutorError)
        return []
      }

      // Calculate the minimum date for classes (day after peer tutor was created)
      const createdDate = new Date(peerTutor.created_at)
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
        .eq('peer_tutor_id', peerTutorId)

      if (allScheduledError) {
        console.error('Error getting scheduled classes:', allScheduledError)
        return []
      }



      if (!allScheduledClasses || allScheduledClasses.length === 0) {
        // If no scheduled classes at all, check if there are classes available for this dept/year/section
        // This handles the case where a peer tutor exists but hasn't been assigned any classes yet
        const { data: classes, error: classesError } = await supabase
          .from('classes')
          .select('id, subject_name')
          .eq('dept', peerTutor.dept)
          .eq('year', peerTutor.year)
          .eq('section', peerTutor.section)

        if (classesError) {
          console.error('Error getting classes:', classesError)
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
      const additionalClasses = await AdditionalClassService.getAdditionalClassesByPeerTutor(peerTutorId)

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
      const subjects: PeerTutorSubject[] = Array.from(classMap.values()).map(classData => {
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
      console.error('Error in getPeerTutorSubjects:', error)
      return []
    }
  }

  /**
   * Get scheduled classes for a specific subject and peer tutor
   */
  static async getSubjectScheduledClasses(peerTutorId: string, subjectName: string): Promise<ScheduledClassWithDetails[]> {
    try {
      const supabase = createClient()
      
      // Get peer tutor info (including created_at)
      const { data: peerTutor, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('dept, year, section, created_at')
        .eq('id', peerTutorId)
        .single()

      if (tutorError || !peerTutor) {
        console.error('Error getting peer tutor info:', tutorError)
        return []
      }

      // Calculate the minimum date for classes (day after peer tutor was created)
      const createdDate = new Date(peerTutor.created_at)
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
        .eq('peer_tutor_id', peerTutorId)
        .eq('class.subject_name', subjectName)
        .gte('scheduled_date', minimumClassDate.toISOString().split('T')[0])
        .order('scheduled_date', { ascending: true })

      if (scheduledError) {
        console.error('Error getting scheduled classes:', scheduledError)
        return []
      }

      return scheduledClasses || []
    } catch (error) {
      console.error('Error in getSubjectScheduledClasses:', error)
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
        console.error('Error getting scheduled class:', classError)
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
        total_students: attendanceRecords.length
      }
    } catch (error) {
      console.error('Error in getClassAttendanceReport:', error)
      return null
    }
  }

  /**
   * Get comprehensive report data for a peer tutor
   */
  static async getPeerTutorReportData(peerTutorId: string): Promise<PeerTutorReportData | null> {
    try {
      const supabase = createClient()
      
      // Get peer tutor info
      const { data: peerTutor, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('id', peerTutorId)
        .single()

      if (tutorError || !peerTutor) {
        console.error('Error getting peer tutor info:', tutorError)
        return null
      }

      // Get subjects
      const subjects = await this.getPeerTutorSubjects(peerTutorId)

      return {
        peer_tutor_id: peerTutor.id,
        peer_tutor_name: peerTutor.name,
        peer_tutor_email: peerTutor.email,
        dept: peerTutor.dept,
        year: peerTutor.year,
        section: peerTutor.section,
        subjects
      }
    } catch (error) {
      console.error('Error in getPeerTutorReportData:', error)
      return null
    }
  }

  /**
   * Get Excel export data for a peer tutor
   */
  static async getExcelExportData(peerTutorId: string): Promise<ExcelExportData[]> {
    try {
      const supabase = createClient()
      
      // Get peer tutor info (including created_at)
      const { data: peerTutor, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('dept, year, section, created_at')
        .eq('id', peerTutorId)
        .single()

      if (tutorError || !peerTutor) {
        console.error('Error getting peer tutor info:', tutorError)
        return []
      }

      // Calculate the minimum date for classes (day after peer tutor was created)
      const createdDate = new Date(peerTutor.created_at)
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
        .eq('peer_tutor_id', peerTutorId)
        .gte('scheduled_date', minimumClassDate.toISOString().split('T')[0])
        .order('scheduled_date', { ascending: true })

      if (scheduledError) {
        console.error('Error getting scheduled classes:', scheduledError)
        return []
      }

      // Get all students assigned to this peer tutor
      const { data: students, error: studentsError } = await supabase
        .from('peer_students')
        .select('id, name, email')
        .eq('assigned_peer_tutor_id', peerTutorId)
        .eq('peer_tutor', false)

      if (studentsError) {
        console.error('Error getting students:', studentsError)
        return []
      }

      // Get all attendance records for this peer tutor
      const { data: attendanceRecords, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .eq('peer_tutor_id', peerTutorId)

      if (attendanceError) {
        console.error('Error getting attendance records:', attendanceError)
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
      console.error('Error in getExcelExportData:', error)
      return []
    }
  }

  /**
   * Get all peer tutors with their report data
   */
  static async getAllPeerTutorReports(): Promise<PeerTutorReportData[]> {
    try {
      const supabase = createClient()
      
      // Get all peer tutors
      const { data: peerTutors, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('*')
        .order('name')

      if (tutorsError) {
        console.error('Error getting peer tutors:', tutorsError)
        return []
      }

      // Get report data for each peer tutor
      const reports = await Promise.all(
        peerTutors.map(async (tutor) => {
          const subjects = await this.getPeerTutorSubjects(tutor.id)
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
      console.error('Error in getAllPeerTutorReports:', error)
      return []
    }
  }
}
