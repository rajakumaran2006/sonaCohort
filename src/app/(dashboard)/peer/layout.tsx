'use client'

import PeerSidebar from '@/components/layout/PeerSidebar'
import { PeerSidebarProvider, usePeerSidebar } from '@/components/layout/PeerSidebarContext'

function PeerLayoutContent({ children }: { children: React.ReactNode }) {
  const { isMobileOpen, closeMobileSidebar } = usePeerSidebar()

  return (
    <div className="min-h-screen bg-gray-50">
      <PeerSidebar isOpen={isMobileOpen} onClose={closeMobileSidebar} />
      {children}
    </div>
  )
}

export default function PeerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PeerSidebarProvider>
      <PeerLayoutContent>{children}</PeerLayoutContent>
    </PeerSidebarProvider>
  )
}
