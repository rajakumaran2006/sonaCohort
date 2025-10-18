'use client'

import { useState, useEffect } from 'react'
import { PeerTutorService, PeerTutorAssignment } from '@/lib/services/peerTutorService'
import { useAuth } from '@/lib/auth/AuthContext'

interface AssignPeerTutorModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  dept: string
  year: string
  section: string
}

export default function AssignPeerTutorModal({
  isOpen,
  onClose,
  onSuccess,
  dept,
  year,
  section
}: AssignPeerTutorModalProps) {
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedStudents, setSelectedStudents] = useState<any[]>([])
  const [isAssigning, setIsAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search for available students
  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setError(null)
    
    try {
      const results = await PeerTutorService.searchAvailableStudents(searchQuery)
      setSearchResults(results)
    } catch (err) {
      setError('Failed to search for students. Please try again.')
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // Handle search input change with debouncing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch()
      } else {
        setSearchResults([])
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Assign selected students as peer tutors
  const handleAssign = async () => {
    if (selectedStudents.length === 0 || !user) return

    setIsAssigning(true)
    setError(null)

    try {
      const assignments: PeerTutorAssignment[] = selectedStudents.map(student => ({
        name: student.displayName || student.name || 'Unknown',
        email: student.mail || student.email || '',
        faculty_id: user.id,
        dept,
        year,
        section,
        assigned_by: user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Unknown'
      }))

      // Assign all peer tutors
      const results = await Promise.allSettled(
        assignments.map(assignment => PeerTutorService.assignPeerTutor(assignment))
      )
      
      const successful = results.filter(result => result.status === 'fulfilled' && result.value).length
      const failed = results.length - successful
      
      if (successful > 0) {
        onSuccess()
        if (failed === 0) {
          onClose()
          setSelectedStudents([])
          setSearchQuery('')
          setSearchResults([])
        } else {
          setError(`Successfully assigned ${successful} peer tutors. ${failed} failed.`)
        }
      } else {
        setError('Failed to assign any peer tutors. Please try again.')
      }
    } catch (err) {
      setError('An error occurred while assigning the peer tutors.')
    } finally {
      setIsAssigning(false)
    }
  }

  // Handle student selection (toggle)
  const handleStudentSelect = (student: any) => {
    setSelectedStudents(prev => {
      const isSelected = prev.some(s => s.mail === student.mail)
      if (isSelected) {
        return prev.filter(s => s.mail !== student.mail)
      } else {
        return [...prev, student]
      }
    })
  }

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedStudents([])
    setSearchQuery('')
    setSearchResults([])
  }

  // Remove specific student from selection
  const handleRemoveStudent = (studentToRemove: any) => {
    setSelectedStudents(prev => prev.filter(s => s.mail !== studentToRemove.mail))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              Assign Peer Tutor
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Search for students to assign as peer tutors for {dept} - {year} - Section {section}
          </p>
        </div>

        {/* Search Section */}
        <div className="px-6 py-4">
          <div className="mb-4">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
              Search Students
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                id="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter student name or email..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Available Students</h4>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md">
                {searchResults.map((student, index) => {
                  const isSelected = selectedStudents.some(s => s.mail === student.mail)
                  return (
                    <button
                      key={index}
                      onClick={() => handleStudentSelect(student)}
                      className={`w-full text-left p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors ${
                        isSelected ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {student.displayName || student.name || 'Unknown Name'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {student.mail || student.email || 'No email'}
                          </div>
                          {student.userPrincipalName && (
                            <div className="text-xs text-gray-400">
                              {student.userPrincipalName}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <div className="ml-2">
                            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Selected Students */}
          {selectedStudents.length > 0 && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-blue-900">
                  Selected Students ({selectedStudents.length})
                </h4>
                <button
                  onClick={handleClearSelection}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Clear All
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {selectedStudents.map((student, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                    <div>
                      <div className="font-medium text-gray-900">
                        {student.displayName || student.name || 'Unknown Name'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {student.mail || student.email || 'No email'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveStudent(student)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Results Message */}
          {searchQuery && searchResults.length === 0 && !isSearching && (
            <div className="text-center py-4 text-gray-500">
              <p>No available students found for "{searchQuery}"</p>
              <p className="text-sm mt-1">Try a different search term</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={selectedStudents.length === 0 || isAssigning}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isAssigning ? 'Assigning...' : `Assign ${selectedStudents.length} Peer Tutor${selectedStudents.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
