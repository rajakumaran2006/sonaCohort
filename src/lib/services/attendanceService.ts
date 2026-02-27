import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { ScheduledClassService } from './scheduledClassService'

export interface Attendance {
  id: string
  class_id?: string
  scheduled_class_id?: string
  additional_class_id?: string
  student_id: string | null
  student_name?: string | null
  peer_tutor_id: string
  status: 'present' | 'absent'
  created_at: string
  updated_at: string
}

export interface ClassTopic {
  id: string
  class_id: string
  topic_name: string
  description?: string
  created_at: string
}

import { Student } from './studentService'

export interface AttendanceRecord {
  student_id: string
  student_name: string
  student_email: string
  status: 'present' | 'absent'
  peer_tutor_name?: string
  peer_tutor_email?: string
  created_at?: string
}

export interface AttendanceHistoryRecord extends Attendance {
  classes?: {
    id: string
    subject_name: string
    created_at: string
    dept: string
    year: string
    section: string
  } | null
  
  scheduled_classes?: {
    id: string
    scheduled_date: string
    class_id: string
  } | null
  
  peer_students?: {
    id: string
    name: string
    email: string
  } | null
}

export class AttendanceService {
  /**
   * Get students assigned to a peer tutor for attendance
   */
  static async getStudentsForAttendance(peertutorsId: string): Promise<Pick<Student, 'id' | 'name' | 'email'>[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('id, name, email')
        .eq('assigned_peer_tutor_id', peertutorsId)
        .eq('peer_tutor', false)

      if (error) {
        logger.error('Error getting students for attendance:', error)
        return []
      }

      return data || []
    } catch (error) {
      logger.error('Error in getStudentsForAttendance:', error)
      return []
    }
  }

  /**
   * Get attendance records for a scheduled class
   */
  static async getAttendanceByScheduledClass(scheduledClassId: string): Promise<AttendanceRecord[]> {
    try {
      const supabase = createClient()
      
      // logger.info('Getting attendance for scheduled class:', scheduledClassId)
      
      // First, get the scheduled class details to find the peer tutor and class_id
      const { data: scheduledClass, error: classError } = await supabase
        .from('scheduled_classes')
        .select('peer_tutor_id, class_id')
        .eq('id', scheduledClassId)
        .single()

      if (classError || !scheduledClass) {
        logger.error('Error getting scheduled class:', classError)
        return []
      }

      // logger.info('Scheduled class details:', {
      //   peertutorsId: scheduledClass.peer_tutor_id,
      //   classId: scheduledClass.class_id
      // })

      // Get all students assigned to this peer tutor
      const { data: assignedStudents, error: studentsError } = await supabase
        .from('peer_students')
        .select('id, name, email')
        .eq('assigned_peer_tutor_id', scheduledClass.peer_tutor_id)
        .eq('peer_tutor', false)

      if (studentsError) {
        logger.error('Error getting assigned students:', studentsError)
        return []
      }

      // logger.info('Assigned students:', assignedStudents)

      // Get attendance records for this scheduled class
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select(`
          student_id,
          student_name,
          status,
          scheduled_class_id
        `)
        .eq('scheduled_class_id', scheduledClassId)

      if (attendanceError) {
        logger.error('Error getting attendance by scheduled_class_id:', attendanceError)
        return []
      }

      // logger.info('Attendance records found:', attendanceData || [])
      // logger.info('Query used:', `scheduled_class_id.eq.${scheduledClassId}`)

      // Create a map of attendance records for quick lookup
      const attendanceMap = new Map()
      if (attendanceData) {
        attendanceData.forEach(record => {
          // logger.info('Attendance record:', {
          //   studentId: record.student_id,
          //   status: record.status,
          //   scheduledClassId: record.scheduled_class_id
          // })
          attendanceMap.set(record.student_id, record.status)
        })
      }

      // Return all assigned students, with attendance status if available
      let result = assignedStudents.map(student => ({
        student_id: student.id,
        student_name: student.name || 'Unknown',
        student_email: student.email || 'Unknown',
        status: attendanceMap.has(student.id) ? attendanceMap.get(student.id) : 'absent' // Default to absent if no record
      }))

      // Also include attendance records for removed students (student_id is NULL but student_name is preserved)
      if (attendanceData) {
        const removedStudentRecords = attendanceData.filter(record => record.student_id === null && record.student_name)
        for (const record of removedStudentRecords) {
          result.push({
            student_id: '',
            student_name: `${record.student_name || 'Removed Student'} (Removed)`,
            student_email: '',
            status: record.status
          })
        }

        // Also include unassigned students (exist in DB but no longer assigned to this tutor)
        const assignedIds = new Set(assignedStudents.map(s => s.id))
        const unassignedIds = new Set<string>()
        for (const record of attendanceData) {
          if (record.student_id && !assignedIds.has(record.student_id)) {
            unassignedIds.add(record.student_id)
          }
        }

        if (unassignedIds.size > 0) {
          const { data: unassignedStudentInfo } = await supabase
            .from('peer_students')
            .select('id, name, email')
            .in('id', Array.from(unassignedIds))

          for (const student of (unassignedStudentInfo || [])) {
            const status = attendanceMap.get(student.id) || 'absent'
            result.push({
              student_id: student.id,
              student_name: `${student.name} (Unassigned)`,
              student_email: student.email || '',
              status
            })
          }
        }
      }

      // If no assigned students found but we have attendance data, try to get student info directly from attendance records
      if (result.length === 0 && attendanceData.length > 0) {
        // Get student info for each attendance record that has a student_id
        const studentIds = attendanceData.filter(r => r.student_id).map(record => record.student_id)
        const { data: studentInfo, error: studentInfoError } = studentIds.length > 0
          ? await supabase.from('peer_students').select('id, name, email').in('id', studentIds)
          : { data: [], error: null }

        if (studentInfoError) {
          logger.error('Error getting student info:', studentInfoError)
        } else {
          result = attendanceData.map(record => {
            if (record.student_id) {
              const student = studentInfo?.find(s => s.id === record.student_id)
              return {
                student_id: record.student_id,
                student_name: student?.name || record.student_name || 'Unknown',
                student_email: student?.email || '',
                status: record.status
              }
            } else {
              // Removed student — use stored student_name
              return {
                student_id: '',
                student_name: record.student_name || 'Removed Student',
                student_email: '',
                status: record.status
              }
            }
          })
        }
      }

      // logger.info('Final attendance result:', result)
      // logger.info('Debug summary:', {
      //   assignedStudentsCount: assignedStudents.length,
      //   attendanceRecordsCount: attendanceData.length,
      //   attendanceMapSize: attendanceMap.size,
      //   finalResultCount: result.length,
      //   assignedStudentIds: assignedStudents.map(s => s.id),
      //   attendanceRecordStudentIds: attendanceData.map(r => r.student_id),
      //   attendanceMapKeys: Array.from(attendanceMap.keys())
      // })
      return result

    } catch (error) {
      logger.error('Error in getAttendanceByScheduledClass:', error)
      return []
    }
  }

  /**
   * Get attendance records for a class (legacy method for backward compatibility)
   * This method now works with the new attendance table structure
   */
  static async getAttendanceByClass(classId: string): Promise<AttendanceRecord[]> {
    try {
      const supabase = createClient()
      
      // logger.info('Getting attendance for class:', classId)
      
      // First, get all scheduled classes for this class_id
      const { data: scheduledClasses, error: scheduledError } = await supabase
        .from('scheduled_classes')
        .select('id')
        .eq('class_id', classId)

      if (scheduledError) {
        logger.error('Error getting scheduled classes:', JSON.stringify(scheduledError, null, 2))
        return []
      }

      if (!scheduledClasses || scheduledClasses.length === 0) {
        // logger.info('No scheduled classes found for class:', classId)
        return []
      }

      // Get attendance records for all scheduled classes
      const scheduledClassIds = scheduledClasses.map(sc => sc.id)
      
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          student_id,
          status,
          peer_students(
            id,
            name,
            email
          )
        `)
        .in('scheduled_class_id', scheduledClassIds)

      if (error) {
        logger.error('Error getting attendance by class:', error)
        logger.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return []
      }

      // logger.info('Attendance data retrieved:', data)

      // If no attendance records exist, return empty array
      if (!data || data.length === 0) {
        // logger.info('No attendance records found for class:', classId)
        return []
      }

      return data.map(item => {
        const peerStudent = Array.isArray(item.peer_students) ? item.peer_students[0] : item.peer_students
        return {
          student_id: item.student_id || '',
          student_name: peerStudent?.name || (item as Record<string, unknown>).student_name as string || 'Removed Student',
          student_email: peerStudent?.email || '',
          status: item.status
        }
      })
    } catch (error) {
      logger.error('Error in getAttendanceByClass:', error)
      return []
    }
  }

  /**
   * Mark attendance for students in a scheduled class
   */
  static async markAttendanceForScheduledClass(scheduledClassId: string, peertutorsId: string, attendanceRecords: AttendanceRecord[]): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // logger.info('=== markAttendanceForScheduledClass called ===')
      // logger.info('Marking attendance for scheduled class:', scheduledClassId, 'peer tutor:', peertutorsId)
      // logger.info('Attendance records:', attendanceRecords)
      
      // Validate input data
      if (!scheduledClassId || !peertutorsId) {
        logger.error('Missing required parameters: scheduledClassId or peertutorsId')
        return false
      }
      
      if (!attendanceRecords || attendanceRecords.length === 0) {
        logger.error('No attendance records provided')
        return false
      }
      
      // Validate each attendance record
      const validRecords = attendanceRecords.filter(record => 
        record.student_id && 
        record.status && 
        (record.status === 'present' || record.status === 'absent')
      )
      
      if (validRecords.length === 0) {
        logger.error('No valid attendance records found')
        return false
      }
      
      // logger.info('Valid attendance records:', validRecords)
      
      // Get the class_id from the scheduled class
      const scheduledClass = await ScheduledClassService.getScheduledClassById(scheduledClassId)
      if (!scheduledClass) {
        logger.error('Scheduled class not found:', scheduledClassId)
        return false
      }
      
      // logger.info('Scheduled class found:', scheduledClass)
      
      // Look up student names for the records
      const studentIds = validRecords.map(r => r.student_id).filter(Boolean)
      const studentNameMap = new Map<string, string>()
      if (studentIds.length > 0) {
        const { data: studentData } = await supabase
          .from('peer_students')
          .select('id, name')
          .in('id', studentIds)
        if (studentData) {
          studentData.forEach(s => studentNameMap.set(s.id, s.name))
        }
      }

      // Prepare attendance data for insert with both scheduled_class_id and class_id
      const attendanceData = validRecords.map(record => ({
        scheduled_class_id: scheduledClassId,
        class_id: scheduledClass.class_id,
        student_id: record.student_id,
        student_name: studentNameMap.get(record.student_id) || record.student_name || null,
        peer_tutor_id: peertutorsId,
        status: record.status
      }))

      // logger.info('Prepared attendance data for insert:', attendanceData)

      // First, delete existing attendance records for this scheduled class and peer tutor
      // logger.info('Deleting existing attendance records...')
      const { error: deleteError } = await supabase
        .from('attendance')
        .delete()
        .eq('scheduled_class_id', scheduledClassId)
        .eq('peer_tutor_id', peertutorsId)

      if (deleteError) {
        logger.error('Error deleting existing attendance records:', deleteError)
        throw deleteError
      } else {
        // logger.info('Successfully deleted existing attendance records')
      }

      // Then insert new attendance records
      // logger.info('Inserting new attendance records...')
      const { error: insertError } = await supabase
        .from('attendance')
        .insert(attendanceData)
        .select()

      if (insertError) {
        logger.error('Error inserting attendance records:', insertError)
        throw insertError
      }

      // logger.info('Successfully inserted attendance records:', data)
      return true
    } catch (error) {
      logger.error('Error in markAttendanceForScheduledClass:', error)
      throw error
    }
  }

  /**
   * Mark attendance for students (legacy method for backward compatibility)
   */
  static async markAttendance(classId: string, peertutorsId: string, attendanceRecords: AttendanceRecord[], scheduledClassId?: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // logger.info('Marking attendance for class:', classId, 'peer tutor:', peertutorsId)
      // logger.info('Attendance records:', attendanceRecords)
      
      // Validate input data
      if (!classId || !peertutorsId) {
        logger.error('Missing required parameters: classId or peertutorsId')
        return false
      }
      
      if (!attendanceRecords || attendanceRecords.length === 0) {
        logger.error('No attendance records provided')
        return false
      }
      
      // Validate each attendance record
      const validRecords = attendanceRecords.filter(record => 
        record.student_id && 
        record.status && 
        (record.status === 'present' || record.status === 'absent')
      )
      
      if (validRecords.length === 0) {
        logger.error('No valid attendance records found')
        return false
      }
      
      // logger.info('Valid attendance records:', validRecords)
      
      // Resolve scheduled_class_id and class_id correctly
      let resolvedScheduledClassId = scheduledClassId
      let resolvedClassId = classId

      if (!resolvedScheduledClassId) {
        // Try to find scheduled class by class_id
        const scheduledClass = await ScheduledClassService.getScheduledClassByClassId(classId)
        if (scheduledClass) {
          resolvedScheduledClassId = scheduledClass.id
          resolvedClassId = scheduledClass.class_id
        }
      }

      // Look up student names for the records
      const studentIds2 = validRecords.map(r => r.student_id).filter(Boolean)
      const studentNameMap2 = new Map<string, string>()
      if (studentIds2.length > 0) {
        const { data: studentData2 } = await supabase
          .from('peer_students')
          .select('id, name')
          .in('id', studentIds2)
        if (studentData2) {
          studentData2.forEach(s => studentNameMap2.set(s.id, s.name))
        }
      }

      // Prepare attendance data for insert with both scheduled_class_id and class_id
      const attendanceData = validRecords.map(record => ({
        scheduled_class_id: resolvedScheduledClassId,
        class_id: resolvedClassId,
        student_id: record.student_id,
        student_name: studentNameMap2.get(record.student_id) || record.student_name || null,
        peer_tutor_id: peertutorsId,
        status: record.status
      }))

      // logger.info('Prepared attendance data for insert:', attendanceData)

      // First, delete existing attendance records for this scheduled class and peer tutor
      // logger.info('Deleting existing attendance records...')
      const { error: deleteError } = await supabase
        .from('attendance')
        .delete()
        .eq('scheduled_class_id', resolvedScheduledClassId || resolvedClassId)
        .eq('peer_tutor_id', peertutorsId)

      if (deleteError) {
        logger.error('Error deleting existing attendance records:', deleteError)
        // Don't return false here, continue with insert as delete might fail if no records exist
      } else {
        // logger.info('Successfully deleted existing attendance records')
      }

      // Then insert new attendance records
      // logger.info('Inserting new attendance records...')
      const { error: insertError } = await supabase
        .from('attendance')
        .insert(attendanceData)
        .select()

      if (insertError) {
        logger.error('Error inserting attendance records:', insertError)
        logger.error('Insert error details:', {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code
        })
        return false
      }

      // logger.info('Successfully inserted attendance records:', data)
      return true
    } catch (error) {
      logger.error('Error in markAttendance:', error)
      return false
    }
  }

  /**
   * Get topics for a class
   */
  static async getClassTopics(classId: string): Promise<ClassTopic[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('class_topics')
        .select('*')
        .eq('class_id', classId)
        .order('created_at', { ascending: true })

      if (error) {
        logger.error('Error getting class topics:', error)
        return []
      }

      return data as ClassTopic[] || []
    } catch (error) {
      logger.error('Error in getClassTopics:', error)
      return []
    }
  }

  /**
   * Add a topic to a class
   */
  static async addClassTopic(classId: string, peertutorsId: string, topicName: string, description?: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('class_topics')
        .insert([{
          class_id: classId,
          peer_tutor_id: peertutorsId,
          topic_name: topicName,
          description: description
        }])

      if (error) {
        logger.error('Error adding class topic:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in addClassTopic:', error)
      return false
    }
  }

  /**
   * Delete a topic
   */
  static async deleteClassTopic(topicId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('class_topics')
        .delete()
        .eq('id', topicId)

      if (error) {
        logger.error('Error deleting class topic:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in deleteClassTopic:', error)
      return false
    }
  }

  /**
   * Get attendance history for a peer tutor with date and class filtering
   */
  static async getAttendanceHistory(
    peertutorsId: string, 
    startDate?: string, 
    endDate?: string, 
    scheduledClassId?: string
  ): Promise<AttendanceHistoryRecord[]> {
    try {
      const supabase = createClient()
      
      // Include both classes and scheduled_classes so class details are available even when class_id is null
      let query = supabase
        .from('attendance')
        .select(`
          id,
          class_id,
          scheduled_class_id,
          student_id,
          peer_tutor_id,
          status,
          created_at,
          updated_at,
          classes(
            id,
            subject_name,
            created_at,
            dept,
            year,
            section
          ),
          scheduled_classes(
            id,
            scheduled_date,
            class_id
          ),
          peer_students(
            id,
            name,
            email
          )
        `)
        .eq('peer_tutor_id', peertutorsId)
        .order('created_at', { ascending: false })

      if (startDate) {
        query = query.gte('created_at', startDate)
      }
      
      if (endDate) {
        query = query.lte('created_at', endDate)
      }
      
      // Filter by scheduled_class_id when provided
      if (scheduledClassId) {
        query = query.eq('scheduled_class_id', scheduledClassId)
      }

      const { data, error } = await query

      if (error) {
        logger.error('Error getting attendance history:', error)
        logger.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return []
      }

      // Ensure data is an array before processing
      const validData = Array.isArray(data) ? data : []
      
      if (validData.length === 0) {
        // logger.info('No attendance records found for peer tutor:', peertutorsId)
        return []
      }
      
      // logger.info(`Processing ${validData.length} attendance records for peer tutor:`, peertutorsId)
      
      // Add scheduled class information if available
      const enrichedData = await Promise.all(
        validData.map(async (record) => {
          // Check if record exists and has required properties
          if (!record || !record.id) {
            logger.warn('Invalid record found:', record)
            return null
          }

          // Normalize nested objects
          const classRecord = Array.isArray(record.classes) ? record.classes[0] : record.classes
          const peerStudent = Array.isArray(record.peer_students) ? record.peer_students[0] : record.peer_students

          // Check if classes data exists
          if (!record.classes || !classRecord) {
            logger.warn('No class record found for attendance record:', record.id)
            return {
              ...record,
              classes: null,
              peer_students: peerStudent,
              scheduled_classes: null
            } as AttendanceHistoryRecord
          }

          try {
            // Try to find the scheduled class for this attendance record
            const scheduledClasses = await ScheduledClassService.getScheduledClassesByDate(
              classRecord.dept,
              classRecord.year,
              classRecord.section
            )
            
            const matchingScheduledClass = scheduledClasses.find(
              sc => sc.class_id === record.class_id
            )

            return {
              ...record,
              classes: classRecord,
              peer_students: peerStudent,
              scheduled_classes: matchingScheduledClass ? {
                id: matchingScheduledClass.id,
                scheduled_date: matchingScheduledClass.scheduled_date,
                class_id: matchingScheduledClass.class_id
              } : null
            } as AttendanceHistoryRecord
          } catch (error) {
            logger.error('Error fetching scheduled classes for record:', record.id, error)
            return {
              ...record,
              classes: classRecord,
              peer_students: peerStudent,
              scheduled_classes: null
            } as AttendanceHistoryRecord
          }
        })
      )

      // Filter out any null records that couldn't be processed
      return enrichedData.filter((record): record is AttendanceHistoryRecord => record !== null)
    } catch (error) {
      logger.error('Error in getAttendanceHistory:', error)
      return []
    }
  }

  /**
   * Get attendance summary for a peer tutor
   */
  static async getAttendanceSummary(peertutorsId: string): Promise<{
    totalClasses: number
    additionalClasses: number
    totalStudents: number
    presentCount: number
    absentCount: number
    attendanceRate: number
  }> {
    try {
      const supabase = createClient()
      
      // logger.info('Getting attendance summary for peer tutor ID:', peertutorsId)
      
      // First get peer tutor info to get dept, year, section
      const { data: tutorData, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('dept, year, section')
        .eq('id', peertutorsId)
        .single()

      if (tutorError) {
        logger.error('Error getting peer tutor info:', tutorError)
        logger.error('Tutor error details:', {
          message: tutorError.message,
          details: tutorError.details,
          hint: tutorError.hint,
          code: tutorError.code
        })
        return {
          totalClasses: 0,
          additionalClasses: 0,
          totalStudents: 0,
          presentCount: 0,
          absentCount: 0,
          attendanceRate: 0
        }
      }

      if (!tutorData) {
        logger.error('No peer tutor data found for ID:', peertutorsId)
        return {
          totalClasses: 0,
          additionalClasses: 0,
          totalStudents: 0,
          presentCount: 0,
          absentCount: 0,
          attendanceRate: 0
        }
      }

      // logger.info('Peer tutor data:', tutorData)

      // Get total scheduled classes for this peer tutor's dept, year, section
      const { data: scheduledClassesData, error: scheduledClassesError } = await supabase
        .from('scheduled_classes')
        .select('id')
        .eq('dept', tutorData.dept)
        .eq('year', tutorData.year)
        .eq('section', tutorData.section)
        .eq('peer_tutor_id', peertutorsId)

      if (scheduledClassesError) {
        logger.error('Error getting scheduled classes count:', scheduledClassesError)
        logger.error('Scheduled classes error details:', {
          message: scheduledClassesError.message,
          details: scheduledClassesError.details,
          hint: scheduledClassesError.hint,
          code: scheduledClassesError.code
        })
        return {
          totalClasses: 0,
          additionalClasses: 0,
          totalStudents: 0,
          presentCount: 0,
          absentCount: 0,
          attendanceRate: 0
        }
      }

      // Get total scheduled classes for this peer tutor (ALL classes, including extra ones)
      const { data: allScheduledClasses, error: allScheduledError } = await supabase
        .from('scheduled_classes')
        .select('id')
        .eq('peer_tutor_id', peertutorsId)

      if (allScheduledError) {
        logger.error('Error getting all scheduled classes count:', allScheduledError)
        return {
          totalClasses: 0,
          additionalClasses: 0,
          totalStudents: 0,
          presentCount: 0,
          absentCount: 0,
          attendanceRate: 0
        }
      }

      const totalScheduledCount = allScheduledClasses?.length || 0
      const sectionScheduledCount = scheduledClassesData?.length || 0
      const additionalClasses = Math.max(0, totalScheduledCount - sectionScheduledCount)

      // Get total students assigned to this peer tutor
      const { data: studentsData, error: studentsError } = await supabase
        .from('peer_students')
        .select('id')
        .eq('assigned_peer_tutor_id', peertutorsId)
        .eq('peer_tutor', false)

      if (studentsError) {
        logger.error('Error getting students count:', studentsError)
        logger.error('Students error details:', {
          message: studentsError.message,
          details: studentsError.details,
          hint: studentsError.hint,
          code: studentsError.code
        })
        return {
          totalClasses: 0,
          additionalClasses: 0,
          totalStudents: 0,
          presentCount: 0,
          absentCount: 0,
          attendanceRate: 0
        }
      }

      // Get attendance records
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('status')
        .eq('peer_tutor_id', peertutorsId)

      if (attendanceError) {
        logger.error('Error getting attendance records:', attendanceError)
        logger.error('Attendance error details:', {
          message: attendanceError.message,
          details: attendanceError.details,
          hint: attendanceError.hint,
          code: attendanceError.code
        })
        return {
          totalClasses: 0,
          additionalClasses: 0,
          totalStudents: 0,
          presentCount: 0,
          absentCount: 0,
          attendanceRate: 0
        }
      }

      const presentCount = attendanceData?.filter(record => record.status === 'present').length || 0
      const absentCount = attendanceData?.filter(record => record.status === 'absent').length || 0
      const totalRecords = presentCount + absentCount
      const attendanceRate = totalRecords > 0 ? (presentCount / totalRecords) * 100 : 0

      logger.info('Attendance summary calculated:', {
        totalClasses: sectionScheduledCount,
        additionalClasses,
        totalStudents: studentsData?.length || 0,
        presentCount,
        absentCount,
        attendanceRate: Math.round(attendanceRate * 100) / 100
      })

      return {
        totalClasses: sectionScheduledCount,
        additionalClasses,
        totalStudents: studentsData?.length || 0,
        presentCount,
        absentCount,
        attendanceRate: Math.round(attendanceRate * 100) / 100
      }
    } catch (error) {
      logger.error('Error in getAttendanceSummary:', error)
      return {
        totalClasses: 0,
        additionalClasses: 0,
        totalStudents: 0,
        presentCount: 0,
        absentCount: 0,
        attendanceRate: 0
      }
    }
  }

  /**
   * Update attendance record
   */
  static async updateAttendanceRecord(
    attendanceId: string, 
    status: 'present' | 'absent'
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('attendance')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', attendanceId)

      if (error) {
        logger.error('Error updating attendance record:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in updateAttendanceRecord:', error)
      return false
    }
  }

  /**
   * Get attendance history for a specific student
   */
  static async getStudentAttendanceHistory(studentId: string, peertutorsId: string): Promise<AttendanceHistoryRecord[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          id,
          class_id,
          scheduled_class_id,
          student_id,
          peer_tutor_id,
          status,
          created_at,
          updated_at,
          classes (
            id,
            subject_name,
            created_at,
            dept,
            year,
            section
          ),
          scheduled_classes (
            id,
            scheduled_date,
            class_id
          )
        `)
        .eq('student_id', studentId)
        .eq('peer_tutor_id', peertutorsId)
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('Error getting student attendance history:', error)
        return []
      }

      return (data || []).map(record => ({
        ...record,
        classes: Array.isArray(record.classes) ? record.classes[0] : record.classes,
        scheduled_classes: Array.isArray(record.scheduled_classes) ? record.scheduled_classes[0] : record.scheduled_classes
      }))
    } catch (error) {
      logger.error('Error in getStudentAttendanceHistory:', error)
      return []
    }
  }
}
