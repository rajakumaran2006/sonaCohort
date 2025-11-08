'use client'

import { useState, useEffect } from 'react'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
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
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Use custom hook for sidebar collapsed state
  const [isSidebarCollapsed] = useSidebarCollapsed()

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
        
        // Get renumeration data and filter out rejected items
        const renumerationData = await RenumerationService.getPeerTutorRenumeration(tutorInfo.id)
        const filteredData = renumerationData.filter(r => r.status !== 'rejected')
        setRenumerations(filteredData)
        
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

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await loadPeerTutorData()
      setLastRefresh(new Date())
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
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
            disabled={renumeration.status !== 'pending' || !renumeration.template?.is_active}
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
            disabled={renumeration.status !== 'pending' || !renumeration.template?.is_active}
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
            disabled={renumeration.status !== 'pending' || !renumeration.template?.is_active}
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
            disabled={renumeration.status !== 'pending' || !renumeration.template?.is_active}
          />
        )
      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleFieldChange(renumeration.id, field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={renumeration.status !== 'pending' || !renumeration.template?.is_active}
          />
        )
      case 'dropdown':
        return (
          <select
            value={value}
            onChange={(e) => handleFieldChange(renumeration.id, field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={renumeration.status !== 'pending' || !renumeration.template?.is_active}
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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
        {/* Top Header */}
        <PageHeader
          title="RENUMERATION"
          subtitle="View and submit your renumeration requests"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className={`max-w-7xl mx-auto py-8 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-0' : 'px-4 sm:px-6 lg:px-8'}`}>
          {loading ? (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading renumeration data...</p>
              </div>
            </div>
          ) : (
            <>

          {/* Renumeration List */}
          <div className="space-y-6">
            {renumerations.length === 0 ? (
              <div className="bg-white shadow rounded-lg p-12">
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
                <div key={renumeration.id} className="bg-white shadow rounded-lg">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {renumeration.template?.name || 'Renumeration Request'}
                        </h3>
                        {renumeration.template?.description && (
                          <p className="text-sm text-gray-600 mt-1">
                            {renumeration.template.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-sm text-gray-500">
                          Created {new Date(renumeration.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6">
                    {!renumeration.template?.is_active && (
                      <div className="mb-4 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                        This form is currently closed. You cannot submit or edit until it is reopened.
                      </div>
                    )}
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
                        
                        {renumeration.status === 'pending' && renumeration.template?.is_active && (
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
            </>
          )}
          </div>
        </main>
      </div>
    </div>
  )
}

