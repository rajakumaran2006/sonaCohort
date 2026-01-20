import React from 'react'
import { TableSkeleton } from '@/components/ui/TableSkeleton'

export default function SubjectReportSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar Skeleton */}
      <div className="hidden lg:block w-64 bg-[#1C2434] h-screen fixed"></div>

      {/* Main Content */}
      <div className="flex-1 transition-all duration-300 lg:ml-64 overflow-y-auto">
        {/* Header Skeleton */}
        <div className="bg-white shadow-sm border-b border-gray-200 h-20 px-8 flex items-center justify-between">
           <div className="space-y-2">
               <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
               <div className="h-6 w-64 bg-gray-200 rounded animate-pulse"></div>
           </div>
        </div>

        <main className="py-6 px-8 space-y-6">
            {/* Stats Overview Skeleton */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-3">
                 {[1, 2, 3].map((i) => (
                     <div key={i} className="bg-white overflow-hidden shadow rounded-lg p-5 animate-pulse">
                         <div className="flex items-center">
                             <div className="flex-shrink-0">
                                 <div className="w-8 h-8 bg-gray-200 rounded-md"></div>
                             </div>
                             <div className="ml-5 w-0 flex-1 space-y-2">
                                 <div className="h-4 w-24 bg-gray-200 rounded"></div>
                                 <div className="h-6 w-12 bg-gray-200 rounded"></div>
                             </div>
                         </div>
                     </div>
                 ))}
            </div>

            {/* Table Skeleton */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <div className="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <TableSkeleton />
            </div>
        </main>
      </div>
    </div>
  )
}
