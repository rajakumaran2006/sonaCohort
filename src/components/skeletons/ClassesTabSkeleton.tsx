import React from 'react'

export function ClassesTabSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Controls Header Skeleton */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200">
         <div className="flex items-center gap-4">
             <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
             <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
         </div>
         <div className="flex items-center gap-3 w-full xl:w-auto">
             <div className="h-10 w-full xl:w-64 bg-gray-200 rounded animate-pulse"></div>
             <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
             <div className="h-10 w-10 bg-gray-200 rounded animate-pulse"></div>
         </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-0">
          {/* Header */}
          <div className="border-b border-gray-100 bg-gray-50 px-6 py-3 grid grid-cols-6 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-4 bg-gray-200 rounded animate-pulse"></div>)}
          </div>
          {/* Rows */}
          <div className="divide-y divide-gray-100">
             {[1, 2, 3, 4, 5, 6].map((row) => (
                <div key={row} className="px-6 py-4 grid grid-cols-6 gap-4 items-center">
                   <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                   <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
                   <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                   <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                   <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
                   <div className="h-8 w-8 bg-gray-200 rounded animate-pulse justify-self-end"></div>
                </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  )
}
