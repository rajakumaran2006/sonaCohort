import { createClient } from '@/utils/supabase/client'
import { FeedbackVersioningService, FeedbackFormVersion, FormEditStrategy } from './feedbackVersioningService'

export interface FeedbackForm {
  id: string
  name: string
  description?: string
  faculty_id: string
  is_active: boolean
  created_at: string
  updated_at: string
  questions: FeedbackQuestion[]
  // Versioning support
  current_version?: FeedbackFormVersion
  total_versions?: number
  edit_strategy?: FormEditStrategy
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

export interface FeedbackAnswerWithDetails extends FeedbackAnswer {
  question?: {
    question_text: string
    question_type: string
  }
}

export interface FeedbackResponseWithDetails extends FeedbackResponse {
  student: {
    id: string
    name: string
    email: string
    year: string
    section: string
    assigned_peer_tutor?: {
      id: string
      name: string
      email: string
    } | null
  }
  feedback_form: {
    id: string
    name: string
  }
  responses: FeedbackAnswerWithDetails[]
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
   * Get all feedback forms for a faculty with versioning support
   */
  static async getFeedbackFormsByFaculty(facultyId: string): Promise<FeedbackForm[]> {
    try {
      const supabase = createClient()
      
      console.log('getFeedbackFormsByFaculty called with facultyId:', facultyId)
      console.log('facultyId type:', typeof facultyId)
      console.log('facultyId length:', facultyId?.length)
      
      // Validate faculty ID parameter
      if (!facultyId || typeof facultyId !== 'string' || facultyId.trim() === '') {
        console.error('Invalid faculty ID parameter:', facultyId)
        return []
      }
      
      // First try the new versioning schema
      try {
        // Test if feedback_forms table exists by doing a simple count query
        const { count, error: countError } = await supabase
          .from('feedback_forms')
          .select('*', { count: 'exact', head: true })
          .eq('faculty_id', facultyId.trim())
        
        if (countError) {
          console.log('feedback_forms table test failed, falling back to legacy schema. Error:', countError)
          console.log('Count error details:', {
            message: countError.message || 'Unknown error',
            details: countError.details || 'No details available',
            hint: countError.hint || 'No hint available',
            code: countError.code || 'No code available'
          })
          throw countError
        }
        
        console.log('feedback_forms table accessible, count:', count)
        
        const { data, error } = await supabase
          .from('feedback_forms')
          .select(`
            *,
            current_version:feedback_form_versions!inner (
              *,
              questions:feedback_question_versions (
                *
              )
            )
          `)
          .eq('faculty_id', facultyId.trim())
          .eq('current_version.is_active', true)
          .order('created_at', { ascending: false })

        if (!error && data) {
          // Transform data to include versioning information
          const formsWithVersioning = await Promise.all(
            data.map(async (form) => {
              try {
                const stats = await FeedbackVersioningService.getFormStats(form.id)
                return {
                  ...form,
                  questions: form.current_version?.questions || [],
                  current_version: form.current_version,
                  total_versions: stats.totalVersions
                } as FeedbackForm
              } catch (statsError) {
                console.log('Error getting form stats, using defaults:', statsError)
                return {
                  ...form,
                  questions: form.current_version?.questions || [],
                  current_version: form.current_version,
                  total_versions: 1
                } as FeedbackForm
              }
            })
          )
          return formsWithVersioning
        } else if (error) {
          console.log('Versioning query failed, falling back to legacy schema. Error:', error)
          throw error // This will trigger the catch block below
        }
      } catch (versioningError) {
        console.log('Versioning tables not available, falling back to legacy schema. Error:', versioningError)
      }

      // Fallback to legacy schema
      console.log('Using legacy schema fallback')
      const { data, error } = await supabase
        .from('feedback_forms')
        .select(`
          *,
          questions:feedback_questions (
            *
          )
        `)
        .eq('faculty_id', facultyId.trim())
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error getting feedback forms (legacy schema):', error)
        console.error('Error details:', {
          message: error.message || 'Unknown error',
          details: error.details || 'No details available',
          hint: error.hint || 'No hint available',
          code: error.code || 'No code available'
        })
        return []
      }

      // Transform legacy data to match new interface
      return (data || []).map(form => ({
        ...form,
        questions: form.questions || [],
        current_version: undefined,
        total_versions: 1
      })) as FeedbackForm[]

    } catch (error) {
      console.error('Error in getFeedbackFormsByFaculty:', error)
      console.error('Error type:', typeof error)
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
      console.error('Faculty ID parameter:', facultyId)
      return []
    }
  }

