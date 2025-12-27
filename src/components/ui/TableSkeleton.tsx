import React from 'react'

export function TableSkeleton() {
  return (
    <div className="animate-pulse w-full">
      {/* Mobile Card View Skeleton */}
      <div className="block lg:hidden space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-100 h-20 w-full border-b border-gray-200" />
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                 <div className="h-16 bg-gray-100 rounded-lg"></div>
                 <div className="h-16 bg-gray-100 rounded-lg"></div>
                 <div className="h-16 bg-gray-100 rounded-lg"></div>
                 <div className="h-16 bg-gray-100 rounded-lg"></div>
              </div>
              <div className="h-10 bg-gray-100 rounded-md w-full mt-4" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View Skeleton */}
      <div className="hidden lg:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Header Skeleton */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-between">
             <div className="h-4 bg-gray-200 rounded w-32"></div>
             <div className="flex gap-4">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
                <div className="h-4 bg-gray-200 rounded w-24"></div>
                <div className="h-4 bg-gray-200 rounded w-24"></div>
             </div>
        </div>
        
        {/* Rows Skeleton */}
        <div className="divide-y divide-gray-200">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-4 w-1/4">
                <div className="h-10 w-10 rounded-full bg-gray-200 flex-shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
              <div className="h-4 bg-gray-200 rounded w-16" />
              <div className="h-4 bg-gray-200 rounded w-16" />
              <div className="h-4 bg-gray-200 rounded w-16" />
              <div className="h-4 bg-gray-200 rounded w-16" />
              <div className="h-4 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
