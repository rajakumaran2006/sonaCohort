import React from 'react'

import { TableSkeleton } from '@/components/ui/TableSkeleton'

export function SectionPageSkeleton() {
  return (
    <div className="flex flex-col h-full w-full">
       {/* Header Skeleton */}
       <div className="bg-white shadow-sm border-b border-gray-200 h-16 w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
             {/* Breadcrumbs mock */}
             <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
             <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
             <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="flex items-center space-x-3">
             <div className="h-9 w-24 bg-gray-200 rounded-md animate-pulse"></div>
             <div className="h-9 w-20 bg-gray-200 rounded-md animate-pulse"></div>
          </div>
       </div>

       <div className="flex-1 max-w-full mx-auto w-full py-6 px-4 sm:px-6 lg:px-8">
           {/* Navigation Tabs Skeleton */}
           <div className="flex space-x-4 mb-6 border-b border-gray-200 pb-1 overflow-x-auto">
              {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-8 w-24 bg-gray-200 rounded animate-pulse"></div>
              ))}
           </div>

           {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 h-32 animate-pulse">
                        <div className="flex justify-between items-start mb-4">
                            <div className="h-3 w-24 bg-gray-200 rounded"></div>
                            <div className="h-4 w-4 bg-gray-200 rounded"></div>
                        </div>
                        <div className="h-8 w-16 bg-gray-200 rounded mb-2"></div>
                        <div className="h-3 w-20 bg-gray-200 rounded"></div>
                    </div>
                ))}
            </div>

            {/* Main Content Skeleton (Table) */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                 <div className="flex justify-between items-center mb-4">
                     <div className="flex gap-2">
                        <div className="h-10 w-64 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-10 w-10 bg-gray-200 rounded animate-pulse"></div>
                     </div>
                     <div className="flex gap-2">
                        <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
                     </div>
                 </div>
                 <TableSkeleton />
            </div>
       </div>
    </div>
  )
}
