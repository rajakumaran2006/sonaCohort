import React from 'react'
// import { Skeleton } from "@/components/ui/skeleton"

export function AssignTabSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm relative overflow-hidden">
             <div className="flex justify-between items-center mb-4">
                <div className="h-3 w-24 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-5 w-5 bg-gray-200 rounded-full animate-pulse"></div>
             </div>
             <div className="h-8 w-16 bg-gray-200 rounded mb-4 animate-pulse"></div>
             <div className="h-3 w-20 bg-gray-200 rounded animate-pulse"></div>
          </div>
        ))}
      </div>

      {/* Manual Assignment Section Skeleton */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row gap-4">
           <div className="flex-1 space-y-2">
              <div className="h-3 w-32 bg-gray-100 rounded animate-pulse"></div>
              <div className="h-10 w-full bg-gray-100 rounded animate-pulse"></div>
           </div>
           <div className="flex-1 space-y-2">
              <div className="h-3 w-32 bg-gray-100 rounded animate-pulse"></div>
              <div className="h-10 w-full bg-gray-100 rounded animate-pulse"></div>
           </div>
           <div className="sm:self-end">
              <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
           </div>
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
           <div className="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>
           <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse"></div>
        </div>
        <div className="p-0">
          <div className="border-b border-gray-100 bg-gray-50 px-6 py-3 grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-4 bg-gray-200 rounded animate-pulse"></div>)}
          </div>
          <div className="divide-y divide-gray-100">
             {[1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="px-6 py-4 grid grid-cols-4 gap-4 items-center">
                   <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-200 animate-pulse"></div>
                      <div className="space-y-2">
                         <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                      </div>
                   </div>
                   <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
                   <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse"></div>
                      <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                   </div>
                   <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
                </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  )
}
