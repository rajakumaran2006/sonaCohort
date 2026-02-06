import React from 'react'

export default function RenumerationTemplatesSkeleton() {
    return (
        <>
            {[1, 2, 3, 4, 5].map((index) => (
                <tr key={index} className="animate-pulse border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-4 bg-gray-200 rounded w-16 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-8 bg-gray-200 rounded w-20 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-4 bg-gray-200 rounded w-24 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-6 bg-gray-200 rounded w-16 mx-auto"></div>
                    </td>
                </tr>
            ))}
        </>
    )
}
