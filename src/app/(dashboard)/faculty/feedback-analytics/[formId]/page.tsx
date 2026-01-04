'use client'

import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { FeedbackService, FeedbackForm } from '@/lib/services/feedbackService'
import FeedbackAnalyticsPage from '@/components/forms/FeedbackAnalyticsPage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'


export default function FeedbackFormAnalytics() {
  return (
    <FacultyProtectedRoute>
      <FeedbackFormAnalyticsContent />
    </FacultyProtectedRoute>
  )
}

function FeedbackFormAnalyticsContent() {
  const params = useParams()
  const router = useRouter()
  const formId = params.formId as string
  const { user } = useAuth()
  
  const [form, setForm] = useState<FeedbackForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  
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

  useEffect(() => {
    if (formId && user?.id) {
      loadForm()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, user?.id])

  const loadForm = async () => {
    try {
      setLoading(true)
      setError(null)
      
      console.log('loadForm called with formId:', formId)
      console.log('User ID:', user?.id)
      
      if (!user?.id) {
        setError('User not authenticated')
        return
      }
      
      if (!formId) {
        setError('Form ID not provided')
        return
      }
      
      // Get the specific form by ID
      console.log('Calling getFeedbackFormById with form ID:', formId)
      const foundForm = await FeedbackService.getFeedbackFormById(formId)
      
      if (foundForm) {
        console.log('Found form:', foundForm)
        setForm(foundForm)
      } else {
        console.log('Form not found with ID:', formId)
        setError('Form not found')
      }
    } catch (err) {
      console.error('Error loading form:', err)
      console.error('Error type:', typeof err)
      console.error('Error message:', err instanceof Error ? err.message : 'Unknown error')
      setError('Failed to load form data')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <FacultySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} overflow-y-auto`}>
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 w-full">
          <div className={`flex items-center justify-between py-4 w-full ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-0' : 'px-4 sm:px-6 lg:px-8'}`}>
            <div className="flex items-center">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              {/* Breadcrumbs */}
              <nav className="flex items-center space-x-2 text-sm text-gray-500">
                <button
                  onClick={() => router.push('/faculty/peer-tutor')}
                  className="hover:text-gray-700 transition-colors"
                >
                  Peer Tutor Management
                </button>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-gray-900 font-medium">Feedback Analytics</span>
              </nav>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/faculty/peer-tutor')}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Back to Peer Tutor Management
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="p-4 sm:p-6 lg:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-gray-600">Loading form analytics...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="text-red-600 mb-4">Error</div>
                <p className="text-gray-600">{error}</p>
                <button
                  onClick={loadForm}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : !form ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="text-gray-600 mb-4">Form not found</div>
                <p className="text-gray-500">The requested feedback form could not be found.</p>
                <button
                  onClick={() => router.push('/faculty/peer-tutor')}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Back to Peer Tutor Management
                </button>
              </div>
            </div>
          ) : (
            <FeedbackAnalyticsPage form={form} />
          )}
        </main>
      </div>
    </div>
  )
}
