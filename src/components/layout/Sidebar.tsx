'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui'
import { LayoutDashboard, BarChart3, User, LogOut } from 'lucide-react'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const navigation = [
    { name: 'Dashboard', href: '/admin/dashboard', Icon: LayoutDashboard },
    { name: 'Analytics', href: '/admin/analytics', Icon: BarChart3 },
  ]

  const handleNavigation = (href: string) => {
    router.push(href)
    onClose()
  }

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
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:flex lg:flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-center h-16 bg-blue-600 flex-shrink-0 px-4">
        <h1 className="text-white text-4xl font-bold">PeerTutors</h1>
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
                    w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors duration-200
                    ${isActive 
                      ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-600' 
                      : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.name}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Profile Section */}
        <div className="px-4 py-4 border-t border-gray-200 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <User className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Admin User'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <div className="p-4 border-t border-gray-200 flex-shrink-0">
          <Button
            onClick={handleSignOut}
            disabled={isLoggingOut}
            variant="danger"
            className="w-full justify-center"
            loading={isLoggingOut}
          >
            {!isLoggingOut && <LogOut className="w-5 h-5 mr-2" />}
            {isLoggingOut ? 'Signing Out...' : 'Sign Out'}
          </Button>
        </div>
      </div>
    </>
  )
}
