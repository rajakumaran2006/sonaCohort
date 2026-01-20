import React from 'react'

export function FacultyDashboardSkeleton() {
  return (
    <div className="flex h-full w-full flex-col">
      {/* Header Skeleton */}
      <div className="bg-white shadow-sm border-b border-gray-200 h-16 w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
         <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
         <div className="flex items-center gap-2">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse hidden sm:block"></div>
            <div className="h-9 w-24 bg-gray-200 rounded animate-pulse"></div>
         </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
          
          {/* --- LEFT COLUMN --- */}
          <div className="lg:col-span-4 md:contents lg:block space-y-6">
            
            {/* Update Card Skeleton */}
            <div className="bg-white rounded-2xl p-6 h-48 border border-gray-200 animate-pulse relative overflow-hidden md:col-span-2 lg:col-span-auto">
               <div className="h-4 w-24 bg-gray-200 rounded mb-4"></div>
               <div className="h-3 w-32 bg-gray-200 rounded mb-6"></div>
               <div className="h-8 w-48 bg-gray-200 rounded mb-2"></div>
               <div className="h-8 w-32 bg-gray-200 rounded"></div>
            </div>

            {/* Recent Sessions Skeleton */}
            <div className="bg-white rounded-2xl border border-gray-200 h-64 animate-pulse md:col-span-2 lg:col-span-auto">
               <div className="p-4 border-b border-gray-100 flex justify-between">
                  <div className="h-6 w-32 bg-gray-200 rounded"></div>
               </div>
               <div className="p-4 space-y-4">
                  {[1, 2, 3].map((i) => (
                     <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                           <div className="h-12 w-12 rounded-full bg-gray-200"></div>
                           <div>
                              <div className="h-4 w-24 bg-gray-200 rounded mb-2"></div>
                              <div className="h-3 w-16 bg-gray-200 rounded"></div>
                           </div>
                        </div>
                        <div className="h-3 w-12 bg-gray-200 rounded"></div>
                     </div>
                  ))}
               </div>
            </div>

            {/* Additional Classes Skeleton */}
            <div className="bg-white rounded-2xl border border-gray-200 h-40 animate-pulse md:col-span-2 lg:col-span-auto p-6">
                <div className="h-6 w-40 bg-gray-200 rounded mb-6"></div>
                <div className="flex justify-between items-end">
                   <div className="h-10 w-16 bg-gray-200 rounded"></div>
                   <div className="flex gap-2">
                      <div className="h-8 w-6 bg-gray-200 rounded-t"></div>
                      <div className="h-12 w-6 bg-gray-200 rounded-t"></div>
                      <div className="h-6 w-6 bg-gray-200 rounded-t"></div>
                   </div>
                </div>
            </div>

          </div>

          {/* --- MIDDLE COLUMN --- */}
          <div className="lg:col-span-5 md:contents lg:block space-y-6">
             
             {/* Stats Row Skeleton */}
             <div className="grid grid-cols-2 gap-4 md:col-span-2 lg:col-span-auto">
                <div className="bg-white rounded-2xl border border-gray-200 p-4 h-32 animate-pulse">
                   <div className="h-4 w-24 bg-gray-200 rounded mb-4"></div>
                   <div className="h-8 w-16 bg-gray-200 rounded mb-2"></div>
                   <div className="h-3 w-20 bg-gray-200 rounded"></div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 p-4 h-32 animate-pulse">
                   <div className="h-4 w-24 bg-gray-200 rounded mb-4"></div>
                   <div className="h-8 w-16 bg-gray-200 rounded mb-2"></div>
                   <div className="h-3 w-20 bg-gray-200 rounded"></div>
                </div>
             </div>

             {/* Year Overview Skeleton */}
             <div className="bg-white rounded-2xl border border-gray-200 h-64 animate-pulse md:col-span-2 lg:col-span-auto p-6">
                <div className="flex justify-between mb-6">
                   <div className="h-6 w-32 bg-gray-200 rounded"></div>
                   <div className="h-6 w-6 bg-gray-200 rounded"></div>
                </div>
                <div className="space-y-6">
                   {[1, 2, 3].map((i) => (
                      <div key={i}>
                         <div className="flex justify-between mb-2">
                            <div className="h-4 w-16 bg-gray-200 rounded"></div>
                            <div className="h-3 w-12 bg-gray-200 rounded"></div>
                         </div>
                         <div className="h-3 w-full bg-gray-200 rounded"></div>
                      </div>
                   ))}
                </div>
             </div>

             {/* Weekly Activity Skeleton */}
             <div className="bg-white rounded-2xl border border-gray-200 h-64 animate-pulse md:col-span-1 lg:col-span-auto p-6">
                <div className="flex justify-between mb-6">
                   <div className="h-6 w-32 bg-gray-200 rounded"></div>
                   <div className="h-8 w-12 bg-gray-200 rounded"></div>
                </div>
                <div className="h-32 bg-gray-200 rounded w-full"></div>
             </div>

          </div>

          {/* --- RIGHT COLUMN --- */}
          <div className="lg:col-span-3 md:contents lg:block space-y-6">
             
             {/* Class Status Pie Chart Skeleton */}
             <div className="bg-white rounded-2xl border border-gray-200 h-64 animate-pulse md:col-span-1 lg:col-span-auto p-6 flex flex-col items-center">
                <div className="w-full h-6 bg-gray-200 rounded mb-4"></div>
                <div className="h-32 w-32 rounded-full bg-gray-200 mb-4"></div>
                <div className="h-4 w-40 bg-gray-200 rounded"></div>
             </div>
             
             {/* Guide Buttons Skeleton */}
             <div className="bg-white rounded-2xl border border-gray-200 h-40 animate-pulse md:col-span-1 lg:col-span-auto p-6 space-y-4">
                <div className="h-10 w-full bg-gray-200 rounded"></div>
                <div className="h-10 w-full bg-gray-200 rounded"></div>
             </div>

             {/* Promo Card Skeleton */}
             <div className="bg-gray-200 rounded-2xl h-48 animate-pulse md:col-span-1 lg:col-span-auto"></div>

          </div>

        </div>
      </div>
    </div>
  )
}
