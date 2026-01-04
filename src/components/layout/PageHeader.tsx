'use client'

import React from 'react'
import { Menu } from 'lucide-react'
import { AnimatedRefreshButton } from '../ui/AnimatedRefreshButton'

interface PageHeaderProps {
  title: string
  context?: string
  tagline?: string
  subtitle?: string // Deprecated, use tagline instead
  lastRefresh?: Date
  onRefresh?: () => void | Promise<void>
  isRefreshing?: boolean
  showRefresh?: boolean
  onToggleSidebar?: () => void
  isSidebarCollapsed?: boolean
  children?: React.ReactNode
}

export default function PageHeader({
  title,
  context,
  tagline,
  subtitle, // Deprecated
  lastRefresh,
  onRefresh,
  isRefreshing = false,
  showRefresh = true,
  onToggleSidebar,
  // isSidebarCollapsed, - keeping as comment or remove line? The interface has it but it is unused. I should remove from destructuring.
  children,
}: PageHeaderProps) {
  // Use tagline if provided, otherwise fall back to subtitle for backward compatibility
  const displayTagline = tagline || subtitle

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 h-20 flex items-center px-8">
      <div className="flex justify-between items-center w-full">
        <div>
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="lg:hidden p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 mr-2 absolute left-2"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">
              {title}
              {context && (
                <>
                  <span className="text-gray-300 mx-2">/</span>
                  {context}
                </>
              )}
            </h1>
          </div>
          {displayTagline && (
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">
              {displayTagline}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          {children}
          {showRefresh && onRefresh && (
            <div className="flex flex-col items-end">
              <AnimatedRefreshButton 
                onRefresh={onRefresh}
                isRefreshing={isRefreshing}
              />
              {lastRefresh && (
                <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-1 whitespace-nowrap">
                  Last updated: {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

