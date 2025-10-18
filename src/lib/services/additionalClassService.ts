import { createClient } from '@/utils/supabase/client'
import { AttendanceService, AttendanceRecord } from './attendanceService'

export interface AdditionalClass {
  id: string
  peer_tutor_id: string
  subject_name: string
  topic: string
  class_date: string
  created_at: string
  updated_at: string
}

export interface AdditionalClassAttendanceRecord {
  id: string
  additional_class_id: string
  student_id: string
  peer_tutor_id: string
  status: 'present' | 'absent'
  student_name: string
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
  static async getAvailableSubjectsForPeerTutor(peerTutorId: string): Promise<string[]> {
    try {
      const supabase = createClient()
      
      // Get peer tutor info
      const { data: peerTutor, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('dept, year, section')
        .eq('id', peerTutorId)
        .single()

      if (tutorError || !peerTutor) {
        console.error('Error getting peer tutor info:', tutorError)
        return []
      }

      // Get all subjects for this peer tutor's dept/year/section
      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('subject_name')
        .eq('dept', peerTutor.dept)
        .eq('year', peerTutor.year)
        .eq('section', peerTutor.section)

      if (classesError) {
        console.error('Error getting classes:', classesError)
        return []
      }

      // Extract unique subject names
      const subjects = [...new Set(classes.map(cls => cls.subject_name))]
      return subjects
    } catch (error) {
      console.error('Error in getAvailableSubjectsForPeerTutor:', error)
      return []
    }
  }

  /**
   * Create a new additional class
   */
  static async createAdditionalClass(
    peerTutorId: string,
    subjectName: string,
    topic: string,
    classDate: string,
    attendanceRecords: AttendanceRecord[]
  ): Promise<AdditionalClass | null> {
    try {
      const supabase = createClient()
      
      // First, create the additional class record
      const { data: additionalClass, error: classError } = await supabase
        .from('additional_classes')
        .insert([{
          peer_tutor_id: peerTutorId,
          subject_name: subjectName,
          topic: topic,
          class_date: classDate
        }])
        .select()
        .single()

      if (classError) {
        console.error('Error creating additional class:', classError)
        return null
      }

      // Then, create attendance records in the separate additional_class_attendance table
      console.log('Creating attendance records for additional class:', {
        additionalClassId: additionalClass.id,
        attendanceRecordsCount: attendanceRecords.length,
        attendanceRecords: attendanceRecords
      })

      if (attendanceRecords.length > 0) {
        const attendanceData = attendanceRecords.map(record => ({
          additional_class_id: additionalClass.id,
          student_id: record.student_id,
          peer_tutor_id: peerTutorId,
          status: record.status
        }))

        console.log('Attendance data to insert:', attendanceData)

        const { error: attendanceError } = await supabase
          .from('additional_class_attendance')
          .insert(attendanceData)

        if (attendanceError) {
          console.error('Error creating attendance records for additional class:', attendanceError)
          // Note: We don't rollback the additional class creation here
          // In a production app, you might want to implement proper transaction handling
        } else {
          console.log('Successfully created attendance records for additional class:', additionalClass.id)
        }
      } else {
        console.log('No attendance records to create for additional class:', additionalClass.id)
      }

      return additionalClass
    } catch (error) {
      console.error('Error in createAdditionalClass:', error)
      return null
    }
  }

  /**
   * Get all additional classes for a peer tutor
   */
  static async getAdditionalClassesByPeerTutor(peerTutorId: string): Promise<AdditionalClassWithAttendance[]> {
    try {
      const supabase = createClient()
      
      // Get additional classes
      const { data: additionalClasses, error: classesError } = await supabase
        .from('additional_classes')
        .select('*')
        .eq('peer_tutor_id', peerTutorId)
        .order('class_date', { ascending: false })

      if (classesError) {
        console.error('Error getting additional classes:', classesError)
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
      console.error('Error in getAdditionalClassesByPeerTutor:', error)
      return []
    }
  }

  /**
   * Get attendance records for a specific additional class
   */
  static async getAttendanceForAdditionalClass(additionalClassId: string): Promise<AdditionalClassAttendanceRecord[]> {
    try {
      const supabase = createClient()
      
      console.log('Fetching attendance for additional class:', additionalClassId)
      
      const { data: attendanceRecords, error } = await supabase
        .from('additional_class_attendance')
        .select(`
          *,
          student:peer_students!inner(
            id,
            name,
            email
          )
        `)
        .eq('additional_class_id', additionalClassId)

      if (error) {
        console.error('Error getting attendance for additional class:', error)
        return []
      }

      console.log('Raw attendance records from DB:', attendanceRecords)

      const mappedRecords = (attendanceRecords || []).map(record => ({
        id: record.id,
        additional_class_id: record.additional_class_id,
        student_id: record.student_id,
        peer_tutor_id: record.peer_tutor_id,
        status: record.status,
        student_name: record.student.name,
        created_at: record.created_at,
        updated_at: record.updated_at
      }))

      console.log('Mapped attendance records:', mappedRecords)
      return mappedRecords
    } catch (error) {
      console.error('Error in getAttendanceForAdditionalClass:', error)
      return []
    }
  }

  /**
   * Update attendance for an additional class
   */
  static async updateAttendanceForAdditionalClass(
    additionalClassId: string,
    peerTutorId: string,
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
        console.error('Error deleting existing attendance records:', deleteError)
        return false
      }

      // Insert new attendance records
      if (attendanceRecords.length > 0) {
        const attendanceData = attendanceRecords.map(record => ({
          additional_class_id: additionalClassId,
          student_id: record.student_id,
          peer_tutor_id: peerTutorId,
          status: record.status
        }))

        const { error: insertError } = await supabase
          .from('additional_class_attendance')
          .insert(attendanceData)

        if (insertError) {
          console.error('Error inserting new attendance records:', insertError)
          return false
        }
      }

      return true
    } catch (error) {
      console.error('Error in updateAttendanceForAdditionalClass:', error)
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
        console.error('Error deleting attendance records:', attendanceError)
        return false
      }

      // Delete the additional class
      const { error: classError } = await supabase
        .from('additional_classes')
        .delete()
        .eq('id', additionalClassId)

      if (classError) {
        console.error('Error deleting additional class:', classError)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in deleteAdditionalClass:', error)
      return false
    }
  }
}
