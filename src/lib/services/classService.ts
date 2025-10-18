import { createClient } from '@/utils/supabase/client'

export interface Class {
  id: string
  subject_name: string
  dept: string
  year: string
  section: string
  faculty_id: string
  created_at: string
  class_date?: string
  scheduled_class_id?: string
}

export interface ClassAssignment {
  subject_name: string
  dept: string
  year: string
  section: string
  faculty_id: string
}

export interface ClassCompletion {
  id: string
  class_id: string
  peer_tutor_id: string
  attendance_completed: boolean
  topics_completed: boolean
  completion_status: 'pending' | 'completed'
  completed_at?: string
  created_at: string
  updated_at: string
}

export class ClassService {
  /**
   * Create a new class
   */
  static async createClass(classData: ClassAssignment): Promise<boolean> {
    try {
      const supabase = createClient()
      
      console.log('Creating class with data:', classData)
      
      const { data, error } = await supabase
        .from('classes')
        .insert([classData])
        .select()

      if (error) {
        console.error('Error creating class:', error)
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return false
      }

      console.log('Class created successfully:', data)
      return true
    } catch (error) {
      console.error('Error in createClass:', error)
      return false
    }
  }

  /**
   * Get all classes for a faculty member
   */
  static async getClassesByFaculty(facultyId: string): Promise<Class[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('faculty_id', facultyId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error getting classes by faculty:', error)
        return []
      }

      return data as Class[] || []
    } catch (error) {
      console.error('Error in getClassesByFaculty:', error)
      return []
    }
  }

  /**
   * Get classes for a specific year and section (for peer tutors)
   */
  static async getClassesByYearSection(dept: string, year: string, section: string): Promise<Class[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error getting classes by year and section:', error)
        return []
      }

      return data as Class[] || []
    } catch (error) {
      console.error('Error in getClassesByYearSection:', error)
      return []
    }
  }

  /**
   * Get all classes (for admin view)
   */
  static async getAllClasses(): Promise<Class[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error getting all classes:', error)
        return []
      }

      return data as Class[] || []
    } catch (error) {
      console.error('Error in getAllClasses:', error)
      return []
    }
  }

  /**
   * Delete a class
   */
  static async deleteClass(classId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', classId)

      if (error) {
        console.error('Error deleting class:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in deleteClass:', error)
      return false
    }
  }

  /**
   * Get unique year-section combinations for a department
   */
  static async getYearSectionCombinations(dept: string): Promise<{year: string, section: string}[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('year, section')
        .eq('dept', dept)
        .eq('peer_tutor', false)

      if (error) {
        console.error('Error getting year-section combinations:', error)
        return []
      }

      // Get unique combinations
      const uniqueCombinations = Array.from(
        new Set((data || []).map(item => `${item.year}-${item.section}`))
      ).map(combo => {
        const [year, section] = combo.split('-')
        return { year, section }
      })

      return uniqueCombinations
    } catch (error) {
      console.error('Error in getYearSectionCombinations:', error)
      return []
    }
  }

  /**
   * Check if class is still editable (always true since no date restriction)
   */
  static isClassEditable(): boolean {
    return true
  }

  /**
   * Get or create class completion record for a peer tutor
   */
  static async getClassCompletion(classId: string, peerTutorId: string): Promise<ClassCompletion | null> {
    try {
      const supabase = createClient()
      
      // Try to get existing record
      let { data, error } = await supabase
        .from('class_completion')
        .select('*')
        .eq('class_id', classId)
        .eq('peer_tutor_id', peerTutorId)
        .single()

      // If no record exists, create one
      if (error && error.code === 'PGRST116') {
        const { data: newData, error: insertError } = await supabase
          .from('class_completion')
          .insert([{
            class_id: classId,
            peer_tutor_id: peerTutorId,
            attendance_completed: false,
            topics_completed: false,
            completion_status: 'pending'
          }])
          .select()
          .single()

        if (insertError) {
          console.error('Error creating class completion:', insertError)
          console.error('Insert error details:', {
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
            code: insertError.code
          })
          // Return a default completion object instead of null
          return {
            id: '',
            class_id: classId,
            peer_tutor_id: peerTutorId,
            attendance_completed: false,
            topics_completed: false,
            completion_status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        }
        data = newData
      } else if (error) {
        console.error('Error getting class completion:', error)
        console.error('Get error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        // Return a default completion object instead of null
        return {
          id: '',
          class_id: classId,
          peer_tutor_id: peerTutorId,
          attendance_completed: false,
          topics_completed: false,
          completion_status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      }

      return data as ClassCompletion
    } catch (error) {
      console.error('Error in getClassCompletion:', error)
      // Return a default completion object instead of null
      return {
        id: '',
        class_id: classId,
        peer_tutor_id: peerTutorId,
        attendance_completed: false,
        topics_completed: false,
        completion_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }
  }

  /**
   * Update class completion status
   */
  static async updateClassCompletion(
    classId: string, 
    peerTutorId: string, 
    attendanceCompleted: boolean, 
    topicsCompleted: boolean
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      console.log('Updating class completion for class:', classId, 'peer tutor:', peerTutorId)
      console.log('Attendance completed:', attendanceCompleted, 'Topics completed:', topicsCompleted)
      
      const completionStatus = attendanceCompleted && topicsCompleted ? 'completed' : 'pending'
      const completedAt = completionStatus === 'completed' ? new Date().toISOString() : null

      console.log('Completion status:', completionStatus, 'Completed at:', completedAt)

      const { data, error } = await supabase
        .from('class_completion')
        .upsert([{
          class_id: classId,
          peer_tutor_id: peerTutorId,
          attendance_completed: attendanceCompleted,
          topics_completed: topicsCompleted,
          completion_status: completionStatus,
          completed_at: completedAt
        }], {
          onConflict: 'class_id,peer_tutor_id',
          ignoreDuplicates: false
        })
        .select()

      if (error) {
        console.error('Error updating class completion:', error)
        console.error('Completion error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return false
      }

      console.log('Successfully updated class completion:', data)
      return true
    } catch (error) {
      console.error('Error in updateClassCompletion:', error)
      return false
    }
  }

  /**
   * Get classes with completion status for a peer tutor
   */
  static async getClassesWithCompletion(peerTutorId: string, dept: string, year: string, section: string): Promise<any[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('classes')
        .select(`
          *,
          class_completion!left(
            attendance_completed,
            topics_completed,
            completion_status,
            completed_at
          )
        `)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error getting classes with completion:', error)
        return []
      }

      return (data || []).map(classItem => ({
        ...classItem,
        isEditable: ClassService.isClassEditable(),
        completion: classItem.class_completion?.[0] || {
          attendance_completed: false,
          topics_completed: false,
          completion_status: 'pending'
        }
      }))
    } catch (error) {
      console.error('Error in getClassesWithCompletion:', error)
      return []
    }
  }

  /**
   * Get unique subjects for a specific dept/year/section
   */
  static async getUniqueSubjects(dept: string, year: string, section: string): Promise<string[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('classes')
        .select('subject_name')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (error) {
        console.error('Error getting unique subjects:', error)
        return []
      }

      // Get unique subject names
      const uniqueSubjects = [...new Set(data.map(item => item.subject_name))]
      return uniqueSubjects
    } catch (error) {
      console.error('Error in getUniqueSubjects:', error)
      return []
    }
  }

  /**
   * Get all unique subject names from the entire database for autocomplete suggestions
   */
  static async getAllUniqueSubjects(): Promise<string[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('classes')
        .select('subject_name')

      if (error) {
        console.error('Error getting all unique subjects:', error)
        return []
      }

      // Get unique subjects and sort them alphabetically
      const uniqueSubjects = [...new Set(data.map(item => item.subject_name))]
        .filter(Boolean) // Remove any null/undefined values
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      
      return uniqueSubjects
    } catch (error) {
      console.error('Error in getAllUniqueSubjects:', error)
      return []
    }
  }

  /**
   * Add a topic to a class
   */
  static async addClassTopic(classId: string, peerTutorId: string, topicName: string, description?: string, scheduledClassId?: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // If scheduledClassId is provided, we need to get the actual class_id from scheduled_classes table
      let actualClassId = classId
      
      if (scheduledClassId) {
        const { data: scheduledClass, error: scheduledError } = await supabase
          .from('scheduled_classes')
          .select('class_id')
          .eq('id', scheduledClassId)
          .single()
        
        if (scheduledError) {
          console.error('Error getting scheduled class:', scheduledError)
          return false
        }
        
        actualClassId = scheduledClass.class_id
      }
      
      const { error } = await supabase
        .from('class_topics')
        .insert([{
          class_id: actualClassId,
          peer_tutor_id: peerTutorId,
          topic_name: topicName,
          description: description
        }])

      if (error) {
        console.error('Error adding class topic:', error)
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return false
      }

      return true
    } catch (error) {
      console.error('Error in addClassTopic:', error)
      return false
    }
  }
}
