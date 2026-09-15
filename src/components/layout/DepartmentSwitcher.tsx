'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useFacultyDepartment } from '@/lib/contexts/FacultyDepartmentContext'
import { usePeerDepartment } from '@/lib/contexts/PeerDepartmentContext'
import { 
  Building2, 
  ChevronDown, 
  Check, 
  RefreshCw, 
  Loader2, 
  Sparkles,
  Calendar,
  Layers
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

interface DepartmentSwitcherProps {
  isCollapsed?: boolean
  className?: string
  theme?: 'dark-green' | 'dark-blue'
  type?: 'faculty' | 'peer'
}

function FacultyDepartmentSwitcher({
  isCollapsed = false,
  className = '',
  theme = 'dark-green',
}: DepartmentSwitcherProps) {
  const facultyContext = useFacultyDepartment()
  const [isOpen, setIsOpen] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!facultyContext) return null

  const { activeDepartment, departments, selectDepartment, isLoading } = facultyContext
  const hasMultiple = departments.length > 1
  const currentName = activeDepartment?.name || 'Department'

  const containerBg = theme === 'dark-blue' 
    ? 'bg-[#1C2434]/80 border-gray-700/60' 
    : 'bg-white/5 border-white/10'

  const popoverBg = theme === 'dark-blue' 
    ? 'bg-[#1C2434] border-gray-700 shadow-2xl shadow-black/80' 
    : 'bg-[#0f291e] border-white/15 shadow-2xl shadow-black/90'

  const handleSwitch = async (deptId: string) => {
    if (deptId === activeDepartment?.id) {
      setIsOpen(false)
      return
    }

    setSwitchingId(deptId)
    try {
      selectDepartment(deptId)
      // Short pause to show seamless transition state
      await new Promise(res => setTimeout(res, 200))
      setIsOpen(false)
    } catch (err) {
      logger.error('Error switching department:', err)
    } finally {
      setSwitchingId(null)
    }
  }

  // Collapsed Mode
  if (isCollapsed) {
    if (!hasMultiple) {
      return (
        <div className={cn('flex justify-center my-2 opacity-80', className)}>
          <div 
            className={cn('p-2.5 rounded-xl border flex items-center justify-center', containerBg)} 
            title={`Dept: ${currentName}`}
          >
            <Building2 className="w-5 h-5 text-[#bef264]" />
          </div>
        </div>
      )
    }

    return (
      <div className={cn('relative flex justify-center my-2', className)} ref={popoverRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'p-2.5 rounded-xl border transition-all duration-200 group relative flex items-center justify-center hover:border-[#bef264]/40',
            containerBg
          )}
          title={`Switch Department (${departments.length} Available)`}
        >
          <Building2 className="w-5 h-5 text-[#bef264] group-hover:scale-110 transition-transform" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#bef264] rounded-full ring-2 ring-[#0f291e]" />
        </button>

        {isOpen && (
          <div
            className={cn(
              'absolute left-full ml-3 top-0 w-64 p-2 rounded-2xl border z-50 animate-in fade-in zoom-in-95 duration-150',
              popoverBg
            )}
          >
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#bef264] flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> Switch Department
              </span>
              {isLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
            </div>

            <div className="py-1 space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
              {departments.map((dept) => {
                const isSelected = dept.id === activeDepartment?.id
                const isProcessing = switchingId === dept.id

                return (
                  <button
                    key={dept.id}
                    onClick={() => handleSwitch(dept.id)}
                    disabled={isProcessing}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between transition-all group',
                      isSelected
                        ? 'bg-white/15 text-white font-bold'
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="truncate">
                        <p className="text-xs font-bold truncate">{dept.name}</p>
                        {dept.faculty_name && (
                          <p className="text-[10px] text-gray-400 truncate font-normal">{dept.faculty_name}</p>
                        )}
                      </div>
                    </div>

                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#bef264] flex-shrink-0 ml-2" />
                    ) : isSelected ? (
                      <Check className="w-4 h-4 text-[#bef264] flex-shrink-0 ml-2" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Expanded Mode - Read only when 1 department
  if (!hasMultiple) {
    return (
      <div className={cn('my-2 px-3', className)}>
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-1.5 flex items-center px-1">
          <span className="flex items-center gap-1.5 text-gray-300">
            <Building2 className="w-3 h-3 text-[#bef264]" /> Department
          </span>
        </div>

        <div className={cn('w-full p-2.5 rounded-2xl border flex items-center justify-between opacity-90', containerBg)}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl border flex-shrink-0 bg-emerald-400/10 border-emerald-400/30">
              <Building2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white uppercase tracking-wide truncate block">
                {currentName}
              </span>
              <p className="text-[10px] text-gray-400 truncate">{activeDepartment?.faculty_name || 'Active Workspace'}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Expanded Mode - Interactive dropdown when >1 departments
  return (
    <div className={cn('relative my-2 px-3', className)} ref={popoverRef}>
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-1.5 flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-gray-300">
          Active Department
        </span>
      </div>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full p-2.5 rounded-2xl border flex items-center justify-between transition-all duration-200 group text-left shadow-sm hover:border-[#bef264]/40',
          containerBg
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="truncate">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white uppercase tracking-wide truncate">
                {currentName}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 truncate">Tap to switch department</p>
          </div>
        </div>

        <ChevronDown
          className={cn(
            'w-4 h-4 text-gray-400 group-hover:text-white transition-transform duration-200 flex-shrink-0 ml-2',
            isOpen && 'rotate-180 text-[#bef264]'
          )}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute left-3 right-3 bottom-full mb-2 p-2 rounded-2xl border z-50 animate-in fade-in slide-in-from-bottom-2 duration-150',
            popoverBg
          )}
        >
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#bef264] flex items-center gap-1.5">
             Select Department
            </span>
            {isLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
          </div>

          <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
            {departments.map((dept) => {
              const isSelected = dept.id === activeDepartment?.id
              const isProcessing = switchingId === dept.id

              return (
                <button
                  key={dept.id}
                  onClick={() => handleSwitch(dept.id)}
                  disabled={isProcessing}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between transition-all group',
                    isSelected
                      ? 'bg-white/15 text-white font-bold'
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold truncate">{dept.name}</p>
                        {dept.semester_type && (
                          <span className="text-[8px] bg-[#bef264]/20 text-[#bef264] px-1.5 py-0.5 rounded font-bold uppercase">
                            {dept.semester_type}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {dept.faculty_name && (
                          <p className="text-[10px] text-gray-400 truncate font-normal">{dept.faculty_name}</p>
                        )}
                        {dept.academic_year && (
                          <p className="text-[9px] text-emerald-400/80 truncate font-mono">({dept.academic_year})</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#bef264] flex-shrink-0 ml-2" />
                  ) : isSelected ? (
                    <Check className="w-4 h-4 text-[#bef264] flex-shrink-0 ml-2" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function PeerDepartmentSwitcher({
  isCollapsed = false,
  className = '',
}: DepartmentSwitcherProps) {
  const peerContext = usePeerDepartment()
  const [isOpen, setIsOpen] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!peerContext) return null

  const { activePeerTutor, allocations, selectDepartment, isLoading } = peerContext
  const hasMultiple = allocations.length > 1
  const currentName = activePeerTutor ? `${activePeerTutor.dept} (Sec ${activePeerTutor.section})` : 'Department'

  const containerBg = 'bg-white/5 border-white/10'
  const popoverBg = 'bg-[#0f291e] border-white/15 shadow-2xl shadow-black/90'

  const handleSwitch = async (tutorId: string) => {
    if (tutorId === activePeerTutor?.id) {
      setIsOpen(false)
      return
    }

    setSwitchingId(tutorId)
    try {
      selectDepartment(tutorId)
      await new Promise(res => setTimeout(res, 200))
      setIsOpen(false)
    } catch (err) {
      logger.error('Error switching peer department:', err)
    } finally {
      setSwitchingId(null)
    }
  }

  if (isCollapsed) {
    if (!hasMultiple) {
      return (
        <div className={cn('flex justify-center my-2 opacity-80', className)}>
          <div className={cn('p-2.5 rounded-xl border flex items-center justify-center', containerBg)} title={`Dept: ${currentName}`}>
            <Building2 className="w-5 h-5 text-[#bef264]" />
          </div>
        </div>
      )
    }

    return (
      <div className={cn('relative flex justify-center my-2', className)} ref={popoverRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'p-2.5 rounded-xl border transition-all duration-200 group relative flex items-center justify-center hover:border-[#bef264]/40',
            containerBg
          )}
          title={`Switch Allocation (${allocations.length} Available)`}
        >
          <Building2 className="w-5 h-5 text-[#bef264] group-hover:scale-110 transition-transform" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#bef264] rounded-full ring-2 ring-[#0f291e]" />
        </button>

        {isOpen && (
          <div className={cn('absolute left-full ml-3 top-0 w-64 p-2 rounded-2xl border z-50 animate-in fade-in zoom-in-95 duration-150', popoverBg)}>
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#bef264] flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> Switch Allocation
              </span>
              {isLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
            </div>

            <div className="py-1 space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
              {allocations.map((alloc) => {
                const isSelected = alloc.id === activePeerTutor?.id
                const isProcessing = switchingId === alloc.id

                return (
                  <button
                    key={alloc.id}
                    onClick={() => handleSwitch(alloc.id)}
                    disabled={isProcessing}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between transition-all group',
                      isSelected ? 'bg-white/15 text-white font-bold' : 'text-gray-300 hover:text-white hover:bg-white/10'
                    )}
                  >
                    <div className="truncate min-w-0">
                      <p className="text-xs font-bold truncate">{alloc.dept}</p>
                      <p className="text-[10px] text-gray-400 truncate font-normal">Year {alloc.year} - Sec {alloc.section}</p>
                    </div>

                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#bef264] flex-shrink-0 ml-2" />
                    ) : isSelected ? (
                      <Check className="w-4 h-4 text-[#bef264] flex-shrink-0 ml-2" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (!hasMultiple) {
    return (
      <div className={cn('my-2 px-3', className)}>
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-1.5 flex items-center px-1">
          <span className="flex items-center gap-1.5 text-gray-300">
            <Building2 className="w-3 h-3 text-[#bef264]" /> Allocation
          </span>
        </div>

        <div className={cn('w-full p-2.5 rounded-2xl border flex items-center justify-between opacity-90', containerBg)}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl border flex-shrink-0 bg-sky-400/10 border-sky-400/30">
              <Building2 className="w-4 h-4 text-sky-400" />
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white uppercase tracking-wide truncate block">
                {currentName}
              </span>
              <p className="text-[10px] text-gray-400 truncate">Year {activePeerTutor?.year} · Active</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('relative my-2 px-3', className)} ref={popoverRef}>
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-1.5 flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-gray-300">
          <RefreshCw className="w-3 h-3 text-[#bef264]" /> Active Dept
        </span>
        <span className="text-[9px] bg-[#bef264]/20 text-[#bef264] px-2 py-0.5 rounded-full font-bold">
          {allocations.length} Available
        </span>
      </div>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full p-2.5 rounded-2xl border flex items-center justify-between transition-all duration-200 group text-left shadow-sm hover:border-[#bef264]/40',
          containerBg
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl border flex-shrink-0 bg-sky-400/10 border-sky-400/30">
            <Building2 className="w-4 h-4 text-sky-400" />
          </div>
          <div className="truncate">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white uppercase tracking-wide truncate">
                {currentName}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 truncate">Tap to switch department</p>
          </div>
        </div>

        <ChevronDown
          className={cn(
            'w-4 h-4 text-gray-400 group-hover:text-white transition-transform duration-200 flex-shrink-0 ml-2',
            isOpen && 'rotate-180 text-[#bef264]'
          )}
        />
      </button>

      {isOpen && (
        <div className={cn('absolute left-3 right-3 bottom-full mb-2 p-2 rounded-2xl border z-50 animate-in fade-in slide-in-from-bottom-2 duration-150', popoverBg)}>
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#bef264] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Select Department / Section
            </span>
            {isLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
          </div>

          <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
            {allocations.map((alloc) => {
              const isSelected = alloc.id === activePeerTutor?.id
              const isProcessing = switchingId === alloc.id

              return (
                <button
                  key={alloc.id}
                  onClick={() => handleSwitch(alloc.id)}
                  disabled={isProcessing}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between transition-all group',
                    isSelected ? 'bg-white/15 text-white font-bold' : 'text-gray-300 hover:text-white hover:bg-white/10'
                  )}
                >
                  <div className="truncate min-w-0">
                    <p className="text-xs font-bold truncate">{alloc.dept}</p>
                    <p className="text-[10px] text-gray-400 truncate font-normal">Year {alloc.year} - Sec {alloc.section}</p>
                  </div>

                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#bef264] flex-shrink-0 ml-2" />
                  ) : isSelected ? (
                    <Check className="w-4 h-4 text-[#bef264] flex-shrink-0 ml-2" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function DepartmentSwitcher(props: DepartmentSwitcherProps) {
  if (props.type === 'peer') {
    return <PeerDepartmentSwitcher {...props} />
  }
  return <FacultyDepartmentSwitcher {...props} />
}
