import { createClient } from '@/utils/supabase/client'

export interface FeedbackForm {
  id: string
  name: string
  description?: string
  faculty_id: string
  is_active: boolean
  created_at: string
  updated_at: string
  questions: FeedbackQuestion[]
}

export interface FeedbackQuestion {
  id: string
  feedback_form_id: string
  question_text: string
  question_type: 'multiple_choice' | 'text' | 'star_rating'
  is_required: boolean
  order_index: number
  options?: string[]
  created_at: string
}

export interface FeedbackResponse {
  id: string
  feedback_form_id: string
  student_id: string
  submitted_at: string
  responses: FeedbackAnswer[]
}

export interface FeedbackAnswer {
  id: string
  feedback_response_id: string
  question_id: string
  answer_text?: string
  selected_option?: string
  star_rating?: number
  created_at: string
}

export interface FeedbackResponseWithDetails extends FeedbackResponse {
  student: {
    id: string
    name: string
    email: string
    year: string
    section: string
  }
  feedback_form: {
    id: string
    name: string
  }
}

export class FeedbackService {
  /**
   * Create a new feedback form
   */
  static async createFeedbackForm(
    name: string,
    description: string,
    facultyId: string,
    questions: Omit<FeedbackQuestion, 'id' | 'feedback_form_id' | 'created_at'>[]
  ): Promise<FeedbackForm | null> {
    try {
      const supabase = createClient()
      
      // Create the feedback form
      const { data: formData, error: formError } = await supabase
        .from('feedback_forms')
        .insert({
          name,
          description,
          faculty_id: facultyId,
          is_active: true
        })
        .select()
        .single()

      if (formError) {
        console.error('Error creating feedback form:', formError)
        return null
      }

      // Create the questions
      const questionsWithFormId = questions.map((question, index) => ({
        ...question,
        feedback_form_id: formData.id,
        order_index: index + 1
      }))

      const { data: questionsData, error: questionsError } = await supabase
        .from('feedback_questions')
        .insert(questionsWithFormId)
        .select()

      if (questionsError) {
        console.error('Error creating feedback questions:', questionsError)
        // Clean up the form if questions creation failed
        await supabase.from('feedback_forms').delete().eq('id', formData.id)
        return null
      }

      return {
        ...formData,
        questions: questionsData
      } as FeedbackForm
    } catch (error) {
      console.error('Error in createFeedbackForm:', error)
      return null
    }
  }

