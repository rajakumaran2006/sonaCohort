import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

export interface RenumerationField {
  id: string
  field_name: string
  field_type: 'text' | 'number' | 'date' | 'email' | 'phone' | 'dropdown'
  is_mandatory: boolean
  options?: string[] // For dropdown fields
  created_at: string
  updated_at: string
}

export interface RenumerationTemplate {
  id: string
  name: string
  description?: string
  faculty_id: string
  is_active: boolean
  fields: RenumerationField[]
  created_at: string
  updated_at: string
}

export interface peertutorsRenumeration {
  id: string
  peer_tutor_id: string
  template_id: string
  status: 'pending' | 'submitted' | 'approved' | 'rejected'
  field_responses: Record<string, string | number | boolean | null>
  submitted_at?: string
  approved_at?: string
  approved_by?: string
  created_at: string
  updated_at: string
  template?: RenumerationTemplate
  peer_tutor?: {
    id: string
    name: string
    email: string
    dept?: string
    year?: string
    section?: string
  }
}

export class RenumerationService {
  /**
   * Create a new renumeration template
   */
  static async createRenumerationTemplate(
    name: string,
    description: string,
    facultyId: string,
    fields: Omit<RenumerationField, 'id' | 'created_at' | 'updated_at'>[]
  ): Promise<{ template: RenumerationTemplate | null; error?: string }> {
    try {
      const supabase = createClient()
      
      // First create the template
      const { data: template, error: templateError } = await supabase
        .from('renumeration_templates')
        .insert({
          name,
          description,
          faculty_id: facultyId,
          is_active: true
        })
        .select()
        .single()

      if (templateError) {
        logger.error('Error creating renumeration template:', {
          message: templateError.message,
          details: templateError.details,
          hint: templateError.hint,
          code: templateError.code,
          fullError: templateError
        })
        return { template: null, error: templateError.message }
      }

      // Then create the fields
      const fieldsWithTemplateId = fields.map(field => ({
        template_id: template.id,
        field_name: field.field_name,
        field_type: field.field_type,
        is_mandatory: field.is_mandatory,
        options: field.field_type === 'dropdown' ? (field.options || []) : []
      }))

      logger.info('Creating fields for template:', {
        templateId: template.id,
        fieldsCount: fields.length,
        fieldsWithTemplateId
      })

      const { data: createdFields, error: fieldsError } = await supabase
        .from('renumeration_fields')
        .insert(fieldsWithTemplateId)
        .select()

      if (fieldsError) {
        logger.error('Error creating renumeration fields:', {
          message: fieldsError.message,
          details: fieldsError.details,
          hint: fieldsError.hint,
          code: fieldsError.code,
          fullError: fieldsError
        })
        // Clean up the template if fields creation failed
        await supabase.from('renumeration_templates').delete().eq('id', template.id)
        return { template: null, error: fieldsError.message }
      }

      logger.info('Fields created successfully:', {
        templateId: template.id,
        createdFields,
        fieldsCount: createdFields?.length || 0
      })

      return {
        template: {
          ...template,
          fields: createdFields || []
        }
      }
    } catch (error) {
      logger.error('Error in createRenumerationTemplate:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        fullError: error
      })
      return { template: null, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Update a renumeration template's active status (open/closed)
   */
  static async updateTemplateStatus(templateId: string, isActive: boolean): Promise<boolean> {
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('renumeration_templates')
        .update({ is_active: isActive })
        .eq('id', templateId)

      if (error) {
        logger.error('Error updating template status:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in updateTemplateStatus:', error)
      return false
    }
  }

  /**
   * Send renumeration to all peer tutors
   */
  static async sendRenumerationToAllpeerTutor(templateId: string, facultyId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = createClient()
      
      // Get all peer tutors for this faculty
      const { data: peerTutor, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('id')
        .eq('faculty_id', facultyId)

      if (tutorsError) {
        logger.error('Error getting peer tutors:', tutorsError)
        return { success: false, error: tutorsError.message }
      }

      if (!peerTutor || peerTutor.length === 0) {
        logger.info('No peer tutors found for this faculty')
        return { success: true }
      }

      // Create renumeration records for all peer tutors
      const renumerationRecords = peerTutor.map(tutor => ({
        peer_tutor_id: tutor.id,
        template_id: templateId,
        status: 'pending',
        field_responses: {}
      }))

      const { error: insertError } = await supabase
        .from('peer_tutor_renumerations')
        .insert(renumerationRecords)

      if (insertError) {
        logger.error('Error creating renumeration records:', insertError)
        return { success: false, error: insertError.message }
      }

      return { success: true }
    } catch (error) {
      logger.error('Error in sendRenumerationToAllpeerTutor:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Get all renumeration templates for a faculty
   */
  static async getRenumerationTemplates(facultyId: string): Promise<RenumerationTemplate[]> {
    try {
      const supabase = createClient()
      
      const { data: templates, error: templatesError } = await supabase
        .from('renumeration_templates')
        .select(`
          *,
          fields:renumeration_fields(*)
        `)
        .eq('faculty_id', facultyId)
        .order('created_at', { ascending: false })

      if (templatesError) {
        logger.error('Error getting renumeration templates:', templatesError)
        return []
      }

      return templates || []
    } catch (error) {
      logger.error('Error in getRenumerationTemplates:', error)
      return []
    }
  }

  /**
   * Get renumeration submissions for a faculty
   */
  static async getRenumerationSubmissions(facultyId: string): Promise<peertutorsRenumeration[]> {
    try {
      const supabase = createClient()
      
      // First get all renumeration templates for this faculty with fields
      const { data: templates, error: templatesError } = await supabase
        .from('renumeration_templates')
        .select(`
          *,
          fields:renumeration_fields(*)
        `)
        .eq('faculty_id', facultyId)

      if (templatesError) {
        logger.error('Error getting renumeration templates:', {
          message: templatesError.message,
          details: templatesError.details,
          hint: templatesError.hint,
          code: templatesError.code,
          fullError: templatesError
        })
        return []
      }

      if (!templates || templates.length === 0) {
        return []
      }

      const templateIds = templates.map(t => t.id)
      
      // Create a map of templates by ID for efficient lookup
      const templateMap = new Map(templates.map(t => [t.id, t]))

      // Then get submissions for these templates
      const { data: submissions, error: submissionsError } = await supabase
        .from('peer_tutor_renumerations')
        .select('*')
        .in('template_id', templateIds)
        .order('created_at', { ascending: false })

      if (submissionsError) {
        logger.error('Error getting renumeration submissions:', {
          message: submissionsError.message,
          details: submissionsError.details,
          hint: submissionsError.hint,
          code: submissionsError.code,
          fullError: submissionsError
        })
        return []
      }

      // Enrich submissions with template and peer tutor details
      const enrichedSubmissions = await Promise.all(
        (submissions || []).map(async (submission) => {
          // Get template from our map (no additional query needed)
          const template = templateMap.get(submission.template_id)

          // Get peer tutor details (note: this might fail due to schema mismatch)
          let peertutors = null
          try {
            const { data: tutor } = await supabase
              .from('peer_tutors')
              .select('id, name, email, dept, year, section')
              .eq('id', submission.peer_tutor_id)
              .single()
            peertutors = tutor
          } catch (error) {
            logger.warn('Could not fetch peer tutor details:', error)
          }

          return {
            ...submission,
            template,
            peer_tutor: peertutors
          }
        })
      )

      return enrichedSubmissions
    } catch (error) {
      logger.error('Error in getRenumerationSubmissions:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        fullError: error
      })
      return []
    }
  }

  /**
   * Get renumeration for a specific peer tutor
   */
  static async getpeertutorsRenumeration(peertutorsId: string): Promise<peertutorsRenumeration[]> {
    try {
      const supabase = createClient()
      
      const { data: renumeration, error: renumerationError } = await supabase
        .from('peer_tutor_renumerations')
        .select('*')
        .eq('peer_tutor_id', peertutorsId)
        .order('created_at', { ascending: false })

      if (renumerationError) {
        logger.error('Error getting peer tutor renumeration:', {
          message: renumerationError.message,
          details: renumerationError.details,
          hint: renumerationError.hint,
          code: renumerationError.code,
          fullError: renumerationError
        })
        return []
      }

      // Get template details separately
      const enrichedRenumerations = await Promise.all(
        (renumeration || []).map(async (renum) => {
          // Get template with fields
          const { data: template } = await supabase
            .from('renumeration_templates')
            .select(`
              *,
              fields:renumeration_fields(*)
            `)
            .eq('id', renum.template_id)
            .single()

          return {
            ...renum,
            template
          }
        })
      )

      return enrichedRenumerations
    } catch (error) {
      logger.error('Error in getpeertutorsRenumeration:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        fullError: error
      })
      return []
    }
  }

  /**
   * Submit renumeration response by peer tutor
   */
  static async submitRenumerationResponse(
    renumerationId: string,
    fieldResponses: Record<string, string | number | boolean | null>
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('peer_tutor_renumerations')
        .update({
          status: 'submitted',
          field_responses: fieldResponses,
          submitted_at: new Date().toISOString()
        })
        .eq('id', renumerationId)

      if (error) {
        logger.error('Error submitting renumeration response:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in submitRenumerationResponse:', error)
      return false
    }
  }

  /**
   * Approve or reject renumeration by faculty
   */
  static async updateRenumerationStatus(
    renumerationId: string,
    status: 'approved' | 'rejected',
    approvedBy: string
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('peer_tutor_renumerations')
        .update({
          status,
          approved_at: new Date().toISOString(),
          approved_by: approvedBy
        })
        .eq('id', renumerationId)

      if (error) {
        logger.error('Error updating renumeration status:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in updateRenumerationStatus:', error)
      return false
    }
  }

  /**
   * Delete renumeration response by peer tutor
   */
  static async deleteRenumerationResponse(renumerationId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('peer_tutor_renumerations')
        .delete()
        .eq('id', renumerationId)

      if (error) {
        logger.error('Error deleting renumeration response:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          fullError: error
        })
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in deleteRenumerationResponse:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        fullError: error
      })
      return false
    }
  }

