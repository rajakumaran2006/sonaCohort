'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui'
import { LayoutGrid, BarChart3, User, LogOut } from 'lucide-react'

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
    { name: 'Dashboard', href: '/admin/dashboard', Icon: LayoutGrid },
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
        fixed inset-y-0 left-0 z-50 w-64 bg-[#0f291e] shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:flex lg:flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center h-20 flex-shrink-0 px-6 pt-4 mb-6">
          <div className="flex items-center gap-3">
             <h1 className="font-bold text-white text-xl tracking-wide">
               PEER TUTOR
             </h1>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 overflow-y-auto">
          <div className="px-4 mb-4 text-xs font-bold text-gray-500 tracking-wider uppercase">
            Menu
          </div>
          <div className="space-y-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.Icon
              return (
                <button
                  key={item.name}
                  onClick={() => handleNavigation(item.href)}
                  className={`
                    w-full flex items-center px-4 py-3 text-left rounded-lg transition-all duration-200 group relative
                    ${isActive 
                      ? 'text-white' 
                      : 'text-gray-400 hover:text-white'
                    }
                  `}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#bef264] rounded-r-full" />
                  )}
                  <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-[#bef264]' : 'text-gray-400 group-hover:text-white'}`} />
                  <span className="font-medium">{item.name}</span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* Profile Section */}
        <div className="border-t border-gray-800 flex-shrink-0 p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 relative">
              <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden ring-2 ring-[#bef264] ring-offset-2 ring-offset-[#0f291e]">
                <User className="h-6 w-6 text-gray-300" />
              </div>
              <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[#bef264] border-2 border-[#0f291e]"></div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Admin User'}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <div className="p-4 flex-shrink-0">
          <button
            onClick={handleSignOut}
            disabled={isLoggingOut}
            className={`
              w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors hover:bg-white/5
              text-red-400 hover:text-red-300
            `}
          >
            <LogOut className="w-5 h-5 mr-3" />
            <span className="font-medium">{isLoggingOut ? 'Signing Out...' : 'Sign Out'}</span>
          </button>
        </div>
      </div>
    </>
  )
}
