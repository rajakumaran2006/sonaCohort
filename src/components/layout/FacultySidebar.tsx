'use client'

import React, { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { LayoutGrid, Users, GraduationCap, ClipboardList, FileText, BarChart3, User, LogOut, ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { logger } from '@/lib/logger'
import FacultyCommandPalette from '@/components/features/search/FacultyCommandPalette'

interface FacultySidebarProps {
  isOpen: boolean
  onClose: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export default function FacultySidebar({ isOpen, onClose, onToggleCollapse }: FacultySidebarProps) {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isCollapsed, setIsCollapsed] = useSidebarCollapsed()

  const handleToggleCollapse = () => {
    const nextCollapsed = !isCollapsed
    setIsCollapsed(nextCollapsed)
    
    // Dispatch event is handled by hook's setter/effect loop usually, 
    // but the hook in this codebase seems to LISTEN to events but maybe not dispatch them from setter?
    // Let's check the hook code again.
    // The hook writes to localStorage. It listens to 'sidebar-toggle'.
    // It DOES NOT dispatch 'sidebar-toggle' when setter is called.
    // So we should dispatch it here to ensure other components (like page.tsx) update if they are listening.
    // Wait, page.tsx uses the SAME hook.
    // If page.tsx uses the same hook, does it update?
    // React state is local to the hook instance unless it uses a context or external store.
    // The hook uses `useState`. So each component gets its own state.
    // They sync via `storage` event (cross-tab) and `sidebar-toggle` (same tab).
    // So YES, I MUST dispatch the event here for the other hook instance to pick it up.
    
    if (typeof window !== 'undefined') {
       window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { isCollapsed: nextCollapsed } }))
    }
    
    if (onToggleCollapse) {
      onToggleCollapse()
    }
  }

  const navigation = [
    { 
      name: 'DASHBOARD', 
      href: '/faculty/dashboard', 
      Icon: LayoutGrid,
      relatedPaths: ['/faculty/department', '/faculty/renumeration']
    },
    { name: 'STUDENTS', href: '/faculty/peer-tutor', Icon: Users },
    { name: 'CLASSES', href: '/faculty/classes', Icon: GraduationCap },
    { name: 'ATTENDANCE', href: '/faculty/attendance', Icon: ClipboardList },
    { name: 'EXAMS', href: '/faculty/exams', Icon: FileText },
    { 
      name: 'ANALYTICS', 
      href: '/faculty/analytics', 
      Icon: BarChart3,
      relatedPaths: ['/faculty/feedback-analytics']
    },
    { name: 'FACULTY', href: '/faculty/manage-faculty', Icon: User },
  ]



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
      <FacultyCommandPalette />
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        suppressHydrationWarning
        className={`
          fixed inset-y-0 left-0 z-50 bg-[#1C2434] shadow-lg transform transition-all duration-300 ease-in-out flex flex-col
          ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed && !isOpen ? 'lg:w-20' : 'lg:w-64'}
        `}
        data-sidebar-collapsed={isCollapsed}
      >
        {/* Logo Header */}
        <div className={`flex items-center h-20 flex-shrink-0 ${showCollapsed ? 'lg:px-4 lg:justify-center px-6' : 'px-6'} pt-6 mb-6 transition-all duration-300`}>
          <div className={`flex items-center ${showCollapsed ? 'lg:justify-center gap-3' : 'gap-3'}`}>
            <div className={`relative flex-shrink-0 rounded-xl overflow-hidden bg-white/5 p-2 ${showCollapsed ? 'lg:w-10 lg:h-10 w-12 h-12' : 'w-12 h-12'}`}>
              <Image 
                src="/peers.png" 
                alt="Peers Logo" 
                width={48}
                height={48}
                className="object-contain"
                priority
              />
            </div>
            <span className={`flex flex-col mb-0 text-[22px] leading-none font-bold text-white tracking-wide whitespace-nowrap ${showCollapsed ? 'lg:hidden' : ''}`}>
              SONA<span className="text-[#bef264]">COHORT</span>
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 overflow-y-auto">
          <div className={`px-4 mb-4 text-xs font-bold text-gray-500 tracking-wider uppercase ${showCollapsed ? 'lg:hidden' : ''}`}>
            Menu
          </div>
          <div className="space-y-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href || 
                              pathname?.startsWith(`${item.href}/`) || 
                              (item.relatedPaths && item.relatedPaths.some(path => pathname?.startsWith(path)))
              
              const Icon = item.Icon
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={`
                    w-full flex items-center rounded-lg transition-all duration-200 group relative
                    ${showCollapsed ? 'lg:justify-center lg:py-4 px-4 py-3 text-left' : 'px-4 py-3 text-left'}
                    ${isActive
                      ? 'text-white'
                      : 'text-gray-400 hover:text-white'
                    }
                  `}
                  title={showCollapsed ? item.name : undefined}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#bef264] rounded-r-full" />
                  )}
                  <Icon className={`w-5 h-5 ${showCollapsed ? 'lg:mr-0 mr-3' : 'mr-3'} ${isActive ? 'text-[#bef264]' : 'text-gray-400 group-hover:text-white'}`} />
                  <span className={`font-medium ${showCollapsed ? 'lg:hidden' : ''}`}>{item.name}</span>
                </Link>

              )
            })}
          </div>
          
          {/* Toggle Button - Desktop Only */}
          <div className={`mt-8 hidden lg:flex ${isCollapsed ? 'justify-center' : 'justify-end px-4'}`}>
            <button
              onClick={handleToggleCollapse}
              className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-200"
            >
              {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
          </div>

        </nav>



        {/* Profile Section with Sign Out - Always at bottom */}
        <div className="border-t border-gray-800 flex-shrink-0 p-4 mt-auto">
          <div className={`flex items-center w-full rounded-lg p-2 ${showCollapsed ? 'lg:justify-center justify-between' : 'justify-between'}`}>
            {/* Profile Info */}
            <Link 
              href="/faculty/settings"
              onClick={onClose}
              className={`flex items-center ${showCollapsed ? 'lg:flex-col lg:gap-0 gap-3 flex-1 min-w-0' : 'gap-3 flex-1 min-w-0'} hover:bg-white/5 rounded-lg p-2 transition-colors`}
              title={showCollapsed ? 'Settings' : undefined}
            >
              <div className="flex-shrink-0 relative">
                <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden ring-2 ring-[#bef264] ring-offset-2 ring-offset-[#0f291e]">
                  <User className="h-6 w-6 text-gray-300" />
                </div>
                <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[#bef264] border-2 border-[#0f291e]"></div>
              </div>
              <div className={`flex-1 min-w-0 ${showCollapsed ? 'lg:hidden' : ''}`}>
                <p className="text-xs font-bold text-white truncate uppercase tracking-wide">
                  {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Faculty Member'}
                </p>
                <p className="text-[10px] text-[#bef264] font-bold uppercase tracking-wider truncate opacity-80">
                  Incharge
                </p>
              </div>
            </Link>
            
            {/* Sign Out Icon - Always visible on mobile, conditional on desktop */}
            <button
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className={`flex-shrink-0 p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-red-400 ${showCollapsed ? 'lg:hidden' : ''}`}
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
          
          {/* Sign Out for Collapsed State - Desktop Only */}
          {isCollapsed && (
            <div className="mt-2 hidden lg:block">
              <button
                onClick={handleSignOut}
                disabled={isLoggingOut}
                className="w-full flex justify-center py-3 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-red-400"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
