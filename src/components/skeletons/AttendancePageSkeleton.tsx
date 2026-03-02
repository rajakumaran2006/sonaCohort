import React from 'react'
import { TableSkeleton } from '@/components/ui/TableSkeleton'

export default function AttendancePageSkeleton() {
  return (
    <div className="w-full">
      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <div className="h-2.5 w-24 bg-gray-100 rounded mb-3"></div>
                <div className="h-8 w-12 bg-gray-200 rounded"></div>
              </div>
              <div className="p-2 border border-gray-50 rounded-lg">
                <div className="w-4 h-4 bg-gray-100 rounded-lg"></div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-50">
              <div className="h-2 w-20 bg-gray-50 rounded"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Skeleton (Table) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
          <div className="h-5 w-48 bg-gray-100 rounded animate-pulse"></div>
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 w-32 bg-gray-50 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
        <TableSkeleton />
      </div>
    </div>
  )
}
