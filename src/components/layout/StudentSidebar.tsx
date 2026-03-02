'use client'

import React, { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LayoutGrid, BookOpen, User, LogOut, ChevronLeft, ChevronRight } from 'lucide-react'
import { logger } from '@/lib/logger'

interface StudentSidebarProps {
  isOpen: boolean
  onClose: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export default function StudentSidebar({ isOpen, onClose, isCollapsed: initialCollapsed = false, onToggleCollapse }: StudentSidebarProps) {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Initialize from localStorage or prop
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('student-sidebar-collapsed')
      return saved ? JSON.parse(saved) : initialCollapsed
    }
    return initialCollapsed
  })

  // Update localStorage when collapse state changes
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('student-sidebar-collapsed', JSON.stringify(isCollapsed))
    }
  }, [isCollapsed])

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed)
    if (onToggleCollapse) {
      onToggleCollapse()
    }
    // Emit custom event for other components to listen
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sidebar-toggle'))
    }
  }

  const navigation = [
    { name: 'Dashboard', href: '/student/dashboard', Icon: LayoutGrid },
    { name: 'Classes', href: '/student/classes', Icon: BookOpen },
  ]

  const handleSignOut = async () => {
    setIsLoggingOut(true)
    try {
      await signOut()
      router.push('/login')
    } catch (error) {
      logger.error('Error signing out:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

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
      <div
        suppressHydrationWarning
        className={`
          fixed inset-y-0 left-0 z-50 bg-[#0f291e] shadow-2xl transform transition-all duration-300 ease-in-out flex flex-col
          ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed && !isOpen ? 'lg:w-20' : 'lg:w-64'}
          max-w-[85vw] border-r border-[#1a3d2e]
        `}
        data-sidebar-collapsed={isCollapsed}
      >
        {/* Logo Header */}
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
              const isActive = pathname === item.href || 
                              pathname?.startsWith(`${item.href}/`)
              
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

        {/* Toggle Button - Bottom Right */}
        <div className={`mt-8 hidden lg:flex ${isCollapsed ? 'justify-center' : 'justify-end px-2'}`}>
          <button
            onClick={handleToggleCollapse}
            className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-200 border border-transparent hover:border-white/10"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        </nav>

        {/* Profile Section */}
        <div className="border-t border-[#1a3d2e] bg-[#0c2219]/50 flex-shrink-0 p-4 relative backdrop-blur-sm">
          <div className={`flex items-center ${showCollapsed ? 'lg:justify-center lg:flex-col lg:gap-4 justify-between' : 'justify-between'}`}>
            <Link 
              href="/student/profile"
              className={`flex items-center ${showCollapsed ? 'lg:justify-center gap-3 min-w-0' : 'gap-3 min-w-0'} hover:bg-white/5 p-2 rounded-lg transition-colors`}
              title="Profile"
            >
              <div className="relative flex-shrink-0 group cursor-pointer">
                <div className="h-9 w-9 rounded-lg bg-[#1a3d2e] flex items-center justify-center overflow-hidden ring-1 ring-white/10 group-hover:ring-[#bef264]/50 transition-all">
                  <User className="h-5 w-5 text-gray-300" />
                </div>
                <div className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#bef264] border-2 border-[#0f291e]"></div>
              </div>
              
              <div className={`flex flex-col min-w-0 mr-2 ${showCollapsed ? 'lg:hidden' : ''}`}>
                <p className="text-xs font-bold text-white truncate uppercase tracking-wide">
                  {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Student'}
                </p>
              </div>
            </Link>

            {showCollapsed ? (
              <button
                onClick={handleSignOut}
                disabled={isLoggingOut}
                className={`
                  flex-shrink-0 p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-all duration-200 group
                  ${showCollapsed ? 'lg:w-full lg:flex lg:justify-center' : ''}
                `}
                title="Sign Out"
              >
                <LogOut className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
            ) : (
               <button
                onClick={handleSignOut}
                disabled={isLoggingOut}
                className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}