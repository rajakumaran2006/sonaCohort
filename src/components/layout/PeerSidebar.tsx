'use client'

import Image from 'next/image'

import { useState, useMemo } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
import { ExamService } from '@/lib/services/examService'
import { LayoutGrid, GraduationCap, ClipboardList, FileText, FileBarChart, LogOut, User } from 'lucide-react'

interface PeerSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function PeerSidebar({ isOpen, onClose }: PeerSidebarProps) {
  const { signOut, user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Fetch peer tutor info with caching
  const { data: peerTutor } = useQuery({
    queryKey: ['peer-tutor-info', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await PeerTutorAuthService.getPeerTutorByEmail(user.email)
    },
    enabled: !!user?.email,
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  })

  // Check if peer tutor has access to exams (check once and cache)
  const { data: hasExamAccess } = useQuery({
    queryKey: ['peer-exam-access', peerTutor?.year],
    queryFn: async () => {
      if (!peerTutor?.year) return false
      const exams = await ExamService.getExamsByYear(peerTutor.year)
      return exams.length > 0
    },
    enabled: !!peerTutor?.year,
    staleTime: 10 * 60 * 1000, // 10 minutes - cache for a long time
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch on mount if data exists
  })

  // Memoize navigation to prevent recreation on every render
  const navigation = useMemo(() => {
    // Base navigation items (excluding Reports which we want last)
    const baseNavigation = [
        { name: 'Dashboard', href: '/peer/dashboard', Icon: LayoutGrid },
        { name: 'Classes', href: '/peer/classes', Icon: GraduationCap },
        { name: 'Attendance', href: '/peer/attendance', Icon: ClipboardList },
    ]

    const examNavItem = { name: 'Exams', href: '/peer/exams', Icon: FileText }
    const reportsNavItem = { name: 'Reports', href: '/peer/reports', Icon: FileBarChart }

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
        fixed inset-y-0 left-0 z-50 w-64 bg-[#0f291e] shadow-lg transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:flex lg:flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        {/* Logo */}
        <div className="flex items-center justify-center h-24 flex-shrink-0 px-4 pt-6 mb-6">
          <div className="relative w-full h-full">
            <Image
              src="/logo.png"
              alt="Peer Portal Logo"
              fill
              className="object-contain rounded-xl"
              priority
            />
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
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
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
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Profile Section with Sign Out */}
        <div className="border-t border-gray-800 flex-shrink-0 p-4">
          <div className="flex items-center w-full rounded-lg p-2 justify-between">
            {/* Profile Info */}
            <div className="flex items-center gap-3 flex-1 min-w-0 hover:bg-white/5 rounded-lg p-2 transition-colors">
              <div className="flex-shrink-0 relative">
                <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden ring-2 ring-[#bef264] ring-offset-2 ring-offset-[#0f291e]">
                  <User className="h-6 w-6 text-gray-300" />
                </div>
                <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[#bef264] border-2 border-[#0f291e]"></div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {peerTutor?.name || user?.user_metadata?.full_name || 'Peer Tutor'}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {user?.email}
                </p>
              </div>
            </div>
            
            {/* Sign Out Icon */}
            <button
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="flex-shrink-0 p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-red-400"
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
