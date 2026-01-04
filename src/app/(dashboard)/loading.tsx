export default function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gray-50/50">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#bef264]" />
        <p className="text-sm font-medium text-gray-500">Loading...</p>
      </div>
    </div>
  )
}
