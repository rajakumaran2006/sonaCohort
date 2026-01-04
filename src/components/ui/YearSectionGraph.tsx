'use client'

import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
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
      <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm h-full">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</h3>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-[10px] font-bold text-gray-400 uppercase">Tutors</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-[10px] font-bold text-gray-400 uppercase">Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
              <span className="text-[10px] font-bold text-gray-400 uppercase">Pending</span>
            </div>
          </div>
        </div>

        <div className="h-[300px] w-full flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
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

  return (
    <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm hover:shadow-md transition-shadow h-full">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-[10px] font-bold text-gray-400 uppercase">Tutors</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-[10px] font-bold text-gray-400 uppercase">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            <span className="text-[10px] font-bold text-gray-400 uppercase">Pending</span>
          </div>
        </div>
      </div>

      <div className="w-full" style={{ height: 'calc(100% - 48px)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 10 }}
            barGap={8}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
            <XAxis 
              dataKey="section" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6B7280', fontSize: 13, fontWeight: 600, letterSpacing: '0.02em' }}
              dy={8}
              height={40}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6B7280', fontSize: 13, fontWeight: 600 }}
              width={40}
            />
            <Tooltip
              cursor={{ fill: '#F9FAFB' }}
              contentStyle={{
                borderRadius: '16px',
                border: 'none',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                padding: '12px 16px'
              }}
              labelStyle={{ fontWeight: 700, marginBottom: '8px', color: '#111827', fontSize: '13px' }}
              itemStyle={{ fontSize: '12px', fontWeight: 600 }}
            />
            <Bar 
              dataKey="tutors" 
              fill="#3B82F6" 
              radius={[4, 4, 0, 0]} 
              barSize={24}
              name="Peer Tutors"
            />
            <Bar 
              dataKey="completed" 
              fill="#10B981" 
              radius={[4, 4, 0, 0]} 
              barSize={24}
              name="Completed Classes"
            />
            <Bar 
              dataKey="pending" 
              fill="#F97316" 
              radius={[4, 4, 0, 0]} 
              barSize={24}
              name="Pending Classes"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
