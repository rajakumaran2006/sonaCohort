'use client'

import StudentSidebar from '@/components/layout/StudentSidebar'
import StudentMobileNav from '@/components/layout/StudentMobileNav'
import { StudentSidebarProvider, useStudentSidebar } from '@/components/layout/StudentSidebarContext'

function StudentLayoutContent({ children }: { children: React.ReactNode }) {
  const { isMobileOpen, closeMobileSidebar } = useStudentSidebar()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <StudentSidebar isOpen={isMobileOpen} onClose={closeMobileSidebar} />
      {/* Page content — add bottom padding on mobile so content isn't hidden behind nav bar */}
      <div className="pb-20 lg:pb-0">
        {children}
      </div>
      {/* Mobile bottom navigation */}
      <StudentMobileNav />
    </div>
  )
}

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudentSidebarProvider>
      <StudentLayoutContent>{children}</StudentLayoutContent>
    </StudentSidebarProvider>
  )
}
