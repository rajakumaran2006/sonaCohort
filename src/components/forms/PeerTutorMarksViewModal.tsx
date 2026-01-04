'use client'

import { useEffect, useState, useCallback } from 'react'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui'
import { Button } from '@/components/ui'
import { ExamService, ExamMarkWithDetails } from '@/lib/services/examService'
import { LoadingOverlay, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui'

interface PeerTutorMarksViewModalProps {
  isOpen: boolean
  onClose: () => void
  examAssignmentId: string
}

export default function PeerTutorMarksViewModal({
  isOpen,
  onClose,
  examAssignmentId
}: PeerTutorMarksViewModalProps) {
  const [marks, setMarks] = useState<ExamMarkWithDetails[]>([])
  const [loading, setLoading] = useState(false)

  const loadMarks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await ExamService.getPeerTutorMarks(examAssignmentId)
      setMarks(data)
    } catch (error) {
      console.error('Error loading marks:', error)
    } finally {
      setLoading(false)
    }
  }, [examAssignmentId])

  useEffect(() => {
    if (isOpen && examAssignmentId) {
      loadMarks()
    }
  }, [isOpen, examAssignmentId, loadMarks])

  // Group marks by subject
  const marksBySubject = marks.reduce((acc, mark) => {
    const subject = mark.subject_name || 'Unknown'
    if (!acc[subject]) {
      acc[subject] = []
    }
    acc[subject].push(mark)
    return acc
  }, {} as Record<string, ExamMarkWithDetails[]>)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader>
        <h2 className="text-xl font-semibold text-gray-900">Peer Tutor Marks</h2>
      </ModalHeader>

      <ModalBody>
        {loading ? (
          <LoadingOverlay className="h-64" size="md">
            Loading marks...
          </LoadingOverlay>
        ) : marks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No marks entered yet
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(marksBySubject).map(([subject, subjectMarks]) => (
              <div key={subject}>
                <h3 className="text-lg font-medium text-gray-900 mb-3">{subject}</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Marks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subjectMarks.map((mark) => (
                        <TableRow key={mark.id}>
                          <TableCell className="font-medium text-gray-900">
                            {mark.student_name || 'Unknown'}
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {mark.subject_name || 'Unknown'}
                          </TableCell>
                          <TableCell className="font-semibold text-gray-900">
                            {mark.marks ? Object.values(mark.marks).join(', ') : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
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

