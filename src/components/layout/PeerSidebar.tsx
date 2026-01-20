'use client'

import Image from 'next/image'
import { useState, useMemo } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { logger } from '@/lib/logger'
import { ExamService } from '@/lib/services/examService'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { FileText, LogOut, User } from 'lucide-react'
import { DashboardIcon, ClassesIcon, AttendanceIcon, ReportsIcon, LeftArrowIcon } from './PeerSidebarIcons'

interface PeerSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function PeerSidebar({ isOpen, onClose }: PeerSidebarProps) {
  const { signOut, user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  
  // Use custom hook for sidebar collapsed state
  const [isCollapsed, setIsCollapsed] = useSidebarCollapsed()
  
  const handleToggleCollapse = () => {
    const nextCollapsed = !isCollapsed
    setIsCollapsed(nextCollapsed)
    
    // Dispatch event for other components
    if (typeof window !== 'undefined') {
       window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { isCollapsed: nextCollapsed } }))
    }
  }

  // Fetch peer tutor info with caching
  const { data: peertutors } = useQuery({
    queryKey: ['peer-tutor-info', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await peertutorsAuthService.getpeertutorsByEmail(user.email)
    },
    enabled: !!user?.email,
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  })

  // Check if peer tutor has access to exams (check once and cache)
  const { data: hasExamAccess } = useQuery({
    queryKey: ['peer-exam-access', peertutors?.year],
    queryFn: async () => {
      if (!peertutors?.year) return false
      const exams = await ExamService.getExamsByYear(peertutors.year)
      return exams.length > 0
    },
    enabled: !!peertutors?.year,
    staleTime: 10 * 60 * 1000, // 10 minutes - cache for a long time
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch on mount if data exists
  })

  // Memoize navigation to prevent recreation on every render
  const navigation = useMemo(() => {
    // Base navigation items (excluding Reports which we want last)
    const baseNavigation = [
        { name: 'Dashboard', href: '/peer/dashboard', Icon: DashboardIcon },
        { name: 'Classes', href: '/peer/classes', Icon: ClassesIcon },
        { name: 'Attendance', href: '/peer/attendance', Icon: AttendanceIcon },
    ]

    const examNavItem = { name: 'Exams', href: '/peer/exams', Icon: FileText }
    const reportsNavItem = { name: 'Reports', href: '/peer/reports', Icon: ReportsIcon }

    const items = [...baseNavigation]
    
    // Add Exams if access is allowed
    if (hasExamAccess) {
      items.push(examNavItem)
    }

    // Always add Reports at the end
    items.push(reportsNavItem)

    return items
  }, [hasExamAccess])



  const handleSignOut = async () => {
    setIsLoggingOut(true)
    try {
      await signOut()
      router.push('/')
    } catch (error) {
      logger.error('Error signing out:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  // On mobile (when sidebar is open), always show expanded view
  // isCollapsed only affects desktop (lg) viewport
  const showCollapsed = isCollapsed && !isOpen

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 bg-[#0f291e] shadow-2xl transform transition-all duration-300 ease-in-out flex flex-col
        ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
        ${isCollapsed && !isOpen ? 'lg:w-20' : 'lg:w-64'}
        max-w-[85vw] border-r border-[#1a3d2e]
      `}>
        {/* Logo */}
        <div className={`flex items-center h-28 flex-shrink-0 ${showCollapsed ? 'lg:px-4 lg:justify-center pl-6 pr-6' : 'pl-6 pr-6'} pt-8 mb-10 transition-all`}>
          <div className={`flex items-center gap-4 ${showCollapsed ? 'lg:justify-center w-full' : 'w-full'}`}>
            <div className={`relative flex-shrink-0 rounded-xl overflow-hidden bg-white/5 p-2 ${showCollapsed ? 'lg:w-14 lg:h-14 w-16 h-16' : 'w-16 h-16'}`}>
              <Image
                src="/peers.png"
                alt="Peers Logo"
                width={64}
                height={64}
                className="object-contain"
                priority
              />
            </div>
            <div className={`flex flex-col ${showCollapsed ? 'lg:hidden' : ''}`}>
              <span className="text-2xl font-black text-white tracking-[0.2em] leading-none mb-1.5">
                SONA
              </span>
              <span className="text-xl font-bold text-[#bef264] tracking-[0.3em] leading-none uppercase">
                Cohort
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 overflow-y-auto custom-scrollbar">
          <div className={`px-2 mb-4 text-[10px] font-black text-gray-500 tracking-[0.2em] uppercase pl-4 ${showCollapsed ? 'lg:hidden' : ''}`}>
            Menu
          </div>
          <div className="space-y-1.5">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
              const Icon = item.Icon
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={`
                    w-full flex items-center rounded-xl transition-all duration-200 group relative
                    ${showCollapsed ? 'lg:justify-center lg:py-3 px-4 py-3 text-left' : 'px-4 py-3 text-left'}
                    ${isActive 
                      ? 'text-white' 
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }
                  `}
                  title={showCollapsed ? item.name : undefined}
                >
                  {isActive && !showCollapsed && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#bef264] rounded-r-full shadow-[0_0_10px_rgba(190,242,100,0.5)]" />
                  )}
                  {isActive && showCollapsed && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#bef264] rounded-r-full shadow-[0_0_10px_rgba(190,242,100,0.5)] hidden lg:block" />
                  )}
                  <Icon className={`w-5 h-5 ${showCollapsed ? 'lg:mr-0 mr-3' : 'mr-3'} ${isActive ? 'text-[#bef264]' : 'text-gray-400 group-hover:text-white transition-colors'}`} />
                  <span className={`text-xs font-bold uppercase tracking-wider ${isActive ? 'text-white' : ''} ${showCollapsed ? 'lg:hidden' : ''}`}>
                    {item.name}
                  </span>
                </Link>
              )
            })}
          </div>
          
          {/* Collapse Toggle Button - Desktop Only */}
          <div className={`mt-8 hidden lg:flex ${isCollapsed ? 'justify-center' : 'justify-end px-2'}`}>
             <button
                onClick={handleToggleCollapse}
                className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-200 border border-transparent hover:border-white/10"
             >
                {isCollapsed ? <LeftArrowIcon className="h-4 w-4 rotate-180" /> : <LeftArrowIcon className="h-4 w-4" />}
             </button>
          </div>
        </nav>

        {/* Profile Section with Sign Out - Always at bottom */}
        <div className="border-t border-[#1a3d2e] bg-[#0c2219]/50 flex-shrink-0 p-4 relative backdrop-blur-sm mt-auto">
          <div className={`flex items-center w-full rounded-xl ${showCollapsed ? 'lg:justify-center lg:flex-col lg:gap-4 justify-between' : 'justify-between'}`}>
            {/* Profile Info */}
            <div className={`flex items-center ${showCollapsed ? 'lg:justify-center gap-3 flex-1 min-w-0' : 'gap-3 flex-1 min-w-0 transition-colors'}`}>
              <div className="flex-shrink-0 relative group cursor-pointer">
                <div className="h-9 w-9 rounded-lg bg-[#1a3d2e] flex items-center justify-center overflow-hidden ring-1 ring-white/10 group-hover:ring-[#bef264]/50 transition-all">
                  <User className="h-5 w-5 text-gray-300" />
                </div>
                <div className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#bef264] border-2 border-[#0f291e]"></div>
              </div>
              <div className={`flex-1 min-w-0 ${showCollapsed ? 'lg:hidden' : ''}`}>
                <p className="text-xs font-bold text-white truncate uppercase tracking-wide">
                  {peertutors?.name || user?.user_metadata?.full_name || 'Peer Tutor'}
                </p>
                <p className="text-[10px] text-[#bef264] font-bold uppercase tracking-wider truncate opacity-80">
                  Tutor
                </p>
              </div>
            </div>
            
            {/* Sign Out Icon - Always visible on mobile */}
            <button
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className={`flex-shrink-0 p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-all duration-200 group ${showCollapsed ? 'lg:hidden' : ''}`}
              title="Sign Out"
            >
              <LogOut className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </button>
          </div>
          
          {/* Sign Out for Collapsed State - Desktop Only */}
          {isCollapsed && (
            <div className="mt-2 hidden lg:flex justify-center">
              <button
                onClick={handleSignOut}
                disabled={isLoggingOut}
                className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
