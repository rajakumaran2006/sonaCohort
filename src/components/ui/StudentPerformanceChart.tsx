'use client'

interface StudentMark {
  studentName: string
  marks: number[] // Array of marks for each subject
  average: number
}

interface StudentPerformanceChartProps {
  students: StudentMark[]
  subjectNames: string[]
  maxMarks: number
}

export default function StudentPerformanceChart({ students, subjectNames, maxMarks }: StudentPerformanceChartProps) {
  if (!students || students.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    )
  }

  const chartHeight = Math.max(300, students.length * 60)
  const chartWidth = 600
  const padding = { top: 40, right: 80, bottom: 60, left: 120 }
  const chartInnerWidth = chartWidth - padding.left - padding.right
  const chartInnerHeight = chartHeight - padding.top - padding.bottom

  // Calculate max mark value for scaling
  const maxMarkValue = Math.max(...students.flatMap(s => s.marks), maxMarks)

  // Colors for each student
  const colors = [
    '#3B82F6', // blue
    '#10B981', // green
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // purple
    '#EC4899', // pink
    '#06B6D4', // cyan
    '#84CC16', // lime
  ]

  // Grid lines for marks (X-axis)
  const markGridLines = [0, 20, 40, 60, 80, 100].filter(m => m <= maxMarkValue)

  return (
    <div className="w-full overflow-x-auto">
      <div className="relative" style={{ minWidth: `${chartWidth}px`, height: `${chartHeight}px` }}>
        <svg width={chartWidth} height={chartHeight} className="overflow-visible">
          {/* Background */}
          <rect
            x={padding.left}
            y={padding.top}
            width={chartInnerWidth}
            height={chartInnerHeight}
            fill="#f9fafb"
          />

          {/* Grid lines for marks (vertical) */}
          {markGridLines.map((mark) => {
            const x = padding.left + (mark / maxMarkValue) * chartInnerWidth
            return (
              <g key={mark}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={padding.top + chartInnerHeight}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                {/* Mark label at top */}
                <text
                  x={x}
                  y={padding.top - 10}
                  textAnchor="middle"
                  className="text-xs fill-gray-600"
                  fontSize="12"
                >
                  {mark}
                </text>
              </g>
            )
          })}

          {/* Student rows and lines */}
          {students.map((student, studentIndex) => {
            const studentY = padding.top + (studentIndex / students.length) * chartInnerHeight + chartInnerHeight / (students.length * 2)
            const color = colors[studentIndex % colors.length]

            return (
              <g key={studentIndex}>
                {/* Draw line connecting all marks for this student */}
                {student.marks.length > 1 && (
                  <polyline
                    points={student.marks.map((mark) => {
                      const x = padding.left + (mark / maxMarkValue) * chartInnerWidth
                      return `${x},${studentY}`
                    }).join(' ')}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    opacity="0.6"
                  />
                )}

                {/* Data points for each subject mark */}
                {student.marks.map((mark, markIndex) => {
                  const x = padding.left + (mark / maxMarkValue) * chartInnerWidth
                  return (
                    <g key={markIndex}>
                      <circle
                        cx={x}
                        cy={studentY}
                        r="5"
                        fill={color}
                        stroke="white"
                        strokeWidth="2"
                      />
                      {/* Tooltip on hover */}
                      <title>
                        {subjectNames[markIndex] || `Subject ${markIndex + 1}`}: {mark}/{maxMarks}
                      </title>
                    </g>
                  )
                })}

                {/* Student name label on left */}
                <text
                  x={padding.left - 10}
                  y={studentY + 5}
                  textAnchor="end"
                  className="text-xs fill-gray-700 font-medium"
                  fontSize="11"
                >
                  {student.studentName}
                </text>

                {/* Average mark indicator */}
                <circle
                  cx={padding.left + (student.average / maxMarkValue) * chartInnerWidth}
                  cy={studentY}
                  r="6"
                  fill={color}
                  stroke="white"
                  strokeWidth="3"
                  opacity="0.9"
                />
              </g>
            )
          })}

          {/* X-axis label */}
          <text
            x={padding.left + chartInnerWidth / 2}
            y={chartHeight - 10}
            textAnchor="middle"
            className="text-sm fill-gray-700 font-medium"
            fontSize="12"
          >
            Marks (0 - {maxMarkValue})
          </text>

          {/* Y-axis label */}
          <text
            x={20}
            y={padding.top + chartInnerHeight / 2}
            textAnchor="middle"
            className="text-sm fill-gray-700 font-medium"
            fontSize="12"
            transform={`rotate(-90, 20, ${padding.top + chartInnerHeight / 2})`}
          >
            Students
          </text>
        </svg>
      </div>
    </div>
  )
}

