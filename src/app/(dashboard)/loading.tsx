export default function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#F8FAFC]">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Loading...</p>
      </div>
    </div>
  )
}
