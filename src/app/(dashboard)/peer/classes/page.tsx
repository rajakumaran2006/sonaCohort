'use client'

import { useState, useEffect } from 'react'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import ClassDetailsModal from '@/components/features/classes/ClassDetailsModal'
import AdditionalClassesTab from '@/components/features/classes/AdditionalClassesTab'
import { useAuth } from '@/lib/auth/AuthContext'
import { ClassService, Class } from '@/lib/services/classService'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'

export default function PeerClassesPage() {
  return (
    <PeerProtectedRoute>
      <PeerClassesContent />
    </PeerProtectedRoute>
  )
}

interface ClassWithStatus extends Class {
  completionStatus?: 'completed' | 'pending' | 'not_started'
  isEditable: boolean
  scheduled_date?: string
  scheduled_class_id?: string
}

function PeerClassesContent() {
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [classes, setClasses] = useState<ClassWithStatus[]>([])
  const [peerTutorInfo, setPeerTutorInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'scheduled' | 'additional'>('scheduled')

  useEffect(() => {
    loadPeerTutorClasses()
  }, [])

  const loadPeerTutorClasses = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // Get peer tutor information
      const tutorInfo = await PeerTutorAuthService.getPeerTutorByEmail(user.email)
      if (tutorInfo) {
        setPeerTutorInfo(tutorInfo)
        
        // Get scheduled classes for this peer tutor's year and section, ordered by date
        const scheduledClassesData = await ScheduledClassService.getScheduledClassesByDate(
          tutorInfo.dept,
          tutorInfo.year,
          tutorInfo.section
        )
        
        // Get completion status for each scheduled class
        const classesWithStatus = await Promise.all(
          scheduledClassesData.map(async (scheduledClass) => {
            // Use the completion status from the scheduled class itself
            const completion = scheduledClass.completion_status || 'not_started'
            
            // Check if scheduled date is in the past
            const scheduledDate = new Date(scheduledClass.scheduled_date)
            const today = new Date()
            today.setHours(0, 0, 0, 0) // Reset time to start of day
            scheduledDate.setHours(0, 0, 0, 0) // Reset time to start of day
            
            // Only allow management on the exact scheduled date
            const isEditable = scheduledDate.getTime() === today.getTime()
            
            let completionStatus: 'completed' | 'pending' | 'not_started' = 'not_started'
            
            if (completion === 'completed') {
              completionStatus = 'completed'
            } else if (!isEditable && completion === 'pending') {
              completionStatus = 'pending'
            } else if (!isEditable && completion === 'not_started') {
              completionStatus = 'pending'
            }
            
            return {
              id: scheduledClass.id, // Use scheduled class ID as the main ID
              subject_name: scheduledClass.class.subject_name,
              dept: scheduledClass.dept,
              year: scheduledClass.year,
              section: scheduledClass.section,
              faculty_id: scheduledClass.faculty_id,
              created_at: scheduledClass.class.created_at,
              scheduled_class_id: scheduledClass.id, // Keep for reference
              scheduled_date: scheduledClass.scheduled_date,
              completionStatus,
              isEditable
            } as ClassWithStatus & { scheduled_date: string, scheduled_class_id: string }
          })
        )
        
        // Sort classes by scheduled date (earliest first)
        classesWithStatus.sort((a, b) => 
          new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
        )
        
        // Debug: Check for duplicate IDs
        const ids = classesWithStatus.map(c => c.id)
        const uniqueIds = new Set(ids)
        if (ids.length !== uniqueIds.size) {
          console.warn('Duplicate IDs found:', ids.filter((id, index) => ids.indexOf(id) !== index))
        }
        
        setClasses(classesWithStatus)
      }
    } catch (error) {
      console.error('Error loading peer tutor classes:', error)
    } finally {
      setLoading(false)
    }
  }


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
    // Reload classes to update completion status
    loadPeerTutorClasses()
  }

  const getStatusBadge = (status: 'completed' | 'pending' | 'not_started') => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Completed
          </span>
        )
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            Pending
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            Not Started
          </span>
        )
    }
  }

  // Calculate statistics
  const getClassStats = () => {
    const completed = classes.filter(c => c.completionStatus === 'completed').length
    const pending = classes.filter(c => c.completionStatus === 'pending').length
    const notStarted = classes.filter(c => c.completionStatus === 'not_started').length
    const total = classes.length

    return { completed, pending, notStarted, total }
  }

  const stats = getClassStats()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your classes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64 overflow-y-auto">
        {/* Header */}
        <header className="bg-white shadow flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 lg:hidden"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  <div className="ml-4">
                    <h1 className="text-2xl font-bold text-gray-900 font-title">{peerTutorInfo?.year} - Section {peerTutorInfo?.section}</h1>
                    <p className="text-sm text-gray-600 mt-1">
                      Manage your assigned classes and attendance
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="bg-white border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveTab('scheduled')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'scheduled'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Scheduled Classes
              </button>
              <button
                onClick={() => setActiveTab('additional')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'additional'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Additional Classes
              </button>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          {activeTab === 'scheduled' ? (
            <>
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Total Classes */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-blue-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 font-header">Total Classes</p>
                  <p className="text-2xl font-bold text-gray-900 font-title">{stats.total}</p>
                </div>
              </div>
            </div>

            {/* Completed Classes */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-green-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 font-header">Completed</p>
                  <p className="text-2xl font-bold text-gray-900 font-title">{stats.completed}</p>
                </div>
              </div>
            </div>

            {/* Pending Classes */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-yellow-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 font-header">Pending</p>
                  <p className="text-2xl font-bold text-gray-900 font-title">{stats.pending}</p>
                </div>
              </div>
            </div>

            {/* Not Started Classes */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-gray-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 font-header">Not Started</p>
                  <p className="text-2xl font-bold text-gray-900 font-title">{stats.notStarted}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Classes Table */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 font-header">All Classes</h3>
              <p className="text-sm text-gray-600 font-subheader">View and manage your assigned classes</p>
            </div>
            
            {classes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subject Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Manage
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {classes.map((classItem) => (
                      <tr key={classItem.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(classItem.completionStatus || 'not_started')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                            </div>
                            <div className="text-sm font-medium text-gray-900">
                              {classItem.subject_name}
                            </div>
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
                            <div className="text-sm text-gray-500">
                              {new Date(classItem.scheduled_date).toLocaleDateString('en-US', {
                                weekday: 'short'
                              })}
                            </div>
                          )}
                          {classItem.isEditable ? (
                            <div className="text-xs text-green-600 font-medium flex items-center mt-1">
                              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              Today - Can Manage
                            </div>
                          ) : classItem.scheduled_date && (
                            <div className="text-xs text-gray-500 flex items-center mt-1">
                              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                              Locked
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
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
                        </td>
                      </tr>
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
                <h3 className="text-lg font-medium text-gray-900 mb-2">No classes scheduled</h3>
                <p className="text-gray-500">There are no classes scheduled for your year and section yet. Check back later!</p>
              </div>
            )}
          </div>
            </>
          ) : (
            <AdditionalClassesTab peerTutorInfo={peerTutorInfo} />
          )}
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

