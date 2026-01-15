'use client'

import { useState, useEffect } from 'react'

import { logger } from '@/lib/logger'
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter, Input, Button } from '@/components/ui'
import { ExamService, CreateExamData } from '@/lib/services/examService'

interface CreateExamModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  facultyId: string | null
}

const availableYears = [
  { id: '2', name: '2nd Year' },
  { id: '3', name: '3rd Year' },
  { id: '4', name: '4th Year' },
]

export default function CreateExamModal({ isOpen, onClose, onSuccess, facultyId }: CreateExamModalProps) {
  const [examName, setExamName] = useState('')
  const [selectedYears, setSelectedYears] = useState<string[]>([])
  const [maxMarks, setMaxMarks] = useState<string>('100')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) {
      resetForm()
    }
  }, [isOpen])

  const resetForm = () => {
    setExamName('')
    setSelectedYears([])
    setMaxMarks('100')
    setError('')
  }

  const handleYearToggle = (yearId: string) => {
    setSelectedYears(prev => {
      if (prev.includes(yearId)) {
        return prev.filter(id => id !== yearId)
      } else {
        return [...prev, yearId]
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!examName.trim()) {
      setError('Please enter an exam name')
      return
    }

    if (selectedYears.length === 0) {
      setError('Please select at least one year')
      return
    }

    const maxMarksNum = parseInt(maxMarks, 10)
    if (isNaN(maxMarksNum) || maxMarksNum <= 0) {
      setError('Please enter a valid maximum marks (greater than 0)')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const examData: CreateExamData = {
        name: examName.trim(),
        years: selectedYears,
        created_by: facultyId,
        max_marks: maxMarksNum,
      }

      const newExam = await ExamService.createExam(examData)
      
      if (newExam) {
        onSuccess()
        onClose()
        resetForm()
      } else {
        setError('Failed to create exam. Please try again.')
      }
    } catch (error) {
      logger.error('Error creating exam:', error)
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <ModalHeader onClose={handleClose}>
        <ModalTitle>Create Exam</ModalTitle>
      </ModalHeader>

      <ModalBody>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Exam Name"
            type="text"
            value={examName}
            onChange={(e) => {
              setExamName(e.target.value)
              setError('')
            }}
            placeholder="Enter exam name"
            required
          />

          <Input
            label="Maximum Marks"
            type="number"
            value={maxMarks}
            onChange={(e) => {
              setMaxMarks(e.target.value)
              setError('')
            }}
            placeholder="Enter maximum marks (e.g., 50, 100)"
            min="1"
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Years <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {availableYears.map((year) => (
                <label
                  key={year.id}
                  className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedYears.includes(year.id)}
                    onChange={() => handleYearToggle(year.id)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="ml-3 text-sm font-medium text-gray-700">{year.name}</span>
                </label>
              ))}
            </div>
            {selectedYears.length === 0 && error && error.includes('year') && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          {error && !error.includes('year') && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </form>
      </ModalBody>

      <ModalFooter>
        <Button type="button" variant="secondary" onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isLoading || !examName.trim() || selectedYears.length === 0}
          loading={isLoading}
          onClick={handleSubmit}
        >
          {isLoading ? 'Creating...' : 'Create Exam'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

