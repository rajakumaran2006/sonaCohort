
export default function SettingsSkeleton() {
    return (
        <div className="p-8 max-w-[1400px] mx-auto w-full animate-pulse">
            {/* Profile Section Skeleton */}
            <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm mb-8">
                <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
                    <div className="flex-shrink-0">
                        <div className="h-32 w-32 rounded-full bg-gray-200"></div>
                    </div>
                    <div className="flex-1 text-center md:text-left w-full">
                        <div className="h-8 w-64 bg-gray-200 rounded mb-4 mx-auto md:mx-0"></div>
                        <div className="h-4 w-48 bg-gray-200 rounded mb-6 mx-auto md:mx-0"></div>
                        <div className="flex flex-col sm:flex-row items-center md:items-start gap-4 mt-6">
                            <div className="h-10 w-40 bg-gray-200 rounded-xl"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Statistics Section Skeleton */}
            <div className="mb-6">
                <div className="h-4 w-40 bg-gray-200 rounded mb-6"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="h-40 bg-white rounded-xl border border-gray-200 p-6"></div>
                <div className="h-40 bg-white rounded-xl border border-gray-200 p-6"></div>
            </div>

            {/* Class Configuration Skeleton */}
            <div className="mb-6">
                <div className="h-4 w-40 bg-gray-200 rounded mb-6"></div>
            </div>
            <div className="h-24 bg-white rounded-xl border border-gray-200 p-6 mb-8"></div>
        </div>
    )
}
