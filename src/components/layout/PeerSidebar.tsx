'use client'

import { useState, useMemo } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui'
import { useQuery } from '@tanstack/react-query'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
import { ExamService } from '@/lib/services/examService'
import { LayoutDashboard, GraduationCap, ClipboardList, FileText, FileBarChart, LogOut, User } from 'lucide-react'

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

  const baseNavigation = [
    { name: 'Dashboard', href: '/peer/dashboard', Icon: LayoutDashboard },
    { name: 'Classes', href: '/peer/classes', Icon: GraduationCap },
    { name: 'Attendance', href: '/peer/attendance', Icon: ClipboardList },
    { name: 'Reports', href: '/peer/reports', Icon: FileBarChart },
  ]

  const examNavItem = { name: 'Exams', href: '/peer/exams', Icon: FileText }

  // Memoize navigation to prevent recreation on every render
  const navigation = useMemo(() => {
    return hasExamAccess ? [...baseNavigation, examNavItem] : baseNavigation
  }, [hasExamAccess])

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
        fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:flex lg:flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-center h-16 bg-blue-600 flex-shrink-0">
          <h1 className="text-2xl font-bold text-white">PEER PORTAL</h1>
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
                    w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors
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
