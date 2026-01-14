'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval,
  isToday,
  parseISO,
  isValid
} from 'date-fns'

interface DatePickerProps {
  value: string
  onChange: (date: string) => void
  disabledDates?: (string | Date)[]
  placeholder?: string
  className?: string
}

export default function DatePicker({ 
  value, 
  onChange, 
  disabledDates = [], 
  placeholder = "Select date",
  className = ""
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse value to Date object if it exists
  const selectedDate = value ? new Date(value) : null

  // Process disabled dates into a Set of timestamp strings for efficient lookup
  const disabledTimestamps = new Set(
    disabledDates.map(d => {
      const date = typeof d === 'string' ? new Date(d) : d
      // Reset time to midnight for accurate comparison
      if (isValid(date)) {
        const midnight = new Date(date)
        midnight.setHours(0, 0, 0, 0)
        return midnight.getTime()
      }
      return null
    }).filter(Boolean)
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
  
  const handleDateClick = (day: Date) => {
    // Check if disabled
    const midnight = new Date(day)
    midnight.setHours(0, 0, 0, 0)
    
    if (disabledTimestamps.has(midnight.getTime())) {
      return
    }

    // Format as YYYY-MM-DD for native input compatibility
    onChange(format(day, 'yyyy-MM-dd'))
    setIsOpen(false)
  }

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between mb-4 px-1">
        <button 
          onClick={(e) => { e.preventDefault(); prevMonth(); }}
          className="p-1 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-bold text-gray-900 uppercase tracking-wider">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button 
          onClick={(e) => { e.preventDefault(); nextMonth(); }}
          className="p-1 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    )
  }

  const renderDays = () => {
    const dateFormat = "EEEEE" // M, T, W, T, F, S, S
    const days = []
    let startDate = startOfWeek(currentMonth)

    for (let i = 0; i < 7; i++) {
        days.push(
            <div className="text-[10px] font-bold text-gray-400 uppercase text-center py-1" key={i}>
                {format(addDays(startDate, i), dateFormat)}
            </div>
        )
    }

    return <div className="grid grid-cols-7 mb-2">{days}</div>
  }

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(monthStart)
    const startDate = startOfWeek(monthStart)
    const endDate = endOfWeek(monthEnd)

    const rows = []
    let days = []
    let day = startDate
    let formattedDate = ""

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, "d")
        const cloneDay = day
        const midnight = new Date(cloneDay)
        midnight.setHours(0, 0, 0, 0)
        
        const isDisabled = disabledTimestamps.has(midnight.getTime())
        const isSelected = selectedDate && isSameDay(day, selectedDate)
        const isCurrentMonth = isSameMonth(day, monthStart)
        const isTodayDate = isToday(day)

        days.push(
          <div
            className={`
              relative w-full aspect-square flex items-center justify-center text-xs rounded-full m-0.5 transition-all
              ${!isCurrentMonth ? "text-gray-300 pointer-events-none" : ""}
              ${isDisabled 
                  ? "text-gray-300 bg-gray-50 cursor-not-allowed line-through decoration-gray-400" 
                  : "cursor-pointer hover:bg-gray-100 font-medium text-gray-700"}
              ${isSelected && !isDisabled ? "bg-black text-white hover:bg-gray-800 font-bold shadow-md" : ""}
              ${isTodayDate && !isSelected && !isDisabled ? "text-blue-600 font-bold bg-blue-50" : ""}
            `}
            key={day.toString()}
            onClick={(e) => {
                e.preventDefault()
                // Only allow clicking if current month and not disabled
                // (Though design-wise we might show prev/next month days, usually better to restrict selection to valid ones or strictly current view)
                // Here we allow selecting prev/next month days if they are in view and not disabled
                if (!isDisabled) {
                    handleDateClick(cloneDay)
                }
            }}
          >
            {formattedDate}
          </div>
        )
        day = addDays(day, 1)
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      )
      days = []
    }
    return <div className="mb-2">{rows}</div>
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        className="w-full relative cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-transparent hover:bg-white hover:border-gray-200 focus:bg-white focus:border-blue-500 rounded-xl text-sm font-medium transition-all outline-none flex items-center text-gray-900 min-h-[42px]">
            {value ? format(new Date(value), 'MMMM d, yyyy') : <span className="text-gray-400">{placeholder}</span>}
        </div>
        <CalendarIcon className="absolute left-3.5 top-3 text-gray-400 pointer-events-none" size={16} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 p-4 z-50 w-[300px] animate-in fade-in zoom-in-95 duration-200">
          {renderHeader()}
          {renderDays()}
          {renderCells()}
          
          <div className="mt-2 pt-3 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 uppercase tracking-wider">
             <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-gray-200"></div>
                <span>Disabled</span>
             </div>
             <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-black"></div>
                <span>Selected</span>
             </div>
             <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-100"></div>
                <span className="text-blue-500">Today</span>
             </div>
          </div>
        </div>
      )}
    </div>
  )
}
