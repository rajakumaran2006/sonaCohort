'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import ClassDetailsModal from '@/components/features/classes/ClassDetailsModal'
import AdditionalClassesTab from '@/components/features/classes/AdditionalClassesTab'
import { useAuth } from '@/lib/auth/AuthContext'
import { ClassService, Class } from '@/lib/services/classService'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
import { ReportService } from '@/lib/services/reportService'
import { useCachedData } from '@/lib/hooks/useCachedData'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'

export default function PeerClassesPage() {
  return (
    <PeerProtectedRoute>
      <PeerClassesContent />
    </PeerProtectedRoute>
  )
}

interface ClassWithStatus extends Class {
  completionStatus?: 'completed' | 'pending' | 'not_started' | 'upcoming'
  isEditable: boolean
  scheduled_date?: string
  scheduled_class_id?: string
}

function PeerClassesContent() {
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [classes, setClasses] = useState<ClassWithStatus[]>([])
  const [peerTutorInfo, setPeerTutorInfo] = useState<any>(null)
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'scheduled' | 'additional'>('scheduled')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [loadingClassDetails, setLoadingClassDetails] = useState<Set<string>>(new Set())
  const [classDetails, setClassDetails] = useState<Map<string, { topics: string, attendance: any[] }>>(new Map())
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  
  // Filter states
  const [filterYear, setFilterYear] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

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

  // Fetch scheduled classes with caching
  const { data: scheduledClassesData, isLoading: scheduledLoading, refresh: refreshScheduled, isRefreshing: isScheduledRefreshing } = useCachedData({
    queryKey: ['scheduled-classes-by-peer', tutorInfoData?.dept, tutorInfoData?.year, tutorInfoData?.section],
    queryFn: async () => {
      if (!tutorInfoData?.dept || !tutorInfoData?.year || !tutorInfoData?.section) return []
      return await ScheduledClassService.getScheduledClassesByDate(
        tutorInfoData.dept,
        tutorInfoData.year,
        tutorInfoData.section
      )
    },
    enabled: !!tutorInfoData?.dept && !!tutorInfoData?.year && !!tutorInfoData?.section,
    initialData: [],
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const loading = tutorLoading || scheduledLoading

  // Process scheduled classes data using useMemo to prevent infinite loops
  const processedClasses = useMemo(() => {
    if (!scheduledClassesData || scheduledClassesData.length === 0) {
      return []
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const classesWithStatus = scheduledClassesData.map((scheduledClass) => {
      const completion = scheduledClass.completion_status || 'not_started'
      const scheduledDate = new Date(scheduledClass.scheduled_date)
      scheduledDate.setHours(0, 0, 0, 0)
      
      const isEditable = scheduledDate.getTime() === today.getTime()
      const isFuture = scheduledDate.getTime() > today.getTime()
      const isPast = scheduledDate.getTime() < today.getTime()
      
      let completionStatus: 'completed' | 'pending' | 'not_started' | 'upcoming' = 'not_started'
      
      if (completion === 'completed') {
        completionStatus = 'completed'
      } else if (isFuture) {
        completionStatus = 'upcoming'
      } else if (isPast) {
        completionStatus = 'pending'
      } else if (isEditable) {
        completionStatus = 'pending'
      }
      
      return {
        id: scheduledClass.id,
        subject_name: scheduledClass.class.subject_name,
        dept: scheduledClass.dept,
        year: scheduledClass.year,
        section: scheduledClass.section,
        faculty_id: scheduledClass.faculty_id,
        created_at: scheduledClass.class.created_at,
        scheduled_class_id: scheduledClass.id,
        scheduled_date: scheduledClass.scheduled_date,
        completionStatus,
        isEditable
      } as ClassWithStatus & { scheduled_date: string, scheduled_class_id: string }
    })
    
    classesWithStatus.sort((a, b) => 
      new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
    )
    
    return classesWithStatus
  }, [scheduledClassesData])

  // Use ref to track previous processed classes to prevent unnecessary updates
  const prevProcessedClassesRef = useRef<string>('')
  
  // Update classes state only when processedClasses actually changes
  useEffect(() => {
    // Serialize to compare - only update if content actually changed
    const currentSerialized = JSON.stringify(processedClasses)
    if (prevProcessedClassesRef.current !== currentSerialized) {
      prevProcessedClassesRef.current = currentSerialized
      setClasses(processedClasses)
    }
  }, [processedClasses])

  // Set peer tutor info when data is available
  useEffect(() => {
    if (tutorInfoData) {
      setPeerTutorInfo(tutorInfoData)
    }
  }, [tutorInfoData])

  // Filter classes based on search and filter criteria
  const filteredClasses = useMemo(() => {
    let filtered = classes

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(classItem =>
        classItem.subject_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classItem.dept.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classItem.year.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classItem.section.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Apply year filter
    if (filterYear) {
      filtered = filtered.filter(classItem => classItem.year === filterYear)
    }

    // Apply section filter
    if (filterSection) {
      filtered = filtered.filter(classItem => classItem.section === filterSection)
    }

    // Apply subject filter
    if (filterSubject) {
      filtered = filtered.filter(classItem => classItem.subject_name === filterSubject)
    }

    return filtered
  }, [classes, searchTerm, filterYear, filterSection, filterSubject])

  // Get unique values for filter dropdowns
  const getUniqueYears = () => [...new Set(classes.map(c => c.year))].sort()
  const getUniqueSections = () => [...new Set(classes.map(c => c.section))].sort()
  const getUniqueSubjects = () => [...new Set(classes.map(c => c.subject_name))].sort()


  const handleClassClick = (classItem: ClassWithStatus) => {
    if (!classItem.isEditable) {
      const scheduledDate = new Date(classItem.scheduled_date || '').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
      alert(`You can only manage this class on ${scheduledDate}. Today is not the scheduled day.`)
      return
    }
    
    setSelectedClass(classItem)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedClass(null)
    // Refresh classes to update completion status
    refreshScheduled()
  }

  // Handle refresh
  const handleRefresh = async () => {
    await Promise.all([refreshTutor(), refreshScheduled()])
    setLastRefresh(new Date())
  }

  const resetFilters = () => {
    setSearchTerm('')
    setFilterYear('')
    setFilterSection('')
    setFilterSubject('')
  }

  const loadClassDetails = async (classItem: ClassWithStatus) => {
    if (!classItem.scheduled_class_id || classItem.completionStatus !== 'completed') return

    setLoadingClassDetails(prev => new Set(prev).add(classItem.id))
    
    try {
      const report = await ReportService.getClassAttendanceReport(classItem.scheduled_class_id)
      
      if (report) {
        setClassDetails(prev => new Map(prev).set(classItem.id, {
          topics: report.topics || '',
          attendance: report.attendance_records || []
        }))
      }
    } catch (error) {
      console.error('Error loading class details:', error)
    } finally {
      setLoadingClassDetails(prev => {
        const newSet = new Set(prev)
        newSet.delete(classItem.id)
        return newSet
      })
    }
  }

  const toggleRowExpansion = (classId: string, classItem: ClassWithStatus) => {
    if (classItem.completionStatus !== 'completed') return
    
    const newExpandedRows = new Set(expandedRows)
    
    if (expandedRows.has(classId)) {
      newExpandedRows.delete(classId)
    } else {
      newExpandedRows.add(classId)
      // Load class details if not already loaded
      if (!classDetails.has(classId)) {
        loadClassDetails(classItem)
      }
    }
    
    setExpandedRows(newExpandedRows)
  }


  const getStatusBadge = (status: 'completed' | 'pending' | 'not_started' | 'upcoming') => {
    const statusText = {
      'completed': 'Completed',
      'pending': 'Pending',
      'upcoming': 'Upcoming',
      'not_started': 'Not Started'
    }[status] || 'Not Started'
    
    return (
      <span className="text-sm font-medium text-gray-900">
        {statusText}
      </span>
    )
  }

  // Calculate statistics
  const getClassStats = () => {
    const completed = classes.filter(c => c.completionStatus === 'completed').length
    const pending = classes.filter(c => c.completionStatus === 'pending').length
    const upcoming = classes.filter(c => c.completionStatus === 'upcoming').length
    const total = classes.length

    return { completed, pending, upcoming, total }
  }

  const stats = getClassStats()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="transition-all duration-300 lg:ml-64 min-h-screen flex flex-col overflow-hidden">
        {/* Top Header */}
        <PageHeader
          title={activeTab === 'scheduled' ? "SCHEDULED CLASSES" : "ADDITIONAL CLASSES"}
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isScheduledRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        >
          {/* Tab Navigation */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('scheduled')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'scheduled'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Scheduled Classes
            </button>
            <button
              onClick={() => setActiveTab('additional')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'additional'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Additional Classes
            </button>
          </div>
        </PageHeader>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="w-full py-6 px-4 sm:px-6 lg:px-8">
            <div className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading your classes...</p>
                </div>
              </div>
            ) : activeTab === 'scheduled' ? (
              <>
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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
                        <p className="text-2xl font-semibold text-gray-900">{stats.completed}</p>
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
                        <p className="text-2xl font-semibold text-gray-900">{stats.pending}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Total Classes</p>
                        <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Classes List */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="mb-4">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">Scheduled Classes</h3>
                        <p className="text-sm text-gray-500">
                          {loading ? 'Loading...' : `Showing ${filteredClasses.length} of ${classes.length} classes`}
                        </p>
                      </div>
                    </div>
                    
                    {/* Filter Controls */}
                    <div className="flex items-center gap-4">
                      {/* Search Bar */}
                      <div className="flex-1 max-w-xl">
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </div>
                          <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search"
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      {/* Year Filter */}
                      <div className="w-32">
                        <select
                          value={filterYear}
                          onChange={(e) => setFilterYear(e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">All Years</option>
                          {getUniqueYears().map(year => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>

                      {/* Section Filter */}
                      <div className="w-36">
                        <select
                          value={filterSection}
                          onChange={(e) => setFilterSection(e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">All Sections</option>
                          {getUniqueSections().map(section => (
                            <option key={section} value={section}>{section}</option>
                          ))}
                        </select>
                      </div>

                      {/* Subject Filter */}
                      <div className="w-40">
                        <select
                          value={filterSubject}
                          onChange={(e) => setFilterSubject(e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">All Subjects</option>
                          {getUniqueSubjects().map(subject => (
                            <option key={subject} value={subject}>{subject}</option>
                          ))}
                        </select>
                      </div>

                      {/* Spacer to push buttons to the right */}
                      <div className="flex-1"></div>

                      {/* Clear Filters Button */}
                      <div className="flex space-x-3">
                        <button
                          onClick={resetFilters}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                        >
                          Clear All Filters
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6">
                    {filteredClasses.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Subject
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Scheduled Date
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Department
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Year & Section
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {filteredClasses.map((classItem) => (
                              <>
                                <tr 
                                  key={classItem.id} 
                                  className="hover:bg-blue-50 transition-colors duration-200"
                                >
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">
                                      {classItem.subject_name}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">
                                      {classItem.scheduled_date ? new Date(classItem.scheduled_date).toLocaleDateString('en-GB', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric'
                                      }) : 'Not scheduled'}
                                    </div>
                                    {classItem.scheduled_date && (
                                      <div className="text-xs text-gray-500">
                                        {new Date(classItem.scheduled_date).toLocaleDateString('en-US', {
                                          weekday: 'short'
                                        })}
                                      </div>
                                    )}
                                    {classItem.isEditable && (
                                      <div className="text-xs text-green-600 font-medium flex items-center mt-1">
                                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                        Can Manage Today
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">{classItem.dept}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">{classItem.year} - {classItem.section}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    {getStatusBadge(classItem.completionStatus || 'not_started')}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center space-x-2">
                                      {classItem.isEditable ? (
                                        <button
                                          onClick={() => handleClassClick(classItem)}
                                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                                        >
                                          <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                          </svg>
                                          Manage
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => handleClassClick(classItem)}
                                          disabled
                                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-400 bg-gray-100 cursor-not-allowed"
                                          title={`You can only manage this class on ${new Date(classItem.scheduled_date || '').toLocaleDateString('en-US', {
                                            weekday: 'long',
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                          })}`}
                                        >
                                          <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                          </svg>
                                          Locked
                                        </button>
                                      )}
                                      {classItem.completionStatus === 'completed' ? (
                                        <button
                                          onClick={() => toggleRowExpansion(classItem.id, classItem)}
                                          className="inline-flex items-center justify-center w-8 h-8 rounded border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:ring-offset-1 transition-all duration-150"
                                          aria-label={expandedRows.has(classItem.id) ? "Collapse details" : "Expand details"}
                                        >
                                          {loadingClassDetails.has(classItem.id) ? (
                                            <svg className="w-4 h-4 text-gray-600 animate-spin" fill="none" viewBox="0 0 24 24">
                                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                          ) : expandedRows.has(classItem.id) ? (
                                            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                                            </svg>
                                          ) : (
                                            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                            </svg>
                                          )}
                                        </button>
                                      ) : (
                                        <button
                                          disabled
                                          className="inline-flex items-center justify-center w-8 h-8 rounded border border-gray-200 bg-gray-50 cursor-not-allowed"
                                          aria-label="View details unavailable"
                                        >
                                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                          </svg>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                {expandedRows.has(classItem.id) && classItem.completionStatus === 'completed' && (
                                  <tr key={`${classItem.id}-expanded`} className="bg-gray-50">
                                    <td colSpan={6} className="px-6 py-4">
                                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                                        {loadingClassDetails.has(classItem.id) ? (
                                          <div className="flex items-center justify-center py-4">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                            <span className="ml-2 text-sm text-gray-600">Loading class details...</span>
                                          </div>
                                        ) : (
                                          <>
                                            {/* Topics Section */}
                                            {classDetails.has(classItem.id) && classDetails.get(classItem.id)?.topics && (
                                              <div className="mb-4">
                                                <h4 className="text-lg font-medium text-gray-900 mb-2 flex items-center">
                                                  <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                                  </svg>
                                                  Topics Covered
                                                </h4>
                                                <p className="text-sm text-gray-700 bg-gray-50 rounded-md p-3">
                                                  {classDetails.get(classItem.id)?.topics || 'No topics recorded'}
                                                </p>
                                              </div>
                                            )}
                                            
                                            {/* Attendance Section */}
                                            {classDetails.has(classItem.id) && classDetails.get(classItem.id)?.attendance && (
                                              <div>
                                                <h4 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                                                  <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                  </svg>
                                                  Student Attendance
                                                </h4>
                                                {classDetails.get(classItem.id)?.attendance && classDetails.get(classItem.id)!.attendance.length > 0 ? (
                                                  <div className="space-y-2">
                                                    {classDetails.get(classItem.id)!.attendance.map((record, idx) => (
                                                      <div key={idx} className={`flex items-center justify-between p-2 rounded-md ${record.status === 'present' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                                        <div className="flex items-center">
                                                          <div className={`w-2 h-2 rounded-full mr-3 ${record.status === 'present' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                          <div>
                                                            <p className="text-sm font-medium text-gray-900">{record.student_name || record.student_id}</p>
                                                            {record.student_email && (
                                                              <p className="text-xs text-gray-500">{record.student_email}</p>
                                                            )}
                                                          </div>
                                                        </div>
                                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${record.status === 'present' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                          {record.status === 'present' ? 'Present' : 'Absent'}
                                                        </span>
                                                      </div>
                                                    ))}
                                                    <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-sm">
                                                      <span className="text-gray-600">
                                                        Present: <span className="font-medium text-green-600">{classDetails.get(classItem.id)!.attendance.filter(r => r.status === 'present').length}</span>
                                                      </span>
                                                      <span className="text-gray-600">
                                                        Absent: <span className="font-medium text-red-600">{classDetails.get(classItem.id)!.attendance.filter(r => r.status === 'absent').length}</span>
                                                      </span>
                                                      <span className="text-gray-600">
                                                        Total: <span className="font-medium text-gray-900">{classDetails.get(classItem.id)!.attendance.length}</span>
                                                      </span>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <div className="text-center py-4">
                                                    <p className="text-sm text-gray-500">No attendance records found</p>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          {classes.length === 0 ? 'No classes scheduled' : 'No classes match your filters'}
                        </h3>
                        <p className="text-gray-500 mb-6">
                          {classes.length === 0 
                            ? "There are no classes scheduled for your year and section yet. Check back later!"
                            : "Try adjusting your search criteria or filters to see more results."
                          }
                        </p>
                        {classes.length > 0 && (
                          <button
                            onClick={resetFilters}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            Clear Filters
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <AdditionalClassesTab peerTutorInfo={peerTutorInfo} />
            )}
            </div>
          </div>
        </main>
      </div>

      {/* Class Details Modal */}
      <ClassDetailsModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        classItem={selectedClass}
        userEmail={user?.email || ''}
      />
    </div>
  )
}

