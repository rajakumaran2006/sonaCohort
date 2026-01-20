import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

export interface FeedbackFormVersion {
  id: string
  feedback_form_id: string
  version_number: number
  name: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
  questions: FeedbackQuestionVersion[]
}

export interface FeedbackQuestionVersion {
  id: string
  feedback_form_version_id: string
  question_text: string
  question_type: 'multiple_choice' | 'text' | 'star_rating'
  is_required: boolean
  order_index: number
  options?: string[]
  created_at: string
  // Reference to original question for tracking changes
  original_question_id?: string
}

export interface FeedbackResponse {
  id: string
  feedback_form_id: string
  feedback_form_version_id: string
  student_id: string
  submitted_at: string
  responses: FeedbackAnswer[]
}

export interface FeedbackAnswer {
  id: string
  feedback_response_id: string
  question_id: string
  question_version_id: string
  answer_text?: string
  selected_option?: string
  star_rating?: number
  created_at: string
}

export interface FormEditStrategy {
  type: 'create_new_version' | 'update_current' | 'require_confirmation'
  reason: string
  canProceed: boolean
  warnings: string[]
}

export class FeedbackVersioningService {
  /**
   * Check if versioning tables exist and are available
   */
  static async isVersioningAvailable(): Promise<boolean> {
    try {
      const supabase = createClient()
      // Try to query versioning table to see if it exists
      const { error } = await supabase
        .from('feedback_form_versions')
        .select('id')
        .limit(1)
      
      // If error code is about missing table/column, versioning is not available
      if (error) {
        const errorCode = error.code || ''
        // PGRST204 = column not found, 42P01 = relation does not exist
        if (errorCode === 'PGRST204' || errorCode === '42P01' || error.message?.includes('does not exist')) {
          return false
        }
      }
      return !error
    } catch {
      return false
    }
  }

  /**
   * Determine the best strategy for editing a form based on existing responses
   */
  static async getEditStrategy(
    formId: string,
    proposedChanges: {
      name?: string
      description?: string
      questions?: Omit<FeedbackQuestionVersion, 'id' | 'feedback_form_version_id' | 'created_at'>[]
    }
  ): Promise<FormEditStrategy> {
    try {
      const supabase = createClient()
      
      // Check if form has responses
      const { count: responseCount, error: responseError } = await supabase
        .from('feedback_responses')
        .select('*', { count: 'exact', head: true })
        .eq('feedback_form_id', formId)

      if (responseError) {
        logger.error('Error checking responses:', responseError)
        return {
          type: 'require_confirmation',
          reason: 'Unable to determine form status',
          canProceed: false,
          warnings: ['Could not verify form status']
        }
      }

      const hasResponses = (responseCount || 0) > 0

      if (!hasResponses) {
        // No responses - safe to edit directly
        return {
          type: 'update_current',
          reason: 'No existing responses',
          canProceed: true,
          warnings: []
        }
      }

      // Has responses - analyze the type of changes
      const warnings: string[] = []
      let requiresNewVersion = false

      // Check if questions are being modified
      if (proposedChanges.questions) {
        const currentForm = await this.getCurrentFormVersion(formId)
        if (currentForm) {
          const questionChanges = this.analyzeQuestionChanges(
            currentForm.questions,
            proposedChanges.questions
          )
          
          if (questionChanges.hasStructuralChanges) {
            requiresNewVersion = true
            warnings.push('Question structure has changed - will create new version')
          }
          
          if (questionChanges.hasContentChanges) {
            warnings.push('Question content has been modified')
          }
        }
      }

      if (requiresNewVersion) {
        return {
          type: 'create_new_version',
          reason: 'Structural changes detected with existing responses',
          canProceed: true,
          warnings
        }
      }

      // Only metadata changes - can update current version
      return {
        type: 'update_current',
        reason: 'Only metadata changes detected',
        canProceed: true,
        warnings: ['Form has existing responses - only metadata will be updated']
      }

    } catch (error) {
      logger.error('Error in getEditStrategy:', error)
      return {
        type: 'require_confirmation',
        reason: 'Error analyzing changes',
        canProceed: false,
        warnings: ['Unable to analyze proposed changes']
      }
    }
  }

