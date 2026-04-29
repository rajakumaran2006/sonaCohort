'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { logger } from '@/lib/logger'
import { LoadingOverlay } from '@/components/ui/LoadingSpinner'

function DetectRoleContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  const [status, setStatus] = useState('Checking authentication...')

  // redirectTo is set by protected routes when a user refreshes on a specific page
  const redirectTo = searchParams.get('redirectTo') || ''

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

          // If a specific page was requested (e.g. user refreshed a subpage),
          // go there; otherwise fall back to the role's default dashboard
          router.push(redirectTo || dashboardPath)
          return
        }

        // If user has multiple roles, redirect to role selection page
        setStatus('Multiple roles detected, showing selection...')
        const pathsParam = encodeURIComponent(JSON.stringify(dashboardPaths))
        // Also forward the redirectTo so role selection can use it after role is chosen
        const redirectParam = redirectTo ? `&redirectTo=${encodeURIComponent(redirectTo)}` : ''
        router.push(`/auth/select-role?roles=${roles.join(',')}&paths=${pathsParam}${redirectParam}`)

      } catch (error) {
        logger.error('Error detecting roles:', error)
        setStatus('Error detecting roles, please try again...')
        router.push('/login?error=role_detection_failed')
      }
    }

    detectRoles()
  }, [user, loading, router, redirectTo])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-white">
      <LoadingOverlay size="xl">
        <div className="mt-4 flex flex-col items-center gap-2">
          <span className="text-gray-400 uppercase tracking-[0.3em] font-bold text-[10px] sm:text-xs">
            {status}
          </span>
          <div className="h-0.5 w-12 bg-blue-600/20 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 animate-[loading_2s_ease-in-out_infinite] w-1/2" />
          </div>
        </div>
      </LoadingOverlay>
    </div>
  )
}

export default function DetectRolePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-white">
        <LoadingOverlay size="xl">
          <div className="mt-4 flex flex-col items-center gap-2">
            <span className="text-gray-400 uppercase tracking-[0.3em] font-bold text-[10px] sm:text-xs">
              INITIALIZING...
            </span>
            <div className="h-0.5 w-12 bg-blue-600/20 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 animate-[loading_2s_ease-in-out_infinite] w-1/2" />
            </div>
          </div>
        </LoadingOverlay>
      </div>
    }>
      <DetectRoleContent />
    </Suspense>
  )
}
