import React from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

const defaultIcon = (
  <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

export default function EmptyState({
  icon = defaultIcon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('text-center py-12', className)}>
      <div className="mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-gray-500 mb-6">
          {description}
        </p>
      )}
      {action && (
        <div>
          {action}
        </div>
      )}
    </div>
  )
}
