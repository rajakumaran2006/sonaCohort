import { createClient } from '@/utils/supabase/client'

export interface Exam {
  id: string
  name: string
  years: string[]
  created_by: string | null
  max_marks: number | null
  created_at: string
  updated_at: string
}

export interface CreateExamData {
  name: string
  years: string[]
  created_by: string | null
  max_marks?: number
}

export class ExamService {
  /**
   * Create a new exam
   */
  static async createExam(data: CreateExamData): Promise<Exam | null> {
    try {
      const supabase = createClient()
      
      const { data: exam, error } = await supabase
        .from('exams')
        .insert({
          name: data.name,
          years: data.years,
          created_by: data.created_by,
          max_marks: data.max_marks || 100,
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating exam:', error)
        return null
      }

      return exam as Exam
    } catch (error) {
      console.error('Error in createExam:', error)
      return null
    }
  }

  /**
   * Get all exams
   */
  static async getAllExams(): Promise<Exam[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error getting exams:', error)
        return []
      }

      return (data || []) as Exam[]
    } catch (error) {
      console.error('Error in getAllExams:', error)
      return []
    }
  }

  /**
   * Get exams by year
   */
  static async getExamsByYear(year: string): Promise<Exam[]> {
    try {
      const supabase = createClient()
      
      // Fetch all exams and filter in memory for array contains
      // This is more reliable than using .contains() which may have issues with array columns
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error getting exams by year:', error)
        return []
      }

      // Filter exams where the years array contains the specified year
      const filteredExams = (data || []).filter((exam: Exam) => 
        exam.years && exam.years.includes(year)
      )

      return filteredExams as Exam[]
    } catch (error) {
      console.error('Error in getExamsByYear:', error)
      return []
    }
  }

  /**
   * Get exam by ID
   */
  static async getExamById(id: string): Promise<Exam | null> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('Error getting exam by ID:', error)
        return null
      }

      return data as Exam
    } catch (error) {
      console.error('Error in getExamById:', error)
      return null
    }
  }

  /**
   * Delete exam
   */
  static async deleteExam(id: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('exams')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting exam:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in deleteExam:', error)
      return false
    }
  }
}

