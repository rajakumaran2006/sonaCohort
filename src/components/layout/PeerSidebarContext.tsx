'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

interface PeerSidebarContextType {
  isMobileOpen: boolean
  toggleMobileSidebar: () => void
  closeMobileSidebar: () => void
  openMobileSidebar: () => void
}

const PeerSidebarContext = createContext<PeerSidebarContextType | undefined>(undefined)

export function PeerSidebarProvider({ children }: { children: ReactNode }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const toggleMobileSidebar = () => setIsMobileOpen(prev => !prev)
  const closeMobileSidebar = () => setIsMobileOpen(false)
  const openMobileSidebar = () => setIsMobileOpen(true)

  return (
    <PeerSidebarContext.Provider value={{ isMobileOpen, toggleMobileSidebar, closeMobileSidebar, openMobileSidebar }}>
      {children}
    </PeerSidebarContext.Provider>
  )
}

export function usePeerSidebar() {
  const context = useContext(PeerSidebarContext)
  if (context === undefined) {
    throw new Error('usePeerSidebar must be used within a PeerSidebarProvider')
  }
  return context
}
