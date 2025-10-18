'use client'

import { useState, useEffect } from 'react'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { RenumerationService, PeerTutorRenumeration } from '@/lib/services/renumerationService'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'

export default function PeerRenumerationPage() {
  return (
    <PeerProtectedRoute>
      <PeerRenumerationContent />
    </PeerProtectedRoute>
  )
}

function PeerRenumerationContent() {
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [peerTutorInfo, setPeerTutorInfo] = useState<any>(null)
  const [renumerations, setRenumerations] = useState<PeerTutorRenumeration[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [fieldResponses, setFieldResponses] = useState<Record<string, Record<string, any>>>({})

  useEffect(() => {
    if (user) {
      loadPeerTutorData()
    }
  }, [user])

  const loadPeerTutorData = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // Get peer tutor information
      const tutorInfo = await PeerTutorAuthService.getPeerTutorByEmail(user.email)
      if (tutorInfo) {
        setPeerTutorInfo(tutorInfo)
        
        // Get renumeration data
        const renumerationData = await RenumerationService.getPeerTutorRenumeration(tutorInfo.id)
        setRenumerations(renumerationData)
        
        // Initialize field responses
        const responses: Record<string, Record<string, any>> = {}
        renumerationData.forEach(renumeration => {
          responses[renumeration.id] = renumeration.field_responses || {}
        })
        setFieldResponses(responses)
      }
    } catch (error) {
      console.error('Error loading peer tutor data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFieldChange = (renumerationId: string, fieldName: string, value: any) => {
    setFieldResponses(prev => ({
      ...prev,
      [renumerationId]: {
        ...prev[renumerationId],
        [fieldName]: value
      }
    }))
  }

  const handleSubmit = async (renumerationId: string) => {
    if (!fieldResponses[renumerationId]) return

    setSubmitting(renumerationId)
    try {
      const success = await RenumerationService.submitRenumerationResponse(
        renumerationId,
        fieldResponses[renumerationId]
      )
      
      if (success) {
        loadPeerTutorData() // Reload data to show updated status
      }
    } catch (error) {
      console.error('Error submitting renumeration:', error)
    } finally {
      setSubmitting(null)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      submitted: { color: 'bg-blue-100 text-blue-800', label: 'Submitted' },
      approved: { color: 'bg-green-100 text-green-800', label: 'Approved' },
      rejected: { color: 'bg-red-100 text-red-800', label: 'Rejected' }
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const renderField = (renumeration: PeerTutorRenumeration, field: any) => {
    const fieldId = `${renumeration.id}_${field.field_name}`
    const value = fieldResponses[renumeration.id]?.[field.field_name] || ''

    switch (field.field_type) {
      case 'text':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(renumeration.id, field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Enter ${field.field_name}`}
            disabled={renumeration.status !== 'pending'}
          />
        )
      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(renumeration.id, field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Enter ${field.field_name}`}
            disabled={renumeration.status !== 'pending'}
          />
        )
      case 'email':
        return (
          <input
            type="email"
            value={value}
            onChange={(e) => handleFieldChange(renumeration.id, field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Enter ${field.field_name}`}
            disabled={renumeration.status !== 'pending'}
          />
        )
      case 'phone':
        return (
          <input
            type="tel"
            value={value}
            onChange={(e) => handleFieldChange(renumeration.id, field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Enter ${field.field_name}`}
            disabled={renumeration.status !== 'pending'}
          />
        )
      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleFieldChange(renumeration.id, field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={renumeration.status !== 'pending'}
          />
        )
      case 'dropdown':
        return (
          <select
            value={value}
            onChange={(e) => handleFieldChange(renumeration.id, field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={renumeration.status !== 'pending'}
          >
            <option value="">Select {field.field_name}</option>
            {field.options?.map((option: string, index: number) => (
              <option key={index} value={option}>{option}</option>
            ))}
          </select>
        )
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(renumeration.id, field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Enter ${field.field_name}`}
            disabled={renumeration.status !== 'pending'}
          />
        )
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading renumeration data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 overflow-y-auto">
        <main className="p-6">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Renumeration</h1>
                <p className="text-gray-600 mt-2">View and submit your renumeration requests</p>
              </div>
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>

          {/* Renumeration List */}
          <div className="space-y-6">
            {renumerations.length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-12">
                <div className="text-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No renumeration requests</h3>
                  <p className="text-gray-500">You don't have any renumeration requests at the moment.</p>
                </div>
              </div>
            ) : (
              renumerations.map((renumeration) => (
                <div key={renumeration.id} className="bg-white rounded-xl shadow-lg border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                          {renumeration.template?.name || 'Renumeration Request'}
                        </h2>
                        {renumeration.template?.description && (
                          <p className="text-sm text-gray-600 mt-1">
                            {renumeration.template.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center space-x-3">
                        {getStatusBadge(renumeration.status)}
                        <span className="text-sm text-gray-500">
                          Created {new Date(renumeration.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6">
                    {renumeration.template?.fields && renumeration.template.fields.length > 0 ? (
                      <div className="space-y-4">
                        {renumeration.template.fields.map((field) => (
                          <div key={field.id}>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              {field.field_name}
                              {field.is_mandatory && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            {renderField(renumeration, field)}
                          </div>
                        ))}
                        
                        {renumeration.status === 'pending' && (
                          <div className="pt-4 border-t border-gray-200">
                            <button
                              onClick={() => handleSubmit(renumeration.id)}
                              disabled={submitting === renumeration.id}
                              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {submitting === renumeration.id ? 'Submitting...' : 'Submit Response'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500">No fields configured for this renumeration.</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

