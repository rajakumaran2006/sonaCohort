'use client'

import { useEffect, useState, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import RoleSelectionModal from '@/components/auth/RoleSelectionModal'
import { Loader2 } from 'lucide-react'
import { logger } from '@/lib/logger'

type UserRole = 'admin' | 'faculty' | 'peer' | 'student'

const DEFAULT_DASHBOARD_PATHS: Record<UserRole, string> = {
  admin: '/admin/dashboard',
  faculty: '/faculty/dashboard',
  peer: '/peer/dashboard',
  student: '/student/dashboard'
}

function SelectRoleContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, signOut } = useAuth()
  const [isTransitioning, setIsTransitioning] = useState(false)

  const rolesParam = searchParams.get('roles')
  const pathsParam = searchParams.get('paths')

  const roles = useMemo(() => 
    rolesParam ? rolesParam.split(',') as UserRole[] : [], 
    [rolesParam]
  )

  const dynamicPaths = useMemo(() => {
    if (!pathsParam) return {}
    try {
      return JSON.parse(decodeURIComponent(pathsParam))
    } catch (e) {
      logger.error('Error parsing dashboard paths:', e)
      return {}
    }
  }, [pathsParam])

  useEffect(() => {
    // If no roles or not authenticated, redirect to login
    if (!loading && (!user || roles.length === 0)) {
      router.push('/login')
    }
  }, [user, loading, roles, router])

  const handleRoleSelect = async (role: UserRole) => {
    setIsTransitioning(true)
    
    try {
      // Store the selected role in localStorage for the AuthContext
      localStorage.setItem('user_mode', role)
      
      // Store in cookie for server-side access
      await fetch('/api/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      })

      // Redirect to the appropriate dashboard
      // Use dynamic path if available, otherwise fall back to default
      const dashboardPath = dynamicPaths[role] || DEFAULT_DASHBOARD_PATHS[role]
      router.push(dashboardPath)
    } catch (error) {
      logger.error('Error setting role:', error)
      setIsTransitioning(false)
    }
  }

  const handleSwitchAccount = async () => {
    setIsTransitioning(true)
    try {
      // Sign out the current user
      await signOut()
      // Redirect to login with a flag to force account selection
      // The signInWithMicrosoft function already has prompt: 'select_account'
      router.push('/login')
      router.push('/login')
    } catch (error) {
      logger.error('Error switching account:', error)
      setIsTransitioning(false)
    }
  }

  if (loading || !user) {
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
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-[#F8F9FA] relative overflow-hidden">
      {/* Abstract Background Shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-green-400/10 rounded-full blur-[120px] translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-lime-400/10 rounded-full blur-[100px] -translate-x-1/3 translate-y-1/3"></div>
      </div>

      <RoleSelectionModal 
        roles={roles} 
        onSelect={handleRoleSelect}
        onSwitchAccount={handleSwitchAccount}
        isTransitioning={isTransitioning}
      />
    </div>
  )
}

export default function SelectRolePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="relative">
          <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full animate-pulse"></div>
          <Loader2 className="relative z-10 w-10 h-10 animate-spin text-green-600" />
        </div>
      </div>
    }>
      <SelectRoleContent />
    </Suspense>
  )
}
