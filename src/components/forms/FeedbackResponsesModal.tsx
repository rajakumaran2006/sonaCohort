'use client'

import { useState } from 'react'
import { FeedbackForm, FeedbackResponseWithDetails } from '@/lib/services/feedbackService'

interface FeedbackResponsesModalProps {
  isOpen: boolean
  onClose: () => void
  feedbackForm: FeedbackForm | null
  responses: FeedbackResponseWithDetails[]
  loading: boolean
}

export default function FeedbackResponsesModal({
  isOpen,
  onClose,
  feedbackForm,
  responses,
  loading
}: FeedbackResponsesModalProps) {
  const [selectedResponse, setSelectedResponse] = useState<FeedbackResponseWithDetails | null>(null)

  if (!isOpen || !feedbackForm) return null

  const handleViewResponse = (response: FeedbackResponseWithDetails) => {
    setSelectedResponse(response)
  }

  const closeResponseDetail = () => {
    setSelectedResponse(null)
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Feedback Responses: {feedbackForm.name}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {responses.length} response{responses.length !== 1 ? 's' : ''} received
              </p>
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

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : responses.length === 0 ? (
            <div className="text-center py-12">
              <svg className="h-12 w-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No responses yet</h3>
              <p className="text-gray-500">No students have submitted responses for this feedback form.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Responses List */}
              <div className="bg-white border border-gray-200 rounded-lg">
                <div className="px-6 py-3 border-b border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900">Student Responses</h4>
                </div>
                <div className="divide-y divide-gray-200">
                  {responses.map((response) => (
                    <div key={response.id} className="px-6 py-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                              <span className="text-green-600 font-medium text-sm">
                                {response.student.name.split(' ').map(n => n[0]).join('')}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {response.student.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {response.student.email} • {response.student.year} - {response.student.section}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-sm text-gray-500">
                            {new Date(response.submitted_at).toLocaleDateString()}
                          </div>
                          <button
                            onClick={() => handleViewResponse(response)}
                            className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Response Detail Modal */}
          {selectedResponse && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-60">
              <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-medium text-gray-900">
                      Response from {selectedResponse.student.name}
                    </h4>
                    <button
                      onClick={closeResponseDetail}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Student Info */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0 h-12 w-12">
                          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                            <span className="text-green-600 font-medium">
                              {selectedResponse.student.name.split(' ').map(n => n[0]).join('')}
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className="text-lg font-medium text-gray-900">
                            {selectedResponse.student.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {selectedResponse.student.email}
                          </div>
                          <div className="text-sm text-gray-500">
                            {selectedResponse.student.year} - {selectedResponse.student.section}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-sm text-gray-500">
                        Submitted on {new Date(selectedResponse.submitted_at).toLocaleString()}
                      </div>
                    </div>

                    {/* Responses */}
                    <div className="space-y-4">
                      <h5 className="text-md font-medium text-gray-900">Responses</h5>
                      {selectedResponse.responses.map((answer, index) => (
                        <div key={answer.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h6 className="text-sm font-medium text-gray-900">
                              {index + 1}. {answer.question?.question_text}
                            </h6>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              answer.question?.question_type === 'multiple_choice' 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {answer.question?.question_type === 'multiple_choice' ? 'Multiple Choice' : 'Text'}
                            </span>
                          </div>
                          <div className="text-sm text-gray-700">
                            {answer.question?.question_type === 'multiple_choice' ? (
                              <span className="font-medium">{answer.selected_option}</span>
                            ) : (
                              <div className="whitespace-pre-wrap">{answer.answer_text || 'No response'}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-4 border-t mt-6">
                    <button
                      onClick={closeResponseDetail}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
