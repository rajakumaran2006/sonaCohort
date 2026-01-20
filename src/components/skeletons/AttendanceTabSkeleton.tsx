import React from 'react'

export default function AttendanceTabSkeleton() {
  return (
    <div className="space-y-6">
      {/* Table Skeleton */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-6 py-4 text-left w-[40%]">
                  <div className="h-3 w-24 bg-gray-200 rounded animate-pulse"></div>
                </th>
                <th className="px-6 py-4 text-center w-[25%]">
                  <div className="h-3 w-32 bg-gray-200 rounded animate-pulse mx-auto"></div>
                </th>
                <th className="px-6 py-4 text-center w-[25%]">
                  <div className="h-3 w-32 bg-gray-200 rounded animate-pulse mx-auto"></div>
                </th>
                <th className="px-6 py-4 text-center w-[10%]"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse mr-3"></div>
                      <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="h-5 w-8 bg-gray-200 rounded-full animate-pulse mx-auto"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="h-4 w-12 bg-gray-200 rounded animate-pulse mx-auto"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="h-5 w-5 bg-gray-200 rounded animate-pulse mx-auto"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