  /**
   * Get the current active version of a form
   */
  static async getCurrentFormVersion(formId: string): Promise<FeedbackFormVersion | null> {
    try {
      const supabase = createClient()
      
      logger.info('getCurrentFormVersion called with formId:', formId)
      
      // Validate form ID parameter
      if (!formId || typeof formId !== 'string' || formId.trim() === '') {
        logger.error('Invalid form ID parameter:', formId)
        return null
      }
      
      // Check if versioning is available first
      const versioningAvailable = await this.isVersioningAvailable()
      if (!versioningAvailable) {
        logger.info('Versioning tables not available, returning null')
        return null
      }
      
      // Try to get versioning data
      const { data, error } = await supabase
        .from('feedback_form_versions')
        .select(`
          *,
          questions:feedback_question_versions (
            *
          )
        `)
        .eq('feedback_form_id', formId.trim())
        .eq('is_active', true)
        .order('version_number', { ascending: false })
        .limit(1)
        .single()

      if (!error && data) {
        logger.info('Found versioning data for form:', formId)
        return data as FeedbackFormVersion
      } else if (error) {
        logger.info('No active version found for form:', formId, 'Error:', error)
        return null
      }

      return null
    } catch (error) {
      logger.error('Error in getCurrentFormVersion:', error)
      logger.error('Error type:', typeof error)
      logger.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
      logger.error('Form ID parameter:', formId)
      return null
    }
  }

  /**
   * Create a new version of a feedback form
   */
  static async createNewFormVersion(
    formId: string,
    name: string,
    description: string,
    questions: Omit<FeedbackQuestionVersion, 'id' | 'feedback_form_version_id' | 'created_at'>[]
  ): Promise<FeedbackFormVersion | null> {
    try {
      const supabase = createClient()
      
      // Get next version number
      const { data: versionData } = await supabase
        .from('feedback_form_versions')
        .select('version_number')
        .eq('feedback_form_id', formId)
        .order('version_number', { ascending: false })
        .limit(1)
        .single()

      const nextVersion = versionData ? versionData.version_number + 1 : 1

      // Deactivate current version
      await supabase
        .from('feedback_form_versions')
        .update({ is_active: false })
        .eq('feedback_form_id', formId)
        .eq('is_active', true)

      // Create new version
      const { data: newVersionData, error: newVersionError } = await supabase
        .from('feedback_form_versions')
        .insert({
          feedback_form_id: formId,
          version_number: nextVersion,
          name,
          description,
          is_active: true
        })
        .select()
        .single()

      if (newVersionError) {
        logger.error('Error creating new form version:', newVersionError)
        return null
      }

      // Create question versions
      const questionsWithVersionId = questions.map((question, index) => ({
        ...question,
        feedback_form_version_id: newVersionData.id,
        order_index: index + 1
      }))

      const { data: questionsData, error: questionsError } = await supabase
        .from('feedback_question_versions')
        .insert(questionsWithVersionId)
        .select()

      if (questionsError) {
        logger.error('Error creating question versions:', questionsError)
        // Clean up the version if questions creation failed
        await supabase.from('feedback_form_versions').delete().eq('id', newVersionData.id)
        return null
      }

      return {
        ...newVersionData,
        questions: questionsData
      } as FeedbackFormVersion

    } catch (error) {
      logger.error('Error in createNewFormVersion:', error)
      return null
    }
  }

  /**
   * Update current form version (metadata only)
   */
  static async updateCurrentFormVersion(
    formId: string,
    updates: Partial<Pick<FeedbackFormVersion, 'name' | 'description'>>
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('feedback_form_versions')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('feedback_form_id', formId)
        .eq('is_active', true)

      if (error) {
        logger.error('Error updating form version:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in updateCurrentFormVersion:', error)
      return false
    }
  }

  /**
   * Analyze changes between current and proposed questions
   */
  private static analyzeQuestionChanges(
    currentQuestions: FeedbackQuestionVersion[],
    proposedQuestions: Omit<FeedbackQuestionVersion, 'id' | 'feedback_form_version_id' | 'created_at'>[]
  ): { hasStructuralChanges: boolean; hasContentChanges: boolean } {
    const hasStructuralChanges = 
      currentQuestions.length !== proposedQuestions.length ||
      currentQuestions.some((current, index) => {
        const proposed = proposedQuestions[index]
        return !proposed || 
               current.question_type !== proposed.question_type ||
               current.is_required !== proposed.is_required
      })

    const hasContentChanges = currentQuestions.some((current, index) => {
      const proposed = proposedQuestions[index]
      return proposed && (
        current.question_text !== proposed.question_text ||
        JSON.stringify(current.options || []) !== JSON.stringify(proposed.options || [])
      )
    })

    return { hasStructuralChanges, hasContentChanges }
  }

