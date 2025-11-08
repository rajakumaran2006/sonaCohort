'use client'

import { useState, useEffect, useRef } from 'react'
import { FeedbackService, FeedbackForm, FeedbackQuestion } from '@/lib/services/feedbackService'
import { FormEditStrategy } from '@/lib/services/feedbackVersioningService'
import StarRating from '@/components/ui/StarRating'

interface FeedbackFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  facultyId: string
  editingForm?: FeedbackForm | null
}

interface QuestionForm {
  question_text: string
  question_type: 'multiple_choice' | 'text' | 'star_rating'
  is_required: boolean
  options: string[]
}

export default function FeedbackFormModal({
  isOpen,
  onClose,
  onSuccess,
  facultyId,
  editingForm
}: FeedbackFormModalProps) {
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [questions, setQuestions] = useState<QuestionForm[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [editStrategy, setEditStrategy] = useState<FormEditStrategy | null>(null)
  const [showStrategyModal, setShowStrategyModal] = useState(false)
  const [strategyConfirmed, setStrategyConfirmed] = useState(false)
  const [allStarRatingMode, setAllStarRatingMode] = useState(false)
  const isManualToggleRef = useRef(false)

  // Initialize form data when editing
  useEffect(() => {
    if (editingForm) {
      setFormName(editingForm.name)
      setFormDescription(editingForm.description || '')
      const mappedQuestions = editingForm.questions.map(q => ({
        question_text: q.question_text,
        question_type: q.question_type,
        is_required: q.is_required,
        options: q.options || []
      }))
      setQuestions(mappedQuestions)
      // Auto-enable toggle if all questions are star_rating
      const allStarRating = mappedQuestions.length > 0 && mappedQuestions.every(q => q.question_type === 'star_rating')
      setAllStarRatingMode(allStarRating)
    } else {
      setFormName('')
      setFormDescription('')
      setQuestions([])
      setAllStarRatingMode(false)
    }
    setErrors({})
    setEditStrategy(null)
    setShowStrategyModal(false)
    setStrategyConfirmed(false)
  }, [editingForm, isOpen])

  // Auto-enable toggle when all questions are star_rating (only if not manually toggled)
  useEffect(() => {
    if (isManualToggleRef.current) {
      isManualToggleRef.current = false
      return
    }
    
    if (questions.length > 0) {
      const allStarRating = questions.every(q => q.question_type === 'star_rating')
      if (allStarRating !== allStarRatingMode) {
        setAllStarRatingMode(allStarRating)
      }
    } else if (allStarRatingMode) {
      // If no questions, turn off toggle
      setAllStarRatingMode(false)
    }
  }, [questions, allStarRatingMode])

  // When toggle is ON, force all questions to be star_rating
  useEffect(() => {
    if (allStarRatingMode && questions.length > 0) {
      const hasNonStarRating = questions.some(q => q.question_type !== 'star_rating')
      if (hasNonStarRating) {
        setQuestions(questions.map(q => ({
          ...q,
          question_type: 'star_rating' as const,
          options: [] // Clear options for star rating questions
        })))
      }
    }
  }, [allStarRatingMode])

  const addQuestion = () => {
    setQuestions([...questions, {
      question_text: '',
      question_type: allStarRatingMode ? 'star_rating' : 'text',
      is_required: false,
      options: []
    }])
  }

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const updateQuestion = (index: number, field: keyof QuestionForm, value: any) => {
    const updatedQuestions = [...questions]
    updatedQuestions[index] = { ...updatedQuestions[index], [field]: value }
    setQuestions(updatedQuestions)
  }

  const addOption = (questionIndex: number) => {
    const updatedQuestions = [...questions]
    updatedQuestions[questionIndex].options.push('')
    setQuestions(updatedQuestions)
  }

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const updatedQuestions = [...questions]
    updatedQuestions[questionIndex].options.splice(optionIndex, 1)
    setQuestions(updatedQuestions)
  }

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const updatedQuestions = [...questions]
    updatedQuestions[questionIndex].options[optionIndex] = value
    setQuestions(updatedQuestions)
  }

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}

    if (!formName.trim()) {
      newErrors.formName = 'Form name is required'
    }

    if (questions.length === 0) {
      newErrors.questions = 'At least one question is required'
    }

    questions.forEach((question, index) => {
      if (!question.question_text.trim()) {
        newErrors[`question_${index}`] = 'Question text is required'
      }

      if (question.question_type === 'multiple_choice') {
        const validOptions = question.options.filter(opt => opt.trim())
        if (validOptions.length < 2) {
          newErrors[`question_options_${index}`] = 'Multiple choice questions need at least 2 options'
        }
      }
      // Star rating questions don't need additional validation
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    // If editing and strategy not confirmed, check strategy first
    if (editingForm && !strategyConfirmed) {
      await checkEditStrategy()
      return
    }

    setLoading(true)
    try {
      const questionsToSubmit = questions.map((q, index) => ({
        question_text: q.question_text,
        question_type: q.question_type,
        is_required: q.is_required,
        order_index: index + 1,
        options: q.question_type === 'multiple_choice' ? q.options.filter(opt => opt.trim()) : undefined
      }))

      if (editingForm) {
        // Update existing form with versioning support
        const result = await FeedbackService.updateFeedbackForm(
          editingForm.id,
          {
            name: formName,
            description: formDescription,
            is_active: editingForm.is_active
          },
          questionsToSubmit
        )
        
        if (result.success) {
          onSuccess()
        } else {
          // Show error based on strategy
          if (result.strategy.type === 'require_confirmation') {
            setEditStrategy(result.strategy)
            setShowStrategyModal(true)
          }
        }
      } else {
        // Create new form
        const result = await FeedbackService.createFeedbackForm(
          formName,
          formDescription,
          facultyId,
          questionsToSubmit
        )
        
        if (result) {
          onSuccess()
        }
      }
    } catch (error) {
      console.error('Error saving feedback form:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkEditStrategy = async () => {
    if (!editingForm) return

    const questionsToSubmit = questions.map((q, index) => ({
      question_text: q.question_text,
      question_type: q.question_type,
      is_required: q.is_required,
      order_index: index + 1,
      options: q.question_type === 'multiple_choice' ? q.options.filter(opt => opt.trim()) : undefined
    }))

    const strategy = await FeedbackService.getFormEditStrategy(editingForm.id, {
      name: formName,
      description: formDescription,
      questions: questionsToSubmit
    })

    setEditStrategy(strategy)

    if (strategy.type === 'require_confirmation' || strategy.warnings.length > 0) {
      setShowStrategyModal(true)
    } else {
      setStrategyConfirmed(true)
      // Retry submit
      setTimeout(() => handleSubmit(new Event('submit') as any), 100)
    }
  }

  const handleStrategyConfirm = () => {
    setStrategyConfirmed(true)
    setShowStrategyModal(false)
    // Retry submit
    setTimeout(() => handleSubmit(new Event('submit') as any), 100)
  }

  const handleStrategyCancel = () => {
    setShowStrategyModal(false)
    setStrategyConfirmed(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              {editingForm ? 'Edit Feedback Form' : 'Create New Feedback Form'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Form Basic Info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Form Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.formName ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Enter feedback form name"
                />
                {errors.formName && (
                  <p className="mt-1 text-sm text-red-600">{errors.formName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter form description (optional)"
                />
              </div>

              {/* All Star Rating Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    All Star Rating Questions
                  </label>
                  <p className="text-xs text-gray-600">
                    When enabled, all questions will be star rating type. Satisfaction score will only be shown when all questions are star rating.
                  </p>
                </div>
                <div className="ml-4">
                  <button
                    type="button"
                    onClick={() => {
                      isManualToggleRef.current = true
                      setAllStarRatingMode(!allStarRatingMode)
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      allStarRatingMode ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        allStarRatingMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Questions Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-medium text-gray-900">Questions</h4>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-sm"
                >
                  Add Question
                </button>
              </div>

              {errors.questions && (
                <p className="mb-4 text-sm text-red-600">{errors.questions}</p>
              )}

              <div className="space-y-4">
                {questions.map((question, questionIndex) => (
                  <div key={questionIndex} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">
                        Question {questionIndex + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeQuestion(questionIndex)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="space-y-3">
                      {/* Question Text */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Question Text *
                        </label>
                        <input
                          type="text"
                          value={question.question_text}
                          onChange={(e) => updateQuestion(questionIndex, 'question_text', e.target.value)}
                          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors[`question_${questionIndex}`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Enter your question"
                        />
                        {errors[`question_${questionIndex}`] && (
                          <p className="mt-1 text-sm text-red-600">{errors[`question_${questionIndex}`]}</p>
                        )}
                      </div>

                      {/* Question Type */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Question Type
                        </label>
                        <select
                          value={question.question_type}
                          onChange={(e) => updateQuestion(questionIndex, 'question_type', e.target.value)}
                          disabled={allStarRatingMode}
                          className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            allStarRatingMode ? 'bg-gray-100 cursor-not-allowed' : ''
                          }`}
                        >
                          <option value="text">Text Input</option>
                          <option value="multiple_choice">Multiple Choice</option>
                          <option value="star_rating">Star Rating (1-5)</option>
                        </select>
                        {allStarRatingMode && (
                          <p className="mt-1 text-xs text-gray-500">
                            All questions are set to star rating mode
                          </p>
                        )}
                      </div>

                      {/* Star Rating Preview */}
                      {question.question_type === 'star_rating' && (
                        <div className="mt-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Preview:
                          </label>
                          <StarRating
                            value={0}
                            onChange={() => {}}
                            disabled={true}
                          />
                        </div>
                      )}

                      {/* Multiple Choice Options */}
                      {question.question_type === 'multiple_choice' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Options *
                          </label>
                          <div className="space-y-2">
                            {question.options.map((option, optionIndex) => (
                              <div key={optionIndex} className="flex items-center space-x-2">
                                <input
                                  type="text"
                                  value={option}
                                  onChange={(e) => updateOption(questionIndex, optionIndex, e.target.value)}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder={`Option ${optionIndex + 1}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeOption(questionIndex, optionIndex)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addOption(questionIndex)}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              + Add Option
                            </button>
                          </div>
                          {errors[`question_options_${questionIndex}`] && (
                            <p className="mt-1 text-sm text-red-600">{errors[`question_options_${questionIndex}`]}</p>
                          )}
                        </div>
                      )}

                      {/* Required Toggle */}
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id={`required_${questionIndex}`}
                          checked={question.is_required}
                          onChange={(e) => updateQuestion(questionIndex, 'is_required', e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor={`required_${questionIndex}`} className="ml-2 text-sm text-gray-700">
                          Required question
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : editingForm ? 'Update Form' : 'Create Form'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Strategy Confirmation Modal */}
      {showStrategyModal && editStrategy && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-60">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-yellow-100 rounded-full mb-4">
                <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {editStrategy.type === 'create_new_version' ? 'Create New Version' : 
                   editStrategy.type === 'update_current' ? 'Update Form' : 
                   'Confirm Changes'}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {editStrategy.reason}
                </p>
                
                {editStrategy.warnings.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Important Notes:</h4>
                    <ul className="text-sm text-gray-600 text-left space-y-1">
                      {editStrategy.warnings.map((warning, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-yellow-500 mr-2">•</span>
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {editStrategy.type === 'create_new_version' && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-md">
                    <p className="text-sm text-blue-800">
                      <strong>New Version:</strong> This will create a new version of the form while preserving all existing responses. 
                      Students will see the updated form for new submissions.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-center space-x-3">
                  <button
                    onClick={handleStrategyCancel}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStrategyConfirm}
                    disabled={!editStrategy.canProceed}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
                  >
                    {editStrategy.type === 'create_new_version' ? 'Create New Version' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
