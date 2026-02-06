import React from 'react'

export default function FacultyLoginSkeleton() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 bg-[#F8F9FA] relative overflow-hidden">
            {/* Abstract Background Shapes - Simplified for minimal visual noise during load, or match exact if mimicking layout strictly. 
          Here we match layout to avoid shift. */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-green-400/10 rounded-full blur-[120px] translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-lime-400/10 rounded-full blur-[100px] -translate-x-1/3 translate-y-1/3"></div>
            </div>

            <div className="w-full max-w-[400px] relative z-10 perspective-1000 animate-pulse">

                {/* Main Card Skeleton */}
                <div className="bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] border border-white/60 p-8 sm:p-10">

                    {/* Header Section Skeleton */}
                    <div className="mb-10 flex flex-col items-center">
                        {/* Logo and Brand Skeleton */}
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <div className="w-12 h-12 rounded bg-gray-200"></div>
                            <div className="flex flex-col gap-1">
                                <div className="h-8 w-24 bg-gray-200 rounded"></div>
                                <div className="h-5 w-20 bg-gray-200 rounded"></div>
                            </div>
                        </div>

                        {/* Welcome Text Skeleton */}
                        <div className="h-6 w-32 bg-gray-200 rounded mt-2"></div>
                    </div>

                    {/* Form/Buttons Skeleton */}
                    <div className="space-y-6">
                        {/* Sign In Button Skeleton */}
                        <div className="w-full h-14 bg-gray-200 rounded-2xl"></div>

                        {/* Links Skeleton */}
                        <div className="flex items-center justify-center gap-6">
                            <div className="h-3 w-12 bg-gray-200 rounded"></div>
                            <div className="w-1 h-1 rounded-full bg-gray-300"></div>
                            <div className="h-3 w-12 bg-gray-200 rounded"></div>
                        </div>
                    </div>
                </div>

                {/* Footer Skeleton */}
                <div className="flex justify-center mt-8">
                    <div className="h-3 w-48 bg-gray-200 rounded opacity-60"></div>
                </div>
            </div>
        </div>
    )
}
