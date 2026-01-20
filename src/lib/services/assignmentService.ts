import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { Student } from './studentService'
import { peertutors } from './peerTutorService'

export interface Assignment {
  id: string
  student_id: string
  peer_tutor_id: string
  student_name: string
  student_email: string
  peer_tutor_name: string
  peer_tutor_email: string
  dept: string
  year: string
  section: string
  created_at: string
}

export interface AssignmentStats {
  totalStudents: number
  totalpeerTutor: number
  assignedStudents: number
  unassignedStudents: number
  averageStudentsPerTutor: number
}

export class AssignmentService {
  /**
   * Get assignment statistics for a year across all sections
   */
  static async getAssignmentStatsByYear(dept: string, year: string): Promise<AssignmentStats> {
    try {
      const supabase = createClient()
      
      // Get all students in the year (all sections)
      const { data: students, error: studentsError } = await supabase
        .from('peer_students')
        .select('id, assigned_peer_tutor_id')
        .eq('dept', dept)
        .eq('year', year)
        .eq('peer_tutor', false) // Only regular students, not peer tutors

      if (studentsError) {
        logger.error('Error getting students by year:', studentsError)
        return {
          totalStudents: 0,
          totalpeerTutor: 0,
          assignedStudents: 0,
          unassignedStudents: 0,
          averageStudentsPerTutor: 0
        }
      }

      // Get all peer tutors in the year (all sections)
      const { data: peerTutor, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('id')
        .eq('dept', dept)
        .eq('year', year)

      if (tutorsError) {
        logger.error('Error getting peer tutors by year:', tutorsError)
        return {
          totalStudents: 0,
          totalpeerTutor: 0,
          assignedStudents: 0,
          unassignedStudents: 0,
          averageStudentsPerTutor: 0
        }
      }

      const totalStudents = students?.length || 0
      const totalpeerTutor = peerTutor?.length || 0
      const assignedStudents = students?.filter(s => s.assigned_peer_tutor_id).length || 0
      const unassignedStudents = totalStudents - assignedStudents
      const averageStudentsPerTutor = totalpeerTutor > 0 ? Math.round(totalStudents / totalpeerTutor) : 0

      return {
        totalStudents,
        totalpeerTutor,
        assignedStudents,
        unassignedStudents,
        averageStudentsPerTutor
      }
    } catch (error) {
      logger.error('Error getting assignment stats by year:', error)
      return {
        totalStudents: 0,
        totalpeerTutor: 0,
        assignedStudents: 0,
        unassignedStudents: 0,
        averageStudentsPerTutor: 0
      }
    }
  }

  /**
   * Get assignment statistics for a section
   */
  static async getAssignmentStats(dept: string, year: string, section: string): Promise<AssignmentStats> {
    try {
      const supabase = createClient()
      
      // Get all students in the section
      const { data: students, error: studentsError } = await supabase
        .from('peer_students')
        .select('id, assigned_peer_tutor_id')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .eq('peer_tutor', false) // Only regular students, not peer tutors

      if (studentsError) {
        logger.error('Error getting students:', studentsError)
        return {
          totalStudents: 0,
          totalpeerTutor: 0,
          assignedStudents: 0,
          unassignedStudents: 0,
          averageStudentsPerTutor: 0
        }
      }

      // Get all peer tutors in the section
      const { data: peerTutor, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('id')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (tutorsError) {
        logger.error('Error getting peer tutors:', tutorsError)
        return {
          totalStudents: 0,
          totalpeerTutor: 0,
          assignedStudents: 0,
          unassignedStudents: 0,
          averageStudentsPerTutor: 0
        }
      }

      const totalStudents = students?.length || 0
      const totalpeerTutor = peerTutor?.length || 0
      const assignedStudents = students?.filter(s => s.assigned_peer_tutor_id).length || 0
      const unassignedStudents = totalStudents - assignedStudents
      const averageStudentsPerTutor = totalpeerTutor > 0 ? Math.round(totalStudents / totalpeerTutor) : 0

      return {
        totalStudents,
        totalpeerTutor,
        assignedStudents,
        unassignedStudents,
        averageStudentsPerTutor
      }
    } catch (error) {
      logger.error('Error getting assignment stats:', error)
      return {
        totalStudents: 0,
        totalpeerTutor: 0,
        assignedStudents: 0,
        unassignedStudents: 0,
        averageStudentsPerTutor: 0
      }
    }
  }

  /**
   * Get all assignments for a section (alias for getAssignments)
   */
  static async getAssignmentsBySection(dept: string, year: string, section: string): Promise<Assignment[]> {
    return this.getAssignments(dept, year, section)
  }

  /**
   * Get assignment by student and tutor
   */
  static async getAssignmentByStudentAndTutor(studentId: string, peertutorsId: string): Promise<Assignment | null> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select(`
          id,
          name,
          email,
          assigned_peer_tutor_id,
          dept,
          year,
          section,
          peer_tutors!inner(
            id,
            name,
            email
          )
        `)
        .eq('id', studentId)
        .eq('assigned_peer_tutor_id', peertutorsId)
        .eq('peer_tutor', false)
        .single()

      if (error || !data) {
        return null
      }

      return {
        id: data.id,
        student_id: data.id,
        peer_tutor_id: data.assigned_peer_tutor_id,
        student_name: data.name,
        student_email: data.email,
        peer_tutor_name: data.peer_tutors?.[0]?.name || '',
        peer_tutor_email: data.peer_tutors?.[0]?.email || '',
        dept: data.dept,
        year: data.year,
        section: data.section,
        created_at: new Date().toISOString()
      }
    } catch (error) {
      logger.error('Error getting assignment by student and tutor:', error)
      return null
    }
  }