  /**
   * Delete renumeration template
   */
  static async deleteRenumerationTemplate(templateId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Delete associated renumeration records first
      await supabase
        .from('peer_tutor_renumerations')
        .delete()
        .eq('template_id', templateId)

      // Delete fields
      await supabase
        .from('renumeration_fields')
        .delete()
        .eq('template_id', templateId)

      // Delete template
      const { error } = await supabase
        .from('renumeration_templates')
        .delete()
        .eq('id', templateId)

      if (error) {
        logger.error('Error deleting renumeration template:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in deleteRenumerationTemplate:', error)
      return false
    }
  }

  /**
   * Get renumeration submissions for a specific template
   */
  static async getRenumerationSubmissionsByTemplate(templateId: string): Promise<peertutorsRenumeration[]> {
    try {
      const supabase = createClient()
      
      // Get submissions for the specific template
      const { data: submissions, error: submissionsError } = await supabase
        .from('peer_tutor_renumerations')
        .select('*')
        .eq('template_id', templateId)
        .order('created_at', { ascending: false })

      if (submissionsError) {
        logger.error('Error getting renumeration submissions by template:', {
          message: submissionsError.message,
          details: submissionsError.details,
          hint: submissionsError.hint,
          code: submissionsError.code,
          fullError: submissionsError
        })
        return []
      }

      // Get template details with fields
      const { data: template, error: templateError } = await supabase
        .from('renumeration_templates')
        .select(`
          *,
          fields:renumeration_fields(*)
        `)
        .eq('id', templateId)
        .single()

      if (templateError) {
        logger.error('Error getting template details:', {
          message: templateError.message,
          details: templateError.details,
          hint: templateError.hint,
          code: templateError.code,
          fullError: templateError
        })
      }

      // Get peer tutor details for each submission
      const enrichedSubmissions = await Promise.all(
        (submissions || []).map(async (submission) => {
          let peertutors = null
          try {
            const { data: tutor } = await supabase
              .from('peer_tutors')
              .select('id, name, email, dept, year, section')
              .eq('id', submission.peer_tutor_id)
              .single()
            peertutors = tutor
          } catch (error) {
            logger.warn('Could not fetch peer tutor details:', error)
          }

          return {
            ...submission,
            template,
            peer_tutor: peertutors
          }
        })
      )

      return enrichedSubmissions
    } catch (error) {
      logger.error('Error in getRenumerationSubmissionsByTemplate:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        fullError: error
      })
      return []
    }
  }

  /**
   * Get renumeration statistics for faculty
   */
  static async getRenumerationStats(facultyId: string): Promise<{
    totalTemplates: number
    totalSubmissions: number
    pendingSubmissions: number
    approvedSubmissions: number
    rejectedSubmissions: number
  }> {
    try {
      const supabase = createClient()
      
      // Get template count
      const { count: totalTemplates } = await supabase
        .from('renumeration_templates')
        .select('*', { count: 'exact', head: true })
        .eq('faculty_id', facultyId)

      // Get submission counts
      // We need to join with renumeration_templates to filter by faculty_id
      const { data: submissionTemplates, error: submissionsError } = await supabase
        .from('renumeration_templates')
        .select(`
          id,
          submissions:peer_tutor_renumerations (
            status
          )
        `)
        .eq('faculty_id', facultyId)

      if (submissionsError) {
        logger.error('Error getting submissions for stats:', submissionsError)
      }

      const allSubmissions = submissionTemplates?.flatMap(t => t.submissions as unknown as { status: string }[]) || []

      const stats = {
        totalTemplates: totalTemplates || 0,
        totalSubmissions: allSubmissions.length,
        pendingSubmissions: allSubmissions.filter(s => s.status === 'pending').length,
        approvedSubmissions: allSubmissions.filter(s => s.status === 'approved').length,
        rejectedSubmissions: allSubmissions.filter(s => s.status === 'rejected').length
      }

      return stats
    } catch (error) {
      logger.error('Error in getRenumerationStats:', error)
      return {
        totalTemplates: 0,
        totalSubmissions: 0,
        pendingSubmissions: 0,
        approvedSubmissions: 0,
        rejectedSubmissions: 0
      }
    }
  }
}
