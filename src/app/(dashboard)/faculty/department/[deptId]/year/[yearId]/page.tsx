'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import StatCard from '@/components/ui/StatCard'
import { useAuth } from '@/lib/auth/AuthContext'
import { AssignmentService } from '@/lib/services/assignmentService'
import { FacultyService } from '@/lib/services/facultyService'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { Users, GraduationCap } from 'lucide-react'

export default function YearPage() {
  return (
    <FacultyProtectedRoute>
      <YearContent />
    </FacultyProtectedRoute>
  )
}

function YearContent() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const { deptId, yearId } = params

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [department, setDepartment] = useState<{
    id: string
    name: string
    faculty_name: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showYearDropdown, setShowYearDropdown] = useState(false)
  const [yearStats, setYearStats] = useState<{
    totalStudents: number
    totalPeerTutors: number
    assignedStudents: number
    unassignedStudents: number
    averageStudentsPerTutor: number
  } | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Check if sidebar is collapsed - read from localStorage first (source of truth)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed')
      if (saved !== null) {
        return JSON.parse(saved)
      }
    }
    return false
  })

  // Listen for sidebar collapse state changes
  useEffect(() => {
    const checkSidebarState = () => {
      if (typeof window !== 'undefined') {
        // Read from localStorage first (sidebar's source of truth)
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved !== null) {
          const collapsed = JSON.parse(saved)
          setIsSidebarCollapsed(collapsed)
        } else {
          // Fallback to DOM check if localStorage doesn't have value
          const sidebar = document.querySelector('[data-sidebar-collapsed]')
          if (sidebar) {
            const collapsed = sidebar.getAttribute('data-sidebar-collapsed') === 'true'
            setIsSidebarCollapsed(collapsed)
          }
        }
      }
    }

    // Check initially with a small delay to ensure sidebar has rendered
    const timer = setTimeout(checkSidebarState, 0)

    // Listen for custom events
    const handleSidebarToggle = () => {
      // Use a small delay to ensure localStorage is updated
      setTimeout(checkSidebarState, 0)
    }
    window.addEventListener('sidebar-toggle', handleSidebarToggle)

    // Also listen for storage changes (in case sidebar state changes in another tab/window)
    window.addEventListener('storage', checkSidebarState)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('sidebar-toggle', handleSidebarToggle)
      window.removeEventListener('storage', checkSidebarState)
    }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (showYearDropdown && !target.closest('.year-dropdown-container')) {
        setShowYearDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showYearDropdown])

  // Load department and year statistics
  useEffect(() => {
    const loadData = async () => {
      try {
        // Get faculty's actual department using verification (consistent with section page)
        let facultyDepartment = 'Computer Science' // fallback
        if (user?.email) {
          const facultyDept = await FacultyService.verifyFacultyAccess(user.email)
          if (facultyDept) {
            facultyDepartment = facultyDept.name
          }
        }

        setDepartment({
          id: deptId as string,
          name: facultyDepartment,
          faculty_name: user?.user_metadata?.full_name || user?.user_metadata?.name || 'Faculty Member'
        })

        // Load year statistics
        const stats = await AssignmentService.getAssignmentStatsByYear(facultyDepartment, yearId as string)
        setYearStats(stats)
      } catch (error) {
        console.error('Error loading year data:', error)
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      loadData()
    }
  }, [deptId, yearId, user])

  const yearNames: { [key: string]: string } = {
    '2': '2nd Year',
    '3': '3rd Year', 
    '4': '4th Year'
  }

  const availableYears = [
    { id: '2', name: '2nd Year' },
    { id: '3', name: '3rd Year' },
    { id: '4', name: '4th Year' }
  ]

  const sections = [
    { id: 'A', name: 'Section A', description: 'Morning batch' },
    { id: 'B', name: 'Section B', description: 'Afternoon batch' },
    { id: 'C', name: 'Section C', description: 'Evening batch' }
  ]

  const handleSectionClick = (sectionId: string) => {
    router.push(`/faculty/department/${deptId}/year/${yearId}/section/${sectionId}`)
  }

  const handleBackToDashboard = () => {
    router.push('/faculty/dashboard')
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      // Reload all data
      const loadData = async () => {
        try {
          // Get faculty's actual department using verification
          let facultyDepartment = 'Computer Science' // fallback
          if (user?.email) {
            const facultyDept = await FacultyService.verifyFacultyAccess(user.email)
            if (facultyDept) {
              facultyDepartment = facultyDept.name
            }
          }

          setDepartment({
            id: deptId as string,
            name: facultyDepartment,
            faculty_name: user?.user_metadata?.full_name || user?.user_metadata?.name || 'Faculty Member'
          })

          // Load year statistics
          const stats = await AssignmentService.getAssignmentStatsByYear(facultyDepartment, yearId as string)
          setYearStats(stats)
        } catch (error) {
          console.error('Error refreshing year data:', error)
        }
      }

      await loadData()
      setLastRefresh(new Date())
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  const handleYearChange = (newYearId: string) => {
    setShowYearDropdown(false)
    router.push(`/faculty/department/${deptId}/year/${newYearId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Sidebar */}
        <FacultySidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Main content */}
        <div className={`${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
          {/* Header */}
          <header className="bg-white shadow-sm border-b border-gray-200 h-16 w-full">
            <div className={`max-w-full mx-auto h-full flex items-center ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
              <div className="flex justify-between items-center w-full">
                <div className="flex items-center">
                  <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 lg:hidden"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  <div className="ml-2 lg:ml-0">
                    <h1 className="text-2xl roboto-condensed-title text-gray-900">
                      Loading...
                    </h1>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Loading Content */}
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading year data...</p>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main content */}
      <div className={`${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col overflow-hidden`}>
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 h-16 w-full">
          <div className={`max-w-full mx-auto h-full flex items-center ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
            <div className="flex justify-between items-center w-full">
              <div className="flex items-center">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 lg:hidden"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div className="ml-2 lg:ml-0">
                  <h1 className="text-2xl roboto-condensed-title text-gray-900">
                    {yearNames[yearId as string] || 'Year'} - {department?.name}
                  </h1>
                  <p className="text-sm roboto-condensed-subtitle text-gray-600 mt-1">
                    Manage sections and view student/peer tutor information
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Refresh data"
                >
                  <svg 
                    className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  onClick={() => router.back()}
                  className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors"
                >
                  <svg 
                    className="w-4 h-4 mr-2" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1">
          <div className={`max-w-full mx-auto py-6 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
            {/* Breadcrumb */}
            <div className="mb-4">
              <nav className="flex" aria-label="Breadcrumb">
                <ol className="flex items-center space-x-2">
                  <li className="flex items-center">
                    <button
                      onClick={handleBackToDashboard}
                      className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors duration-200"
                    >
                      Dashboard
                    </button>
                  </li>
                  <li className="flex items-center">
                    <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
                    </svg>
                  </li>
                  <li className="flex items-center relative year-dropdown-container">
                    <button
                      onClick={() => setShowYearDropdown(!showYearDropdown)}
                      className="flex items-center text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors duration-200 focus:outline-none"
                    >
                      <span>{yearNames[yearId as string] || 'Year'}</span>
                      <svg 
                        className={`ml-1 h-4 w-4 transition-transform duration-200 ${showYearDropdown ? 'rotate-180' : ''}`} 
                        fill="currentColor" 
                        viewBox="0 0 20 20"
                      >
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                    
                    {/* Dropdown Menu */}
                    {showYearDropdown && (
                      <div className="absolute top-full left-0 mt-2 w-40 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                        <div className="py-1">
                          {availableYears.map((year) => (
                            <button
                              key={year.id}
                              onClick={() => handleYearChange(year.id)}
                              className={`block w-full text-left px-4 py-2 text-sm transition-colors duration-150 ${
                                year.id === yearId
                                  ? 'bg-blue-50 text-blue-700 font-medium'
                                  : 'text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              {year.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                </ol>
              </nav>
            </div>

            {/* Year Statistics Cards */}
            {yearStats && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-6">
                <StatCard
                  title="Total Peer Tutors"
                  value={yearStats.totalPeerTutors}
                  description="Across all sections in this year"
                  icon={
                    <Users className="h-7 w-7 text-blue-600" />
                  }
                />

                <StatCard
                  title="Total Students"
                  value={yearStats.totalStudents}
                  description="Across all sections in this year"
                  icon={
                    <GraduationCap className="h-7 w-7 text-green-600" />
                  }
                />
              </div>
            )}

            {/* Sections */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Sections
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Click on a section to view and manage students and peer tutors
              </p>
              
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => handleSectionClick(section.id)}
                    className="relative group bg-white p-8 border-2 border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    <div className="text-center">
                      <div className="mb-4">
                        <span className="text-6xl roboto-condensed-title text-gray-900 group-hover:text-blue-600 transition-colors duration-200">
                          {section.id}
                        </span>
                      </div>
                      <div className="text-sm noto-sans-jp-regular text-gray-500 font-medium">
                        {section.description}
                      </div>
                      <p className="text-xs bbh-sans-bogle-regular text-gray-400 mt-2">
                        Click to view details
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          </div>
        </main>
      </div>
    </div>
  )
}
