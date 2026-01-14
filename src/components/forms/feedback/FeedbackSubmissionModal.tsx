'use client'

import { useState, useEffect } from 'react'
import { FeedbackForm, FeedbackService } from '@/lib/services/feedbackService'
import StarRating from '@/components/ui/StarRating'

interface FeedbackSubmissionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  feedbackForm: FeedbackForm
  studentId: string
}

interface Answer {
  question_id: string
  answer_text?: string
  selected_option?: string
  star_rating?: number
}

export default function FeedbackSubmissionModal({
  isOpen,
  onClose,
  onSuccess,
  feedbackForm,
  studentId
}: FeedbackSubmissionModalProps) {
  const [answers, setAnswers] = useState<Answer[]>([])
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  // Initialize answers when form opens
  useEffect(() => {
    if (isOpen && feedbackForm) {
      const initialAnswers = feedbackForm.questions.map(question => ({
        question_id: question.id,
        answer_text: '',
        selected_option: '',
        star_rating: 0
      }))
      setAnswers(initialAnswers)
      setSubmitted(false)
      setErrors({})
    }
  }, [isOpen, feedbackForm])

  const updateAnswer = (questionId: string, field: 'answer_text' | 'selected_option' | 'star_rating', value: string | number) => {
    setAnswers(prev => prev.map(answer => 
      answer.question_id === questionId 
        ? { ...answer, [field]: value }
        : answer
    ))
  }

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}

    feedbackForm.questions.forEach(question => {
      const answer = answers.find(a => a.question_id === question.id)
      
      if (question.is_required) {
        if (question.question_type === 'text') {
          if (!answer?.answer_text?.trim()) {
            newErrors[question.id] = 'This question is required'
          }
        } else if (question.question_type === 'multiple_choice') {
          if (!answer?.selected_option) {
            newErrors[question.id] = 'Please select an option'
          }
        } else if (question.question_type === 'star_rating') {
          if (!answer?.star_rating || answer.star_rating === 0) {
            newErrors[question.id] = 'Please provide a rating'
          }
        }
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setLoading(true)
    try {
      const answersToSubmit = answers.map(answer => {
        const questionType = feedbackForm.questions.find(q => q.id === answer.question_id)?.question_type
        
        // Return only the relevant fields based on question type
        if (questionType === 'star_rating') {
          return {
            question_id: answer.question_id,
            star_rating: answer.star_rating
          }
        } else if (questionType === 'multiple_choice') {
          return {
            question_id: answer.question_id,
            selected_option: answer.selected_option
          }
        } else {
          return {
            question_id: answer.question_id,
            answer_text: answer.answer_text
          }
        }
      })

      const success = await FeedbackService.submitFeedbackResponse(
        feedbackForm.id,
        studentId,
        answersToSubmit
      )

      if (success) {
        setSubmitted(true)
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 2000)
      }
    } catch (error) {
      console.error('Error submitting feedback:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                {feedbackForm.name}
              </h3>
              {feedbackForm.description && (
                <p className="text-sm text-gray-600 mt-1">{feedbackForm.description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {submitted ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Feedback Submitted Successfully!</h3>
              <p className="text-gray-600 mb-2">Thank you for taking the time to provide your valuable feedback.</p>
              <p className="text-sm text-gray-500">Your response has been recorded and this window will close automatically.</p>
              <div className="mt-4 flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {feedbackForm.questions.map((question, index) => {
                const answer = answers.find(a => a.question_id === question.id)
                const hasError = errors[question.id]

                return (
                  <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-900">
                        {index + 1}. {question.question_text}
                        {question.is_required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-1 ${
                        question.question_type === 'multiple_choice' 
                          ? 'bg-blue-100 text-blue-800' 
                          : question.question_type === 'star_rating'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {question.question_type === 'multiple_choice' 
                          ? 'Multiple Choice' 
                          : question.question_type === 'star_rating'
                          ? 'Star Rating'
                          : 'Text Input'}
                      </span>
                    </div>

                    {question.question_type === 'star_rating' ? (
                      <div>
                        <StarRating
                          value={answer?.star_rating || 0}
                          onChange={(rating) => updateAnswer(question.id, 'star_rating', rating)}
                        />
                        {hasError && (
                          <p className="mt-1 text-sm text-red-600">{hasError}</p>
                        )}
                      </div>
                    ) : question.question_type === 'text' ? (
                      <div>
                        <textarea
                          value={answer?.answer_text || ''}
                          onChange={(e) => updateAnswer(question.id, 'answer_text', e.target.value)}
                          rows={4}
                          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            hasError ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Enter your answer here..."
                        />
                        {hasError && (
                          <p className="mt-1 text-sm text-red-600">{hasError}</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="space-y-2">
                          {question.options?.map((option, optionIndex) => (
                            <label key={optionIndex} className="flex items-center">
                              <input
                                type="radio"
                                name={`question_${question.id}`}
                                value={option}
                                checked={answer?.selected_option === option}
                                onChange={(e) => updateAnswer(question.id, 'selected_option', e.target.value)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                              />
                              <span className="ml-2 text-sm text-gray-700">{option}</span>
                            </label>
                          ))}
                        </div>
                        {hasError && (
                          <p className="mt-1 text-sm text-red-600">{hasError}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

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
                  {loading ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
