'use client'

import { useState, useEffect } from 'react'

/**
 * Custom hook to manage sidebar collapsed state with localStorage persistence
 * Reads from localStorage synchronously during initialization to prevent flash
 */
export function useSidebarCollapsed() {
  // Initialize state synchronously from localStorage
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed')
      if (saved !== null) {
        try {
          return JSON.parse(saved)
        } catch (e) {
          return false
        }
      }
    }
    return false
  })

  // Update localStorage when state changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed))
    }
  }, [isCollapsed])

  // Listen for sidebar toggle events from other components
  useEffect(() => {
    const handleSidebarToggle = (event?: any) => {
      // Prefer event detail when available for instantaneous sync
      if (event && event.detail && typeof event.detail.isCollapsed === 'boolean') {
        setIsCollapsed(event.detail.isCollapsed)
        return
      }
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved !== null) {
          try {
            setIsCollapsed(JSON.parse(saved))
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    // Listen for custom events
    window.addEventListener('sidebar-toggle', handleSidebarToggle as EventListener)
    
    // Listen for storage changes (for multi-tab sync)
    window.addEventListener('storage', handleSidebarToggle)

    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle as EventListener)
      window.removeEventListener('storage', handleSidebarToggle)
    }
  }, [])

  return [isCollapsed, setIsCollapsed] as const
}

