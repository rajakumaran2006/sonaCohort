'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'

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
  const [department, setDepartment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showYearDropdown, setShowYearDropdown] = useState(false)

  // Check if sidebar is collapsed
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const sidebar = document.querySelector('[data-sidebar-collapsed]')
      return sidebar?.getAttribute('data-sidebar-collapsed') === 'true'
    }
    return false
  })

  // Listen for sidebar collapse state changes
  useEffect(() => {
    const checkSidebarState = () => {
      if (typeof window !== 'undefined') {
        const sidebar = document.querySelector('[data-sidebar-collapsed]')
        const collapsed = sidebar?.getAttribute('data-sidebar-collapsed') === 'true'
        setIsSidebarCollapsed(collapsed)
      }
    }

    // Check initially
    checkSidebarState()

    // Listen for custom events
    const handleSidebarToggle = () => checkSidebarState()
    window.addEventListener('sidebar-toggle', handleSidebarToggle)

    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle)
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

  // Mock data - replace with actual API call
  useEffect(() => {
    setTimeout(() => {
      setDepartment({
        id: deptId,
        name: 'Computer Science',
        faculty_name: user?.user_metadata?.full_name || user?.user_metadata?.name || 'Faculty Member'
      })
      setLoading(false)
    }, 500)
  }, [deptId, user])

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

  const handleYearChange = (newYearId: string) => {
    setShowYearDropdown(false)
    router.push(`/faculty/department/${deptId}/year/${newYearId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
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
        <header className="bg-white shadow-sm border-b border-gray-200 h-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center">
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
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1">
          <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
            {/* Breadcrumb */}
            <div className="py-4">
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
