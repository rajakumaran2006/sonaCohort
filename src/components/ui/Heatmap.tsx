'use client'

interface HeatmapProps {
  data: Array<{
    student: string
    subject: string
    value: number
  }>
  students: string[]
  subjects: string[]
  maxValue?: number
  minValue?: number
}

export default function Heatmap({ data, students, subjects, maxValue, minValue }: HeatmapProps) {
  // Calculate max and min if not provided
  const calculatedMax = maxValue ?? Math.max(...data.map(d => d.value), 100)
  const calculatedMin = minValue ?? Math.min(...data.map(d => d.value), 0)

  // Create a map for quick lookup
  const dataMap = new Map<string, number>()
  data.forEach(d => {
    dataMap.set(`${d.student}-${d.subject}`, d.value)
  })

  // Get color based on value
  const getColor = (value: number): string => {
    const percentage = ((value - calculatedMin) / (calculatedMax - calculatedMin)) * 100
    
    if (percentage >= 80) return 'bg-green-500'
    if (percentage >= 60) return 'bg-green-400'
    if (percentage >= 40) return 'bg-yellow-400'
    if (percentage >= 20) return 'bg-orange-400'
    return 'bg-red-400'
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                Student
              </th>
              {subjects.map(subject => (
                <th key={subject} className="px-4 py-2 text-center text-xs font-medium text-gray-700 min-w-[80px]">
                  {subject}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map(student => (
              <tr key={student}>
                <td className="px-4 py-2 text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">
                  {student}
                </td>
                {subjects.map(subject => {
                  const value = dataMap.get(`${student}-${subject}`) ?? 0
                  return (
                    <td key={subject} className="px-2 py-1">
                      <div
                        className={`${getColor(value)} text-white text-xs font-medium rounded px-2 py-1 text-center min-w-[60px]`}
                        title={`${student} - ${subject}: ${value}%`}
                      >
                        {value.toFixed(0)}%
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

