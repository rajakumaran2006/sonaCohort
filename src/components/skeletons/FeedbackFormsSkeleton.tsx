import React from 'react'

export default function FeedbackFormsSkeleton() {
    return (
        <>
            {[1, 2, 3, 4, 5].map((index) => (
                <tr key={index} className="animate-pulse border-b border-gray-100 last:border-0">
                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-gray-200 rounded w-48"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-4 bg-gray-200 rounded w-12 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 text-center">
                        <div className="h-4 bg-gray-200 rounded w-16 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-4 bg-gray-200 rounded w-24 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-4 bg-gray-200 rounded w-16 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="h-6 bg-gray-200 rounded w-20 mx-auto"></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex justify-center space-x-2">
                            <div className="h-6 bg-gray-200 rounded w-16"></div>
                            <div className="h-6 bg-gray-200 rounded w-16"></div>
                        </div>
                    </td>
                </tr>
            ))}
        </>
    )
}