  /**
   * Get active feedback forms for students with versioning support
   */
  static async getActiveFeedbackForms(): Promise<FeedbackForm[]> {
    try {
      const supabase = createClient()
      
      // First try the new versioning schema
      try {
        const { data, error } = await supabase
          .from('feedback_forms')
          .select(`
            *,
            current_version:feedback_form_versions!inner (
              *,
              questions:feedback_question_versions (
                *
              )
            )
          `)
          .eq('is_active', true)
          .eq('current_version.is_active', true)
          .order('created_at', { ascending: false })

        if (!error && data) {
          return data.map(form => ({
            ...form,
            questions: form.current_version?.questions || []
          })) as FeedbackForm[]
        }
      } catch {
        console.log('Versioning tables not available, falling back to legacy schema')
      }

      // Fallback to legacy schema
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

      return (data || []).map(form => ({
        ...form,
        questions: form.questions || []
      })) as FeedbackForm[]
    } catch (error) {
      console.error('Error in getActiveFeedbackForms:', error)
      return []
    }
  }

  /**
   * Update feedback form with versioning support
   */
  static async updateFeedbackForm(
    formId: string,
    updates: Partial<Pick<FeedbackForm, 'name' | 'description' | 'is_active'>>,
    questions?: Omit<FeedbackQuestion, 'id' | 'feedback_form_id' | 'created_at'>[]
  ): Promise<{ success: boolean; strategy: FormEditStrategy; newVersion?: FeedbackFormVersion }> {
    try {
      const supabase = createClient()
      
      // If only updating is_active (status toggle), bypass versioning completely
      if (updates.is_active !== undefined && !updates.name && !updates.description && !questions) {
        console.log('Performing simple status update without versioning')
        const { error } = await supabase
          .from('feedback_forms')
          .update({
            is_active: updates.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', formId)

        if (error) {
          console.error('Error updating feedback form status:', error)
          return { 
            success: false, 
            strategy: {
              type: 'require_confirmation',
              reason: 'Error during status update',
              canProceed: false,
              warnings: ['An error occurred during the status update']
            }
          }
        }

        return { 
          success: true, 
          strategy: {
            type: 'update_current',
            reason: 'Simple status toggle',
            canProceed: true,
            warnings: []
          }
        }
      }
      
      // Check if versioning is available for other updates
      try {
        // Determine edit strategy
        const strategy = await FeedbackVersioningService.getEditStrategy(formId, {
          name: updates.name,
          description: updates.description,
          questions
        })

        if (!strategy.canProceed) {
          return { success: false, strategy }
        }

        if (strategy.type === 'create_new_version' && questions) {
          // Create new version with questions
          const newVersion = await FeedbackVersioningService.createNewFormVersion(
            formId,
            updates.name || '',
            updates.description || '',
            questions.map((q, index) => ({
              question_text: q.question_text,
              question_type: q.question_type,
              is_required: q.is_required,
              order_index: index + 1,
              options: q.options
            }))
          )

          if (newVersion) {
            return { success: true, strategy, newVersion }
          } else {
            return { success: false, strategy }
          }
        } else {
          // Update current version (metadata only)
          const success = await FeedbackVersioningService.updateCurrentFormVersion(formId, {
            name: updates.name,
            description: updates.description
          })

          return { success, strategy }
        }
      } catch {
        console.log('Versioning not available, using legacy update method')
      }

      // Fallback to legacy update method
      const { error } = await supabase
        .from('feedback_forms')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', formId)

      if (error) {
        console.error('Error updating feedback form:', error)
        return { 
          success: false, 
          strategy: {
            type: 'require_confirmation',
            reason: 'Error during update',
            canProceed: false,
            warnings: ['An error occurred during the update process']
          }
        }
      }

      return { 
        success: true, 
        strategy: {
          type: 'update_current',
          reason: 'Legacy update method used',
          canProceed: true,
          warnings: []
        }
      }
    } catch (error) {
      console.error('Error in updateFeedbackForm:', error)
      return { 
        success: false, 
        strategy: {
          type: 'require_confirmation',
          reason: 'Error during update',
          canProceed: false,
          warnings: ['An error occurred during the update process']
        }
      }
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
   * Submit feedback response with versioning support
   */
  static async submitFeedbackResponse(
    formId: string,
    studentId: string,
    answers: Omit<FeedbackAnswer, 'id' | 'feedback_response_id' | 'created_at'>[]
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Try versioning approach first
      try {
        // Get current active version
        const currentVersion = await FeedbackVersioningService.getCurrentFormVersion(formId)
        if (currentVersion) {
          // Create the response with version reference
          const { data: responseData, error: responseError } = await supabase
            .from('feedback_responses')
            .insert({
              feedback_form_id: formId,
              feedback_form_version_id: currentVersion.id,
              student_id: studentId,
              submitted_at: new Date().toISOString()
            })
            .select()
            .single()

          if (responseError) {
            // If error is about missing column, fall back to legacy method
            const errorCode = responseError.code || ''
            if (errorCode === 'PGRST204' || errorCode === '42P01' || 
                responseError.message?.includes('does not exist') ||
                responseError.message?.includes('column') && responseError.message?.includes('not found')) {
              console.log('Versioning column not found, falling back to legacy method')
              throw new Error('Versioning not available')
            }
            console.error('Error creating feedback response:', responseError)
            return false
          }

          // Create the answers with version reference
          const answersWithResponseId = answers.map(answer => {
            // Find the corresponding question version
            const questionVersion = currentVersion.questions.find(q => q.original_question_id === answer.question_id)
            
            // Base answer object
            const baseAnswer = {
              feedback_response_id: responseData.id,
              question_id: answer.question_id,
              question_version_id: questionVersion?.id || answer.question_id
            }

            // Add appropriate fields based on answer type
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
              return {
                ...baseAnswer,
                answer_text: '',
                selected_option: null,
                star_rating: null
              }
            }
          })

          const { error: answersError } = await supabase
            .from('feedback_answers')
            .insert(answersWithResponseId)
            .select()

          if (answersError) {
            // If error is about missing column, fall back to legacy method
            const errorCode = answersError.code || ''
            if (errorCode === 'PGRST204' || errorCode === '42P01' || 
                answersError.message?.includes('does not exist') ||
                answersError.message?.includes('column') && answersError.message?.includes('not found')) {
              console.log('Versioning column not found in answers, falling back to legacy method')
              await supabase.from('feedback_responses').delete().eq('id', responseData.id)
              throw new Error('Versioning not available')
            }
            console.error('Error creating feedback answers:', answersError)
            await supabase.from('feedback_responses').delete().eq('id', responseData.id)
            return false
          }

          return true
        }
      } catch {
        console.log('Versioning not available, using legacy response method')
      }

      // Fallback to legacy method
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
        return false
      }

      // Create the answers
      const answersWithResponseId = answers.map(answer => {
        const baseAnswer = {
          feedback_response_id: responseData.id,
          question_id: answer.question_id
        }

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
          return {
            ...baseAnswer,
            answer_text: '',
            selected_option: null,
            star_rating: null
          }
        }
      })

      const { error: answersError } = await supabase
        .from('feedback_answers')
        .insert(answersWithResponseId)
        .select()

      if (answersError) {
        console.error('Error creating feedback answers:', answersError)
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
            section,
            assigned_peer_tutor:assigned_peer_tutor_id (
              id,
              name,
              email
            )
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
   * Get a specific feedback form by ID
   */
  static async getFeedbackFormById(formId: string): Promise<FeedbackForm | null> {
    try {
      const supabase = createClient()
      
      console.log('getFeedbackFormById called with formId:', formId)
      
      // Validate form ID parameter
      if (!formId || typeof formId !== 'string' || formId.trim() === '') {
        console.error('Invalid form ID parameter:', formId)
        return null
      }
      
      // Try versioning schema first
      try {
        const { data, error } = await supabase
          .from('feedback_forms')
          .select(`
            *,
            current_version:feedback_form_versions!inner (
              *,
              questions:feedback_question_versions (
                *
              )
            )
          `)
          .eq('id', formId.trim())
          .eq('current_version.is_active', true)
          .single()

        if (!error && data) {
          console.log('Found form with versioning schema:', data)
          return {
            ...data,
            questions: data.current_version?.questions || [],
            current_version: data.current_version,
            total_versions: 1 // Default for now
          } as FeedbackForm
        } else if (error) {
          console.log('Versioning query failed, falling back to legacy schema. Error:', error)
          throw error
        }
      } catch (versioningError) {
        console.log('Versioning tables not available, falling back to legacy schema. Error:', versioningError)
      }

      // Fallback to legacy schema
      console.log('Using legacy schema fallback for getFeedbackFormById')
      const { data, error } = await supabase
        .from('feedback_forms')
        .select(`
          *,
          questions:feedback_questions (
            *
          )
        `)
        .eq('id', formId.trim())
        .single()

      if (error) {
        console.error('Error getting feedback form by ID (legacy schema):', error)
        console.error('Error details:', {
          message: error.message || 'Unknown error',
          details: error.details || 'No details available',
          hint: error.hint || 'No hint available',
          code: error.code || 'No code available'
        })
        return null
      }

      if (!data) {
        console.log('No form found with ID:', formId)
        return null
      }

      console.log('Found form with legacy schema:', data)
      return {
        ...data,
        questions: data.questions || [],
        current_version: undefined,
        total_versions: 1
      } as FeedbackForm

    } catch (error) {
      console.error('Error in getFeedbackFormById:', error)
      console.error('Error type:', typeof error)
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
      console.error('Form ID parameter:', formId)
      return null
    }
  }

  /**
   * Get edit strategy for a form
   */
  static async getFormEditStrategy(
    formId: string,
    proposedChanges: {
      name?: string
      description?: string
      questions?: Omit<FeedbackQuestion, 'id' | 'feedback_form_id' | 'created_at'>[]
    }
  ): Promise<FormEditStrategy> {
    return await FeedbackVersioningService.getEditStrategy(formId, proposedChanges)
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
      
      // Get the form to find the faculty_id
      const { data: form, error: formError } = await supabase
        .from('feedback_forms')
        .select('faculty_id')
        .eq('id', formId)
        .single()
        
      if (formError || !form) {
        console.error('Error getting form details for stats:', formError)
        return { totalResponses: 0, totalStudents: 0, responseRate: 0 }
      }

      // Get total responses
      const { count: responseCount, error: responseError } = await supabase
        .from('feedback_responses')
        .select('*', { count: 'exact', head: true })
        .eq('feedback_form_id', formId)

      if (responseError) {
        console.error('Error getting response count:', responseError)
        return { totalResponses: 0, totalStudents: 0, responseRate: 0 }
      }

      // Get total students with assigned peer tutors for this faculty
      const { count: studentCount, error: studentError } = await supabase
        .from('peer_students')
        .select('*', { count: 'exact', head: true })
        .eq('faculty_id', form.faculty_id)
        .eq('peer_tutor', false)
        .not('assigned_peer_tutor_id', 'is', null)

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
