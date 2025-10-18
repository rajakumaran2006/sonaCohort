import React from 'react'
import { cn } from '@/lib/utils'

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const spinnerSizes = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
}

export default function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-b-2 border-blue-600',
        spinnerSizes[size],
        className
      )}
    />
  )
}

export interface LoadingOverlayProps {
  children?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function LoadingOverlay({ children, size = 'lg', className }: LoadingOverlayProps) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className="text-center">
        <LoadingSpinner size={size} className="mx-auto mb-4" />
        {children && (
          <p className="text-gray-600">{children}</p>
        )}
      </div>
    </div>
  )
}
