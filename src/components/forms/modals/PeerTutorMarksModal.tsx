'use client'

import { useState, useEffect, useCallback } from 'react'
import { ExamService, ExamAssignment, ExamMark } from '@/lib/services/examService'
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter, Button } from '@/components/ui'

interface peertutorsMarksModalProps {
  isOpen: boolean
  onClose: () => void
  examAssignment: ExamAssignment
}

export default function PeerTutorMarksModal({
  isOpen,
  onClose,
  examAssignment
}: peertutorsMarksModalProps) {
  const [marks, setMarks] = useState<ExamMark[]>([])
  const [loading, setLoading] = useState(true)

  const loadMarks = useCallback(async () => {
    setLoading(true)
    try {
      const marksData = await ExamService.getExamMarks(examAssignment.id)
      setMarks(marksData)
    } catch (error) {
      console.error('Error loading marks:', error)
    } finally {
      setLoading(false)
    }
  }, [examAssignment])

  useEffect(() => {
    if (isOpen && examAssignment) {
      loadMarks()
    }
  }, [isOpen, examAssignment, loadMarks])

  // Group marks by subject
  const marksBySubject = marks.reduce((acc, mark) => {
    const subjectName = mark.class?.subject_name || 'Unknown Subject'
    if (!acc[subjectName]) {
      acc[subjectName] = []
    }
    acc[subjectName].push(mark)
    return acc
  }, {} as Record<string, ExamMark[]>)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader onClose={onClose}>
        <ModalTitle>
          Marks Details - {examAssignment.peer_tutor?.name || 'Peer Tutor'}
        </ModalTitle>
      </ModalHeader>

      <ModalBody>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : Object.keys(marksBySubject).length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No marks entered yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(marksBySubject).map(([subjectName, subjectMarks]) => (
              <div key={subjectName} className="border border-gray-200 rounded-lg">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900">{subjectName}</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Student Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Marks
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {subjectMarks.map((mark) => (
                        <tr key={mark.id}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {mark.student?.name || 'Unknown Student'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {mark.marks ? Object.values(mark.marks).join(', ') : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

