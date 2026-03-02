'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

interface StudentSidebarContextType {
  isMobileOpen: boolean
  toggleMobileSidebar: () => void
  closeMobileSidebar: () => void
  openMobileSidebar: () => void
}

const StudentSidebarContext = createContext<StudentSidebarContextType | undefined>(undefined)

export function StudentSidebarProvider({ children }: { children: ReactNode }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const toggleMobileSidebar = () => setIsMobileOpen(prev => !prev)
  const closeMobileSidebar = () => setIsMobileOpen(false)
  const openMobileSidebar = () => setIsMobileOpen(true)

  return (
    <StudentSidebarContext.Provider value={{ isMobileOpen, toggleMobileSidebar, closeMobileSidebar, openMobileSidebar }}>
      {children}
    </StudentSidebarContext.Provider>
  )
}

export function useStudentSidebar() {
  const context = useContext(StudentSidebarContext)
  if (context === undefined) {
    throw new Error('useStudentSidebar must be used within a StudentSidebarProvider')
  }
  return context
}
