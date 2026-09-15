import { createClient } from '@/lib/supabase/client'
import { Department, CreateDepartmentData } from '../types'
import { logger } from '@/lib/logger'

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
        logger.error('Error fetching departments:', error)
        return []
      }

      return data || []
    } catch (error) {
      logger.error('Error fetching departments:', error)
      return []
    }
  }

  static async createDepartment(departmentData: CreateDepartmentData): Promise<Department | null> {
    try {
      logger.info('Creating department with data:', departmentData)
      
      const supabase = createClient()
      const { data, error } = await supabase
        .from('departments')
        .insert([departmentData])
        .select()
        .single()

      if (error) {
        logger.error('Supabase error creating department:', JSON.stringify(error, null, 2))
        return null
      }

      logger.info('Department created successfully:', data)
      return data
    } catch (error) {
      logger.error('Exception creating department:', error)
      logger.error('Error type:', typeof error)
      logger.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      return null
    }
  }

  static async updateDepartment(
    id: string,
    updates: Partial<CreateDepartmentData>,
    oldName?: string
  ): Promise<Department | null> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('departments')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('Error updating department:', error)
        return null
      }

      // If department name was updated, update dept field in peer_tutors and peer_students
      if (updates.name && oldName && updates.name !== oldName) {
        await supabase.from('peer_tutors').update({ dept: updates.name }).eq('faculty_id', id)
        await supabase.from('peer_students').update({ dept: updates.name }).eq('faculty_id', id)
      }

      return data
    } catch (error) {
      logger.error('Error updating department:', error)
      return null
    }
  }

  static async deleteDepartment(id: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      logger.info(`Starting cascade delete for department: ${id}`)
      
      // 1. Get the department to know its name
      const { data: deptData } = await supabase
        .from('departments')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      const deptName = deptData?.name

      // 2. Delete faculty allocations for this department
      if (deptName) {
        await supabase
          .from('faculty_allocations')
          .delete()
          .or(`faculty_id.eq.${id},dept.eq.${deptName}`)
      } else {
        await supabase
          .from('faculty_allocations')
          .delete()
          .eq('faculty_id', id)
      }
      
      // 3. Delete all classes associated with this department
      const classes = await ClassService.getClassesByFaculty(id)
      logger.info(`Found ${classes.length} classes to delete`)
      
      for (const cls of classes) {
        const success = await ClassService.deleteClass(cls.id)
        if (!success) {
          logger.error(`Failed to delete class ${cls.id} during department deletion`)
        }
      }
      
      // Also delete any remaining scheduled_classes matching department name
      if (deptName) {
        await supabase
          .from('scheduled_classes')
          .delete()
          .or(`faculty_id.eq.${id},dept.eq.${deptName}`)
      }

      // 4. Delete Peer Tutors associated with this department
      let ptQuery = supabase.from('peer_tutors').select('id')
      if (deptName) {
        ptQuery = ptQuery.or(`faculty_id.eq.${id},dept.eq.${deptName}`)
      } else {
        ptQuery = ptQuery.eq('faculty_id', id)
      }
      const { data: peerTutors, error: ptError } = await ptQuery
      
      if (ptError) {
        logger.error('Error fetching peer tutors for deletion:', ptError)
      } else if (peerTutors && peerTutors.length > 0) {
        logger.info(`Found ${peerTutors.length} peer tutors to delete`)
        for (const pt of peerTutors) {
          const result = await peertutorservice.removepeertutors(pt.id, true)
          if (!result.success) {
             logger.error(`Failed to delete peer tutor ${pt.id}: ${result.message}`)
          }
        }
      }
      
      // 5. Delete Students associated with this department
      let stQuery = supabase.from('peer_students').select('id')
      if (deptName) {
        stQuery = stQuery.or(`faculty_id.eq.${id},dept.eq.${deptName}`)
      } else {
        stQuery = stQuery.eq('faculty_id', id)
      }
      const { data: students, error: stError } = await stQuery
        
      if (stError) {
        logger.error('Error fetching students for deletion:', stError)
      } else if (students && students.length > 0) {
        logger.info(`Found ${students.length} students to delete`)
        for (const st of students) {
          const success = await StudentService.removeStudent(st.id)
          if (!success) {
            logger.error(`Failed to delete student ${st.id}`)
          }
        }
      }

      // 6. Finally, delete the department itself
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id)

      if (error) {
        logger.error('Error deleting department:', error)
        return false
      }

      logger.info('Department and all related data deleted successfully')
      return true
    } catch (error) {
      logger.error('Error deleting department:', error)
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
        logger.error('Error fetching years:', error)
        return []
      }

      // Get unique years
      const uniqueYears = [...new Set((data || []).map(item => item.year))]
        .filter(Boolean)
        .map(year => ({ id: year, name: year }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return uniqueYears
    } catch (error) {
      logger.error('Error fetching years:', error)
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
        logger.error('Error fetching sections:', error)
        return []
      }

      // Get unique sections
      const uniqueSections = [...new Set((data || []).map(item => item.section))]
        .filter(Boolean)
        .map(section => ({ id: section, name: section }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return uniqueSections
    } catch (error) {
      logger.error('Error fetching sections:', error)
      return []
    }
  }
}
