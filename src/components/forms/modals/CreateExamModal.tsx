'use client'

import { useState, useEffect } from 'react'

import { logger } from '@/lib/logger'
import { Modal } from '@/components/ui'
import { X, Check } from 'lucide-react'
import { ExamService, CreateExamData } from '@/lib/services/examService'

interface CreateExamModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  facultyId: string | null
  departmentId: string | null
}

const availableYears = [
  { id: '1', name: '1st Year' },
  { id: '2', name: '2nd Year' },
  { id: '3', name: '3rd Year' },
  { id: '4', name: '4th Year' },
]

export default function CreateExamModal({ isOpen, onClose, onSuccess, facultyId, departmentId }: CreateExamModalProps) {
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
        department_id: departmentId!,
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
    <Modal isOpen={isOpen} onClose={handleClose} size="md" className="rounded-2xl overflow-hidden bg-white shadow-xl">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Create Exam</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Exam Name */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              Exam Name
            </label>
            <input
              type="text"
              value={examName}
              onChange={(e) => {
                setExamName(e.target.value)
                setError('')
              }}
              placeholder="Enter exam name"
              className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl text-sm font-medium transition-all outline-none placeholder:text-gray-400"
              required
            />
          </div>

          {/* Maximum Marks */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              Maximum Marks
            </label>
            <input
              type="number"
              value={maxMarks}
              onChange={(e) => {
                setMaxMarks(e.target.value)
                setError('')
              }}
              placeholder="100"
              min="1"
              className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl text-sm font-medium transition-all outline-none placeholder:text-gray-400"
              required
            />
          </div>

          {/* Select Years */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
              Select Years <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 gap-2">
              {availableYears.map((year) => {
                const isSelected = selectedYears.includes(year.id)
                return (
                  <label
                    key={year.id}
                    className={`flex items-center p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? 'bg-blue-50 border-blue-200 shadow-sm'
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                    }`}>
                      {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleYearToggle(year.id)}
                      className="hidden"
                    />
                    <span className={`ml-3 text-sm font-medium ${isSelected ? 'text-blue-900' : 'text-gray-700'}`}>
                      {year.name}
                    </span>
                  </label>
                )
              })}
            </div>
            {selectedYears.length === 0 && error && error.includes('year') && (
              <p className="text-xs font-medium text-red-500 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-red-500"></span>
                {error}
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && !error.includes('year') && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-red-500 mt-2 flex-shrink-0"></div>
              <p className="text-xs text-red-600 font-medium">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !examName.trim() || selectedYears.length === 0}
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-blue-100 transition-all disabled:opacity-50 disabled:shadow-none hover:shadow-xl active:translate-y-0.5"
            >
              {isLoading ? 'Creating...' : 'Create Exam'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

