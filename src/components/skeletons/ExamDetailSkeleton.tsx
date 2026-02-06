'use client'

import React from 'react'
import { TableSkeleton } from '@/components/ui/TableSkeleton'

export default function ExamDetailSkeleton() {
    return (
        <div className="animate-pulse">
            {/* Breadcrumbs Skeleton */}
            <div className="flex items-center space-x-2 mb-6">
                <div className="h-4 w-12 bg-gray-200 rounded"></div>
                <div className="h-4 w-4 bg-gray-200 rounded"></div>
                <div className="h-4 w-32 bg-gray-200 rounded"></div>
            </div>

            {/* Exam Info Card Skeleton */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8 relative">
                <div className="flex justify-between items-start">
                    <div className="w-full">
                        <div className="h-3 w-32 bg-gray-200 rounded mb-2"></div>
                        <div className="h-8 w-64 bg-gray-200 rounded mb-4"></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-2/3">
                            <div className="flex items-center gap-3">
                                <div>
                                    <div className="h-3 w-24 bg-gray-200 rounded mb-1"></div>
                                    <div className="h-4 w-32 bg-gray-200 rounded"></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div>
                                    <div className="h-3 w-24 bg-gray-200 rounded mb-1"></div>
                                    <div className="h-4 w-32 bg-gray-200 rounded"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="hidden sm:block">
                        <div className="h-20 w-32 bg-gray-200 rounded-2xl"></div>
                    </div>
                </div>
            </div>

            {/* Table Section Skeleton */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                    <div className="h-5 w-40 bg-gray-200 rounded"></div>
                    <div className="flex gap-3">
                        <div className="h-10 w-32 bg-gray-200 rounded"></div>
                        <div className="h-10 w-32 bg-gray-200 rounded"></div>
                        <div className="h-10 w-32 bg-gray-200 rounded"></div>
                    </div>
                </div>
                <TableSkeleton />
            </div>
        </div>
    )
}
