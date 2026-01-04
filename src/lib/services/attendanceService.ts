import { createClient } from '@/utils/supabase/client'
import { ScheduledClassService, ScheduledClassWithDetails } from './scheduledClassService'

export interface Attendance {
  id: string
  class_id?: string
  scheduled_class_id?: string
  additional_class_id?: string
  student_id: string
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

export interface AttendanceRecord {
  student_id: string
  student_name: string
  student_email: string
  status: 'present' | 'absent'
  peer_tutor_name?: string
  peer_tutor_email?: string
  created_at?: string
}

export class AttendanceService {
  /**
   * Get students assigned to a peer tutor for attendance
   */
  static async getStudentsForAttendance(peerTutorId: string): Promise<any[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('id, name, email')
        .eq('assigned_peer_tutor_id', peerTutorId)
        .eq('peer_tutor', false)

      if (error) {
        console.error('Error getting students for attendance:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error in getStudentsForAttendance:', error)
      return []
    }
  }

  /**
   * Get attendance records for a scheduled class
   */
  static async getAttendanceByScheduledClass(scheduledClassId: string): Promise<AttendanceRecord[]> {
    try {
      const supabase = createClient()
      
      console.log('Getting attendance for scheduled class:', scheduledClassId)
      
      // First, get the scheduled class details to find the peer tutor and class_id
      const { data: scheduledClass, error: classError } = await supabase
        .from('scheduled_classes')
        .select('peer_tutor_id, class_id')
        .eq('id', scheduledClassId)
        .single()

      if (classError || !scheduledClass) {
        console.error('Error getting scheduled class:', classError)
        return []
      }

      console.log('Scheduled class details:', {
        peerTutorId: scheduledClass.peer_tutor_id,
        classId: scheduledClass.class_id
      })

      // Get all students assigned to this peer tutor
      const { data: assignedStudents, error: studentsError } = await supabase
        .from('peer_students')
        .select('id, name, email')
        .eq('assigned_peer_tutor_id', scheduledClass.peer_tutor_id)
        .eq('peer_tutor', false)

      if (studentsError) {
        console.error('Error getting assigned students:', studentsError)
        return []
      }

      console.log('Assigned students:', assignedStudents)

      // Get attendance records for this scheduled class
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select(`
          student_id,
          status,
          scheduled_class_id
        `)
        .eq('scheduled_class_id', scheduledClassId)

      if (attendanceError) {
        console.error('Error getting attendance by scheduled_class_id:', attendanceError)
        return []
      }

      console.log('Attendance records found:', attendanceData || [])
      console.log('Query used:', `scheduled_class_id.eq.${scheduledClassId}`)

      // Create a map of attendance records for quick lookup
      const attendanceMap = new Map()
      if (attendanceData) {
        attendanceData.forEach(record => {
          console.log('Attendance record:', {
            studentId: record.student_id,
            status: record.status,
            scheduledClassId: record.scheduled_class_id
          })
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

      // If no assigned students found but we have attendance data, try to get student info directly from attendance records
      if (result.length === 0 && attendanceData.length > 0) {
        console.log('No assigned students found, trying direct approach from attendance records...')
        
        // Get student info for each attendance record
        const studentIds = attendanceData.map(record => record.student_id)
        const { data: studentInfo, error: studentInfoError } = await supabase
          .from('peer_students')
          .select('id, name, email')
          .in('id', studentIds)

        if (studentInfoError) {
          console.error('Error getting student info:', studentInfoError)
        } else {
          console.log('Student info from attendance records:', studentInfo)
          
          result = attendanceData.map(record => {
            const student = studentInfo?.find(s => s.id === record.student_id)
            return {
              student_id: record.student_id,
              student_name: student?.name || 'Unknown',
              student_email: student?.email || 'Unknown',
              status: record.status
            }
          })
        }
      }

      console.log('Final attendance result:', result)
      console.log('Debug summary:', {
        assignedStudentsCount: assignedStudents.length,
        attendanceRecordsCount: attendanceData.length,
        attendanceMapSize: attendanceMap.size,
        finalResultCount: result.length,
        assignedStudentIds: assignedStudents.map(s => s.id),
        attendanceRecordStudentIds: attendanceData.map(r => r.student_id),
        attendanceMapKeys: Array.from(attendanceMap.keys())
      })
      return result

    } catch (error) {
      console.error('Error in getAttendanceByScheduledClass:', error)
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
      
      console.log('Getting attendance for class:', classId)
      
      // First, get all scheduled classes for this class_id
      const { data: scheduledClasses, error: scheduledError } = await supabase
        .from('scheduled_classes')
        .select('id')
        .eq('class_id', classId)

      if (scheduledError) {
        console.error('Error getting scheduled classes:', JSON.stringify(scheduledError, null, 2))
        return []
      }

      if (!scheduledClasses || scheduledClasses.length === 0) {
        console.log('No scheduled classes found for class:', classId)
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
        console.error('Error getting attendance by class:', error)
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return []
      }

      console.log('Attendance data retrieved:', data)

      // If no attendance records exist, return empty array
      if (!data || data.length === 0) {
        console.log('No attendance records found for class:', classId)
        return []
      }

      return data.map(item => ({
        student_id: item.student_id,
        student_name: (item.peer_students as any)?.name || 'Unknown',
        student_email: (item.peer_students as any)?.email || 'Unknown',
        status: item.status
      }))
    } catch (error) {
      console.error('Error in getAttendanceByClass:', error)
      return []
    }
  }

  /**
   * Mark attendance for students in a scheduled class
   */
  static async markAttendanceForScheduledClass(scheduledClassId: string, peerTutorId: string, attendanceRecords: AttendanceRecord[]): Promise<boolean> {
    try {
      const supabase = createClient()
      
      console.log('=== markAttendanceForScheduledClass called ===')
      console.log('Marking attendance for scheduled class:', scheduledClassId, 'peer tutor:', peerTutorId)
      console.log('Attendance records:', attendanceRecords)
      
      // Validate input data
      if (!scheduledClassId || !peerTutorId) {
        console.error('Missing required parameters: scheduledClassId or peerTutorId')
        return false
      }
      
      if (!attendanceRecords || attendanceRecords.length === 0) {
        console.error('No attendance records provided')
        return false
      }
      
      // Validate each attendance record
      const validRecords = attendanceRecords.filter(record => 
        record.student_id && 
        record.status && 
        (record.status === 'present' || record.status === 'absent')
      )
      
      if (validRecords.length === 0) {
        console.error('No valid attendance records found')
        return false
      }
      
      console.log('Valid attendance records:', validRecords)
      
      // Get the class_id from the scheduled class
      const scheduledClass = await ScheduledClassService.getScheduledClassById(scheduledClassId)
      if (!scheduledClass) {
        console.error('Scheduled class not found:', scheduledClassId)
        return false
      }
      
      console.log('Scheduled class found:', scheduledClass)
      
      // Prepare attendance data for insert with both scheduled_class_id and class_id
      const attendanceData = validRecords.map(record => ({
        scheduled_class_id: scheduledClassId,
        class_id: scheduledClass.class_id,
        student_id: record.student_id,
        peer_tutor_id: peerTutorId,
        status: record.status
      }))

      console.log('Prepared attendance data for insert:', attendanceData)

      // First, delete existing attendance records for this scheduled class and peer tutor
      console.log('Deleting existing attendance records...')
      const { error: deleteError } = await supabase
        .from('attendance')
        .delete()
        .eq('scheduled_class_id', scheduledClassId)
        .eq('peer_tutor_id', peerTutorId)

      if (deleteError) {
        console.error('Error deleting existing attendance records:', deleteError)
        throw deleteError
      } else {
        console.log('Successfully deleted existing attendance records')
      }

      // Then insert new attendance records
      console.log('Inserting new attendance records...')
      const { data, error: insertError } = await supabase
        .from('attendance')
        .insert(attendanceData)
        .select()

      if (insertError) {
        console.error('Error inserting attendance records:', insertError)
        throw insertError
      }

      console.log('Successfully inserted attendance records:', data)
      return true
    } catch (error) {
      console.error('Error in markAttendanceForScheduledClass:', error)
      throw error
    }
  }

  /**
   * Mark attendance for students (legacy method for backward compatibility)
   */
  static async markAttendance(classId: string, peerTutorId: string, attendanceRecords: AttendanceRecord[], scheduledClassId?: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      console.log('Marking attendance for class:', classId, 'peer tutor:', peerTutorId)
      console.log('Attendance records:', attendanceRecords)
      
      // Validate input data
      if (!classId || !peerTutorId) {
        console.error('Missing required parameters: classId or peerTutorId')
        return false
      }
      
      if (!attendanceRecords || attendanceRecords.length === 0) {
        console.error('No attendance records provided')
        return false
      }
      
      // Validate each attendance record
      const validRecords = attendanceRecords.filter(record => 
        record.student_id && 
        record.status && 
        (record.status === 'present' || record.status === 'absent')
      )
      
      if (validRecords.length === 0) {
        console.error('No valid attendance records found')
        return false
      }
      
      console.log('Valid attendance records:', validRecords)
      
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

      // Prepare attendance data for insert with both scheduled_class_id and class_id
      const attendanceData = validRecords.map(record => ({
        scheduled_class_id: resolvedScheduledClassId,
        class_id: resolvedClassId,
        student_id: record.student_id,
        peer_tutor_id: peerTutorId,
        status: record.status
      }))

      console.log('Prepared attendance data for insert:', attendanceData)

      // First, delete existing attendance records for this scheduled class and peer tutor
      console.log('Deleting existing attendance records...')
      const { error: deleteError } = await supabase
        .from('attendance')
        .delete()
        .eq('scheduled_class_id', resolvedScheduledClassId || resolvedClassId)
        .eq('peer_tutor_id', peerTutorId)

      if (deleteError) {
        console.error('Error deleting existing attendance records:', deleteError)
        // Don't return false here, continue with insert as delete might fail if no records exist
      } else {
        console.log('Successfully deleted existing attendance records')
      }

      // Then insert new attendance records
      console.log('Inserting new attendance records...')
      const { data, error: insertError } = await supabase
        .from('attendance')
        .insert(attendanceData)
        .select()

      if (insertError) {
        console.error('Error inserting attendance records:', insertError)
        console.error('Insert error details:', {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code
        })
        return false
      }

      console.log('Successfully inserted attendance records:', data)
      return true
    } catch (error) {
      console.error('Error in markAttendance:', error)
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
        console.error('Error getting class topics:', error)
        return []
      }

      return data as ClassTopic[] || []
    } catch (error) {
      console.error('Error in getClassTopics:', error)
      return []
    }
  }

  /**
   * Add a topic to a class
   */
  static async addClassTopic(classId: string, peerTutorId: string, topicName: string, description?: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('class_topics')
        .insert([{
          class_id: classId,
          peer_tutor_id: peerTutorId,
          topic_name: topicName,
          description: description
        }])

      if (error) {
        console.error('Error adding class topic:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in addClassTopic:', error)
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
        console.error('Error deleting class topic:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in deleteClassTopic:', error)
      return false
    }
  }

  /**
   * Get attendance history for a peer tutor with date and class filtering
   */
  static async getAttendanceHistory(
    peerTutorId: string, 
    startDate?: string, 
    endDate?: string, 
    scheduledClassId?: string
  ): Promise<any[]> {
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
        .eq('peer_tutor_id', peerTutorId)
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
        console.error('Error getting attendance history:', error)
        console.error('Error details:', {
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
        console.log('No attendance records found for peer tutor:', peerTutorId)
        return []
      }
      
      console.log(`Processing ${validData.length} attendance records for peer tutor:`, peerTutorId)
      
      // Add scheduled class information if available
      const enrichedData = await Promise.all(
        validData.map(async (record) => {
          // Check if record exists and has required properties
          if (!record || !record.id) {
            console.warn('Invalid record found:', record)
            return null
          }

          // Check if classes data exists before accessing properties
          if (!record.classes) {
            console.warn('No classes data found for attendance record:', record.id)
            return {
              ...record,
              scheduled_classes: null
            }
          }

          try {
            // Get the first class record (should be only one)
            const classRecord = Array.isArray(record.classes) ? record.classes[0] : record.classes
            
            if (!classRecord) {
              console.warn('No class record found for attendance record:', record.id)
              return {
                ...record,
                scheduled_classes: null
              }
            }

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
              scheduled_classes: matchingScheduledClass ? {
                id: matchingScheduledClass.id,
                scheduled_date: matchingScheduledClass.scheduled_date,
                class_id: matchingScheduledClass.class_id
              } : null
            }
          } catch (error) {
            console.error('Error fetching scheduled classes for record:', record.id, error)
            return {
              ...record,
              scheduled_classes: null
            }
          }
        })
      )

      // Filter out any null records that couldn't be processed
      return enrichedData.filter(record => record !== null)
    } catch (error) {
      console.error('Error in getAttendanceHistory:', error)
      return []
    }
  }

