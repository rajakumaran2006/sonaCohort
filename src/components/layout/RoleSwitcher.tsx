'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { RoleDetectionService, UserRole } from '@/lib/services/roleDetectionService'
import { 
  ShieldCheck, 
  Building2, 
  GraduationCap, 
  BookOpen, 
  ChevronDown, 
  Check, 
  RefreshCw, 
  Loader2,
  Sparkles
} from 'lucide-react'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'

export const ROLE_CONFIG: Record<UserRole, {
  label: string
  shortLabel: string
  description: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  badgeBg: string
  badgeText: string
}> = {
  admin: {
    label: 'Administrator',
    shortLabel: 'Admin',
    description: 'System & department management',
    path: '/admin/dashboard',
    icon: ShieldCheck,
    badgeBg: 'bg-[#bef264]/10 border-[#bef264]/30',
    badgeText: 'text-[#bef264]',
  },
  faculty: {
    label: 'Faculty Incharge',
    shortLabel: 'Faculty',
    description: 'Department & class management',
    path: '/faculty/dashboard',
    icon: Building2,
    badgeBg: 'bg-emerald-400/10 border-emerald-400/30',
    badgeText: 'text-emerald-400',
  },
  peer: {
    label: 'Peer Tutor',
    shortLabel: 'Peer Tutor',
    description: 'Classes & student attendance',
    path: '/peer/dashboard',
    icon: GraduationCap,
    badgeBg: 'bg-sky-400/10 border-sky-400/30',
    badgeText: 'text-sky-400',
  },
  student: {
    label: 'Student',
    shortLabel: 'Student',
    description: 'Class schedule & attendance',
    path: '/student/dashboard',
    icon: BookOpen,
    badgeBg: 'bg-purple-400/10 border-purple-400/30',
    badgeText: 'text-purple-400',
  },
}

interface RoleSwitcherProps {
  currentRole: UserRole
  isCollapsed?: boolean
  className?: string
  theme?: 'dark-green' | 'dark-blue'
}

