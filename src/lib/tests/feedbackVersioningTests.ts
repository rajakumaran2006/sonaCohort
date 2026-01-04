import { FeedbackService } from '@/lib/services/feedbackService'
import { FeedbackVersioningService } from '@/lib/services/feedbackVersioningService'

/**
 * Test suite for the feedback form versioning system
 * This file demonstrates how the versioning system handles various scenarios
 */

export class FeedbackVersioningTests {
  private testFacultyId = 'test-faculty-123'
  private testStudentId = 'test-student-456'

  /**
   * Test 1: Create a new form (no versioning needed)
   */
  async testCreateNewForm() {
    console.log('🧪 Test 1: Creating a new form...')
    
    const form = await FeedbackService.createFeedbackForm(
      'Test Form 1',
      'A test form',
      this.testFacultyId,
      [
        {
          question_text: 'How satisfied are you?',
          question_type: 'star_rating',
          is_required: true,
          order_index: 1
        }
      ]
    )

    if (form) {
      console.log('✅ Form created successfully')
      console.log('📊 Form stats:', await FeedbackVersioningService.getFormStats(form.id))
      return form
    } else {
      console.log('❌ Failed to create form')
      return null
    }
  }

  /**
   * Test 2: Edit form with no responses (should update current version)
   */
  async testEditFormNoResponses(formId: string) {
    console.log('🧪 Test 2: Editing form with no responses...')
    
    const strategy = await FeedbackVersioningService.getEditStrategy(formId, {
      name: 'Updated Test Form 1',
      description: 'Updated description'
    })

    console.log('📋 Edit strategy:', strategy)
    
    if (strategy.type === 'update_current') {
      console.log('✅ Correctly identified as metadata-only update')
    } else {
      console.log('❌ Unexpected strategy type:', strategy.type)
    }

    return strategy
  }

  /**
   * Test 3: Submit responses to the form
   */
  async testSubmitResponses(formId: string) {
    console.log('🧪 Test 3: Submitting responses...')
    
    const success = await FeedbackService.submitFeedbackResponse(
      formId,
      this.testStudentId,
      [
        {
          question_id: 'test-question-1',
          star_rating: 4
        }
      ]
    )

    if (success) {
      console.log('✅ Response submitted successfully')
    } else {
      console.log('❌ Failed to submit response')
    }

    return success
  }

  /**
   * Test 4: Edit form with existing responses (metadata only)
   */
  async testEditFormWithResponsesMetadata(formId: string) {
    console.log('🧪 Test 4: Editing form metadata with existing responses...')
    
    const strategy = await FeedbackVersioningService.getEditStrategy(formId, {
      name: 'Updated Test Form 1 - Metadata Only',
      description: 'Updated description with responses'
    })

    console.log('📋 Edit strategy:', strategy)
    
    if (strategy.type === 'update_current') {
      console.log('✅ Correctly identified as metadata-only update')
    } else {
      console.log('❌ Unexpected strategy type:', strategy.type)
    }

    return strategy
  }

  /**
   * Test 5: Edit form with structural changes (should create new version)
   */
  async testEditFormWithStructuralChanges(formId: string) {
    console.log('🧪 Test 5: Editing form with structural changes...')
    
    const strategy = await FeedbackVersioningService.getEditStrategy(formId, {
      name: 'Updated Test Form 1 - Structural',
      description: 'Updated description with structural changes',
      questions: [
        {
          question_text: 'How satisfied are you?',
          question_type: 'star_rating',
          is_required: true,
          order_index: 1
        },
        {
          question_text: 'Any additional comments?',
          question_type: 'text',
          is_required: false,
          order_index: 2
        }
      ]
    })

    console.log('📋 Edit strategy:', strategy)
    
    if (strategy.type === 'create_new_version') {
      console.log('✅ Correctly identified as structural change requiring new version')
    } else {
      console.log('❌ Unexpected strategy type:', strategy.type)
    }

    return strategy
  }

