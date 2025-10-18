'use client'

import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    console.log('ProtectedRoute useEffect:', { user: !!user, loading })
    if (!loading && !user) {
      console.log('No user found, redirecting to login')
      router.push('/login')
    }
  }, [user, loading, router])

  if (loading) {
    console.log('ProtectedRoute: Loading state')
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    console.log('ProtectedRoute: No user, returning null')
    return null
  }

  console.log('ProtectedRoute: User authenticated, rendering children')
  return <>{children}</>
}
