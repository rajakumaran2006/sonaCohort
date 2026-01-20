import React from 'react'

export function AdminAnalyticsSkeleton() {
  return (
    <div className="flex h-full w-full flex-col">
      {/* Header Skeleton */}
      <div className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200/50 h-20 w-full px-6 flex items-center justify-between">
         <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
      </div>

      {/* Main Content Skeleton */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Stats Row Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
             {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-[2rem] p-6 h-40 border border-gray-100 animate-pulse flex flex-col justify-between">
                   <div className="flex justify-between items-start">
                      <div className="h-4 w-32 bg-gray-200 rounded"></div>
                      <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                   </div>
                   <div className="h-10 w-20 bg-gray-200 rounded"></div>
                </div>
             ))}
          </div>

          {/* Table Card Skeleton */}
          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-7 animate-pulse">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div className="h-6 w-48 bg-gray-200 rounded"></div>
                <div className="h-10 w-32 bg-gray-200 rounded-lg"></div>
             </div>
             
             {/* Filters Skeleton */}
             <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                {[1, 2, 3, 4, 5].map((i) => (
                   <div key={i} className="h-10 bg-gray-200 rounded-lg"></div>
                ))}
             </div>

             {/* Table Rows */}
             <div className="space-y-4">
                {/* Header */}
                <div className="grid grid-cols-6 gap-4 mb-4 border-b border-gray-100 pb-4">
                   {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="h-4 bg-gray-200 rounded w-full opacity-60"></div>
                   ))}
                </div>
                {/* Rows */}
                {[1, 2, 3, 4, 5, 6].map((row) => (
                   <div key={row} className="grid grid-cols-6 gap-4 py-3">
                      {[1, 2, 3, 4, 5, 6].map((col) => (
                         <div key={col} className="h-4 bg-gray-200 rounded w-full opacity-40"></div>
                      ))}
                   </div>
                ))}
             </div>
          </div>

        </div>
      </div>
    </div>
  )
}
