'use client'

import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter } from 'next/navigation'
import { logger } from '@/lib/logger'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'

interface IndividualFacultyProtectedRouteProps {
  children: React.ReactNode
}

export default function IndividualFacultyProtectedRoute({ children }: IndividualFacultyProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  
  // Use React Query to check if user is an individual faculty member
  const { data: isFaculty, isLoading: isVerifying, error } = useQuery({
    queryKey: ['individual-faculty-auth', user?.email],
    queryFn: async () => {
      if (!user?.email) return false
      // This checks both departments table AND faculty_allocations
      return await FacultyService.hasFacultyAccess(user.email)
    },
    enabled: !!user?.email && !loading,
    staleTime: 5 * 60 * 1000, 
    retry: false
  })

  useEffect(() => {
    if (!loading && !isVerifying) {
      if (!user) {
        router.push('/login')
      } else if (!isFaculty) {
        logger.info('User is not authorized as faculty:', user.email)
        router.push('/login?error=no_access')
      }
    }
  }, [loading, isVerifying, user, isFaculty, router])

  if (loading || isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          <p className="text-gray-500 font-medium animate-pulse">Verifying Access...</p>
        </div>
      </div>
    )
  }

  if (!user || !isFaculty) return null

  return <>{children}</>
}
