'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { ClassService, Class } from '@/lib/services/classService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { useCachedData } from '@/lib/hooks/useCachedData'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyTable } from '@/components/ui/Table'

export default function FacultyClassesPage() {
  return (
    <FacultyProtectedRoute>
      <FacultyClassesContent />
    </FacultyProtectedRoute>
  )
}

function FacultyClassesContent() {
  const { user } = useAuth()
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [scheduledClassCounts, setScheduledClassCounts] = useState<Record<string, number>>({})
  const [showExportModal, setShowExportModal] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'excel' | null>(null)
  const [showConfirmExport, setShowConfirmExport] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Fetch classes data with caching
  const { data: classesData, isLoading: classesLoading, refresh: refreshClasses, isRefreshing: isClassesRefreshing } = useCachedData({
    queryKey: ['classes-by-faculty', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      return await ClassService.getClassesByFaculty(user.id)
    },
    enabled: !!user?.id,
    initialData: [],
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const { data: allClassesData, isLoading: allClassesLoading, refresh: refreshAllClasses, isRefreshing: isAllClassesRefreshing, error: allClassesError } = useCachedData({
    queryKey: ['all-classes'],
    queryFn: async () => {
      try {
        console.log('Fetching all classes...')
        const data = await ClassService.getAllClasses()
        console.log('Fetched all classes:', data)
        return data
      } catch (error) {
        console.error('Error fetching all classes:', error)
        throw error
      }
    },
    initialData: [],
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const classes = useMemo(() => classesData || [], [classesData])
  const allClasses = useMemo(() => allClassesData || [], [allClassesData])
  const loading = classesLoading || allClassesLoading

  // Ensure data is fetched on mount
  useEffect(() => {
    // Small delay to allow React Query to initialize, then check if we need to fetch
    const timer = setTimeout(() => {
      if (!allClassesLoading && allClasses.length === 0 && !allClassesError) {
        console.log('No classes data found on mount, triggering fetch...')
        refreshAllClasses()
      }
    }, 100)

    return () => clearTimeout(timer)
  }, []) // Only run on mount

  // Debug: Log data state changes
  useEffect(() => {
    console.log('Classes page data state:', {
      allClassesData,
      allClassesLoading,
      allClassesError,
      allClassesLength: allClasses.length,
      classesData,
      classesLoading
    })
  }, [allClassesData, allClassesLoading, allClassesError, allClasses.length, classesData, classesLoading])

  // Use custom hook for sidebar collapsed state (reads from localStorage synchronously)
  const [isSidebarCollapsed] = useSidebarCollapsed()

  // Load scheduled class counts when allClasses changes
  useEffect(() => {
    const loadCounts = async () => {
      if (allClasses.length > 0) {
        const counts: Record<string, number> = {}
        for (const classItem of allClasses) {
          counts[classItem.id] = await ScheduledClassService.getScheduledClassCount(classItem.id)
        }
        setScheduledClassCounts(counts)
      }
    }
    loadCounts()
  }, [allClasses])

  // Filter classes based on search and filter criteria
  const filteredClasses = useMemo(() => {
    let filtered = allClasses

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
  }, [allClasses, searchTerm, filterYear, filterSection, filterSubject])

  // Get unique values for filter dropdowns
  const getUniqueYears = () => [...new Set(allClasses.map(c => c.year))].sort()
  const getUniqueSections = () => [...new Set(allClasses.map(c => c.section))].sort()
  const getUniqueSubjects = () => [...new Set(allClasses.map(c => c.subject_name))].sort()
  const getTotalSubjects = () => new Set(allClasses.map(c => c.subject_name)).size
  const getAverageClassesPerYear = (): string => {
    const years = getUniqueYears()
    if (years.length === 0) return '0'
    return (allClasses.length / years.length).toFixed(1)
  }

  // Calculate total scheduled class count, handling "ALL" sections (count only once)
  const getTotalScheduledClassCount = (): number => {
    if (allClasses.length === 0) return 0
    
    let totalCount = 0
    const processedAllClasses = new Set<string>() // Track processed "ALL" classes by dept-year-subject
    
    for (const classItem of allClasses) {
      const count = scheduledClassCounts[classItem.id] || 0
      
      // Check if this is an "ALL" section class (e.g., "ALL", "2-all", etc.)
      const isAllSection = classItem.section.toUpperCase() === 'ALL' || 
                          classItem.section.toLowerCase().endsWith('-all') ||
                          /^\d+-all$/i.test(classItem.section) // Matches patterns like "2-all", "3-all"
      
      if (isAllSection) {
        // Create a unique key for dept-year-subject to avoid counting multiple times
        const uniqueKey = `${classItem.dept}-${classItem.year}-${classItem.subject_name}`
        
        // Only count once per unique dept-year-subject combination
        // Even if this class has scheduled classes for all three sections, count it only once
        if (!processedAllClasses.has(uniqueKey)) {
          totalCount += count
          processedAllClasses.add(uniqueKey)
        }
      } else {
        // Regular section classes - count normally
        totalCount += count
      }
    }
    
    return totalCount
  }

  // Handle class click navigation
  const handleClassClick = (classItem: Class) => {
    // Convert year format (e.g., "2nd Year" -> "2")
    const yearMap: { [key: string]: string } = {
      '2nd Year': '2',
      '3rd Year': '3', 
      '4th Year': '4'
    }
    
    // Convert section format (e.g., "Section A" -> "A")
    const sectionMap: { [key: string]: string } = {
      'Section A': 'A',
      'Section B': 'B',
      'Section C': 'C'
    }
    
    const yearId = yearMap[classItem.year] || classItem.year
    const sectionId = sectionMap[classItem.section] || classItem.section
    
    // Navigate to the specific year+section page with classes tab active
    router.push(`/faculty/department/${classItem.dept}/year/${yearId}/section/${sectionId}?tab=classes`)
  }

  // Handle refresh
  const handleRefresh = async () => {
    await Promise.all([refreshClasses(), refreshAllClasses()])
    setLastRefresh(new Date())
  }

  const handleExportData = () => {
    if (!selectedFormat) return

    const headers = ['Subject', 'Department', 'Year', 'Section', 'Scheduled Class Count', 'Created Date']
    const csvContent = [
      headers.join(','),
      ...filteredClasses.map(classItem => [
        `"${classItem.subject_name}"`,
        `"${classItem.dept}"`,
        `"${classItem.year}"`,
        `"${classItem.section}"`,
        scheduledClassCounts[classItem.id] || 0,
        `"${new Date(classItem.created_at).toLocaleDateString()}"`
      ].join(','))
    ].join('\n')
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    
    // Generate filename based on current filters
    const filterInfo = []
    if (searchTerm) filterInfo.push(`Search-${searchTerm}`)
    if (filterYear) filterInfo.push(`Year-${filterYear}`)
    if (filterSection) filterInfo.push(`Section-${filterSection}`)
    if (filterSubject) filterInfo.push(`Subject-${filterSubject}`)
    
    const filename = `classes-export${filterInfo.length > 0 ? `-${filterInfo.join('-')}` : ''}-${new Date().toISOString().split('T')[0]}.${selectedFormat === 'excel' ? 'xlsx' : 'csv'}`
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    setShowExportModal(false)
    setShowConfirmExport(false)
    setSelectedFormat(null)
  }

  const handleFormatSelection = (format: 'csv' | 'excel') => {
    setSelectedFormat(format)
    setShowExportModal(false)
    setShowConfirmExport(true)
  }

  const resetFilters = () => {
    setSearchTerm('')
    setFilterYear('')
    setFilterSection('')
    setFilterSubject('')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
        {/* Top Header */}
        <PageHeader
          title="GLOBAL CLASSES"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isClassesRefreshing || isAllClassesRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className={`max-w-full mx-auto py-8 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
            <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Total Subjects</p>
                    <p className="text-2xl font-semibold text-gray-900">{allClasses.length > 0 ? getTotalSubjects() : 0}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M7 6h10m-7 12h4" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Avg Classes / Year</p>
                    <p className="text-2xl font-semibold text-gray-900">{allClasses.length > 0 ? getAverageClassesPerYear() : '0'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Scheduled Class</p>
                    <p className="text-2xl font-semibold text-gray-900">{getTotalScheduledClassCount()}</p>
                  </div>
                </div>
              </div>
            </div>



            {/* Classes List */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              {/* Header with Title and Export Button */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      ALL CLASSES
                      {!loading && !allClassesError && (
                        <span className="ml-2 text-base font-normal text-gray-500">
                          ({filteredClasses.length} of {allClasses.length})
                        </span>
                      )}
                    </h3>
                  </div>
                  {!loading && filteredClasses.length > 0 && (
                    <button
                      onClick={() => setShowExportModal(true)}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 shadow-sm"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export
                    </button>
                  )}
                </div>
              </div>
              
              {/* Filters Section with Labels Above */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-end gap-4">
                  {/* Search Field */}
                  <div className="flex-1 max-w-md">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Search
                    </label>
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
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Year Filter */}
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Year
                    </label>
                    <select
                      value={filterYear}
                      onChange={(e) => setFilterYear(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">All Years</option>
                      {getUniqueYears().map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>

                  {/* Section Filter */}
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Section
                    </label>
                    <select
                      value={filterSection}
                      onChange={(e) => setFilterSection(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="">All Sections</option>
                      {getUniqueSections().map(section => (
                        <option key={section} value={section}>{section}</option>
                      ))}
                    </select>
                  </div>

                  {/* Subject Filter */}
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subject
                    </label>
                    <select
                      value={filterSubject}
                      onChange={(e) => setFilterSubject(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">All Subjects</option>
                      {getUniqueSubjects().map(subject => (
                        <option key={subject} value={subject}>{subject}</option>
                      ))}
                    </select>
                  </div>

                  {/* Clear Button */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 opacity-0">
                      Clear
                    </label>
                    <button
                      onClick={resetFilters}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Table Header - Static */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="pl-6">
                        <span className="text-xs font-medium text-gray-900 uppercase tracking-wider">SUBJECT</span>
                      </TableHead>
                      <TableHead className="text-center">
                        <span className="text-xs font-medium text-gray-900 uppercase tracking-wider">DEPARTMENT</span>
                      </TableHead>
                      <TableHead className="text-center">
                        <span className="text-xs font-medium text-gray-900 uppercase tracking-wider">YEAR & SECTION</span>
                      </TableHead>
                      <TableHead className="text-center">
                        <span className="text-xs font-medium text-gray-900 uppercase tracking-wider">SCHEDULED CLASS COUNT</span>
                      </TableHead>
                      <TableHead className="text-center">
                        <span className="text-xs font-medium text-gray-900 uppercase tracking-wider">CREATED</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  
                  {/* Table Body - Dynamic Content */}
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <div className="flex items-center justify-center space-x-3">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            <span className="text-sm text-gray-600">Loading classes data...</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredClasses.length > 0 ? (
                      filteredClasses.map((classItem) => (
                        <TableRow 
                          key={classItem.id} 
                          className="hover:bg-gray-50 border-b border-gray-200"
                        >
                          <TableCell className="pl-6">
                            <div className="text-sm font-medium text-gray-900 flex items-center">
                              {classItem.subject_name}
                              <svg 
                                className="ml-2 h-4 w-4 text-gray-400 cursor-pointer hover:text-gray-600 transition-colors" 
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleClassClick(classItem)
                                }}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="text-sm text-gray-900">{classItem.dept}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="text-sm text-gray-900">{classItem.year} - {classItem.section}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="text-sm text-gray-900">
                              {scheduledClassCounts[classItem.id] || 0}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="text-sm text-gray-900">
                              {new Date(classItem.created_at).toLocaleDateString()}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                              {allClassesError ? (
                                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              ) : (
                                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                              )}
                            </div>
                            <h3 className="text-sm font-medium text-gray-900 mb-2">
                              {allClassesError ? 'Error loading classes' : 'No classes found'}
                            </h3>
                            <p className="mt-1 text-sm text-gray-500">
                              {allClassesError 
                                ? "There was an error loading classes. Please try refreshing the page."
                                : allClasses.length === 0 
                                  ? "No classes have been created yet in the system."
                                  : "No classes match your current filters. Try adjusting your search criteria."
                              }
                            </p>
                            {allClassesError && (
                              <button
                                onClick={handleRefresh}
                                className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                Retry
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            </>
          </div>
        </main>
      </div>


      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" onClick={() => setShowExportModal(false)}>
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Export Classes Data</h3>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Export {filteredClasses.length} classes to your preferred format.
                </p>
                
                <div className="space-y-3">
                  <button
                    onClick={() => handleFormatSelection('csv')}
                    className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <svg className="w-5 h-5 mr-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export as CSV
                  </button>
                  
                  <button
                    onClick={() => handleFormatSelection('excel')}
                    className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <svg className="w-5 h-5 mr-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export as Excel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmExport && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" onClick={() => {
          setShowConfirmExport(false)
          setSelectedFormat(null)
        }}>
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Confirm Download</h3>
                <button
                  onClick={() => {
                    setShowConfirmExport(false)
                    setSelectedFormat(null)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-gray-600 mb-4">
                  Are you sure you want to download {filteredClasses.length} classes as {selectedFormat?.toUpperCase()}?
                </p>
                
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="text-sm">
                    <span className="font-medium text-gray-700">Format:</span>
                    <span className="ml-2 text-gray-900">{selectedFormat?.toUpperCase()}</span>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium text-gray-700">Total Classes:</span>
                    <span className="ml-2 text-gray-900">{filteredClasses.length}</span>
                  </div>
                  {searchTerm && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Search:</span>
                      <span className="ml-2 text-gray-900">&quot;{searchTerm}&quot;</span>
                    </div>
                  )}
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setShowConfirmExport(false)
                      setSelectedFormat(null)
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExportData}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
