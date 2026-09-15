'use client'

import { useState } from 'react'
import { Building2, Check, Loader2, LogOut, Calendar } from 'lucide-react'

export interface SelectableDepartment {
  id: string
  name: string
  faculty_name?: string
  academic_year?: string
  semester_type?: string | null
  year?: string
  section?: string
}

interface DepartmentSelectionModalProps {
  departments: SelectableDepartment[]
  onSelect: (departmentId: string) => void
  onSwitchAccount?: () => void
  isTransitioning?: boolean
  title?: string
  subtitle?: string
}

export default function DepartmentSelectionModal({
  departments,
  onSelect,
  onSwitchAccount,
  isTransitioning,
  title = 'Choose Your Department',
  subtitle = 'Select the department workspace to continue'
}: DepartmentSelectionModalProps) {
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)

  const handleSelect = (deptId: string) => {
    setSelectedDeptId(deptId)
    setTimeout(() => {
      onSelect(deptId)
    }, 250)
  }

  if (departments.length === 0) {
    return null
  }

  return (
    <div className="w-full max-w-md relative z-10 perspective-1000">
      <div className="bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] border border-white/60 p-8 sm:p-10 transition-all duration-500 hover:shadow-[0_48px_80px_-20px_rgba(0,0,0,0.12)]">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#bef264]/20 border border-[#bef264]/40 text-[#225039] mb-3 shadow-inner">
            <Building2 className="w-6 h-6 text-[#163a2b]" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-1">{title}</h2>
          <p className="text-gray-500 font-medium text-xs tracking-wide">{subtitle}</p>
        </div>

        {/* Department Options */}
        <div className="grid grid-cols-1 gap-3.5 max-h-[50vh] overflow-y-auto pr-1">
          {departments.map((dept) => {
            const isSelected = selectedDeptId === dept.id

            return (
              <button
                key={dept.id}
                onClick={() => handleSelect(dept.id)}
                disabled={isTransitioning}
                className={`relative flex items-center p-4 rounded-2xl border-2 transition-all duration-300 text-left group ${
                  isSelected
                    ? 'border-[#22c55e] bg-green-50/70 shadow-lg shadow-green-500/10 scale-[1.02]'
                    : 'border-transparent bg-white/90 shadow-sm hover:border-[#bef264]/60 hover:bg-green-50/30 hover:shadow-md hover:scale-[1.01]'
                } ${isTransitioning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`p-3 rounded-xl mr-3.5 transition-all duration-300 flex-shrink-0 ${
                  isSelected 
                    ? 'bg-gradient-to-br from-[#163a2b] to-[#22c55e] text-white shadow-md' 
                    : 'bg-gray-100 text-gray-500 group-hover:bg-[#bef264]/30 group-hover:text-[#163a2b]'
                }`}>
                  {isSelected && isTransitioning ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Building2 className="w-5 h-5" />
                  )}
                </div>

                <div className="flex-1 min-w-0 pr-6">
                  <div className={`font-black text-sm uppercase tracking-wider truncate ${isSelected ? 'text-green-950' : 'text-gray-900 group-hover:text-[#163a2b]'}`}>
                    {dept.name}
                  </div>
                  
                  {/* Meta Badges */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {dept.faculty_name && (
                      <span className="text-[10px] font-semibold text-gray-500 truncate">
                        {dept.faculty_name}
                      </span>
                    )}
                    {dept.year && dept.section && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">
                        Yr {dept.year} - Sec {dept.section}
                      </span>
                    )}
                    {dept.academic_year && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-green-100/80 text-green-700 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" /> {dept.academic_year}
                      </span>
                    )}
                    {dept.semester_type && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-[#bef264]/20 text-[#163a2b] px-1.5 py-0.5 rounded-md">
                        {dept.semester_type} sem
                      </span>
                    )}
                  </div>
                </div>

                {isSelected && !isTransitioning && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-600">
                    <Check className="w-5 h-5" />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Switch Account Option */}
        {onSwitchAccount && (
          <div className="mt-6 pt-5 border-t border-gray-100/60">
            <button
              onClick={onSwitchAccount}
              disabled={isTransitioning}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold text-gray-400 hover:text-green-700 uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              Use Different Account
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
