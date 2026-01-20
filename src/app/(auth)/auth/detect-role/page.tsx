'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { logger } from '@/lib/logger'

function DetectRoleContent() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [status, setStatus] = useState('Checking authentication...')

  useEffect(() => {
    const detectRoles = async () => {
      // Wait for auth to load
      if (loading) {
        return
      }

      // If no user, redirect to login
      if (!user || !user.email) {
        setStatus('Not authenticated, redirecting to login...')
        router.push('/login')
        return
      }

      setStatus('Detecting your roles...')

      try {
        // Call the API to detect roles
        const response = await fetch('/api/detect-roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email })
        })

        if (!response.ok) {
          throw new Error('Failed to detect roles')
        }

        const { roles, dashboardPaths } = await response.json()

        logger.info('Detected roles:', roles)
        logger.info('Dashboard paths:', dashboardPaths)

        // If user has no roles, they don't have access
        if (!roles || roles.length === 0) {
          setStatus('No access found, redirecting...')
          router.push('/login?error=no_access')
          return
        }

        // If user has exactly one role, redirect directly to that dashboard
        if (roles.length === 1) {
          const role = roles[0]
          const dashboardPath = dashboardPaths[role]
          setStatus(`Redirecting to ${role} dashboard...`)
          
          // Store the selected role
          localStorage.setItem('user_mode', role)
          
          // Set cookie for server-side access
          await fetch('/api/set-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role })
          })

          router.push(dashboardPath)
          return
        }

        // If user has multiple roles, redirect to role selection page
        setStatus('Multiple roles detected, showing selection...')
        router.push(`/auth/select-role?roles=${roles.join(',')}`)

      } catch (error) {
        logger.error('Error detecting roles:', error)
        setStatus('Error detecting roles, please try again...')
        router.push('/login?error=role_detection_failed')
      }
    }

    detectRoles()
  }, [user, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">{status}</span>
        </div>
      </div>
    </div>
  )
}

export default function DetectRolePage() {
  return (
    <Suspense fallback={
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading</span>
                </div>
              </div>
    }>
      <DetectRoleContent />
    </Suspense>
  )
}
