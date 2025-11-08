'use client'

import React, { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui'
import { LayoutDashboard, Users, User, LogOut, ChevronLeft, ChevronRight } from 'lucide-react'

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
    { name: 'Dashboard', href: '/student/dashboard', Icon: LayoutDashboard },
    { name: 'Students', href: '/student/students', Icon: Users },
  ] as const

  const handleNavigation = (href: string) => {
    router.push(href)
    onClose()
  }

  const handleSignOut = async () => {
    setIsLoggingOut(true)
    try {
      await signOut()
      router.push('/login')
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
        className={`
          fixed inset-y-0 left-0 z-50 bg-white shadow-lg transform transition-all duration-300 ease-in-out lg:flex lg:flex-col
          ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed ? 'lg:w-16' : 'w-64'}
        `}
        data-sidebar-collapsed={isCollapsed}
      >
        {/* Logo and Collapse Button */}
        <div className="flex items-center justify-between h-16 bg-blue-600 flex-shrink-0 px-4">
          <h1 className={`font-bold text-white transition-all duration-300 ${isCollapsed ? 'text-lg' : 'text-2xl'}`}>
            {isCollapsed ? 'SP' : 'STUDENT PORTAL'}
          </h1>
          <button
            onClick={handleToggleCollapse}
            className="p-1 rounded-md text-white hover:bg-blue-700 transition-colors duration-200 lg:flex hidden"
          >
            {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 mt-8 px-4">
          <div className="space-y-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.Icon
              return (
                <button
                  key={item.name}
                  onClick={() => handleNavigation(item.href)}
                  className={`
                    w-full flex items-center rounded-lg transition-colors group
                    ${isCollapsed ? 'px-2 py-3 justify-center' : 'px-4 py-3 text-left'}
                    ${isActive
                      ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-600'
                      : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                  title={isCollapsed ? item.name : undefined}
                >
                  <Icon className={`w-5 h-5 ${isCollapsed ? '' : 'mr-3'}`} />
                  {!isCollapsed && item.name}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Profile Section */}
        <div className={`border-t border-gray-200 flex-shrink-0 ${isCollapsed ? 'px-2 py-4' : 'px-4 py-4'}`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <User className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Student'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Logout Button */}
        <div className={`border-t border-gray-200 flex-shrink-0 ${isCollapsed ? 'p-2' : 'p-4'}`}>
          <Button
            onClick={handleSignOut}
            disabled={isLoggingOut}
            variant="danger"
            className={`w-full justify-center ${isCollapsed ? 'px-2' : 'px-4'}`}
            loading={isLoggingOut}
            title={isCollapsed ? 'Sign Out' : undefined}
          >
            {!isLoggingOut && <LogOut className={`w-5 h-5 ${isCollapsed ? '' : 'mr-2'}`} />}
            {!isCollapsed && (isLoggingOut ? 'Signing Out...' : 'Sign Out')}
          </Button>
        </div>
      </div>
    </>
  )
}