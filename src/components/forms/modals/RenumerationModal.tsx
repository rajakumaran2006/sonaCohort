'use client'

import { useState } from 'react'
import { RenumerationService } from '@/lib/services/renumerationService'

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
    { field_name: '', field_type: 'text', is_mandatory: true }
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
    setFields([...fields, { field_name: '', field_type: 'text', is_mandatory: true }])
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
      const { template, error: createError } = await RenumerationService.createRenumerationTemplate(
        templateName,
        templateDescription,
        facultyId,
        fields
      )

      if (!template || createError) {
        setError(createError || 'Failed to create renumeration template')
        return
      }

      // Send to all peer tutors
      const { success, error: sendError } = await RenumerationService.sendRenumerationToAllpeerTutor(template.id, facultyId)

      if (!success || sendError) {
        setError(sendError || 'Failed to Send')
        return
      }

      // Reset form
      setTemplateName('')
      setTemplateDescription('')
      setFields([{ field_name: '', field_type: 'text', is_mandatory: true }])
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
    setFields([{ field_name: '', field_type: 'text', is_mandatory: true }])
    setError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 sm:p-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-300">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Send Renumeration</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">
                Template Configuration & Peer Tutor Notification
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>



          <div className="space-y-6">
            {/* Template Information */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Template Information</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Template Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="e.g., Monthly Peer Tutor Renumeration"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Description
                  </label>
                  <textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[42px]"
                    rows={1}
                    placeholder="Enter brief template description"
                  />
                </div>
              </div>
            </div>

            {/* Fields Configuration */}
            <div className="space-y-6 pt-6 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Fields Configuration</h3>
                </div>
                <button
                  type="button"
                  onClick={handleAddField}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Field
                </button>
              </div>

              {fields.map((field, index) => (
                <div key={index} className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm group hover:border-gray-200 transition-all">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">
                          F{index + 1}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Field {index + 1}</h4>
                    </div>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveField(index)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all group-hover:opacity-100"
                        title="Remove field"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Field Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={field.field_name}
                        onChange={(e) => handleFieldChange(index, { field_name: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        placeholder="e.g., Bank Name"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Field Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={field.field_type}
                        onChange={(e) => handleFieldChange(index, { field_type: e.target.value as FieldConfig['field_type'] })}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                      >
                        {fieldTypes.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center pt-6">
                      <label className="flex items-center cursor-pointer group/check">
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={field.is_mandatory}
                            onChange={(e) => handleFieldChange(index, { is_mandatory: e.target.checked })}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 transition-all"
                          />
                        </div>
                        <span className="ml-2 text-xs font-bold text-gray-500 uppercase tracking-wider group-hover/check:text-gray-700 transition-colors">Mandatory</span>
                      </label>
                    </div>
                  </div>

                  {/* Dropdown Options */}
                  {field.field_type === 'dropdown' && (
                    <div className="pt-6 border-t border-gray-50">
                      <div className="flex items-center justify-between mb-4">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Dropdown Options <span className="text-red-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleAddOption(index)}
                          className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-green-600 uppercase tracking-widest hover:bg-green-50 hover:text-green-700 transition-all shadow-sm flex items-center gap-1.5"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Option
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {field.options?.map((option, optionIndex) => (
                          <div key={optionIndex} className="flex items-center gap-2 group/opt">
                            <div className="flex-1 relative">
                              <input
                                type="text"
                                value={option}
                                onChange={(e) => handleOptionChange(index, optionIndex, e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder={`Option ${optionIndex + 1}`}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(index, optionIndex)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover/opt:opacity-100"
                              title="Remove option"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-8 mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-bold text-red-800">Error Creating Template</h4>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-4 mt-6 pt-6 border-t border-gray-100">
            <button
              onClick={handleClose}
              className="px-6 py-2.5 rounded-lg text-sm font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 transition-all"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-8 py-2.5 bg-gray-800 text-white rounded-lg text-sm font-bold uppercase tracking-widest hover:bg-gray-900 transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
              {loading ? 'Sending...' : 'Send Renumeration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
