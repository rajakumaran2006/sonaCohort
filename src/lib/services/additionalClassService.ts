import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { AttendanceRecord } from './attendanceService'

export interface AdditionalClass {
  id: string
  peer_tutor_id: string
  subject_name: string
  topic: string
  class_date: string
  year?: string
  created_at: string
  updated_at: string
  start_time?: string | null
  end_time?: string | null
  link?: string | null
}

export interface AdditionalClassAttendanceRecord {
  id: string
  additional_class_id: string
  student_id: string
  peer_tutor_id: string
  status: 'present' | 'absent'
  student_name: string
  student_email?: string
  created_at: string
  updated_at: string
}

export interface AdditionalClassWithAttendance extends AdditionalClass {
  attendance_records: AdditionalClassAttendanceRecord[]
}

export class AdditionalClassService {
  /**
   * Get available subjects for a peer tutor
   */
  static async getAvailableSubjectsForpeertutors(peertutorsId: string): Promise<string[]> {
    try {
      const supabase = createClient()
      
      // Get peer tutor info
      const { data: peertutors, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('dept, year, section')
        .eq('id', peertutorsId)
        .single()

      if (tutorError || !peertutors) {
        logger.error('Error getting peer tutor info:', tutorError)
        return []
      }

      // Get all subjects for this peer tutor's dept/year/section
      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('subject_name')
        .eq('dept', peertutors.dept)
        .eq('year', peertutors.year)
        .eq('section', peertutors.section)

      if (classesError) {
        logger.error('Error getting classes:', classesError)
        return []
      }

      // Extract unique subject names
      const subjects = [...new Set(classes.map(cls => cls.subject_name))]
      return subjects
    } catch (error) {
      logger.error('Error in getAvailableSubjectsForpeertutors:', error)
      return []
    }
  }

  /**
   * Create a new additional class
   */
  static async createAdditionalClass(
    peertutorsId: string,
    subjectName: string,
    topic: string,
    classDate: string,
    attendanceRecords: AttendanceRecord[],
    startTime?: string,
    endTime?: string,
    link?: string
  ): Promise<AdditionalClass | null> {
    try {
      const supabase = createClient()
      
      // First, create the additional class record
      const { data: additionalClass, error: classError } = await supabase
        .from('additional_classes')
        .insert([{
          peer_tutor_id: peertutorsId,
          subject_name: subjectName,
          topic: topic,
          class_date: classDate,
          start_time: startTime,
          end_time: endTime,
          link: link
        }])
        .select()
        .single()

      if (classError) {
        logger.error('Error creating additional class:', classError)
        return null
      }

      // Then, create attendance records in the separate additional_class_attendance table
      

      if (attendanceRecords.length > 0) {
        const attendanceData = attendanceRecords.map(record => ({
          additional_class_id: additionalClass.id,
          student_id: record.student_id,
          peer_tutor_id: peertutorsId,
          status: record.status
        }))

        // logger.info('Attendance data to insert:', attendanceData)

        const { error: attendanceError } = await supabase
          .from('additional_class_attendance')
          .insert(attendanceData)

        if (attendanceError) {
          logger.error('Error creating attendance records for additional class:', attendanceError)
          // Note: We don't rollback the additional class creation here
          // In a production app, you might want to implement proper transaction handling
        } else {
          // logger.info('Successfully created attendance records for additional class:', additionalClass.id)
        }
      } else {
        // logger.info('No attendance records to create for additional class:', additionalClass.id)
      }

      return additionalClass
    } catch (error) {
      logger.error('Error in createAdditionalClass:', error)
      return null
    }
  }

  /**
   * Get all additional classes for a peer tutor
   */
  static async getAdditionalClassesBypeertutors(peertutorsId: string): Promise<AdditionalClassWithAttendance[]> {
    try {
      const supabase = createClient()
      
      // Get additional classes
      const { data: additionalClasses, error: classesError } = await supabase
        .from('additional_classes')
        .select('*')
        .eq('peer_tutor_id', peertutorsId)
        .order('class_date', { ascending: false })

      if (classesError) {
        logger.error('Error getting additional classes:', classesError)
        return []
      }

      // Get attendance records for each additional class
      const classesWithAttendance = await Promise.all(
        (additionalClasses || []).map(async (classItem) => {
          const attendanceRecords = await this.getAttendanceForAdditionalClass(classItem.id)
          return {
            ...classItem,
            attendance_records: attendanceRecords
          }
        })
      )

      return classesWithAttendance
    } catch (error) {
      logger.error('Error in getAdditionalClassesBypeertutors:', error)
      return []
    }
  }

  /**
   * Get attendance records for a specific additional class
   */
  static async getAttendanceForAdditionalClass(additionalClassId: string): Promise<AdditionalClassAttendanceRecord[]> {
    try {
      const supabase = createClient()
      
      // logger.info('Fetching attendance for additional class:', additionalClassId)
      
      const { data: attendanceRecords, error } = await supabase
        .from('additional_class_attendance')
        .select(`
          *,
          student:peer_students!fk_additional_class_attendance_student(
            id,
            name,
            email
          )
        `)
        .eq('additional_class_id', additionalClassId)

      if (error) {
        logger.error('Error getting attendance for additional class:', error)
        return []
      }

      // logger.info('Raw attendance records from DB:', attendanceRecords)

      const mappedRecords = (attendanceRecords || [])
        .filter(record => record.student) // Filter out records where student join failed
        .map(record => ({
          id: record.id,
          additional_class_id: record.additional_class_id,
          student_id: record.student_id,
          peer_tutor_id: record.peer_tutor_id,
          status: record.status,
          student_name: record.student?.name || 'Unknown',
          student_email: record.student?.email || '',
          created_at: record.created_at,
          updated_at: record.updated_at
        }))

      // logger.info('Mapped attendance records:', mappedRecords)
      return mappedRecords
    } catch (error) {
      logger.error('Error in getAttendanceForAdditionalClass:', error)
      return []
    }
  }

  /**
   * Update attendance for an additional class
   */
  static async updateAttendanceForAdditionalClass(
    additionalClassId: string,
    peertutorsId: string,
    attendanceRecords: AttendanceRecord[]
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Delete existing attendance records for this additional class
      const { error: deleteError } = await supabase
        .from('additional_class_attendance')
        .delete()
        .eq('additional_class_id', additionalClassId)

      if (deleteError) {
        logger.error('Error deleting existing attendance records:', deleteError)
        return false
      }

      // Insert new attendance records
      if (attendanceRecords.length > 0) {
        const attendanceData = attendanceRecords.map(record => ({
          additional_class_id: additionalClassId,
          student_id: record.student_id,
          peer_tutor_id: peertutorsId,
          status: record.status
        }))

        const { error: insertError } = await supabase
          .from('additional_class_attendance')
          .insert(attendanceData)

        if (insertError) {
          logger.error('Error inserting new attendance records:', insertError)
          return false
        }
      }

      return true
    } catch (error) {
      logger.error('Error in updateAttendanceForAdditionalClass:', error)
      return false
    }
  }

