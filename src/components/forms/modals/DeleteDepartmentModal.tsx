'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, KeyRound, Loader2, Mail, ShieldAlert, X, CheckCircle2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface DeleteDepartmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  department: {
    id: string
    name: string
    faculty_email?: string
    faculty_name?: string
  } | null
}

export default function DeleteDepartmentModal({
  isOpen,
  onClose,
  onSuccess,
  department,
}: DeleteDepartmentModalProps) {
  const [step, setStep] = useState<'confirm' | 'otp'>('confirm')
  const [otp, setOtp] = useState('')
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [targetEmail, setTargetEmail] = useState('')
  const [resendCountdown, setResendCountdown] = useState(0)
  const [debugOtp, setDebugOtp] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && department) {
      setStep('confirm')
      setOtp('')
      setDebugOtp(null)
      setTargetEmail(department.faculty_email || '')
    }
  }, [isOpen, department])

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (resendCountdown > 0) {
      timer = setInterval(() => {
        setResendCountdown((prev) => prev - 1)
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [resendCountdown])

  if (!isOpen || !department) return null

  const handleSendOtp = async () => {
    setIsSendingOtp(true)
    try {
      const res = await fetch('/api/department/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deptId: department.id }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send OTP')
      }

      setTargetEmail(data.targetEmail || department.faculty_email)
      if (data.debugOtp) {
        setDebugOtp(data.debugOtp)
      }
      setStep('otp')
      setResendCountdown(60)
      toast.success(`OTP sent to ${data.targetEmail || 'your email'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send OTP')
    } finally {
      setIsSendingOtp(false)
    }
  }

  const handleDeleteWithOtp = async () => {
    if (!otp.trim() || otp.trim().length < 6) {
      toast.error('Please enter the full 6-digit OTP')
      return
    }

    setIsDeleting(true)
    try {
      const res = await fetch('/api/department/delete-with-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deptId: department.id,
          otp: otp.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete department')
      }

      toast.success(data.message || `Department "${department.name}" deleted successfully`)
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete department')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-[28px] max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-100 dark:border-gray-800 relative overflow-hidden">
        {/* Top Decorative Header */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-500 via-rose-500 to-orange-500" />

        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSendingOtp || isDeleting}
          className="absolute top-6 right-6 p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {step === 'confirm' ? (
          <div>
            {/* Header Icon */}
            <div className="h-14 w-14 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 flex items-center justify-center mb-6">
              <ShieldAlert className="w-7 h-7 text-red-600 dark:text-red-400" />
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              Delete Department & Revoke Access
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-2 font-medium leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <span className="font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                {department.name}
              </span>
              ?
            </p>

            {/* Warning Box */}
            <div className="mt-5 p-4 rounded-2xl bg-red-50/70 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs text-red-800 dark:text-red-300">
                  <p className="font-bold uppercase tracking-wider text-[10px] text-red-600 dark:text-red-400">
                    This action will permanently delete:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-[11px] font-medium leading-relaxed">
                    <li>All classes and scheduled sessions for {department.name}</li>
                    <li>All student and peer tutor allocations for this department</li>
                    <li>Revoke all access for students and tutors of this department</li>
                    <li>Delete associated attendance and exam records</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Sonatech ID Notice */}
            <div className="mt-4 flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-300 font-medium">
              <Mail className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span>
                OTP will be sent to Sonatech ID:{' '}
                <strong className="text-gray-900 dark:text-white font-bold">{targetEmail || 'Your Email'}</strong>
              </span>
            </div>

            {/* Modal Actions */}
            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSendingOtp}
                className="px-5 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={isSendingOtp}
                className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition-all disabled:opacity-60"
              >
                {isSendingOtp ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending OTP...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Send OTP to Sonatech ID
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Step 2: Enter OTP */}
            <div className="h-14 w-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 flex items-center justify-center mb-6">
              <KeyRound className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              Enter Verification OTP
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-2 font-medium leading-relaxed">
              We have sent a 6-digit OTP code to{' '}
              <strong className="text-gray-900 dark:text-white">{targetEmail}</strong>.
            </p>

            {/* Debug OTP Banner if present in dev mode */}
            {debugOtp && (
              <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 font-bold flex items-center justify-between">
                <span>Developer OTP code:</span>
                <span className="font-mono text-sm tracking-widest bg-amber-200 dark:bg-amber-900 px-2 py-0.5 rounded">
                  {debugOtp}
                </span>
              </div>
            )}

            {/* OTP Input */}
            <div className="mt-6">
              <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                6-Digit Security OTP
              </label>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full px-4 py-3.5 border-2 border-gray-200 dark:border-gray-700 rounded-2xl text-center text-2xl font-mono font-bold tracking-[0.5em] bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all"
              />
            </div>

            {/* Resend Link */}
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-gray-400 dark:text-gray-500 font-medium">Didn&apos;t get the code?</span>
              {resendCountdown > 0 ? (
                <span className="text-gray-400 font-medium">Resend in {resendCountdown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={isSendingOtp}
                  className="font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline"
                >
                  Resend OTP
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-end">
              <button
                type="button"
                onClick={() => setStep('confirm')}
                disabled={isDeleting}
                className="px-5 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleDeleteWithOtp}
                disabled={isDeleting || otp.length < 6}
                className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition-all disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting Department...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Verify OTP & Delete Department
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
