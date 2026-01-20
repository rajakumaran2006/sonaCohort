import React from 'react'
import { ReportService } from '@/lib/services/reportService'
import { useCachedData } from '@/lib/hooks/useCachedData'

interface PeerTopicSheetProps {
  peertutorId: string
}

export default function PeerTopicSheet({ peertutorId }: PeerTopicSheetProps) {
  const { data: topicData, isLoading } = useCachedData({
    queryKey: ['peer-topic-sheet', peertutorId],
    queryFn: async () => {
      return await ReportService.getTopicSheetData(peertutorId)
    },
    enabled: !!peertutorId
  })

  // Format date helper
  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const d = new Date(dateString)
    return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`
  }

  // Format time helper (24h -> 12h AM/PM)
  const formatTime = (timeStr: string): string => {
    if (!timeStr) return ''
    // Handle ranges like "09:30 - 10:30"
    if (timeStr.includes(' - ')) {
      const [start, end] = timeStr.split(' - ')
      return `${formatTime(start)} - ${formatTime(end)}`
    }
    
    // Check if valid time format HH:MM
    if (!timeStr.match(/^\d{1,2}:\d{2}$/) && !timeStr.match(/^\d{1,2}:\d{2}:\d{2}$/)) {
        return timeStr
    }

    try {
      const [hours, minutes] = timeStr.split(':')
      const h = parseInt(hours, 10)
      const ampm = h >= 12 ? 'PM' : 'AM'
      const h12 = h % 12 || 12
      return `${h12}:${minutes} ${ampm}`
    } catch {
      return timeStr
    }
  }

  if (isLoading) {
    return (
       <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
       </div>
    )
  }

  if (!topicData || topicData.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200 shadow-sm">
        <p>No class data available for topic sheet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white p-8 shadow-sm border border-gray-200 rounded-none print:shadow-none print:border-none">
      {topicData.map((subject, index) => (
        <div key={index} className={index > 0 ? "mt-12" : ""}>
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 border-b-2 border-gray-800 pb-2 uppercase">
              SUBJECT NAME {index + 1}: <span className="text-gray-700 ml-2 font-normal">{subject.subject_name}</span>
            </h3>
          </div>
          
          <div className="overflow-hidden">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse border border-gray-800 min-w-full">
                <thead>
                  <tr>
                    <th className="border border-gray-800 px-4 py-3 w-16 text-center text-sm font-bold text-gray-900 bg-transparent">S.NO</th>
                    <th className="border border-gray-800 px-4 py-3 w-32 text-center text-sm font-bold text-gray-900 bg-transparent">DATE</th>
                    <th className="border border-gray-800 px-4 py-3 w-40 text-center text-sm font-bold text-gray-900 bg-transparent">HOUR</th>
                    <th className="border border-gray-800 px-4 py-3 text-left text-sm font-bold text-gray-900 bg-transparent">TOPIC DETAILS</th>
                  </tr>
                </thead>
                <tbody>
                  {subject.classes.map((cls, idx) => (
                    <tr key={cls.id}>
                      <td className="border border-gray-800 px-4 py-3 text-center text-sm text-gray-900 h-12">{idx + 1}</td>
                      <td className="border border-gray-800 px-4 py-3 text-center text-sm text-gray-900 h-12">
                        {formatDate(cls.date)}
                        {cls.is_additional && <span className="text-gray-500 ml-1 font-normal">(A)</span>}
                      </td>
                      <td className="border border-gray-800 px-4 py-3 text-center text-sm text-gray-900 h-12 font-medium whitespace-nowrap">
                        {formatTime(cls.hour)}
                      </td>
                      <td className="border border-gray-800 px-4 py-3 text-left text-sm text-gray-900 h-12">{cls.topic}</td>
                    </tr>
                  ))}
                  {subject.classes.length === 0 && (
                    <tr>
                      <td colSpan={4} className="border border-gray-800 px-4 py-3 text-center text-sm text-gray-500 h-12 italic">
                        No classes recorded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {subject.classes.map((cls, idx) => (
                <div key={cls.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-3 border-b border-gray-100 pb-2">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold text-gray-700">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-bold text-gray-900">
                        {formatDate(cls.date)}
                      </span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      cls.is_additional ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {cls.is_additional ? 'Additional' : 'Regular'}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500 font-medium uppercase text-xs tracking-wider">Topic Covered</p>
                    <p className="text-sm text-gray-900 leading-relaxed font-medium">
                      {cls.topic}
                    </p>
                  </div>
                </div>
              ))}
              {subject.classes.length === 0 && (
                <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-100 border-dashed">
                  <p className="text-sm text-gray-500 italic">No classes recorded yet</p>
                </div>
              )}
            </div>
            
            <div className="mt-12 pt-4">
                <p className="text-sm font-bold uppercase text-gray-900">Signature of Faculty:</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
