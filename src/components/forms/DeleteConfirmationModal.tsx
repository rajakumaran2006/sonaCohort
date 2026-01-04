'use client'

import { useState, useEffect } from 'react'

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
      // Do not close immediately, let the parent handle it
    } else {
      setError('Incorrect confirmation code. Please try again.')
    }
  }

  if (!isOpen) return null
  
  // Don't show modal if there are no items to delete
  if (itemsToDelete.length === 0) {
    console.error('DeleteConfirmationModal: No items to delete')
    return null
  }

  console.log('DeleteConfirmationModal: Rendering with items:', itemsToDelete)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-900 bg-opacity-50 backdrop-blur-sm"
          onClick={onClose}
        ></div>

        {/* Modal Content */}
        <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col relative z-10">
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {title}
              </h3>
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-4">
                  You are about to permanently delete the following {itemsToDelete.length} {type === 'peer-tutors' ? 'peer tutor(s)' : type === 'students' ? 'student(s)' : 'item(s)'}:
                </p>
                
                {/* List of items to delete */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6 shadow-sm">
                  {/* Table Header */}
                  <div className="grid grid-cols-[1.5fr_2fr] gap-4 bg-gray-50/80 border-b border-gray-200 px-4 py-2">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Name</div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Details</div>
                  </div>
                  
                  {/* Scrollable List */}
                  <div className="max-h-60 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {itemsToDelete.length > 0 ? (
                      itemsToDelete.map((item, index) => (
                        <div key={index} className="grid grid-cols-[1.5fr_2fr] gap-4 px-4 py-3 border-b border-gray-100 last:border-0 items-center hover:bg-gray-50 transition-colors">
                          <div className="font-medium text-gray-900 text-sm truncate" title={item.name}>{item.name}</div>
                          <div className="flex flex-col min-w-0">
                            {item.email && (
                              <div className="text-gray-500 text-sm truncate" title={item.email}>{item.email}</div>
                            )}
                            {item.additionalInfo && (
                              <div className="text-gray-400 text-xs mt-0.5 truncate" title={item.additionalInfo}>{item.additionalInfo}</div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-sm text-gray-500">No items available</div>
                    )}
                  </div>
                </div>

                {/* Warning message */}
                <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                  <p className="text-sm text-red-800">
                    <strong>WARNING:</strong> This action cannot be undone. All associated data  will also be deleted.
                  </p>
                </div>

                {/* Confirmation code */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
                  <p className="text-sm text-gray-700 mb-2">
                    CONFIRMATION CODE
                  </p>
                  <div className="bg-white border-2 border-yellow-400 rounded-md p-3 text-center">
                    <span className="text-2xl font-bold text-gray-900 tracking-wider font-mono">
                      {generatedCode}
                    </span>
                  </div>
                </div>

                {/* Input field */}
                <div>
                  <label htmlFor="confirmation-code" className="block text-sm font-medium text-gray-700 mb-2">
                    Enter confirmation code:
                  </label>
                  <input
                    type="text"
                    id="confirmation-code"
                    value={inputCode}
                    onChange={(e) => {
                      setInputCode(e.target.value)
                      setError('')
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-center text-lg font-mono tracking-wider"
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                  />
                  {error && (
                    <p className="mt-2 text-sm text-red-600">{error}</p>
                  )}
                </div>
              </div>
            </div>
            </div>
          </div>
          
          {/* Action buttons at bottom */}
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={inputCode.length !== 6 || isLoading}
              className={`inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-sm font-medium text-white transition-colors ${
                inputCode.length === 6 && !isLoading
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-offset-2 focus:ring-red-500'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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

