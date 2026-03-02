'use client'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Loader2, User as UserIcon, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import PixelBlast from '@/components/ui/PixelBlast'

function ForgotPasswordPageContent() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!username) {
      setError('Please enter your username')
      return
    }

    try {
      setIsLoading(true)
      const supabase = createClient()
      
      // Auto-append domain
      const email = `${username}@sonatech.ac.in`
      
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      })

      if (resetError) throw resetError
      
      setIsSuccess(true)
    } catch (err) {
      const error = err as Error
      logger.error('Error in forgot password:', error)
      setError(error.message || 'Error processing request')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 bg-black relative overflow-hidden">
      
      {/* Pixel Blast Background */}
      <div className="absolute inset-0 z-0 opacity-50">
        <PixelBlast
          variant="circle"
          pixelSize={6}
          color="#84cc16"
          patternScale={3}
          patternDensity={0.5}
          enableRipples={false}
          speed={0.2}
          transparent
        />
      </div>

      <div className="w-full max-w-[400px] relative z-10 perspective-1000 mx-auto transform transition-transform duration-300">

        {/* Main Card */}
        <div className="bg-white/10 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-white/20 p-8 sm:p-10 transition-all duration-500 hover:shadow-[0_48px_80px_-20px_rgba(0,0,0,0.6)]">

          {/* Header Section */}
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-black text-white tracking-wide mb-2">
              Forgot Password
            </h2>
            <p className="text-sm text-white/60">
              Enter your username and we'll send you a link to reset your password.
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
                <h3 className="text-xl font-bold text-white">Check your email</h3>
                <p className="text-sm text-white/70">
                  We've sent a password reset link to <strong>{username}@sonatech.ac.in</strong>.
                </p>
              </div>

              <button
                onClick={() => router.push('/auth/login')}
                className="w-full mt-8 group relative overflow-hidden bg-white/10 border border-white/20 text-white px-6 py-4 rounded-2xl font-bold text-sm transition-all duration-300 hover:bg-white/20 hover:scale-[1.02]"
              >
                Return to Login
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1">
                  <div className="relative flex items-center">
                    <UserIcon className="absolute left-4 w-5 h-5 text-white/40" />
                    <input
                      type="text"
                      placeholder="Username (e.g., johndoe)"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 text-white placeholder:text-white/30 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-[#84cc16]/50 focus:border-[#84cc16]/50 transition-all font-medium"
                      disabled={isLoading}
                    />
                  </div>
                  <p className="text-[10px] text-white/40 ml-4 font-medium uppercase tracking-wider">@sonatech.ac.in will be appended</p>
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
                      'Send Reset Link'
                    )}
                  </span>
                  <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"></div>
                </button>
              </form>

              <button
                onClick={() => router.push('/auth/login')}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 text-white/50 hover:text-white transition-colors text-sm font-bold pt-4"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-[#B19EEF]" />
      </div>
    }>
      <ForgotPasswordPageContent />
    </Suspense>
  )
}
