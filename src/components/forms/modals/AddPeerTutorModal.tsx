'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { useAuth } from '@/lib/auth/AuthContext'
import { Search, X, Loader2, User, Mail, AlertCircle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MicrosoftUser } from '@/lib/types'

interface AddPeerTutorModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  dept: string
  year: string
  section: string
  availableYears?: string[]
  availableSections?: string[]
}

type ViewMode = 'all' | 'selected'

export default function AddPeerTutorModal({
  isOpen,
  onClose,
  onSuccess,
  dept,
  year,
  section,
  availableYears = ['2', '3', '4'],
  availableSections = ['A', 'B', 'C']
}: AddPeerTutorModalProps) {
  const { user } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [selectedYear, setSelectedYear] = useState(year)
  const [selectedSection, setSelectedSection] = useState(section)
  
  // Update local state when props change
  useEffect(() => {
    setSelectedYear(year)
    setSelectedSection(section)
  }, [year, section])

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MicrosoftUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedTutors, setSelectedTutors] = useState<Set<string>>(new Set()) // Store emails of selected tutors
  const [selectedTutorObjects, setSelectedTutorObjects] = useState<Map<string, MicrosoftUser>>(new Map())

  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search for available peer tutors
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setError(null)
    
    try {
      if (!selectedYear || !selectedSection) {
        // Don't search if year/section missing
        return
      }
      const results = await peertutorservice.searchAvailableStudents(searchQuery)
      setSearchResults(results)
    } catch {
      setError('Failed to search for peer tutors. Please try again.')
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, selectedYear, selectedSection])

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

  // Add selected peer tutors
  const handleAdd = async () => {
    if (selectedTutors.size === 0 || !user) return

    setIsAdding(true)
    setError(null)

    try {
      const tutors = Array.from(selectedTutors).map(emailKey => {
        const tutor = selectedTutorObjects.get(emailKey) as MicrosoftUser
        return {
          name: tutor.displayName || 'Unknown',
          email: emailKey,
          faculty_id: user.id,
          dept,
          year: selectedYear,
          section: selectedSection,
          assigned_by: user.id
        }
      })

      // Add all tutors
      const results = await Promise.allSettled(
        tutors.map(tutor => peertutorservice.assignpeertutors(tutor))
      )
      
      const successful = results.filter(result => result.status === 'fulfilled' && result.value).length
      const failed = results.length - successful
      
      if (successful > 0) {
        onSuccess()
        if (failed === 0) {
          onClose()
          handleClearSelection()
        } else {
          setError(`Successfully added ${successful} peer tutors. ${failed} failed.`)
        }
      } else {
        setError('Failed to add any peer tutors. Please try again.')
      }
    } catch {
      setError('An error occurred while adding the peer tutors.')
    } finally {
      setIsAdding(false)
    }
  }

  // Toggle selection for a single tutor
  const handleToggleTutor = (tutor: MicrosoftUser) => {
    const email = tutor.mail || tutor.userPrincipalName
    if (!email) return

    const newSelected = new Set(selectedTutors)
    const newObjects = new Map(selectedTutorObjects)

    if (newSelected.has(email)) {
      newSelected.delete(email)
      newObjects.delete(email)
    } else {
      newSelected.add(email)
      newObjects.set(email, tutor)
    }

    setSelectedTutors(newSelected)
    setSelectedTutorObjects(newObjects)
  }

  // Handle "Select All" for current search results
  const handleSelectAll = (isChecked: boolean) => {
    const newSelected = new Set(selectedTutors)
    const newObjects = new Map(selectedTutorObjects)

    searchResults.forEach(tutor => {
      const email = tutor.mail || tutor.userPrincipalName
      if (!email) return

      if (isChecked) {
        newSelected.add(email)
        newObjects.set(email, tutor)
      } else {
        newSelected.delete(email)
        newObjects.delete(email)
      }
    })

    setSelectedTutors(newSelected)
    setSelectedTutorObjects(newObjects)
  }

  // Check if all displayed results are selected
  const areAllSelected = useMemo(() => {
    if (searchResults.length === 0) return false
    return searchResults.every(tutor => {
      const email = tutor.mail || tutor.userPrincipalName
      return selectedTutors.has(email)
    })
  }, [searchResults, selectedTutors])

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedTutors(new Set())
    setSelectedTutorObjects(new Map())
    setSearchQuery('')
    setSearchResults([])
    setViewMode('all')
  }

  const getDisplayedTutors = () => {
    if (viewMode === 'selected') {
      return Array.from(selectedTutorObjects.values())
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
                Add Peer Tutor
              </h3>
              <p className="text-sm text-gray-500 mt-1 font-medium">
                 {dept} • {selectedYear || 'Select Year'} • Section {selectedSection || 'Select Section'}
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
              {selectedTutors.size > 0 && (
                <span className="ml-2 bg-gray-100 text-black px-2 py-0.5 rounded-full text-xs">
                  {selectedTutors.size}
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
            <div className="mb-6 space-y-4">
              {/* Year/Section Selectors if needed */}
              {(!year || !section) && (
                <div className="flex gap-4">
                  <div className="w-1/2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Year</label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="block w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                    >
                      <option value="">Select Year</option>
                      {availableYears.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-1/2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Section</label>
                    <select
                      value={selectedSection}
                      onChange={(e) => setSelectedSection(e.target.value)}
                      className="block w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                    >
                      <option value="">Select Section</option>
                      {availableSections.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            
            <div className="relative shrink-0 group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={!selectedYear || !selectedSection ? "Select Year and Section first..." : "Search by peer tutor name or email..."}
                className="block w-full pl-11 pr-4 py-4 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm text-base disabled:bg-gray-50 disabled:text-gray-400"
                autoFocus
                disabled={!selectedYear || !selectedSection}
              />
              {isSearching && (
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                  <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                </div>
              )}
            </div>
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
            {(getDisplayedTutors().length > 0) ? (
              <div className="flex flex-col h-full animate-in fade-in duration-300">
                {/* Table Header */}
                <div className="bg-gray-50/80 border-b border-gray-200 px-6 py-3 grid grid-cols-[auto_1.5fr_2fr_0.8fr_0.8fr] gap-4 items-center shrink-0">
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
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Peer Tutor Name</div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Email Address</div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Year</div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Section</div>
                </div>

                {/* Table Body (Scrollable) */}
                <div className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {getDisplayedTutors().map((tutor, index) => {
                    const email = tutor.mail || tutor.userPrincipalName
                    const isSelected = selectedTutors.has(email)
                    return (
                      <div
                        key={email || index}
                        onClick={() => handleToggleTutor(tutor)}
                        className={cn(
                          "px-6 py-4 grid grid-cols-[auto_1.5fr_2fr_0.8fr_0.8fr] gap-4 items-center border-b border-gray-100 last:border-0 cursor-pointer transition-all duration-200 group",
                          isSelected ? "bg-gray-100 hover:bg-gray-200" : "hover:bg-gray-50"
                        )}
                      >
                        <div className="w-5 flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleTutor(tutor)}
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
                            {tutor.displayName || 'Unknown Name'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className={cn("w-3.5 h-3.5", isSelected ? "text-gray-500" : "text-gray-400")} />
                          <span className={isSelected ? "text-gray-700" : "text-gray-500"}>
                            {email || 'No email provided'}
                          </span>
                        </div>
                        <div className={cn("text-sm text-center font-medium", isSelected ? "text-gray-900" : "text-gray-500")}>
                          {selectedYear}
                        </div>
                        <div className={cn("text-sm text-center font-medium", isSelected ? "text-gray-900" : "text-gray-500")}>
                          {selectedSection}
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
                        <Image src="/icons/search.png" alt="No peer tutors found" width={96} height={96} className="mx-auto opacity-60 grayscale" />
                        <p className="text-black font-semibold">NO PEER TUTORS FOUND</p>
                        <p className="text-sm mt-1">Try searching with a different name or email</p>
                      </>
                    ) : (
                      <>
                        <Image src="/icons/student.png" alt="search for peer tutors" width={64} height={64} className="mb-4" />
                        <p className="text-gray-900 font-semibold text-lg">SEARCH FOR PEER TUTORS</p>
                        <p className="text-sm mt-1 max-w-xs mx-auto text-gray-500">
                           Enter a name or email to add to this section
                        </p>
                        {(!selectedYear || !selectedSection) && (
                           <p className="text-xs text-black font-medium mt-2 bg-gray-100 px-3 py-1 rounded-full inline-block">
                             Please select Year and Section first
                           </p>
                        )}
                      </>
                    )
                  ) : (
                    <>
                      <Image src="/icons/student.png" alt="no peer tutors selected" width={64} height={64} className="mb-4" />
                      <p className="text-gray-900 font-semibold text-lg">NO PEER TUTORS SELECTED</p>
                      <p className="text-sm mt-1 max-w-xs mx-auto text-gray-500">
                         Select peer tutors from the &quot;All USERS&quot;
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
                  {selectedTutors.size} PEER TUTOR{selectedTutors.size !== 1 && 'S'}
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
                disabled={selectedTutors.size === 0 || isAdding}
                className="px-6 py-2.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-gray-200 transition-all duration-200 flex items-center gap-2 focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
              >
                {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                {!isAdding && selectedTutors.size > 0 && <Check className="w-4 h-4" />}
                {isAdding ? 'Adding...' : 'ADD'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
