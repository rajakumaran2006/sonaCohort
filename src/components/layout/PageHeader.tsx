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
  onRefresh,
  isRefreshing = false,
  showRefresh = true,
  onToggleSidebar,
  children,
}: PageHeaderProps) {
  // Use tagline if provided, otherwise fall back to subtitle for backward compatibility
  const displayTagline = tagline || subtitle

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 min-h-[5rem] h-auto py-2 flex items-center px-4 lg:px-8 transition-all duration-300">
      <div className="flex flex-row justify-between items-center w-full">
        <div>
          <div className="flex items-center gap-3">
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="lg:hidden p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 relative items-center justify-center flex -ml-2 mr-1"
              >
                <Menu className="w-6 h-6" />
              </button>
            )}
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
            <p className="hidden md:block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">
              {displayTagline}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 w-auto">
          {showRefresh && onRefresh && (
            <div className="flex flex-col items-end">
              <AnimatedRefreshButton 
                onRefresh={onRefresh}
                isRefreshing={isRefreshing}
              />
            </div>
          )}
          {children}
        </div>
      </div>
    </header>
  )
}

