'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { KeyRound, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, X } from 'lucide-react'
import { logger } from '@/lib/logger'

export default function ChangePassword() {
  const [isOpen, setIsOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (updateError) throw updateError

      setSuccess('Password updated successfully!')
      setNewPassword('')
      setConfirmPassword('')
      // Close modal after a short delay on success
      setTimeout(() => {
        setIsOpen(false)
        setSuccess('')
      }, 2000)
    } catch (err) {
      const error = err as Error
      logger.error('Error changing password:', error)
      setError(error.message || 'Failed to update password')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setIsOpen(false)
      setNewPassword('')
      setConfirmPassword('')
      setError('')
      setSuccess('')
      setShowNewPassword(false)
      setShowConfirmPassword(false)
    }
  }

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2.5 px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold text-sm transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
      >
        <KeyRound className="w-4 h-4" />
        Change Password
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={handleClose}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-[2rem] w-full max-w-md p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#84cc16] to-[#65a30d] flex items-center justify-center shadow-lg">
                <KeyRound className="w-5 h-5 text-black" />
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-900">Change Password</h2>
                <p className="text-xs text-gray-400 font-medium">Update your manual login password</p>
              </div>
            </div>

            {error && (
              <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <p className="text-xs font-bold text-red-700">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-5 p-3.5 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <p className="text-xs font-bold text-green-700">{success}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">New Password</label>
                <div className="relative flex items-center">
                  <KeyRound className="absolute left-3.5 w-4 h-4 text-gray-400" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-xl py-3 pl-10 pr-10 focus:outline-none focus:ring-2 focus:ring-[#84cc16]/50 focus:border-[#84cc16]/50 transition-all font-medium text-sm"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3.5 text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Confirm Password</label>
                <div className="relative flex items-center">
                  <KeyRound className="absolute left-3.5 w-4 h-4 text-gray-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-xl py-3 pl-10 pr-10 focus:outline-none focus:ring-2 focus:ring-[#84cc16]/50 focus:border-[#84cc16]/50 transition-all font-medium text-sm"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-colors"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !newPassword || !confirmPassword}
                  className="flex-1 relative overflow-hidden bg-gradient-to-r from-[#84cc16] to-[#65a30d] px-4 py-3 rounded-xl font-bold text-sm transition-all duration-300 hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center justify-center gap-2 text-black font-black tracking-wide">
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Password'
                    )}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
