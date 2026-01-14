import { createClient } from '@/utils/supabase/client'

export interface ExamSubject {
  id: string
  exam_id: string
  subject_name: string
  class_id: string | null
  is_custom: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateExamSubjectData {
  exam_id: string
  subject_name: string
  class_id?: string | null
  is_custom?: boolean
  created_by?: string | null
}

export class ExamSubjectService {
  /**
   * Get all subjects for an exam
   */
  static async getExamSubjects(examId: string): Promise<ExamSubject[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_subjects')
        .select('*')
        .eq('exam_id', examId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error getting exam subjects:', error)
        return []
      }

      return (data || []) as ExamSubject[]
    } catch (error) {
      console.error('Error in getExamSubjects:', error)
      return []
    }
  }

  /**
   * Add a new subject to an exam
   */
  static async addExamSubject(data: CreateExamSubjectData): Promise<ExamSubject | null> {
    try {
      const supabase = createClient()
      
      const { data: subject, error } = await supabase
        .from('exam_subjects')
        .insert({
          exam_id: data.exam_id,
          subject_name: data.subject_name.trim(),
          class_id: data.class_id || null,
          is_custom: data.is_custom ?? true,
          created_by: data.created_by || null,
        })
        .select()
        .single()

      if (error) {
        console.error('Error adding exam subject:', error)
        return null
      }

      return subject as ExamSubject
    } catch (error) {
      console.error('Error in addExamSubject:', error)
      return null
    }
  }

  /**
   * Update subject name
   */
  static async updateSubjectName(subjectId: string, newName: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('exam_subjects')
        .update({ subject_name: newName.trim() })
        .eq('id', subjectId)

      if (error) {
        console.error('Error updating subject name:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in updateSubjectName:', error)
      return false
    }
  }

  /**
   * Delete a subject from an exam
   */
  static async deleteExamSubject(subjectId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('exam_subjects')
        .delete()
        .eq('id', subjectId)

      if (error) {
        console.error('Error deleting exam subject:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in deleteExamSubject:', error)
      return false
    }
  }

  /**
   * Initialize exam subjects from classes for a peer tutor
   */
  static async initializeSubjectsFromClasses(
    examId: string,
    peertutorsId: string,
    dept: string,
    year: string,
    section: string
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Get classes for this peer tutor
      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('id, subject_name')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (classesError) {
        console.error('Error getting classes:', classesError)
        return false
      }

      if (!classes || classes.length === 0) {
        return true // No classes to add
      }

      // Check existing subjects
      const { data: existingSubjects } = await supabase
        .from('exam_subjects')
        .select('subject_name')
        .eq('exam_id', examId)

      const existingNames = new Set(existingSubjects?.map(s => s.subject_name) || [])

      // Add subjects that don't exist
      const subjectsToAdd = classes
        .filter(cls => !existingNames.has(cls.subject_name))
        .map(cls => ({
          exam_id: examId,
          subject_name: cls.subject_name,
          class_id: cls.id,
          is_custom: false,
          created_by: null,
        }))

      if (subjectsToAdd.length > 0) {
        const { error: insertError } = await supabase
          .from('exam_subjects')
          .insert(subjectsToAdd)

        if (insertError) {
          console.error('Error inserting exam subjects:', insertError)
          return false
        }
      }

      return true
    } catch (error) {
      console.error('Error in initializeSubjectsFromClasses:', error)
      return false
    }
  }
}

