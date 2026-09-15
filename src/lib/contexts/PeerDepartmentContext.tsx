'use client'

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { peertutors } from '@/lib/services/peerTutorService'

interface PeerDepartmentContextType {
  activePeerTutor: peertutors | null
  allocations: peertutors[]
  selectDepartment: (tutorId: string) => void
  isLoading: boolean
}

const PeerDepartmentContext = createContext<PeerDepartmentContextType>({
  activePeerTutor: null,
  allocations: [],
  selectDepartment: () => {},
  isLoading: true,
})

export function PeerDepartmentProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [selectedTutorId, setSelectedTutorId] = useState<string | null>(null)

  // Fetch all allocations for the peer tutor email
  const { data: allocations = [], isLoading } = useQuery({
    queryKey: ['peer-tutor-allocations', user?.email],
    queryFn: async () => {
      if (!user?.email) return []
      return await peertutorsAuthService.getAllpeertutorsByEmail(user.email)
    },
    enabled: !!user?.email,
    staleTime: 10 * 60 * 1000,
  })

  // Restore saved active department from sessionStorage or fallback to first allocation
  useEffect(() => {
    if (!user?.email || allocations.length === 0) return

    const storageKey = `active_peer_tutor_id_${user.email.toLowerCase()}`
    const savedId = typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) : null

    if (savedId && allocations.some(a => a.id === savedId)) {
      setSelectedTutorId(savedId)
    } else {
      setSelectedTutorId(allocations[0].id)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(storageKey, allocations[0].id)
      }
    }
  }, [user?.email, allocations])

  const selectDepartment = useCallback((tutorId: string) => {
    const target = allocations.find(a => a.id === tutorId)
    if (!target) return

    setSelectedTutorId(tutorId)
    if (user?.email && typeof window !== 'undefined') {
      const storageKey = `active_peer_tutor_id_${user.email.toLowerCase()}`
      sessionStorage.setItem(storageKey, tutorId)
    }
  }, [allocations, user?.email])

  const activePeerTutor = useMemo(() => {
    if (!selectedTutorId) return allocations[0] || null
    return allocations.find(a => a.id === selectedTutorId) || allocations[0] || null
  }, [allocations, selectedTutorId])

  const value = useMemo(() => ({
    activePeerTutor,
    allocations,
    selectDepartment,
    isLoading,
  }), [activePeerTutor, allocations, selectDepartment, isLoading])

  return (
    <PeerDepartmentContext.Provider value={value}>
      {children}
    </PeerDepartmentContext.Provider>
  )
}

export function usePeerDepartment() {
  const context = useContext(PeerDepartmentContext)
  if (!context) {
    throw new Error('usePeerDepartment must be used within a PeerDepartmentProvider')
  }
  return context
}
