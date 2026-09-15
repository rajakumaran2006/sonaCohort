'use client'

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FacultyService, FacultyDepartment } from '@/lib/services/facultyService'

interface FacultyDepartmentContextType {
  activeDepartment: FacultyDepartment | null
  departments: FacultyDepartment[]
  selectDepartment: (deptId: string) => void
  refetchDepartments: () => void
  isLoading: boolean
}

const FacultyDepartmentContext = createContext<FacultyDepartmentContextType>({
  activeDepartment: null,
  departments: [],
  selectDepartment: () => {},
  refetchDepartments: () => {},
  isLoading: true,
})

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null
  return null
}

export function FacultyDepartmentProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)

  // Fetch all departments managed by the faculty email
  const { data: departments = [], isLoading, refetch } = useQuery({
    queryKey: ['faculty-all-departments', user?.email],
    queryFn: async () => {
      if (!user?.email) return []
      return await FacultyService.getAllFacultyDepartments(user.email)
    },
    enabled: !!user?.email,
    staleTime: 5 * 60 * 1000,
  })

  const refetchDepartments = useCallback(() => {
    refetch()
  }, [refetch])

  // Restore saved active department from cookie, localStorage, sessionStorage or fallback to first department
  useEffect(() => {
    if (!user?.email || departments.length === 0) return

    const storageKey = `active_faculty_dept_id_${user.email.toLowerCase()}`
    
    let savedId: string | null = null
    if (typeof window !== 'undefined') {
      savedId = getCookie('active_faculty_dept_id') ||
        sessionStorage.getItem(storageKey) || 
        localStorage.getItem(storageKey) ||
        localStorage.getItem('active_faculty_dept_id')
    }

    if (savedId && departments.some(d => d.id === savedId)) {
      setSelectedDeptId(savedId)
    } else {
      const firstDeptId = departments[0]?.id || null
      setSelectedDeptId(firstDeptId)
      if (typeof window !== 'undefined' && firstDeptId) {
        sessionStorage.setItem(storageKey, firstDeptId)
        localStorage.setItem(storageKey, firstDeptId)
        localStorage.setItem('active_faculty_dept_id', firstDeptId)
        document.cookie = `active_faculty_dept_id=${firstDeptId}; path=/; max-age=2592000; SameSite=Lax`
      }
    }
  }, [user?.email, departments])

  const selectDepartment = useCallback((deptId: string) => {
    const target = departments.find(d => d.id === deptId)
    if (!target) return

    setSelectedDeptId(deptId)

    if (typeof window !== 'undefined') {
      const storageKey = user?.email ? `active_faculty_dept_id_${user.email.toLowerCase()}` : 'active_faculty_dept_id'
      sessionStorage.setItem(storageKey, deptId)
      localStorage.setItem(storageKey, deptId)
      localStorage.setItem('active_faculty_dept_id', deptId)
      document.cookie = `active_faculty_dept_id=${deptId}; path=/; max-age=2592000; SameSite=Lax`

      // Call server endpoint to update cookie for SSR
      fetch('/api/set-department', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentId: deptId })
      }).catch(err => console.error('Failed to set department on server:', err))

      // Broadcast custom event for immediate UI notification
      window.dispatchEvent(new CustomEvent('faculty-department-changed', { detail: { department: target } }))
    }

    // Immediately invalidate React Query caches to refetch all department data
    queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
    queryClient.invalidateQueries({ queryKey: ['all-classes'] })
    queryClient.invalidateQueries({ queryKey: ['scheduled-class-counts'] })
    queryClient.invalidateQueries({ queryKey: ['faculty-department'] })
    queryClient.invalidateQueries({ queryKey: ['peer-tutors'] })
    queryClient.invalidateQueries({ queryKey: ['students'] })
  }, [departments, user?.email, queryClient])

  const activeDepartment = useMemo(() => {
    if (!selectedDeptId) return departments[0] || null
    return departments.find(d => d.id === selectedDeptId) || departments[0] || null
  }, [departments, selectedDeptId])

  const value = useMemo(() => ({
    activeDepartment,
    departments,
    selectDepartment,
    refetchDepartments,
    isLoading,
  }), [activeDepartment, departments, selectDepartment, refetchDepartments, isLoading])

  return (
    <FacultyDepartmentContext.Provider value={value}>
      {children}
    </FacultyDepartmentContext.Provider>
  )
}

export function useFacultyDepartment() {
  const context = useContext(FacultyDepartmentContext)
  if (!context) {
    throw new Error('useFacultyDepartment must be used within a FacultyDepartmentProvider')
  }
  return context
}
