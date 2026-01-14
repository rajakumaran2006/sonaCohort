'use client'

import { useState } from 'react'
import { X, Bell, Loader2, Send } from 'lucide-react'
import { peertutors } from '@/lib/services/peerTutorService'

interface SendNotificationModalProps {
  isOpen: boolean
  onClose: () => void
  onSend: (message: string, recipientIds: string[]) => Promise<boolean>
  peerTutors: peertutors[]
  selectedPeerTutorIds?: string[]
}

export default function SendNotificationModal({
  isOpen,
  onClose,
  onSend,
  peerTutors,
  selectedPeerTutorIds = []
}: SendNotificationModalProps) {
  const [message, setMessage] = useState('')
  const [sendToAll, setSendToAll] = useState(selectedPeerTutorIds.length === 0)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')

  const handleSend = async () => {
    // Validation
    if (!message.trim()) {
      setError('Please enter a message')
      return
    }

    setIsSending(true)
    setError('')

    try {
      const recipientIds = sendToAll 
        ? peerTutors.map(pt => pt.id)
        : selectedPeerTutorIds

      if (recipientIds.length === 0) {
        setError('No recipients selected')
        setIsSending(false)
        return
      }

      // We are passing 'message' as the first argument, which maps to 'title' in the underlying service
      const success = await onSend(message, recipientIds)
      
      if (success) {
        // Reset form
        setMessage('')
        setSendToAll(selectedPeerTutorIds.length === 0)
        onClose()
      } else {
        setError('Failed to send notification. Please try again.')
      }
    } catch (err) {
      console.error('Error sending notification:', err)
      setError('An error occurred while sending the notification')
    } finally {
      setIsSending(false)
    }
  }

  const handleClose = () => {
    setMessage('')
    setError('')
    setSendToAll(selectedPeerTutorIds.length === 0)
    onClose()
  }

  if (!isOpen) return null

  const recipientCount = sendToAll ? peerTutors.length : selectedPeerTutorIds.length

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-gray-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-xl font-bold uppercase text-gray-900 tracking-tight">
                Send Notification
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Notify peer tutors about important updates
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
          {/* Recipients */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
              Recipients
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  checked={sendToAll}
                  onChange={() => setSendToAll(true)}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">All Peer Tutors</p>
                  <p className="text-xs text-gray-500 mt-0.5">Send to all {peerTutors.length} peer tutors</p>
                </div>
              </label>
              
              {selectedPeerTutorIds.length > 0 && (
                <label className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    checked={!sendToAll}
                    onChange={() => setSendToAll(false)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">Selected Peer Tutors</p>
                    <p className="text-xs text-gray-500 mt-0.5">Send to {selectedPeerTutorIds.length} selected peer tutors</p>
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Message (Formerly Title) */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">
              Message
            </label>
           <input
              type="text"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value)
                setError('')
              }}
              placeholder="Enter your message..."
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
              maxLength={100}
            />
            <p className="text-xs text-gray-400 mt-2">{message.length}/100 characters</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 animate-in slide-in-from-top-2 fade-in duration-300">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-gray-100 bg-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-600">
              Will send to <span className="font-bold text-blue-600">{recipientCount}</span> peer tutor{recipientCount !== 1 && 's'}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                disabled={isSending}
                className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all duration-200 focus:ring-2 focus:ring-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={isSending || !message.trim()}
                className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-blue-200 transition-all duration-200 flex items-center gap-2 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Notification
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
