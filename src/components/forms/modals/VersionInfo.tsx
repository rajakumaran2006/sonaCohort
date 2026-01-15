'use client'

import { useState } from 'react'
import { logger } from '@/lib/logger'
import { FeedbackForm } from '@/lib/services/feedbackService'
import { FeedbackVersioningService, FeedbackFormVersion } from '@/lib/services/feedbackVersioningService'

interface VersionInfoProps {
  form: FeedbackForm
}

export default function VersionInfo({ form }: VersionInfoProps) {
  const [showVersions, setShowVersions] = useState(false)
  const [versions, setVersions] = useState<FeedbackFormVersion[]>([])
  const [loading, setLoading] = useState(false)

  const handleViewVersions = async () => {
    if (versions.length > 0) {
      setShowVersions(true)
      return
    }

    setLoading(true)
    try {
      const formVersions = await FeedbackVersioningService.getFormVersions(form.id)
      setVersions(formVersions)
      setShowVersions(true)
    } catch (error) {
      logger.error('Error loading versions:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">
          v{form.current_version?.version_number || 1}
        </span>
        {form.total_versions && form.total_versions > 1 && (
          <button
            onClick={handleViewVersions}
            disabled={loading}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            {loading ? 'Loading...' : `(${form.total_versions} versions)`}
          </button>
        )}
      </div>

      {/* Versions Modal */}
      {showVersions && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Form Versions - {form.name}
                </h3>
                <button
                  onClick={() => setShowVersions(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {versions.map((version) => (
                  <div 
                    key={version.id} 
                    className={`border rounded-lg p-4 ${
                      version.is_active 
                        ? 'border-green-200 bg-green-50' 
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900">
                          Version {version.version_number}
                        </span>
                        {version.is_active && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(version.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 mb-2">
                      <strong>Name:</strong> {version.name}
                    </div>
                    
                    {version.description && (
                      <div className="text-sm text-gray-600 mb-2">
                        <strong>Description:</strong> {version.description}
                      </div>
                    )}
                    
                    <div className="text-sm text-gray-600">
                      <strong>Questions:</strong> {version.questions?.length || 0}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end pt-4 border-t mt-4">
                <button
                  onClick={() => setShowVersions(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