  /**
   * Get all versions of a form
   */
  static async getFormVersions(formId: string): Promise<FeedbackFormVersion[]> {
    try {
      const supabase = createClient()
      
      logger.info('getFormVersions called with formId:', formId)
      
      // Try versioning approach first
      try {
        const { data, error } = await supabase
          .from('feedback_form_versions')
          .select(`
            *,
            questions:feedback_question_versions (
              *
            )
          `)
          .eq('feedback_form_id', formId.trim())
          .order('version_number', { ascending: false })

        if (!error && data) {
          logger.info('Found versioning data for form:', formId)
          return data as FeedbackFormVersion[]
        } else if (error) {
          logger.info('Versioning query failed, versioning tables may not exist. Error:', error)
          throw error
        }
      } catch {
        logger.info('Versioning tables not available, creating fallback version data')
      }

      // Fallback: Create a mock version from the legacy form data
      try {
        const { data: formData, error: formError } = await supabase
          .from('feedback_forms')
          .select(`
            *,
            questions:feedback_questions (
              *
            )
          `)
          .eq('id', formId.trim())
          .single()

        if (formError) {
          logger.error('Error getting legacy form data:', formError)
          return []
        }

        if (!formData) {
          logger.info('No form found with ID:', formId)
          return []
        }

        // Create a mock version object from legacy data
        const mockVersion: FeedbackFormVersion = {
          id: formData.id,
          feedback_form_id: formData.id,
          version_number: 1,
          name: formData.name,
          description: formData.description,
          is_active: true,
          created_at: formData.created_at,
          updated_at: formData.updated_at,
          questions: (formData.questions || []).map((q: { id: string; question_text: string; question_type: 'multiple_choice' | 'text' | 'star_rating'; is_required: boolean; options?: string[]; created_at: string; updated_at?: string }, index: number) => ({
            id: q.id,
            feedback_form_version_id: formData.id,
            original_question_id: q.id,
            question_text: q.question_text,
            question_type: q.question_type,
            is_required: q.is_required,
            order_index: index + 1,
            options: q.options,
            created_at: q.created_at,
            updated_at: q.updated_at
          }))
        }

        logger.info('Created mock version data for form:', formId)
        return [mockVersion]
      } catch (legacyError) {
        logger.error('Error getting legacy form data:', legacyError)
        return []
      }

    } catch (error) {
      logger.error('Error in getFormVersions:', error)
      logger.error('Error type:', typeof error)
      logger.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
      logger.error('Form ID parameter:', formId)
      return []
    }
  }

  /**
   * Get form statistics including version information
   */
  static async getFormStats(formId: string): Promise<{
    totalVersions: number
    currentVersion: number
    totalResponses: number
    responsesByVersion: { [version: number]: number }
  }> {
    try {
      const supabase = createClient()
      
      logger.info('getFormStats called with formId:', formId)
      
      // Try versioning approach first
      try {
        // Get versions
        const versions = await this.getFormVersions(formId)
        const currentVersion = versions.find(v => v.is_active)?.version_number || 0

        // Get response counts by version
        const { data: responseData, error: responseError } = await supabase
          .from('feedback_responses')
          .select('feedback_form_version_id, version_number')
          .eq('feedback_form_id', formId)

        if (responseError) {
          logger.error('Error getting response stats:', responseError)
          return {
            totalVersions: versions.length,
            currentVersion,
            totalResponses: 0,
            responsesByVersion: {}
          }
        }

        const responsesByVersion: { [version: number]: number } = {}
        let totalResponses = 0

        responseData?.forEach(response => {
          const version = response.version_number || 1
          responsesByVersion[version] = (responsesByVersion[version] || 0) + 1
          totalResponses++
        })

        return {
          totalVersions: versions.length,
          currentVersion,
          totalResponses,
          responsesByVersion
        }
      } catch {
        logger.info('Versioning not available, using legacy stats calculation')
      }

      // Fallback to legacy approach
      try {
        // Get total responses for the form (legacy)
        const { count: totalResponses, error: responseError } = await supabase
          .from('feedback_responses')
          .select('*', { count: 'exact', head: true })
          .eq('feedback_form_id', formId)

        if (responseError) {
          logger.error('Error getting legacy response count:', responseError)
        }

        return {
          totalVersions: 1,
          currentVersion: 1,
          totalResponses: totalResponses || 0,
          responsesByVersion: { 1: totalResponses || 0 }
        }
      } catch (legacyError) {
        logger.error('Error in legacy stats calculation:', legacyError)
        return {
          totalVersions: 1,
          currentVersion: 1,
          totalResponses: 0,
          responsesByVersion: {}
        }
      }

    } catch (error) {
      logger.error('Error in getFormStats:', error)
      logger.error('Error type:', typeof error)
      logger.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
      logger.error('Form ID parameter:', formId)
      return {
        totalVersions: 1,
        currentVersion: 1,
        totalResponses: 0,
        responsesByVersion: {}
      }
    }
  }
}
