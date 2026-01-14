import { createClient } from '@/utils/supabase/client'
import { Department, CreateDepartmentData } from '../types'

import { ClassService } from './classService'
import { peertutorservice } from './peerTutorService'
import { StudentService } from './studentService'

export class DepartmentService {
  static async getDepartments(): Promise<Department[]> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching departments:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error fetching departments:', error)
      return []
    }
  }

  static async createDepartment(departmentData: CreateDepartmentData): Promise<Department | null> {
    try {
      console.log('Creating department with data:', departmentData)
      
      const supabase = createClient()
      const { data, error } = await supabase
        .from('departments')
        .insert([departmentData])
        .select()
        .single()

      if (error) {
        console.error('Supabase error creating department:', JSON.stringify(error, null, 2))
        return null
      }

      console.log('Department created successfully:', data)
      return data
    } catch (error) {
      console.error('Exception creating department:', error)
      console.error('Error type:', typeof error)
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      return null
    }
  }

  static async updateDepartment(id: string, updates: Partial<CreateDepartmentData>): Promise<Department | null> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('departments')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Error updating department:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error updating department:', error)
      return null
    }
  }

  static async deleteDepartment(id: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      console.log(`Starting cascade delete for department: ${id}`)
      
      // 1. Get the department to know its name (needed for fetching related entities by dept name if referenced that way)
      // However, most services link by IDs or we can query by faculty_id (which is the dept id)
      
      // 2. Delete all classes associated with this department (faculty_id)
      const classes = await ClassService.getClassesByFaculty(id)
      console.log(`Found ${classes.length} classes to delete`)
      
      for (const cls of classes) {
        const success = await ClassService.deleteClass(cls.id)
        if (!success) {
          console.error(`Failed to delete class ${cls.id} during department deletion`)
          // Continue trying to delete others even if one fails
        }
      }
      
      // 3. Delete Peer Tutors associated with this department
      // Peer Tutors are linked by 'faculty_id' as well in peer_tutors table
      const { data: peerTutors, error: ptError } = await supabase
        .from('peer_tutors')
        .select('id')
        .eq('faculty_id', id)
      
      if (ptError) {
        console.error('Error fetching peer tutors for deletion:', ptError)
        return false
      }
      
      if (peerTutors && peerTutors.length > 0) {
        console.log(`Found ${peerTutors.length} peer tutors to delete`)
        for (const pt of peerTutors) {
          const result = await peertutorservice.removepeertutors(pt.id, true)
          if (!result.success) {
             console.error(`Failed to delete peer tutor ${pt.id}: ${result.message}`)
          }
        }
      }
      
      // 4. Delete Students associated with this department
      // Students are linked by 'faculty_id' in peer_students table
      const { data: students, error: stError } = await supabase
        .from('peer_students')
        .select('id')
        .eq('faculty_id', id)
        
      if (stError) {
        console.error('Error fetching students for deletion:', stError)
        return false
      }
      
      if (students && students.length > 0) {
        console.log(`Found ${students.length} students to delete`)
        for (const st of students) {
          const success = await StudentService.removeStudent(st.id)
          if (!success) {
            console.error(`Failed to delete student ${st.id}`)
          }
        }
      }

      // 5. Finally, delete the department itself
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting department:', error)
        return false
      }

      console.log('Department and all related data deleted successfully')
      return true
    } catch (error) {
      console.error('Error deleting department:', error)
      return false
    }
  }

  /**
   * Get all unique years from peer_students table
   */
  static async getYears(): Promise<{id: string, name: string}[]> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('peer_students')
        .select('year')
        .eq('peer_tutor', false)

      if (error) {
        console.error('Error fetching years:', error)
        return []
      }

      // Get unique years
      const uniqueYears = [...new Set((data || []).map(item => item.year))]
        .filter(Boolean)
        .map(year => ({ id: year, name: year }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return uniqueYears
    } catch (error) {
      console.error('Error fetching years:', error)
      return []
    }
  }

  /**
   * Get all unique sections from peer_students table
   */
  static async getSections(): Promise<{id: string, name: string}[]> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('peer_students')
        .select('section')
        .eq('peer_tutor', false)

      if (error) {
        console.error('Error fetching sections:', error)
        return []
      }

      // Get unique sections
      const uniqueSections = [...new Set((data || []).map(item => item.section))]
        .filter(Boolean)
        .map(section => ({ id: section, name: section }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return uniqueSections
    } catch (error) {
      console.error('Error fetching sections:', error)
      return []
    }
  }
}
