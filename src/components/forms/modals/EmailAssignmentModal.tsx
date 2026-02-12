'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Search, Loader2, Mail, User, CheckCircle, AlertCircle } from 'lucide-react'
import { StudentService, Student } from '@/lib/services/studentService'
import { MicrosoftGraphService } from '@/lib/auth/microsoftGraph'
import { MicrosoftUser } from '@/lib/types'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

interface EmailAssignmentModalProps {
  student: Student
  onClose: () => void
  onSuccess: () => void
}

export default function EmailAssignmentModal({
  student,
  onClose,
  onSuccess
}: EmailAssignmentModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MicrosoftUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<MicrosoftUser | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)

  // Debounced search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    setIsSearching(true)

    try {
      const results = await MicrosoftGraphService.searchUsers(searchQuery)
      setSearchResults(results)
    } catch (error) {
      logger.error('Error searching Microsoft Graph:', error)
      toast.error('Failed to search users')
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch()
      } else {
        setSearchResults([])
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery, handleSearch])

  const handleSelectUser = (user: MicrosoftUser) => {
    setSelectedUser(user)
    setShowConfirmation(true)
  }

  const handleConfirmAssignment = async () => {
    if (!selectedUser) return

    setIsAssigning(true)

    try {
      const result = await StudentService.updateStudentEmail(student.id, selectedUser)

      if (result.success) {
        toast.success('Email assigned successfully!')
        onSuccess()
        onClose()
      } else {
        toast.error(result.error || 'Failed to assign email')
      }
    } catch (error) {
      logger.error('Error assigning email:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsAssigning(false)
    }
  }

  const handleCancelConfirmation = () => {
    setSelectedUser(null)
    setShowConfirmation(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 uppercase">ASSIGN EMAIL</h3>
            <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5 sm:mt-1">
              Current: <span className="font-semibold">{student.name}</span> (Manual)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
          {!showConfirmation ? (
            <>
              {/* Search Bar */}
              <div className="relative mb-4 sm:mb-6">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for user..."
                  className="block w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm text-sm sm:text-base"
                  autoFocus
                />
                {isSearching && (
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                  </div>
                )}
              </div>

              {/* Search Results */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 min-h-[300px] max-h-[400px] overflow-y-auto">
                {searchResults.length > 0 ? (
                  <div className="divide-y divide-gray-200">
                    {searchResults.map((user, index) => {
                      const key = user.mail || user.userPrincipalName || index
                      return (
                        <div
                          key={key}
                          onClick={() => handleSelectUser(user)}
                          className="p-4 hover:bg-white cursor-pointer transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                              <User className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {user.displayName || 'Unknown Name'}
                              </p>
                              <div className="flex items-center gap-1 text-xs text-gray-600">
                                <Mail className="w-3 h-3" />
                                <span className="truncate">
                                  {user.mail || user.userPrincipalName || 'No email'}
                                </span>
                              </div>
                            </div>
                            <CheckCircle className="w-5 h-5 text-gray-300 group-hover:text-blue-600 transition-colors" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : searchQuery ? (
                  <div className="flex flex-col items-center justify-center h-[300px] text-gray-400">
                    <Search className="w-12 h-12 mb-3 opacity-50" />
                    <p className="font-semibold">NO RESULTS FOUND</p>
                    <p className="text-xs mt-1">Try searching with a different query</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[300px] text-gray-400">
                    <Search className="w-12 h-12 mb-3 opacity-50" />
                    <p className="font-semibold">SEARCH FOR USERS</p>
                    <p className="text-xs mt-1">Enter a name or email to search Microsoft Graph</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Confirmation Dialog */
            <div className="space-y-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-yellow-900 mb-1">NAME WILL BE UPDATED</h4>
                    <p className="text-xs text-yellow-800">
                      The student&apos;s name will be replaced with the official name from Microsoft Graph.
                    </p>
                  </div>
                </div>
              </div>

              {/* Current vs New Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] font-semibold text-gray-500 mb-2 uppercase tracking-wider">Current</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Name</p>
                      <p className="text-sm font-semibold text-gray-900">{student.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Email</p>
                      <p className="text-sm font-semibold text-gray-300">No email assigned</p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-[10px] font-semibold text-blue-700 mb-2 uppercase tracking-wider">New</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] text-blue-400 uppercase font-bold mb-0.5">Name</p>
                      <p className="text-sm font-semibold text-blue-900">{selectedUser?.displayName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-blue-400 uppercase font-bold mb-0.5">Email</p>
                      <p className="text-sm font-semibold text-blue-900 break-all leading-relaxed">
                        {selectedUser?.mail || selectedUser?.userPrincipalName}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 sm:py-5 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-3 shrink-0">
          <button
            onClick={showConfirmation ? handleCancelConfirmation : onClose}
            disabled={isAssigning}
            className="order-2 sm:order-1 px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-all disabled:opacity-50"
          >
            {showConfirmation ? 'BACK' : 'CANCEL'}
          </button>
          {showConfirmation && (
            <button
              onClick={handleConfirmAssignment}
              disabled={isAssigning}
              className="order-1 sm:order-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg shadow-lg transition-all flex items-center justify-center gap-2"
            >
              {isAssigning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  ASSIGNING...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  CONFIRM & ASSIGN
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
