'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Custom hook to manage sidebar collapsed state with localStorage persistence.
 * Uses lazy state initialization to read localStorage synchronously,
 * preventing the expand→collapse flash on navigation.
 */
export function useSidebarCollapsed() {
  // Lazy initializer: reads localStorage synchronously on first render.
  // This runs only on the client (after hydration), so the initial server
  // render still uses false. The key insight is that useState's initializer
  // runs once per mount, avoiding the two-render flash of useEffect.
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved !== null) {
          return JSON.parse(saved)
        }
      } catch {
        // Ignore parse error
      }
    }
    return false
  })

  // Update localStorage whenever isCollapsed changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed))
    }
  }, [isCollapsed])

  // Listen for sidebar toggle events from other components
  const handleSidebarToggle = useCallback((event: Event) => {
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
  }, [])

  useEffect(() => {
    window.addEventListener('sidebar-toggle', handleSidebarToggle)
    window.addEventListener('storage', handleSidebarToggle)

    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle)
      window.removeEventListener('storage', handleSidebarToggle)
    }
  }, [handleSidebarToggle])

  return [isCollapsed, setIsCollapsed] as const
}

