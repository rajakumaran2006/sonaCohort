'use client'

import { useState, Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import PixelBlast from '@/components/ui/PixelBlast'

function UpdatePasswordPageContent() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Check if we have a hash fragment (which supabase uses for password resets)
    // Supabase handles the session creation automatically when coming from a reset link
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // If no session after a brief delay, might not be a valid reset link
        logger.info('No session found for update password')
      }
    })
  }, [])

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!password || !confirmPassword) {
      setError('Please fill in both fields')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    try {
      setIsLoading(true)
      const supabase = createClient()
      
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) throw updateError
      
      setIsSuccess(true)
    } catch (err) {
      const error = err as Error
      logger.error('Update password error:', error)
      setError(error.message || 'Error updating password. Your reset link may have expired.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 bg-black relative overflow-hidden">
      
      {/* Pixel Blast Background */}
      <div className="absolute inset-0 z-0 opacity-50">
        <PixelBlast
          variant="diamond"
          pixelSize={5}
          color="#84cc16"
          patternScale={2}
          patternDensity={1.5}
          enableRipples={true}
          rippleSpeed={0.5}
          speed={0.3}
          transparent
        />
      </div>

      <div className="w-full max-w-[400px] relative z-10 perspective-1000 mx-auto transform transition-transform duration-300">

        {/* Main Card */}
        <div className="bg-white/10 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-white/20 p-8 sm:p-10 transition-all duration-500 hover:shadow-[0_48px_80px_-20px_rgba(0,0,0,0.6)]">

          {/* Header Section */}
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-black text-white tracking-wide mb-2">
              Update Password
            </h2>
            <p className="text-sm text-white/60">
              Please enter your new password below.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 backdrop-blur-md border border-red-500/50 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2 fade-in relative overflow-hidden">
               <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <p className="text-xs font-bold text-red-200">{error}</p>
            </div>
          )}

          {isSuccess ? (
            <div className="space-y-6 animate-in zoom-in-95 duration-500">
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/50">
                  <CheckCircle2 className="w-10 h-10 text-green-400" />
                </div>
              </div>
              
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-white">Password Updated!</h3>
                <p className="text-sm text-white/70">
                  Your password has been changed successfully.
                </p>
              </div>

              <button
                onClick={() => router.push('/auth/login')}
                className="w-full mt-8 group relative overflow-hidden bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-2xl font-bold text-sm transition-all duration-300 hover:shadow-[0_0_25px_rgba(34,197,94,0.4)] hover:scale-[1.02]"
              >
                Proceed to Login
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-1">
                  <div className="relative flex items-center">
                    <KeyRound className="absolute left-4 w-5 h-5 text-white/40" />
                    <input
                      type="password"
                      placeholder="New Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 text-white placeholder:text-white/30 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-[#84cc16]/50 focus:border-[#84cc16]/50 transition-all font-medium"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="relative flex items-center">
                    <KeyRound className="absolute left-4 w-5 h-5 text-white/40" />
                    <input
                      type="password"
                      placeholder="Confirm New Password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 text-white placeholder:text-white/30 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-[#84cc16]/50 focus:border-[#84cc16]/50 transition-all font-medium"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full group relative overflow-hidden bg-gradient-to-r from-[#84cc16] to-[#65a30d] text-white px-6 py-4 rounded-2xl font-bold text-sm transition-all duration-300 hover:shadow-[0_0_25px_rgba(132,204,22,0.4)] hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100 mt-4"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2 text-black font-black tracking-wide">
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      'Save Password'
                    )}
                  </span>
                  <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"></div>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-[#B19EEF]" />
      </div>
    }>
      <UpdatePasswordPageContent />
    </Suspense>
  )
}
