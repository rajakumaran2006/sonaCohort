'use client'

import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { ReportService } from '@/lib/services/reportService'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import * as XLSX from 'xlsx'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { useCachedData } from '@/lib/hooks/useCachedData'
import PeerTopicSheet from '@/components/reports/PeerTopicSheet'
import PeerAttendanceSheet from '@/components/reports/PeerAttendanceSheet'
import ExportButton from '@/components/ui/ExportButton'
import { toast } from 'sonner'

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

  const [activeTab, setActiveTab] = useState<'overview' | 'topic-sheet' | 'attendance-sheet'>('overview')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Use custom hook for sidebar collapsed state
  const [isSidebarCollapsed] = useSidebarCollapsed()

  // Fetch peer tutor info with caching
  const { data: tutorInfoData, isLoading: tutorLoading, refresh: refreshTutor } = useCachedData({
    queryKey: ['peer-tutor-info', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await peertutorsAuthService.getpeertutorsByEmail(user.email)
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
      return await ReportService.getpeertutorsReportData(tutorInfoData.id)
    },
    enabled: !!tutorInfoData?.id,
    initialData: null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const loading = tutorLoading || reportLoading
  const peertutorsInfo = tutorInfoData

  const handleRefresh = async () => {
    await Promise.all([refreshTutor(), refreshReport()])
    setLastRefresh(new Date())
  }

  const handleSubjectClick = (subjectName: string, classId: string) => {
    if (peertutorsInfo) {
      // Use query parameters instead of nested routes
      const route = `/peer/reports/subject?tutorId=${peertutorsInfo.id}&subjectId=${classId}&subjectName=${encodeURIComponent(subjectName)}`
      router.push(route)
    }
  }

  const handleExportExcel = () => {
    if (!reportData || !peertutorsInfo) {
      toast.error('No data available to export')
      return
    }

    try {
      // Create workbook
      const workbook = XLSX.utils.book_new()

      // Prepare data for export
      const data: (string | number)[][] = []

      // Add header row
      data.push([
        'Subject Name',
        'Scheduled Classes',
        'Completed Classes',
        'Additional Classes',
        'Pending Classes',
        'Total Classes Taken',
        'Completion Rate (%)'
      ])

      // Add data for each subject
      for (const subject of reportData.subjects) {
        const totalTaken = subject.completed_classes + (subject.additional_classes || 0)
        const completionRate = subject.total_classes > 0 
          ? Math.round((totalTaken / subject.total_classes) * 100)
          : 0

        data.push([
          subject.subject_name,
          subject.total_classes,
          subject.completed_classes > 0 ? subject.completed_classes : '',
          (subject.additional_classes || 0) > 0 ? (subject.additional_classes || 0) : '',
          subject.pending_classes,
          totalTaken > 0 ? totalTaken : '',
          totalTaken > 0 ? completionRate : ''
        ])
      }

      // Add summary row
      const totalScheduled = reportData.subjects.reduce((sum, s) => sum + s.total_classes, 0)
      const totalCompleted = reportData.subjects.reduce((sum, s) => sum + s.completed_classes, 0)
      const totalAdditional = reportData.subjects.reduce((sum, s) => sum + (s.additional_classes || 0), 0)
      const totalPending = reportData.subjects.reduce((sum, s) => sum + s.pending_classes, 0)
      const grandTotalTaken = totalCompleted + totalAdditional
      const overallRate = totalScheduled > 0 ? Math.round((grandTotalTaken / totalScheduled) * 100) : 0

      data.push([]) // Empty row before summary
      data.push([
        'TOTAL',
        totalScheduled,
        totalCompleted > 0 ? totalCompleted : '',
        totalAdditional > 0 ? totalAdditional : '',
        totalPending,
        grandTotalTaken > 0 ? grandTotalTaken : '',
        grandTotalTaken > 0 ? overallRate : ''
      ])

      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(data)

      // Set column widths
      worksheet['!cols'] = [
        { wch: 30 }, // Subject Name
        { wch: 18 }, // Scheduled
        { wch: 18 }, // Completed
        { wch: 18 }, // Additional
        { wch: 15 }, // Pending
        { wch: 20 }, // Total Taken
        { wch: 18 }  // Completion Rate
      ]

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Subject Report')

      // Generate filename
      const fileName = `Subject_Report_${peertutorsInfo.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`

      // Download file
      XLSX.writeFile(workbook, fileName)

      toast.success('Report exported successfully!')
    } catch {
      toast.error('Failed to export report')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden w-full lg:w-auto`}>
        {/* Top Header */}
        <PageHeader
          title="REPORTS"
          tagline="Performance Analytics & Insights"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isReportRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

      {/* Tab Navigation */}
        <div className="px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-white rounded-lg sm:rounded-xl border border-gray-100 shadow-sm">
            <nav className="flex space-x-2 p-2 overflow-x-auto no-scrollbar" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                  activeTab === 'overview'
                    ? 'bg-black text-white shadow-lg shadow-gray-200 scale-105' 
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                OVERVIEW
              </button>
              <button
                onClick={() => setActiveTab('topic-sheet')}
                className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                  activeTab === 'topic-sheet'
                    ? 'bg-black text-white shadow-lg shadow-gray-200 scale-105' 
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                TOPIC SHEET
              </button>
              <button
                onClick={() => setActiveTab('attendance-sheet')}
                className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                  activeTab === 'attendance-sheet'
                    ? 'bg-black text-white shadow-lg shadow-gray-200 scale-105' 
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                ATTENDANCE SHEET
              </button>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
            {loading ? (
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading</span>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'overview' && reportData ? (
                  <div className="space-y-6">
                    
                    {/* Stats Overview */}
                    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-8">
                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 relative group overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Total Subjects</p>
                            <p className="text-3xl font-bold text-gray-900 tracking-tight">{reportData.subjects.length}</p>
                          </div>
                          <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                            <svg className="w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" fill="currentColor">
                              <path d="M 5 4 C 3.895 4 3 4.895 3 6 L 3 9 L 3 25 A 1.0001 1.0001 0 0 0 4 26 L 26 26 A 1.0001 1.0001 0 0 0 27 25 L 27 8 L 27 6 C 27 4.895 26.105 4 25 4 L 5 4 z M 5 9 L 25 9 L 25 24 L 5 24 L 5 9 z M 9 11 A 1.0001 1.0001 0 1 0 9 13 L 9 15 A 1.0001 1.0001 0 1 0 11 15 L 11 12 A 1.0001 1.0001 0 0 0 10 11 L 9 11 z M 15 11 C 13.895 11 13 11.895 13 13 L 13 14 C 13 15.105 13.895 16 15 16 C 16.105 16 17 15.105 17 14 L 17 13 C 17 11.895 16.105 11 15 11 z M 20 11 A 1.0001 1.0001 0 1 0 20 13 L 20 15 A 1.0001 1.0001 0 1 0 22 15 L 22 12 A 1.0001 1.0001 0 0 0 21 11 L 20 11 z M 10 17 C 8.895 17 8 17.895 8 19 L 8 20 C 8 21.105 8.895 22 10 22 C 11.105 22 12 21.105 12 20 L 12 19 C 12 17.895 11.105 17 10 17 z M 15 17 A 1.0001 1.0001 0 1 0 15 19 L 15 21 A 1.0001 1.0001 0 1 0 17 21 L 17 18 A 1.0001 1.0001 0 0 0 16 17 L 15 17 z M 20 17 A 1.0001 1.0001 0 1 0 20 19 L 20 21 A 1.0001 1.0001 0 1 0 22 21 L 22 18 A 1.0001 1.0001 0 0 0 21 17 L 20 17 z" />
                            </svg>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                               Assigned
                            </p>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 relative group overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Completed Classes</p>
                            <p className="text-3xl font-bold text-gray-900 tracking-tight">
                              {reportData.subjects.reduce((sum, subject) => sum + subject.completed_classes, 0)}
                            </p>
                          </div>
                          <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                            <svg className="w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" fill="currentColor">
                              <path d="M 5 4 C 3.895 4 3 4.895 3 6 L 3 9 L 3 25 A 1.0001 1.0001 0 0 0 4 26 L 26 26 A 1.0001 1.0001 0 0 0 27 25 L 27 8 L 27 6 C 27 4.895 26.105 4 25 4 L 5 4 z M 5 9 L 25 9 L 25 24 L 5 24 L 5 9 z M 9 11 A 1.0001 1.0001 0 1 0 9 13 L 9 15 A 1.0001 1.0001 0 1 0 11 15 L 11 12 A 1.0001 1.0001 0 0 0 10 11 L 9 11 z M 15 11 C 13.895 11 13 11.895 13 13 L 13 14 C 13 15.105 13.895 16 15 16 C 16.105 16 17 15.105 17 14 L 17 13 C 17 11.895 16.105 11 15 11 z M 20 11 A 1.0001 1.0001 0 1 0 20 13 L 20 15 A 1.0001 1.0001 0 1 0 22 15 L 22 12 A 1.0001 1.0001 0 0 0 21 11 L 20 11 z M 10 17 C 8.895 17 8 17.895 8 19 L 8 20 C 8 21.105 8.895 22 10 22 C 11.105 22 12 21.105 12 20 L 12 19 C 12 17.895 11.105 17 10 17 z M 15 17 A 1.0001 1.0001 0 1 0 15 19 L 15 21 A 1.0001 1.0001 0 1 0 17 21 L 17 18 A 1.0001 1.0001 0 0 0 16 17 L 15 17 z M 20 17 A 1.0001 1.0001 0 1 0 20 19 L 20 21 A 1.0001 1.0001 0 1 0 22 21 L 22 18 A 1.0001 1.0001 0 0 0 21 17 L 20 17 z" />
                            </svg>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                            <p className="text-[9px] font-bold text-green-600 uppercase tracking-widest flex items-center gap-1.5">
                                Finished
                            </p>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 relative group overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Additional Classes</p>
                            <p className="text-3xl font-bold text-gray-900 tracking-tight">
                              {reportData.subjects.reduce((sum, subject) => sum + (subject.additional_classes || 0), 0)}
                            </p>
                          </div>
                          <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                            <svg className="w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" fill="currentColor">
                              <path d="M 5 4 C 3.895 4 3 4.895 3 6 L 3 9 L 3 25 A 1.0001 1.0001 0 0 0 4 26 L 26 26 A 1.0001 1.0001 0 0 0 27 25 L 27 8 L 27 6 C 27 4.895 26.105 4 25 4 L 5 4 z M 5 9 L 25 9 L 25 24 L 5 24 L 5 9 z M 9 11 A 1.0001 1.0001 0 1 0 9 13 L 9 15 A 1.0001 1.0001 0 1 0 11 15 L 11 12 A 1.0001 1.0001 0 0 0 10 11 L 9 11 z M 15 11 C 13.895 11 13 11.895 13 13 L 13 14 C 13 15.105 13.895 16 15 16 C 16.105 16 17 15.105 17 14 L 17 13 C 17 11.895 16.105 11 15 11 z M 20 11 A 1.0001 1.0001 0 1 0 20 13 L 20 15 A 1.0001 1.0001 0 1 0 22 15 L 22 12 A 1.0001 1.0001 0 0 0 21 11 L 20 11 z M 10 17 C 8.895 17 8 17.895 8 19 L 8 20 C 8 21.105 8.895 22 10 22 C 11.105 22 12 21.105 12 20 L 12 19 C 12 17.895 11.105 17 10 17 z M 15 17 A 1.0001 1.0001 0 1 0 15 19 L 15 21 A 1.0001 1.0001 0 1 0 17 21 L 17 18 A 1.0001 1.0001 0 0 0 16 17 L 15 17 z M 20 17 A 1.0001 1.0001 0 1 0 20 19 L 20 21 A 1.0001 1.0001 0 1 0 22 21 L 22 18 A 1.0001 1.0001 0 0 0 21 17 L 20 17 z" />
                            </svg>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                            <p className="text-[9px] font-bold text-purple-600 uppercase tracking-widest flex items-center gap-1.5">
                               Extra
                            </p>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 relative group overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Pending Classes</p>
                            <p className="text-3xl font-bold text-gray-900 tracking-tight">
                              {reportData.subjects.reduce((sum, subject) => sum + subject.pending_classes, 0)}
                            </p>
                          </div>
                          <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                            <svg className="w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" fill="currentColor">
                              <path d="M15,3C8.373,3,3,8.373,3,15c0,6.627,5.373,12,12,12s12-5.373,12-12C27,8.373,21.627,3,15,3z M16,16H7.995 C7.445,16,7,15.555,7,15.005v-0.011C7,14.445,7.445,14,7.995,14H14V5.995C14,5.445,14.445,5,14.995,5h0.011 C15.555,5,16,5.445,16,5.995V16z" />
                            </svg>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                            <p className="text-[9px] font-bold text-yellow-600 uppercase tracking-widest flex items-center gap-1.5">
                               Remaining
                            </p>
                        </div>
                      </div>
                    </div>

                    {/* Subjects Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div className="px-6 py-5 border-b border-gray-100">
                        <div className="flex items-center justify-between mb-0">
                          <div>
                            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">My Subjects</h3>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                              {reportData.subjects.length} subject(s) assigned
                            </p>
                          </div>
                          <ExportButton 
                            onClick={handleExportExcel}
                            text="Export"
                          />
                        </div>
                      </div>

                      <div>
                        {reportData.subjects.length === 0 ? (
                          <div className="text-center py-12">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                              <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 24 24">
    <path d="M21,4H3C2.45,4,2,4.45,2,5v14c0,0.55,0.45,1,1,1h10v-1c0-0.552,0.448-1,1-1h3c0.552,0,1,0.448,1,1v1h3c0.55,0,1-0.45,1-1V5 C22,4.45,21.55,4,21,4z M17.758,10.64l-3.047,3.07c-0.31,0.3-0.77,0.38-1.16,0.18l-3.35-1.67l-2.537,2.508 c-0.391,0.391-1.024,0.391-1.414,0l-0.006-0.006c-0.391-0.391-0.391-1.024,0-1.414L9.29,10.29c0.31-0.3,0.77-0.38,1.16-0.18 l3.35,1.67l2.537-2.56c0.391-0.391,1.024-0.391,1.414,0l0.006,0.006C18.148,9.616,18.148,10.25,17.758,10.64z"></path>
</svg>
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">No subjects assigned</h3>
                            <p className="text-gray-500">You haven&apos;t been assigned to any subjects yet.</p>
                          </div>
                        ) : (
                          <>
                            {/* Mobile Card View */}
                            <div className="md:hidden divide-y divide-gray-100">
                              {reportData.subjects.map((subject) => {
                                const totalTaken = subject.completed_classes + (subject.additional_classes || 0)
                                const completionRate = subject.total_classes > 0 
                                  ? Math.round((totalTaken / subject.total_classes) * 100)
                                  : 0
                                
                                return (
                                  <div 
                                    key={subject.class_id} 
                                    className="p-4 hover:bg-gray-50 transition-colors"
                                    onClick={() => handleSubjectClick(subject.subject_name, subject.class_id)}
                                  >
                                    <div className="flex items-center justify-between mb-3">
                                      <h4 className="text-sm font-bold text-gray-900 uppercase">
                                        {subject.subject_name}
                                      </h4>
                                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    </div>
                                    
                                    <div className="grid grid-cols-4 gap-2 mb-3">
                                      <div className="text-center p-2 bg-gray-50 rounded-lg">
                                        <p className="text-[9px] font-bold text-gray-400 uppercase">Scheduled</p>
                                        <p className="text-sm font-bold text-gray-900">{subject.total_classes}</p>
                                      </div>
                                      <div className="text-center p-2 bg-gray-50 rounded-lg">
                                        <p className="text-[9px] font-bold text-gray-400 uppercase">Done</p>
                                        <p className="text-sm font-bold text-gray-900">{subject.completed_classes}</p>
                                      </div>
                                      <div className="text-center p-2 bg-gray-50 rounded-lg">
                                        <p className="text-[9px] font-bold text-gray-400 uppercase">Extra</p>
                                        <p className="text-sm font-bold text-gray-900">{subject.additional_classes || 0}</p>
                                      </div>
                                      <div className="text-center p-2 bg-gray-50 rounded-lg">
                                        <p className="text-[9px] font-bold text-gray-400 uppercase">Pending</p>
                                        <p className="text-sm font-bold text-gray-900">{subject.pending_classes}</p>
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                                        <div 
                                          className="bg-blue-600 h-2 rounded-full transition-all" 
                                          style={{ width: `${completionRate}%` }}
                                        ></div>
                                      </div>
                                      <span className="text-xs font-bold text-gray-700 min-w-[40px] text-right">
                                        {completionRate}%
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            {/* Desktop Table View */}
                            <div className="hidden md:block overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-white">
                                  <tr>
                                    <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                      Subject Name
                                    </th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                      Scheduled
                                    </th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                      Completed
                                    </th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                      Additional
                                    </th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                      Pending
                                    </th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                      Completion Rate
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {reportData.subjects.map((subject) => {
                                    // Calculate completion rate: (completed + additional) / scheduled
                                    const totalTaken = subject.completed_classes + (subject.additional_classes || 0)
                                    const completionRate = subject.total_classes > 0 
                                      ? Math.round((totalTaken / subject.total_classes) * 100)
                                      : 0
                                    
                                    return (
                                      <tr key={subject.class_id} className="hover:bg-gray-50 transition-colors duration-200">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                          <button
                                            onClick={() => handleSubjectClick(subject.subject_name, subject.class_id)}
                                            className="text-sm font-bold  uppercase text-gray-900 hover:text-blue-600 hover:underline transition-colors"
                                          >
                                            {subject.subject_name}
                                          </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                          <div className="text-sm font-bold text-gray-900">
                                            {subject.total_classes}
                                          </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                          <div className="text-sm font-bold text-gray-900">
                                            {subject.completed_classes}
                                          </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                          <div className="text-sm font-bold text-purple-900">
                                            {subject.additional_classes || 0}
                                          </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                          <div className="text-sm font-bold text-gray-900">
                                            {subject.pending_classes}
                                          </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                          <div className="flex items-center justify-center">
                                            <div className="w-16 bg-gray-100 rounded-full h-1.5 mr-2">
                                              <div 
                                                className="bg-blue-600 h-1.5 rounded-full" 
                                                style={{ width: `${completionRate}%` }}
                                              ></div>
                                            </div>
                                            <span className="text-xs font-bold text-gray-700">
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
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : activeTab === 'topic-sheet' ? (
                  peertutorsInfo && <PeerTopicSheet peertutorId={peertutorsInfo.id} />
                ) : activeTab === 'attendance-sheet' ? (
                  peertutorsInfo && <PeerAttendanceSheet peertutorId={peertutorsInfo.id} />
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
              </>
            )}
          </div>
        </main>
      </div>


    </div>
  )
}
