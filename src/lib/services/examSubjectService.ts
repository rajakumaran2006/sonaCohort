import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

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
        logger.error('Error getting exam subjects:', error)
        return []
      }

      return (data || []) as ExamSubject[]
    } catch (error) {
      logger.error('Error in getExamSubjects:', error)
      return []
    }
  }

  /**
   * Get exam subjects filtered for a specific peer tutor
   * Only returns subjects from classes scheduled for this peer tutor + custom subjects they added
   */
  static async getExamSubjectsForPeerTutor(examId: string, peertutorsId: string): Promise<ExamSubject[]> {
    try {
      const supabase = createClient()
      
      // Get all exam subjects for this exam
      const { data: allSubjects, error: subjectsError } = await supabase
        .from('exam_subjects')
        .select('*')
        .eq('exam_id', examId)
        .order('created_at', { ascending: true })

      if (subjectsError) {
        logger.error('Error getting exam subjects:', subjectsError)
        return []
      }

      if (!allSubjects || allSubjects.length === 0) {
        return []
      }

      // Get unique class_ids that are scheduled for this specific peer tutor
      const { data: scheduledClasses, error: scheduledError } = await supabase
        .from('scheduled_classes')
        .select('class_id')
        .eq('peer_tutor_id', peertutorsId)

      if (scheduledError) {
        logger.error('Error getting scheduled classes for peer tutor:', scheduledError)
        return []
      }

      const peerTutorClassIds = new Set(scheduledClasses?.map(sc => sc.class_id) || [])

      // Also get subject names from those classes for matching subjects without class_id
      const { data: peerTutorClasses } = await supabase
        .from('classes')
        .select('subject_name')
        .in('id', [...peerTutorClassIds])

      const peerTutorSubjectNames = new Set(peerTutorClasses?.map(c => c.subject_name) || [])

      // Filter subjects: include if:
      // 1. Subject's class_id is in peer tutor's scheduled classes
      // 2. Subject's name matches one of peer tutor's class subjects (for custom-added duplicates)
      // 3. Subject was custom-added by this peer tutor (created_by matches)
      const filteredSubjects = allSubjects.filter(subject => {
        if (subject.class_id && peerTutorClassIds.has(subject.class_id)) return true
        if (peerTutorSubjectNames.has(subject.subject_name)) return true
        if (subject.created_by === peertutorsId) return true
        return false
      })

      return filteredSubjects as ExamSubject[]
    } catch (error) {
      logger.error('Error in getExamSubjectsForPeerTutor:', error)
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
        logger.error('Error adding exam subject:', error)
        return null
      }

      return subject as ExamSubject
    } catch (error) {
      logger.error('Error in addExamSubject:', error)
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
        logger.error('Error updating subject name:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in updateSubjectName:', error)
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
        logger.error('Error deleting exam subject:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in deleteExamSubject:', error)
      return false
    }
  }

  /**
   * Initialize exam subjects from classes for a peer tutor
   * Only adds subjects from classes that are scheduled for this specific peer tutor
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
      
      // Get unique class_ids that are scheduled for this specific peer tutor
      const { data: scheduledClasses, error: scheduledError } = await supabase
        .from('scheduled_classes')
        .select('class_id')
        .eq('peer_tutor_id', peertutorsId)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)

      if (scheduledError) {
        logger.error('Error getting scheduled classes for peer tutor:', scheduledError)
        return false
      }

      // Get unique class IDs assigned to this peer tutor
      const peerTutorClassIds = [...new Set(scheduledClasses?.map(sc => sc.class_id) || [])]

      if (peerTutorClassIds.length === 0) {
        return true // No classes assigned to this peer tutor
      }

      // Get class details (subject_name) only for classes assigned to this peer tutor
      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('id, subject_name')
        .in('id', peerTutorClassIds)

      if (classesError) {
        logger.error('Error getting classes:', classesError)
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

      // Add subjects that don't exist (deduplicate by subject_name)
      const uniqueSubjects = new Map<string, { id: string, subject_name: string }>()
      classes.forEach(cls => {
        if (!uniqueSubjects.has(cls.subject_name)) {
          uniqueSubjects.set(cls.subject_name, cls)
        }
      })

      const subjectsToAdd = Array.from(uniqueSubjects.values())
        .filter(cls => !existingNames.has(cls.subject_name))
        .map(cls => ({
          exam_id: examId,
          subject_name: cls.subject_name,
          class_id: cls.id,
          is_custom: false,
          created_by: peertutorsId,
        }))

      if (subjectsToAdd.length > 0) {
        const { error: insertError } = await supabase
          .from('exam_subjects')
          .insert(subjectsToAdd)

        if (insertError) {
          logger.error('Error inserting exam subjects:', insertError)
          return false
        }
      }

      return true
    } catch (error) {
      logger.error('Error in initializeSubjectsFromClasses:', error)
      return false
    }
  }
}

