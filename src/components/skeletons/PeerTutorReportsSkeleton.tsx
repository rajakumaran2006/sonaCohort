import React from 'react'

export default function PeerTutorReportsSkeleton() {
    return (
        <>
            {[1, 2, 3, 4, 5].map((index) => (
                <tr key={index} className="animate-pulse border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                        <div className="h-4 bg-gray-200 rounded w-32"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                        <div className="h-4 bg-gray-200 rounded w-40"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                        <div className="h-5 bg-gray-200 rounded w-20"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-gray-200 rounded w-32"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-8 bg-gray-200 rounded w-16 mx-auto"></div>
                    </td>
                </tr>
            ))}
        </>
    )
}
