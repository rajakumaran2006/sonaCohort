import React from 'react'
import { cn } from '@/lib/utils'

export interface StatCardProps {
  title: string
  value: string | number
  icon?: React.ReactNode
  description?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
}

export default function StatCard({
  title,
  value,
  icon,
  description,
  trend,
  className,
}: StatCardProps) {
  return (
    <div className={cn('bg-white rounded-lg shadow border border-gray-200 p-6', className)}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wide">
            {title}
          </p>
          <p className="text-4xl font-bold mt-2 text-gray-900">
            {value}
          </p>
          {description && (
            <p className="text-sm text-gray-500 mt-1">
              {description}
            </p>
          )}
          {trend && (
            <div className="flex items-center mt-2">
              <span
                className={cn(
                  'text-sm font-medium',
                  trend.isPositive ? 'text-green-600' : 'text-red-600'
                )}
              >
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
              <span className="text-sm text-gray-500 ml-1">vs last period</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="bg-gray-100 rounded-full p-4">
            <div className="w-8 h-8 text-gray-600">
              {icon}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
