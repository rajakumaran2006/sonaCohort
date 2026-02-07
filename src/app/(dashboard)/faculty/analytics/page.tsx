'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { FacultyService } from '@/lib/services/facultyService'
import { AnalyticsService, PendingClassStudent } from '@/lib/services/analyticsService'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { Card } from '@/components/ui'
import { Users, Search, Download } from 'lucide-react'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'

export default function AnalyticsPage() {
  return (
    <FacultyProtectedRoute>
      <AnalyticsContent />
    </FacultyProtectedRoute>
  )
}

function AnalyticsContent() {
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed] = useSidebarCollapsed()

  const [threshold, setThreshold] = useState<number>(1) // 1-10
  const [excludeAdditionalClasses, setExcludeAdditionalClasses] = useState(false)
  const [continuousPendingOnly, setContinuousPendingOnly] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<PendingClassStudent | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)

  // Get department
  const { data: department, isLoading: isDepartmentLoading } = useQuery({
    queryKey: ['department', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return FacultyService.verifyFacultyAccess(user.email)
    },
    enabled: !!user?.email
  })

  // Get analytics data
  const { data: analytics, isLoading: isAnalyticsLoading, refetch } = useQuery({
    queryKey: ['pendingClassAnalytics', department?.name, threshold, excludeAdditionalClasses, continuousPendingOnly],
    queryFn: async () => {
      if (!department?.name) return null
      return AnalyticsService.getPendingClassAnalytics(
        department.name,
        threshold,
        excludeAdditionalClasses,
        continuousPendingOnly
      )
    },
    enabled: !!department?.name
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetch()
    setLastRefresh(new Date())
    setTimeout(() => setIsRefreshing(false), 500)
  }

  // Filter students based on search query
  const filteredStudents = analytics?.students.filter(student =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  const handleExport = () => {
    if (!analytics || filteredStudents.length === 0) return
    const csvContent = [
      ['Name', 'Department', 'Year & Section', 'Pending Count', 'Continuous Pending'],
      ...filteredStudents.map(s => [
        s.name,
        s.dept,
        `${s.year} - ${s.section}`,
        s.pending_count.toString(),
        s.continuous_pending_count.toString()
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pending-classes-analytics-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const isLoading = isDepartmentLoading || isAnalyticsLoading

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
        <PageHeader
          title="ANALYTICS"
          tagline="Pending Class Monitoring & Student Performance"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="flex-1 p-6 overflow-y-auto bg-gray-50/50">
          <div className="max-w-[1600px] mx-auto w-full space-y-6">

            {/* Filters Section */}
            <Card className="rounded-[20px] shadow-sm border border-gray-100 bg-white p-7">
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6">
                PENDING CLASS FILTERS
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Threshold Selector */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                    Pending Count
                  </label>
                  <select
                    value={threshold}
                    onChange={(e) => {
                      const newThreshold = parseInt(e.target.value)
                      setThreshold(newThreshold)
                      // Reset continuous pending if threshold is less than 3
                      if (newThreshold < 3) {
                        setContinuousPendingOnly(false)
                      }
                    }}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 transition-colors hover:border-gray-300"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                      <option key={num} value={num}>{num}</option>
                    ))}
                  </select>
                </div>

                {/* Continuous Pending Toggle */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                    Continuous Pending
                  </label>
                  <button
                    onClick={() => setContinuousPendingOnly(!continuousPendingOnly)}
                    disabled={threshold < 3}
                    className={`w-full px-4 py-3 rounded-xl text-sm font-bold transition-all ${threshold < 3
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : continuousPendingOnly
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                        : 'bg-white border-2 border-gray-200 text-gray-900 hover:border-gray-300'
                      }`}
                  >
                    {continuousPendingOnly ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                {/* Exclude Additional Classes Toggle */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                    Exclude Additional
                  </label>
                  <button
                    onClick={() => setExcludeAdditionalClasses(!excludeAdditionalClasses)}
                    className={`w-full px-4 py-3 rounded-xl text-sm font-bold transition-all ${excludeAdditionalClasses
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                      : 'bg-white border-2 border-gray-200 text-gray-900 hover:border-gray-300'
                      }`}
                  >
                    {excludeAdditionalClasses ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            </Card>

            {/* Statistics Cards */}
            {!isLoading && analytics && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Students Card */}
                <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">TOTAL STUDENTS</h3>
                  </div>
                  <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">
                    {analytics.total_students}
                  </div>
                  <div className="flex items-center text-blue-500 text-xs font-bold relative z-10 gap-1.5">
                    <span>WITH PENDING CLASSES</span>
                  </div>
                </div>

                {/* Total Pending Card */}
                <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">TOTAL PENDING</h3>
                  </div>
                  <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">
                    {analytics.total_pending_classes}
                  </div>
                  <div className="flex items-center text-amber-500 text-xs font-bold relative z-10 gap-1.5">
                    <span>CLASSES ACROSS STUDENTS</span>
                  </div>
                </div>

                {/* Average Pending Card */}
                <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">AVERAGE PENDING</h3>
                  </div>
                  <div className="text-4xl font-extrabold text-gray-900 mb-4 relative z-10">
                    {analytics.average_pending_per_student}
                  </div>
                  <div className="flex items-center text-emerald-500 text-xs font-bold relative z-10 gap-1.5">
                    <span>PER STUDENT</span>
                  </div>
                </div>
              </div>
            )}

            {/* Students Table */}
            <Card className="rounded-[20px] shadow-sm border border-gray-100 bg-white p-7">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 pb-4 border-b border-gray-50 gap-4">
                <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">
                  STUDENTS WITH PENDING CLASSES
                </h3>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {/* Search Bar */}
                  <div className={`flex items-center gap-2 transition-all duration-300 ${isSearchExpanded ? 'w-full sm:w-64' : 'w-auto'
                    }`}>
                    {isSearchExpanded ? (
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search by name..."
                          className="w-full pl-10 pr-4 py-2 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                          autoFocus
                          onBlur={() => {
                            if (!searchQuery) {
                              setIsSearchExpanded(false)
                            }
                          }}
                        />
                        {searchQuery && (
                          <button
                            onClick={() => {
                              setSearchQuery('')
                              setIsSearchExpanded(false)
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => setIsSearchExpanded(true)}
                        className="p-2 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
                        title="Search students"
                      >
                        <Search className="w-4 h-4 text-gray-600" />
                      </button>
                    )}
                  </div>

                  {/* Export Button */}
                  <button
                    onClick={handleExport}
                    disabled={!analytics || filteredStudents.length === 0}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${!analytics || filteredStudents.length === 0
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-900 text-white hover:bg-black shadow-sm'
                      }`}
                    title="Export to CSV"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">EXPORT</span>
                  </button>
                </div>
              </div>

              {isLoading ? (
                <div className="overflow-x-auto">
                  <TableSkeleton />
                </div>
              ) : filteredStudents.length > 0 ? (
                <>
                  {searchQuery && (
                    <div className="mb-4 text-xs text-gray-500 font-medium">
                      Showing {filteredStudents.length} of {analytics?.total_students || 0} students
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Student</th>
                          <th className="text-center py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Year & Section</th>
                          <th className="text-center py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Pending</th>
                          {continuousPendingOnly && (
                            <th className="text-center py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Continuous</th>
                          )}
                          <th className="text-center py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.map((student) => (
                          <tr
                            key={student.id}
                            className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group"
                          >
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center font-bold text-sm">
                                  {student.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-gray-900">{student.name}</p>
                                  <p className="text-xs text-gray-500 font-medium">{student.dept}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-center">
                              <span className="text-sm font-bold text-gray-900">
                                {student.year} - {student.section}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-center">
                              <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold ${student.pending_count >= 5
                                ? 'bg-red-600 text-white shadow-sm'
                                : student.pending_count >= 3
                                  ? 'bg-amber-500 text-white shadow-sm'
                                  : 'bg-gray-50 text-gray-600'
                                }`}>
                                {student.pending_count} Classes
                              </span>
                            </td>
                            {continuousPendingOnly && (
                              <td className="py-4 px-4 text-center">
                                <span className="inline-block px-3 py-1 bg-orange-50 text-orange-600 rounded-lg text-xs font-bold">
                                  {student.continuous_pending_count}
                                </span>
                              </td>
                            )}
                            <td className="py-4 px-4 text-center">
                              <button
                                onClick={() => setSelectedStudent(student)}
                                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                              >
                                VIEW
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : searchQuery ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center mb-4">
                    <Search className="text-gray-300 w-8 h-8" />
                  </div>
                  <p className="text-sm font-black text-gray-900 uppercase tracking-tight">No Results Found</p>
                  <p className="text-xs text-gray-500 mt-1">Try searching with a different name</p>
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center mb-4">
                    <Users className="text-gray-300 w-8 h-8" />
                  </div>
                  <p className="text-sm font-black text-gray-900 uppercase tracking-tight">No Pending Classes</p>
                  <p className="text-xs text-gray-500 mt-1">All students are up to date!</p>
                </div>
              )}
            </Card>
          </div>
        </main>
      </div>

      {/* Student Detail Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedStudent(null)}>
          <div className="bg-white rounded-[2rem] max-w-4xl w-full max-h-[90vh] overflow-y-auto p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 mb-2">{selectedStudent.name}</h2>
                <p className="text-sm text-gray-500 font-medium">
                  Year {selectedStudent.year} • Section {selectedStudent.section} • {selectedStudent.dept}
                </p>
              </div>
              <button
                onClick={() => setSelectedStudent(null)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Pending</p>
                <p className="text-2xl font-black text-gray-900">{selectedStudent.pending_count}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Continuous</p>
                <p className="text-2xl font-black text-gray-900">{selectedStudent.continuous_pending_count}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Additional</p>
                <p className="text-2xl font-black text-gray-900">{selectedStudent.additional_classes.length}</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Pending Scheduled Classes</h3>
                <div className="space-y-2">
                  {selectedStudent.scheduled_classes.map((cls) => (
                    <div key={cls.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{cls.subject_name}</p>
                        <p className="text-xs text-gray-500 font-medium mt-1">
                          {new Date(cls.scheduled_date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-bold">
                        {cls.completion_status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedStudent.additional_classes.length > 0 && (
                <div>
                  <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Additional Classes Taken</h3>
                  <div className="space-y-2">
                    {selectedStudent.additional_classes.map((cls) => (
                      <div key={cls.id} className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl">
                        <div>
                          <p className="text-sm font-bold text-gray-900">{cls.subject_name}</p>
                          <p className="text-xs text-gray-500 font-medium mt-1">
                            {new Date(cls.class_date).toLocaleDateString('en-US', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                        <span className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold">
                          Additional
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
