import { createClient } from '@/utils/supabase/client'

export interface ExamRequest {
  id: string
  exam_name: string
  faculty_id: string
  target_years: string[]
  status: 'active' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
}

export interface ExamSubmission {
  id: string
  exam_request_id: string
  peer_tutor_id: string
  subject_name: string
  student_id: string
  marks: string
  submitted_at: string
}

export interface ExamSubmissionData {
  subject_name: string
  student_marks: { [studentId: string]: string }
}

export class ExamService {
  /**
   * Create a new exam request
   */
  static async createExamRequest(
    examName: string, 
    facultyId: string, 
    targetYears: string[]
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('exam_requests')
        .insert([{
          exam_name: examName,
          faculty_id: facultyId,
          target_years: targetYears,
          status: 'active'
        }])

      if (error) {
        console.error('Error creating exam request:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in createExamRequest:', error)
      return false
    }
  }

  /**
   * Get exam requests for faculty
   */
  static async getFacultyExamRequests(facultyId: string): Promise<ExamRequest[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('faculty_id', facultyId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error getting faculty exam requests:', error)
        return []
      }

      return data as ExamRequest[] || []
    } catch (error) {
      console.error('Error in getFacultyExamRequests:', error)
      return []
    }
  }

  /**
   * Get exam requests for peer tutors based on their year
   */
  static async getPeerTutorExamRequests(peerTutorYear: string): Promise<ExamRequest[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_requests')
        .select('*')
        .contains('target_years', [peerTutorYear])
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error getting peer tutor exam requests:', error)
        return []
      }

      return data as ExamRequest[] || []
    } catch (error) {
      console.error('Error in getPeerTutorExamRequests:', error)
      return []
    }
  }

  /**
   * Submit exam marks for students
   */
  static async submitExamMarks(
    examRequestId: string,
    peerTutorId: string,
    submissions: ExamSubmissionData[]
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Prepare submission data
      const submissionData: any[] = []
      
      submissions.forEach(submission => {
        Object.entries(submission.student_marks).forEach(([studentId, marks]) => {
          if (marks.trim()) { // Only submit if marks are provided
            submissionData.push({
              exam_request_id: examRequestId,
              peer_tutor_id: peerTutorId,
              subject_name: submission.subject_name,
              student_id: studentId,
              marks: marks.trim()
            })
          }
        })
      })

      if (submissionData.length === 0) {
        return true // No data to submit
      }

      // Delete existing submissions for this exam and peer tutor
      const { error: deleteError } = await supabase
        .from('exam_submissions')
        .delete()
        .eq('exam_request_id', examRequestId)
        .eq('peer_tutor_id', peerTutorId)

      if (deleteError) {
        console.error('Error deleting existing submissions:', deleteError)
        return false
      }

      // Insert new submissions
      const { error: insertError } = await supabase
        .from('exam_submissions')
        .insert(submissionData)

      if (insertError) {
        console.error('Error inserting exam submissions:', insertError)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in submitExamMarks:', error)
      return false
    }
  }

  /**
   * Get exam submissions for faculty
   */
  static async getExamSubmissions(examRequestId: string): Promise<any[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_submissions')
        .select(`
          *,
          peer_tutors(
            name,
            email
          ),
          peer_students(
            name,
            email
          )
        `)
        .eq('exam_request_id', examRequestId)
        .order('subject_name', { ascending: true })

      if (error) {
        console.error('Error getting exam submissions:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error in getExamSubmissions:', error)
      return []
    }
  }

  /**
   * Get student's exam results
   */
  static async getStudentExamResults(studentId: string): Promise<any[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('exam_submissions')
        .select(`
          *,
          exam_requests(
            exam_name,
            created_at
          )
        `)
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false })

      if (error) {
        console.error('Error getting student exam results:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error in getStudentExamResults:', error)
      return []
    }
  }
}
