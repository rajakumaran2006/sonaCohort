import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

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
        logger.error('Cannot create class with section="ALL". Classes must be section-specific.')
        return false
      }
      
      // Validate that section is not empty
      if (!normalizedSection || normalizedSection.length === 0) {
        logger.error('Section cannot be empty when creating a class.')
        return false
      }
      
      logger.info('Creating class with data:', classData, 'Normalized:', { dept: normalizedDept, year: normalizedYear, section: normalizedSection })
      
      // Validate and get the correct faculty_id (department UUID)
      let validFacultyId = classData.faculty_id
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      
      // If faculty_id is not a valid UUID, or if we need to verify it exists, look it up
      if (!uuidRegex.test(classData.faculty_id)) {
        logger.info('faculty_id is not a valid UUID, looking up department by name...')
        const { data: deptData, error: deptError } = await supabase
          .from('departments')
          .select('id')
          .ilike('name', normalizedDept)
          .limit(1)
          .single()
        
        if (deptError || !deptData) {
          logger.error('Could not find department in database:', normalizedDept, deptError)
          return false
        }
        
        validFacultyId = deptData.id
        logger.info('Found department ID:', validFacultyId)
      } else {
        // Verify the UUID exists in departments table
        const { data: deptCheck, error: deptCheckError } = await supabase
          .from('departments')
          .select('id')
          .eq('id', classData.faculty_id)
          .limit(1)
          .single()
        
        if (deptCheckError || !deptCheck) {
          logger.warn('faculty_id UUID does not exist in departments table, looking up by name...')
          const { data: deptData, error: deptError } = await supabase
            .from('departments')
            .select('id')
            .ilike('name', normalizedDept)
            .limit(1)
            .single()
          
          if (deptError || !deptData) {
            logger.error('Could not find department in database:', normalizedDept, deptError)
            return false
          }
          
          validFacultyId = deptData.id
          logger.info('Found department ID:', validFacultyId)
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
        logger.error('Error checking existing class:', classError)
        return false
      }

      if (existingClass && existingClass.length > 0) {
        logger.info('Class already exists for this section; no action needed')
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
        logger.error('Failed to create class:', insertErr)
        return false
      }

      logger.info('✓ Created section-specific class:', inserted?.[0]?.id)
      return true
    } catch (error) {
      logger.error('Error in createClass:', error)
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
        logger.error('Error getting classes by faculty:', error)
        return []
      }

      return data as Class[] || []
    } catch (error) {
      logger.error('Error in getClassesByFaculty:', error)
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
        logger.error('Error getting classes by year and section:', error)
        return []
      }

      return (data as Class[]) || []
    } catch (error) {
      logger.error('Error in getClassesByYearSection:', error)
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
        logger.error('Error getting all classes:', error)
        return []
      }

      return data as Class[] || []
    } catch (error) {
      logger.error('Error in getAllClasses:', error)
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
        logger.error('Error fetching scheduled classes for delete:', scheduledFetchError)
        return false
      }

      const scheduledIds = (scheduledClasses || []).map(sc => sc.id)

      // 2) Delete attendance tied directly to the class
      const { error: attendanceByClassError } = await supabase
        .from('attendance')
        .delete()
        .eq('class_id', classId)

      if (attendanceByClassError) {
        logger.error('Error deleting attendance by class_id:', attendanceByClassError)
        return false
      }

      // 2.5) Delete class completion records linked to this class
      const { error: completionError } = await supabase
        .from('class_completion')
        .delete()
        .eq('class_id', classId)

      if (completionError) {
        logger.error('Error deleting class completion records:', completionError)
        return false
      }

      // 3) Delete attendance tied to scheduled classes for this class
      if (scheduledIds.length > 0) {
        const { error: attendanceByScheduledError } = await supabase
          .from('attendance')
          .delete()
          .in('scheduled_class_id', scheduledIds)

        if (attendanceByScheduledError) {
          logger.error('Error deleting attendance by scheduled_class_id:', attendanceByScheduledError)
          return false
        }
      }

      // 4) Delete class topics linked to this class
      const { error: topicsError } = await supabase
        .from('class_topics')
        .delete()
        .eq('class_id', classId)

      if (topicsError) {
        logger.warn('Warning: could not delete class topics. Proceeding with class delete.', {
          message: topicsError.message,
          details: topicsError.details,
          hint: topicsError.hint,
          code: topicsError.code
        })
      }

      // 5) Delete scheduled classes for this class
      const { error: scheduledDeleteError } = await supabase
        .from('scheduled_classes')
        .delete()
        .eq('class_id', classId)

      if (scheduledDeleteError) {
        logger.error('Error deleting scheduled classes:', scheduledDeleteError)
        return false
      }

      // 6) Delete exam subjects that reference this class (and ALL their marks)
      // First, find all exam_subjects that reference this class
      const { data: examSubjects, error: examSubjectsError } = await supabase
        .from('exam_subjects')
        .select('id')
        .eq('class_id', classId)

      if (examSubjectsError) {
        logger.error('Error fetching exam subjects for delete:', examSubjectsError)
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
          logger.error('Error deleting exam marks:', examMarksError)
          return false
        }

        // Delete exam subjects that reference this class (subject headers)
        // This removes the subject from all exams that had this class
        const { error: examSubjectsDeleteError } = await supabase
          .from('exam_subjects')
          .delete()
          .eq('class_id', classId)

        if (examSubjectsDeleteError) {
          logger.error('Error deleting exam subjects:', examSubjectsDeleteError)
          return false
        }
      }

      // 7) Finally, delete the class
      const { error: classDeleteError } = await supabase
        .from('classes')
        .delete()
        .eq('id', classId)

      if (classDeleteError) {
        logger.error('Error deleting class:', classDeleteError)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in deleteClass:', error)
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
        logger.error('Error getting year-section combinations:', error)
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
      logger.error('Error in getYearSectionCombinations:', error)
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
      
      logger.info('getSectionsForYear called with:', { dept, year, normalizedDept, normalizedYear })
      
      // Collect sections from multiple sources to ensure we get all available sections
      const allSections = new Set<string>()
      
      // 1. Query sections from peer_students (both students and peer tutors)
      const { data: peerStudentsData, error: peerStudentsError } = await supabase
        .from('peer_students')
        .select('section')
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)

      if (peerStudentsError) {
        logger.error('Error getting sections from peer_students:', peerStudentsError)
      } else if (peerStudentsData) {
        peerStudentsData.forEach(item => {
          if (item.section) allSections.add(item.section)
        })
      }
      
      // 2. Also query sections from the classes table
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('section')
        .ilike('dept', normalizedDept)
        .eq('year', normalizedYear)

      if (classesError) {
        logger.error('Error getting sections from classes:', classesError)
      } else if (classesData) {
        classesData.forEach(item => {
          if (item.section) allSections.add(item.section)
        })
      }
      
      let uniqueSections = [...allSections].filter(Boolean).sort()
      
      logger.info('Found sections from all sources:', uniqueSections, 'for dept:', normalizedDept, 'year:', normalizedYear)
      
      // If no sections found with case-insensitive, try exact match
      if (uniqueSections.length === 0) {
        const { data: dataExact, error: errorExact } = await supabase
          .from('peer_students')
          .select('section')
          .eq('dept', normalizedDept)
          .eq('year', normalizedYear)

        if (!errorExact && dataExact) {
          dataExact.forEach(item => {
            if (item.section) allSections.add(item.section)
          })
        }
        
        const { data: classesExact, error: classesExactError } = await supabase
          .from('classes')
          .select('section')
          .eq('dept', normalizedDept)
          .eq('year', normalizedYear)

        if (!classesExactError && classesExact) {
          classesExact.forEach(item => {
            if (item.section) allSections.add(item.section)
          })
        }
        
        uniqueSections = [...allSections].filter(Boolean).sort()
        logger.info('Found sections with exact match:', uniqueSections)
      }
      
      // If still no sections found, try year-only query
      if (uniqueSections.length === 0) {
        logger.info('No sections found with department filter, trying year-only query...')
        const { data: dataYearOnly, error: errorYearOnly } = await supabase
          .from('peer_students')
          .select('section')
          .eq('year', normalizedYear)

        if (!errorYearOnly && dataYearOnly) {
          dataYearOnly.forEach(item => {
            if (item.section) allSections.add(item.section)
          })
          uniqueSections = [...allSections].filter(Boolean).sort()
          logger.info('Found sections for year (all departments):', uniqueSections)
        }
      }

      return uniqueSections
    } catch (error) {
      logger.error('Error in getSectionsForYear:', error)
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
        logger.error('Error checking if class exists:', error)
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
      logger.error('Error in classExists:', error)
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
  static async getClassCompletion(classId: string, peertutorsId: string): Promise<ClassCompletion | null> {
    try {
      const supabase = createClient()
      
      // Try to get existing record
      const result = await supabase
        .from('class_completion')
        .select('*')
        .eq('class_id', classId)
        .eq('peer_tutor_id', peertutorsId)
        .single()
      
      let { data } = result
      const { error } = result

      // If no record exists, create one
      if (error && error.code === 'PGRST116') {
        const { data: newData, error: insertError } = await supabase
          .from('class_completion')
          .insert([{
            class_id: classId,
            peer_tutor_id: peertutorsId,
            attendance_completed: false,
            topics_completed: false,
            completion_status: 'pending'
          }])
          .select()
          .single()

        if (insertError) {
          logger.error('Error creating class completion:', insertError)
          logger.error('Insert error details:', {
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
            code: insertError.code
          })
          // Return a default completion object instead of null
          return {
            id: '',
            class_id: classId,
            peer_tutor_id: peertutorsId,
            attendance_completed: false,
            topics_completed: false,
            completion_status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        }
        data = newData
      } else if (error) {
        logger.error('Error getting class completion:', error)
        logger.error('Get error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        // Return a default completion object instead of null
        return {
          id: '',
          class_id: classId,
          peer_tutor_id: peertutorsId,
          attendance_completed: false,
          topics_completed: false,
          completion_status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      }

      return data as ClassCompletion
    } catch (error) {
      logger.error('Error in getClassCompletion:', error)
      // Return a default completion object instead of null
      return {
        id: '',
        class_id: classId,
        peer_tutor_id: peertutorsId,
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
    peertutorsId: string, 
    attendanceCompleted: boolean, 
    topicsCompleted: boolean
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      logger.info('Updating class completion for class:', classId, 'peer tutor:', peertutorsId)
      logger.info('Attendance completed:', attendanceCompleted, 'Topics completed:', topicsCompleted)
      
      const completionStatus = attendanceCompleted && topicsCompleted ? 'completed' : 'pending'
      const completedAt = completionStatus === 'completed' ? new Date().toISOString() : null

      logger.info('Completion status:', completionStatus, 'Completed at:', completedAt)

      const { data, error } = await supabase
        .from('class_completion')
        .upsert([{
          class_id: classId,
          peer_tutor_id: peertutorsId,
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
        logger.error('Error updating class completion:', error)
        logger.error('Completion error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return false
      }

      logger.info('Successfully updated class completion:', data)
      return true
    } catch (error) {
      logger.error('Error in updateClassCompletion:', error)
      return false
    }
  }

  /**
   * Get classes with completion status for a peer tutor
   */
  static async getClassesWithCompletion(peertutorsId: string, dept: string, year: string, section: string): Promise<(Class & { isEditable: boolean; completion: ClassCompletion })[]> {
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
        logger.error('Error getting classes with completion:', error)
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
      logger.error('Error in getClassesWithCompletion:', error)
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
        logger.error('Error getting unique subjects:', error)
        return []
      }

      // Get unique subject names
      const uniqueSubjects = [...new Set((data || []).map(item => item.subject_name))]
        .filter(Boolean) // Remove any null/undefined values
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      
      return uniqueSubjects
    } catch (error) {
      logger.error('Error in getUniqueSubjects:', error)
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
        logger.error('Error getting all unique subjects:', error)
        return []
      }

      // Get unique subjects and sort them alphabetically
      const uniqueSubjects = [...new Set(data.map(item => item.subject_name))]
        .filter(Boolean) // Remove any null/undefined values
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      
      return uniqueSubjects
    } catch (error) {
      logger.error('Error in getAllUniqueSubjects:', error)
      return []
    }
  }

  /**
   * Add a topic to a class
   */
  static async addClassTopic(classId: string, peertutorsId: string, topicName: string, description?: string, scheduledClassId?: string): Promise<boolean> {
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
          logger.error('Error getting scheduled class:', scheduledError)
          return false
        }
        
        actualClassId = scheduledClass.class_id
      }
      
      const { error } = await supabase
        .from('class_topics')
        .insert([{
          class_id: actualClassId,
          peer_tutor_id: peertutorsId,
          topic_name: topicName,
          description: description
        }])

      if (error) {
        logger.error('Error adding class topic:', error)
        logger.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in addClassTopic:', error)
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
      const dbSections = await this.getSectionsForYear(dept, year)
      
      // Ensure standard sections are always included
      const standardSections = ['A', 'B', 'C']
      const sections = Array.from(new Set([...standardSections, ...dbSections])).sort()
      
      if (sections.length === 0) {
        // This should technically not happen now with standardSections, but good safety check
        return { 
          success: false, 
          message: `No sections found for ${dept} - Year ${year}.` 
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
          logger.error(`Error creating class for section ${section}:`, err)
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
      logger.error('Error in createClassForAllSections:', error)
      return { 
        success: false, 
        message: 'An unexpected error occurred while creating classes for all sections.' 
      }
    }
  }
  /**
   * Check if all sections in a year are synced (same subjects and scheduled classes)
   * Now checks for EXACT matching of subjects and scheduled dates, not just counts
   */
  static async getYearSyncStatus(dept: string, year: string): Promise<{
    isSynced: boolean
    details: {
      section: string
      subjectCount: number
      scheduledCount: number
    }[]
  }> {
    try {
      const supabase = createClient()
      const sections = await this.getSectionsForYear(dept, year)
      
      if (sections.length <= 1) {
        // If 0 or 1 section, it's synced by definition
        const details = sections.map(section => ({
          section,
          subjectCount: 0,
          scheduledCount: 0
        }))
        return { isSynced: true, details }
      }

      const normalizedYear = this.normalizeYear(year)
      const normalizedDept = this.normalizeDepartment(dept)

      // Fetch actual subjects and scheduled classes for each section
      const sectionData = await Promise.all(sections.map(async (section) => {
        // Get all subjects for this section
        const { data: classesData, error: _classesError } = await supabase
          .from('classes')
          .select('subject_name')
          .ilike('dept', normalizedDept)
          .eq('year', normalizedYear)
          .eq('section', section)
        
        const subjects = new Set(classesData?.map(c => c.subject_name.toLowerCase().trim()) || [])
        
        // Get all scheduled dates (unique by subject name and date)
        const { data: scheduledData, error: _scheduledError } = await supabase
          .from('scheduled_classes')
          .select(`
            scheduled_date,
            classes!inner(subject_name)
          `)
          .ilike('dept', normalizedDept)
          .eq('year', normalizedYear)
          .eq('section', section)

        // Create set of "subject_name|date" pairs for exact matching
        const scheduledPairs = new Set(
          scheduledData?.map(s => 
            `${((s.classes as { subject_name?: string } | null)?.subject_name?.toLowerCase().trim() || '')}|${s.scheduled_date}`
          ) || []
        )

        return {
          section,
          subjects,
          scheduledPairs,
          subjectCount: subjects.size,
          scheduledCount: scheduledPairs.size
        }
      }))

      // Compare first section with all other sections
      const firstSection = sectionData[0]
      
      // Check if all sections have identical subjects and scheduled classes
      const isSynced = sectionData.every(sectionInfo => {
        // Check if subject sets are identical
        const subjectsMatch = 
          sectionInfo.subjects.size === firstSection.subjects.size &&
          Array.from(sectionInfo.subjects).every(sub => firstSection.subjects.has(sub))
        
        // Check if scheduled class pairs are identical
        const schedulesMatch = 
          sectionInfo.scheduledPairs.size === firstSection.scheduledPairs.size &&
          Array.from(sectionInfo.scheduledPairs).every(pair => firstSection.scheduledPairs.has(pair))
        
        return subjectsMatch && schedulesMatch
      })

      // Return details with counts for display
      const details = sectionData.map(({ section, subjectCount, scheduledCount }) => ({
        section,
        subjectCount,
        scheduledCount
      }))

      return { isSynced, details }

    } catch (error) {
      logger.error('Error checking sync status:', error)
      return { isSynced: false, details: [] }
    }
  }
}
