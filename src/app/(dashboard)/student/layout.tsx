'use client'

import StudentSidebar from '@/components/layout/StudentSidebar'
import { StudentSidebarProvider, useStudentSidebar } from '@/components/layout/StudentSidebarContext'

function StudentLayoutContent({ children }: { children: React.ReactNode }) {
  const { isMobileOpen, closeMobileSidebar } = useStudentSidebar()

  return (
    <div className="min-h-screen bg-gray-50">
      <StudentSidebar isOpen={isMobileOpen} onClose={closeMobileSidebar} />
      {children}
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
