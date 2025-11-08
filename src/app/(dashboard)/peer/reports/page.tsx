'use client'

import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { ReportService, PeerTutorReportData } from '@/lib/services/reportService'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
import ExcelExportModal from '@/components/forms/ExcelExportModal'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { useCachedData } from '@/lib/hooks/useCachedData'

export default function PeerReportsPage() {
  return (
    <PeerProtectedRoute>
      <PeerReportsContent />
    </PeerProtectedRoute>
  )
}

function PeerReportsContent() {
  const { user } = useAuth()
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Use custom hook for sidebar collapsed state
  const [isSidebarCollapsed] = useSidebarCollapsed()

  // Fetch peer tutor info with caching
  const { data: tutorInfoData, isLoading: tutorLoading, refresh: refreshTutor } = useCachedData({
    queryKey: ['peer-tutor-info', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await PeerTutorAuthService.getPeerTutorByEmail(user.email)
    },
    enabled: !!user?.email,
    initialData: null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch report data with caching
  const { data: reportData, isLoading: reportLoading, refresh: refreshReport, isRefreshing: isReportRefreshing } = useCachedData({
    queryKey: ['peer-tutor-report', tutorInfoData?.id],
    queryFn: async () => {
      if (!tutorInfoData?.id) return null
      return await ReportService.getPeerTutorReportData(tutorInfoData.id)
    },
    enabled: !!tutorInfoData?.id,
    initialData: null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const loading = tutorLoading || reportLoading
  const peerTutorInfo = tutorInfoData

  const handleRefresh = async () => {
    await Promise.all([refreshTutor(), refreshReport()])
    setLastRefresh(new Date())
  }

  const handleSubjectClick = (subjectName: string, classId: string) => {
    if (peerTutorInfo) {
      // Use query parameters instead of nested routes
      const route = `/peer/reports/subject?tutorId=${peerTutorInfo.id}&subjectId=${classId}&subjectName=${encodeURIComponent(subjectName)}`
      router.push(route)
    }
  }

  const handleExportExcel = () => {
    setShowExportModal(true)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="transition-all duration-300 lg:ml-64 min-h-screen flex flex-col overflow-hidden">
        {/* Top Header */}
        <PageHeader
          title="MY REPORTS"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isReportRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
            {loading ? (
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading your reports...</p>
                </div>
              </div>
            ) : reportData ? (
              <div className="space-y-6">
                {/* Peer Tutor Info */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0 h-16 w-16">
                      <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 font-medium text-xl">
                          {reportData.peer_tutor_name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-gray-900">{reportData.peer_tutor_name}</h2>
                      <p className="text-gray-600">{reportData.peer_tutor_email}</p>
                      <div className="mt-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                          {reportData.dept} - {reportData.year} - {reportData.section}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Total Subjects</p>
                        <p className="text-2xl font-semibold text-gray-900">{reportData.subjects.length}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Completed Classes</p>
                        <p className="text-2xl font-semibold text-gray-900">
                          {reportData.subjects.reduce((sum, subject) => sum + subject.completed_classes, 0)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Pending Classes</p>
                        <p className="text-2xl font-semibold text-gray-900">
                          {reportData.subjects.reduce((sum, subject) => sum + subject.pending_classes, 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subjects Table */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">My Subjects</h3>
                        <p className="text-sm text-gray-500">
                          {loading ? 'Loading...' : `${reportData.subjects.length} subject(s) assigned`}
                        </p>
                      </div>
                      <button
                        onClick={handleExportExcel}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center space-x-2 transition-colors shadow-sm"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>Export Excel</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                    {reportData.subjects.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No subjects assigned</h3>
                        <p className="text-gray-500">You haven't been assigned to any subjects yet.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Subject Name
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Scheduled Classes
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Completed Classes
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Additional Classes
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Pending Classes
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Completion Rate
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {reportData.subjects.map((subject) => {
                              // Calculate completion rate: (completed + additional) / scheduled
                              const totalTaken = subject.completed_classes + subject.additional_classes
                              const completionRate = subject.total_classes > 0 
                                ? Math.round((totalTaken / subject.total_classes) * 100)
                                : 0
                              
                              return (
                                <tr key={subject.class_id} className="hover:bg-blue-50 transition-colors duration-200">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <button
                                      onClick={() => handleSubjectClick(subject.subject_name, subject.class_id)}
                                      className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                                    >
                                      {subject.subject_name}
                                    </button>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="text-sm font-semibold text-gray-900">
                                      {subject.total_classes}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="text-sm font-semibold text-green-600">
                                      {subject.completed_classes}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="text-sm font-semibold text-purple-600">
                                      {subject.additional_classes}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="text-sm font-semibold text-yellow-600">
                                      {subject.pending_classes}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="flex items-center justify-center">
                                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                        <div 
                                          className="bg-blue-600 h-2 rounded-full" 
                                          style={{ width: `${completionRate}%` }}
                                        ></div>
                                      </div>
                                      <span className="text-sm font-medium text-gray-900">
                                        {completionRate}%
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to load reports</h3>
                <p className="text-gray-500 mb-6">There was an error loading your report data. Please try again.</p>
                <button
                  onClick={handleRefresh}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Excel Export Modal */}
      {showExportModal && (
        <ExcelExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          peerTutorInfo={peerTutorInfo}
          reportData={reportData}
        />
      )}
    </div>
  )
}
