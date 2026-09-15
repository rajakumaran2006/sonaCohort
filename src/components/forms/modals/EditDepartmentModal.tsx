'use client'

import { useState, useEffect, useCallback } from 'react'
import { MicrosoftGraphService } from '@/lib/auth/microsoftGraph'
import { DepartmentService } from '@/lib/services/departmentService'
import { MicrosoftUser, Department } from '@/lib/types'
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter, Input, Button } from '@/components/ui'
import { logger } from '@/lib/logger'
import { UserCheck, Search } from 'lucide-react'

interface EditDepartmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  department: Department | null
}

export default function EditDepartmentModal({ isOpen, onClose, onSuccess, department }: EditDepartmentModalProps) {
  const [departmentName, setDepartmentName] = useState('')
  const [facultyName, setFacultyName] = useState('')
  const [facultyEmail, setFacultyEmail] = useState('')
  const [facultySearch, setFacultySearch] = useState('')
  const [searchResults, setSearchResults] = useState<MicrosoftUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    if (department) {
      setDepartmentName(department.name || '')
      setFacultyName(department.faculty_name || '')
      setFacultyEmail(department.faculty_email || '')
      setFacultySearch('')
      setSearchResults([])
    }
  }, [department, isOpen])

  const searchFaculty = useCallback(async () => {
    if (facultySearch.length < 2) return

    setIsSearching(true)
    try {
      const users = await MicrosoftGraphService.searchUsers(facultySearch)
      setSearchResults(users)
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
    setFacultyName(faculty.displayName || '')
    setFacultyEmail(faculty.mail || faculty.userPrincipalName || '')
    setFacultySearch('')
    setSearchResults([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!department || !departmentName.trim() || !facultyName.trim() || !facultyEmail.trim()) {
      return
    }

    setIsLoading(true)
    try {
      const updatedDepartment = await DepartmentService.updateDepartment(
        department.id,
        {
          name: departmentName.trim(),
          faculty_name: facultyName.trim(),
          faculty_email: facultyEmail.trim(),
        },
        department.name
      )

      if (updatedDepartment) {
        onSuccess()
        onClose()
      }
    } catch (error) {
      logger.error('Error updating department:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <ModalTitle>Edit Department & Faculty Incharge</ModalTitle>
      </ModalHeader>

      <ModalBody>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Department Name"
            type="text"
            value={departmentName}
            onChange={(e) => setDepartmentName(e.target.value)}
            placeholder="Enter department name"
            required
            className="rounded-xl border-gray-200 focus:border-[#0f291e] focus:ring-[#0f291e]/20"
          />

          {/* Quick Search Faculty from Directory */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide text-[11px]">
              Search Directory (Optional)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={facultySearch}
                onChange={(e) => setFacultySearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-[#0f291e]/10 focus:border-[#0f291e] transition-all"
                placeholder="Search by name or email to auto-fill"
              />
              {isSearching && (
                <div className="absolute right-3.5 top-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#0f291e]"></div>
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
          </div>

          <div className="p-4 bg-gray-50/80 border border-gray-100 rounded-2xl space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <UserCheck className="w-4 h-4 text-[#0f291e]" />
              <span>Incharge Details</span>
            </div>

            <Input
              label="Faculty Incharge Name"
              type="text"
              value={facultyName}
              onChange={(e) => setFacultyName(e.target.value)}
              placeholder="Faculty incharge full name"
              required
              className="bg-white rounded-xl border-gray-200 focus:border-[#0f291e] focus:ring-[#0f291e]/20"
            />

            <Input
              label="Faculty Incharge Email"
              type="email"
              value={facultyEmail}
              onChange={(e) => setFacultyEmail(e.target.value)}
              placeholder="Faculty incharge email address"
              required
              className="bg-white rounded-xl border-gray-200 focus:border-[#0f291e] focus:ring-[#0f291e]/20"
            />
          </div>
        </form>
      </ModalBody>

      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isLoading || !departmentName.trim() || !facultyName.trim() || !facultyEmail.trim()}
          loading={isLoading}
          onClick={handleSubmit}
        >
          {isLoading ? 'Saving...' : 'Save Changes'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
