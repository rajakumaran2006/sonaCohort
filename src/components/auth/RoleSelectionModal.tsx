'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, GraduationCap, Users, User, Check, Loader2, LogOut } from 'lucide-react'

type UserRole = 'admin' | 'faculty' | 'peer' | 'student'

interface RoleSelectionModalProps {
  roles: UserRole[]
  onSelect: (role: UserRole) => void
  onSwitchAccount?: () => void
  isTransitioning?: boolean
}

const roleConfig = {
  admin: {
    label: 'Administrator',
    icon: Shield,
    description: 'System configuration and oversight',
    color: 'purple'
  },
  faculty: {
    label: 'Faculty',
    icon: Users,
    description: 'Manage classes and peer tutors',
    color: 'blue'
  },
  peer: {
    label: 'Peer Tutor',
    icon: GraduationCap,
    description: 'View schedule and mark attendance',
    color: 'indigo'
  },
  student: {
    label: 'Student',
    icon: User,
    description: 'Access learning resources',
    color: 'green'
  }
}

export default function RoleSelectionModal({ roles, onSelect, onSwitchAccount, isTransitioning }: RoleSelectionModalProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)

  const handleSelect = (role: UserRole) => {
    setSelectedRole(role)
    setTimeout(() => {
      onSelect(role)
    }, 300)
  }

  if (roles.length === 0) {
    return null
  }

  return (
    <div className="w-full max-w-md relative z-10 perspective-1000">
      <div className="bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] border border-white/60 p-8 sm:p-10 transition-all duration-500 hover:shadow-[0_48px_80px_-20px_rgba(0,0,0,0.12)]">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-2">Choose Your Role</h2>
          <p className="text-gray-500 font-medium text-sm"></p>
        </div>

        {/* Role Options */}
        <div className="grid grid-cols-1 gap-4">
            {roles.map((role) => {
              const config = roleConfig[role]
              const Icon = config.icon
              const isSelected = selectedRole === role

              return (
                <button
                  key={role}
                  onClick={() => handleSelect(role)}
                  disabled={isTransitioning}
                  className={`relative flex items-center p-4 rounded-2xl border-2 transition-all duration-300 text-left group ${
                    isSelected
                      ? 'border-green-500 bg-green-50/50 shadow-lg shadow-green-500/10 scale-[1.02]'
                      : 'border-transparent bg-white shadow-sm hover:border-green-200 hover:bg-green-50/30 hover:shadow-md hover:scale-[1.01]'
                  } ${isTransitioning ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`p-3.5 rounded-xl mr-4 transition-all duration-300 ${
                    isSelected 
                      ? 'bg-gradient-to-br from-green-500 to-lime-500 text-white shadow-md' 
                      : 'bg-gray-100 text-gray-500 group-hover:bg-green-100 group-hover:text-green-600'
                  }`}>
                    {isSelected && isTransitioning ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className={`font-bold text-sm uppercase tracking-wider ${isSelected ? 'text-green-900' : 'text-gray-900 group-hover:text-green-900'}`}>
                      {config.label}
                    </div>
                    <div className="text-[10px] font-medium text-gray-400 mt-1 uppercase tracking-widest">{config.description}</div>
                  </div>
                  {isSelected && !isTransitioning && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500">
                      <Check className="w-5 h-5" />
                    </div>
                  )}
                </button>
              )
            })}
        </div>

        {/* Switch Account Option */}
        {onSwitchAccount && (
          <div className="mt-8 pt-6 border-t border-gray-100/50">
            <button
              onClick={onSwitchAccount}
              disabled={isTransitioning}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold text-gray-400 hover:text-green-600 uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
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
