'use client'

import { useState, useEffect } from 'react'
import { StudentService, StudentAssignment } from '@/lib/services/studentService'
import { useAuth } from '@/lib/auth/AuthContext'
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter, Input, Button } from '@/components/ui'

interface AddStudentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  dept: string
  year: string
  section: string
}

export default function AddStudentModal({
  isOpen,
  onClose,
  onSuccess,
  dept,
  year,
  section
}: AddStudentModalProps) {
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedStudents, setSelectedStudents] = useState<any[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search for available students
  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setError(null)
    
    try {
      const results = await StudentService.searchAvailableStudents(searchQuery, dept, year, section)
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

  // Add selected students
  const handleAdd = async () => {
    if (selectedStudents.length === 0 || !user) return

    setIsAdding(true)
    setError(null)

    try {
      const students: StudentAssignment[] = selectedStudents.map(student => ({
        name: student.displayName || student.name || 'Unknown',
        email: student.mail || student.email || '',
        dept,
        year,
        section,
        faculty_id: user.id,
        peer_tutor: false
      }))

      // Add all students
      const results = await Promise.allSettled(
        students.map(student => StudentService.addStudent(student))
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
          setError(`Successfully added ${successful} students. ${failed} failed.`)
        }
      } else {
        setError('Failed to add any students. Please try again.')
      }
    } catch (err) {
      setError('An error occurred while adding the students.')
    } finally {
      setIsAdding(false)
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader onClose={onClose}>
        <ModalTitle>Add Student</ModalTitle>
        <p className="text-sm text-gray-500 mt-1">
          Search for students to add to {dept} - {year} - Section {section}
        </p>
      </ModalHeader>

      <ModalBody>
        <div className="mb-4">
          <div className="flex space-x-2">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter student name or email..."
              className="flex-1"
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              loading={isSearching}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
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
            <p className="text-sm mt-1">Student may already be added or is a peer tutor</p>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleAdd}
          disabled={selectedStudents.length === 0 || isAdding}
          loading={isAdding}
        >
          {isAdding ? 'Adding...' : `Add ${selectedStudents.length} Student${selectedStudents.length !== 1 ? 's' : ''}`}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
