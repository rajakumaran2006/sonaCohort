'use client'

import { useState, useEffect } from 'react'
import { FeedbackService, FeedbackForm } from '@/lib/services/feedbackService'
import { FormEditStrategy } from '@/lib/services/feedbackVersioningService'
import StarRating from '@/components/ui/StarRating'
import { 
  X, 
  Plus, 
  Trash2, 
  AlertCircle, 
  Check, 
  Loader2, 
  MessageSquare, 
  Settings,
  AlertTriangle
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FeedbackFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  facultyId: string
  editingForm?: FeedbackForm | null
}

interface QuestionForm {
  question_text: string
  question_type: 'multiple_choice' | 'text' | 'star_rating'
  is_required: boolean
  options: string[]
}

export default function FeedbackFormModal({
  isOpen,
  onClose,
  onSuccess,
  facultyId,
  editingForm
}: FeedbackFormModalProps) {
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [questions, setQuestions] = useState<QuestionForm[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [editStrategy, setEditStrategy] = useState<FormEditStrategy | null>(null)
  const [showStrategyModal, setShowStrategyModal] = useState(false)
  const [strategyConfirmed, setStrategyConfirmed] = useState(false)
  
  // Quick Add State
  const [quickAddText, setQuickAddText] = useState('')

  // Initialize form data when editing
  useEffect(() => {
    if (editingForm) {
      setFormName(editingForm.name)
      setFormDescription(editingForm.description || '')
      const mappedQuestions = editingForm.questions.map(q => ({
        question_text: q.question_text,
        question_type: 'star_rating' as const, // Force star rating on edit too
        is_required: true, // Force required on edit too
        options: []
      }))
      setQuestions(mappedQuestions)
    } else {
      setFormName('')
      setFormDescription('')
      setQuestions([])
    }
    setErrors({})
    setEditStrategy(null)
    setShowStrategyModal(false)
    setStrategyConfirmed(false)
    setQuickAddText('')
  }, [editingForm, isOpen])

  const addQuestion = () => {
    setQuestions([...questions, {
      question_text: '',
      question_type: 'star_rating',
      is_required: true,
      options: []
    }])
  }

  const handleQuickAdd = () => {
    if (!quickAddText.trim()) return

    const lines = quickAddText.split('\n').filter(line => line.trim())
    const newQuestions: QuestionForm[] = lines.map(line => {
      // Clean up the line (remove numbering like "1)", "1.", "- ")
      const cleanText = line.trim().replace(/^(\d+[\.\)]|\-)\s*/, '')
      return {
        question_text: cleanText,
        question_type: 'star_rating',
        is_required: true,
        options: []
      }
    })

    setQuestions([...questions, ...newQuestions])
    setQuickAddText('')
  }

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const updateQuestion = (index: number, field: keyof QuestionForm, value: string | boolean) => {
    const updatedQuestions = [...questions]
    // We only really update 'question_text' now, but keep generic for safety
    if (field === 'question_text') {
        updatedQuestions[index] = { ...updatedQuestions[index], question_text: value as string }
        setQuestions(updatedQuestions)
    }
  }

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}
    if (!formName.trim()) newErrors.formName = 'Form name is required'
    if (questions.length === 0) newErrors.questions = 'At least one question is required'

    questions.forEach((question, index) => {
      if (!question.question_text.trim()) {
        newErrors[`question_${index}`] = 'Question text is required'
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    
    if (!validateForm()) return

    if (editingForm && !strategyConfirmed) {
      await checkEditStrategy()
      return
    }

    setLoading(true)
    try {
      const questionsToSubmit = questions.map((q, index) => ({
        question_text: q.question_text,
        question_type: 'star_rating' as const,
        is_required: true,
        order_index: index + 1,
        options: undefined
      }))

      if (editingForm) {
        const result = await FeedbackService.updateFeedbackForm(
          editingForm.id,
          { name: formName, description: formDescription, is_active: editingForm.is_active },
          questionsToSubmit
        )
        
        if (result.success) {
          onSuccess()
        } else if (result.strategy.type === 'require_confirmation') {
          setEditStrategy(result.strategy)
          setShowStrategyModal(true)
        }
      } else {
        const result = await FeedbackService.createFeedbackForm(
          formName, formDescription, facultyId, questionsToSubmit
        )
        if (result) onSuccess()
      }
    } catch (error) {
      console.error('Error saving feedback form:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkEditStrategy = async () => {
    if (!editingForm) return
    const questionsToSubmit = questions.map((q, index) => ({
      question_text: q.question_text,
      question_type: 'star_rating' as const,
      is_required: true,
      order_index: index + 1,
      options: undefined
    }))

    const strategy = await FeedbackService.getFormEditStrategy(editingForm.id, {
      name: formName,
      description: formDescription,
      questions: questionsToSubmit
    })

    setEditStrategy(strategy)
    if (strategy.type === 'require_confirmation' || strategy.warnings.length > 0) {
      setShowStrategyModal(true)
    } else {
      setStrategyConfirmed(true)
      setTimeout(() => handleSubmit(), 100)
    }
  }

  const handleStrategyConfirm = () => {
    setStrategyConfirmed(true)
    setShowStrategyModal(false)
    setTimeout(() => handleSubmit(), 100)
  }

  const handleStrategyCancel = () => {
    setShowStrategyModal(false)
    setStrategyConfirmed(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-gray-100">
        
        {/* Header */}
        <div className="flex justify-between items-start px-8 py-6 border-b border-gray-100 bg-white shrink-0">
          <div>
            <h3 className="text-xl font-bold uppercase text-gray-900 tracking-tight">
              {editingForm ? 'Edit Feedback Form' : 'Create New Feedback Form'}
            </h3>
            <p className="text-sm text-gray-500 mt-1 font-medium">
              Design your student feedback questionnaire
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50 space-y-8 custom-scrollbar">
          
          {/* Basic Information */}
          <div className="space-y-6">
             <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-2">
                   <Settings className="w-4 h-4 text-gray-400" />
                   <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Base Information</h4>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">
                      Form Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className={cn(
                        "w-full px-4 py-3 bg-white border rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm",
                        errors.formName ? 'border-red-300' : 'border-gray-200'
                      )}
                      placeholder="e.g., Peer Tutor Review"
                    />
                    {errors.formName && (
                      <p className="mt-1.5 text-xs font-medium text-red-500 ml-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {errors.formName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">
                      Description <span className="text-gray-400">(Optional)</span>
                    </label>
                    <textarea
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                      placeholder="Describe the purpose of this feedback form..."
                    />
                  </div>
                </div>
             </div>
          </div>

          {/* Quick Add Section */}
          <div className="bg-blue-50/50 border border-blue-100 p-6 rounded-2xl shadow-sm">
             <div className="flex items-center gap-2 mb-3">
                <h4 className="text-xs font-bold text-blue-600 uppercase tracking-widest">Quick Add Questions</h4>
             </div>
             <div className="relative">
                <textarea
                  value={quickAddText}
                  onChange={(e) => setQuickAddText(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm min-h-[100px]"
                  placeholder={`1) How was the tutor's knowledge?\n2) Was the session helpful?`}
                />
                <div className="absolute bottom-3 right-3">
                  <button
                    type="button"
                    onClick={handleQuickAdd}
                    disabled={!quickAddText.trim()}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-xs font-bold uppercase rounded-lg shadow-sm transition-all"
                  >
                    Generate
                  </button>
                </div>
             </div>
          </div>


          {/* Questions Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
               <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-gray-400" />
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Questions ({questions.length})</h4>
               </div>
               <button
                  type="button"
                  onClick={addQuestion}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-gray-200"
               >
                  <Plus className="w-3.5 h-3.5" /> ADD QUESTION
               </button>
            </div>

            {errors.questions && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {errors.questions}
              </div>
            )}

            <div className="space-y-6">
              {questions.map((question, questionIndex) => (
                <div 
                  key={questionIndex} 
                  className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all duration-300 p-6 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-6 shrink-0">
                    <div className="flex items-center gap-2">
                       <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-tighter">
                          Q{questionIndex + 1}
                       </span>
                       <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">QUESTION DETAILS</span>
                       <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-bold uppercase rounded-md border border-blue-100">
                          5-Star Rating
                       </span>
                       <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[9px] font-bold uppercase rounded-md border border-gray-200">
                          Mandatory
                       </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeQuestion(questionIndex)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Remove Question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    {/* Question Text */}
                    <div>
                       <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                          The Question <span className="text-red-500">*</span>
                       </label>
                       <input
                         type="text"
                         value={question.question_text}
                         onChange={(e) => updateQuestion(questionIndex, 'question_text', e.target.value)}
                         className={cn(
                           "w-full px-4 py-2.5 bg-gray-50/50 border rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all",
                           errors[`question_${questionIndex}`] ? 'border-red-300' : 'border-gray-100'
                         )}
                         placeholder="e.g., How would you rate the tutor's explanation of complex topics?"
                       />
                       {errors[`question_${questionIndex}`] && (
                         <p className="mt-1 text-[10px] font-medium text-red-500 flex items-center gap-1 ml-1">
                           <AlertCircle className="w-2.5 h-2.5" /> {errors[`question_${questionIndex}`]}
                         </p>
                       )}
                    </div>
                  </div>

                  {/* Preview of Rating */}
                  <div className="mt-6">
                    <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 flex flex-col items-center justify-center animate-in zoom-in-95 duration-200">
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Rating Scale Preview</p>
                        <StarRating
                            value={0}
                            onChange={() => {}}
                            disabled={false} 
                            readonly={true} 
                        />
                    </div>
                  </div>
                </div>
              ))}

              {questions.length === 0 && (
                <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
                   <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-8 h-8 text-gray-300" />
                   </div>
                   <p className="text-gray-900 font-bold uppercase tracking-tight">No Questions Added</p>
                   <p className="text-xs text-gray-400 mt-1">
                     Use Quick Add above or click below to start
                   </p>
                   <button
                      type="button"
                      onClick={addQuestion}
                      className="mt-4 px-6 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all shadow-lg shadow-gray-200"
                   >
                      ADD QUESTION
                   </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-8 py-5 border-t border-gray-100 bg-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="flex flex-col">
                   <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">Questions</span>
                   <span className="text-lg font-black text-gray-900">{questions.length}</span>
                </div>
                <div className="w-[1px] h-8 bg-gray-100 mx-2"></div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-100 uppercase"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={loading}
                className="px-8 py-2.5 text-sm font-bold text-white bg-gray-900 hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-gray-200 transition-all duration-200 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 uppercase"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : editingForm ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {loading ? 'SAVING...' : editingForm ? 'UPDATE VERSION' : 'CREATE FORM'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Versioning / Strategy Modal (Redesigned) */}
      {showStrategyModal && editStrategy && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 p-8 text-center animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-amber-500" />
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 uppercase tracking-tight mb-2">
              {editStrategy.type === 'create_new_version' ? 'Create New Version' : 
               editStrategy.type === 'update_current' ? 'Update Form' : 
               'Confirm Logic'}
            </h3>
            
            <p className="text-sm text-gray-500 font-medium leading-relaxed mb-6">
              {editStrategy.reason}
            </p>
            
            {editStrategy.warnings.length > 0 && (
              <div className="mb-8 text-left bg-red-50/50 p-4 rounded-2xl border border-red-100 font-medium">
                <h4 className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                   <AlertCircle className="w-3.5 h-3.5" /> Potential Issues
                </h4>
                <ul className="space-y-2">
                  {editStrategy.warnings.map((warning, index) => (
                    <li key={index} className="text-xs text-red-800 flex items-start gap-2">
                      <span className="mt-1 w-1 h-1 rounded-full bg-red-400 shrink-0"></span>
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleStrategyConfirm}
                disabled={!editStrategy.canProceed}
                className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold uppercase tracking-widest text-sm transition-all shadow-xl shadow-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editStrategy.type === 'create_new_version' ? 'DEPLOY NEW VERSION' : 'CONFIRM UPDATE'}
              </button>
              <button
                onClick={handleStrategyCancel}
                className="w-full py-3 bg-white hover:bg-gray-50 text-gray-500 font-bold uppercase tracking-widest text-xs transition-colors"
              >
                STAY ON DRAFT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
