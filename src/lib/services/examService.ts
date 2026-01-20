import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

export interface Exam {
  id: string
  name: string
  years: string[]
  created_by: string | null
  max_marks: number | null
  created_at: string
  updated_at: string
}

export interface ExamMark {
  id: string
  exam_id: string
  peer_tutor_id: string
  student_id: string
  marks: { [key: string]: number | string }
  created_at: string
  updated_at: string
  student?: {
    name: string
  }
  class?: {
    subject_name: string
  }
}

export interface ExamMarkWithDetails extends ExamMark {
  student_name?: string
  subject_name?: string
}

export interface ExamAssignment {
  id: string
  exam_id: string
  peer_tutor_id: string
  peer_tutor?: {
    name: string
    email: string
  }
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
        logger.error('Error creating exam:', error)
        return null
      }

      return exam as Exam
    } catch (error) {
      logger.error('Error in createExam:', error)
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
        logger.error('Error getting exams:', error)
        return []
      }

      return (data || []) as Exam[]
    } catch (error) {
      logger.error('Error in getAllExams:', error)
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
        logger.error('Error getting exams by year:', error)
        return []
      }

      // Filter exams where the years array contains the specified year
      const filteredExams = (data || []).filter((exam: Exam) => 
        exam.years && exam.years.includes(year)
      )

      return filteredExams as Exam[]
    } catch (error) {
      logger.error('Error in getExamsByYear:', error)
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
        logger.error('Error getting exam by ID:', error)
        return null
      }

      return data as Exam
    } catch (error) {
      logger.error('Error in getExamById:', error)
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
        logger.error('Error deleting exam:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in deleteExam:', error)
      return false
    }
  }

  /**
   * Get exam marks for a peer tutor assignment (compatibility method)
   */
  static async getExamMarks(peertutorsId: string): Promise<ExamMark[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_marks')
        .select(`
          *,
          student:peer_students(name),
          class:classes(subject_name)
        `)
        .eq('peer_tutor_id', peertutorsId)
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('Error getting exam marks:', error)
        return []
      }

      return (data || []) as ExamMark[]
    } catch (error) {
      logger.error('Error in getExamMarks:', error)
      return []
    }
  }

  /**
   * Get peer tutor marks (compatibility method)
   */
  static async getpeertutorsMarks(peertutorsId: string): Promise<ExamMarkWithDetails[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_marks')
        .select(`
          *,
          student:peer_students(name),
          subject:exam_subjects(subject_name)
        `)
        .eq('peer_tutor_id', peertutorsId)
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('Error getting peer tutor marks:', error)
        return []
      }

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      return (data || []).map((mark: any) => ({
        ...mark,
        student_name: mark.student?.name,
        subject_name: mark.subject?.subject_name
      })) as ExamMarkWithDetails[]
    } catch (error) {
      logger.error('Error in getpeertutorsMarks:', error)
      return []
    }
  }
}

