'use client'

import { useState, useEffect } from 'react'

interface ChartProps {
  data: { [key: string]: number }
  title: string
  type: 'bar' | 'pie' | 'line'
  colors?: string[]
}

export default function Chart({ data, title, type, colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'] }: ChartProps) {
  const [chartData, setChartData] = useState<Array<{ label: string; value: number; percentage: number; color: string }>>([])

  useEffect(() => {
    const total = Object.values(data).reduce((sum, value) => sum + value, 0)
    const processedData = Object.entries(data).map(([label, value], index) => ({
      label,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
      color: colors[index % colors.length]
    }))
    setChartData(processedData)
  }, [data, colors])

  if (type === 'bar') {
    return (
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-900">{title}</h4>
        <div className="space-y-2">
          {chartData.map((item, index) => (
            <div key={index} className="flex items-center space-x-2">
              <span className="text-sm text-gray-600 w-16 truncate">{item.label}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-3">
                <div 
                  className="h-3 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${item.percentage}%`,
                    backgroundColor: item.color
                  }}
                />
              </div>
              <span className="text-sm text-gray-600 w-12 text-right">
                {item.value} ({item.percentage.toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'pie') {
    return (
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-900">{title}</h4>
        <div className="flex items-center space-x-4">
          <div className="w-24 h-24 relative">
            <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
              {chartData.map((item, index) => {
                const startAngle = chartData.slice(0, index).reduce((sum, d) => sum + d.percentage, 0)
                const endAngle = startAngle + item.percentage
                const startAngleRad = (startAngle * 360) / 100
                const endAngleRad = (endAngle * 360) / 100
                
                const x1 = 50 + 40 * Math.cos((startAngleRad * Math.PI) / 180)
                const y1 = 50 + 40 * Math.sin((startAngleRad * Math.PI) / 180)
                const x2 = 50 + 40 * Math.cos((endAngleRad * Math.PI) / 180)
                const y2 = 50 + 40 * Math.sin((endAngleRad * Math.PI) / 180)
                
                const largeArcFlag = item.percentage > 50 ? 1 : 0
                
                return (
                  <path
                    key={index}
                    d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                    fill={item.color}
                    stroke="white"
                    strokeWidth="1"
                  />
                )
              })}
            </svg>
          </div>
          <div className="space-y-1">
            {chartData.map((item, index) => (
              <div key={index} className="flex items-center space-x-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-gray-600">{item.label}</span>
                <span className="text-sm text-gray-500">({item.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (type === 'line') {
    const maxValue = Math.max(...chartData.map(d => d.value), 1)
    const minValue = Math.min(...chartData.map(d => d.value), 0)
    const range = maxValue - minValue || 1
    
    // Calculate regression line for trend
    const regressionData = chartData.map((d, i) => ({ x: i, y: d.value }))
    const n = regressionData.length
    const sumX = regressionData.reduce((sum, d) => sum + d.x, 0)
    const sumY = regressionData.reduce((sum, d) => sum + d.y, 0)
    const sumXY = regressionData.reduce((sum, d) => sum + d.x * d.y, 0)
    const sumXX = regressionData.reduce((sum, d) => sum + d.x * d.x, 0)
    
    const slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) : 0
    const intercept = n > 0 ? (sumY - slope * sumX) / n : 0
    
    // Calculate regression line points
    const regressionPoints = regressionData.map(d => ({
      x: d.x,
      y: slope * d.x + intercept
    }))
    
    const chartWidth = Math.max(400, chartData.length * 40)
    const chartHeight = 200
    const padding = 40
    
    return (
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-900">{title}</h4>
        <div className="relative w-full" style={{ height: `${chartHeight + 60}px` }}>
          <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet" className="overflow-visible">
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((y) => {
              const yPos = chartHeight - ((y / 100) * (chartHeight - padding * 2)) - padding
              return (
                <line
                  key={y}
                  x1={padding}
                  y1={yPos}
                  x2={chartWidth - padding}
                  y2={yPos}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              )
            })}
            
            {/* Regression line */}
            {regressionPoints.length > 1 && (
              <polyline
                points={regressionPoints.map((p, i) => {
                  const x = padding + (i / (regressionPoints.length - 1)) * (chartWidth - padding * 2)
                  const y = chartHeight - ((p.y - minValue) / range) * (chartHeight - padding * 2) - padding
                  return `${x},${y}`
                }).join(' ')}
                fill="none"
                stroke="#EF4444"
                strokeWidth="2"
                strokeDasharray="5 5"
              />
            )}
            
            {/* Data points and line */}
            <polyline
              points={chartData.map((d, i) => {
                const x = padding + (i / (chartData.length - 1 || 1)) * (chartWidth - padding * 2)
                const y = chartHeight - ((d.value - minValue) / range) * (chartHeight - padding * 2) - padding
                return `${x},${y}`
              }).join(' ')}
              fill="none"
              stroke={colors[0]}
              strokeWidth="2"
            />
            
            {/* Data points */}
            {chartData.map((d, i) => {
              const x = padding + (i / (chartData.length - 1 || 1)) * (chartWidth - padding * 2)
              const y = chartHeight - ((d.value - minValue) / range) * (chartHeight - padding * 2) - padding
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="4"
                  fill={d.color}
                  stroke="white"
                  strokeWidth="2"
                />
              )
            })}
          </svg>
          
          {/* Labels */}
          <div className="flex justify-between mt-2 px-2">
            {chartData.map((item, index) => (
              <div key={index} className="flex flex-col items-center">
                <span className="text-xs text-gray-600 truncate max-w-[80px]">{item.label}</span>
                <span className="text-xs font-medium text-gray-900">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return null
}

interface TrendChartProps {
  data: Array<{ date: string; responses: number }>
  title: string
}

export function TrendChart({ data, title }: TrendChartProps) {
  const maxResponses = Math.max(...data.map(d => d.responses))
  
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-gray-900">{title}</h4>
      <div className="h-32 flex items-end space-x-1">
        {data.map((item, index) => (
          <div key={index} className="flex flex-col items-center space-y-1">
            <div 
              className="w-6 bg-blue-500 rounded-t transition-all duration-300"
              style={{ 
                height: `${(item.responses / maxResponses) * 100}px`
              }}
            />
            <span className="text-xs text-gray-600">
              {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="text-xs text-gray-500">{item.responses}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface SparklineChartProps {
  data: Array<{ date: string; responses: number }>
  height?: number
  color?: string
  ariaLabel?: string
}

export function SparklineChart({ data, height = 24, color = '#3B82F6', ariaLabel = 'sparkline' }: SparklineChartProps) {
  if (!data || data.length === 0) return null
  const maxResponses = Math.max(...data.map(d => d.responses)) || 1
  return (
    <div className="flex items-end space-x-0.5" role="img" aria-label={ariaLabel}>
      {data.map((d, i) => (
        <div
          key={i}
          className="rounded-t"
          style={{
            width: 3,
            height: `${Math.max(2, Math.round((d.responses / maxResponses) * height))}px`,
            backgroundColor: color
          }}
        />
      ))}
    </div>
  )
}
