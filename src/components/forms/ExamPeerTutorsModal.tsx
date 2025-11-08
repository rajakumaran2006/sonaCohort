'use client'

import { useState, useEffect, useMemo } from 'react'
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter, Button } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyTable } from '@/components/ui'
import { Exam } from '@/lib/services/examService'
import { PeerTutorService, PeerTutor } from '@/lib/services/peerTutorService'
import { useQuery } from '@tanstack/react-query'
import { Filter, Eye } from 'lucide-react'

interface ExamPeerTutorsModalProps {
  isOpen: boolean
  onClose: () => void
  exam: Exam | null
}

export default function ExamPeerTutorsModal({ isOpen, onClose, exam }: ExamPeerTutorsModalProps) {
  const [selectedYear, setSelectedYear] = useState<string>('all')
  const [selectedSection, setSelectedSection] = useState<string>('all')

  // Fetch peer tutors for the exam's years
  const { data: peerTutors, isLoading } = useQuery({
    queryKey: ['exam-peer-tutors', exam?.id, exam?.years],
    queryFn: async () => {
      if (!exam?.years || exam.years.length === 0) return []
      return await PeerTutorService.getPeerTutorsByYears(exam.years)
    },
    enabled: !!exam && !!exam.years && exam.years.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Get unique years and sections from peer tutors
  const uniqueYears = useMemo(() => {
    if (!peerTutors) return []
    return Array.from(new Set(peerTutors.map(pt => pt.year))).sort()
  }, [peerTutors])

  const uniqueSections = useMemo(() => {
    if (!peerTutors) return []
    let filtered = peerTutors
    if (selectedYear !== 'all') {
      filtered = filtered.filter(pt => pt.year === selectedYear)
    }
    return Array.from(new Set(filtered.map(pt => pt.section))).sort()
  }, [peerTutors, selectedYear])

  // Filter peer tutors based on selected filters
  const filteredPeerTutors = useMemo(() => {
    if (!peerTutors) return []
    
    let filtered = [...peerTutors]
    
    if (selectedYear !== 'all') {
      filtered = filtered.filter(pt => pt.year === selectedYear)
    }
    
    if (selectedSection !== 'all') {
      filtered = filtered.filter(pt => pt.section === selectedSection)
    }
    
    return filtered.sort((a, b) => {
      // Sort by year, then section, then name
      if (a.year !== b.year) return a.year.localeCompare(b.year)
      if (a.section !== b.section) return a.section.localeCompare(b.section)
      return a.name.localeCompare(b.name)
    })
  }, [peerTutors, selectedYear, selectedSection])

  // Reset section filter when year changes
  useEffect(() => {
    if (selectedYear === 'all') {
      setSelectedSection('all')
    } else {
      // If current section is not available in filtered sections, reset it
      const availableSections = Array.from(new Set(
        peerTutors?.filter(pt => pt.year === selectedYear).map(pt => pt.section) || []
      )).sort()
      if (!availableSections.includes(selectedSection)) {
        setSelectedSection('all')
      }
    }
  }, [selectedYear, peerTutors, selectedSection])

  const formatYear = (year: string): string => {
    const yearMap: { [key: string]: string } = {
      '2': '2nd Year',
      '3': '3rd Year',
      '4': '4th Year',
    }
    return yearMap[year] || year
  }

  const handleView = (peerTutor: PeerTutor) => {
    // TODO: Implement view functionality in the future
    console.log('View peer tutor:', peerTutor)
  }

  const hasActiveFilters = selectedYear !== 'all' || selectedSection !== 'all'

  const clearFilters = () => {
    setSelectedYear('all')
    setSelectedSection('all')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader onClose={onClose}>
        <ModalTitle>Peer Tutors - {exam?.name}</ModalTitle>
      </ModalHeader>

      <ModalBody>
        {/* Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filters:</span>
            </div>
            
            <div className="flex-1 flex items-center space-x-4">
              {/* Year Filter */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Years</option>
                  {uniqueYears.map(year => (
                    <option key={year} value={year}>
                      {formatYear(year)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Section Filter */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Section
                </label>
                <select
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={selectedYear === 'all'}
                >
                  <option value="all">All Sections</option>
                  {uniqueSections.map(section => (
                    <option key={section} value={section}>
                      {section}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <Button
                variant="secondary"
                size="sm"
                onClick={clearFilters}
                className="mt-6"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Section</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <span className="ml-2 text-gray-600">Loading peer tutors...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredPeerTutors.length === 0 ? (
                <EmptyTable
                  title="No peer tutors found"
                  description={
                    hasActiveFilters
                      ? "Try adjusting your filters to see more results"
                      : "No peer tutors are assigned to the selected years for this exam"
                  }
                />
              ) : (
                filteredPeerTutors.map((peerTutor) => (
                  <TableRow key={peerTutor.id}>
                    <TableCell className="font-medium text-gray-900">
                      {peerTutor.name}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {formatYear(peerTutor.year)}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {peerTutor.section}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleView(peerTutor)}
                        className="inline-flex items-center"
                      >
                        <Eye className="h-4 w-4 mr-1.5" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary */}
        {!isLoading && filteredPeerTutors.length > 0 && (
          <div className="mt-4 text-sm text-gray-500">
            Showing {filteredPeerTutors.length} of {peerTutors?.length || 0} peer tutor{peerTutors?.length !== 1 ? 's' : ''}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  )
}