  /**
   * Get all feedback forms for a faculty
   */
  static async getFeedbackFormsByFaculty(facultyId: string): Promise<FeedbackForm[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('feedback_forms')
        .select(`
          *,
          questions:feedback_questions (
            *
          )
        `)
        .eq('faculty_id', facultyId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error getting feedback forms:', error)
        return []
      }

      return data as FeedbackForm[] || []
    } catch (error) {
      console.error('Error in getFeedbackFormsByFaculty:', error)
      return []
    }
  }

  /**
   * Get active feedback forms for students
   */
  static async getActiveFeedbackForms(): Promise<FeedbackForm[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('feedback_forms')
        .select(`
          *,
          questions:feedback_questions (
            *
          )
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error getting active feedback forms:', error)
        return []
      }

      return data as FeedbackForm[] || []
    } catch (error) {
      console.error('Error in getActiveFeedbackForms:', error)
      return []
    }
  }

  /**
   * Update feedback form
   */
  static async updateFeedbackForm(
    formId: string,
    updates: Partial<Pick<FeedbackForm, 'name' | 'description' | 'is_active'>>
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('feedback_forms')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', formId)

      if (error) {
        console.error('Error updating feedback form:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in updateFeedbackForm:', error)
      return false
    }
  }

  /**
   * Delete feedback form
   */
  static async deleteFeedbackForm(formId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Delete questions first
      const { error: questionsError } = await supabase
        .from('feedback_questions')
        .delete()
        .eq('feedback_form_id', formId)

      if (questionsError) {
        console.error('Error deleting feedback questions:', questionsError)
        return false
      }

      // Delete responses
      const { error: responsesError } = await supabase
        .from('feedback_responses')
        .delete()
        .eq('feedback_form_id', formId)

      if (responsesError) {
        console.error('Error deleting feedback responses:', responsesError)
        return false
      }

      // Delete the form
      const { error: formError } = await supabase
        .from('feedback_forms')
        .delete()
        .eq('id', formId)

      if (formError) {
        console.error('Error deleting feedback form:', formError)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in deleteFeedbackForm:', error)
      return false
    }
  }

  /**
   * Submit feedback response
   */
  static async submitFeedbackResponse(
    formId: string,
    studentId: string,
    answers: Omit<FeedbackAnswer, 'id' | 'feedback_response_id' | 'created_at'>[]
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Create the response
      const { data: responseData, error: responseError } = await supabase
        .from('feedback_responses')
        .insert({
          feedback_form_id: formId,
          student_id: studentId,
          submitted_at: new Date().toISOString()
        })
        .select()
        .single()

      if (responseError) {
        console.error('Error creating feedback response:', responseError)
        console.error('Error details:', {
          code: responseError.code,
          message: responseError.message,
          details: responseError.details,
          hint: responseError.hint
        })
        return false
      }

      // Create the answers
      const answersWithResponseId = answers.map(answer => {
        // Base answer object
        const baseAnswer = {
          feedback_response_id: responseData.id,
          question_id: answer.question_id
        }

        // Add appropriate fields based on answer type
        // Ensure we only send the field that has a value
        if (answer.star_rating !== undefined && answer.star_rating !== null) {
          return {
            ...baseAnswer,
            star_rating: answer.star_rating,
            answer_text: null,
            selected_option: null
          }
        } else if (answer.selected_option !== undefined && answer.selected_option !== null && answer.selected_option !== '') {
          return {
            ...baseAnswer,
            selected_option: answer.selected_option,
            answer_text: null,
            star_rating: null
          }
        } else if (answer.answer_text !== undefined && answer.answer_text !== null && answer.answer_text !== '') {
          return {
            ...baseAnswer,
            answer_text: answer.answer_text,
            selected_option: null,
            star_rating: null
          }
        } else {
          // Fallback: send empty text if nothing else
          return {
            ...baseAnswer,
            answer_text: '',
            selected_option: null,
            star_rating: null
          }
        }
      })

      const { data: answersData, error: answersError } = await supabase
        .from('feedback_answers')
        .insert(answersWithResponseId)
        .select()

      if (answersError) {
        console.error('Error creating feedback answers:', answersError)
        console.error('Answers error details:', {
          code: answersError.code,
          message: answersError.message,
          details: answersError.details,
          hint: answersError.hint
        })
        // Clean up the response if answers creation failed
        await supabase.from('feedback_responses').delete().eq('id', responseData.id)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in submitFeedbackResponse:', error)
      return false
    }
  }

  /**
   * Get feedback responses for a form
   */
  static async getFeedbackResponses(formId: string): Promise<FeedbackResponseWithDetails[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('feedback_responses')
        .select(`
          *,
          student:student_id (
            id,
            name,
            email,
            year,
            section
          ),
          feedback_form:feedback_form_id (
            id,
            name
          ),
          responses:feedback_answers (
            *,
            question:question_id (
              question_text,
              question_type
            )
          )
        `)
        .eq('feedback_form_id', formId)
        .order('submitted_at', { ascending: false })

      if (error) {
        console.error('Error getting feedback responses:', error)
        return []
      }

      return data as FeedbackResponseWithDetails[] || []
    } catch (error) {
      console.error('Error in getFeedbackResponses:', error)
      return []
    }
  }

  /**
   * Check if student has already submitted feedback for a form
   */
  static async hasStudentSubmittedFeedback(formId: string, studentId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('feedback_responses')
        .select('id')
        .eq('feedback_form_id', formId)
        .eq('student_id', studentId)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error checking feedback submission:', error)
        return false
      }

      return !!data
    } catch (error) {
      console.error('Error in hasStudentSubmittedFeedback:', error)
      return false
    }
  }

  /**
   * Get feedback statistics for a form
   */
  static async getFeedbackStats(formId: string): Promise<{
    totalResponses: number
    totalStudents: number
    responseRate: number
  }> {
    try {
      const supabase = createClient()
      
      // Get total responses
      const { count: responseCount, error: responseError } = await supabase
        .from('feedback_responses')
        .select('*', { count: 'exact', head: true })
        .eq('feedback_form_id', formId)

      if (responseError) {
        console.error('Error getting response count:', responseError)
        return { totalResponses: 0, totalStudents: 0, responseRate: 0 }
      }

      // Get total students (assuming all students in the system can respond)
      const { count: studentCount, error: studentError } = await supabase
        .from('peer_students')
        .select('*', { count: 'exact', head: true })
        .eq('peer_tutor', false)

      if (studentError) {
        console.error('Error getting student count:', studentError)
        return { totalResponses: responseCount || 0, totalStudents: 0, responseRate: 0 }
      }

      const totalResponses = responseCount || 0
      const totalStudents = studentCount || 0
      const responseRate = totalStudents > 0 ? (totalResponses / totalStudents) * 100 : 0

      return {
        totalResponses,
        totalStudents,
        responseRate: Math.round(responseRate * 100) / 100
      }
    } catch (error) {
      console.error('Error in getFeedbackStats:', error)
      return { totalResponses: 0, totalStudents: 0, responseRate: 0 }
    }
  }
}
