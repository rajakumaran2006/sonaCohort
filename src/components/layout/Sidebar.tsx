'use client'

import React, { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { LayoutGrid, BarChart3, User, LogOut, ChevronLeft, ChevronRight } from 'lucide-react'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  onToggleCollapse?: () => void
}

export default function Sidebar({ isOpen, onClose, onToggleCollapse }: SidebarProps) {
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
    
    if (onToggleCollapse) {
      onToggleCollapse()
    }
  }

  const navigation = [
    { name: 'Dashboard', href: '/admin/dashboard', Icon: LayoutGrid },
    { name: 'Analytics', href: '/admin/analytics', Icon: BarChart3 },
  ]

  const handleSignOut = async () => {
    setIsLoggingOut(true)
    try {
      await signOut()
      router.push('/')
    } catch (error) {
      console.error('Error signing out:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

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
        suppressHydrationWarning
        className={`
          fixed inset-y-0 left-0 z-50 bg-[#0f291e] shadow-lg transform transition-all duration-300 ease-in-out lg:flex lg:flex-col
          ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed ? 'lg:w-20' : 'w-64'}
        `}
        data-sidebar-collapsed={isCollapsed}
      >
        {/* Logo Header */}
        <div className={`flex items-center h-20 flex-shrink-0 ${isCollapsed ? 'px-4 justify-center' : 'px-6'} pt-6 mb-6 transition-all duration-300`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
            {/* Using text for logo if image is not desired, but matching faculty sidebar usually implies image too. 
                However, existing sidebar used text "PEER TUTOR". I will keep text or maybe add an icon if I had one. 
                I'll stick to text but styled like Faculty one if possible, or maybe a placeholder icon. 
                The user said "keep the same color as now". 
                I will use a layout similar to Faculty but with the existing title text style if no image.
            */}
             {!isCollapsed ? (
               <h1 className="font-bold text-white text-xl tracking-wide whitespace-nowrap">
                 PEER TUTOR
               </h1>
             ) : (
               <h1 className="font-bold text-white text-xl tracking-wide">
                 PT
               </h1>
             )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 overflow-y-auto">
          {!isCollapsed && (
            <div className="px-4 mb-4 text-xs font-bold text-gray-400 tracking-wider uppercase">
              Menu
            </div>
          )}
          <div className="space-y-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
              const Icon = item.Icon
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={`
                    w-full flex items-center rounded-lg transition-all duration-200 group relative
                    ${isCollapsed ? 'justify-center py-4' : 'px-4 py-3 text-left'}
                    ${isActive
                      ? 'text-white'
                      : 'text-gray-400 hover:text-white'
                    }
                  `}
                  title={isCollapsed ? item.name : undefined}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#bef264] rounded-r-full" />
                  )}
                  <Icon className={`w-5 h-5 ${isCollapsed ? '' : 'mr-3'} ${isActive ? 'text-[#bef264]' : 'text-gray-400 group-hover:text-white'}`} />
                  {!isCollapsed && <span className="font-medium">{item.name}</span>}
                </Link>
              )
            })}
          </div>
          
          {/* Toggle Button - Bottom Right */}
            <div className={`mt-8 flex ${isCollapsed ? 'justify-center' : 'justify-end px-4'}`}>
            <button
              onClick={handleToggleCollapse}
              className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-200 lg:flex hidden"
            >
              {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
            </div>

        </nav>

        {/* Profile Section with Sign Out */}
        <div className="border-t border-gray-800 flex-shrink-0 p-4">
          <div className={`flex items-center w-full rounded-lg p-2 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            {/* Profile Info */}
            <div 
              className={`flex items-center ${isCollapsed ? '' : 'gap-3 flex-1 min-w-0'} rounded-lg p-2 transition-colors`}
              title={isCollapsed ? 'Profile' : undefined}
            >
              <div className="flex-shrink-0 relative">
                <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden ring-2 ring-[#bef264] ring-offset-2 ring-offset-[#0f291e]">
                  <User className="h-6 w-6 text-gray-300" />
                </div>
                <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[#bef264] border-2 border-[#0f291e]"></div>
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Admin'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    Admin
                  </p>
                </div>
              )}
            </div>
            
            {/* Sign Out Icon */}
            {!isCollapsed && (
              <button
                onClick={handleSignOut}
                disabled={isLoggingOut}
                className="flex-shrink-0 p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-red-400"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
          
          {/* Sign Out for Collapsed State */}
          {isCollapsed && (
            <div className="mt-2">
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
