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
  type: 'peer-tutors' | 'students' | 'all'
}

export default function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemsToDelete,
  type
}: DeleteConfirmationModalProps) {
  const [confirmationCode, setConfirmationCode] = useState('')
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
      onClose()
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
        <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative z-10 p-6">
          <div className="sm:flex sm:items-start">
            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {title}
              </h3>
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-4">
                  You are about to permanently delete the following {itemsToDelete.length} {type === 'peer-tutors' ? 'peer tutor(s)' : type === 'students' ? 'student(s)' : 'item(s)'}:
                </p>
                
                {/* List of items to delete */}
                <div className="max-h-60 overflow-y-auto bg-gray-50 rounded-md p-4 mb-4 border border-gray-200">
                  <ul className="space-y-2">
                    {itemsToDelete.map((item, index) => (
                      <li key={index} className="text-sm border-b border-gray-200 pb-2 last:border-b-0">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        {item.email && (
                          <div className="text-gray-500">{item.email}</div>
                        )}
                        {item.additionalInfo && (
                          <div className="text-gray-400 text-xs mt-1">{item.additionalInfo}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Warning message */}
                <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                  <p className="text-sm text-red-800">
                    <strong>Warning:</strong> This action cannot be undone. All associated data including assignments, attendance records, and class schedules will also be deleted.
                  </p>
                </div>

                {/* Confirmation code */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
                  <p className="text-sm text-gray-700 mb-2">
                    To confirm deletion, please type the following code:
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

          {/* Action buttons */}
          <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={inputCode.length !== 6}
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white sm:ml-3 sm:w-auto sm:text-sm transition-colors ${
                inputCode.length === 6
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-offset-2 focus:ring-red-500'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              Delete Permanently
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
    </div>
  )
}

