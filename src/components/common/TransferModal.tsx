'use client'

import React, { useState, useEffect } from 'react'
import Modal, { ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { ClassService } from '@/lib/services/classService'
import { StudentService } from '@/lib/services/studentService'
import { peertutorservice as PeerTutorService } from '@/lib/services/peerTutorService'
import { AlertCircle, CheckCircle, XCircle, Loader2, Users } from 'lucide-react'

interface ItemToTransfer {
  id: string
  name: string
  email: string
  hasAssignment: boolean // true if student has peer tutor OR peer tutor has students
}

interface TransferModalProps {
  isOpen: boolean
  onClose: () => void
  onTransfer: (section: string, validIds: string[]) => Promise<void>
  items: ItemToTransfer[]
  type: 'students' | 'peerTutors'
  dept: string
  year: string
  currentSection: string
}

interface SectionValidation {
  section: string
  canTransfer: boolean
  existingEmails: string[]
  conflictingItems: ItemToTransfer[]
}

export default function TransferModal({
  isOpen,
  onClose,
  onTransfer,
  items,
  type,
  dept,
  year,
  currentSection
}: TransferModalProps) {
  const [availableSections, setAvailableSections] = useState<string[]>([])
  const [sectionValidations, setSectionValidations] = useState<Map<string, SectionValidation>>(new Map())
  const [selectedSection, setSelectedSection] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter valid items (those without assignments)
  const validItems = items.filter(item => !item.hasAssignment)
  const invalidItems = items.filter(item => item.hasAssignment)
  const hasValidItems = validItems.length > 0

  // Get validation for selected section
  const selectedSectionValidation = selectedSection ? sectionValidations.get(selectedSection) : null
  const conflictingItems = selectedSectionValidation?.conflictingItems ?? []
  const transferableItems = validItems.filter(item => 
    !conflictingItems.some(c => c.email === item.email)
  )

  const loadSections = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // console.log('Loading sections for:', { dept, year, currentSection })
      const sections = await ClassService.getSectionsForYear(dept, year)
      // console.log('All sections found:', sections)
      
      // Filter out current section (case-insensitive comparison)
      const otherSections = sections.filter(s => 
        s.toUpperCase() !== currentSection.toUpperCase()
      )
      
      // console.log('Available sections after filtering:', otherSections)
      
      if (otherSections.length === 0) {
        setError('No other sections available for this year. Please create additional sections first.')
      }
      
      setAvailableSections(otherSections)
    } catch (err) {
      console.error('Error loading sections:', err)
      setError('Failed to load sections. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [dept, year, currentSection])

  useEffect(() => {
    if (isOpen) {
      loadSections()
      setSelectedSection('')
      setError(null)
      setConfirming(false)
      setSectionValidations(new Map())
    }
  }, [isOpen, dept, year, loadSections])

  // Validate if items can be transferred to a specific section
  const validateSection = React.useCallback(async (section: string) => {
    if (!section || sectionValidations.has(section)) return
    
    setValidating(true)
    try {
      const validation: SectionValidation = {
        section,
        canTransfer: true,
        existingEmails: [],
        conflictingItems: []
      }

      // Check if items already exist in the target section
      if (type === 'students') {
        const existingStudents = await StudentService.getStudentsBySection(dept, year, section)
        const existingEmails = existingStudents.map(s => s.email.toLowerCase())
        validation.existingEmails = existingEmails
        
        // Find conflicting items
        validation.conflictingItems = validItems.filter(item =>
          existingEmails.includes(item.email.toLowerCase())
        )
        
        validation.canTransfer = validation.conflictingItems.length === 0
      } else {
        const existingPeerTutors = await PeerTutorService.getpeerTutorBySection(dept, year, section)
        const existingEmails = existingPeerTutors.map((pt: { email: string }) => pt.email.toLowerCase())
        validation.existingEmails = existingEmails
        
        // Find conflicting items
        validation.conflictingItems = validItems.filter(item =>
          existingEmails.includes(item.email.toLowerCase())
        )
        
        validation.canTransfer = validation.conflictingItems.length === 0
      }

      setSectionValidations(prev => new Map(prev).set(section, validation))
    } catch (err) {
      console.error('Error validating section:', err)
    } finally {
      setValidating(false)
    }
  }, [dept, year, type, validItems, sectionValidations])

  // Validate when section is selected
  useEffect(() => {
    if (selectedSection && !sectionValidations.has(selectedSection)) {
      validateSection(selectedSection)
    }
  }, [selectedSection, sectionValidations, validateSection])

  const handleTransfer = async () => {
    if (!selectedSection) return
    
    // Double-check validation
    if (transferableItems.length === 0) {
      setError('No items can be transferred to this section.')
      return
    }
    
    setConfirming(true)
    setError(null)
    try {
      await onTransfer(selectedSection, transferableItems.map(i => i.id))
      onClose()
    } catch (err) {
      console.error('Transfer failed:', err)
      setError('Transfer failed. Please try again.')
    } finally {
      setConfirming(false)
    }
  }

  const getTypeName = () => type === 'students' ? 'Students' : 'Peer Tutors'

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <ModalTitle className='uppercase'>Transfer {getTypeName()}</ModalTitle>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {items.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <div className="bg-gray-50 rounded-full h-16 w-16 flex items-center justify-center mx-auto mb-3">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <p>No {getTypeName().toLowerCase()} selected.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Banner */}
            {!hasValidItems ? (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex items-start gap-3">
                <div className="text-sm text-red-800">
                  <p className="font-semibold">TRANSFER UNAVAILABLE</p>
                </div>
              </div>
            ) : invalidItems.length > 0 && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold">PARTIAL TRANSFER</p>
                </div>
              </div>
            )}

            {/* List Table */}
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto custom-scrollbar">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th scope="col" className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900">{item.name}</span>
                            <span className="text-xs text-gray-500">{item.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          {item.hasAssignment ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                              INELIGIBLE
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                              ELIGIBLE
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section Selection - Only show if there are valid items */}
            {hasValidItems && (
              <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      Transfer To Section
                    </label>
                    {loading ? (
                      <div className="flex items-center text-sm text-gray-500 h-10 bg-white px-3 rounded-lg border border-gray-200">
                        <Loader2 className="w-4 h-4 animate-spin mr-2 text-blue-500" />
                        Loading sections...
                      </div>
                    ) : availableSections.length === 0 ? (
                      <div className="flex items-center text-sm text-red-600 h-10 bg-red-50 px-3 rounded-lg border border-red-200">
                        <XCircle className="w-4 h-4 mr-2" />
                        No other sections available
                      </div>
                    ) : (
                      <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="block w-full rounded-lg border-gray-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2.5 px-3 bg-white transition-all hover:border-blue-300"
                        disabled={loading || confirming || validating}
                      >
                        <option value="">Select a section...</option>
                        {availableSections.map(s => (
                          <option key={s} value={s}>Section {s}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  
                  {selectedSection && (
                    <div className="sm:text-right pt-2 sm:pt-6">
                       <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Transferring</div>
                       <div className="text-2xl font-bold text-gray-900 leading-none">
                         {transferableItems.length}
                         <span className="text-sm font-medium text-gray-400 ml-1">/{validItems.length}</span>
                       </div>
                    </div>
                  )}
                </div>

                {/* Validation Feedback */}
                {validating && selectedSection && (
                  <div className="mt-3 flex items-center text-sm text-blue-600 animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Checking availability in Section {selectedSection}...
                  </div>
                )}

                {!validating && selectedSection && conflictingItems.length > 0 && (
                  <div className="mt-4 bg-red-50 border border-red-100 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                       <XCircle className="w-4 h-4 text-red-600 mt-0.5" />
                       <div className="text-xs text-red-800">
                          <p className="font-semibold">
                             {conflictingItems.length} duplicate {conflictingItems.length === 1 ? 'entry' : 'entries'} found in Section {selectedSection}
                          </p>
                          <p className="mt-1 opacity-80">
                             These will be skipped. Only unique entries will be transferred.
                          </p>
                       </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-center p-4 text-sm text-red-800 rounded-xl bg-red-50 border border-red-100">
                <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <button
          onClick={onClose}
          disabled={confirming}
          className="h-12 px-6 bg-gray-500 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-all"
        >
          CANCEL
        </button>
        
        {hasValidItems && availableSections.length > 0 && (
          <button
            onClick={handleTransfer}
            disabled={!selectedSection || confirming || validating || transferableItems.length === 0}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center space-x-2
              ${!selectedSection || confirming || validating || transferableItems.length === 0
                ? 'bg-blue-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
              }`}
          >
            {confirming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Transferring...</span>
              </>
            ) : validating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Validating...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>
                  TRANSFER
                  {transferableItems.length > 0 && transferableItems.length !== validItems.length && 
                    ` (${transferableItems.length})`
                  }
                </span>
              </>
            )}
          </button>
        )}
      </ModalFooter>
    </Modal>
  )
}
