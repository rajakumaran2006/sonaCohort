'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/lib/auth/AuthContext'
import { ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import { logger } from '@/lib/logger'

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading, signInWithMicrosoft, signOut } = useAuth()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)

  // Get error message from URL params
  const errorParam = searchParams.get('error')
  const errorMessage = errorParam === 'no_access' 
    ? "You don't have access. Please contact admin." 
    : errorParam

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true)
      await signInWithMicrosoft()
    } catch (err) {
      logger.error('Login error:', err)
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="relative">
          <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full animate-pulse"></div>
          <Loader2 className="relative z-10 w-10 h-10 animate-spin text-green-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 bg-[#F8F9FA] relative overflow-hidden">
      {/* Abstract Background Shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-green-400/10 rounded-full blur-[120px] translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-lime-400/10 rounded-full blur-[100px] -translate-x-1/3 translate-y-1/3"></div>
      </div>

      <div className="w-full max-w-[400px] relative z-10 perspective-1000">
        
        {/* Main Card */}
        <div className="bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] border border-white/60 p-8 sm:p-10 transition-all duration-500 hover:shadow-[0_48px_80px_-20px_rgba(0,0,0,0.12)]">
          
          {/* Header Section */}
          <div className="mb-10">
            {/* Logo and Brand - Horizontal Layout */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="relative flex-shrink-0 rounded overflow-hidden bg-black  p-3">
                <Image 
                  src="/peers.png"  
                  alt="Peers Logo" 
                  width={24 } 
                  height={24} 
                  className="w-12 h-12 object-contain"
                  priority
                />
              </div>
              <div className="flex flex-col">
                <span className="text-4xl font-black text-gray-900 tracking-[0.15em] leading-none mb-1">
                  SONA
                </span>
                <span className="text-2xl font-bold text-[#84cc16] tracking-[0.2em] leading-none uppercase">
                  Cohort
                </span>
              </div>
            </div>
            
            <h2 className="text-center text-[23px] font-bold text-gray-400 uppercase tracking-widest opacity-60 mb-0">
              Welcome Back
            </h2>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50/80 backdrop-blur-sm border-2 border-red-100 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2 fade-in">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <p className="text-xs font-bold text-red-700">{errorMessage}</p>
            </div>
          )}

          {/* User Already Logged In */}
          {user && !errorParam ? (
             <div className="space-y-4">
               <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-4 mb-6">
                 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-sm font-bold text-gray-600 shadow-inner">
                   {user.email?.charAt(0).toUpperCase()}
                 </div>
                 <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{user.email}</p>
                    <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Active Session</p>
                 </div>
               </div>

               <button
                 onClick={handleContinue}
                 className="w-full group relative overflow-hidden bg-gray-900 text-white px-6 py-4 rounded-2xl font-bold text-sm transition-all duration-300 hover:shadow-xl hover:scale-[1.02]"
               >
                 <span className="relative z-10 flex items-center justify-center gap-2">
                   Continue to Dashboard
                   <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                 </span>
               </button>
               
               <button
                 onClick={handleSwitchAccount}
                 disabled={isSwitching}
                 className="w-full bg-transparent text-gray-500 px-6 py-3 rounded-2xl font-bold text-xs hover:text-gray-900 transition-colors"
               >
                 {isSwitching ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Switch Account'}
               </button>
             </div>
          ) : (
            /* Sign In Button */
            <div className="space-y-6">
               <button
                onClick={handleSignIn}
                disabled={isSigningIn || authLoading}
                className="w-full group relative overflow-hidden bg-[#2F2F2F] text-white px-6 py-4 rounded-2xl font-bold text-sm transition-all duration-300 hover:bg-black hover:shadow-2xl hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <div className="absolute inset-0 rounded-2xl ring-1 ring-white/10"></div>
                
                <span className="relative z-10 flex items-center justify-center gap-3">
                  {isSigningIn ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10.5 0.5H0.5V10.5H10.5V0.5Z" fill="#F25022"/>
                      <path d="M21.5 0.5H11.5V10.5H21.5V0.5Z" fill="#7FBA00"/>
                      <path d="M10.5 11.5H0.5V21.5H10.5V11.5Z" fill="#00A4EF"/>
                      <path d="M21.5 11.5H11.5V21.5H21.5V11.5Z" fill="#FFB900"/>
                    </svg>
                  )}
                  {isSigningIn ? 'Connecting...' : 'Sign in with Microsoft'}
                </span>
                
                {/* Hover Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
              </button>

              <div className="flex items-center justify-center gap-6">
                 <a href="#" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-green-600 transition-colors">Terms</a>
                 <div className="w-1 h-1 rounded-full bg-gray-300"></div>
                 <a href="#" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-green-600 transition-colors">Privacy</a>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <p className="text-center mt-8 text-[10px] font-bold text-gray-400 uppercase tracking-widest opacity-60">
           Peer Tutor Management System
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading</span>
          </div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}
