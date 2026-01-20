import React from 'react'

export default function ClassDetailsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Topic Area */}
      <div>
        <div className="flex justify-between items-end mb-2">
          <div className="h-5 w-48 bg-gray-200 rounded"></div>
          <div className="h-4 w-20 bg-gray-200 rounded"></div>
        </div>
        <div className="w-full h-32 sm:h-40 bg-gray-100 rounded-xl sm:rounded-2xl border border-gray-100"></div>
      </div>

      {/* Time Inputs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div>
          <div className="h-4 w-20 bg-gray-200 rounded mb-2"></div>
          <div className="w-full h-12 bg-gray-100 rounded-xl sm:rounded-2xl border border-gray-100"></div>
        </div>
        <div>
          <div className="h-4 w-20 bg-gray-200 rounded mb-2"></div>
          <div className="w-full h-12 bg-gray-100 rounded-xl sm:rounded-2xl border border-gray-100"></div>
        </div>
      </div>

      {/* Link Input */}
      <div>
        <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
        <div className="w-full h-12 bg-gray-100 rounded-xl sm:rounded-2xl border border-gray-100"></div>
      </div>

      {/* Button */}
      <div className="flex justify-end pt-3 sm:pt-4">
        <div className="h-12 w-32 bg-gray-200 rounded-xl sm:rounded-2xl"></div>
      </div>
    </div>
  )
}
