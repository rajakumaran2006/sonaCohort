'use client'

import React from 'react'
import { Menu, RotateCw } from 'lucide-react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  lastRefresh?: Date
  onRefresh?: () => void | Promise<void>
  isRefreshing?: boolean
  showRefresh?: boolean
  children?: React.ReactNode
  isSidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}

export default function PageHeader({
  title,
  subtitle,
  lastRefresh,
  onRefresh,
  isRefreshing = false,
  showRefresh = true,
  children,
  isSidebarCollapsed = false,
  onToggleSidebar,
}: PageHeaderProps) {
  return (
    <header className="bg-white shadow-md w-full">
      <div className={`flex items-center justify-between w-full h-16 ${isSidebarCollapsed ? 'px-4 sm:px-6 lg:pr-8 lg:pl-6' : 'px-4 sm:px-6 lg:px-8'}`}>
        <div className="flex items-center flex-1">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="lg:hidden p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 mr-2"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
            {subtitle && (
              <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {children}
          
          {showRefresh && onRefresh && (
            <>
              {lastRefresh && (
                <div className="text-sm text-gray-500 hidden sm:block">
                  Last updated: {lastRefresh.toLocaleTimeString()}
                </div>
              )}
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Refresh data"
              >
                <RotateCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

