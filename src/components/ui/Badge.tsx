import React from 'react'
import { cn } from '@/lib/utils'
import { statusColors } from '@/lib/theme'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

const badgeVariants = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
}

const badgeSizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
}

export default function Badge({
  variant = 'default',
  size = 'md',
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        badgeVariants[variant],
        badgeSizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

// Status-specific badge component
export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: 'pending' | 'approved' | 'rejected' | 'submitted' | 'active' | 'inactive'
}

export function StatusBadge({ status, className, children, ...props }: StatusBadgeProps) {
  const statusConfig = statusColors[status]
  
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium px-2.5 py-0.5 text-xs',
        statusConfig.bg,
        statusConfig.text,
        className
      )}
      {...props}
    >
      {children || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
