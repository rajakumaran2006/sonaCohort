'use client'

import { useEffect, useState, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { FacultyService } from '@/lib/services/facultyService'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import DepartmentSelectionModal, { SelectableDepartment } from '@/components/auth/DepartmentSelectionModal'
import { Loader2 } from 'lucide-react'
import { logger } from '@/lib/logger'

function SelectDepartmentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, signOut } = useAuth()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [departments, setDepartments] = useState<SelectableDepartment[]>([])
  const [isLoadingDepts, setIsLoadingDepts] = useState(true)

  const role = searchParams.get('role') || 'faculty'
  const next = searchParams.get('next') || searchParams.get('redirectTo') || ''

  useEffect(() => {
    let isMounted = true

    const fetchDepts = async () => {
      if (!user?.email) {
        if (!loading) router.push('/login')
        return
      }

      setIsLoadingDepts(true)
      try {
        if (role === 'peer') {
          const allocs = await peertutorsAuthService.getAllpeertutorsByEmail(user.email)
          if (isMounted) {
            const mapped: SelectableDepartment[] = allocs.map(a => ({
              id: a.id,
              name: a.dept,
              year: a.year,
              section: a.section,
              faculty_name: a.name
            }))
            setDepartments(mapped)
          }
        } else {
          const depts = await FacultyService.getAllFacultyDepartments(user.email)
          if (isMounted) {
            const mapped: SelectableDepartment[] = depts.map(d => ({
              id: d.id,
              name: d.name,
              faculty_name: d.faculty_name,
              academic_year: d.academic_year,
              semester_type: d.semester_type
            }))
            setDepartments(mapped)
          }
        }
      } catch (err) {
        logger.error('Error fetching departments for selection:', err)
      } finally {
        if (isMounted) setIsLoadingDepts(false)
      }
    }

    if (!loading) {
      fetchDepts()
    }

    return () => {
      isMounted = false
    }
  }, [user, loading, role, router])

  const handleDepartmentSelect = async (deptId: string) => {
    setIsTransitioning(true)

    try {
      if (role === 'peer') {
        const storageKey = `active_peer_tutor_id_${user?.email?.toLowerCase()}`
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(storageKey, deptId)
          localStorage.setItem('active_peer_tutor_id', deptId)
          document.cookie = `active_peer_tutor_id=${deptId}; path=/; max-age=2592000; SameSite=Lax`
        }
        router.push(next || '/peer/dashboard')
      } else {
        const storageKey = `active_faculty_dept_id_${user?.email?.toLowerCase()}`
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(storageKey, deptId)
          localStorage.setItem('active_faculty_dept_id', deptId)
          localStorage.setItem(storageKey, deptId)
        }

        // Call backend API to set active department cookie for SSR
        await fetch('/api/set-department', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ departmentId: deptId })
        })

        // Also set client-side cookie directly as backup
        document.cookie = `active_faculty_dept_id=${deptId}; path=/; max-age=2592000; SameSite=Lax`

        router.push(next || '/faculty/dashboard')
      }
    } catch (error) {
      logger.error('Error selecting department:', error)
      setIsTransitioning(false)
    }
  }

  const handleSwitchAccount = async () => {
    setIsTransitioning(true)
    try {
      await signOut()
      router.push('/login')
    } catch (error) {
      logger.error('Error switching account:', error)
      setIsTransitioning(false)
    }
  }

  if (loading || isLoadingDepts || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="relative flex flex-col items-center gap-3">
          <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full animate-pulse"></div>
          <Loader2 className="relative z-10 w-10 h-10 animate-spin text-green-600" />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Departments...</p>
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

      <DepartmentSelectionModal
        departments={departments}
        onSelect={handleDepartmentSelect}
        onSwitchAccount={handleSwitchAccount}
        isTransitioning={isTransitioning}
        title="Choose Department"
        subtitle={
          role === 'peer'
            ? 'Select which department / section you want to access'
            : 'Select your active department workspace'
        }
      />
    </div>
  )
}

export default function SelectDepartmentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="relative">
          <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full animate-pulse"></div>
          <Loader2 className="relative z-10 w-10 h-10 animate-spin text-green-600" />
        </div>
      </div>
    }>
      <SelectDepartmentContent />
    </Suspense>
  )
}
