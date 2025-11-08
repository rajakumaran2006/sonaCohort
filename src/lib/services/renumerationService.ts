import { createClient } from '@/utils/supabase/client'

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

export interface PeerTutorRenumeration {
  id: string
  peer_tutor_id: string
  template_id: string
  status: 'pending' | 'submitted' | 'approved' | 'rejected'
  field_responses: Record<string, any>
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
  ): Promise<RenumerationTemplate | null> {
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
        console.error('Error creating renumeration template:', {
          message: templateError.message,
          details: templateError.details,
          hint: templateError.hint,
          code: templateError.code,
          fullError: templateError
        })
        return null
      }

      // Then create the fields
      const fieldsWithTemplateId = fields.map(field => ({
        ...field,
        template_id: template.id
      }))

      console.log('Creating fields for template:', {
        templateId: template.id,
        fieldsCount: fields.length,
        fieldsWithTemplateId
      })

      const { data: createdFields, error: fieldsError } = await supabase
        .from('renumeration_fields')
        .insert(fieldsWithTemplateId)
        .select()

      if (fieldsError) {
        console.error('Error creating renumeration fields:', {
          message: fieldsError.message,
          details: fieldsError.details,
          hint: fieldsError.hint,
          code: fieldsError.code,
          fullError: fieldsError
        })
        // Clean up the template if fields creation failed
        await supabase.from('renumeration_templates').delete().eq('id', template.id)
        return null
      }

      console.log('Fields created successfully:', {
        templateId: template.id,
        createdFields,
        fieldsCount: createdFields?.length || 0
      })

      return {
        ...template,
        fields: createdFields || []
      }
    } catch (error) {
      console.error('Error in createRenumerationTemplate:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        fullError: error
      })
      return null
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
        console.error('Error updating template status:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in updateTemplateStatus:', error)
      return false
    }
  }

  /**
   * Send renumeration to all peer tutors
   */
  static async sendRenumerationToAllPeerTutors(templateId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Get all peer tutors
      const { data: peerTutors, error: tutorsError } = await supabase
        .from('peer_tutors')
        .select('id')

      if (tutorsError) {
        console.error('Error getting peer tutors:', tutorsError)
        return false
      }

      if (!peerTutors || peerTutors.length === 0) {
        console.log('No peer tutors found')
        return true
      }

      // Create renumeration records for all peer tutors
      const renumerationRecords = peerTutors.map(tutor => ({
        peer_tutor_id: tutor.id,
        template_id: templateId,
        status: 'pending',
        field_responses: {}
      }))

      const { error: insertError } = await supabase
        .from('peer_tutor_renumerations')
        .insert(renumerationRecords)

      if (insertError) {
        console.error('Error creating renumeration records:', insertError)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in sendRenumerationToAllPeerTutors:', error)
      return false
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
        console.error('Error getting renumeration templates:', templatesError)
        return []
      }

      return templates || []
    } catch (error) {
      console.error('Error in getRenumerationTemplates:', error)
      return []
    }
  }

  /**
   * Get renumeration submissions for a faculty
   */
  static async getRenumerationSubmissions(facultyId: string): Promise<PeerTutorRenumeration[]> {
    try {
      const supabase = createClient()
      
      // First get all renumeration templates for this faculty
      const { data: templates, error: templatesError } = await supabase
        .from('renumeration_templates')
        .select('id')
        .eq('faculty_id', facultyId)

      if (templatesError) {
        console.error('Error getting renumeration templates:', {
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

      // Then get submissions for these templates
      const { data: submissions, error: submissionsError } = await supabase
        .from('peer_tutor_renumerations')
        .select('*')
        .in('template_id', templateIds)
        .order('created_at', { ascending: false })

      if (submissionsError) {
        console.error('Error getting renumeration submissions:', {
          message: submissionsError.message,
          details: submissionsError.details,
          hint: submissionsError.hint,
          code: submissionsError.code,
          fullError: submissionsError
        })
        return []
      }

      // Get template and peer tutor details separately
      const enrichedSubmissions = await Promise.all(
        (submissions || []).map(async (submission) => {
          // Get template details with fields
          const { data: template, error: templateError } = await supabase
            .from('renumeration_templates')
            .select(`
              *,
              fields:renumeration_fields(*)
            `)
            .eq('id', submission.template_id)
            .single()

          if (templateError) {
            console.error('Error getting template details:', {
              message: templateError.message,
              details: templateError.details,
              hint: templateError.hint,
              code: templateError.code,
              fullError: templateError
            })
          }

          console.log('Template details for submission:', {
            submissionId: submission.id,
            templateId: submission.template_id,
            template,
            fieldsCount: template?.fields?.length || 0
          })

          // Get peer tutor details (note: this might fail due to schema mismatch)
          let peerTutor = null
          try {
            const { data: tutor } = await supabase
              .from('peer_tutors')
              .select('id, name, email, dept, year, section')
              .eq('id', submission.peer_tutor_id)
              .single()
            peerTutor = tutor
          } catch (error) {
            console.warn('Could not fetch peer tutor details:', error)
          }

          return {
            ...submission,
            template,
            peer_tutor: peerTutor
          }
        })
      )

      return enrichedSubmissions
    } catch (error) {
      console.error('Error in getRenumerationSubmissions:', {
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
  static async getPeerTutorRenumeration(peerTutorId: string): Promise<PeerTutorRenumeration[]> {
    try {
      const supabase = createClient()
      
      const { data: renumeration, error: renumerationError } = await supabase
        .from('peer_tutor_renumerations')
        .select('*')
        .eq('peer_tutor_id', peerTutorId)
        .order('created_at', { ascending: false })

      if (renumerationError) {
        console.error('Error getting peer tutor renumeration:', {
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
      console.error('Error in getPeerTutorRenumeration:', {
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
    fieldResponses: Record<string, any>
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
        console.error('Error submitting renumeration response:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in submitRenumerationResponse:', error)
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
        console.error('Error updating renumeration status:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in updateRenumerationStatus:', error)
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
        console.error('Error deleting renumeration response:', {
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
      console.error('Error in deleteRenumerationResponse:', {
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
        console.error('Error deleting renumeration template:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in deleteRenumerationTemplate:', error)
      return false
    }
  }

  /**
   * Get renumeration submissions for a specific template
   */
  static async getRenumerationSubmissionsByTemplate(templateId: string): Promise<PeerTutorRenumeration[]> {
    try {
      const supabase = createClient()
      
      // Get submissions for the specific template
      const { data: submissions, error: submissionsError } = await supabase
        .from('peer_tutor_renumerations')
        .select('*')
        .eq('template_id', templateId)
        .order('created_at', { ascending: false })

      if (submissionsError) {
        console.error('Error getting renumeration submissions by template:', {
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
        console.error('Error getting template details:', {
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
          let peerTutor = null
          try {
            const { data: tutor } = await supabase
              .from('peer_tutors')
              .select('id, name, email, dept, year, section')
              .eq('id', submission.peer_tutor_id)
              .single()
            peerTutor = tutor
          } catch (error) {
            console.warn('Could not fetch peer tutor details:', error)
          }

          return {
            ...submission,
            template,
            peer_tutor: peerTutor
          }
        })
      )

      return enrichedSubmissions
    } catch (error) {
      console.error('Error in getRenumerationSubmissionsByTemplate:', {
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
      const { data: submissions } = await supabase
        .from('peer_tutor_renumerations')
        .select('status')
        .eq('template.faculty_id', facultyId)

      const stats = {
        totalTemplates: totalTemplates || 0,
        totalSubmissions: submissions?.length || 0,
        pendingSubmissions: submissions?.filter(s => s.status === 'pending').length || 0,
        approvedSubmissions: submissions?.filter(s => s.status === 'approved').length || 0,
        rejectedSubmissions: submissions?.filter(s => s.status === 'rejected').length || 0
      }

      return stats
    } catch (error) {
      console.error('Error in getRenumerationStats:', error)
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
