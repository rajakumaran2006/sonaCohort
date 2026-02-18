import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { ExamSummaryService } from './examSummaryService'

export interface ExamMark {
  id: string
  exam_id: string
  peer_tutor_id: string
  student_id: string
  subject_id: string | null // Legacy support
  exam_subject_id: string | null
  marks: { [fieldName: string]: number | string }
  created_at: string
  updated_at: string
}

export interface ExamMarkData {
  exam_id: string
  peer_tutor_id: string
  student_id: string
  exam_subject_id: string
  marks: { [fieldName: string]: number | string }
}

export class ExamMarksService {
  /**
   * Save or update exam marks for a student-subject combination
   */
  static async saveExamMarks(data: ExamMarkData): Promise<ExamMark | null> {
    try {
      const supabase = createClient()
      
      // Check if record exists (use maybeSingle to handle no results)
      const { data: existing } = await supabase
        .from('exam_marks')
        .select('id')
        .eq('exam_id', data.exam_id)
        .eq('peer_tutor_id', data.peer_tutor_id)
        .eq('student_id', data.student_id)
        .eq('exam_subject_id', data.exam_subject_id)
        .maybeSingle()

      if (existing) {
        // Update existing record
        const { data: updated, error } = await supabase
          .from('exam_marks')
          .update({
            marks: data.marks,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single()

        if (error) {
          logger.error('Error updating exam marks:', error)
          return null
        }

        // Update summary asynchronously (don't block return)
        ExamSummaryService.updateSummary(data.exam_id, data.peer_tutor_id)
          .catch(err => logger.error('Error updating exam summary trigger:', err))

        return updated as ExamMark
      } else {
        // Insert new record
        const { data: inserted, error } = await supabase
          .from('exam_marks')
          .insert({
            exam_id: data.exam_id,
            peer_tutor_id: data.peer_tutor_id,
            student_id: data.student_id,
            exam_subject_id: data.exam_subject_id,
            marks: data.marks,
            subject_id: null, // Legacy field, set to null
          })
          .select()
          .single()

        if (error) {
          logger.error('Error inserting exam marks:', error)
          return null
        }

        // Update summary asynchronously (don't block return)
        ExamSummaryService.updateSummary(data.exam_id, data.peer_tutor_id)
          .catch(err => logger.error('Error updating exam summary trigger:', err))

        return inserted as ExamMark
      }
    } catch (error) {
      logger.error('Error in saveExamMarks:', error)
      return null
    }
  }

  /**
   * Save multiple exam marks in batch
   */
  static async saveExamMarksBatch(marksData: ExamMarkData[]): Promise<boolean> {
    try {
      // const supabase = createClient()
      
      // For each mark, check if it exists and upsert
      const operations = marksData.map(async (data) => {
        return await this.saveExamMarks(data)
      })

      const results = await Promise.all(operations)
      return results.every(result => result !== null)
    } catch (error) {
      logger.error('Error in saveExamMarksBatch:', error)
      return false
    }
  }

  /**
   * Get exam marks for a peer tutor and exam
   */
  static async getExamMarksBypeertutorsAndExam(
    peertutorsId: string,
    examId: string
  ): Promise<ExamMark[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_marks')
        .select('*')
        .eq('peer_tutor_id', peertutorsId)
        .eq('exam_id', examId)
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('Error getting exam marks:', error)
        return []
      }

      return (data || []) as ExamMark[]
    } catch (error) {
      logger.error('Error in getExamMarksBypeertutorsAndExam:', error)
      return []
    }
  }

  /**
   * Get exam mark for a specific student and exam subject
   */
  static async getExamMark(
    examId: string,
    peertutorsId: string,
    studentId: string,
    examSubjectId: string
  ): Promise<ExamMark | null> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_marks')
        .select('*')
        .eq('exam_id', examId)
        .eq('peer_tutor_id', peertutorsId)
        .eq('student_id', studentId)
        .eq('exam_subject_id', examSubjectId)
        .single()

      if (error && error.code !== 'PGRST116') {
        logger.error('Error getting exam mark:', error)
        return null
      }

      return data as ExamMark | null
    } catch (error) {
      logger.error('Error in getExamMark:', error)
      return null
    }
  }
}

