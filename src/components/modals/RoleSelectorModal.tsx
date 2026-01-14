'use client'

import { useEffect } from 'react'
import { UserRole } from '@/lib/services/roleDetectionService'
import { X, Shield, Users, BookOpen, UserCircle } from 'lucide-react'

interface RoleSelectorModalProps {
  isOpen: boolean
  roles: UserRole[]
  dashboardPaths: Partial<Record<UserRole, string>>
  onSelectRole: (role: UserRole) => void
  onClose: () => void
}

const roleConfig: Record<UserRole, {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  color: string
  bgColor: string
  hoverBg: string
}> = {
  admin: {
    icon: Shield,
    label: 'Admin',
    description: 'Manage system settings and user access',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    hoverBg: 'hover:bg-purple-100'
  },
  faculty: {
    icon: Users,
    label: 'Faculty',
    description: 'Manage departments, classes, and peer tutors',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    hoverBg: 'hover:bg-blue-100'
  },
  peer: {
    icon: BookOpen,
    label: 'Peer Tutor',
    description: 'View assignments and manage tutoring sessions',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    hoverBg: 'hover:bg-emerald-100'
  },
  student: {
    icon: UserCircle,
    label: 'Student',
    description: 'Access learning materials and submit feedback',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    hoverBg: 'hover:bg-orange-100'
  }
}

export default function RoleSelectorModal({
  isOpen,
  roles,
  dashboardPaths: _dashboardPaths,
  onSelectRole,
  onClose
}: RoleSelectorModalProps) {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-[2rem] shadow-2xl max-w-lg w-full p-8 animate-in slide-in-from-bottom-4 duration-300">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10B981]"></span>
            <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">Multiple Roles Detected</span>
          </div>
          <h2 className="text-3xl font-bold uppercase text-gray-900 tracking-tight">
            Choose Your Role
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            Select which dashboard you&apos;d like to access
          </p>
        </div>

        {/* Role Options */}
        <div className="space-y-3">
          {roles.map((role) => {
            const config = roleConfig[role]
            const Icon = config.icon
            
            return (
              <button
                key={role}
                onClick={() => onSelectRole(role)}
                className={`w-full p-5 rounded-2xl border-2 border-transparent ${config.bgColor} ${config.hoverBg} hover:border-gray-200 transition-all duration-200 text-left group hover:shadow-lg`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`p-3 rounded-xl bg-white shadow-sm group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-6 h-6 ${config.color}`} />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1">
                    <h3 className={`text-lg font-bold ${config.color} mb-1 uppercase tracking-tight`}>
                      {config.label}
                    </h3>
                    <p className="text-xs text-gray-600 font-medium">
                      {config.description}
                    </p>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center">
                    <svg 
                      className={`w-5 h-5 ${config.color} opacity-0 group-hover:opacity-100 transform translate-x-0 group-hover:translate-x-1 transition-all`}
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center">
            You can always switch roles by signing in again
          </p>
        </div>
      </div>
    </div>
  )
}
