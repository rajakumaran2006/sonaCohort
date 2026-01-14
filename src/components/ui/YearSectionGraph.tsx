'use client'

import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'

interface SectionData {
  section: string
  tutors: number
  completed: number
  pending: number
}

interface YearSectionGraphProps {
  data: SectionData[]
  title?: string
}

export const YearSectionGraph: React.FC<YearSectionGraphProps> = ({ 
  data, 
  title = "SECTION OVERVIEW" 
}) => {
  // Show empty state if no data
  if (!data || data.length === 0) {
    return (
      <div className="bg-white p-8 rounded-[28px] border border-gray-100 shadow-sm h-full flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">{title}</h3>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tutors</span>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <div className="w-20 h-20 rounded-3xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No Data Available</p>
            <p className="text-xs text-gray-400 mt-2">Section statistics will appear here once data is loaded</p>
          </div>
        </div>
      </div>
    )
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-800 p-4 rounded-xl shadow-xl min-w-[200px]">
          <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-gray-800 pb-2">
            Section {label}
          </p>
          <div className="space-y-2.5">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-gray-300 text-xs font-semibold">{entry.name}</span>
                </div>
                <span className="text-white text-sm font-bold font-mono">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-white p-8 rounded-[28px] border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 h-full flex flex-col relative overflow-hidden group">
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-50/50 to-transparent rounded-bl-full -mr-32 -mt-32 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="flex items-center justify-between mb-8 relative z-10">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">{title}</h3>
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 ring-2 ring-blue-100"></div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tutors</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100"></div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500 ring-2 ring-orange-100"></div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pending</span>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full min-h-[350px] relative z-10">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
            barGap={8}
          >
            <defs>
              <linearGradient id="colorTutors" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={1}/>
                <stop offset="100%" stopColor="#2563EB" stopOpacity={0.8}/>
              </linearGradient>
              <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={1}/>
                <stop offset="100%" stopColor="#059669" stopOpacity={0.8}/>
              </linearGradient>
              <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F97316" stopOpacity={1}/>
                <stop offset="100%" stopColor="#EA580C" stopOpacity={0.8}/>
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="4 4" 
              vertical={false} 
              stroke="#F3F4F6" 
            />
            <XAxis 
              dataKey="section" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em' }}
              dy={16}
              height={50}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 700 }}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(243, 244, 246, 0.4)', radius: 8 }} />
            <Bar 
              dataKey="tutors" 
              fill="url(#colorTutors)" 
              radius={[6, 6, 0, 0]} 
              barSize={28}
              name="Peer Tutors"
              animationDuration={1500}
            />
            <Bar 
              dataKey="completed" 
              fill="url(#colorCompleted)" 
              radius={[6, 6, 0, 0]} 
              barSize={28}
              name="Completed Classes"
              animationDuration={1500}
              animationBegin={200}
            />
            <Bar 
              dataKey="pending" 
              fill="url(#colorPending)" 
              radius={[6, 6, 0, 0]} 
              barSize={28}
              name="Pending Classes"
              animationDuration={1500}
              animationBegin={400}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
