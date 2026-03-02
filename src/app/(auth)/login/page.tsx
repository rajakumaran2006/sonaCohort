'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/lib/auth/AuthContext'
import { ChevronRight, AlertCircle, Loader2, KeyRound, User as UserIcon, Eye, EyeOff } from 'lucide-react'
import { logger } from '@/lib/logger'
import PixelBlast from '@/components/ui/PixelBlast'

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading, signInWithMicrosoft, signInWithPassword, signOut } = useAuth()
  
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState('')

  // Get error message from URL params
  const errorParam = searchParams.get('error')
  const errorMessage = errorParam === 'no_access'
    ? "You don't have access. Please contact admin."
    : errorParam || localError

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError('')
    
    if (!username || !password) {
      setLocalError('Please enter both username and password')
      return
    }

    try {
      setIsSigningIn(true)
      
      // If the user entered a full email, use it directly
      if (username.includes('@')) {
        await signInWithPassword(username, password)
        router.push('/auth/detect-role')
        return
      }
      
      // Try the primary domain first
      const primaryEmail = `${username}@sonatech.ac.in`
      try {
        await signInWithPassword(primaryEmail, password)
        router.push('/auth/detect-role')
        return
      } catch (primaryErr) {
        const error = primaryErr as { code?: string };
        // If credentials are invalid, try alternate domain
        if (error?.code === 'invalid_credentials') {
          try {
            const altEmail = `${username}@sonacas.edu.in`
            await signInWithPassword(altEmail, password)
            router.push('/auth/detect-role')
            return
          } catch {
            // Both domains failed — throw the original error
          }
        }
        throw primaryErr
      }
    } catch (err) {
      const error = err as Error;
      logger.error('Login error:', error)
      setLocalError(error.message || 'Invalid username or password')
      setIsSigningIn(false)
    }
  }

  const handleMicrosoftSignIn = async () => {
    try {
      setIsSigningIn(true)
      await signInWithMicrosoft()
    } catch (err) {
      logger.error('Microsoft Login error:', err)
      setIsSigningIn(false)
    }
  }

  const handleContinue = () => {
    router.push('/auth/detect-role')
  }

  const handleSwitchAccount = async () => {
    try {
      setIsSwitching(true)
      await signOut()
      setIsSwitching(false)
    } catch (error) {
      logger.error('Error switching account:', error)
      setIsSwitching(false)
    }
  }

  const isLoading = authLoading || isSigningIn || isSwitching

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 bg-black relative overflow-hidden">
      
      {/* Pixel Blast Background */}
      <div className="absolute inset-0 z-0 opacity-80">
        <PixelBlast
          variant="square"
          pixelSize={4}
          color="#84cc16"
          patternScale={2}
          patternDensity={1}
          pixelSizeJitter={0}
          enableRipples
          rippleSpeed={0.4}
          rippleThickness={0.12}
          rippleIntensityScale={1.5}
          liquid={false}
          liquidStrength={0.12}
          liquidRadius={1.2}
          liquidWobbleSpeed={5}
          speed={0.5}
          edgeFade={0.25}
          transparent
        />
      </div>

      <div className="w-full max-w-[400px] relative z-10 perspective-1000 mx-auto transform transition-transform duration-300">

        {/* Main Card */}
        <div className="bg-white/10 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-white/20 p-8 sm:p-10 transition-all duration-500 hover:shadow-[0_48px_80px_-20px_rgba(0,0,0,0.6)]">

          {/* Header Section */}
          <div className="mb-10 text-center">
            {/* Logo and Brand */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="relative flex-shrink-0 rounded overflow-hidden bg-black p-3">
                <Image
                  src="/peers.png"
                  alt="Peers Logo"
                  width={24}
                  height={24}
                  className="w-12 h-12 object-contain"
                  priority
                />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-4xl font-black text-white tracking-[0.15em] leading-none mb-1">
                  SONA
                </span>
                <span className="text-2xl font-bold text-[#84cc16] tracking-[0.2em] leading-none uppercase drop-shadow-md">
                  Cohort
                </span>
              </div>
            </div>

            <h2 className="text-[23px] font-bold text-white/60 uppercase tracking-widest mt-4">
              Welcome Back
            </h2>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-black backdrop-blur-md border border-red-500/50 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2 fade-in relative overflow-hidden">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <p className="text-xs font-bold text-white">{errorMessage}</p>
            </div>
          )}

          {/* User Already Logged In */}
          {user && !errorParam ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-sm font-bold text-white shadow-lg">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{user.email}</p>
                  <p className="text-[10px] font-bold text-[#84cc16] uppercase tracking-wider">Active Session</p>
                </div>
              </div>

              <button
                onClick={handleContinue}
                className="w-full group relative overflow-hidden bg-white text-black px-6 py-4 rounded-2xl font-bold text-sm transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-[1.02]"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  Continue to Dashboard
                  <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </span>
              </button>

              <button
                onClick={handleSwitchAccount}
                disabled={isSwitching}
                className="w-full bg-transparent text-white/50 px-6 py-3 rounded-2xl font-bold text-xs hover:text-white transition-colors"
              >
                {isSwitching ? 'Switching...' : 'Switch Account'}
              </button>
            </div>
          ) : (
            /* Login Form */
            <div className="space-y-6">
              
              <form onSubmit={handleManualLogin} className="space-y-4">
                <div className="space-y-1">
                  <div className="relative flex items-center">
                    <UserIcon className="absolute left-4 w-5 h-5 text-white/40" />
                    <input
                      type="text"
                      placeholder="Username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 text-white placeholder:text-white/30 rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-[#84cc16]/50 focus:border-[#84cc16]/50 transition-all font-medium text-sm"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="relative flex items-center">
                    <KeyRound className="absolute left-4 w-5 h-5 text-white/40" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 text-white placeholder:text-white/30 rounded-2xl py-3.5 pl-12 pr-12 focus:outline-none focus:ring-2 focus:ring-[#84cc16]/50 focus:border-[#84cc16]/50 transition-all font-medium text-sm"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 text-white/40 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full group relative overflow-hidden bg-gradient-to-r from-[#84cc16] to-[#65a30d] text-white px-6 py-3.5 rounded-2xl font-bold text-sm transition-all duration-300 hover:shadow-[0_0_25px_rgba(132,204,22,0.4)] hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100 mt-2"
                >

                  <span className="relative z-10 flex items-center justify-center gap-2 text-black font-black tracking-wide">
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      'Sign In'
                    )}
                  </span>
                  <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"></div>
                </button>
              </form>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink-0 mx-4 text-[10px] font-medium text-white/30 uppercase tracking-widest">Or</span>
                <div className="flex-grow border-t border-white/10"></div>
              </div>

              <button
                onClick={handleMicrosoftSignIn}
                type="button"
                disabled={isLoading}
                className="w-full group relative overflow-hidden text-white px-6 py-3.5 rounded-2xl font-bold text-sm transition-all duration-300 hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed border border-white/20 hover:border-white/40 shadow-[0_4px_14px_0_rgba(0,0,0,0.39)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.1)]"
              >
                {/* Background gradient for Microsoft button */}
                <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-800 to-black z-0"></div>
                <span className="relative z-10 flex items-center justify-center gap-3 tracking-wide">
                  <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10.5 0.5H0.5V10.5H10.5V0.5Z" fill="#F25022" />
                    <path d="M21.5 0.5H11.5V10.5H21.5V0.5Z" fill="#7FBA00" />
                    <path d="M10.5 11.5H0.5V21.5H10.5V11.5Z" fill="#00A4EF" />
                    <path d="M21.5 11.5H11.5V21.5H21.5V11.5Z" fill="#FFB900" />
                  </svg>
                  Sign in with Microsoft
                </span>
                <div className="absolute inset-0 bg-white/5 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out z-10"></div>
              </button>

              <div className="flex flex-col items-center justify-center gap-3 pt-2">
                <div className="flex items-center gap-4">
                  <a href="#" className="text-[10px] font-bold text-white/30 uppercase tracking-widest hover:text-white transition-colors">Terms</a>
                  <div className="w-1 h-1 rounded-full bg-white/20"></div>
                  <a href="#" className="text-[10px] font-bold text-white/30 uppercase tracking-widest hover:text-white transition-colors">Privacy</a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center mt-8 text-[10px] font-bold text-white/40 uppercase tracking-widest drop-shadow-md">
          Peer Tutor Management System
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-[#B19EEF]" />
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}
