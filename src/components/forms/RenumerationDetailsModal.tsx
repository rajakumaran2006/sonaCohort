'use client'

import { useState } from 'react'
import { RenumerationService } from '@/lib/services/renumerationService'

interface RenumerationDetailsModalProps {
  submission: any
  isOpen: boolean
  onClose: () => void
  onStatusUpdate: (renumerationId: string, status: 'approved' | 'rejected') => void
}

export default function RenumerationDetailsModal({ 
  submission, 
  isOpen, 
  onClose
}: RenumerationDetailsModalProps) {
  const [loading] = useState(false)

  if (!isOpen || !submission) return null

  // Debug logging
  console.log('RenumerationDetailsModal - submission data:', {
    submission,
    template: submission.template,
    fields: submission.template?.fields,
    fieldResponses: submission.field_responses
  })

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Renumeration Submission Details
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {submission.template?.name || 'Renumeration Form'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Peer Tutor Information */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Peer Tutor Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <p className="text-sm text-gray-900">{submission.peer_tutor?.name || 'Unknown'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <p className="text-sm text-gray-900">{submission.peer_tutor?.email || 'No email'}</p>
              </div>
            </div>
          </div>

          {/* Submission Status */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Submission Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Created</label>
                <p className="text-sm text-gray-900">
                  {new Date(submission.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Submitted</label>
                <p className="text-sm text-gray-900">
                  {submission.submitted_at 
                    ? new Date(submission.submitted_at).toLocaleDateString()
                    : 'Not submitted'
                  }
                </p>
              </div>
            </div>
            {/* Approval details removed */}
          </div>

          {/* Form Responses */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Form Responses</h3>
            {submission.template?.fields && submission.template.fields.length > 0 ? (
              <div className="space-y-4">
                {submission.template.fields.map((field: any) => (
                  <div key={field.id} className="border-b border-gray-200 pb-4 last:border-b-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.field_name}
                      {field.is_mandatory && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <div className="text-sm text-gray-900">
                      {submission.field_responses[field.field_name] || (
                        <span className="text-gray-500 italic">No response provided</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Field type: {field.field_type}
                      {field.field_type === 'dropdown' && field.options && (
                        <span> • Options: {field.options.join(', ')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-500 italic mb-2">No form fields defined for this template.</p>
                <p className="text-xs text-gray-400">
                  Template ID: {submission.template_id}
                </p>
                {submission.template && (
                  <p className="text-xs text-gray-400">
                    Template Name: {submission.template.name}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <div>
              {submission.status === 'submitted' && (
                <div className="text-sm text-gray-600">
                  This submission is ready for review. You can approve or reject it.
                </div>
              )}
              {submission.status === 'approved' && (
                <div className="text-sm text-green-600">
                  ✓ This submission has been approved.
                </div>
              )}
              {submission.status === 'rejected' && (
                <div className="text-sm text-red-600">
                  ✗ This submission has been rejected.
                </div>
              )}
              {submission.status === 'pending' && (
                <div className="text-sm text-yellow-600">
                  ⏳ This submission is still pending completion by the peer tutor.
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                Close
              </button>
              {/* No approve/reject actions */}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
