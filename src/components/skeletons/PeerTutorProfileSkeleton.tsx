import React from 'react'

export default function PeerTutorProfileSkeleton() {
  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
      {/* Sidebar Skeleton (Collapsible) */}
      <div className="hidden lg:block w-64 bg-[#1C2434] h-screen fixed"></div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64 w-full">
        {/* Header Skeleton */}
        <div className="bg-white border-b border-gray-200 h-20 px-8 flex items-center justify-between">
           <div className="space-y-2">
               <div className="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>
               <div className="h-4 w-64 bg-gray-200 rounded animate-pulse"></div>
           </div>
           <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
        </div>

        <main className="flex-1 p-6 overflow-y-auto bg-gray-50/50">
           <div className="max-w-[1600px] mx-auto w-full space-y-6">

            {/* Profile & Quick Stats Row */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Profile Card Skeleton */}
                <div className="lg:col-span-8">
                     <div className="bg-white rounded-[2rem] p-8 h-full shadow-sm border border-gray-200 animate-pulse">
                        <div className="flex flex-col sm:flex-row gap-8">
                            <div className="w-24 h-24 rounded-full bg-gray-200"></div>
                            <div className="flex-1 space-y-4">
                                <div className="h-4 w-24 bg-gray-200 rounded"></div>
                                <div className="h-8 w-64 bg-gray-200 rounded"></div>
                                <div className="flex gap-4">
                                    <div className="h-6 w-32 bg-gray-200 rounded"></div>
                                    <div className="h-6 w-32 bg-gray-200 rounded"></div>
                                    <div className="h-6 w-32 bg-gray-200 rounded"></div>
                                </div>
                            </div>
                        </div>
                     </div>
                </div>

                {/* Quick Stats Grid Skeleton */}
                <div className="lg:col-span-4 grid grid-cols-2 gap-4">
                     {[1, 2, 3, 4].map((i) => (
                         <div key={i} className="bg-white rounded-[2rem] p-5 shadow-sm border border-gray-200 h-32 flex flex-col justify-between animate-pulse">
                            <div className="h-8 w-16 bg-gray-200 rounded self-start"></div>
                            <div className="h-4 w-24 bg-gray-200 rounded mt-auto"></div>
                         </div>
                     ))}
                </div>
            </div>

            {/* Content Row Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column Skeleton */}
                <div className="bg-white rounded-[2rem] p-7 h-96 shadow-sm border border-gray-200 animate-pulse">
                     <div className="flex justify-between mb-6">
                         <div className="h-6 w-32 bg-gray-200 rounded"></div>
                         <div className="h-4 w-20 bg-gray-200 rounded"></div>
                     </div>
                     <div className="space-y-4">
                         {[1, 2, 3].map((i) => (
                             <div key={i} className="h-24 bg-gray-100 rounded-2xl"></div>
                         ))}
                     </div>
                </div>

                {/* Right Column Skeleton */}
                <div className="bg-white rounded-[2rem] p-7 h-96 shadow-sm border border-gray-200 animate-pulse">
                     <div className="flex justify-between mb-6">
                         <div className="h-6 w-40 bg-gray-200 rounded"></div>
                         <div className="h-4 w-20 bg-gray-200 rounded"></div>
                     </div>
                     <div className="space-y-3">
                         {[1, 2, 3, 4].map((i) => (
                             <div key={i} className="flex items-center gap-4 p-3">
                                 <div className="w-10 h-10 rounded-xl bg-gray-200"></div>
                                 <div className="flex-1 space-y-2">
                                     <div className="h-4 w-32 bg-gray-200 rounded"></div>
                                     <div className="h-3 w-48 bg-gray-200 rounded"></div>
                                 </div>
                             </div>
                         ))}
                     </div>
                </div>
            </div>

           </div>
        </main>
      </div>
    </div>
  )
}
