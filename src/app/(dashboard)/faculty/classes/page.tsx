'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { ClassService, Class } from '@/lib/services/classService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import ClassesPageSkeleton from '@/components/skeletons/ClassesPageSkeleton'
import ClassesExportModal from '@/components/forms/import-export/ClassesExportModal'
import FilterDropdown from '@/components/ui/FilterDropdown'
import ExportButton from '@/components/ui/ExportButton'
import { logger } from '@/lib/logger'

export default function FacultyClassesPage() {
  return (
    <FacultyProtectedRoute>
      <FacultyClassesContent />
    </FacultyProtectedRoute>
  )
}

function FacultyClassesContent() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [filterYear, setFilterYear] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  // scheduledClassCounts will be populated by useQuery
  const [showExportModal, setShowExportModal] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const { data: allClasses = [], isLoading: allClassesLoading, isRefetching: isAllClassesRefetching, error: allClassesError } = useQuery({
    queryKey: ['all-classes'],
    queryFn: async () => {
      try {
        logger.info('Fetching all classes...')
        const data = await ClassService.getAllClasses()
        logger.info('Fetched all classes:', data)
        return data
      } catch (error) {
        logger.error('Error fetching all classes:', error)
        throw error
      }
    },
    staleTime: 5 * 60 * 1000
  })

  const { data: scheduledClassCounts = {} } = useQuery({
    queryKey: ['scheduled-class-counts', allClasses.length],
    queryFn: async () => {
      if (allClasses.length === 0) return {}
      const counts: Record<string, number> = {}
      await Promise.all(allClasses.map(async (cls) => {
        counts[cls.id] = await ScheduledClassService.getScheduledClassCount(cls.id)
      }))
      return counts
    },
    enabled: allClasses.length > 0
  })

  // Use custom hook for sidebar collapsed state (reads from localStorage synchronously)
  const [isSidebarCollapsed] = useSidebarCollapsed()

  // Filter classes based on search and filter criteria
  const filteredClasses = useMemo(() => {
    let filtered = allClasses

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
  }, [allClasses, filterYear, filterSection, filterSubject])

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
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['all-classes'] }),
      queryClient.invalidateQueries({ queryKey: ['scheduled-class-counts'] })
    ])
    setLastRefresh(new Date())
  }





  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden w-full lg:w-auto`}>
        {/* Top Header */}
        <PageHeader
          title="GLOBAL CLASSES"
          tagline="Subject Management & Schedule Overview"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isAllClassesRefetching}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className={`max-w-full mx-auto py-8 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
            {allClassesLoading && allClasses.length === 0 ? (
              <ClassesPageSkeleton />
            ) : (
            <>
            {/* Stats Cards - Clean White Design */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {/* Total Subjects Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Total Subjects</p>
                    <p className="text-3xl font-bold text-gray-900 tracking-tight">{allClasses.length > 0 ? getTotalSubjects() : 0}</p>
                  </div>
                  <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                    </svg>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                    Across All Years
                  </p>
                </div>
              </div>

              {/* Avg Classes Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Avg Classes / Year</p>
                    <p className="text-3xl font-bold text-gray-900 tracking-tight">{allClasses.length > 0 ? getAverageClassesPerYear() : '0'}</p>
                  </div>
                  <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                    </svg>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                  <p className="text-[9px] font-bold text-purple-600 uppercase tracking-widest flex items-center gap-1.5">
                    Per Academic Year
                  </p>
                </div>
              </div>

              {/* Scheduled Class Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative group overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Scheduled Class</p>
                    <p className="text-3xl font-bold text-gray-900 tracking-tight">{getTotalScheduledClassCount()}</p>
                  </div>
                  <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                    </svg>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                  <p className="text-[9px] font-bold text-orange-600 uppercase tracking-widest flex items-center gap-1.5">
                    Total Sessions
                  </p>
                </div>
              </div>
            </div>



            {/* Classes List - Clean White Design */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                    All Classes ({filteredClasses.length})
                  </h3>
                  
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-40">
                      <FilterDropdown
                        value={filterYear}
                        onChange={setFilterYear}
                        options={getUniqueYears().map(year => ({ label: year, value: year }))}
                        placeholder="All Years"
                      />
                    </div>

                    <div className="w-40">
                      <FilterDropdown
                        value={filterSection}
                        onChange={setFilterSection}
                        options={getUniqueSections().map(section => ({ label: section, value: section }))}
                        placeholder="All Sections"
                      />
                    </div>

                    <div className="w-40">
                      <FilterDropdown
                        value={filterSubject}
                        onChange={setFilterSubject}
                        options={getUniqueSubjects().map(subject => ({ label: subject, value: subject }))}
                        placeholder="All Subjects"
                      />
                    </div>

                    {!allClassesLoading && filteredClasses.length > 0 && (
                      <ExportButton 
                        onClick={() => setShowExportModal(true)}
                        text="Export"
                      />
                    )}
                  </div>
                </div>
              </div>
              
              {/* Table Header - Static */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white">
                      <TableHead className="pl-6 py-4">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Subject</span>
                      </TableHead>
                      <TableHead className="py-4">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Department</span>
                      </TableHead>
                      <TableHead className="py-4">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Year & Section</span>
                      </TableHead>
                      <TableHead className="text-center py-4">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Scheduled Class</span>
                      </TableHead>
                      <TableHead className="text-right pr-6 py-4">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Created</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  
                  {/* Table Body - Dynamic Content */}
                  <TableBody>
                    {filteredClasses.length > 0 ? (
                      filteredClasses.map((classItem) => (
                        <TableRow 
                          key={classItem.id} 
                          className="hover:bg-gray-50/50 transition-colors group"
                        >
                          <TableCell className="pl-6 py-4">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                                <span className="text-xs font-bold text-white uppercase">
                                  {classItem.subject_name.substring(0, 2)}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-bold text-gray-900 mb-0.5">{classItem.subject_name}</p>
                                <button 
                                  onClick={() => handleClassClick(classItem)}
                                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-700 transition-all shadow-sm"
                                >
                                  VIEW
                                </button>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{classItem.dept}</span>
                          </TableCell>
                          <TableCell className="py-4 text-gray-500">
                            <span className="text-xs font-medium">{classItem.year} - {classItem.section}</span>
                          </TableCell>
                          <TableCell className="text-center py-4">
                            <span className="text-sm font-bold text-gray-900">
                              {scheduledClassCounts[classItem.id] || 0}
                            </span>
                          </TableCell>
                          <TableCell className="text-right pr-6 py-4">
                            <span className="text-xs font-medium text-gray-500">
                              {new Date(classItem.created_at).toLocaleDateString()}
                            </span>
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
            )}
          </div>
        </main>
      </div>


      {/* Export Modal */}
      {showExportModal && (
        <ClassesExportModal
          filteredClasses={filteredClasses}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  )
}
