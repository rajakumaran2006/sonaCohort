import { createClient } from '@/utils/supabase/client'

export interface ExamMark {
  id: string
  peer_tutor_id: string
  student_id: string
  exam_type: string
  subject_name: string
  marks: number
  created_at: string
  updated_at: string
}

export interface ExamTypeData {
  id: string
  name: string
  exam_type: string
  subjects: string[]
  students: Array<{
    id: string
    name: string
    email: string
    marks: { [subject: string]: string }
  }>
}

export class ExamMarksService {
  /**
   * Check if the exam_marks table exists and is accessible
   */
  static async checkTableExists(): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_marks')
        .select('*')
        .limit(1)

      if (error) {
        console.error('Table access test failed:', error)
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return false
      }
      
      console.log('Table access test successful, found', data?.length || 0, 'records')
      return true
    } catch (error) {
      console.error('Exception during table access test:', error)
      return false
    }
  }

  /**
   * Test function to create a simple exam mark entry
   */
  static async testCreateExamMark(): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const testMark = {
        peer_tutor_id: 'test-tutor-id',
        student_id: 'test-student-id',
        exam_type: 'test-exam',
        subject_name: 'Test Subject',
        marks: 0
      }

      console.log('Testing exam mark creation with:', testMark)
      
      const { data, error } = await supabase
        .from('exam_marks')
        .insert([testMark])
        .select()

      if (error) {
        console.error('Test insert failed:', error)
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return false
      }

      console.log('Test insert successful:', data)
      
      // Clean up test data
      await supabase
        .from('exam_marks')
        .delete()
        .eq('peer_tutor_id', 'test-tutor-id')
        .eq('student_id', 'test-student-id')
        .eq('exam_type', 'test-exam')

      return true
    } catch (error) {
      console.error('Exception during test insert:', error)
      return false
    }
  }

  /**
   * Check if an exam type exists for a peer tutor
   */
  static async hasExamType(examType: string, peerTutorId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_marks')
        .select('id')
        .eq('peer_tutor_id', peerTutorId)
        .eq('exam_type', examType)
        .limit(1)

      if (error) {
        console.error('Error checking exam type:', error)
        return false
      }

      return (data && data.length > 0) || false
    } catch (error) {
      console.error('Error in hasExamType:', error)
      return false
    }
  }

  /**
   * Get all subjects for a specific exam type
   */
  static async getSubjects(examType: string, peerTutorId: string): Promise<string[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_marks')
        .select('subject_name')
        .eq('peer_tutor_id', peerTutorId)
        .eq('exam_type', examType)

      if (error) {
        console.error('Error getting subjects:', error)
        return []
      }

      // Get unique subjects
      const uniqueSubjects = Array.from(new Set((data || []).map(item => item.subject_name)))
      return uniqueSubjects
    } catch (error) {
      console.error('Error in getSubjects:', error)
      return []
    }
  }

  /**
   * Get all marks for a specific exam type
   */
  static async getMarks(examType: string, peerTutorId: string): Promise<ExamMark[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_marks')
        .select('*')
        .eq('peer_tutor_id', peerTutorId)
        .eq('exam_type', examType)

      if (error) {
        console.error('Error getting marks:', error)
        return []
      }

      return (data as ExamMark[]) || []
    } catch (error) {
      console.error('Error in getMarks:', error)
      return []
    }
  }

  /**
   * Save marks for students in a specific exam type
   */
  static async saveMarks(examType: string, marks: Array<{
    peer_tutor_id: string
    student_id: string
    subject_name: string
    marks: number
  }>): Promise<boolean> {
    try {
      const supabase = createClient()
      
      console.log('Saving exam marks for type:', examType)
      console.log('Number of marks to save:', marks.length)

      // Validate input data
      if (!examType || !marks || marks.length === 0) {
        console.error('Invalid input data:', { examType, marks })
        return false
      }

      // Validate each mark entry
      for (const mark of marks) {
        if (!mark.peer_tutor_id || !mark.student_id || !mark.subject_name || typeof mark.marks !== 'number') {
          console.error('Invalid mark entry:', mark)
          return false
        }
      }

      // Prepare data for insertion
      const marksToInsert = marks.map(mark => ({
        peer_tutor_id: mark.peer_tutor_id,
        student_id: mark.student_id,
        exam_type: examType,
        subject_name: mark.subject_name,
        marks: mark.marks.toString()
      }))

      console.log('Sample mark data:', marksToInsert.slice(0, 2))
      console.log('Total marks to save:', marksToInsert.length)

      // Use upsert to update existing records or insert new ones
      const { data, error } = await supabase
        .from('exam_marks')
        .upsert(marksToInsert, {
          onConflict: 'peer_tutor_id,student_id,exam_type,subject_name'
        })
        .select()

      if (error) {
        console.error('Error saving exam marks:', error)
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        console.error('Failed data sample:', marksToInsert.slice(0, 2))
        
        return false
      }

      console.log('Successfully saved exam marks:', data?.length || 0, 'records')
      console.log('Sample saved data:', data?.slice(0, 2))

      console.log('Successfully saved exam marks:', data?.length || 0, 'records')
      return true
    } catch (error) {
      console.error('Error in saveMarks:', error)
      return false
    }
  }

  /**
   * Get all exam types for a peer tutor
   */
  static async getExamTypes(peerTutorId: string): Promise<ExamTypeData[]> {
    try {
      const supabase = createClient()
      
      // Get all unique exam types for this peer tutor
      const { data: examTypes, error: examTypesError } = await supabase
        .from('exam_marks')
        .select('exam_type')
        .eq('peer_tutor_id', peerTutorId)

      if (examTypesError) {
        console.error('Error getting exam types:', examTypesError)
        return []
      }

      const uniqueExamTypes = Array.from(new Set((examTypes || []).map(item => item.exam_type)))
      
      const examTypeData: ExamTypeData[] = []
      
      for (const examType of uniqueExamTypes) {
        const subjects = await this.getSubjects(examType, peerTutorId)
        const marks = await this.getMarks(examType, peerTutorId)
        
        // Group marks by student
        const studentMarksMap: { [studentId: string]: { [subject: string]: string } } = {}
        marks.forEach(mark => {
          if (!studentMarksMap[mark.student_id]) {
            studentMarksMap[mark.student_id] = {}
          }
          studentMarksMap[mark.student_id][mark.subject_name] = mark.marks.toString()
        })
        
        examTypeData.push({
          id: examType,
          name: this.getExamTypeLabel(examType),
          exam_type: examType,
          subjects: subjects,
          students: [] // Will be populated by the calling component
        })
      }
      
      return examTypeData
    } catch (error) {
      console.error('Error in getExamTypes:', error)
      return []
    }
  }

  /**
   * Delete an exam type and all its marks
   */
  static async deleteExamType(examType: string, peerTutorId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('exam_marks')
        .delete()
        .eq('peer_tutor_id', peerTutorId)
        .eq('exam_type', examType)

      if (error) {
        console.error('Error deleting exam type:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in deleteExamType:', error)
      return false
    }
  }

  /**
   * Delete an exam type for an entire section (all peer tutors and students)
   */
  static async deleteExamTypeForSection(examType: string, dept: string, year: string, section: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // First, get all peer tutors for this section
      const { data: sectionPeerTutors, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('id')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (tutorsError || !sectionPeerTutors || sectionPeerTutors.length === 0) {
        console.log('No peer tutors found for this section')
        return true // Nothing to delete
      }

      const peerTutorIds = sectionPeerTutors.map(t => t.id)

      // Delete all exam marks for this exam type and section
      const { error } = await supabase
        .from('exam_marks')
        .delete()
        .in('peer_tutor_id', peerTutorIds)
        .eq('exam_type', examType)

      if (error) {
        console.error('Error deleting exam type for section:', error)
        return false
      }

      console.log(`Successfully deleted exam type "${examType}" for section ${dept} - ${year} - ${section}`)
      return true
    } catch (error) {
      console.error('Error in deleteExamTypeForSection:', error)
      return false
    }
  }

  /**
   * Get all exam types for a specific section (department, year, section)
   */
  static async getExamTypesForSection(dept: string, year: string, section: string): Promise<Array<{
    exam_type: string
    exam_name: string
    subjects: string[]
    peer_tutors: Array<{
      id: string
      name: string
      email: string
      students_count: number
    }>
    total_students: number
    created_at: string
  }>> {
    try {
      const supabase = createClient()
      
      // First, get all peer tutors for this section
      const { data: sectionPeerTutors, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('id')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (tutorsError || !sectionPeerTutors || sectionPeerTutors.length === 0) {
        console.log('No peer tutors found for this section')
        return []
      }

      const peerTutorIds = sectionPeerTutors.map(t => t.id)

      // Get all unique exam types for this section
      const { data: examTypes, error: examTypesError } = await supabase
        .from('exam_marks')
        .select(`
          exam_type,
          subject_name,
          peer_tutor_id,
          student_id,
          created_at
        `)
        .in('peer_tutor_id', peerTutorIds)
        .order('created_at', { ascending: false })

      if (examTypesError) {
        console.error('Error getting exam types for section:', examTypesError)
        return []
      }

      // Group by exam type
      const examTypeMap = new Map()
      
      for (const exam of examTypes || []) {
        if (!examTypeMap.has(exam.exam_type)) {
          examTypeMap.set(exam.exam_type, {
            exam_type: exam.exam_type,
            exam_name: this.getExamTypeLabel(exam.exam_type),
            subjects: new Set(),
            peer_tutors: new Map(),
            total_students: new Set(),
            created_at: exam.created_at
          })
        }
        
        const examData = examTypeMap.get(exam.exam_type)
        examData.subjects.add(exam.subject_name)
        examData.peer_tutors.set(exam.peer_tutor_id, exam.peer_tutor_id)
        examData.total_students.add(exam.student_id)
      }

      // Convert to array and get peer tutor details
      const result = []
      for (const [examType, examData] of examTypeMap) {
        // Get peer tutor details
        const peerTutorIds = Array.from(examData.peer_tutors.keys())
        const peerTutorsWithDetails = []
        
        for (const tutorId of peerTutorIds) {
          // Get peer tutor info and student count
          const { data: tutorData } = await supabase
            .from('peer_tutors')
            .select('id, name, email')
            .eq('id', tutorId)
            .single()
          
          if (tutorData) {
            // Count students for this peer tutor in this exam
            const { data: studentCount } = await supabase
              .from('exam_marks')
              .select('student_id')
              .eq('exam_type', examType)
              .eq('peer_tutor_id', tutorId)
            
            peerTutorsWithDetails.push({
              id: tutorData.id,
              name: tutorData.name,
              email: tutorData.email,
              students_count: new Set(studentCount?.map(s => s.student_id) || []).size
            })
          }
        }

        result.push({
          exam_type: examData.exam_type,
          exam_name: examData.exam_name,
          subjects: Array.from(examData.subjects) as string[],
          peer_tutors: peerTutorsWithDetails,
          total_students: examData.total_students.size,
          created_at: examData.created_at
        })
      }

      return result
    } catch (error) {
      console.error('Error in getExamTypesForSection:', error)
      return []
    }
  }

  /**
   * Get detailed exam marks for a specific exam type in a section
   */
  static async getExamDetailsForSection(examType: string, dept: string, year: string, section: string): Promise<Array<{
    peer_tutor: {
      id: string
      name: string
      email: string
    }
    students: Array<{
      id: string
      name: string
      email: string
      marks: { [subject: string]: string }
    }>
  }>> {
    try {
      console.log('Getting exam details for:', { examType, dept, year, section })
      
      // Validate input parameters
      if (!examType || !dept || !year || !section) {
        console.error('Invalid parameters provided:', { examType, dept, year, section })
        return []
      }
      
      const supabase = createClient()
      
      // Get all marks for this exam type
      const { data: marks, error: marksError } = await supabase
        .from('exam_marks')
        .select(`
          peer_tutor_id,
          student_id,
          subject_name,
          marks
        `)
        .eq('exam_type', examType)

      if (marksError) {
        console.error('Error getting exam details:', {
          message: marksError.message,
          details: marksError.details,
          hint: marksError.hint,
          code: marksError.code
        })
        return []
      }

      if (!marks || marks.length === 0) {
        console.log('No marks found for exam type:', examType)
        return []
      }

      // Group by peer tutor
      const peerTutorMap = new Map()
      console.log('Processing marks:', marks?.length || 0, 'marks found')
      
      for (const mark of marks || []) {
        console.log('Processing mark:', mark)
        console.log('Mark student_id type:', typeof mark.student_id, 'value:', mark.student_id)
        
        // Validate mark object has required properties
        if (!mark || !mark.peer_tutor_id || !mark.student_id || !mark.subject_name) {
          console.warn('Invalid mark object:', mark)
          continue
        }
        
        if (!peerTutorMap.has(mark.peer_tutor_id)) {
          peerTutorMap.set(mark.peer_tutor_id, {
            peer_tutor: {
              id: mark.peer_tutor_id,
              name: '',
              email: ''
            },
            students: new Map()
          })
        }
        
        const tutorData = peerTutorMap.get(mark.peer_tutor_id)
        
        if (!tutorData.students.has(mark.student_id)) {
          tutorData.students.set(mark.student_id, {
            id: mark.student_id,
            name: '',
            email: '',
            marks: {}
          })
        }
        
        tutorData.students.get(mark.student_id).marks[mark.subject_name] = mark.marks.toString()
      }

      // Get peer tutor and student details
      const result = []
      for (const [tutorId, tutorData] of peerTutorMap) {
        // Validate tutor ID
        if (!tutorId || typeof tutorId !== 'string' || tutorId.trim() === '') {
          console.warn('Invalid tutor ID:', tutorId)
          continue
        }
        
        // Get peer tutor details
        const { data: tutorInfo, error: tutorError } = await supabase
          .from('peer_tutors')
          .select('id, name, email')
          .eq('id', tutorId)
          .single()
        
        if (tutorError) {
          console.error('Error fetching peer tutor details:', {
            message: tutorError.message || 'Unknown error',
            details: tutorError.details || 'No details available',
            hint: tutorError.hint || 'No hint available',
            code: tutorError.code || 'No code available',
            fullError: tutorError
          })
          // Set default values if tutor not found
          tutorData.peer_tutor = {
            id: tutorId,
            name: 'Unknown Peer Tutor',
            email: 'No email'
          }
        } else if (tutorInfo) {
          tutorData.peer_tutor = tutorInfo
        } else {
          // Set default values if no data returned
          tutorData.peer_tutor = {
            id: tutorId,
            name: 'Unknown Peer Tutor',
            email: 'No email'
          }
        }

        // Get student details
        try {
          console.log('tutorData.students Map size:', tutorData.students.size)
          console.log('tutorData.students Map entries:', Array.from(tutorData.students.entries()))
          
          const rawStudentIds = Array.from(tutorData.students.keys())
          console.log('Raw student IDs from tutorData.students:', rawStudentIds)
          
          const studentIds = rawStudentIds.filter(id => {
            try {
              return id && typeof id === 'string' && id.trim() !== ''
            } catch (error) {
              console.warn('Invalid student ID found:', id, 'Error:', error)
              return false
            }
          })
          
          console.log('Filtered valid student IDs:', studentIds)
          
          if (studentIds.length === 0) {
            console.log('No valid student IDs to fetch')
          } else {
          console.log('About to query students table with IDs:', studentIds)
          
          // First, let's check if any of these students exist at all in peer_students table
          const { data: allStudents, error: allStudentsError } = await supabase
            .from('peer_students')
            .select('id, name, email')
            .limit(5)
          
          console.log('Sample students from peer_students table:', allStudents)
          console.log('All students error:', allStudentsError)
          
          // Now query for our specific student IDs from the correct table
          const { data: studentsInfo, error: studentsError } = await supabase
            .from('peer_students')
            .select('id, name, email')
            .in('id', studentIds)

          console.log('Database query result - studentsInfo:', studentsInfo)
          console.log('Database query result - studentsError:', studentsError)
          
          // Let's also try a different approach - check if the student exists with a different query
          for (const studentId of studentIds) {
            const { data: singleStudent, error: singleError } = await supabase
              .from('peer_students')
              .select('id, name, email')
              .eq('id', studentId)
              .single()
            
            console.log(`Single student query for ${studentId}:`, singleStudent)
            console.log(`Single student error for ${studentId}:`, singleError)
          }

          if (studentsError) {
            console.error('Error fetching student details:', {
              message: studentsError.message || 'Unknown error',
              details: studentsError.details || 'No details available',
              hint: studentsError.hint || 'No hint available',
              code: studentsError.code || 'No code available',
              fullError: studentsError
            })
            
            // Continue execution with default values instead of throwing
            console.log('Continuing with default student values due to fetch error')
          }

          if (studentsInfo && studentsInfo.length > 0) {
            console.log('Successfully fetched student info:', studentsInfo)
            console.log('Current tutorData.students before update:', Array.from(tutorData.students.entries()))
            
            for (const student of studentsInfo) {
              console.log('Processing student from DB:', student)
              if (tutorData.students.has(student.id)) {
                const studentData = tutorData.students.get(student.id)
                console.log('Found student in Map, updating:', studentData)
                studentData.name = student.name || 'Unknown Student'
                studentData.email = student.email || 'No email'
                console.log('Updated student data:', studentData)
              } else {
                console.warn('Student ID from DB not found in Map:', student.id)
                console.log('Available student IDs in Map:', Array.from(tutorData.students.keys()))
              }
            }
          } else {
            console.log('No student info found for IDs:', studentIds)
            console.log('This could mean: 1) Students don\'t exist in DB, 2) IDs don\'t match, 3) Query failed')
            
            // Try to get student info from a different table or source
            console.log('Attempting to find students in other tables...')
            
            // Check if students might be in a different table structure
            for (const studentId of studentIds) {
              if (tutorData.students.has(studentId)) {
                const studentData = tutorData.students.get(studentId)
                const studentIdStr = String(studentId)
                
                // Try to get student info from peer_students table with a different approach
                try {
                  const { data: studentProfile, error: profileError } = await supabase
                    .from('peer_students')
                    .select('id, name, email')
                    .eq('id', studentIdStr)
                    .single()
                  
                  if (studentProfile && !profileError) {
                    studentData.name = studentProfile.name || `Student ${studentIdStr.slice(0, 8)}`
                    studentData.email = studentProfile.email || 'No email'
                    console.log('Found student in peer_students (fallback):', studentProfile)
                  } else {
                    // Fallback: use a more descriptive name with partial ID
                    studentData.name = `Student ${studentIdStr.slice(0, 8)}...`
                    studentData.email = 'No email'
                    console.log('Student not found in peer_students (fallback), using fallback name')
                  }
                } catch (error) {
                  console.log('Error checking peer_students (fallback):', error)
                  studentData.name = `Student ${studentIdStr.slice(0, 8)}...`
                  studentData.email = 'No email'
                }
                
                console.log('Set fallback values for student ID:', studentIdStr, 'Name:', studentData.name)
              }
            }
          }
        }
        } catch (studentProcessingError) {
          console.error('Error processing student data for tutor:', tutorId, studentProcessingError)
          // Set default values for all students if processing fails
          for (const [studentId, studentData] of tutorData.students) {
            studentData.name = 'Unknown Student'
            studentData.email = 'No email'
          }
        }

        result.push({
          peer_tutor: tutorData.peer_tutor,
          students: Array.from(tutorData.students.values()) as Array<{
            id: string
            name: string
            email: string
            marks: { [subject: string]: string }
          }>
        })
      }

      console.log('Returning exam details result:', result.length, 'peer tutors')
      return result
    } catch (error) {
      console.error('Error in getExamDetailsForSection:', error)
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error,
        fullError: error
      })
      
      // Re-throw the error so the calling code can handle it appropriately
      throw new Error(`Failed to fetch exam details: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get exam type label from value
   */
  private static getExamTypeLabel(examType: string): string {
    const labels: { [key: string]: string } = {
      'cie-1': 'CIE - 1',
      'cie-2': 'CIE - 2',
      'cie-3': 'CIE - 3',
      'semester': 'Semester'
    }
    return labels[examType] || examType
  }

  /**
   * Get exam marks for students assigned to a specific peer tutor
   */
  static async getExamMarksByPeerTutor(peerTutorId: string): Promise<any[]> {
    try {
      const supabase = createClient()
      
      // First get all students assigned to this peer tutor
      const { data: students, error: studentsError } = await supabase
        .from('peer_students')
        .select('id, name, email')
        .eq('assigned_peer_tutor_id', peerTutorId)
        .eq('peer_tutor', false)

      if (studentsError) {
        console.error('Error getting students for peer tutor:', studentsError)
        return []
      }

      if (!students || students.length === 0) {
        console.log('No students found for peer tutor:', peerTutorId)
        return []
      }

      const studentIds = students.map(s => s.id)
      console.log('Found students for peer tutor:', students.length, 'student IDs:', studentIds)

      // Get exam marks for these students
      const { data: examMarks, error: marksError } = await supabase
        .from('exam_marks')
        .select(`
          id,
          exam_type,
          subject_name,
          marks,
          student_id,
          created_at
        `)
        .in('student_id', studentIds)
        .order('created_at', { ascending: false })

      if (marksError) {
        console.error('Error getting exam marks by peer tutor:', marksError)
        return []
      }

      console.log('Found exam marks:', examMarks?.length || 0)

      // Create a map of student info for quick lookup
      const studentMap = new Map()
      students.forEach(student => {
        studentMap.set(student.id, student)
      })

      // Transform the data to match the expected format
      return (examMarks || []).map(mark => {
        const student = studentMap.get(mark.student_id)
        return {
          id: mark.id,
          exam_type: mark.exam_type,
          subject: mark.subject_name,
          marks: parseInt(mark.marks) || 0,
          max_marks: 100, // Default max marks, can be made configurable
          student_name: student?.name || 'Unknown Student',
          student_email: student?.email || 'unknown@email.com',
          created_at: mark.created_at
        }
      })
    } catch (error) {
      console.error('Error in getExamMarksByPeerTutor:', error)
      return []
    }
  }
}
