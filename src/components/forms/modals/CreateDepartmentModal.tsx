'use client'

import { useState, useEffect, useCallback } from 'react'
import { MicrosoftGraphService } from '@/lib/auth/microsoftGraph'
import { DepartmentService } from '@/lib/services/departmentService'
import { MicrosoftUser, CreateDepartmentData } from '@/lib/types'
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter, Input, Button } from '@/components/ui'

interface CreateDepartmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function CreateDepartmentModal({ isOpen, onClose, onSuccess }: CreateDepartmentModalProps) {
  const [departmentName, setDepartmentName] = useState('')
  const [facultySearch, setFacultySearch] = useState('')
  const [searchResults, setSearchResults] = useState<MicrosoftUser[]>([])
  const [selectedFaculty, setSelectedFaculty] = useState<MicrosoftUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  const searchFaculty = useCallback(async () => {
    if (facultySearch.length < 2) return
    
    setIsSearching(true)
    try {
      const users = await MicrosoftGraphService.searchUsers(facultySearch)
      setSearchResults(users)
      
      if (users.length === 0) {
        console.log('No faculty members found for query:', facultySearch)
      }
    } catch (error) {
      console.error('Error searching faculty:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [facultySearch])

  useEffect(() => {
    if (facultySearch.length >= 2) {
      searchFaculty()
    } else {
      setSearchResults([])
    }
  }, [facultySearch, searchFaculty])

  const handleFacultySelect = (faculty: MicrosoftUser) => {
    setSelectedFaculty(faculty)
    setFacultySearch(faculty.displayName)
    setSearchResults([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!departmentName.trim() || !selectedFaculty) {
      return
    }

    setIsLoading(true)
    try {
      const departmentData: CreateDepartmentData = {
        name: departmentName.trim(),
        faculty_name: selectedFaculty.displayName,
        faculty_email: selectedFaculty.mail || selectedFaculty.userPrincipalName
      }

      const newDepartment = await DepartmentService.createDepartment(departmentData)
      
      if (newDepartment) {
        onSuccess()
        onClose()
        resetForm()
      }
    } catch (error) {
      console.error('Error creating department:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setDepartmentName('')
    setFacultySearch('')
    setSelectedFaculty(null)
    setSearchResults([])
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <ModalTitle>Create Department</ModalTitle>
      </ModalHeader>

      <ModalBody>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Department Name"
            type="text"
            value={departmentName}
            onChange={(e) => setDepartmentName(e.target.value)}
            placeholder="Enter department name"
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Faculty Member
            </label>
            <div className="relative">
              <input
                type="text"
                value={facultySearch}
                onChange={(e) => setFacultySearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Search for faculty member"
                required
              />
              
              {isSearching && (
                <div className="absolute right-3 top-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-md max-h-40 overflow-y-auto bg-white">
                  {searchResults.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => handleFacultySelect(user)}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                    >
                      <div className="font-medium text-gray-900">{user.displayName}</div>
                      <div className="text-sm text-gray-500">{user.mail || user.userPrincipalName}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Selected Faculty */}
              {selectedFaculty && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="font-medium text-blue-900">{selectedFaculty.displayName}</div>
                  <div className="text-sm text-blue-700">{selectedFaculty.mail || selectedFaculty.userPrincipalName}</div>
                </div>
              )}
          </div>
        </form>
      </ModalBody>

      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isLoading || !departmentName.trim() || !selectedFaculty}
          loading={isLoading}
          onClick={handleSubmit}
        >
          {isLoading ? 'Creating...' : 'Create Department'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