  /**
   * Create a new assignment
   */
  static async createAssignment(assignmentData: {
    peer_tutor_id: string
    student_id: string
    department: string
    year: string
    section: string
    assigned_date: string
  }): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('peer_students')
        .update({ assigned_peer_tutor_id: assignmentData.peer_tutor_id })
        .eq('id', assignmentData.student_id)

      if (error) {
        logger.error('Error creating assignment:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in createAssignment:', error)
      return false
    }
  }

  /**
   * Get all assignments for a section
   */
  static async getAssignments(dept: string, year: string, section: string): Promise<Assignment[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select(`
          id,
          name,
          email,
          assigned_peer_tutor_id,
          peer_tutors!inner(
            id,
            name,
            email
          )
        `)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .eq('peer_tutor', false)
        .not('assigned_peer_tutor_id', 'is', null)

      if (error) {
        logger.error('Error getting assignments:', error)
        return []
      }

      return (data || []).map(item => ({
        id: item.id,
        student_id: item.id,
        peer_tutor_id: item.assigned_peer_tutor_id,
        student_name: item.name,
        student_email: item.email,
        peer_tutor_name: item.peer_tutors?.[0]?.name || '',
        peer_tutor_email: item.peer_tutors?.[0]?.email || '',
        dept,
        year,
        section,
        created_at: new Date().toISOString()
      }))
    } catch (error) {
      logger.error('Error in getAssignments:', error)
      return []
    }
  }

  /**
   * Assign a student to a peer tutor
   */
  static async assignStudent(studentId: string, peertutorsId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('peer_students')
        .update({ assigned_peer_tutor_id: peertutorsId })
        .eq('id', studentId)

      if (error) {
        logger.error('Error assigning student:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in assignStudent:', error)
      return false
    }
  }

  /**
   * Unassign a student from their peer tutor
   */
  static async unassignStudent(studentId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('peer_students')
        .update({ assigned_peer_tutor_id: null })
        .eq('id', studentId)

      if (error) {
        logger.error('Error unassigning student:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in unassignStudent:', error)
      return false
    }
  }

  /**
   * Automatically assign all unassigned students to peer tutors
   * Ensures each peer tutor gets an equal total number of students (including existing assignments)
   */
  static async autoAssignStudents(dept: string, year: string, section: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Get all unassigned students
      const { data: unassignedStudents, error: studentsError } = await supabase
        .from('peer_students')
        .select('id')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .eq('peer_tutor', false)
        .is('assigned_peer_tutor_id', null)

      if (studentsError) {
        logger.error('Error getting unassigned students:', studentsError)
        return false
      }

      // Get all peer tutors
      const { data: peerTutor, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('id, name')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (tutorsError) {
        logger.error('Error getting peer tutors:', tutorsError)
        return false
      }

      if (!unassignedStudents || !peerTutor || peerTutor.length === 0) {
        return true // No students to assign or no peer tutors
      }

      // Calculate current assignment counts for each peer tutor
      const tutorAssignmentCounts = await Promise.all(
        peerTutor.map(async (tutor) => {
          const { count } = await supabase
            .from('peer_students')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_peer_tutor_id', tutor.id)
            .eq('peer_tutor', false)
          
          return {
            id: tutor.id,
            name: tutor.name,
            currentCount: count || 0
          }
        })
      )

      logger.info('Tutor assignment counts before auto-assign:', tutorAssignmentCounts)
      logger.info('Unassigned students count:', unassignedStudents.length)

      // Sort tutors by current assignment count (ascending) to prioritize those with fewer students
      tutorAssignmentCounts.sort((a, b) => a.currentCount - b.currentCount)

      // Calculate target assignments per tutor
      const totalStudents = unassignedStudents.length + tutorAssignmentCounts.reduce((sum, tutor) => sum + tutor.currentCount, 0)
      const targetPerTutor = Math.floor(totalStudents / peerTutor.length)
      const remainder = totalStudents % peerTutor.length

      logger.info('Total students:', totalStudents)
      logger.info('Target per tutor:', targetPerTutor)
      logger.info('Remainder:', remainder)

      // Assign students to balance the load
      let studentIndex = 0
      for (let i = 0; i < tutorAssignmentCounts.length && studentIndex < unassignedStudents.length; i++) {
        const tutor = tutorAssignmentCounts[i]
        
        // Calculate how many more students this tutor should get
        const additionalStudentsNeeded = targetPerTutor - tutor.currentCount + (i < remainder ? 1 : 0)
        const studentsToAssign = Math.min(additionalStudentsNeeded, unassignedStudents.length - studentIndex)
        
        logger.info(`Tutor ${tutor.name}: current=${tutor.currentCount}, needs=${additionalStudentsNeeded}, will assign=${studentsToAssign}`)
        
        // Only assign if this tutor needs more students
        if (studentsToAssign > 0) {
          // Assign students to this tutor
          for (let j = 0; j < studentsToAssign && studentIndex < unassignedStudents.length; j++) {
            const student = unassignedStudents[studentIndex]
            
            const { error } = await supabase
              .from('peer_students')
              .update({ assigned_peer_tutor_id: tutor.id })
              .eq('id', student.id)

            if (error) {
              logger.error('Error auto-assigning student:', error)
              return false
            }
            
            logger.info(`Assigned student ${student.id} to tutor ${tutor.name}`)
            studentIndex++
          }
        }
      }

      logger.info('Auto-assignment completed')
      return true
    } catch (error) {
      logger.error('Error in autoAssignStudents:', error)
      return false
    }
  }

  /**
   * Get students assigned to a specific peer tutor
   */
  static async getStudentsBypeertutors(peertutorsId: string): Promise<Student[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('*')
        .eq('assigned_peer_tutor_id', peertutorsId)
        .eq('peer_tutor', false)

      if (error) {
        logger.error('Error getting students by peer tutor:', error)
        return []
      }

      return data as Student[] || []
    } catch (error) {
      logger.error('Error in getStudentsBypeertutors:', error)
      return []
    }
  }

  /**
   * Get all assignments for a specific faculty
   */
  static async getAllAssignmentsByFaculty(facultyId: string): Promise<Assignment[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select(`
          id,
          name,
          email,
          dept,
          year,
          section,
          assigned_peer_tutor_id,
          peer_tutors!inner(
            id,
            name,
            email
          )
        `)
        .eq('faculty_id', facultyId)
        .not('assigned_peer_tutor_id', 'is', null)

      if (error) {
        logger.error('Error getting assignments by faculty:', error)
        return []
      }

      return data.map((item: {
        id: string;
        name: string;
        email: string;
        dept: string;
        year: string;
        section: string;
        assigned_peer_tutor_id: string;
        peer_tutors: { id: string; name: string; email: string }[];
      }) => ({
        id: item.id,
        student_id: item.id,
        peer_tutor_id: item.assigned_peer_tutor_id,
        student_name: item.name,
        student_email: item.email,
        peer_tutor_name: item.peer_tutors?.[0]?.name || '',
        peer_tutor_email: item.peer_tutors?.[0]?.email || '',
        dept: item.dept,
        year: item.year,
        section: item.section,
        created_at: new Date().toISOString()
      }))
    } catch (error) {
      logger.error('Error in getAllAssignmentsByFaculty:', error)
      return []
    }
  }

  /**
   * Get unassigned students for a section
   */
  static async getUnassignedStudents(dept: string, year: string, section: string): Promise<Student[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('peer_students')
        .select('id, name, email, dept, year, section')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .eq('peer_tutor', false)
        .is('assigned_peer_tutor_id', null)

      if (error) {
        logger.error('Error getting unassigned students:', error)
        return []
      }

      return data as Student[] || []
    } catch (error) {
      logger.error('Error in getUnassignedStudents:', error)
      return []
    }
  }

  /**
   * Get peer tutors with their assigned students for a section
   */
  static async getpeerTutorWithStudents(dept: string, year: string, section: string): Promise<Array<{
    peertutors: peertutors
    students: Student[]
  }>> {
    try {
      const supabase = createClient()
      
      // Get all peer tutors for this section
      const { data: peerTutor, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (tutorsError) {
        logger.error('Error getting peer tutors:', tutorsError)
        return []
      }

      if (!peerTutor || peerTutor.length === 0) {
        return []
      }

      // Get students for each peer tutor
      const tutorsWithStudents = await Promise.all(
        peerTutor.map(async (tutor) => {
          const { data: students, error: studentsError } = await supabase
            .from('peer_students')
            .select('id, name, email, dept, year, section')
            .eq('assigned_peer_tutor_id', tutor.id)
            .eq('peer_tutor', false)

          if (studentsError) {
            logger.error(`Error getting students for tutor ${tutor.id}:`, studentsError)
            return { peertutors: tutor as peertutors, students: [] as Student[] }
          }

          return { 
            peertutors: tutor as peertutors, 
            students: (students || []) as Student[] 
          }
        })
      )

      return tutorsWithStudents
    } catch (error) {
      logger.error('Error in getpeerTutorWithStudents:', error)
      return []
    }
  }

  /**
 * Export assignments to CSV format
 */
static async exportAssignmentsToCSV(dept: string, year: string, section: string): Promise<string> {
  try {
    const assignments = await this.getAssignments(dept, year, section)
    
    // CSV header
    const headers = ['Student Name', 'Student Email', 'Assigned Peer Tutor', 'Peer Tutor Email']
    
    // CSV rows
    const rows = assignments.map(assignment => [
      assignment.student_name,
      assignment.student_email,
      assignment.peer_tutor_name,
      assignment.peer_tutor_email
    ])
    
    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n')
    
    return csvContent
  } catch (error) {
    logger.error('Error exporting assignments to CSV:', error)
    throw error
  }
}

/**
 * Import assignments from CSV data
 */
static async importAssignmentsFromCSV(
  dept: string, 
  year: string, 
  section: string, 
  csvData: string
): Promise<{
  success: boolean
  added: number
  skipped: string[]
  errors: string[]
}> {
  try {
    const supabase = createClient()
    const lines = csvData.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
    
    // Validate headers
    const expectedHeaders = ['Student Name', 'Student Email', 'Assigned Peer Tutor', 'Peer Tutor Email']
    if (!expectedHeaders.every(header => headers.includes(header))) {
      throw new Error('Invalid CSV format. Expected headers: Student Name, Student Email, Assigned Peer Tutor, Peer Tutor Email')
    }
    
    const skipped: string[] = []
    const errors: string[] = []
    let added = 0
    
    // Process each row (skip header)
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(field => field.replace(/"/g, '').trim())
      
      if (row.length !== 4) {
        errors.push(`Row ${i + 1}: Invalid number of columns`)
        continue
      }
      
      const [studentName, studentEmail, peertutorsName, peertutorsEmail] = row
      
      try {
        // Check if student exists in this section
        const { data: student, error: studentError } = await supabase
          .from('peer_students')
          .select('id, assigned_peer_tutor_id')
          .eq('email', studentEmail)
          .eq('dept', dept)
          .eq('year', year)
          .eq('section', section)
          .eq('peer_tutor', false)
          .single()
        
        if (studentError || !student) {
          skipped.push(`${studentName} (${studentEmail}) - Student not found in this section`)
          continue
        }
        
        // Check if student is already assigned
        if (student.assigned_peer_tutor_id) {
          skipped.push(`${studentName} (${studentEmail}) - Already assigned to another peer tutor`)
          continue
        }
        
        // Check if peer tutor exists in this section
        const { data: peertutors, error: tutorError } = await supabase
          .from('peer_tutors')
          .select('id')
          .eq('email', peertutorsEmail)
          .eq('dept', dept)
          .eq('year', year)
          .eq('section', section)
          .single()
        
        if (tutorError || !peertutors) {
          skipped.push(`${studentName} (${studentEmail}) - Peer tutor ${peertutorsName} not found in this section`)
          continue
        }
        
        // Assign student to peer tutor
        const { error: assignError } = await supabase
          .from('peer_students')
          .update({ assigned_peer_tutor_id: peertutors.id })
          .eq('id', student.id)
        
        if (assignError) {
          errors.push(`Row ${i + 1}: Failed to assign ${studentName} to ${peertutorsName}`)
          continue
        }
        
        added++
      } catch (rowError) {
        errors.push(`Row ${i + 1}: ${(rowError as Error).message}`)
      }
    }
    
    return {
      success: true,
      added,
      skipped,
      errors
    }
  } catch (error) {
    logger.error('Error importing assignments from CSV:', error)
    return {
      success: false,
      added: 0,
      skipped: [],
      errors: [(error as Error).message]
    }
  }
}


  // Unassign all students in a section
  static async unassignAllStudents(dept: string, year: string, section: string): Promise<boolean> {
    const supabase = createClient()
    
    try {
      const { error } = await supabase
        .from('peer_students')
        .update({ assigned_peer_tutor_id: null })
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        
      if (error) {
        logger.error('Error unassigning all students:', error)
        return false
      }
      
      return true
    } catch (error) {
      logger.error('Error in unassignAllStudents:', error)
      return false
    }
  }

}
