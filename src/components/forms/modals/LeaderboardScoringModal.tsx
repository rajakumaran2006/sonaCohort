'use client'

import React, { useState, useEffect } from 'react'
import Modal, { ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { Settings, RotateCcw, Save } from 'lucide-react'
import { LeaderboardScoringConfig, LeaderboardConfigService, ExamConfigItem } from '@/lib/services/leaderboardConfigService'
import { ExamService, Exam } from '@/lib/services/examService'

interface LeaderboardScoringModalProps {
  isOpen: boolean
  onClose: () => void
  department: string
  departmentId: string
  currentConfig: LeaderboardScoringConfig
  onSave: (config: LeaderboardScoringConfig) => void
}

interface MainCriteria {
  key: 'scheduled_classes_weight' | 'additional_classes_weight' | 'exam_weight'
  label: string
  description: string
}

const MAIN_CRITERIA: MainCriteria[] = [
  {
    key: 'scheduled_classes_weight',
    label: 'Scheduled Classes',
    description: 'Completion % of allocated scheduled classes',
  },
  {
    key: 'additional_classes_weight',
    label: 'Additional Classes',
    description: 'Extra voluntary classes (capped at 10 = full marks)',
  },
  {
    key: 'exam_weight',
    label: 'Exam Performance',
    description: 'Weighted average of selected exam Ascend Scores',
  },
]

export default function LeaderboardScoringModal({
  isOpen,
  onClose,
  department,
  departmentId,
  currentConfig,
  onSave,
}: LeaderboardScoringModalProps) {
  const [weights, setWeights] = useState({
    scheduled_classes_weight: currentConfig.scheduled_classes_weight,
    additional_classes_weight: currentConfig.additional_classes_weight,
    exam_weight: currentConfig.exam_weight,
  })
  const [examConfig, setExamConfig] = useState<ExamConfigItem[]>(currentConfig.exam_config || [])
  const [allExams, setAllExams] = useState<Exam[]>([])
  const [examsLoading, setExamsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync with currentConfig when modal opens
  useEffect(() => {
    if (isOpen) {
      setWeights({
        scheduled_classes_weight: currentConfig.scheduled_classes_weight,
        additional_classes_weight: currentConfig.additional_classes_weight,
        exam_weight: currentConfig.exam_weight,
      })
      setExamConfig(currentConfig.exam_config || [])
      setError(null)
    }
  }, [isOpen, currentConfig])

  // Fetch exams for the department when modal opens
  useEffect(() => {
    if (isOpen && departmentId) {
      setExamsLoading(true)
      ExamService.getAllExams(departmentId).then((exams) => {
        setAllExams(exams)
        // Merge with existing exam config - keep saved weights for existing exams
        setExamConfig(prev => {
          const merged = exams.map(exam => {
            const existing = prev.find(e => e.exam_id === exam.id)
            return existing || {
              exam_id: exam.id,
              exam_name: exam.name,
              included: false,
              weight: 0,
            }
          })
          return merged
        })
        setExamsLoading(false)
      })
    }
  }, [isOpen, departmentId])

  const mainTotal = weights.scheduled_classes_weight + weights.additional_classes_weight + weights.exam_weight
  const isMainValid = mainTotal === 100

  const includedExams = examConfig.filter(e => e.included)
  const examWeightTotal = includedExams.reduce((sum, e) => sum + e.weight, 0)
  const isExamValid = weights.exam_weight === 0 || (includedExams.length > 0 && examWeightTotal === 100)

  const isValid = isMainValid && isExamValid

  const handleMainSliderChange = (key: MainCriteria['key'], value: number) => {
    setWeights(prev => ({ ...prev, [key]: value }))
    setError(null)
  }

  const handleExamToggle = (examId: string) => {
    setExamConfig(prev =>
      prev.map(e =>
        e.exam_id === examId
          ? { ...e, included: !e.included, weight: !e.included ? 0 : e.weight }
          : e
      )
    )
    setError(null)
  }

  const handleExamWeightChange = (examId: string, value: number) => {
    setExamConfig(prev =>
      prev.map(e =>
        e.exam_id === examId ? { ...e, weight: Math.max(0, Math.min(100, value)) } : e
      )
    )
    setError(null)
  }

  const handleDistributeEvenly = () => {
    const included = examConfig.filter(e => e.included)
    if (included.length === 0) return
    const perExam = Math.floor(100 / included.length)
    const remainder = 100 - perExam * included.length

    setExamConfig(prev => {
      let idx = 0
      return prev.map(e => {
        if (!e.included) return e
        const w = perExam + (idx < remainder ? 1 : 0)
        idx++
        return { ...e, weight: w }
      })
    })
  }

  const handleReset = () => {
    const defaults = LeaderboardConfigService.getDefaultConfig()
    setWeights({
      scheduled_classes_weight: defaults.scheduled_classes_weight,
      additional_classes_weight: defaults.additional_classes_weight,
      exam_weight: defaults.exam_weight,
    })
    setExamConfig(prev => prev.map(e => ({ ...e, included: false, weight: 0 })))
    setError(null)
  }

  const handleSave = async () => {
    if (!isValid) {
      setError('Please fix validation errors before saving')
      return
    }

    setSaving(true)
    setError(null)

    const result = await LeaderboardConfigService.upsertConfig(department, {
      ...weights,
      exam_config: examConfig,
    })

    if (result.success) {
      onSave({
        ...currentConfig,
        ...weights,
        exam_config: examConfig,
      })
      onClose()
    } else {
      setError(result.error || 'Failed to save configuration')
    }

    setSaving(false)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-3">
          <div>
            <ModalTitle className='uppercase'>Scoring Rules</ModalTitle>
            <ModalDescription>Configure leaderboard scoring out of 100 marks</ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-6 max-h-[65vh] overflow-y-auto">
        {/* === SECTION 1: Main Weight Distribution === */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Main Weight Distribution</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              isMainValid ? 'bg-gray-100 text-gray-700' : 'bg-red-50 text-red-700'
            }`}>
              {mainTotal}%{isMainValid ? ' ✓' : ' / 100%'}
            </span>
          </div>

          {/* Distribution Bar */}
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex mb-4">
            {MAIN_CRITERIA.map((c, i) => {
              const w = weights[c.key]
              if (w === 0) return null
              const shades = ['#374151', '#6b7280', '#9ca3af']
              return (
                <div
                  key={c.key}
                  className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${w}%`, backgroundColor: shades[i] }}
                />
              )
            })}
          </div>

          {/* Main Criteria Sliders */}
          <div className="space-y-3">
            {MAIN_CRITERIA.map((criteria) => (
              <div key={criteria.key} className="p-3 rounded-xl border border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="text-sm font-bold text-gray-800 uppercase">{criteria.label}</span>
                    <p className="text-[11px] text-gray-500 mt-0.5">{criteria.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={weights[criteria.key]}
                      onChange={(e) => handleMainSliderChange(criteria.key, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                      className="w-14 h-7 text-center text-sm font-bold border border-gray-300 rounded-lg focus:outline-none bg-white text-gray-800"
                    />
                    <span className="text-xs font-bold text-gray-400">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={weights[criteria.key]}
                  onChange={(e) => handleMainSliderChange(criteria.key, parseInt(e.target.value))}
                  className="w-full h-1.5 bg-white rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: '#374151' }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Validation for main weights */}
        {!isMainValid && (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700 font-medium flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Main weights must total 100%. Currently at {mainTotal}%.
          </div>
        )}

        {/* === SECTION 2: Exam Configuration === */}
        {weights.exam_weight > 0 && (
          <div className="border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Exam Configuration</span>
              </div>
              <div className="flex items-center gap-2">
                {includedExams.length > 0 && (
                  <button
                    onClick={handleDistributeEvenly}
                    className="text-[10px] font-bold text-gray-600 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors uppercase tracking-wider"
                  >
                    Distribute Evenly
                  </button>
                )}
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  isExamValid ? 'bg-gray-100 text-gray-700' : 'bg-red-500 text-white'
                }`}>
                  {includedExams.length > 0 ? `${examWeightTotal}%` : 'NONE'}
                  {isExamValid && includedExams.length > 0 ? ' ✓' : ''}
                </span>
              </div>
            </div>

            {examsLoading ? (
              <div className="py-8 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600 mx-auto mb-2"></div>
                <span className="text-xs text-gray-400 font-medium">Loading exams...</span>
              </div>
            ) : allExams.length === 0 ? (
              <div className="py-8 text-center bg-gray-50 rounded-xl border border-gray-100">
                <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
                <p className="text-sm font-medium text-gray-500">No exams found</p>
                <p className="text-xs text-gray-400 mt-1">Create exams first to use exam-based scoring</p>
              </div>
            ) : (
              <div className="space-y-2">
                {examConfig.map((exam) => (
                  <div
                    key={exam.exam_id}
                    className={`p-3 rounded-xl border transition-all ${
                      exam.included
                        ? 'border-gray-300 bg-gray-100'
                        : 'border-gray-100 bg-gray-50/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Toggle */}
                        <button
                          onClick={() => handleExamToggle(exam.exam_id)}
                          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                            exam.included ? 'bg-gray-700' : 'bg-gray-300'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                              exam.included ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <span className={`text-sm font-semibold truncate ${
                          exam.included ? 'text-gray-900' : 'text-gray-500'
                        }`}>
                          {exam.exam_name}
                        </span>
                      </div>

                      {exam.included && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={exam.weight}
                            onChange={(e) => handleExamWeightChange(exam.exam_id, parseInt(e.target.value) || 0)}
                            className="w-14 h-7 text-center text-sm font-bold border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-400"
                          />
                          <span className="text-xs font-bold text-gray-400">%</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Exam validation warning */}
            {weights.exam_weight > 0 && !isExamValid && includedExams.length > 0 && (
              <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700 font-medium">
                Included exam weights must total 100%. Currently at {examWeightTotal}%.
              </div>
            )}
            {weights.exam_weight > 0 && includedExams.length === 0 && (
              <div className="mt-3 p-2.5 rounded-xl bg-amber-500 border border-amber-200 text-sm text-black font-medium">
                Toggle on at least one exam to use exam-based scoring.
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
            {error}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors mr-auto"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <button
          onClick={onClose}
          className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || saving}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all shadow-sm ${
            isValid && !saving
              ? 'bg-gray-800 hover:bg-gray-900 text-white shadow-gray-300'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Rules'}
        </button>
      </ModalFooter>
    </Modal>
  )
}
