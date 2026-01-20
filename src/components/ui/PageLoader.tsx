'use client'

import React from 'react'

interface PageLoaderProps {
  message?: string
}

/**
 * Unified page loading component with centered spinner
 * Matches Apple-style loading experience
 */
export function PageLoader({ message = "Loading..." }: PageLoaderProps) {
  return (
    <main className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">{message}</p>
      </div>
    </main>
  )
}

export default PageLoader
