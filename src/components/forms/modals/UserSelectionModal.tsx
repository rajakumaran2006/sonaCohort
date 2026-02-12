'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { peertutorservice, peertutorsAssignment } from '@/lib/services/peerTutorService'
import { StudentService, StudentAssignment } from '@/lib/services/studentService'
import { useAuth } from '@/lib/auth/AuthContext'
import { Search, X, Loader2, User, Mail, Check, AlertCircle, ChevronDown, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MicrosoftUser } from '@/lib/types'
import ManualStudentEntry from './ManualStudentEntry'

interface UserSelectionModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    mode: 'peer-tutor' | 'student'
    dept: string
    year?: string
    section?: string
    availableYears?: string[]
    availableSections?: string[]
}

type ViewMode = 'all' | 'selected'
type EntryMode = 'microsoft' | 'manual'

export default function UserSelectionModal({
    isOpen,
    onClose,
    onSuccess,
    mode,
    dept,
    year,
    section,
    availableYears = [],
    availableSections = []
}: UserSelectionModalProps) {
    const { user } = useAuth()
    const [viewMode, setViewMode] = useState<ViewMode>('all')
    const [entryMode, setEntryMode] = useState<EntryMode>('microsoft')
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<MicrosoftUser[]>([])
    const [isSearching, setIsSearching] = useState(false)

    // Selection state for dropdowns
    const [selectedYear, setSelectedYear] = useState(year || '')
    const [selectedSection, setSelectedSection] = useState(section || '')

    // Reset internal state when props change or modal re-opens
    useEffect(() => {
        if (isOpen) {
            setSelectedYear(year || '')
            setSelectedSection(section || '')
            setViewMode('all')
            setEntryMode('microsoft')
            setSearchQuery('')
            setSearchResults([])
            setSelectedUsers(new Map())
            setError(null)
            setIsSubmitting(false)
        }
    }, [isOpen, year, section])

    const [selectedUsers, setSelectedUsers] = useState<Map<string, MicrosoftUser>>(new Map())

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const isContextSelected = !!selectedYear && !!selectedSection

    const title = mode === 'peer-tutor' ? 'ADD PEER TUTOR' : 'ADD STUDENT'

    let searchPlaceholder = 'Select Year and Section first...'
    if (isContextSelected) {
        searchPlaceholder = mode === 'peer-tutor'
            ? 'Search for peer tutors...'
            : 'Search for students...'
    }

    const emptySearchMessage = mode === 'peer-tutor'
        ? 'SEARCH FOR PEER TUTORS'
        : 'SEARCH FOR STUDENTS'

    const emptySearchSubtext = isContextSelected
        ? (mode === 'peer-tutor' ? 'Enter a name or email to assign as peer tutor' : 'Enter a name or email to add to this section')
        : 'Please select a Year and Section to start searching'

    // Search logic
    const handleSearch = useCallback(async () => {
        if (!searchQuery.trim()) return
        if (!isContextSelected) return

        setIsSearching(true)
        setError(null)

        try {
            let results: MicrosoftUser[] = []
            if (mode === 'peer-tutor') {
                results = await peertutorservice.searchAvailableStudents(searchQuery)
            } else {
                // For students, we pass dept/year/section though they might not be strictly used for filtering in the current service implementation
                // But passing them ensures future compatibility
                results = await StudentService.searchAvailableStudents(searchQuery, dept, selectedYear, selectedSection)
            }
            setSearchResults(results)
        } catch {
            setError('Failed to search. Please try again.')
            setSearchResults([])
        } finally {
            setIsSearching(false)
        }
    }, [searchQuery, mode, dept, selectedYear, selectedSection, isContextSelected])

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim() && isContextSelected) {
                handleSearch()
            } else {
                setSearchResults([])
            }
        }, 500)

        return () => clearTimeout(timer)
    }, [searchQuery, handleSearch, isContextSelected])

    // Toggle selection
    const handleToggleUser = (user: MicrosoftUser) => {
        const key = user.mail || user.userPrincipalName
        if (!key) return

        const newSelected = new Map(selectedUsers)
        if (newSelected.has(key)) {
            newSelected.delete(key)
        } else {
            newSelected.set(key, user)
        }
        setSelectedUsers(newSelected)
    }

    // Select All logic
    const handleSelectAll = (isChecked: boolean) => {
        const newSelected = new Map(selectedUsers)

        searchResults.forEach(user => {
            const key = user.mail || user.userPrincipalName
            if (!key) return

            if (isChecked) {
                newSelected.set(key, user)
            } else {
                newSelected.delete(key)
            }
        })

        setSelectedUsers(newSelected)
    }

    // Check if all visible results are selected
    const areAllSelected = useMemo(() => {
        if (searchResults.length === 0) return false
        return searchResults.every(user => {
            const key = user.mail || user.userPrincipalName
            return key && selectedUsers.has(key)
        })
    }, [searchResults, selectedUsers])

    const handleClearSelection = () => {
        setSelectedUsers(new Map())
        setSearchQuery('')
        setSearchResults([])
        setViewMode('all')
    }

    const getDisplayedUsers = () => {
        if (viewMode === 'selected') {
            return Array.from(selectedUsers.values())
        }
        return searchResults
    }

    // Submit logic (Assign Peer Tutor or Add Student)
    const handleSubmit = async () => {
        if (selectedUsers.size === 0 || !user || !isContextSelected) return

        setIsSubmitting(true)
        setError(null)

        try {
            if (mode === 'peer-tutor') {
                const assignments: peertutorsAssignment[] = Array.from(selectedUsers.values()).map(u => ({
                    name: u.displayName || 'Unknown',
                    email: u.mail || u.userPrincipalName,
                    faculty_id: user.id,
                    dept,
                    year: selectedYear,
                    section: selectedSection,
                    assigned_by: user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Unknown'
                }))

                const results = await Promise.allSettled(
                    assignments.map(a => peertutorservice.assignpeertutors(a))
                )
                
                // Collect error messages
                const errors: string[] = []
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled' && !result.value.success) {
                        errors.push(result.value.error || `${assignments[index].name}: Unknown error`)
                    } else if (result.status === 'rejected') {
                        errors.push(`${assignments[index].name}: Failed to add`)
                    }
                })
                
                processResults(results, errors)

            } else {
                const students: StudentAssignment[] = Array.from(selectedUsers.values()).map(u => ({
                    name: u.displayName || 'Unknown',
                    email: u.mail || u.userPrincipalName,
                    dept,
                    year: selectedYear,
                    section: selectedSection,
                    faculty_id: user.id,
                    peer_tutor: false
                }))

                const results = await Promise.allSettled(
                    students.map(s => StudentService.addStudent(s))
                )
                
                // Collect error messages
                const errors: string[] = []
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled' && !result.value.success) {
                        errors.push(result.value.error || `${students[index].name}: Unknown error`)
                    } else if (result.status === 'rejected') {
                        errors.push(`${students[index].name}: Failed to add`)
                    }
                })
                
                processResults(results, errors)
            }
        } catch {
            setError(`An error occurred while adding ${mode === 'peer-tutor' ? 'peer tutors' : 'students'}.`)
            setIsSubmitting(false)
        }
    }

    const processResults = (results: PromiseSettledResult<unknown>[], errors: string[] = []) => {
        const successful = results.filter(result => {
            if (result.status === 'fulfilled') {
                // For the new structured response format
                const value = result.value as { success?: boolean } | boolean
                if (typeof value === 'object' && value !== null) {
                    return value.success === true
                }
                return value === true
            }
            return false
        }).length
        const failed = results.length - successful

        setIsSubmitting(false)

        if (successful > 0) {
            onSuccess()
            if (failed === 0) {
                onClose()
                handleClearSelection()
            } else {
                // Format error messages with line breaks for better readability
                const errorMessage = errors.length > 0 
                    ? `Successfully added ${successful} user${successful !== 1 ? 's' : ''}.\n\n${errors.join('\n')}`
                    : `Successfully added ${successful}. ${failed} failed.`
                setError(errorMessage)
            }
        } else {
            // All failed - show error messages
            const errorMessage = errors.length > 0
                ? errors.join('\n')
                : 'Failed to add any users. Please try again.'
            setError(errorMessage)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[85vh] overflow-hidden border border-gray-100">

                {/* Header */}
                <div className="flex flex-col border-b border-gray-100 bg-white shrink-0">
                    <div className="px-8 py-6 flex justify-between items-start">
                        <div className="flex flex-col gap-2">
                            <h3 className="text-xl font-bold uppercase text-gray-900 tracking-tight">
                                {title}
                            </h3>
                            {/* Manual Entry Toggle */}
                            {/* Manual Entry Toggle */}
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setEntryMode('microsoft')}
                                    className={cn(
                                        "px-3 py-1 text-xs font-bold rounded-md transition-all",
                                        entryMode === 'microsoft' 
                                            ? "bg-white text-blue-600 shadow-sm" 
                                            : "text-gray-500 hover:text-gray-700"
                                    )}
                                >
                                    DIRECTORY
                                </button>
                                <button
                                    onClick={() => setEntryMode('manual')}
                                    className={cn(
                                        "px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1",
                                        entryMode === 'manual' 
                                            ? "bg-white text-blue-600 shadow-sm" 
                                            : "text-gray-500 hover:text-gray-700"
                                    )}
                                >
                                    MANUAL
                                </button>
                            </div>
                            {/* Breadcrumb-like Info / Fake Dropdowns matching screenshot */}
                            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                                <span className="uppercase text-gray-700">{dept}</span>
                                <span className="text-gray-300">•</span>

                                {/* Year "Dropdown" */}
                                {year ? (
                                    // Fixed Year (Display only)
                                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-gray-700 cursor-not-allowed opacity-80">
                                        <span className="text-xs font-semibold">Year {year}</span>
                                    </div>
                                ) : (
                                    // Selectable Year
                                    <div className="relative">
                                        <select
                                            value={selectedYear}
                                            onChange={(e) => setSelectedYear(e.target.value)}
                                            className="appearance-none bg-gray-50 border border-gray-200 rounded-lg pl-2 pr-6 py-1 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                                        >
                                            <option value="" disabled>Select Year</option>
                                            {availableYears.map(y => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                                    </div>
                                )}

                                <span className="text-gray-300">•</span>

                                {/* Section "Dropdown" */}
                                {section ? (
                                    // Fixed Section (Display only)
                                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-gray-700 cursor-not-allowed opacity-80">
                                        <span className="text-xs font-semibold">Section {section}</span>
                                    </div>
                                ) : (
                                    // Selectable Section
                                    <div className="relative">
                                        <select
                                            value={selectedSection}
                                            onChange={(e) => setSelectedSection(e.target.value)}
                                            className="appearance-none bg-gray-50 border border-gray-200 rounded-lg pl-2 pr-6 py-1 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                                        >
                                            <option value="" disabled>Select Section</option>
                                            {availableSections.map(s => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                                    </div>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex px-8 gap-6 border-b border-gray-100/50">
                        <button
                            onClick={() => setViewMode('all')}
                            className={cn(
                                "pb-3 text-sm font-bold uppercase transition-all relative tracking-wide",
                                viewMode === 'all'
                                    ? "text-blue-600"
                                    : "text-gray-400 hover:text-gray-600"
                            )}
                        >
                            All USERS
                            {viewMode === 'all' && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />
                            )}
                        </button>
                        <button
                            onClick={() => setViewMode('selected')}
                            className={cn(
                                "pb-3 text-sm font-bold uppercase transition-all relative tracking-wide",
                                viewMode === 'selected'
                                    ? "text-blue-600"
                                    : "text-gray-400 hover:text-gray-600"
                            )}
                        >
                            SELECTED
                            {selectedUsers.size > 0 && (
                                <span className="ml-2 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs font-bold border border-gray-200">
                                    {selectedUsers.size}
                                </span>
                            )}
                            {viewMode === 'selected' && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col p-8 bg-gray-50/50 min-h-0">

                    {/* Search Bar - Only visible in 'all' mode */}
                    {viewMode === 'all' && (
                        <div className="relative mb-6 shrink-0 group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                disabled={!isContextSelected}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={searchPlaceholder}
                                className={cn(
                                    "block w-full pl-11 pr-4 py-4 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm text-base",
                                    !isContextSelected && "bg-gray-50 cursor-not-allowed opacity-80"
                                )}
                                autoFocus={isContextSelected}
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
                            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                            <p className="text-sm font-medium whitespace-pre-line">{error}</p>
                        </div>
                    )}

                    {/* Table Container */}
                    <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden shadow-sm flex-1 min-h-0">
                        {(getDisplayedUsers().length > 0) ? (
                            <div className="flex flex-col h-full animate-in fade-in duration-300">
                                {/* Table Header */}
                                <div className="bg-gray-50/80 border-b border-gray-200 px-6 py-3 grid grid-cols-[auto_1.5fr_2fr_1fr] gap-4 items-center shrink-0">
                                    <div className="w-5 flex items-center justify-center">
                                        {viewMode === 'all' && searchQuery ? (
                                            <input
                                                type="checkbox"
                                                checked={areAllSelected}
                                                onChange={(e) => handleSelectAll(e.target.checked)}
                                                className="w-5 h-5 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer transition-all focus:ring-offset-0 focus:ring-2"
                                            />
                                        ) : (
                                            <div className="w-5 h-5" />
                                        )}
                                    </div>
                                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Name</div>
                                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Email</div>
                                    {/* Just a spacer/column for role or whatever */}
                                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Action</div>
                                </div>

                                {/* Table Body (Scrollable) */}
                                <div
                                    className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden"
                                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                                >
                                    {getDisplayedUsers().map((user, index) => {
                                        const key = user.mail || user.userPrincipalName
                                        const isSelected = key ? selectedUsers.has(key) : false
                                        return (
                                            <div
                                                key={key || index}
                                                onClick={() => handleToggleUser(user)}
                                                className={cn(
                                                    "px-6 py-4 grid grid-cols-[auto_1.5fr_2fr_1fr] gap-4 items-center border-b border-gray-100 last:border-0 cursor-pointer transition-all duration-200 group",
                                                    isSelected ? "bg-blue-50/50 hover:bg-blue-50" : "hover:bg-gray-50"
                                                )}
                                            >
                                                <div className="w-5 flex items-center justify-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleToggleUser(user)}
                                                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors shadow-sm",
                                                        isSelected ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
                                                    )}>
                                                        <User className="w-4 h-4" />
                                                    </div>
                                                    <span className={cn("font-semibold text-sm", isSelected ? "text-blue-900" : "text-gray-900")}>
                                                        {user.displayName || 'Unknown Name'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm overflow-hidden">
                                                    <Mail className={cn("w-3.5 h-3.5 shrink-0", isSelected ? "text-blue-400" : "text-gray-400")} />
                                                    <span className={cn("truncate", isSelected ? "text-blue-700" : "text-gray-500")}>
                                                        {key || 'No email provided'}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    {isSelected && (
                                                        <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider">
                                                            Selected
                                                        </span>
                                                    )}
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
                                            <Image src="/icons/search.png" alt="No results" width={96} height={96} className="mx-auto opacity-60 grayscale" />
                                            <p className="text-black font-semibold mt-4">NO RESULTS FOUND</p>
                                            <p className="text-sm mt-1 text-gray-500">Try searching with a different name or email</p>
                                        </>
                                    ) : ( // Initial State
                                        <>
                                            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                                                <Search className="w-8 h-8 text-gray-400" />
                                            </div>
                                            <p className="text-gray-900 font-bold text-lg">{emptySearchMessage}</p>
                                            <p className="text-sm mt-2 max-w-xs mx-auto text-gray-500 leading-relaxed">
                                                {emptySearchSubtext}
                                            </p>
                                        </>
                                    )
                                ) : ( // Selected Empty State
                                    <>
                                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <User className="text-gray-400 w-8 h-8" />
                                        </div>
                                        <p className="text-gray-900 font-semibold text-lg">NO USERS SELECTED</p>
                                        <p className="text-sm mt-1 max-w-xs mx-auto text-gray-500">
                                            Select users from the &quot;Available&quot; tab to see them here
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
                        <div className="text-sm flex items-center gap-2">
                            <span className="text-gray-500 font-medium">SELECTED ({selectedUsers.size})</span>
                            {selectedUsers.size > 0 && <span className="h-1 w-1 bg-gray-300 rounded-full"></span>}
                            {/* Optional: Show avatars of selected users here? */}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="px-6 py-2.5 text-sm font-bold text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all duration-200 focus:ring-2 focus:ring-gray-200"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={selectedUsers.size === 0 || isSubmitting || !isContextSelected}
                                className="px-6 py-2.5 text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-gray-200 transition-all duration-200 flex items-center gap-2 focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
                            >
                                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                {!isSubmitting && selectedUsers.size > 0 && <Check className="w-4 h-4" />}
                                {isSubmitting ? 'PROCESSING...' : 'ADD SELECTED'}
                            </button>
                        </div>
                    </div>
                </div>
            {/* Render Manual Entry Modal Overlay if in manual mode */}
            {entryMode === 'manual' && isContextSelected && (
                <div className="absolute inset-0 z-10 bg-white">
                    <ManualStudentEntry
                        dept={dept}
                        year={selectedYear}
                        section={selectedSection}
                        mode={mode}
                        onClose={() => setEntryMode('microsoft')}
                        onSuccess={() => {
                            onSuccess()
                        }}
                    />
                </div>
            )}
            </div>
        </div>
    )
}
