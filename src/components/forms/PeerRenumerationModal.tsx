'use client'

import { useState, useEffect } from 'react'
import { RenumerationService, PeerTutorRenumeration, RenumerationField } from '@/lib/services/renumerationService'

interface PeerRenumerationModalProps {
  renumeration: PeerTutorRenumeration
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function PeerRenumerationModal({ 
  renumeration, 
  isOpen, 
  onClose, 
  onSuccess 
}: PeerRenumerationModalProps) {
  const [formData, setFormData] = useState<Record<string, string | number | boolean | null>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<RenumerationField[]>([])

  useEffect(() => {
    if (renumeration && renumeration.template) {
      setFields(renumeration.template.fields || [])
      // Initialize form data with existing responses or empty values
      setFormData(renumeration.field_responses || {})
    }
  }, [renumeration])

  const handleFieldChange = (fieldName: string, value: string | number | boolean | null) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }))
  }

  const validateForm = () => {
    for (const field of fields) {
      if (field.is_mandatory && (!formData[field.field_name] || formData[field.field_name] === '')) {
        setError(`${field.field_name} is required`)
        return false
      }
    }
    setError('')
    return true
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    setLoading(true)
    try {
      const success = await RenumerationService.submitRenumerationResponse(
        renumeration.id,
        formData
      )

      if (success) {
        onSuccess()
        onClose()
      } else {
        setError('Failed to submit renumeration response')
      }
    } catch (error) {
      console.error('Error submitting renumeration:', error)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this renumeration response? This action cannot be undone.')) {
      return
    }

    setLoading(true)
    try {
      const success = await RenumerationService.deleteRenumerationResponse(renumeration.id)
      
      if (success) {
        onSuccess()
        onClose()
      } else {
        setError('Failed to delete renumeration response')
      }
    } catch (error) {
      console.error('Error deleting renumeration:', error)
      setError('Failed to delete renumeration response')
    } finally {
      setLoading(false)
    }
  }

  const renderField = (field: RenumerationField) => {
    const value = formData[field.field_name] || ''
    const isFormClosed = !renumeration.template?.is_active
    const isReadOnly = isFormClosed || renumeration.status === 'approved' || renumeration.status === 'rejected'

    switch (field.field_type) {
      case 'text':
      case 'email':
        return (
          <input
            type={field.field_type}
            value={value}
            onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Enter ${field.field_name.toLowerCase()}`}
            disabled={isReadOnly}
            required={field.is_mandatory}
          />
        )
      
      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Enter ${field.field_name.toLowerCase()}`}
            disabled={isReadOnly}
            required={field.is_mandatory}
          />
        )
      
      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isReadOnly}
            required={field.is_mandatory}
          />
        )
      
      case 'phone':
        return (
          <input
            type="tel"
            value={value}
            onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter phone number"
            disabled={isReadOnly}
            required={field.is_mandatory}
          />
        )
      
      case 'dropdown':
        return (
          <select
            value={value}
            onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isReadOnly}
            required={field.is_mandatory}
          >
            <option value="">Select an option</option>
            {field.options?.map((option, index) => (
              <option key={index} value={option}>
                {option}
              </option>
            ))}
          </select>
        )
      
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Enter ${field.field_name.toLowerCase()}`}
            disabled={isReadOnly}
            required={field.is_mandatory}
          />
        )
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                {renumeration.template?.name || 'Renumeration Form'}
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                {renumeration.template?.description || 'Fill out the form below'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form Closed Warning */}
          {!renumeration.template?.is_active && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start sm:items-center">
                <svg className="w-5 h-5 text-yellow-600 mr-2 shrink-0 mt-0.5 sm:mt-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm font-medium text-yellow-800">
                  This form is currently closed. You cannot submit or edit until it is reopened.
                </p>
              </div>
            </div>
          )}

          {/* Status Display */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-sm font-medium text-gray-700">Status:</span>
                <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  renumeration.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  renumeration.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                  renumeration.status === 'approved' ? 'bg-green-100 text-green-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {renumeration.status === 'submitted' 
                    ? 'Completed' 
                    : (renumeration.status || 'pending').charAt(0).toUpperCase() + (renumeration.status || 'pending').slice(1)}
                </span>
              </div>
              <div className="text-xs sm:text-sm text-gray-500">
                Created: {new Date(renumeration.created_at).toLocaleDateString()}
              </div>
            </div>
            {renumeration.submitted_at && (
              <div className="text-xs sm:text-sm text-gray-500 mt-1">
                Submitted: {new Date(renumeration.submitted_at).toLocaleDateString()}
              </div>
            )}
            {renumeration.approved_at && (
              <div className="text-xs sm:text-sm text-gray-500 mt-1">
                {renumeration.status === 'approved' ? 'Approved' : 'Rejected'}: {new Date(renumeration.approved_at).toLocaleDateString()}
                {renumeration.approved_by && ` by ${renumeration.approved_by}`}
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-6">
            {fields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {field.field_name}
                  {field.is_mandatory && <span className="text-red-500 ml-1">*</span>}
                </label>
                {renderField(field)}
                {field.field_type === 'dropdown' && field.options && (
                  <p className="text-xs text-gray-500 mt-1">
                    Options: {field.options.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between mt-8 pt-6 border-t border-gray-200 gap-4">
            <div className="w-full sm:w-auto">
              {renumeration.status === 'submitted' && renumeration.template?.is_active && (
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2 text-red-600 hover:text-red-800 transition-colors disabled:opacity-50 text-sm font-medium"
                >
                  Delete Response
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
                disabled={loading}
              >
                {renumeration.template?.is_active ? 'Cancel' : 'Close'}
              </button>
              {(renumeration.status === 'pending' || renumeration.status === 'submitted') && renumeration.template?.is_active && (
                <button
                  onClick={handleSubmit}
                  disabled={loading || renumeration.status === 'approved' || renumeration.status === 'rejected'}
                  className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {loading ? 'Saving...' : renumeration.status === 'submitted' ? 'Update Response' : 'Submit Response'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
