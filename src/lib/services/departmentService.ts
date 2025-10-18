import { createClient } from '@/utils/supabase/client'
import { Department, CreateDepartmentData } from '../types'

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
        console.error('Supabase error creating department:', error)
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
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
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting department:', error)
        return false
      }

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