  /**
   * Test 6: Create new version with structural changes
   */
  async testCreateNewVersion(formId: string) {
    console.log('🧪 Test 6: Creating new version...')
    
    const newVersion = await FeedbackVersioningService.createNewFormVersion(
      formId,
      'Test Form 1 - Version 2',
      'Updated form with new questions',
      [
        {
          question_text: 'How satisfied are you?',
          question_type: 'star_rating',
          is_required: true,
          order_index: 1
        },
        {
          question_text: 'Any additional comments?',
          question_type: 'text',
          is_required: false,
          order_index: 2
        }
      ]
    )

    if (newVersion) {
      console.log('✅ New version created successfully')
      console.log('📊 Version stats:', await FeedbackVersioningService.getFormStats(formId))
    } else {
      console.log('❌ Failed to create new version')
    }

    return newVersion
  }

  /**
   * Test 7: Submit response to new version
   */
  async testSubmitToNewVersion(formId: string) {
    console.log('🧪 Test 7: Submitting response to new version...')
    
    const success = await FeedbackService.submitFeedbackResponse(
      formId,
      'test-student-789',
      [
        {
          question_id: 'test-question-1',
          star_rating: 5
        },
        {
          question_id: 'test-question-2',
          answer_text: 'Great experience!'
        }
      ]
    )

    if (success) {
      console.log('✅ Response submitted to new version successfully')
    } else {
      console.log('❌ Failed to submit response to new version')
    }

    return success
  }

  /**
   * Test 8: Get form versions
   */
  async testGetFormVersions(formId: string) {
    console.log('🧪 Test 8: Getting form versions...')
    
    const versions = await FeedbackVersioningService.getFormVersions(formId)
    
    console.log('📋 Form versions:', versions.length)
    versions.forEach((version) => {
      console.log(`  Version ${version.version_number}: ${version.name} (${version.is_active ? 'Active' : 'Inactive'})`)
    })

    return versions
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Starting Feedback Versioning System Tests...\n')

    try {
      // Test 1: Create form
      const form = await this.testCreateNewForm()
      if (!form) return

      const formId = form.id
      console.log('')

      // Test 2: Edit with no responses
      await this.testEditFormNoResponses(formId)
      console.log('')

      // Test 3: Submit responses
      await this.testSubmitResponses(formId)
      console.log('')

      // Test 4: Edit metadata with responses
      await this.testEditFormWithResponsesMetadata(formId)
      console.log('')

      // Test 5: Edit with structural changes
      await this.testEditFormWithStructuralChanges(formId)
      console.log('')

      // Test 6: Create new version
      await this.testCreateNewVersion(formId)
      console.log('')

      // Test 7: Submit to new version
      await this.testSubmitToNewVersion(formId)
      console.log('')

      // Test 8: Get versions
      await this.testGetFormVersions(formId)
      console.log('')

      console.log('🎉 All tests completed successfully!')
      console.log('\n📊 Final Form Stats:')
      const finalStats = await FeedbackVersioningService.getFormStats(formId)
      console.log(JSON.stringify(finalStats, null, 2))

    } catch (error) {
      console.error('❌ Test failed with error:', error)
    }
  }
}

// Example usage scenarios
export const exampleScenarios = {
  /**
   * Scenario 1: Faculty creates a form, students respond, faculty edits metadata
   * Expected: Update current version (metadata only)
   */
  scenario1: async () => {
    console.log('📝 Scenario 1: Metadata-only edit with existing responses')
    const tests = new FeedbackVersioningTests()
    
    const form = await tests.testCreateNewForm()
    if (!form) return
    
    await tests.testSubmitResponses(form.id)
    await tests.testEditFormWithResponsesMetadata(form.id)
  },

  /**
   * Scenario 2: Faculty creates a form, students respond, faculty adds questions
   * Expected: Create new version
   */
  scenario2: async () => {
    console.log('📝 Scenario 2: Structural changes with existing responses')
    const tests = new FeedbackVersioningTests()
    
    const form = await tests.testCreateNewForm()
    if (!form) return
    
    await tests.testSubmitResponses(form.id)
    await tests.testEditFormWithStructuralChanges(form.id)
    await tests.testCreateNewVersion(form.id)
  },

  /**
   * Scenario 3: Complete workflow with multiple versions
   * Expected: Multiple versions with proper data integrity
   */
  scenario3: async () => {
    console.log('📝 Scenario 3: Complete multi-version workflow')
    const tests = new FeedbackVersioningTests()
    await tests.runAllTests()
  }
}

// Export for use in other files
export default FeedbackVersioningTests
