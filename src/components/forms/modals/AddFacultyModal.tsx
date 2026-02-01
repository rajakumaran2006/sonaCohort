'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Search, X, Loader2, User, Mail, AlertCircle, Check, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MicrosoftUser } from '@/lib/types'
import { FacultyService } from '@/lib/services/facultyService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { logger } from '@/lib/logger'

interface AddFacultyModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  dept: string // Current Incharge's department
}

type Assignment = {
  id: string
  year: string
  section: string
  subjects: string[] // Selected subjects
}

export default function AddFacultyModal({
  isOpen,
  onClose,
  onSuccess,
  dept
}: AddFacultyModalProps) {
  const [step, setStep] = useState<'search' | 'assign'>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MicrosoftUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<MicrosoftUser | null>(null)
  
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Options
  const years = ['2', '3', '4']
  const sections = ['A', 'B', 'C']
  
  // Available subjects cache: Key = "year-section", Value = string[]
  const [availableSubjectsCache, setAvailableSubjectsCache] = useState<Record<string, string[]>>({})
  const [loadingSubjects, setLoadingSubjects] = useState<Set<string>>(new Set())

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('search')
      setSearchQuery('')
      setSearchResults([])
      setSelectedUser(null)
      setAssignments([])
      setError(null)
    }
  }, [isOpen])

  // Search Users
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setError(null)
    
    try {
      const results = await FacultyService.searchAvailableUsers(searchQuery)
      setSearchResults(results)
    } catch {
      setError('Failed to search for users. Please try again.')
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery])

  // Debounced search
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
    setStep('assign')
    // Add first empty assignment
    addAssignment()
  }

  const addAssignment = () => {
    setAssignments(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        year: '',
        section: '',
        subjects: []
      }
    ])
  }

  const removeAssignment = (id: string) => {
    setAssignments(prev => prev.filter(a => a.id !== id))
  }

  const updateAssignment = (id: string, field: keyof Assignment, value: any) => {
    setAssignments(prev => prev.map(a => {
      if (a.id === id) {
        // If year or section changes, we need to clear subjects and re-fetch available subjects
        if (field === 'year' || field === 'section') {
          const updated = { ...a, [field]: value, subjects: [] }
          // Trigger subject fetch if both year and section are now set
          if (updated.year && updated.section) {
            fetchSubjects(updated.year, updated.section)
          }
          return updated
        }
        return { ...a, [field]: value }
      }
      return a
    }))
  }

  const fetchSubjects = async (year: string, section: string) => {
    const key = `${year}-${section}`
    if (availableSubjectsCache[key] || loadingSubjects.has(key)) return

    setLoadingSubjects(prev => new Set(prev).add(key))
    try {
      const subjects = await ScheduledClassService.getAllSubjects(dept, year, section)
      setAvailableSubjectsCache(prev => ({ ...prev, [key]: subjects }))
    } catch (e) {
      logger.error('Error fetching subjects', e)
    } finally {
      setLoadingSubjects(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const toggleSubject = (assignmentId: string, subject: string) => {
    setAssignments(prev => prev.map(a => {
      if (a.id === assignmentId) {
        const subjects = a.subjects.includes(subject)
          ? a.subjects.filter(s => s !== subject)
          : [...a.subjects, subject]
        return { ...a, subjects }
      }
      return a
    }))
  }

  const handleSubmit = async () => {
    if (!selectedUser) return
    
    // Validate
    const invalid = assignments.some(a => !a.year || !a.section || a.subjects.length === 0)
    if (invalid) {
      setError('Please complete all assignment fields (Year, Section, and at least one Subject).')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const success = await FacultyService.assignFaculty({
        user: selectedUser,
        dept, // Pass the current department
        assignments
      })

      if (success) {
        onSuccess()
        onClose()
      } else {
        setError('Failed to assign faculty. Please try again.')
      }
    } catch (e) {
      setError('An error occurred during submission.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden border border-gray-100">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white shrink-0">
          <div>
            <h3 className="text-xl font-bold uppercase text-gray-900 tracking-tight">
              {step === 'search' ? 'Add Faculty' : 'Assign Classes'}
            </h3>
            <p className="text-sm text-gray-500 mt-1 font-medium">
               {step === 'search' ? 'Search for a user to add as faculty' : `Assigning to: ${selectedUser?.displayName}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 shadow-sm">
              <AlertCircle className="w-5 h-5 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {step === 'search' ? (
            <div className="space-y-6">
              <div className="flex gap-2">
                <div className="relative group flex-1">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search by name or email..."
                    className="block w-full pl-11 pr-4 py-4 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm text-base"
                    autoFocus
                  />
                  {isSearching && (
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                      <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-6 py-4 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide text-sm flex items-center gap-2"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>

              {/* Results List */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm min-h-[300px]">
                {searchResults.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleSelectUser(user)}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left group"
                      >
                         <div className="flex items-center gap-4">
                           <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                             <User className="w-5 h-5" />
                           </div>
                           <div>
                             <h4 className="font-semibold text-gray-900">{user.displayName}</h4>
                             <div className="flex items-center gap-1.5 text-sm text-gray-500">
                               <Mail className="w-3.5 h-3.5" />
                               {user.mail || user.userPrincipalName}
                             </div>
                           </div>
                         </div>
                         <div className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-300 group-hover:border-blue-500 group-hover:text-blue-500">
                           <Plus className="w-5 h-5" />
                         </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="h-[300px] flex flex-col items-center justify-center text-center p-8 text-gray-400">
                    {searchQuery ? (
                      <>
                        <p className="text-gray-900 font-semibold">NO USERS FOUND</p>
                        <p className="text-sm mt-1">Try a different search term</p>
                      </>
                    ) : (
                      <>
                        <User className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-gray-900 font-semibold">SEARCH USERS</p>
                        <p className="text-sm mt-1">Find faculty members to add</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {assignments.map((assignment, index) => (
                <div key={assignment.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative animate-in slide-in-from-bottom-2 fade-in duration-300">
                  <div className="flex justify-between items-start mb-4">
                     <h4 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Assignment #{index + 1}</h4>
                     {assignments.length > 1 && (
                       <button onClick={() => removeAssignment(assignment.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                         <Trash2 className="w-4 h-4" />
                       </button>
                     )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Year</label>
                      <div className="relative">
                        <select
                          value={assignment.year}
                          onChange={(e) => updateAssignment(assignment.id, 'year', e.target.value)}
                          className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none font-medium"
                        >
                          <option value="">Select Year</option>
                          {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                         <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Section</label>
                      <div className="relative">
                        <select
                          value={assignment.section}
                          onChange={(e) => updateAssignment(assignment.id, 'section', e.target.value)}
                          className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none font-medium"
                        >
                          <option value="">Select Section</option>
                          {sections.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                         <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div>
                     <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Subjects</label>
                     {assignment.year && assignment.section ? (
                       loadingSubjects.has(`${assignment.year}-${assignment.section}`) ? (
                         <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                           <Loader2 className="w-4 h-4 animate-spin" /> Loading subjects...
                         </div>
                       ) : (availableSubjectsCache[`${assignment.year}-${assignment.section}`] || []).length > 0 ? (
                         <div className="flex flex-wrap gap-2">
                           {(availableSubjectsCache[`${assignment.year}-${assignment.section}`] || []).map(subject => {
                             const isSelected = assignment.subjects.includes(subject)
                             return (
                               <button
                                 key={subject}
                                 onClick={() => toggleSubject(assignment.id, subject)}
                                 className={cn(
                                   "px-3 py-1.5 text-sm font-medium rounded-lg border transition-all duration-200",
                                   isSelected 
                                     ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm" 
                                     : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                                 )}
                               >
                                 {subject}
                               </button>
                             )
                           })}
                         </div>
                       ) : (
                         <p className="text-sm text-gray-400 italic">No subjects found for this class.</p>
                       )
                     ) : (
                       <p className="text-sm text-gray-400 italic">Select Year and Section to view subjects</p>
                     )}
                  </div>
                </div>
              ))}

              <button
                onClick={addAssignment}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-semibold hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Assign Another Class
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-gray-100 bg-white shrink-0 flex justify-between items-center">
           {step === 'assign' && (
             <button 
               onClick={() => setStep('search')}
               className="text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
             >
               Back to Search
             </button>
           )}
           <div className={cn("flex gap-3", step === 'search' && "ml-auto")}>
             <button
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all"
             >
               Cancel
             </button>
             {step === 'assign' && (
               <button
                 onClick={handleSubmit}
                 disabled={isSubmitting}
                 className="px-6 py-2.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-gray-200 transition-all flex items-center gap-2"
               >
                 {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                 Confirm & Add
               </button>
             )}
           </div>
        </div>
      </div>
    </div>
  )
}
