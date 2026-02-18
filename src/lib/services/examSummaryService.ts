import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { ExamMarksService } from './examMarksService'
import { AssignmentService } from './assignmentService'
import { ExamSubjectService } from './examSubjectService'
import { calculatepeertutorsAscendScore } from '@/lib/utils/ascendScore'

export interface ExamPeerTutorSummary {
  id: string
  exam_id: string
  peer_tutor_id: string
  ascend_score: number
  completion_percentage: number
  created_at: string
  updated_at: string
}

export class ExamSummaryService {
  /**
   * Update (or create) the summary for a peer tutor in an exam
   */
  static async updateSummary(examId: string, peerTutorId: string): Promise<void> {
    try {
      const supabase = createClient()
      
      // 1. Fetch necessary data for calculation
      const examSubjects = await ExamSubjectService.getExamSubjects(examId)
      const students = await AssignmentService.getStudentsBypeertutors(peerTutorId)
      const marks = await ExamMarksService.getExamMarksBypeertutorsAndExam(peerTutorId, examId)
      
      // Get exam details for max marks
      const { data: exam } = await supabase
        .from('exams')
        .select('max_marks')
        .eq('id', examId)
        .single()
        
      const maxMarks = exam?.max_marks || 100

      // 2. Perform Calculations (Logic from page.tsx)
      const allStudentsMarks: Record<string, Record<string, Record<string, number | string>>> = {}

      students.forEach(student => {
        allStudentsMarks[student.id] = {}
        marks.forEach(mark => {
          if (mark.student_id === student.id && mark.exam_subject_id) {
            if (!allStudentsMarks[student.id][mark.exam_subject_id]) {
              allStudentsMarks[student.id][mark.exam_subject_id] = {}
            }
            if (mark.marks) {
              Object.assign(allStudentsMarks[student.id][mark.exam_subject_id], mark.marks)
            }
          }
        })
      })

      const ascendScore = calculatepeertutorsAscendScore(allStudentsMarks, maxMarks)

      // Calculate completion percentage
      let enteredMarks = 0
      const totalPossible = students.length * examSubjects.length

      if (totalPossible > 0) {
        students.forEach(student => {
          examSubjects.forEach(subject => {
            const markData = allStudentsMarks[student.id]?.[subject.id]
            if (markData && markData.marks !== undefined && markData.marks !== null && markData.marks !== '') {
              enteredMarks++
            }
          })
        })
      }

      const completionPercentage = totalPossible > 0 
        ? Math.round((enteredMarks / totalPossible) * 100) 
        : 0

      // 3. Update DB
      const { error } = await supabase
        .from('exam_peer_tutor_summary')
        .upsert({
          exam_id: examId,
          peer_tutor_id: peerTutorId,
          ascend_score: ascendScore,
          completion_percentage: completionPercentage,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'exam_id, peer_tutor_id'
        })

      if (error) {
        logger.error('Error updating exam summary:', error)
      }

    } catch (error) {
      logger.error('Error in ExamSummaryService.updateSummary:', error)
    }
  }

  /**
   * Get summaries for an exam
   */
  static async getSummariesForExam(examId: string): Promise<ExamPeerTutorSummary[]> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('exam_peer_tutor_summary')
        .select('*')
        .eq('exam_id', examId)
      
      if (error) {
        logger.error('Error fetching exam summaries:', error)
        return []
      }
      
      return data as ExamPeerTutorSummary[]
    } catch (error) {
      logger.error('Error in getSummariesForExam:', error)
      return []
    }
  }
}
