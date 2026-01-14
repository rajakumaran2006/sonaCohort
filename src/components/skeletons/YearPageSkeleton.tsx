'use client'

import React from 'react'

export function YearPageSkeleton() {
  return (
    <div className="flex-1 p-8 max-w-[1600px] mx-auto w-full animate-pulse">
      {/* Breadcrumb Skeleton */}
      <nav className="flex items-center gap-2 mb-8">
        <div className="h-3 w-20 bg-gray-200 rounded"></div>
        <div className="h-3 w-3 bg-gray-200 rounded"></div>
        <div className="h-3 w-24 bg-gray-200 rounded"></div>
      </nav>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left Column: Stats & Graph */}
        <div className="xl:col-span-2 flex flex-col gap-8">
          {/* Main Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Total Peer Tutors Card Skeleton */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="h-3 w-24 bg-gray-200 rounded mb-2"></div>
                  <div className="h-8 w-16 bg-gray-200 rounded"></div>
                </div>
                <div className="p-2 border border-gray-100 rounded-lg">
                  <div className="w-4 h-4 bg-gray-200 rounded"></div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-50">
                <div className="h-2 w-28 bg-gray-200 rounded"></div>
              </div>
            </div>

            {/* Total Students Card Skeleton */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="h-3 w-24 bg-gray-200 rounded mb-2"></div>
                  <div className="h-8 w-16 bg-gray-200 rounded"></div>
                </div>
                <div className="p-2 border border-gray-100 rounded-lg">
                  <div className="w-4 h-4 bg-gray-200 rounded"></div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-50">
                <div className="h-2 w-32 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>

          {/* Graph Skeleton */}
          <div className="flex-1 min-h-[400px] bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="h-5 w-32 bg-gray-200 rounded"></div>
              <div className="flex gap-2">
                <div className="h-6 w-16 bg-gray-200 rounded"></div>
                <div className="h-6 w-16 bg-gray-200 rounded"></div>
              </div>
            </div>
            <div className="h-[320px] bg-gray-100 rounded-lg"></div>
          </div>
        </div>

        {/* Right Column: Sections List Skeleton */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="h-3 w-32 bg-gray-200 rounded"></div>
            <div className="h-6 w-16 bg-gray-200 rounded-full"></div>
          </div>
          
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-2xl bg-gray-200"></div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <div className="h-5 w-24 bg-gray-200 rounded"></div>
                      <div className="w-5 h-5 bg-gray-200 rounded"></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-100 rounded-xl p-2">
                        <div className="h-2 w-12 bg-gray-200 rounded mb-1"></div>
                        <div className="h-3 w-6 bg-gray-200 rounded"></div>
                      </div>
                      <div className="bg-gray-100 rounded-xl p-2">
                        <div className="h-2 w-12 bg-gray-200 rounded mb-1"></div>
                        <div className="h-3 w-6 bg-gray-200 rounded"></div>
                      </div>
                      <div className="bg-gray-100 rounded-xl p-2">
                        <div className="h-2 w-12 bg-gray-200 rounded mb-1"></div>
                        <div className="h-3 w-6 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default YearPageSkeleton
