'use client'

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { StudentService, StudentWithpeertutors } from '@/lib/services/studentService'

interface StudentDepartmentContextType {
  activeStudent: StudentWithpeertutors | null
  allocations: StudentWithpeertutors[]
  selectDepartment: (studentId: string) => void
  isLoading: boolean
}

const StudentDepartmentContext = createContext<StudentDepartmentContextType>({
  activeStudent: null,
  allocations: [],
  selectDepartment: () => {},
  isLoading: true,
})

export function StudentDepartmentProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  // Fetch all allocations for the student email
  const { data: allocations = [], isLoading } = useQuery({
    queryKey: ['student-allocations', user?.email],
    queryFn: async () => {
      if (!user?.email) return []
      return await StudentService.getAllStudentAllocationsByEmail(user.email)
    },
    enabled: !!user?.email,
    staleTime: 10 * 60 * 1000,
  })

  // Restore saved active department from sessionStorage or fallback to first allocation
  useEffect(() => {
    if (!user?.email || allocations.length === 0) return

    const storageKey = `active_student_id_${user.email.toLowerCase()}`
    const savedId = typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) : null

    if (savedId && allocations.some(a => a.id === savedId)) {
      setSelectedStudentId(savedId)
    } else {
      setSelectedStudentId(allocations[0].id)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(storageKey, allocations[0].id)
      }
    }
  }, [user?.email, allocations])

  const selectDepartment = useCallback((studentId: string) => {
    const target = allocations.find(a => a.id === studentId)
    if (!target) return

    setSelectedStudentId(studentId)
    if (user?.email && typeof window !== 'undefined') {
      const storageKey = `active_student_id_${user.email.toLowerCase()}`
      sessionStorage.setItem(storageKey, studentId)
    }
  }, [allocations, user?.email])

  const activeStudent = useMemo(() => {
    if (!selectedStudentId) return allocations[0] || null
    return allocations.find(a => a.id === selectedStudentId) || allocations[0] || null
  }, [allocations, selectedStudentId])

  const value = useMemo(() => ({
    activeStudent,
    allocations,
    selectDepartment,
    isLoading,
  }), [activeStudent, allocations, selectDepartment, isLoading])

  return (
    <StudentDepartmentContext.Provider value={value}>
      {children}
    </StudentDepartmentContext.Provider>
  )
}

export function useStudentDepartment() {
  const context = useContext(StudentDepartmentContext)
  if (!context) {
    throw new Error('useStudentDepartment must be used within a StudentDepartmentProvider')
  }
  return context
}