  /**
   * Delete an additional class
   */
  static async deleteAdditionalClass(additionalClassId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Delete attendance records first (due to foreign key constraints)
      const { error: attendanceError } = await supabase
        .from('additional_class_attendance')
        .delete()
        .eq('additional_class_id', additionalClassId)

      if (attendanceError) {
        logger.error('Error deleting attendance records:', attendanceError)
        return false
      }

      // Delete the additional class
      const { error: classError } = await supabase
        .from('additional_classes')
        .delete()
        .eq('id', additionalClassId)

      if (classError) {
        logger.error('Error deleting additional class:', classError)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in deleteAdditionalClass:', error)
      return false
    }
  }

  /**
   * Get all additional classes for a department
   */
  static async getAllAdditionalClassesForDepartment(dept: string): Promise<AdditionalClass[]> {
    try {
      const supabase = createClient()
      
      // We need to join with peer_tutors to filter by department
      const { data, error } = await supabase
        .from('additional_classes')
        .select(`
          *,
          peer_tutors!inner(dept, year, section)
        `)
        .eq('peer_tutors.dept', dept)
        .order('class_date', { ascending: false })

      if (error) {
        logger.error('Error getting all additional classes for department:', error)
        return []
      }

      return data as AdditionalClass[] || []
    } catch (error) {
      logger.error('Error in getAllAdditionalClassesForDepartment:', error)
      return []
    }
  }
  /**
   * Update details for an additional class
   */
  static async updateAdditionalClassDetails(
    additionalClassId: string,
    data: {
      subject_name?: string,
      topic?: string,
      class_date?: string,
      start_time?: string,
      end_time?: string,
      link?: string
    }
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString()
      }

      if (data.subject_name !== undefined) updateData.subject_name = data.subject_name
      if (data.topic !== undefined) updateData.topic = data.topic
      if (data.class_date !== undefined) updateData.class_date = data.class_date
      
      // Handle optional fields: convert empty strings to null if needed, or update if provided
      if (data.start_time !== undefined) updateData.start_time = data.start_time || null
      if (data.end_time !== undefined) updateData.end_time = data.end_time || null
      if (data.link !== undefined) updateData.link = createLink(data.link) || null


      const { error } = await supabase
        .from('additional_classes')
        .update(updateData)
        .eq('id', additionalClassId)

      if (error) {
        logger.error('Error updating additional class details:', JSON.stringify(error, null, 2))
        return false
      }
      

      return true
    } catch (error) {
      logger.error('Error in updateAdditionalClassDetails:', error)
      return false
    }
  }
}

function createLink(link: string): string {
  if (!link) return ''
  if (!link.startsWith('http')) {
    return `https://${link}`
  }
  return link
}
