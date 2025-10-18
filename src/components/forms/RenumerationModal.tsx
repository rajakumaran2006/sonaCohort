'use client'

import { useState } from 'react'
import { RenumerationService, RenumerationField } from '@/lib/services/renumerationService'

interface RenumerationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  facultyId: string
}

interface FieldConfig {
  field_name: string
  field_type: 'text' | 'number' | 'date' | 'email' | 'phone' | 'dropdown'
  is_mandatory: boolean
  options?: string[]
}

export default function RenumerationModal({ isOpen, onClose, onSuccess, facultyId }: RenumerationModalProps) {
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [fields, setFields] = useState<FieldConfig[]>([
    { field_name: '', field_type: 'text', is_mandatory: false }
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fieldTypes = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'dropdown', label: 'Dropdown' }
  ]

  const handleAddField = () => {
    setFields([...fields, { field_name: '', field_type: 'text', is_mandatory: false }])
  }

  const handleRemoveField = (index: number) => {
    if (fields.length > 1) {
      setFields(fields.filter((_, i) => i !== index))
    }
  }

  const handleFieldChange = (index: number, field: Partial<FieldConfig>) => {
    const newFields = [...fields]
    newFields[index] = { ...newFields[index], ...field }
    setFields(newFields)
  }

  const handleAddOption = (fieldIndex: number) => {
    const newFields = [...fields]
    if (!newFields[fieldIndex].options) {
      newFields[fieldIndex].options = []
    }
    newFields[fieldIndex].options!.push('')
    setFields(newFields)
  }

  const handleRemoveOption = (fieldIndex: number, optionIndex: number) => {
    const newFields = [...fields]
    newFields[fieldIndex].options!.splice(optionIndex, 1)
    setFields(newFields)
  }

  const handleOptionChange = (fieldIndex: number, optionIndex: number, value: string) => {
    const newFields = [...fields]
    newFields[fieldIndex].options![optionIndex] = value
    setFields(newFields)
  }

  const validateForm = () => {
    if (!templateName.trim()) {
      setError('Template name is required')
      return false
    }

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]
      if (!field.field_name.trim()) {
        setError(`Field ${i + 1} name is required`)
        return false
      }

      if (field.field_type === 'dropdown' && (!field.options || field.options.length === 0)) {
        setError(`Field ${i + 1} (${field.field_name}) requires at least one option`)
        return false
      }

      if (field.field_type === 'dropdown' && field.options) {
        for (let j = 0; j < field.options.length; j++) {
          if (!field.options[j].trim()) {
            setError(`Field ${i + 1} (${field.field_name}) option ${j + 1} cannot be empty`)
            return false
          }
        }
      }
    }

    setError('')
    return true
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    setLoading(true)
    try {
      console.log('Creating renumeration template with data:', {
        templateName,
        templateDescription,
        facultyId,
        fields
      })
      
      // Create the template
      const template = await RenumerationService.createRenumerationTemplate(
        templateName,
        templateDescription,
        facultyId,
        fields
      )

      if (!template) {
        setError('Failed to create renumeration template')
        return
      }

      // Send to all peer tutors
      const success = await RenumerationService.sendRenumerationToAllPeerTutors(template.id)

      if (!success) {
        setError('Failed to send renumeration to peer tutors')
        return
      }

      // Reset form
      setTemplateName('')
      setTemplateDescription('')
      setFields([{ field_name: '', field_type: 'text', is_mandatory: false }])
      setError('')

      onSuccess()
      onClose()
    } catch (error) {
      console.error('Error creating renumeration:', error)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setTemplateName('')
    setTemplateDescription('')
    setFields([{ field_name: '', field_type: 'text', is_mandatory: false }])
    setError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Send Renumeration</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-6">
            {/* Template Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Template Information</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter template name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Enter template description"
                />
              </div>
            </div>

            {/* Fields Configuration */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Fields Configuration</h3>
                <button
                  type="button"
                  onClick={handleAddField}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add Field
                </button>
              </div>

              {fields.map((field, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium text-gray-900">Field {index + 1}</h4>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveField(index)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Field Name *
                      </label>
                      <input
                        type="text"
                        value={field.field_name}
                        onChange={(e) => handleFieldChange(index, { field_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter field name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Field Type *
                      </label>
                      <select
                        value={field.field_type}
                        onChange={(e) => handleFieldChange(index, { field_type: e.target.value as any })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {fieldTypes.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={field.is_mandatory}
                          onChange={(e) => handleFieldChange(index, { is_mandatory: e.target.checked })}
                          className="mr-2"
                        />
                        <span className="text-sm font-medium text-gray-700">Mandatory</span>
                      </label>
                    </div>
                  </div>

                  {/* Dropdown Options */}
                  {field.field_type === 'dropdown' && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Options *
                        </label>
                        <button
                          type="button"
                          onClick={() => handleAddOption(index)}
                          className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
                        >
                          Add Option
                        </button>
                      </div>
                      
                      {field.options?.map((option, optionIndex) => (
                        <div key={optionIndex} className="flex items-center gap-2 mb-2">
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => handleOptionChange(index, optionIndex, e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={`Option ${optionIndex + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(index, optionIndex)}
                            className="text-red-600 hover:text-red-800 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4 mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={handleClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send Renumeration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
