'use client'

import React, { useState } from 'react'
import IndividualFacultyProtectedRoute from '@/components/auth/IndividualFacultyProtectedRoute'
import FacultyPortalSidebar from '@/components/layout/FacultyPortalSidebar'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'

export default function FacultyPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isCollapsed] = useSidebarCollapsed()

  return (
    <IndividualFacultyProtectedRoute>
      <div className="min-h-screen bg-[#F8F9FA]">
        <FacultyPortalSidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
        />
        
        {/* Main Content Wrapper */}
        <div className={`transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
            {/* 
                We can add a top header here if needed, or let individual pages handle it.
                Passing sidebar toggle to children if they need it is harder with this structure 
                unless we use context. For now, let's keep it simple.
            */}
             {/* Mobile Header Toggle (if pages don't have their own header) 
                Wait, pages usually have PageHeader. Let's ensure pages can open sidebar if needed.
                Ideally, we pass `setIsSidebarOpen` down, but `children` prop makes that hard.
                We might need a Context for Sidebar State if we want the hamburger menu 
                in the PageHeader to work.
                
                For now, let's just render children.
             */}
             {children}
             
             {/* Mobile Sidebar Toggle Button Overlay (only visible on mobile if no header exists) */}
             <button 
                className="lg:hidden fixed bottom-6 right-6 z-40 bg-[#1C2434] text-white p-3 rounded-full shadow-lg"
                onClick={() => setIsSidebarOpen(true)}
             >
                <div className="sr-only">Open Menu</div>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
             </button>
        </div>
      </div>
    </IndividualFacultyProtectedRoute>
  )
}
