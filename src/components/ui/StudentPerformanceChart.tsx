'use client'

import { useMemo } from 'react'

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
  // Vibrant gradient colors for lines
  const colors = useMemo(() => [
    { line: '#6366f1', gradient: 'rgba(99, 102, 241, 0.15)' },   // indigo
    { line: '#10b981', gradient: 'rgba(16, 185, 129, 0.15)' },   // emerald
    { line: '#f59e0b', gradient: 'rgba(245, 158, 11, 0.15)' },   // amber
    { line: '#ef4444', gradient: 'rgba(239, 68, 68, 0.15)' },    // red
    { line: '#8b5cf6', gradient: 'rgba(139, 92, 246, 0.15)' },   // violet
    { line: '#ec4899', gradient: 'rgba(236, 72, 153, 0.15)' },   // pink
    { line: '#06b6d4', gradient: 'rgba(6, 182, 212, 0.15)' },    // cyan
    { line: '#14b8a6', gradient: 'rgba(20, 184, 166, 0.15)' },   // teal
  ], [])

  if (!students || students.length === 0 || !subjectNames || subjectNames.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">No data available</p>
        </div>
      </div>
    )
  }

  const chartWidth = 580
  const chartHeight = 280
  const padding = { top: 30, right: 20, bottom: 50, left: 45 }
  const chartInnerWidth = chartWidth - padding.left - padding.right
  const chartInnerHeight = chartHeight - padding.top - padding.bottom

  // Y-axis gridlines
  const yGridLines = [0, 25, 50, 75, 100].filter(v => v <= maxMarks)
  
  // Create path for each student's line
  const createLinePath = (marks: number[]) => {
    if (marks.length === 0) return ''
    
    const points = marks.map((mark, index) => {
      const x = padding.left + (index / (subjectNames.length - 1 || 1)) * chartInnerWidth
      const y = padding.top + chartInnerHeight - (mark / maxMarks) * chartInnerHeight
      return { x, y }
    })
    
    return points.map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  }

  // Create smooth curve path using Catmull-Rom splines
  const createSmoothPath = (marks: number[]) => {
    if (marks.length < 2) return createLinePath(marks)
    
    const points = marks.map((mark, index) => ({
      x: padding.left + (index / (subjectNames.length - 1 || 1)) * chartInnerWidth,
      y: padding.top + chartInnerHeight - (mark / maxMarks) * chartInnerHeight
    }))

    let path = `M ${points[0].x} ${points[0].y}`
    
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[Math.min(points.length - 1, i + 2)]
      
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
    }
    
    return path
  }

  // Create area fill path
  const createAreaPath = (marks: number[]) => {
    const linePath = createSmoothPath(marks)
    const firstX = padding.left
    const lastX = padding.left + chartInnerWidth
    const bottomY = padding.top + chartInnerHeight
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`
  }

  return (
    <div className="w-full h-full">
      <svg 
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Gradient definitions for each student */}
          {students.map((_, index) => (
            <linearGradient
              key={`gradient-${index}`}
              id={`areaGradient-${index}`}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor={colors[index % colors.length].line} stopOpacity="0.3" />
              <stop offset="100%" stopColor={colors[index % colors.length].line} stopOpacity="0.02" />
            </linearGradient>
          ))}
          
          {/* Glow filter for lines */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Background with subtle gradient */}
        <rect
          x={padding.left}
          y={padding.top}
          width={chartInnerWidth}
          height={chartInnerHeight}
          fill="url(#bgGradient)"
          rx="4"
        />
        <defs>
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fafafa" />
            <stop offset="100%" stopColor="#f5f5f5" />
          </linearGradient>
        </defs>

        {/* Y-axis gridlines */}
        {yGridLines.map((value) => {
          const y = padding.top + chartInnerHeight - (value / maxMarks) * chartInnerHeight
          return (
            <g key={value}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + chartInnerWidth}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray={value === 0 ? "0" : "4 4"}
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-gray-500"
                fontSize="10"
                fontWeight="500"
              >
                {value}
              </text>
            </g>
          )
        })}

        {/* X-axis labels (subjects) */}
        {subjectNames.map((name, index) => {
          const x = padding.left + (index / (subjectNames.length - 1 || 1)) * chartInnerWidth
          return (
            <g key={index}>
              {/* Vertical reference line */}
              <line
                x1={x}
                y1={padding.top}
                x2={x}
                y2={padding.top + chartInnerHeight}
                stroke="#e5e7eb"
                strokeWidth="1"
                opacity="0.5"
              />
              {/* Subject label */}
              <text
                x={x}
                y={padding.top + chartInnerHeight + 20}
                textAnchor="middle"
                className="fill-gray-600"
                fontSize="9"
                fontWeight="600"
              >
                {name.length > 8 ? name.substring(0, 8) + '..' : name}
              </text>
            </g>
          )
        })}

        {/* Area fills (render first, behind lines) */}
        {students.slice(0, 5).map((student, index) => (
          <path
            key={`area-${index}`}
            d={createAreaPath(student.marks)}
            fill={`url(#areaGradient-${index})`}
            opacity="0.6"
          />
        ))}

        {/* Lines for each student */}
        {students.slice(0, 5).map((student, index) => (
          <g key={`line-${index}`}>
            {/* Shadow line */}
            <path
              d={createSmoothPath(student.marks)}
              fill="none"
              stroke={colors[index % colors.length].line}
              strokeWidth="4"
              opacity="0.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Main line */}
            <path
              d={createSmoothPath(student.marks)}
              fill="none"
              stroke={colors[index % colors.length].line}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
            />
          </g>
        ))}

        {/* Data points */}
        {students.slice(0, 5).map((student, studentIndex) => (
          <g key={`points-${studentIndex}`}>
            {student.marks.map((mark, markIndex) => {
              const x = padding.left + (markIndex / (subjectNames.length - 1 || 1)) * chartInnerWidth
              const y = padding.top + chartInnerHeight - (mark / maxMarks) * chartInnerHeight
              return (
                <g key={markIndex}>
                  {/* Outer glow */}
                  <circle
                    cx={x}
                    cy={y}
                    r="8"
                    fill={colors[studentIndex % colors.length].line}
                    opacity="0.15"
                  />
                  {/* Point */}
                  <circle
                    cx={x}
                    cy={y}
                    r="5"
                    fill="white"
                    stroke={colors[studentIndex % colors.length].line}
                    strokeWidth="2.5"
                  >
                    <title>{student.studentName}: {mark}/{maxMarks} in {subjectNames[markIndex]}</title>
                  </circle>
                </g>
              )
            })}
          </g>
        ))}

        {/* Legend */}
        <g transform={`translate(${padding.left}, ${chartHeight - 15})`}>
          {students.slice(0, 5).map((student, index) => {
            const xOffset = index * (chartInnerWidth / 5)
            return (
              <g key={index} transform={`translate(${xOffset}, 0)`}>
                <circle
                  cx="5"
                  cy="0"
                  r="4"
                  fill={colors[index % colors.length].line}
                />
                <text
                  x="12"
                  y="3"
                  className="fill-gray-600"
                  fontSize="8"
                  fontWeight="500"
                >
                  {student.studentName.length > 10 ? student.studentName.substring(0, 10) + '..' : student.studentName}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
