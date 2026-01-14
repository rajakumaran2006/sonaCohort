'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface DeleteConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  itemsToDelete: {
    name: string
    email?: string
    additionalInfo?: string
  }[]
  type?: string
  isLoading?: boolean
}

export default function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemsToDelete,
  type,
  isLoading = false
}: DeleteConfirmationModalProps) {
  const [generatedCode, setGeneratedCode] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [error, setError] = useState('')

  // Generate random 6-digit code when modal opens
  useEffect(() => {
    if (isOpen) {
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      setGeneratedCode(code)
      setInputCode('')
      setError('')
    }
  }, [isOpen])

  const handleConfirm = () => {
    if (inputCode === generatedCode) {
      onConfirm()
    } else {
      setError('Incorrect confirmation code')
    }
  }

  if (!isOpen) return null
  
  if (itemsToDelete.length === 0) {
    console.error('DeleteConfirmationModal: No items to delete')
    return null
  }

  const itemLabel = type === 'peer-tutors' ? 'peer tutor' : type === 'students' ? 'student' : 'item'
  const pluralLabel = itemsToDelete.length > 1 ? `${itemLabel}s` : itemLabel

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop - semi-transparent to show website behind */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900 uppercase tracking-wide">
              {title}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-sm text-gray-500 mb-4">
            Permanently delete {itemsToDelete.length} {pluralLabel}
          </p>

          {/* Items List */}
          <div className="bg-gray-50/80 rounded-xl border border-gray-100 overflow-hidden mb-5">
            {/* Header Row */}
            <div className="grid grid-cols-[1fr_1.5fr] gap-3 px-4 py-2.5 border-b border-gray-100">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Name</span>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Details</span>
            </div>
            
            {/* Scrollable Items */}
            <div className="max-h-48 overflow-y-auto">
              {itemsToDelete.map((item, index) => (
                <div 
                  key={index} 
                  className="grid grid-cols-[1fr_1.5fr] gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
                >
                  <span className="text-sm font-medium text-gray-900 truncate">{item.name}</span>
                  <div className="flex flex-col">
                    {item.email && (
                      <span className="text-sm text-gray-500 truncate">{item.email}</span>
                    )}
                    {item.additionalInfo && (
                      <span className="text-xs text-gray-400 truncate">{item.additionalInfo}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-3 p-3 bg-gray-900/5 rounded-lg border border-gray-200/50 mb-5">
            <span className="text-xs text-gray-600 leading-relaxed">
              <span className="font-semibold text-gray-900">Warning:</span> This cannot be undone. All associated data will be deleted.
            </span>
          </div>

          {/* Confirmation Code Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Confirmation Code</span>
              <span className="text-2xl font-bold text-gray-900 font-mono tracking-[0.3em]">{generatedCode}</span>
            </div>
            
            <div>
              <input
                type="text"
                value={inputCode}
                onChange={(e) => {
                  setInputCode(e.target.value)
                  setError('')
                }}
                className={`w-full px-4 py-3 text-center text-lg font-mono tracking-[0.2em] rounded-xl border-2 transition-all
                  ${error 
                    ? 'border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-100' 
                    : 'border-gray-200 bg-white focus:border-gray-400 focus:ring-gray-100'
                  } focus:outline-none focus:ring-4`}
                placeholder="Enter code"
                maxLength={6}
              />
              {error && (
                <p className="mt-2 text-xs text-red-500 text-center">{error}</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={inputCode.length !== 6 || isLoading}
            className={`px-6 py-2.5 text-sm font-semibold rounded-lg transition-all
              ${inputCode.length === 6 && !isLoading
                ? 'bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98]'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Deleting...
              </span>
            ) : (
              'DELETE'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
