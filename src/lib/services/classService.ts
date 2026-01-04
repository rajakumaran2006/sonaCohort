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
   * Create a section-specific class for the given dept/year/section
   */
  static async createClass(classData: ClassAssignment): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Normalize year format before processing
      const normalizedYear = this.normalizeYear(classData.year)
      const normalizedDept = this.normalizeDepartment(classData.dept)
      const normalizedSection = classData.section.trim()
      
      // Validate that section is not 'ALL' - classes should be section-specific
      if (normalizedSection.toUpperCase() === 'ALL') {
        console.error('Cannot create class with section="ALL". Classes must be section-specific.')
        return false
      }
      
      // Validate that section is not empty
      if (!normalizedSection || normalizedSection.length === 0) {
        console.error('Section cannot be empty when creating a class.')
        return false
      }
      
      console.log('Creating class with data:', classData, 'Normalized:', { dept: normalizedDept, year: normalizedYear, section: normalizedSection })
      
      // Validate and get the correct faculty_id (department UUID)
      let validFacultyId = classData.faculty_id
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      
      // If faculty_id is not a valid UUID, or if we need to verify it exists, look it up
      if (!uuidRegex.test(classData.faculty_id)) {
        console.log('faculty_id is not a valid UUID, looking up department by name...')
        const { data: deptData, error: deptError } = await supabase
          .from('departments')
          .select('id')
          .ilike('name', normalizedDept)
          .limit(1)
          .single()
        
        if (deptError || !deptData) {
          console.error('Could not find department in database:', normalizedDept, deptError)
          return false
        }
        
        validFacultyId = deptData.id
        console.log('Found department ID:', validFacultyId)
      } else {
        // Verify the UUID exists in departments table
        const { data: deptCheck, error: deptCheckError } = await supabase
          .from('departments')
          .select('id')
          .eq('id', classData.faculty_id)
          .limit(1)
          .single()
        
        if (deptCheckError || !deptCheck) {
          console.warn('faculty_id UUID does not exist in departments table, looking up by name...')
          const { data: deptData, error: deptError } = await supabase
            .from('departments')
            .select('id')
            .ilike('name', normalizedDept)
            .limit(1)
            .single()
          
          if (deptError || !deptData) {
            console.error('Could not find department in database:', normalizedDept, deptError)
            return false
          }
          
          validFacultyId = deptData.id
          console.log('Found department ID:', validFacultyId)
        } else {
          validFacultyId = classData.faculty_id
        }
      }
      
      // Check if a class already exists for this specific section
      const { data: existingClass, error: classError } = await supabase
        .from('classes')
        .select('id')
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)
        .eq('subject_name', classData.subject_name)
        .limit(1)

      if (classError) {
        console.error('Error checking existing class:', classError)
        return false
      }

      if (existingClass && existingClass.length > 0) {
        console.log('Class already exists for this section; no action needed')
        return true
      }

      // Create a section-specific class
      const { data: inserted, error: insertErr } = await supabase
        .from('classes')
        .insert([{
          subject_name: classData.subject_name,
          dept: normalizedDept,
          year: normalizedYear,
          section: normalizedSection,
          faculty_id: validFacultyId
        }])
        .select()

      if (insertErr) {
        console.error('Failed to create class:', insertErr)
        return false
      }

      console.log('✓ Created section-specific class:', inserted?.[0]?.id)
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
      
      // Normalize year and department
      const normalizedYear = this.normalizeYear(year)
      const normalizedDept = this.normalizeDepartment(dept)
      const normalizedSection = section.trim()
      
      // Fetch classes for the specific section only
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error getting classes by year and section:', error)
        return []
      }

      return (data as Class[]) || []
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
      // 1) Find scheduled class ids for this class (attendance may reference these)
      const { data: scheduledClasses, error: scheduledFetchError } = await supabase
        .from('scheduled_classes')
        .select('id')
        .eq('class_id', classId)

      if (scheduledFetchError) {
        console.error('Error fetching scheduled classes for delete:', scheduledFetchError)
        return false
      }

      const scheduledIds = (scheduledClasses || []).map(sc => sc.id)

      // 2) Delete attendance tied directly to the class
      const { error: attendanceByClassError } = await supabase
        .from('attendance')
        .delete()
        .eq('class_id', classId)

      if (attendanceByClassError) {
        console.error('Error deleting attendance by class_id:', attendanceByClassError)
        return false
      }

      // 3) Delete attendance tied to scheduled classes for this class
      if (scheduledIds.length > 0) {
        const { error: attendanceByScheduledError } = await supabase
          .from('attendance')
          .delete()
          .in('scheduled_class_id', scheduledIds)

        if (attendanceByScheduledError) {
          console.error('Error deleting attendance by scheduled_class_id:', attendanceByScheduledError)
          return false
        }
      }

      // 4) Delete class topics linked to this class
      const { error: topicsError } = await supabase
        .from('class_topics')
        .delete()
        .eq('class_id', classId)

      if (topicsError) {
        console.warn('Warning: could not delete class topics. Proceeding with class delete.', {
          message: (topicsError as any)?.message,
          details: (topicsError as any)?.details,
          hint: (topicsError as any)?.hint,
          code: (topicsError as any)?.code
        })
      }

      // 5) Delete scheduled classes for this class
      const { error: scheduledDeleteError } = await supabase
        .from('scheduled_classes')
        .delete()
        .eq('class_id', classId)

      if (scheduledDeleteError) {
        console.error('Error deleting scheduled classes:', scheduledDeleteError)
        return false
      }

      // 6) Delete exam subjects that reference this class (and ALL their marks)
      // First, find all exam_subjects that reference this class
      const { data: examSubjects, error: examSubjectsError } = await supabase
        .from('exam_subjects')
        .select('id')
        .eq('class_id', classId)

      if (examSubjectsError) {
        console.error('Error fetching exam subjects for delete:', examSubjectsError)
        return false
      }

      if (examSubjects && examSubjects.length > 0) {
        const examSubjectIds = examSubjects.map(es => es.id)

        // IMPORTANT: Delete ALL exam marks that reference these exam subjects
        // This ensures all marks data is completely removed when subject is deleted
        const { error: examMarksError } = await supabase
          .from('exam_marks')
          .delete()
          .in('exam_subject_id', examSubjectIds)

        if (examMarksError) {
          console.error('Error deleting exam marks:', examMarksError)
          return false
        }

        // Delete exam subjects that reference this class (subject headers)
        // This removes the subject from all exams that had this class
        const { error: examSubjectsDeleteError } = await supabase
          .from('exam_subjects')
          .delete()
          .eq('class_id', classId)

        if (examSubjectsDeleteError) {
          console.error('Error deleting exam subjects:', examSubjectsDeleteError)
          return false
        }
      }

      // 7) Finally, delete the class
      const { error: classDeleteError } = await supabase
        .from('classes')
        .delete()
        .eq('id', classId)

      if (classDeleteError) {
        console.error('Error deleting class:', classDeleteError)
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
   * Normalize year format from "2nd Year" to "2" or keep as is
   */
  private static normalizeYear(year: string): string {
    const yearMap: { [key: string]: string } = {
      '2nd Year': '2',
      '3rd Year': '3',
      '4th Year': '4',
      '2': '2',
      '3': '3',
      '4': '4'
    }
    return yearMap[year] || year
  }

  /**
   * Normalize department name for case-insensitive matching
   */
  private static normalizeDepartment(dept: string): string {
    // Return as-is but ensure consistent case handling
    // Database stores in various cases, so we'll use case-insensitive matching
    return dept.trim()
  }

  /**
   * Get all sections for a specific year in a department
   */
  static async getSectionsForYear(dept: string, year: string): Promise<string[]> {
    try {
      const supabase = createClient()
      
      // Normalize year format (convert "2nd Year" to "2")
      const normalizedYear = this.normalizeYear(year)
      const normalizedDept = this.normalizeDepartment(dept)
      
      console.log('getSectionsForYear called with:', { dept, year, normalizedDept, normalizedYear })
      
      // First, try case-insensitive matching for department
      let { data, error } = await supabase
        .from('peer_students')
        .select('section')
        .ilike('dept', normalizedDept) // Case-insensitive match
        .eq('year', normalizedYear)
        .eq('peer_tutor', false)

      if (error) {
        console.error('Error getting sections for year (case-insensitive):', error, { dept: normalizedDept, year: normalizedYear })
      }

      // Get unique sections
      let uniqueSections: string[] = []
      if (data) {
        uniqueSections = [...new Set((data || []).map(item => item.section))]
          .filter(Boolean)
          .sort()
      }
      
      console.log('Found sections (case-insensitive):', uniqueSections, 'for dept:', normalizedDept, 'year:', normalizedYear)
      
      // If no sections found, try with exact department match (case-sensitive)
      if (uniqueSections.length === 0) {
        const { data: dataExact, error: errorExact } = await supabase
          .from('peer_students')
          .select('section')
          .eq('dept', normalizedDept)
          .eq('year', normalizedYear)
          .eq('peer_tutor', false)

        if (!errorExact && dataExact) {
          uniqueSections = [...new Set((dataExact || []).map(item => item.section))]
            .filter(Boolean)
            .sort()
          console.log('Found sections with exact match:', uniqueSections)
        }
      }
      
      // If still no sections found, try to get sections for this year across ALL departments
      // This helps when department name doesn't match exactly
      if (uniqueSections.length === 0) {
        console.log('No sections found with department filter, trying year-only query...')
        const { data: dataYearOnly, error: errorYearOnly } = await supabase
          .from('peer_students')
          .select('section')
          .eq('year', normalizedYear)
          .eq('peer_tutor', false)

        if (!errorYearOnly && dataYearOnly) {
          const yearOnlySections = [...new Set((dataYearOnly || []).map(item => item.section))]
            .filter(Boolean)
            .sort()
          console.log('Found sections for year (all departments):', yearOnlySections)
          return yearOnlySections
        }
      }

      return uniqueSections
    } catch (error) {
      console.error('Error in getSectionsForYear:', error)
      return []
    }
  }

  /**
   * Check if a class exists for a specific dept/year/section/subject
   */
  static async classExists(dept: string, year: string, section: string, subjectName: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Normalize year, department, and section
      const normalizedYear = this.normalizeYear(year)
      const normalizedDept = this.normalizeDepartment(dept)
      const normalizedSection = section.trim()
      
      const { data, error } = await supabase
        .from('classes')
        .select('id')
        .ilike('dept', normalizedDept) // Case-insensitive
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)
        .eq('subject_name', subjectName)
        .limit(1)

      if (error) {
        console.error('Error checking if class exists:', error)
        // Try exact match if case-insensitive fails
        const { data: dataExact, error: errorExact } = await supabase
          .from('classes')
          .select('id')
          .eq('dept', normalizedDept)
          .eq('year', normalizedYear)
          .eq('section', normalizedSection)
          .eq('subject_name', subjectName)
          .limit(1)
        
        if (errorExact) {
          return false
        }
        return (dataExact?.length || 0) > 0
      }

      return (data?.length || 0) > 0
    } catch (error) {
      console.error('Error in classExists:', error)
      return false
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
      
      // Normalize year, department, and section
      const normalizedYear = this.normalizeYear(year)
      const normalizedDept = this.normalizeDepartment(dept)
      const normalizedSection = section.trim()
      
      const { data, error } = await supabase
        .from('classes')
        .select('subject_name')
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)
        .eq('section', normalizedSection)

      if (error) {
        console.error('Error getting unique subjects:', error)
        return []
      }

      // Get unique subject names
      const uniqueSubjects = [...new Set((data || []).map(item => item.subject_name))]
        .filter(Boolean) // Remove any null/undefined values
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      
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

  /**
   * Create a class for ALL sections in a department and year
   * This is used when a faculty wants to add a subject to the entire year at once
   */
  static async createClassForAllSections(
    subjectName: string, 
    dept: string, 
    year: string, 
    departmentId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 1. Get all unique sections for this dept and year
      const sections = await this.getSectionsForYear(dept, year)
      
      if (sections.length === 0) {
        return { 
          success: false, 
          message: `No sections found for ${dept} - Year ${year}. Please ensure students are added first.` 
        }
      }

      let createdCount = 0
      let alreadyExistedCount = 0
      let failedCount = 0

      // 2. Process each section
      await Promise.all(sections.map(async (section) => {
        try {
          // Check if class already exists for this section
          const exists = await this.classExists(dept, year, section, subjectName)
          
          if (exists) {
            alreadyExistedCount++
            return
          }

          // Create the class for this section
          const success = await this.createClass({
            subject_name: subjectName,
            dept,
            year,
            section,
            faculty_id: departmentId
          })

          if (success) {
            createdCount++
          } else {
            failedCount++
          }
        } catch (err) {
          console.error(`Error creating class for section ${section}:`, err)
          failedCount++
        }
      }))

      // 3. Construct response message
      let message = `Successfully processed ${sections.length} sections.`
      if (createdCount > 0) message += ` Created ${createdCount} new classes.`
      if (alreadyExistedCount > 0) message += ` ${alreadyExistedCount} classes already existed.`
      if (failedCount > 0) message += ` Failed to create classes for ${failedCount} sections.`

      return {
        success: failedCount === 0 || createdCount > 0,
        message
      }
    } catch (error) {
      console.error('Error in createClassForAllSections:', error)
      return { 
        success: false, 
        message: 'An unexpected error occurred while creating classes for all sections.' 
      }
    }
  }
}