export default function RoleSwitcher({
  currentRole,
  isCollapsed = false,
  className = '',
  theme = 'dark-green',
}: RoleSwitcherProps) {
  const { user, setUserMode } = useAuth()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [availableRoles, setAvailableRoles] = useState<UserRole[]>([])
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [switchingRole, setSwitchingRole] = useState<UserRole | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Fetch roles available for the current user
  useEffect(() => {
    let isMounted = true
    const detectRoles = async () => {
      if (!user?.email) {
        setAvailableRoles([currentRole])
        setLoadingRoles(false)
        return
      }

      try {
        const { roles } = await RoleDetectionService.detectUserRoles(user.email)
        if (isMounted) {
          if (roles && roles.length > 0) {
            setAvailableRoles(roles)
          } else {
            setAvailableRoles([currentRole])
          }
        }
      } catch (error) {
        logger.error('Error detecting roles for switcher:', error)
        if (isMounted) {
          setAvailableRoles([currentRole])
        }
      } finally {
        if (isMounted) setLoadingRoles(false)
      }
    }

    detectRoles()
    return () => {
      isMounted = false
    }
  }, [user?.email, currentRole])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleRoleSwitch = async (role: UserRole) => {
    if (role === currentRole) {
      setIsOpen(false)
      return
    }

    setSwitchingRole(role)
    try {
      localStorage.setItem('user_mode', role)
      if (setUserMode) {
        setUserMode(role)
      }

      await fetch('/api/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })

      const targetPath = ROLE_CONFIG[role]?.path || '/admin/dashboard'
      setIsOpen(false)
      router.push(targetPath)
    } catch (error) {
      logger.error('Error switching role:', error)
    } finally {
      setSwitchingRole(null)
    }
  }

  const CurrentIcon = ROLE_CONFIG[currentRole]?.icon || ShieldCheck
  const currentConfig = ROLE_CONFIG[currentRole] || ROLE_CONFIG.admin
  const hasMultipleRoles = availableRoles.length > 1

  const containerBg = theme === 'dark-blue' 
    ? 'bg-[#1C2434]/80 border-gray-700/60' 
    : 'bg-white/5 border-white/10'

  const popoverBg = theme === 'dark-blue' 
    ? 'bg-[#1C2434] border-gray-700 shadow-2xl shadow-black/80' 
    : 'bg-[#0f291e] border-white/15 shadow-2xl shadow-black/90'

  // Collapsed Mode
  if (isCollapsed) {
    if (!hasMultipleRoles) {
      return (
        <div className={cn('flex justify-center my-2 opacity-80', className)}>
          <div className={cn('p-2.5 rounded-xl border flex items-center justify-center', containerBg)} title={`Role: ${currentConfig.shortLabel}`}>
            <CurrentIcon className="w-5 h-5 text-[#bef264]" />
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
          title={`Switch Role (${availableRoles.length} Available)`}
        >
          <CurrentIcon className="w-5 h-5 text-[#bef264] group-hover:scale-110 transition-transform" />
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
                Switch Role
              </span>
              {loadingRoles && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
            </div>

            <div className="py-1 space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
              {availableRoles.map((role) => {
                const config = ROLE_CONFIG[role]
                if (!config) return null
                const Icon = config.icon
                const isSelected = role === currentRole
                const isProcessing = switchingRole === role

                return (
                  <button
                    key={role}
                    onClick={() => handleRoleSwitch(role)}
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
                        <p className="text-xs font-bold truncate">{config.label}</p>
                        <p className="text-[10px] text-gray-400 truncate font-normal">{config.description}</p>
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

  // Expanded Mode - Read Only single role if availableRoles <= 1
  if (!hasMultipleRoles) {
    return (
      <div className={cn('my-3 px-3', className)}>
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-1.5 flex items-center px-1">
          <span className="flex items-center gap-1.5 text-gray-300">
            <CurrentIcon className="w-3 h-3 text-[#bef264]" /> Role
          </span>
        </div>

        <div className={cn('w-full p-2.5 rounded-2xl border flex items-center justify-between opacity-90', containerBg)}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn('p-2 rounded-xl border flex-shrink-0', currentConfig.badgeBg)}>
              <CurrentIcon className={cn('w-4 h-4', currentConfig.badgeText)} />
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white uppercase tracking-wide truncate block">
                {currentConfig.shortLabel}
              </span>
              <p className="text-[10px] text-gray-400 truncate">{currentConfig.description}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Expanded Mode - Interactive dropdown when availableRoles > 1
  return (
    <div className={cn('relative my-3 px-3', className)} ref={popoverRef}>
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-1.5 flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-gray-300">
          Active Role
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
                {currentConfig.shortLabel}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 truncate">Tap to switch role</p>
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
             Select User Role
            </span>
            {loadingRoles && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
          </div>

          <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
            {availableRoles.map((role) => {
              const config = ROLE_CONFIG[role]
              if (!config) return null
              const Icon = config.icon
              const isSelected = role === currentRole
              const isProcessing = switchingRole === role

              return (
                <button
                  key={role}
                  onClick={() => handleRoleSwitch(role)}
                  disabled={isProcessing}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between transition-all group',
                    isSelected
                      ? 'bg-white/15 text-white font-bold border border-white/10'
                      : 'text-gray-300 hover:text-white hover:bg-white/10 border border-transparent'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="truncate">
                      <p className="text-xs font-bold truncate">{config.label}</p>
                      <p className="text-[10px] text-gray-400 truncate font-normal">{config.description}</p>
                    </div>
                  </div>

                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white uppercase flex-shrink-0 ml-2" />
                  ) : isSelected ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-md uppercase text-white/90 bg-[#bef264]/20 text-[#bef264] text-[10px] font-bold">
                      <Check className="w-3 h-3" /> Active
                    </span>
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
