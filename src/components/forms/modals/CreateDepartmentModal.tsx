'use client'

import { useState, useEffect, useCallback } from 'react'
import { MicrosoftGraphService } from '@/lib/auth/microsoftGraph'
import { DepartmentService } from '@/lib/services/departmentService'
import { MicrosoftUser, CreateDepartmentData } from '@/lib/types'
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter, Input, Button } from '@/components/ui'
import { logger } from '@/lib/logger'

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
        logger.info('No faculty members found for query:', facultySearch)
      }
    } catch (error) {
      logger.error('Error searching faculty:', error)
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
      logger.error('Error creating department:', error)
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
            className="rounded-xl border-gray-200 focus:border-[#0f291e] focus:ring-[#0f291e]/20"
          />

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide text-[11px]">
              Faculty Member
            </label>
            <div className="relative">
              <input
                type="text"
                value={facultySearch}
                onChange={(e) => setFacultySearch(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-[#0f291e]/10 focus:border-[#0f291e] transition-all"
                placeholder="Search for faculty member"
                required
              />
              
              {isSearching && (
                <div className="absolute right-4 top-3.5">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#0f291e]"></div>
                </div>
              )}
            </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-2 border border-gray-100 rounded-xl max-h-48 overflow-y-auto bg-white shadow-lg custom-scrollbar">
                  {searchResults.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => handleFacultySelect(user)}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors flex flex-col gap-0.5"
                    >
                      <div className="font-bold text-sm text-gray-900">{user.displayName}</div>
                      <div className="text-xs text-gray-500 font-medium">{user.mail || user.userPrincipalName}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Selected Faculty */}
              {selectedFaculty && (
                <div className="mt-3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl flex items-center justify-between group">
                   <div>
                      <div className="text-sm font-bold text-emerald-900">{selectedFaculty.displayName}</div>
                      <div className="text-xs text-emerald-700 font-medium">{selectedFaculty.mail || selectedFaculty.userPrincipalName}</div>
                   </div>
                   <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
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
