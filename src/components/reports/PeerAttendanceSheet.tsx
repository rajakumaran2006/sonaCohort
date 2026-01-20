import React from 'react'
import { ReportService } from '@/lib/services/reportService'
import { useCachedData } from '@/lib/hooks/useCachedData'

interface PeerAttendanceSheetProps {
  peertutorId: string
}

export default function PeerAttendanceSheet({ peertutorId }: PeerAttendanceSheetProps) {
  const { data: attendanceData, isLoading } = useCachedData({
    queryKey: ['peer-attendance-sheet', peertutorId],
    queryFn: async () => {
      return await ReportService.getAttendanceSheetData(peertutorId)
    },
    enabled: !!peertutorId
  })



  if (isLoading) {
    return (
       <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
       </div>
    )
  }

  if (!attendanceData || attendanceData.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200 shadow-sm">
        <p>No class data available for attendance sheet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white p-8 shadow-sm border border-gray-200 rounded-none print:shadow-none print:border-none">
      {attendanceData.map((subject, index) => (
        <div key={index} className={index > 0 ? "mt-16" : ""}>
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 border-b-2 border-gray-800 pb-2 uppercase">
              SUBJECT NAME {index + 1}: <span className="text-gray-700 ml-2 font-normal">{subject.subject_name}</span>
            </h3>
          </div>
          
          <div className="overflow-x-auto">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="border-collapse border border-gray-800 text-sm min-w-full">
                <thead>
                  {/* Header Row with Date displayed horizontally */}
                  <tr>
                    <th className="border border-gray-800 p-2 text-center font-bold text-xs">S.No</th>
                    <th className="border border-gray-800 p-2 text-center font-bold text-xs w-[1%] whitespace-nowrap">Name</th>
                    {subject.columns.map(col => {
                      const date = new Date(col.date)
                      const formattedDate = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`
                      return (
                        <th key={col.id} className="border border-gray-800 p-2 text-center font-bold text-[10px] whitespace-nowrap">
                          {formattedDate}
                          {col.is_additional && <span className="text-gray-500 ml-1 font-normal">(A)</span>}
                        </th>
                      )
                    })}
                    <th className="border border-gray-800 p-2 text-center font-bold text-[10px] leading-3 align-middle whitespace-nowrap">No of Hours Present</th>
                    <th className="border border-gray-800 p-2 text-center font-bold text-[10px] align-middle">%</th>
                  </tr>
                </thead>
                <tbody>
                  {subject.rows.map((student, idx) => (
                    <tr key={student.student_id}>
                      <td className="border border-gray-800 p-2 text-center text-xs">{idx + 1}</td>
                      <td className="border border-gray-800 p-2 text-left text-xs font-medium whitespace-nowrap w-[1%]">{student.student_name}</td>
                      
                      {subject.columns.map(col => {
                        const status = student.attendance[col.id];
                        return (
                          <td key={`${student.student_id}-${col.id}`} className="border border-gray-800 p-2 text-center text-xs">
                              {status === 'present' ? 'P' : status === 'absent' ? 'A' : status === 'on_duty' ? 'OD' : ''}
                          </td>
                        )
                      })}
                      
                      <td className="border border-gray-800 p-2 text-center text-xs font-bold">{student.stats.present}</td>
                      <td className="border border-gray-800 p-2 text-center text-xs font-bold">{student.stats.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {subject.rows.map((student, idx) => (
                <div key={student.student_id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold text-gray-700">
                        {idx + 1}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">{student.student_name}</h4>
                        <p className="text-xs text-gray-500">Student</p>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-900`}>
                      {student.stats.percentage}%
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mb-4 text-xs">
                    <div className="bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg flex-1 text-center">
                      <span className="block text-gray-400 font-bold uppercase text-[10px] mb-0.5">Present</span>
                      <span className="text-lg font-black text-gray-900">{student.stats.present}</span>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg flex-1 text-center">
                      <span className="block text-gray-400 font-bold uppercase text-[10px] mb-0.5">Total</span>
                      <span className="text-lg font-black text-gray-900">{subject.columns.length}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Attendance Log</p>
                    <div className="grid grid-cols-4 gap-2">
                      {subject.columns.map(col => {
                        const date = new Date(col.date)
                        const formattedDate = `${date.getDate()}/${date.getMonth() + 1}`
                        const status = student.attendance[col.id]
                        
                        return (
                          <div key={col.id} className="flex flex-col items-center p-2 rounded-lg border bg-gray-50 border-gray-200">
                            <span className="text-[10px] text-gray-500 font-bold mb-1">
                               {formattedDate} <span className="text-gray-400 font-medium">({col.is_additional ? 'A' : 'R'})</span>
                            </span>
                            <span className="text-xs font-black text-gray-900">
                              {status === 'present' ? 'P' : status === 'absent' ? 'Ab' : status === 'on_duty' ? 'OD' : '-'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}
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