  /**
   * Get attendance summary for a peer tutor
   */
  static async getAttendanceSummary(peerTutorId: string): Promise<{
    totalClasses: number
    totalStudents: number
    presentCount: number
    absentCount: number
    attendanceRate: number
  }> {
    try {
      const supabase = createClient()
      
      console.log('Getting attendance summary for peer tutor ID:', peerTutorId)
      
      // First get peer tutor info to get dept, year, section
      const { data: tutorData, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('dept, year, section')
        .eq('id', peerTutorId)
        .single()

      if (tutorError) {
        console.error('Error getting peer tutor info:', tutorError)
        console.error('Tutor error details:', {
          message: tutorError.message,
          details: tutorError.details,
          hint: tutorError.hint,
          code: tutorError.code
        })
        return {
          totalClasses: 0,
          totalStudents: 0,
          presentCount: 0,
          absentCount: 0,
          attendanceRate: 0
        }
      }

      if (!tutorData) {
        console.error('No peer tutor data found for ID:', peerTutorId)
        return {
          totalClasses: 0,
          totalStudents: 0,
          presentCount: 0,
          absentCount: 0,
          attendanceRate: 0
        }
      }

      console.log('Peer tutor data:', tutorData)

      // Get total scheduled classes for this peer tutor's dept, year, section
      const { data: scheduledClassesData, error: scheduledClassesError } = await supabase
        .from('scheduled_classes')
        .select('id')
        .eq('dept', tutorData.dept)
        .eq('year', tutorData.year)
        .eq('section', tutorData.section)

      if (scheduledClassesError) {
        console.error('Error getting scheduled classes count:', scheduledClassesError)
        console.error('Scheduled classes error details:', {
          message: scheduledClassesError.message,
          details: scheduledClassesError.details,
          hint: scheduledClassesError.hint,
          code: scheduledClassesError.code
        })
        return {
          totalClasses: 0,
          totalStudents: 0,
          presentCount: 0,
          absentCount: 0,
          attendanceRate: 0
        }
      }

      // Get total students assigned to this peer tutor
      const { data: studentsData, error: studentsError } = await supabase
        .from('peer_students')
        .select('id')
        .eq('assigned_peer_tutor_id', peerTutorId)
        .eq('peer_tutor', false)

      if (studentsError) {
        console.error('Error getting students count:', studentsError)
        console.error('Students error details:', {
          message: studentsError.message,
          details: studentsError.details,
          hint: studentsError.hint,
          code: studentsError.code
        })
        return {
          totalClasses: 0,
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
        .eq('peer_tutor_id', peerTutorId)

      if (attendanceError) {
        console.error('Error getting attendance records:', attendanceError)
        console.error('Attendance error details:', {
          message: attendanceError.message,
          details: attendanceError.details,
          hint: attendanceError.hint,
          code: attendanceError.code
        })
        return {
          totalClasses: 0,
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

      console.log('Attendance summary calculated:', {
        totalClasses: scheduledClassesData?.length || 0,
        totalStudents: studentsData?.length || 0,
        presentCount,
        absentCount,
        attendanceRate: Math.round(attendanceRate * 100) / 100
      })

      return {
        totalClasses: scheduledClassesData?.length || 0,
        totalStudents: studentsData?.length || 0,
        presentCount,
        absentCount,
        attendanceRate: Math.round(attendanceRate * 100) / 100
      }
    } catch (error) {
      console.error('Error in getAttendanceSummary:', error)
      return {
        totalClasses: 0,
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
        console.error('Error updating attendance record:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in updateAttendanceRecord:', error)
      return false
    }
  }

  /**
   * Get attendance history for a specific student
   */
  static async getStudentAttendanceHistory(studentId: string, peerTutorId: string): Promise<any[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          id,
          class_id,
          scheduled_class_id,
          student_id,
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
        .eq('peer_tutor_id', peerTutorId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error getting student attendance history:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error in getStudentAttendanceHistory:', error)
      return []
    }
  }
}
