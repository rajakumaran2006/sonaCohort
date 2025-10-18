'use client'

import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AdminService } from '@/lib/services/adminService'

export default function LoginPage() {
  const { user, signInWithMicrosoft, loading, userMode, setUserMode } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  useEffect(() => {
    console.log('Login page useEffect triggered:', { user: !!user, loading, userMode, error })
    
    // Don't redirect if there's an access denied error - let user see the error message
    if (error && (error.includes('access_denied') || error.includes('verification_failed'))) {
      console.log('Access denied error detected, not redirecting:', error)
      return
    }
    
    if (user && !loading) {
      const handleRedirect = async () => {
        try {
          let redirectPath = '/admin/dashboard'
          
          switch (userMode) {
            case 'faculty':
              redirectPath = '/faculty/dashboard'
              break
            case 'peer':
              redirectPath = '/peer/dashboard'
              break
            case 'student':
              redirectPath = '/student/dashboard'
              break
            default:
              // If redirecting to default dashboard, determine the correct path based on user role
              if (user.email) {
                try {
                  redirectPath = await AdminService.getDashboardPath(user.email)
                  console.log('Determined correct dashboard path:', redirectPath)
                } catch (dashboardError) {
                  console.error('Error determining dashboard path:', dashboardError)
                  // Fallback to admin dashboard if there's an error
                  redirectPath = '/admin/dashboard'
                }
              }
          }
          
          console.log('Redirecting to:', redirectPath)
          console.log('User object:', user)
          console.log('User email:', user.email)
          
          router.push(redirectPath)
        } catch (error) {
          console.error('Error in handleRedirect:', error)
          // Fallback to admin dashboard
          router.push('/admin/dashboard')
        }
      }
      
      // Remove the setTimeout delay - redirect immediately
      handleRedirect()
    }
  }, [user, loading, router, userMode, error])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Show loading state while redirecting, but only if there's no error
  if (user && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Login Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-20 xl:px-24 bg-gray-50">
        <div className="max-w-md w-full space-y-8">

          {/* Welcome Text */}
          <div>
          <div>
              <span className="text-3xl font-black text-gray-900 uppercase tracking-tight space-x-2">PEERTUTORS</span>
            </div>
            <h2 className="text-3xl font-bold text-gray-900">
              Welcome Back
            </h2>
            <p className="text-gray-500">
              Sign in to continue your learning journey
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    {error === 'faculty_access_denied' 
                      ? 'Faculty Access Denied' 
                      : error === 'faculty_verification_failed'
                      ? 'Faculty Verification Failed'
                      : error === 'admin_access_denied'
                      ? 'Admin Access Denied'
                      : error === 'admin_verification_failed'
                      ? 'Admin Verification Failed'
                      : error === 'peer_access_denied'
                      ? 'PEER TUTOR Access Denied'
                      : error === 'peer_verification_failed'
                      ? 'PEER TUTOR Verification Failed'
                      : error === 'student_access_denied'
                      ? 'Student Access Denied'
                      : error === 'student_verification_failed'
                      ? 'Student Verification Failed'
                      : error === 'authentication_failed'
                      ? 'Authentication Failed'
                      : 'Authentication Error'
                    }
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    {error === 'faculty_access_denied' 
                      ? 'You are not assigned to any department. Please contact your administrator.'
                      : error === 'faculty_verification_failed'
                      ? 'Unable to verify your faculty status. Please try again or contact support.'
                      : error === 'admin_access_denied'
                      ? 'You do not have admin privileges. Please contact your administrator.'
                      : error === 'admin_verification_failed'
                      ? 'Unable to verify your admin status. Please try again or contact support.'
                      : error === 'peer_access_denied'
                      ? 'You are not registered as a peer tutor. Please contact your administrator.'
                      : error === 'peer_verification_failed'
                      ? 'Unable to verify your peer tutor status. Please try again or contact support.'
                      : error === 'student_access_denied'
                      ? 'You are not registered as a student. Please contact your administrator.'
                      : error === 'student_verification_failed'
                      ? 'Unable to verify your student status. Please try again or contact support.'
                      : error === 'authentication_failed'
                      ? 'Authentication failed. Please try signing in again.'
                      : 'An error occurred during authentication. Please try again.'
                    }
                  </div>
                  <div className="mt-3 flex space-x-2">
                    <button
                      onClick={() => router.push('/login')}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          if (typeof window !== 'undefined') {
                            localStorage.clear()
                            sessionStorage.clear()
                          }
                          const { createClient } = await import('@/utils/supabase/client')
                          const supabase = createClient()
                          await supabase.auth.signOut()
                          router.push('/login')
                        } catch (error) {
                          console.error('Error signing out:', error)
                          router.push('/login')
                        }
                      }}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200"
                    >
                      Sign Out & Retry
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Login Form */}
          <div className="space-y-5">
            {/* User Type Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Select your role
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setUserMode('admin')}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    userMode === 'admin'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center">
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Admin
                  </div>
                </button>
                <button
                  onClick={() => setUserMode('faculty')}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    userMode === 'faculty'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center">
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                    Faculty
                  </div>
                </button>
                <button
                  onClick={() => setUserMode('peer')}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    userMode === 'peer'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center">
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    PEER TUTOR
                  </div>
                </button>
                <button
                  onClick={() => setUserMode('student')}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    userMode === 'student'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center">
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Student
                  </div>
                </button>
              </div>
            </div>
            
            {/* Sign In Button */}
            <button
              onClick={() => signInWithMicrosoft(userMode)}
              className="w-full flex justify-center items-center py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 shadow-lg hover:shadow-xl"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 23 23" fill="currentColor">
                <path d="M1 1h10v10H1V1zm11 0h10v10H12V1zm-11 11h10v10H1V12zm11 0h10v10H12V12z"/>
              </svg>
              Sign In with Microsoft
            </button>

            {/* Role Description */}
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <p className="text-xs text-blue-700 text-center">
                {userMode === 'faculty' 
                  ? 'Faculty members will be verified against department records'
                  : userMode === 'peer'
                  ? 'PEER TUTORS will be verified against peer tutor records'
                  : userMode === 'student'
                  ? 'Students can view their assigned peer tutor and submit feedback'
                  : 'Admin can modify faculty lists and manage the system'
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Blue Gradient */}
      <div className="hidden lg:flex lg:flex-1 bg-blue-600 items-center justify-center p-12">
        <div className="max-w-xl text-center text-white space-y-10">
          {/* Icon */}
          <div className="flex justify-center mb-8">
            <svg className="w-28 h-28" fill="white" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              <circle cx="18.5" cy="8.5" r="2.5"/>
              <path d="M18.5 11c-1.5 0-4.5.67-4.5 2v1h9v-1c0-1.33-3-2-4.5-2z" opacity="0.6"/>
            </svg>
          </div>

          {/* Text Content */}
          <div className="space-y-6">
            <h1 className="text-4xl lg:text-5xl font-bold leading-tight tracking-wide">
              JOIN A COMMUNITY OF<br />LEARNERS
            </h1>
            <p className="text-lg text-blue-100 px-8">
              Connect with tutors and students to enhance your academic experience.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
