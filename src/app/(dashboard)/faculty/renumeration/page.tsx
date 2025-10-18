'use client'

import { useState, useEffect } from 'react'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { RenumerationService, RenumerationTemplate, PeerTutorRenumeration } from '@/lib/services/renumerationService'

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
  const [templates, setTemplates] = useState<RenumerationTemplate[]>([])
  const [submissions, setSubmissions] = useState<PeerTutorRenumeration[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'templates' | 'submissions'>('templates')

  useEffect(() => {
    if (user) {
      loadRenumerationData()
    }
  }, [user])

  const loadRenumerationData = async () => {
    if (!user) return

    setLoading(true)
    try {
      const [templatesData, submissionsData] = await Promise.all([
        RenumerationService.getRenumerationTemplates(user.id),
        RenumerationService.getRenumerationSubmissions(user.id)
      ])
      
      setTemplates(templatesData)
      setSubmissions(submissionsData)
    } catch (error) {
      console.error('Error loading renumeration data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    if (confirm('Are you sure you want to delete this renumeration template? This will also delete all associated submissions.')) {
      try {
        const success = await RenumerationService.deleteRenumerationTemplate(templateId)
        if (success) {
          loadRenumerationData()
        }
      } catch (error) {
        console.error('Error deleting template:', error)
      }
    }
  }

  const handleApproveReject = async (submissionId: string, status: 'approved' | 'rejected') => {
    if (!user) return

    try {
      const success = await RenumerationService.updateRenumerationStatus(submissionId, status, user.id)
      if (success) {
        loadRenumerationData()
      }
    } catch (error) {
      console.error('Error updating submission status:', error)
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
      <div className="flex-1 lg:ml-64 overflow-y-auto">
        <main className="p-6">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Renumeration Management</h1>
                <p className="text-gray-600 mt-2">Manage renumeration templates and submissions</p>
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

          {/* Tabs */}
          <div className="mb-6">
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

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Renumeration Templates</h2>
                <p className="text-sm text-gray-600">Manage your renumeration templates</p>
              </div>
              
              <div className="p-6">
                {templates.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
                    <p className="text-gray-500">Create your first renumeration template to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {templates.map((template) => (
                      <div key={template.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                            {template.description && (
                              <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                            )}
                            <div className="mt-2">
                              <span className="text-sm text-gray-500">
                                {template.fields.length} field(s) • Created {new Date(template.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              template.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {template.is_active ? 'Active' : 'Inactive'}
                            </span>
                            <button
                              onClick={() => handleDeleteTemplate(template.id)}
                              className="text-red-600 hover:text-red-800 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        
                        {/* Fields Preview */}
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Fields:</h4>
                          <div className="flex flex-wrap gap-2">
                            {template.fields.map((field) => (
                              <span
                                key={field.id}
                                className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800"
                              >
                                {field.field_name}
                                {field.is_mandatory && <span className="text-red-500 ml-1">*</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submissions Tab */}
          {activeTab === 'submissions' && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Renumeration Submissions</h2>
                <p className="text-sm text-gray-600">Review and manage peer tutor submissions</p>
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
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Submitted
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {submissions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
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
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(submission.status)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {submission.submitted_at 
                              ? new Date(submission.submitted_at).toLocaleDateString()
                              : '-'
                            }
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            {submission.status === 'submitted' && (
                              <div className="flex items-center justify-end space-x-2">
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
                            {submission.status === 'rejected' && (
                              <span className="text-red-600 text-sm">Rejected</span>
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
    </div>
  )
}
