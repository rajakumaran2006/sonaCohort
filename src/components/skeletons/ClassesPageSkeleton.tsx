import React from 'react'
import { TableSkeleton } from '@/components/ui/TableSkeleton'

export default function ClassesPageSkeleton() {
  return (
    <div className="flex flex-col h-full w-full bg-gray-50">
          {/* Stats Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
                      <div className="flex items-center">
                          <div className="flex-shrink-0">
                              <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                          </div>
                          <div className="ml-4 flex-1">
                              <div className="h-4 w-24 bg-gray-200 rounded mb-2"></div>
                              <div className="h-8 w-12 bg-gray-200 rounded"></div>
                          </div>
                      </div>
                  </div>
              ))}
          </div>

          {/* Main Content Skeleton (Table) */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
               <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                   <div className="h-6 w-64 bg-gray-200 rounded animate-pulse"></div>
                   <div className="h-9 w-32 bg-gray-200 rounded animate-pulse"></div>
               </div>
               
               {/* Filters Skeleton */}
               <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex gap-4">
                    <div className="h-10 flex-1 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-10 flex-1 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-10 flex-1 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-10 flex-1 bg-gray-200 rounded animate-pulse"></div>
                  </div>
               </div>

               <TableSkeleton />
          </div>
    </div>
  )
}
