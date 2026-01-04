'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { StudentService, StudentAssignment } from '@/lib/services/studentService'
import { useAuth } from '@/lib/auth/AuthContext'
import { Search, X, Loader2, User, Mail, AlertCircle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddStudentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  dept: string
  year: string
  section: string
}

type ViewMode = 'all' | 'selected'

interface SearchResultStudent {
  displayName?: string
  name?: string
  mail?: string
  email?: string
  userPrincipalName?: string
  [key: string]: unknown
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
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResultStudent[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set()) // Store emails of selected students
  // We need to keep track of the full student objects for the selected emails
  const [selectedStudentObjects, setSelectedStudentObjects] = useState<Map<string, SearchResultStudent>>(new Map())

  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search for available students
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setError(null)
    
    try {
      const results = await StudentService.searchAvailableStudents(searchQuery, dept, year, section)
      setSearchResults(results)
    } catch {
      setError('Failed to search for students. Please try again.')
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, dept, year, section])

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
  }, [searchQuery, handleSearch])

  // Add selected students
  const handleAdd = async () => {
    if (selectedStudents.size === 0 || !user) return

    setIsAdding(true)
    setError(null)

    try {
      const students: StudentAssignment[] = Array.from(selectedStudents).map(emailKey => {
        const student = selectedStudentObjects.get(emailKey)
        return {
          name: student.displayName || student.name || 'Unknown',
          email: emailKey,
          dept,
          year,
          section,
          faculty_id: user.id,
          peer_tutor: false
        }
      })

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
          handleClearSelection()
        } else {
          setError(`Successfully added ${successful} students. ${failed} failed.`)
        }
      } else {
        setError('Failed to add any students. Please try again.')
      }
    } catch {
      setError('An error occurred while adding the students.')
    } finally {
      setIsAdding(false)
    }
  }

  // Toggle selection for a single student
  const handleToggleStudent = (student: SearchResultStudent) => {
    const email = student.mail || student.email || student.userPrincipalName
    if (!email) return

    const newSelected = new Set(selectedStudents)
    const newObjects = new Map(selectedStudentObjects)

    if (newSelected.has(email)) {
      newSelected.delete(email)
      newObjects.delete(email)
    } else {
      newSelected.add(email)
      newObjects.set(email, student)
    }

    setSelectedStudents(newSelected)
    setSelectedStudentObjects(newObjects)
  }

  // Handle "Select All" for current search results
  const handleSelectAll = (isChecked: boolean) => {
    const newSelected = new Set(selectedStudents)
    const newObjects = new Map(selectedStudentObjects)

    searchResults.forEach(student => {
      const email = student.mail || student.email || student.userPrincipalName
      if (!email) return

      if (isChecked) {
        newSelected.add(email)
        newObjects.set(email, student)
      } else {
        newSelected.delete(email)
        newObjects.delete(email)
      }
    })

    setSelectedStudents(newSelected)
    setSelectedStudentObjects(newObjects)
  }

  // Check if all displayed results are selected
  const areAllSelected = useMemo(() => {
    if (searchResults.length === 0) return false
    return searchResults.every(student => {
      const email = student.mail || student.email || student.userPrincipalName
      return selectedStudents.has(email)
    })
  }, [searchResults, selectedStudents])

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedStudents(new Set())
    setSelectedStudentObjects(new Map())
    setSearchQuery('')
    setSearchResults([])
    setViewMode('all')
  }

  const getDisplayedStudents = () => {
    if (viewMode === 'selected') {
      return Array.from(selectedStudentObjects.values())
    }
    return searchResults
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[85vh] overflow-hidden border border-gray-100">
        
        {/* Header */}
        <div className="flex flex-col border-b border-gray-100 bg-white shrink-0">
          <div className="px-8 py-6 flex justify-between items-start">
            <div>
              <h3 className="text-xl font-bold uppercase text-gray-900 tracking-tight">
                Add Student
              </h3>
              <p className="text-sm text-gray-500 mt-1 font-medium">
                 {dept} • {year} • Section {section}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex px-8 gap-6">
            <button
              onClick={() => setViewMode('all')}
              className={cn(
                "pb-3 text-sm font-semibold transition-all relative",
                viewMode === 'all' 
                  ? "text-gray-900" 
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              All USERS
              {viewMode === 'all' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-t-full" />
              )}
            </button>
            <button
              onClick={() => setViewMode('selected')}
              className={cn(
                "pb-3 text-sm font-semibold transition-all relative",
                viewMode === 'selected' 
                  ? "text-gray-900" 
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              SELECTED
              {selectedStudents.size > 0 && (
                <span className="ml-2 bg-gray-100 text-black px-2 py-0.5 rounded-full text-xs">
                  {selectedStudents.size}
                </span>
              )}
              {viewMode === 'selected' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-t-full" />
              )}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col p-8 bg-gray-50/50">
          
          {/* Search Bar - Only visible in 'all' mode */}
          {viewMode === 'all' && (
            <div className="relative mb-6 shrink-0 group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by student name or email..."
                className="block w-full pl-11 pr-4 py-4 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm text-base"
                autoFocus
              />
              {isSearching && (
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                  <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 shadow-sm shrink-0 animate-in slide-in-from-top-2 fade-in duration-300">
              <AlertCircle className="w-5 h-5 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Table Container */}
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden shadow-sm flex-1 min-h-[300px]">
            {(getDisplayedStudents().length > 0) ? (
              <div className="flex flex-col h-full animate-in fade-in duration-300">
                {/* Table Header */}
                <div className="bg-gray-50/80 border-b border-gray-200 px-6 py-3 grid grid-cols-[auto_1fr_1.5fr] gap-4 items-center shrink-0">
                  <div className="w-5 flex items-center justify-center">
                    {viewMode === 'all' && searchQuery ? (
                      <input
                        type="checkbox"
                        checked={areAllSelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer transition-all"
                      />
                    ) : (
                      <div className="w-5 h-5" /> 
                    )}
                  </div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Student Name</div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Email Address</div>
                </div>

                {/* Table Body (Scrollable) */}
                <div className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {getDisplayedStudents().map((student, index) => {
                    const email = student.mail || student.email || student.userPrincipalName
                    const isSelected = selectedStudents.has(email)
                    return (
                      <div
                        key={email || index}
                        onClick={() => handleToggleStudent(student)}
                        className={cn(
                          "px-6 py-4 grid grid-cols-[auto_1fr_1.5fr] gap-4 items-center border-b border-gray-100 last:border-0 cursor-pointer transition-all duration-200 group",
                          isSelected ? "bg-gray-100 hover:bg-gray-200" : "hover:bg-gray-50"
                        )}
                      >
                        <div className="w-5 flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleStudent(student)}
                            className="w-5 h-5 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                            isSelected ? "bg-gray-200 text-black" : "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
                          )}>
                             <User className="w-4 h-4" />
                          </div>
                          <span className={cn("font-medium text-sm", isSelected ? "text-black" : "text-gray-900")}>
                            {student.displayName || student.name || 'Unknown Name'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className={cn("w-3.5 h-3.5", isSelected ? "text-gray-500" : "text-gray-400")} />
                          <span className={isSelected ? "text-gray-700" : "text-gray-500"}>
                            {email || 'No email provided'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-400 animate-in fade-in duration-300">
                  {viewMode === 'all' ? (
                    searchQuery ? (
                      <>
                        <Image src="/icons/search.png" alt="No students found" width={96} height={96} className="mx-auto opacity-60 grayscale" />
                        <p className="text-black font-semibold">NO STUDENTS FOUND</p>
                        <p className="text-sm mt-1">Try searching with a different name or email</p>
                      </>
                    ) : (
                      <>
                        <Image src="/icons/student.png" alt="search for students" width={64} height={64} className="mb-4" />
                        <p className="text-gray-900 font-semibold text-lg">SEARCH FOR STUDENTS</p>
                        <p className="text-sm mt-1 max-w-xs mx-auto text-gray-500">
                           Enter a name or email to add to this section
                        </p>
                      </>
                    )
                  ) : (
                    <>
                      <Image src="/icons/student.png" alt="no students selected" width={64} height={64} className="mb-4" />
                      <p className="text-gray-900 font-semibold text-lg">NO STUDENTS SELECTED</p>
                      <p className="text-sm mt-1 max-w-xs mx-auto text-gray-500">
                         Select students from the &quot;All USERS&quot;
                      </p>
                    </>
                  )}
                </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-gray-100 bg-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="text-sm">
                <span className="text-gray-500 font-medium">SELECTED: </span>
                <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-md ml-1">
                  {selectedStudents.size} STUDENT{selectedStudents.size !== 1 && 'S'}
                </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all duration-200 focus:ring-2 focus:ring-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={selectedStudents.size === 0 || isAdding}
                className="px-6 py-2.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-gray-200 transition-all duration-200 flex items-center gap-2 focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
              >
                {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                {!isAdding && selectedStudents.size > 0 && <Check className="w-4 h-4" />}
                {isAdding ? 'Adding...' : 'ADD'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
