'use client'

import { Building2, AtSign, CalendarDays, Users } from 'lucide-react'

interface ProfileHeaderProps {
  name: string
  email: string
  role: string
  department?: string
  year?: string
  section?: string
}

export default function ProfileHeader({
  name,
  email,
  role,
  department,
  year,
  section,
}: ProfileHeaderProps) {
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()
  }

  return (
    <div className="bg-white border border-gray-100 rounded-[2rem] p-6 sm:p-8 relative overflow-hidden shadow-sm">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-[60px] -mr-16 -mt-16 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-[40px] -ml-10 -mb-10 pointer-events-none"></div>
      
      <div className="relative z-10">
        {/* Top section: Avatar + Name */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 mb-6">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-[#1C2434] to-[#2D3748] flex items-center justify-center text-2xl sm:text-3xl font-black text-white shadow-xl flex-shrink-0">
            {getInitials(name)}
          </div>
          
          <div className="text-center sm:text-left flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-tight mb-1 truncate">{name}</h1>
            
            <span className="inline-block px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase tracking-widest mb-2">
              {role}
            </span>
            
            <div className="flex items-center justify-center sm:justify-start gap-2 text-gray-400 text-sm font-medium">
              <AtSign className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{email}</span>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        {(department || year || section) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5 border-t border-gray-100">
            {department && (
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-gray-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Department</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{department}</p>
                </div>
              </div>
            )}
            
            {year && (
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <CalendarDays className="w-4 h-4 text-gray-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Year</p>
                  <p className="text-sm font-bold text-gray-900">{year}</p>
                </div>
              </div>
            )}
            
            {section && (
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-gray-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Section</p>
                  <p className="text-sm font-bold text-gray-900">{section}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
