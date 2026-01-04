'use client'

import { useState } from 'react'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { RenumerationService, RenumerationTemplate } from '@/lib/services/renumerationService'
import RenumerationModal from '@/components/forms/RenumerationModal'
import DeleteConfirmationModal from '@/components/forms/DeleteConfirmationModal'
import { useCachedData } from '@/lib/hooks/useCachedData'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'

export default function FacultyRenumerationPage() {
  return (
    <FacultyProtectedRoute>
      <FacultyRenumerationContent />
    </FacultyProtectedRoute>
  )
}

function FacultyRenumerationContent() {
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'templates' | 'submissions'>('templates')
  const [showRenumerationModal, setShowRenumerationModal] = useState(false)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [itemsToDelete, setItemsToDelete] = useState<Array<{name: string, description?: string, additionalInfo?: string}>>([])
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [selectedTemplateForView, setSelectedTemplateForView] = useState<RenumerationTemplate | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)

  // Fetch templates with caching
  const { data: templatesData, isLoading: templatesLoading, refresh: refreshTemplates, isRefreshing: isTemplatesRefreshing } = useCachedData({
    queryKey: ['renumeration-templates', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      return await RenumerationService.getRenumerationTemplates(user.id)
    },
    enabled: !!user?.id,
    initialData: [],
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch submissions with caching
  const { data: submissionsData, isLoading: submissionsLoading, refresh: refreshSubmissions, isRefreshing: isSubmissionsRefreshing } = useCachedData({
    queryKey: ['renumeration-submissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const submissions = await RenumerationService.getRenumerationSubmissions(user.id)
      // Filter out rejected submissions
      return submissions.filter(s => s.status !== 'rejected')
    },
    enabled: !!user?.id,
    initialData: [],
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const templates = templatesData || []
  const submissions = submissionsData || []
  const loading = templatesLoading || submissionsLoading
  
  // Use custom hook for sidebar collapsed state (reads from localStorage synchronously)
  const [isSidebarCollapsed] = useSidebarCollapsed()

  const handleRefresh = async () => {
    await Promise.all([refreshTemplates(), refreshSubmissions()])
    setLastRefresh(new Date())
  }

  const handleSelectAllTemplates = () => {
    if (selectedTemplates.size === templates.length) {
      setSelectedTemplates(new Set())
    } else {
      setSelectedTemplates(new Set(templates.map(t => t.id)))
    }
  }

  const handleSelectOneTemplate = (templateId: string) => {
    const newSelected = new Set(selectedTemplates)
    if (newSelected.has(templateId)) {
      newSelected.delete(templateId)
    } else {
      newSelected.add(templateId)
    }
    setSelectedTemplates(newSelected)
  }

  const toggleDeleteMode = () => {
    setIsDeleteMode(!isDeleteMode)
    setSelectedTemplates(new Set())
  }

  const cancelDeleteMode = () => {
    setIsDeleteMode(false)
    setSelectedTemplates(new Set())
  }

  const handleBulkDelete = () => {
    const idsToDelete = Array.from(selectedTemplates)
    const items = templates
      .filter(t => idsToDelete.includes(t.id))
      .map(t => ({
        name: t.name,
        description: t.description,
        additionalInfo: `${t.fields.length} field(s) • Created ${new Date(t.created_at).toLocaleDateString()}`
      }))
    
    setItemsToDelete(items)
    setShowDeleteModal(true)
  }

  const handleSingleDelete = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (template) {
      const items = [{
        name: template.name,
        description: template.description,
        additionalInfo: `${template.fields.length} field(s) • Created ${new Date(template.created_at).toLocaleDateString()}`
      }]
      setItemsToDelete(items)
      setSelectedTemplates(new Set([templateId]))
      setShowDeleteModal(true)
    }
  }

  const confirmDeleteTemplates = async () => {
    const idsToDelete = Array.from(selectedTemplates)
    
    for (const id of idsToDelete) {
      try {
        await RenumerationService.deleteRenumerationTemplate(id)
      } catch (error) {
        console.error('Error deleting template:', error)
      }
    }

    setSelectedTemplates(new Set())
    setShowDeleteModal(false)
    setIsDeleteMode(false)
    handleRefresh()
  }

  const handleApproveReject = async (submissionId: string, status: 'approved' | 'rejected') => {
    if (!user) return

    try {
      const success = await RenumerationService.updateRenumerationStatus(submissionId, status, user.id)
      if (success) {
        handleRefresh()
      }
    } catch (error) {
      console.error('Error updating submission status:', error)
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
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} overflow-y-auto`}>
        <PageHeader
          title="RENUMERATION MANAGEMENT"
          tagline="Templates & Submission Processing"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isTemplatesRefreshing || isSubmissionsRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />
        <main className={`${isSidebarCollapsed ? 'p-6 pl-4 lg:pl-4 lg:pr-6' : 'p-6'}`}>

          {/* Tabs */}
          <div className="mb-3">
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveTab('templates')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'templates'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Templates ({templates.length})
              </button>
              <button
                onClick={() => setActiveTab('submissions')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'submissions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Submissions ({submissions.length})
              </button>
            </nav>
          </div>

          {/* Summary Cards - Templates Tab */}
          {activeTab === 'templates' && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-3 mb-6">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Total Templates</dt>
                        <dd className="text-lg font-medium text-gray-900">{templates.length || 0}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Active Templates</dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {templates.filter(t => t.is_active).length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-purple-100 rounded-md flex items-center justify-center">
                        <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Total Fields</dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {templates.reduce((total, template) => total + template.fields.length, 0)}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary Cards - Submissions Tab */}
          {activeTab === 'submissions' && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-3 mb-6">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Total Submissions</dt>
                        <dd className="text-lg font-medium text-gray-900">{submissions.length}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-yellow-100 rounded-md flex items-center justify-center">
                        <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Pending</dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {submissions.filter(s => s.status === 'pending' || s.status === 'submitted').length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Approved</dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {submissions.filter(s => s.status === 'approved').length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 pb-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    Renumeration Templates ({templates.length})
                  </h3>
                  <div className="flex items-center space-x-3">
                    {isDeleteMode && (
                      <>
                        <button
                          onClick={cancelDeleteMode}
                          className="inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 shadow-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleBulkDelete}
                          disabled={selectedTemplates.size === 0}
                          className={`inline-flex items-center px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all duration-200 shadow-sm ${
                            selectedTemplates.size > 0
                              ? 'bg-red-600 hover:bg-red-700 cursor-pointer'
                              : 'bg-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete Selected {selectedTemplates.size > 0 && `(${selectedTemplates.size})`}
                        </button>
                      </>
                    )}
                    {!isDeleteMode && (
                      <>
                        <button
                          onClick={() => setShowRenumerationModal(true)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                        >
                          Create
                        </button>
                        {templates.length > 0 && (
                          <button
                            onClick={toggleDeleteMode}
                            className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-all duration-200 shadow-sm"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                {templates.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
                    <p className="text-gray-500 mb-4">Create your first renumeration template to get started.</p>
                    <button
                      onClick={() => setShowRenumerationModal(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Create New Template
                    </button>
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {isDeleteMode && (
                          <th className="px-6 py-3 text-left">
                            <input
                              type="checkbox"
                              checked={selectedTemplates.size === templates.length && templates.length > 0}
                              onChange={handleSelectAllTemplates}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                            />
                          </th>
                        )}
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Template Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Description
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Fields
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          {!isDeleteMode && (
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {templates.map((template) => (
                        <tr key={template.id} className="hover:bg-gray-50">
                          {isDeleteMode && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedTemplates.has(template.id)}
                                onChange={() => handleSelectOneTemplate(template.id)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{template.name}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-500 max-w-xs truncate">
                              {template.description || 'No description'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="text-sm font-semibold text-gray-900">
                              {template.fields.length}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(template.created_at).toLocaleDateString()}
                          </td>
                          {!isDeleteMode && (
                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={() => {
                                    setSelectedTemplateForView(template)
                                    setShowViewModal(true)
                                  }}
                                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                                >
                                  VIEW
                                </button>
                                <button
                                  onClick={() => handleSingleDelete(template.id)}
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Submissions Tab */}
          {activeTab === 'submissions' && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Renumeration Submissions ({submissions.length})
                </h3>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Peer Tutor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Template
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Submitted
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {submissions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                          <div className="flex flex-col items-center">
                            <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-lg font-medium text-gray-900 mb-2">No submissions found</p>
                            <p className="text-sm text-gray-500">Submissions will appear here when peer tutors respond to renumeration requests.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      submissions.map((submission) => (
                        <tr key={submission.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {submission.peer_tutor?.name || 'Unknown'}
                              </div>
                              <div className="text-sm text-gray-500">
                                {submission.peer_tutor?.email || 'Unknown'}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {submission.template?.name || 'Unknown Template'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {submission.submitted_at 
                              ? new Date(submission.submitted_at).toLocaleDateString()
                              : '-'
                            }
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                            {submission.status === 'submitted' && (
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleApproveReject(submission.id, 'approved')}
                                  className="text-green-600 hover:text-green-900 transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleApproveReject(submission.id, 'rejected')}
                                  className="text-red-600 hover:text-red-900 transition-colors"
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                            {submission.status === 'approved' && (
                              <span className="text-green-600 text-sm">Approved</span>
                            )}
                            {submission.status === 'pending' && (
                              <span className="text-gray-500 text-sm">Pending</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Renumeration Modal */}
      {user && (
        <RenumerationModal
          isOpen={showRenumerationModal}
          onClose={() => setShowRenumerationModal(false)}
          onSuccess={handleRefresh}
          facultyId={user.id}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setItemsToDelete([])
        }}
        onConfirm={confirmDeleteTemplates}
        title="Confirm Template Deletion"
        itemsToDelete={itemsToDelete.map(item => ({
          name: item.name,
          email: item.description,
          additionalInfo: item.additionalInfo
        }))}
        type="all"
      />

      {/* Template View Modal */}
      {showViewModal && selectedTemplateForView && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedTemplateForView.name}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Template Details
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowViewModal(false)
                    setSelectedTemplateForView(null)
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Template Information */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <div className="text-sm text-gray-900 bg-gray-50 rounded-md p-3">
                    {selectedTemplateForView.description || 'No description provided'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <div className="text-sm">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      selectedTemplateForView.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedTemplateForView.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Created Date
                  </label>
                  <div className="text-sm text-gray-900">
                    {new Date(selectedTemplateForView.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fields ({selectedTemplateForView.fields.length})
                  </label>
                  <div className="space-y-3">
                    {selectedTemplateForView.fields.length > 0 ? (
                      selectedTemplateForView.fields.map((field, index) => (
                        <div key={index} className="bg-gray-50 rounded-md p-4 border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-900">
                              {field.field_name}
                              {field.is_mandatory && <span className="text-red-500 ml-1">*</span>}
                            </span>
                            <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">
                              {field.field_type}
                            </span>
                          </div>
                          {field.field_type === 'dropdown' && field.options && field.options.length > 0 && (
                            <div className="mt-2">
                              <span className="text-xs text-gray-600">Options: </span>
                              <span className="text-xs text-gray-900">
                                {field.options.join(', ')}
                              </span>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500 italic">No fields defined</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setShowViewModal(false)
                    setSelectedTemplateForView(null)
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
