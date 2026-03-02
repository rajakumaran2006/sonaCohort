'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface YearData {
  year: string;
  pending: number;
  total: number;
}

interface WaterflowClassesProps {
  data: {
    all: YearData[];
    week: YearData[];
    month: YearData[];
  };
}

export default function WaterflowClasses({ data }: WaterflowClassesProps) {
  const [timeframe, setTimeframe] = React.useState<'all' | 'week' | 'month'>('all');
  const currentData = data[timeframe];
  // Find the maximum pending value to scale the bars
  const maxPending = useMemo(() => {
    return Math.max(...currentData.map((d) => d.pending), 1); // Avoid division by zero
  }, [currentData]);

  // Determine the active (highest) or currently relevant bar if needed
  // Let's make the one with the highest pending classes the "active" dark bar, 
  // or simply the current year if we had one. For now, max pending gets highlighted.
  const activeIndex = useMemo(() => {
    let max = -1;
    let idx = -1;
    currentData.forEach((d, i) => {
      if (d.pending > max) {
        max = d.pending;
        idx = i;
      }
    });
    return idx;
  }, [currentData]);

  // Aggregate total pending
  const totalPending = useMemo(() => {
    return currentData.reduce((sum, d) => sum + d.pending, 0);
  }, [currentData]);

  return (
    <div className="relative w-full h-full flex flex-col justify-between rounded-3xl overflow-hidden bg-gradient-to-b from-[#AFC9C6] to-[#7B9E99] p-4 sm:p-6 min-h-[220px]">
      
      {/* Header Area to mock the "5,400 average steps" look */}
      <div className="flex items-start justify-between z-10">
        <div>
          <h3 className="text-3xl sm:text-4xl font-semibold text-gray-900 leading-none">
            {totalPending}
          </h3>
          <p className="text-xs sm:text-sm font-medium text-gray-700 mt-1">
            pending classes
          </p>
        </div>
        <div className="relative group/dropdown">
          <select 
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as 'all' | 'week' | 'month')}
            className="appearance-none bg-white/90 backdrop-blur text-gray-800 text-xs font-semibold pl-3 pr-7 py-1.5 rounded-full shadow-sm cursor-pointer outline-none hover:bg-white transition-colors"
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="all">All Time</option>
          </select>
          <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
            <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 flex items-end justify-between mt-8 gap-2 sm:gap-4 z-10 px-1 sm:px-4">
        {currentData.map((d, i) => {
          // Calculate height percentage (min 20% to fit the text)
          const heightPercent = Math.max((d.pending / maxPending) * 100, 20);
          const isActive = i === activeIndex;

          return (
            <div key={i} className="flex flex-col items-center justify-end w-full h-full group">
              <div 
                className={cn(
                  "relative w-full max-w-[48px] rounded-full flex flex-col justify-end transition-all duration-500 hover:scale-105 cursor-pointer pb-3",
                  isActive 
                    ? "bg-[#0A2E2A] text-white shadow-lg" // Dark active bar
                    : "bg-gradient-to-t from-white/40 to-white/80 text-gray-700 shadow-[inset_0_4px_10px_rgba(255,255,255,0.8),inset_0_-4px_10px_rgba(0,0,0,0.1)] border border-white/40 backdrop-blur-sm"
                )}
                style={{ height: `${heightPercent}%` }}
              >
                {/* Floating value on hover (optional enhancement) */}
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] font-bold py-1 px-2 rounded-lg pointer-events-none">
                  {d.pending}
                </div>
                
                {/* Embedded Label (e.g., Yr 1, Yr 2) */}
                <span className={cn(
                  "text-[10px] sm:text-xs font-bold text-center w-full",
                  isActive ? "text-white" : "text-gray-800"
                )}>
                  Yr {d.year}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      
    </div>
  );
}
