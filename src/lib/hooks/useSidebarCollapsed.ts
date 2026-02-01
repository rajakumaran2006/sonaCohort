'use client'

import { useState, useEffect } from 'react'

/**
 * Custom hook to manage sidebar collapsed state with localStorage persistence
 * Reads from localStorage synchronously during initialization to prevent flash
 */
export function useSidebarCollapsed() {
  // Initialize state with false to match server-side rendering
  // Initialize state to false (expanded) to match server-side rendering and avoid hydration mismatch
  const [isCollapsed, setIsCollapsed] = useState(false)

  const [isInitialized, setIsInitialized] = useState(false)

  // Sync with localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed')
      if (saved !== null) {
        try {
          setIsCollapsed(JSON.parse(saved))
        } catch {
          // Ignore parse error
        }
      }
      setIsInitialized(true)
    }
  }, [])

  // Update localStorage when state changes
  useEffect(() => {
    if (typeof window !== 'undefined' && isInitialized) {
      localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed))
    }
  }, [isCollapsed, isInitialized])

  // Listen for sidebar toggle events from other components
  useEffect(() => {
    const handleSidebarToggle = (event: Event) => {
      // Check if it's a custom event with detail
      const customEvent = event as CustomEvent
      if (customEvent.detail && typeof customEvent.detail.isCollapsed === 'boolean') {
        setIsCollapsed(customEvent.detail.isCollapsed)
        return
      }

      // Handle storage event or fallback
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved !== null) {
          try {
            setIsCollapsed(JSON.parse(saved))
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    // Listen for custom events
    window.addEventListener('sidebar-toggle', handleSidebarToggle)
    
    // Listen for storage changes (for multi-tab sync)
    window.addEventListener('storage', handleSidebarToggle)

    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle)
      window.removeEventListener('storage', handleSidebarToggle)
    }
  }, [])

  return [isCollapsed, setIsCollapsed] as const
}

