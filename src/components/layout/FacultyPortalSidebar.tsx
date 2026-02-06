'use client'

import React, { useState } from 'react'
import   { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { LayoutGrid, Users, GraduationCap, ClipboardList, FileText, User, LogOut, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'
import Image from 'next/image'
import { logger } from '@/lib/logger'

interface FacultyPortalSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function FacultyPortalSidebar({ isOpen, onClose }: FacultyPortalSidebarProps) {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isCollapsed, setIsCollapsed] = useSidebarCollapsed()

  const handleToggleCollapse = () => {
    const nextCollapsed = !isCollapsed
    setIsCollapsed(nextCollapsed)
    if (typeof window !== 'undefined') {
       window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { isCollapsed: nextCollapsed } }))
    }
  }

  const navigation = [
    { 
      name: 'MY SUBJECTS', 
      href: '/faculty-portal/dashboard', 
      Icon: BookOpen 
    },
    // Future additions: Profile, etc.
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
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 bg-[#1C2434] shadow-lg transform transition-all duration-300 ease-in-out flex flex-col
          ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed && !isOpen ? 'lg:w-20' : 'lg:w-64'}
        `}
      >
        {/* Logo Header */}
        <div className={`flex items-center h-20 flex-shrink-0 ${showCollapsed ? 'lg:px-4 lg:justify-center px-6' : 'px-6'} pt-6 mb-6`}>
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
            <span className={`flex flex-col mb-0 text-[18px] leading-none font-bold text-white tracking-wide whitespace-nowrap ${showCollapsed ? 'lg:hidden' : ''}`}>
              SONA<span className="text-emerald-400">COHORT</span>
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 overflow-y-auto">
          <div className="space-y-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.Icon
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={`
                    w-full flex items-center rounded-lg transition-all duration-200 group relative
                    ${showCollapsed ? 'lg:justify-center lg:py-4 px-4 py-3 text-left' : 'px-4 py-3 text-left'}
                    ${isActive ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}
                  `}
                  title={showCollapsed ? item.name : undefined}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-emerald-400 rounded-r-full" />
                  )}
                  <Icon className={`w-5 h-5 ${showCollapsed ? 'lg:mr-0 mr-3' : 'mr-3'} ${isActive ? 'text-emerald-400' : 'text-gray-400 group-hover:text-white'}`} />
                  <span className={`font-medium ${showCollapsed ? 'lg:hidden' : ''}`}>{item.name}</span>
                </Link>
              )
            })}
          </div>

           {/* Toggle Button */}
          <div className={`mt-8 hidden lg:flex ${isCollapsed ? 'justify-center' : 'justify-end px-4'}`}>
            <button
              onClick={handleToggleCollapse}
              className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-200"
            >
              {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        {/* Profile / Sign Out */}
        <div className="border-t border-gray-800 flex-shrink-0 p-4 mt-auto">
          <div className={`flex items-center w-full rounded-lg p-2 ${showCollapsed ? 'lg:justify-center justify-between' : 'justify-between'}`}>
             <div className={`flex items-center ${showCollapsed ? 'hidden' : 'gap-3 flex-1 min-w-0'}`}>
                <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center ring-2 ring-emerald-500">
                   <User className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Faculty'}</p>
                    <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
                </div>
             </div>
             
             <button
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="p-2 rounded-lg hover:bg-red-500/10 hover:text-red-400 text-gray-400 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
