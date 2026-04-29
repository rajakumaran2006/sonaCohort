'use client'

import { useState, useEffect } from 'react'
import { FeedbackForm, FeedbackService } from '@/lib/services/feedbackService'
import { logger } from '@/lib/logger'
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
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [showConfirmation, setShowConfirmation] = useState(false)

  // Reset ALL state every time the modal opens
  useEffect(() => {
    if (isOpen && feedbackForm) {
      setAnswers(
        feedbackForm.questions.map(question => ({
          question_id: question.id,
          answer_text: '',
          selected_option: '',
          star_rating: 0
        }))
      )
      setSubmitted(false)
      setErrors({})
      setSubmitError(null)
      setShowConfirmation(false)
      setLoading(false)
    }
  }, [isOpen, feedbackForm])

  const updateAnswer = (
    questionId: string,
    field: 'answer_text' | 'selected_option' | 'star_rating',
    value: string | number
  ) => {
    setAnswers(prev =>
      prev.map(answer =>
        answer.question_id === questionId ? { ...answer, [field]: value } : answer
      )
    )
    // Clear individual field error on change
    setErrors(prev => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
  }

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}
    feedbackForm.questions.forEach(question => {
      const answer = answers.find(a => a.question_id === question.id)
      if (question.is_required) {
        if (question.question_type === 'text' && !answer?.answer_text?.trim()) {
          newErrors[question.id] = 'This question is required'
        } else if (question.question_type === 'multiple_choice' && !answer?.selected_option) {
          newErrors[question.id] = 'Please select an option'
        } else if (question.question_type === 'star_rating' && (!answer?.star_rating || answer.star_rating === 0)) {
          newErrors[question.id] = 'Please provide a rating'
        }
      }
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmitClick = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    setShowConfirmation(true)
  }

  const confirmSubmit = async () => {
    setLoading(true)
    setSubmitError(null)
    try {
      const answersToSubmit = answers.map(answer => {
        const questionType = feedbackForm.questions.find(q => q.id === answer.question_id)?.question_type
        if (questionType === 'star_rating') {
          return { question_id: answer.question_id, star_rating: answer.star_rating }
        } else if (questionType === 'multiple_choice') {
          return { question_id: answer.question_id, selected_option: answer.selected_option }
        } else {
          return { question_id: answer.question_id, answer_text: answer.answer_text }
        }
      })

      const success = await FeedbackService.submitFeedbackResponse(
        feedbackForm.id,
        studentId,
        answersToSubmit
      )

      if (success) {
        setShowConfirmation(false)
        setSubmitted(true)
        // Notify parent to refresh status, then close after 2s
        setTimeout(() => {
          onSuccess()
        }, 2000)
      } else {
        setSubmitError('Submission failed. Please try again.')
        setShowConfirmation(false)
      }
    } catch (error) {
      logger.error('Error submitting feedback:', error)
      setSubmitError('An unexpected error occurred. Please try again.')
      setShowConfirmation(false)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* ── Main Feedback Modal ── */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
        <div className="relative w-full max-w-3xl my-auto bg-white rounded-2xl shadow-2xl border border-gray-100">
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-gray-100">
            <div className="pr-4">
              <h3 className="text-lg font-bold text-gray-900">{feedbackForm.name}</h3>
              {feedbackForm.description && (
                <p className="text-sm text-gray-500 mt-1">{feedbackForm.description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-shrink-0 p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-6">
            {submitted ? (
              /* ── Success State ── */
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Feedback Submitted!</h3>
                <p className="text-gray-500 text-sm">Thank you. Your response has been recorded.</p>
                <div className="mt-6 flex justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
                </div>
              </div>
            ) : (
              /* ── Form ── */
              <form onSubmit={handleSubmitClick} className="space-y-5" id="feedback-form">
                {/* Error banner */}
                {submitError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
                    {submitError}
                  </div>
                )}

                {feedbackForm.questions.map((question, index) => {
                  const answer = answers.find(a => a.question_id === question.id)
                  const hasError = errors[question.id]

                  return (
                    <div
                      key={question.id}
                      className={`border rounded-xl p-4 transition-colors ${
                        hasError ? 'border-red-300 bg-red-50/30' : 'border-gray-200 bg-gray-50/50'
                      }`}
                    >
                      <label className="block text-sm font-semibold text-gray-900 mb-1">
                        {index + 1}. {question.question_text}
                        {question.is_required && <span className="text-red-500 ml-1">*</span>}
                      </label>

                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide mb-3 ${
                          question.question_type === 'multiple_choice'
                            ? 'bg-blue-100 text-blue-700'
                            : question.question_type === 'star_rating'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {question.question_type === 'multiple_choice'
                          ? 'Multiple Choice'
                          : question.question_type === 'star_rating'
                          ? 'Star Rating'
                          : 'Text Input'}
                      </span>

                      {question.question_type === 'star_rating' && (
                        <div>
                          <StarRating
                            value={answer?.star_rating || 0}
                            onChange={rating => updateAnswer(question.id, 'star_rating', rating)}
                          />
                          {hasError && <p className="mt-1.5 text-xs text-red-600 font-medium">{hasError}</p>}
                        </div>
                      )}

                      {question.question_type === 'text' && (
                        <div>
                          <textarea
                            value={answer?.answer_text || ''}
                            onChange={e => updateAnswer(question.id, 'answer_text', e.target.value)}
                            rows={4}
                            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-none ${
                              hasError ? 'border-red-400 bg-white' : 'border-gray-200 bg-white'
                            }`}
                            placeholder="Enter your answer here…"
                          />
                          {hasError && <p className="mt-1 text-xs text-red-600 font-medium">{hasError}</p>}
                        </div>
                      )}

                      {question.question_type === 'multiple_choice' && (
                        <div className="space-y-2">
                          {question.options?.map((option, optionIndex) => (
                            <label key={optionIndex} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`question_${question.id}`}
                                value={option}
                                checked={answer?.selected_option === option}
                                onChange={e => updateAnswer(question.id, 'selected_option', e.target.value)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                              />
                              <span className="text-sm text-gray-700">{option}</span>
                            </label>
                          ))}
                          {hasError && <p className="mt-1 text-xs text-red-600 font-medium">{hasError}</p>}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2.5 text-sm font-bold text-white bg-gray-900 hover:bg-black rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    Submit Feedback
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ── Confirmation Dialog (separate layer above main modal) ── */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 sm:p-8 text-center">
            <div className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Submit Feedback?</h3>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Once submitted, your answers will be saved to the database and cannot be changed.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowConfirmation(false)}
                disabled={loading}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
              >
                Go Back &amp; Edit
              </button>
              <button
                onClick={confirmSubmit}
                disabled={loading}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-gray-900 hover:bg-black rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Yes, Submit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
