'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Loader2, Plus, Trash2, ChevronDown, AlertCircle, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FacultyService, FacultyAllocation } from '@/lib/services/facultyService'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { logger } from '@/lib/logger'

interface EditFacultyAssignmentsModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    facultyEmail: string
    facultyName: string
    facultyId: string // The user ID of the faculty member
    dept: string
}

type EditableAssignment = {
    id: string // allocation ID (or temp ID for new ones)
    isNew: boolean
    isDeleted: boolean
    year: string
    section: string
    subject_name: string
    original?: FacultyAllocation // Keep reference to original for comparison/updates
}

export default function EditFacultyAssignmentsModal({
    isOpen,
    onClose,
    onSuccess,
    facultyEmail,
    facultyName,
    facultyId,
    dept
}: EditFacultyAssignmentsModalProps) {
    const [loading, setLoading] = useState(true)
    const [assignments, setAssignments] = useState<EditableAssignment[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Options
    const years = ['2', '3', '4']
    const sections = ['A', 'B', 'C']

    // Available subjects cache: Key = "year-section", Value = string[]
    const [availableSubjectsCache, setAvailableSubjectsCache] = useState<Record<string, string[]>>({})
    const [loadingSubjects, setLoadingSubjects] = useState<Set<string>>(new Set())

    const fetchSubjects = useCallback(async (year: string, section: string) => {
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
    }, [availableSubjectsCache, loadingSubjects, dept])

    const loadAssignments = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await FacultyService.getIndividualAssignments(facultyEmail)

            const mapped: EditableAssignment[] = data.map(a => ({
                id: a.id,
                isNew: false,
                isDeleted: false,
                year: a.year,
                section: a.section,
                subject_name: a.subject_name,
                original: a
            }))

            setAssignments(mapped)

            // Pre-fetch subjects for existing assignments to show correct dropdowns
            // We deduplicate requests by year-section
            const uniqueClasses = new Set(mapped.map(a => `${a.year}-${a.section}`))
            uniqueClasses.forEach(key => {
                const [y, s] = key.split('-')
                if (y && s) fetchSubjects(y, s)
            })

        } catch (e) {
            logger.error('Error loading assignments:', e)
            setError('Failed to load existing assignments.')
        } finally {
            setLoading(false)
        }
    }, [facultyEmail, fetchSubjects])

    useEffect(() => {
        if (isOpen && facultyEmail) {
            loadAssignments()
        } else {
            setAssignments([])
            setError(null)
        }
    }, [isOpen, facultyEmail, loadAssignments])

    const handleAddAssignment = () => {
        setAssignments(prev => [
            ...prev,
            {
                id: `temp-${Math.random().toString(36).substr(2, 9)}`,
                isNew: true,
                isDeleted: false,
                year: '',
                section: '',
                subject_name: ''
            }
        ])
    }

    const handleRemoveAssignment = (id: string) => {
        setAssignments(prev => prev.map(a => {
            if (a.id === id) {
                return { ...a, isDeleted: true }
            }
            return a
        }))
    }

    const handleUndoRemove = (id: string) => {
        setAssignments(prev => prev.map(a => {
            if (a.id === id) {
                return { ...a, isDeleted: false }
            }
            return a
        }))
    }

    const handleUpdateAssignment = (id: string, field: keyof EditableAssignment, value: string) => {
        setAssignments(prev => prev.map(a => {
            if (a.id === id) {
                const updated = { ...a, [field]: value }

                // If year or section changes, reset subject and fetch new subjects
                if (field === 'year' || field === 'section') {
                    updated.subject_name = '' // Reset subject
                    if (updated.year && updated.section) {
                        fetchSubjects(updated.year, updated.section)
                    }
                }
                return updated
            }
            return a
        }))
    }

    const handleSave = async () => {
        // Validation
        const activeAssignments = assignments.filter(a => !a.isDeleted)
        const invalid = activeAssignments.some(a => !a.year || !a.section || !a.subject_name)

        if (invalid) {
            setError('Please fill in Year, Section, and Subject for all active assignments.')
            return
        }

        setSaving(true)
        setError(null)
        try {
            const promises = []

            // 1. Handle Deletions
            const toDelete = assignments.filter(a => a.isDeleted && !a.isNew)
            for (const item of toDelete) {
                promises.push(FacultyService.deleteFacultyAllocation(item.id))
            }

            // 2. Handle Updates
            const toUpdate = assignments.filter(a => !a.isDeleted && !a.isNew)
            for (const item of toUpdate) {
                if (
                    item.year !== item.original?.year ||
                    item.section !== item.original?.section ||
                    item.subject_name !== item.original?.subject_name
                ) {
                    promises.push(FacultyService.updateFacultyAllocation(item.id, {
                        year: item.year,
                        section: item.section,
                        subject_name: item.subject_name
                    }))
                }
            }

            // 3. Handle Creations
            const toCreate = assignments.filter(a => !a.isDeleted && a.isNew)
            for (const item of toCreate) {
                const newAllocation: Omit<FacultyAllocation, 'id' | 'created_at'> = {
                    faculty_name: facultyName,
                    faculty_email: facultyEmail,
                    faculty_id: facultyId,
                    dept: dept, // Ensure this matches current context/dept
                    year: item.year,
                    section: item.section,
                    subject_name: item.subject_name
                }
                promises.push(FacultyService.createFacultyAllocation(newAllocation))
            }

            await Promise.all(promises)

            onSuccess()
            onClose()

        } catch (e) {
            logger.error('Error saving assignments:', e)
            setError('Failed to save changes. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    if (!isOpen) return null

    const visibleAssignments = assignments.filter(a => !a.isDeleted || !a.isNew) // Hide deleted new items completely

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden border border-gray-100">

                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white shrink-0">
                    <div>
                        <h3 className="text-xl font-bold uppercase text-gray-900 tracking-tight">
                            Edit Assignments
                        </h3>
                        <p className="text-sm text-gray-500 mt-1 font-medium">
                            {facultyName} ({facultyEmail})
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

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                            <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" />
                            <p className="text-sm font-medium">Loading assignments...</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {visibleAssignments.length === 0 && (
                                <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300">
                                    <p className="text-gray-500 font-medium">No active assignments.</p>
                                    <p className="text-sm text-gray-400 mt-1">Click below to add a class.</p>
                                </div>
                            )}

                            {assignments.map((assignment) => {
                                if (assignment.isDeleted && assignment.isNew) return null // Should be handled by visibleAssignments but double check

                                if (assignment.isDeleted) {
                                    return (
                                        <div key={assignment.id} className="bg-red-50 p-4 rounded-xl border border-red-100 flex justify-between items-center opacity-70">
                                            <div className="text-sm text-red-700 font-medium">
                                                <span className="line-through">{assignment.subject_name || 'Untitled'}</span>
                                                <span className="mx-2">•</span>
                                                <span className="line-through">Year {assignment.year} - {assignment.section}</span>
                                                <span className="ml-2 text-xs bg-red-100 px-2 py-0.5 rounded-full">Marked for deletion</span>
                                            </div>
                                            <button
                                                onClick={() => handleUndoRemove(assignment.id)}
                                                className="text-xs font-bold text-red-600 hover:underline uppercase tracking-wide"
                                            >
                                                Undo
                                            </button>
                                        </div>
                                    )
                                }

                                return (
                                    <div key={assignment.id} className={cn(
                                        "bg-white p-5 rounded-xl border shadow-sm transition-all duration-200",
                                        assignment.isNew ? "border-blue-200 bg-blue-50/30" : "border-gray-200"
                                    )}>
                                        <div className="flex gap-4 items-start">
                                            <div className="flex-1 grid grid-cols-12 gap-4">
                                                {/* Year */}
                                                <div className="col-span-3">
                                                    <div className="relative">
                                                        <select
                                                            value={assignment.year}
                                                            onChange={(e) => handleUpdateAssignment(assignment.id, 'year', e.target.value)}
                                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none font-medium"
                                                        >
                                                            <option value="">Year</option>
                                                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                                                        </select>
                                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                                                    </div>
                                                </div>

                                                {/* Section */}
                                                <div className="col-span-3">
                                                    <div className="relative">
                                                        <select
                                                            value={assignment.section}
                                                            onChange={(e) => handleUpdateAssignment(assignment.id, 'section', e.target.value)}
                                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none font-medium"
                                                        >
                                                            <option value="">Sec</option>
                                                            {sections.map(s => <option key={s} value={s}>{s}</option>)}
                                                        </select>
                                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                                                    </div>
                                                </div>

                                                {/* Subject */}
                                                <div className="col-span-6">
                                                    <div className="relative">
                                                        <select
                                                            value={assignment.subject_name}
                                                            onChange={(e) => handleUpdateAssignment(assignment.id, 'subject_name', e.target.value)}
                                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none font-medium"
                                                            disabled={!assignment.year || !assignment.section}
                                                        >
                                                            <option value="">Select Subject</option>
                                                            {(availableSubjectsCache[`${assignment.year}-${assignment.section}`] || []).map(s => (
                                                                <option key={s} value={s}>{s}</option>
                                                            ))}
                                                            {/* If current subject is not in list (e.g. data mismatch), still show it as option */}
                                                            {assignment.subject_name && !(availableSubjectsCache[`${assignment.year}-${assignment.section}`] || []).includes(assignment.subject_name) && (
                                                                <option value={assignment.subject_name}>{assignment.subject_name}</option>
                                                            )}
                                                        </select>
                                                        {loadingSubjects.has(`${assignment.year}-${assignment.section}`) && (
                                                            <div className="absolute right-8 top-1/2 -translate-y-1/2">
                                                                <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                                                            </div>
                                                        )}
                                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                                                    </div>
                                                </div>
                                            </div>

                                            <Tooltip content="Delete Assignment">
                                                <button
                                                    onClick={() => handleRemoveAssignment(assignment.id)}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </Tooltip>
                                        </div>
                                    </div>
                                )
                            })}

                            <button
                                onClick={handleAddAssignment}
                                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-semibold hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 mt-4"
                            >
                                <Plus className="w-5 h-5" />
                                Add New Assignment
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-5 border-t border-gray-100 bg-white shrink-0 flex justify-end items-center gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading || saving}
                        className="px-6 py-2.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-gray-200 transition-all flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    )
}
