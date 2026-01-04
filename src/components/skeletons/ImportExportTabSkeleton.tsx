import React from 'react'

export default function ImportExportTabSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Analytics Overview Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <div className="h-3 w-16 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="h-8 w-12 bg-gray-200 rounded animate-pulse mb-4"></div>
            <div className="flex items-center">
              <div className="h-3 w-3 bg-gray-200 rounded animate-pulse mr-1.5"></div>
              <div className="h-3 w-10 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs Skeleton */}
      <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
        <div className="h-9 w-24 bg-white rounded-lg shadow-sm animate-pulse"></div>
        <div className="h-9 w-24 bg-transparent rounded-lg animate-pulse"></div>
        <div className="h-9 w-24 bg-transparent rounded-lg animate-pulse"></div>
      </div>

      <div>
        <div className="mb-6">
          <div className="flex items-center mb-2">
            <div className="h-6 w-6 bg-gray-200 rounded animate-pulse mr-2"></div>
            <div className="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="h-4 w-64 bg-gray-200 rounded animate-pulse"></div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
             <div className="h-40 bg-gray-100 rounded-lg animate-pulse"></div>
          </div>
          
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
             <div className="h-40 bg-gray-100 rounded-lg animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  )
}
